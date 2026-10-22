// PostgreSQL Native schedule inventory: metadata only, no scheduler,
// task submission, side effects, model calls or cron evaluation.
// Every query runs under a verified employee identity and SET LOCAL RLS role.
import {HttpError,isUuid,type Identity,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {safeScheduleDraftInput} from "./schedule-draft-repository.ts"

export interface ScheduleSummary {
  id:string
  name:string
  kind:"agent"|"workflow"
  agent_spec_id:string|null
  workflow_id:string|null
  time_zone:string
  recurrence?:Record<string,unknown>
  next_at:string|null
  enabled:boolean
  revision:number
  created_at:string
  updated_at:string
}
export interface ScheduleOccurrence {
  id:string
  schedule_id:string
  scheduled_for:string
  status:"pending"|"started"|"succeeded"|"failed"|"skipped"
  run_id:string|null
  created_at:string
}
function bounded(limit:number):number{
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)
    throw new HttpError(400,"invalid_schedule_limit")
  return limit
}
function normalize(row:ScheduleSummary):ScheduleSummary{
  const revision=Number(row.revision)
  if(!Number.isSafeInteger(revision)||revision<1)
    throw Error("invalid_schedule_revision")
  // Imported schedule recurrences may have old private text or provider
  // credentials: never pass arbitrary JSONB through the HTTP inventory.
  // Only syntactically validated, inert, owner-configuration rule fields are
  // projected. All other stored recurrence blobs are intentionally omitted.
  const {recurrence:stored,...publicFields}=row
  let publicRule:Record<string,unknown>|undefined
  if(stored?.config_format==="pg_schedule_draft_v1"&&
     stored.execution_supported===false&&
     row.enabled===false&&row.next_at===null){
    try{
      const target=row.kind==="agent"?row.agent_spec_id:row.workflow_id
      const checked=safeScheduleDraftInput({
        name:row.name,kind:row.kind,target_id:target,
        time_zone:row.time_zone,rule:stored.rule
      })
      publicRule={config_format:"pg_schedule_draft_v1",
        execution_supported:false,rule:checked.rule}
    }catch{ /* Never send malformed or unreviewed stored JSON. */ }
  }
  return {...publicFields,revision,
    ...(publicRule?{recurrence:publicRule}:{})}
}
export class ScheduleInventoryRepository {
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  list(identity:Identity,limit=30):Promise<ScheduleSummary[]>{
    const count=bounded(limit)
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<ScheduleSummary>(
        "SELECT id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,"+
        "next_at,enabled,revision,created_at,updated_at "+
        "FROM agentstudio.schedules WHERE owner_user_id=$1::uuid "+
        "ORDER BY updated_at DESC,id LIMIT $2::int",[actor,count])
      return result.rows.map(normalize)
    })
  }
  get(identity:Identity,id:string):Promise<ScheduleSummary|null>{
    if(!isUuid(id))throw new HttpError(400,"invalid_schedule_id")
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<ScheduleSummary>(
        "SELECT id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,"+
        "next_at,enabled,revision,created_at,updated_at "+
        "FROM agentstudio.schedules WHERE id=$1::uuid AND owner_user_id=$2::uuid",
        [id,actor])
      return result.rows[0]?normalize(result.rows[0]):null
    })
  }
  occurrences(identity:Identity,id:string,limit=30):
    Promise<ScheduleOccurrence[]|null>{
    if(!isUuid(id))throw new HttpError(400,"invalid_schedule_id")
    const count=bounded(limit)
    return withActor(this.pool,identity,async(db,actor)=>{
      const existing=await db.query<{id:string}>(
        "SELECT id FROM agentstudio.schedules "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid",
        [id,actor])
      if(!existing.rows.length)return null
      const result=await db.query<ScheduleOccurrence>(
        "SELECT id,schedule_id,scheduled_for,status,run_id,created_at "+
        "FROM agentstudio.schedule_occurrences "+
        "WHERE schedule_id=$1::uuid AND owner_user_id=$2::uuid "+
        "ORDER BY scheduled_for DESC,id LIMIT $3::int",[id,actor,count])
      return result.rows
    })
  }
}
