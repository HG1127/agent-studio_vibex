import {createHash} from 'node:crypto'
import {HttpError,isUuid,safeAgentSpec,safeName,type AgentSpecInput,type Identity,type SqlClient,type SqlPool} from './contracts.ts'
import {safeNativeLocalAgentSpec} from './native-local-agent-contract.ts'
import {withActor,verifyAgentSpecResources,type SpecRow} from './repository.ts'
import {parseOriginalHomeAuthoring,type OriginalHomeAuthoring} from '../../../shared/original-home-authoring.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'

export type OriginalHomeAgentRow=SpecRow&{authoring:OriginalHomeAuthoring|null}
export type OriginalHomeAgentWrite={name:string;spec:unknown;authoring?:unknown}
type StoredRow=Omit<SpecRow,'revision'>&{revision:number|string;authoring:unknown}
const fields='s.id,s.owner_user_id,s.name,s.spec,s.revision,s.created_at,s.updated_at,a.authoring'
const join=' FROM agentstudio.agent_specs s LEFT JOIN agentstudio.agent_spec_authoring a ON a.agent_spec_id=s.id AND a.owner_user_id=s.owner_user_id '
function native(identity:Identity):void{
 if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
}
function revision(value:unknown):number{
 if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>=Number.MAX_SAFE_INTEGER)throw new HttpError(400,'invalid_revision')
 return Number(value)
}
function row(value:StoredRow):OriginalHomeAgentRow{
 const parsed=Number(value.revision)
 if(!isUuid(value.id)||!isUuid(value.owner_user_id)||!Number.isSafeInteger(parsed)||parsed<1||parsed>Number.MAX_SAFE_INTEGER||value.spec?.require_approval!==true)throw new HttpError(503,'original_home_row_unavailable')
 let authoring:OriginalHomeAuthoring|null
 try{authoring=value.authoring===null?null:parseOriginalHomeAuthoring(value.authoring)}catch{throw new HttpError(503,'original_home_authoring_unavailable')}
 return{id:value.id,owner_user_id:value.owner_user_id,name:value.name,spec:value.spec,revision:parsed,created_at:value.created_at,updated_at:value.updated_at,authoring}
}
async function hidden(db:SqlClient):Promise<string[]>{
 const installed=(await db.query<{ok:boolean}>("SELECT to_regprocedure('agentstudio.agent_caller_internal_sources()') IS NOT NULL AS ok")).rows[0]?.ok
 if(installed!==true&&installed!==false)throw new HttpError(503,'original_home_source_unavailable')
  if(!installed)throw new HttpError(503,'original_home_source_unavailable')
 const ids=(await db.query<{ids:string[]}>('SELECT agentstudio.agent_caller_internal_sources() AS ids')).rows[0]?.ids
 if(!Array.isArray(ids)||ids.some(id=>!isUuid(id)))throw new HttpError(503,'original_home_source_unavailable')
 return ids
}
async function load(db:SqlClient,owner:string,id:string):Promise<OriginalHomeAgentRow>{
 const value=(await db.query<StoredRow>('SELECT '+fields+join+'WHERE s.id=$1::uuid AND s.owner_user_id=$2::uuid',[id,owner])).rows[0]
 if(!value)throw new HttpError(404,'spec_not_found')
 return row(value)
}
function metadata(raw:unknown):OriginalHomeAuthoring{
 try{return parseOriginalHomeAuthoring(raw)}catch{throw new HttpError(400,'invalid_original_home_authoring')}
}
async function saveAuthoring(db:SqlClient,owner:string,id:string,authoring:OriginalHomeAuthoring):Promise<void>{
 await db.query('INSERT INTO agentstudio.agent_spec_authoring(agent_spec_id,owner_user_id,authoring) VALUES($1::uuid,$2::uuid,$3::jsonb) '+
  'ON CONFLICT(agent_spec_id) DO UPDATE SET authoring=EXCLUDED.authoring,updated_at=clock_timestamp() '+
  'WHERE agentstudio.agent_spec_authoring.owner_user_id=EXCLUDED.owner_user_id',[id,owner,JSON.stringify(authoring)])
}
async function audit(db:SqlClient,owner:string,id:string,operation:'create'|'update',saved:OriginalHomeAgentRow):Promise<void>{
 const data={format:'agentstudio.home-authoring.v1',spec_revision:saved.revision,authoring_sha256:saved.authoring===null?null:createHash('sha256').update(JSON.stringify(saved.authoring)).digest('hex'),tool_requirement_count:saved.authoring?.tool_requirements.length??0}
 await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES($1::uuid,$1::uuid,$2::text,'agent_spec',$3::text,'succeeded',$4::jsonb)",
  [owner,'agent.original_home.'+operation,id,JSON.stringify(data)])
}

/** Optional070 Native-only facade. The stored execution spec stays frozen. */
export class NativeHomeAgentSpecsRepository{
 readonly pool:SqlPool
 readonly allowNativeLocalAgentSpecs:boolean
 constructor(pool:SqlPool,options:{allowNativeLocalAgentSpecs?:boolean}={}){this.pool=pool;this.allowNativeLocalAgentSpecs=options.allowNativeLocalAgentSpecs===true}
 private execution(raw:unknown):AgentSpecInput{return this.allowNativeLocalAgentSpecs?safeNativeLocalAgentSpec(raw,true):safeAgentSpec(raw)}
 list(identity:Identity,limit=50):Promise<OriginalHomeAgentRow[]>{
  native(identity)
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new HttpError(400,'invalid_limit')
  return withActor(this.pool,identity,async(db,owner)=>{
   const excluded=await hidden(db)
   return(await db.query<StoredRow>('SELECT '+fields+join+'WHERE s.owner_user_id=$1::uuid AND NOT(s.id=ANY($3::uuid[])) ORDER BY s.updated_at DESC,s.id LIMIT $2::int',[owner,limit,excluded])).rows.map(row)
  })
 }
 get(identity:Identity,id:string):Promise<OriginalHomeAgentRow>{
  native(identity);if(!isUuid(id))throw new HttpError(400,'invalid_spec_id')
  return withActor(this.pool,identity,async(db,owner)=>{if((await hidden(db)).includes(id.toLowerCase()))throw new HttpError(404,'spec_not_found');return load(db,owner,id)})
 }
 create(identity:Identity,input:OriginalHomeAgentWrite,expectedEmployee?:string):Promise<OriginalHomeAgentRow>{
  native(identity)
  const name=safeName(input.name),spec=this.execution(input.spec),authoring=metadata(input.authoring)
  return withActor(this.pool,identity,async(db,owner)=>{
   assertOriginalUiEmployee(owner,expectedEmployee)
   await verifyAgentSpecResources(db,owner,spec)
   const created=(await db.query<{id:string}>('INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec,requires_approval) VALUES($1::uuid,$2::text,$3::jsonb,true) RETURNING id',[owner,name,JSON.stringify(spec)])).rows[0]
   if(!created||!isUuid(created.id))throw new HttpError(503,'original_home_save_unconfirmed')
   await saveAuthoring(db,owner,created.id,authoring)
   const saved=await load(db,owner,created.id)
   if(JSON.stringify(saved.authoring)!==JSON.stringify(authoring))throw new HttpError(503,'original_home_save_unconfirmed')
   await audit(db,owner,created.id,'create',saved)
   return saved
  })
 }
 update(identity:Identity,id:string,expectedRevision:number,input:OriginalHomeAgentWrite,expectedEmployee?:string):Promise<OriginalHomeAgentRow>{
  native(identity);if(!isUuid(id))throw new HttpError(400,'invalid_spec_id')
  const expected=revision(expectedRevision),name=safeName(input.name),spec=this.execution(input.spec)
  const authoring=Object.hasOwn(input,'authoring')?metadata(input.authoring):undefined
  return withActor(this.pool,identity,async(db,owner)=>{
   assertOriginalUiEmployee(owner,expectedEmployee)
   if((await hidden(db)).includes(id.toLowerCase()))throw new HttpError(404,'spec_not_found')
   const current=(await db.query<{revision:number|string}>('SELECT revision FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE',[id,owner])).rows[0]
   if(!current)throw new HttpError(404,'spec_not_found')
   if(Number(current.revision)!==expected)throw new HttpError(409,'revision_conflict')
   await verifyAgentSpecResources(db,owner,spec)
   const changed=(await db.query<{id:string}>('UPDATE agentstudio.agent_specs SET name=$3::text,spec=$4::jsonb,requires_approval=true,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$5::bigint RETURNING id',[id,owner,name,JSON.stringify(spec),expected])).rows[0]
   if(!changed)throw new HttpError(409,'revision_conflict')
   if(authoring!==undefined)await saveAuthoring(db,owner,id,authoring)
   const saved=await load(db,owner,id)
   if(saved.revision!==expected+1||authoring!==undefined&&JSON.stringify(saved.authoring)!==JSON.stringify(authoring))throw new HttpError(503,'original_home_save_unconfirmed')
   await audit(db,owner,id,'update',saved)
   return saved
  })
 }
}
