// PostgreSQL Native schedule inventory: metadata only, no scheduler,
// task submission, side effects, model calls or cron evaluation.
// Every query runs under a verified employee identity and SET LOCAL RLS role.
import {HttpError,isUuid,type Identity,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"

export interface ScheduleSummary {
  id:string
  name:string
  kind:"agent"|"workflow"
  agent_spec_id:string|null
  workflow_id:string|null
  time_zone:string
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
  return {...row,revision}
}
export class ScheduleInventoryRepository {
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  list(identity:Identity,limit=30):Promise<ScheduleSummary[]>{
    const count=bounded(limit)
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<ScheduleSummary>(
        "SELECT id,name,kind,agent_spec_id,workflow_id,time_zone,"+
        "next_at,enabled,revision,created_at,updated_at "+
        "FROM agentstudio.schedules WHERE owner_user_id=$1::uuid "+
        "ORDER BY updated_at DESC,id LIMIT $2::int",[actor,count])
      return result.rows.map(normalize)
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
