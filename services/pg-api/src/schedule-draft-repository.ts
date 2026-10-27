// Strictly inert PostgreSQL schedule drafts. NO scheduler, task submission,
// tool call, or model execution is registered by this module.
import {HttpError,isUuid,type Identity,type SqlPool,type SqlClient} from "./contracts.ts"
import {withActor} from "./repository.ts"

export type ScheduleDraftRule=
  |{kind:"once";start_date:string;local_time:string}
  |{kind:"daily";local_time:string}
  |{kind:"weekly";local_time:string;weekday:number}
  |{kind:"interval";interval_minutes:number}
export type ScheduleDraftInput={
  name:string;kind:"agent"|"workflow";target_id:string
  time_zone:string;rule:ScheduleDraftRule
}
export type ScheduleDraftRow={
  id:string;owner_user_id:string;name:string;kind:"agent"|"workflow"
  agent_spec_id:string|null;workflow_id:string|null;time_zone:string
  recurrence:Record<string,unknown>;next_at:string|null;enabled:boolean
  revision:number;created_at:string;updated_at:string
}
const format="pg_schedule_draft_v1"
const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/
const date=/^\d{4}-\d\d-\d\d$/
const keys=(value:Record<string,unknown>,allowed:string[])=>
  Object.keys(value).length===allowed.length&&
  allowed.every(x=>Object.hasOwn(value,x))
function invalid():never{throw new HttpError(400,"invalid_schedule_draft")}
export function safeScheduleDraftInput(raw:unknown):ScheduleDraftInput{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const v=raw as Record<string,unknown>
  if(!keys(v,["name","kind","target_id","time_zone","rule"])||
     typeof v.name!=="string"||!v.name.trim()||v.name.trim().length>120||
     /[\u0000-\u001f\u007f]/u.test(v.name)||
     (v.kind!=="agent"&&v.kind!=="workflow")||!isUuid(v.target_id)||
     typeof v.time_zone!=="string"||v.time_zone.length>80||
     !/^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+){0,3}$/.test(v.time_zone)||
     !v.rule||typeof v.rule!=="object"||Array.isArray(v.rule))
    invalid()
  try{new Intl.DateTimeFormat("en",{timeZone:v.time_zone}).format(0)}
  catch{invalid()}
  const rule=v.rule as Record<string,unknown>
  if(rule.kind==="once"){
    if(!keys(rule,["kind","start_date","local_time"])||
       typeof rule.start_date!=="string"||!date.test(rule.start_date)||
       !Number.isFinite(Date.parse(rule.start_date+"T00:00:00Z"))||
       new Date(rule.start_date+"T00:00:00Z").toISOString().slice(0,10)!==rule.start_date||
       typeof rule.local_time!=="string"||!time.test(rule.local_time))
      invalid()
  }else if(rule.kind==="daily"){
    if(!keys(rule,["kind","local_time"])||
       typeof rule.local_time!=="string"||!time.test(rule.local_time))
      invalid()
  }else if(rule.kind==="weekly"){
    if(!keys(rule,["kind","local_time","weekday"])||
       typeof rule.local_time!=="string"||!time.test(rule.local_time)||
       !Number.isInteger(rule.weekday)||(rule.weekday as number)<0||
       (rule.weekday as number)>6)invalid()
  }else if(rule.kind==="interval"){
    if(!keys(rule,["kind","interval_minutes"])||
       !Number.isSafeInteger(rule.interval_minutes)||
       (rule.interval_minutes as number)<15||
       (rule.interval_minutes as number)>10080)invalid()
  }else invalid()
  return {name:v.name.trim(),kind:v.kind as "agent"|"workflow",
    target_id:v.target_id as string,time_zone:v.time_zone as string,
    rule:structuredClone(rule) as ScheduleDraftRule}
}
function savedRow(row:ScheduleDraftRow):ScheduleDraftRow{
  const revision=Number(row.revision)
  if(!Number.isSafeInteger(revision)||revision<1)
    throw new HttpError(500,"invalid_schedule_draft_revision")
  return {...row,revision}
}
const columns="id,owner_user_id,name,kind,agent_spec_id,workflow_id,"+
  "time_zone,recurrence,next_at,enabled,revision,created_at,updated_at"
async function ownedTarget(db:SqlClient,owner:string,input:ScheduleDraftInput){
  const table=input.kind==="agent"?"agent_specs":"workflows"
  const result=await db.query<{id:string}>(
    "SELECT id FROM agentstudio."+table+
    " WHERE id=$1::uuid AND owner_user_id=$2::uuid",
    [input.target_id,owner])
  if(!result.rows.length)throw new HttpError(404,"schedule_target_not_found")
}
const recurrence=(rule:ScheduleDraftRule)=>JSON.stringify({
  config_format:format,execution_supported:false,rule
})
export class ScheduleDraftRepository{
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  async create(identity:Identity,raw:unknown):Promise<ScheduleDraftRow>{
    const input=safeScheduleDraftInput(raw)
    return withActor(this.pool,identity,async(db,actor)=>{
      await ownedTarget(db,actor,input)
      const result=await db.query<ScheduleDraftRow>(
        "INSERT INTO agentstudio.schedules "+
        "(owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,"+
        "next_at,enabled) VALUES "+
        "($1::uuid,$2::text,$3::text,$4::uuid,$5::uuid,$6::text,$7::jsonb,"+
        "NULL,false) RETURNING "+columns,
        [actor,input.name,input.kind,
          input.kind==="agent"?input.target_id:null,
          input.kind==="workflow"?input.target_id:null,
          input.time_zone,recurrence(input.rule)])
      const item=result.rows[0]
      if(!item)throw Error("schedule_draft_insert_missing")
      await db.query(
        "INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,"+
        "action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,'schedule.draft_create','schedule',"+
        "$2::text,'succeeded',$3::jsonb)",
        [actor,item.id,JSON.stringify({kind:input.kind,execution_enabled:false})])
      return savedRow(item)
    })
  }
  async update(identity:Identity,id:string,raw:unknown,
    expectedRevision:number):Promise<ScheduleDraftRow|null>{
    if(!isUuid(id)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      invalid()
    const input=safeScheduleDraftInput(raw)
    return withActor(this.pool,identity,async(db,actor)=>{
      await ownedTarget(db,actor,input)
      const result=await db.query<ScheduleDraftRow>(
        "UPDATE agentstudio.schedules s SET name=$3::text,kind=$4::text,"+
        "agent_spec_id=$5::uuid,workflow_id=$6::uuid,time_zone=$7::text,"+
        "recurrence=$8::jsonb,enabled=false,next_at=NULL,"+
        "revision=revision+1,updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND revision=$9::bigint AND enabled=false AND next_at IS NULL "+
        "AND to_jsonb(s)->>'deleted_at' IS NULL "+
        "AND recurrence->>'config_format'=$10::text RETURNING "+columns,
        [id,actor,input.name,input.kind,
          input.kind==="agent"?input.target_id:null,
          input.kind==="workflow"?input.target_id:null,input.time_zone,
          recurrence(input.rule),expectedRevision,format])
      const item=result.rows[0]
      if(!item)return null
      await db.query(
        "INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,"+
        "action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,'schedule.draft_update','schedule',"+
        "$2::text,'succeeded',$3::jsonb)",
        [actor,id,JSON.stringify({revision:expectedRevision+1,
          execution_enabled:false})])
      return savedRow(item)
    })
  }
  async delete(identity:Identity,id:string,expectedRevision:number):
    Promise<boolean>{
    if(!isUuid(id)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      invalid()
    return withActor(this.pool,identity,async(db,actor)=>{
      const native=(await db.query<{installed:boolean}>("SELECT to_regprocedure('agentstudio.schedule_control(uuid,bigint,text)') IS NOT NULL AS installed")).rows[0]?.installed===true
      if(native){
        const own=(await db.query<{id:string}>("SELECT id FROM agentstudio.schedules s WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$3::bigint "+
          "AND enabled=false AND next_at IS NULL AND recurrence->>'config_format'=$4::text AND to_jsonb(s)->>'deleted_at' IS NULL FOR UPDATE",[id,actor,expectedRevision,format])).rows[0]
        if(!own)return false
        return (await db.query<{ok:boolean}>("SELECT agentstudio.schedule_control($1::uuid,$2::bigint,'delete') AS ok",[id,expectedRevision])).rows[0]?.ok===true
      }
      const result=await db.query<{id:string}>(
        "DELETE FROM agentstudio.schedules WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND revision=$3::bigint "+
        "AND enabled=false AND next_at IS NULL "+
        "AND recurrence->>'config_format'=$4::text "+
        "AND NOT EXISTS(SELECT 1 FROM agentstudio.schedule_occurrences o "+
        "WHERE o.schedule_id=$1::uuid AND o.owner_user_id=$2::uuid) "+
        "RETURNING id",[id,actor,expectedRevision,format])
      if(!result.rows[0])return false
      await db.query(
        "INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,"+
        "action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,'schedule.draft_delete','schedule',"+
        "$2::text,'succeeded','{}'::jsonb)",[actor,id])
      return true
    })
  }
}
