import {HttpError,isUuid,type SqlClient} from './contracts.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {workflowAgentSpec,type WorkflowAgentState} from './workflow-v2-agent-machine.ts'
import {originalRoleHash,checkedOriginalRolePin,originalRoleCanonical} from './original-role-execution.mjs'
import {originalRoleProfileEnabled,requireOriginalRoleProfile} from './original-role-profile.ts'
import {roleObject,type OriginalRolePin} from '../../../shared/original-role-execution-contract.mjs'
import {requireOriginalRoleUi} from './original-role-ui-policy.ts'
const scopes=new WeakMap<SqlClient,{owner:string;run_id:string;pin:OriginalRolePin}|{owner:string;spec_id:string;spec_revision:number}>()
const workerPins=new WeakMap<SqlClient,{transaction:string;owner:string;run_id:string;pin:OriginalRolePin;spec:ReturnType<typeof workflowAgentSpec>}>()
async function transaction(db:SqlClient){const r=(await db.query<{transaction_id:string}>('SELECT pg_current_xact_id()::text AS transaction_id')).rows[0];if(!r||!/^\d+$/.test(r.transaction_id))deny();return r.transaction_id}
function deny():never{throw new HttpError(409,'original_role_history_unavailable')}
export async function originalRoleHistoryOnClient(db:SqlClient,owner:string,runId:string){
 requireOriginalRoleProfile(db)
 await assertOwnedAdmissionContext(db,owner,runId)
 const cached=workerPins.get(db)
 if(cached&&cached.owner===owner&&cached.run_id===runId){if(cached.transaction!==await transaction(db))deny();return {pin:cached.pin,spec:cached.spec}}
 const rows=(await db.query<{payload:OriginalRolePin;payload_sha256:string;spec:unknown;spec_sha256:string}>(
  'SELECT p.payload,p.payload_sha256,h.spec,h.spec_sha256 FROM agentstudio_roles.original_role_run_pins p JOIN agentstudio_roles.original_role_specs h ON h.owner_user_id=p.owner_user_id AND h.spec_id=p.spec_id AND h.spec_revision=p.spec_revision WHERE p.owner_user_id=$1::uuid AND p.run_id=$2::uuid FOR SHARE OF p,h',[owner,runId])).rows
 if(rows.length!==1)deny()
 const r=rows[0]!;if(r.payload.planning_mode||r.payload.capability_bindings)requireOriginalRoleUi(db)
 const spec=workflowAgentSpec(r.spec,r.payload.planning_mode==='reviewed_v1'),pin=checkedOriginalRolePin(r.payload,spec,{owner_user_id:owner,run_id:runId,spec_id:r.payload.spec_id,spec_revision:r.payload.spec_revision})
 if(originalRoleHash(pin)!==r.payload_sha256||originalRoleHash(spec)!==r.spec_sha256)deny()
 return {pin,spec}
}
export async function withOriginalRoleHistory<T>(db:SqlClient,owner:string,runId:string,hash:string,body:()=>Promise<T>){
 const old=scopes.get(db),{pin}=await originalRoleHistoryOnClient(db,owner,runId)
 if(originalRoleHash(pin)!==hash)deny()
 scopes.set(db,{owner,run_id:runId,pin})
 try{return await body()}finally{if(old)scopes.set(db,old);else scopes.delete(db)}
}
export function roleHistoricalSpec(db:SqlClient,owner:string,id:string,revision:number){
 const s=scopes.get(db)
 if(s&&'pin'in s&&s.owner===owner&&s.pin.spec_id===id&&s.pin.spec_revision===revision)return workflowAgentSpec(s.pin.base_spec,s.pin.planning_mode==='reviewed_v1')
 return undefined
}
export async function withOriginalRoleAdmission<T>(db:SqlClient,owner:string,id:string,revision:number,body:()=>Promise<T>){
 requireOriginalRoleProfile(db)
 const prior=scopes.get(db);scopes.set(db,{owner,spec_id:id,spec_revision:revision})
 try{return await body()}finally{if(prior)scopes.set(db,prior);else scopes.delete(db)}
}
export async function assertOriginalRoleLauncher(db:SqlClient,owner:string,id:string,revision:number){
 if(!originalRoleProfileEnabled(db))return
 const rows=(await db.query('SELECT 1 FROM agentstudio_roles.original_role_extensions WHERE owner_user_id=$1::uuid AND spec_id=$2::uuid',[owner,id])).rows
 if(!rows.length)return
 const s=scopes.get(db)
 if(!s||s.owner!==owner||('pin'in s?s.pin.spec_id!==id||s.pin.spec_revision!==revision:s.spec_id!==id||s.spec_revision!==revision))throw new HttpError(409,'original_role_launcher_not_supported')
}
export type OriginalRoleRunRef={profile:'original-roles-v2';run_id:string;payload_sha256:string}
export function originalRoleRunRef(raw:unknown):OriginalRoleRunRef{
 const r=roleObject(raw,['profile','run_id','payload_sha256']) as unknown as OriginalRoleRunRef
 if(r.profile!=='original-roles-v2'||!isUuid(r.run_id)||! /^[a-f0-9]{64}$/.test(r.payload_sha256))deny()
 return {...r}
}
export async function verifyOriginalRoleState(db:SqlClient,owner:string,runId:string,ref:OriginalRoleRunRef|undefined,state:WorkflowAgentState|undefined){
 if(!ref){
  if(state?.role_pin)deny()
  if(originalRoleProfileEnabled(db)&&(await db.query('SELECT 1 FROM agentstudio_roles.original_role_run_pins WHERE owner_user_id=$1::uuid AND run_id=$2::uuid',[owner,runId])).rows.length)deny()
  return
 }
 if(ref.run_id!==runId)deny()
 const {pin}=await originalRoleHistoryOnClient(db,owner,runId)
 if(originalRoleHash(pin)!==ref.payload_sha256||state&&originalRoleCanonical(state.role_pin)!==originalRoleCanonical(pin))deny()
 return pin
}
export async function loadOriginalRoleWorkerPin(db:SqlClient,job:{id:string;run_id:string;owner_user_id:string;lease_token:string;lease_version:string|number;lease_owner:string;payload?:{phase:string}},ref:OriginalRoleRunRef|undefined){
 workerPins.delete(db)
 if(!ref&&(!originalRoleProfileEnabled(db)||job.payload?.phase!=='agent_native_v2'))return undefined
 requireOriginalRoleProfile(db)
 await db.query('SET LOCAL ROLE agentstudio_worker')
 try{
  const rows=(await db.query<{value:{payload:OriginalRolePin;payload_sha256:string;spec:unknown;spec_sha256:string}|null}>('SELECT agentstudio_roles.worker_pin($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text) AS value',[job.run_id,job.id,job.lease_token,job.lease_version,job.lease_owner])).rows
  const r=rows.length===1?rows[0]!.value:null
  if(!r&&!ref)return undefined
  if(!r||!ref||ref.run_id!==job.run_id||r.payload_sha256!==ref.payload_sha256)deny()
  if(r.payload.planning_mode||r.payload.capability_bindings)requireOriginalRoleUi(db)
  const spec=workflowAgentSpec(r.spec,r.payload.planning_mode==='reviewed_v1'),pin=checkedOriginalRolePin(r.payload,spec,{owner_user_id:job.owner_user_id,run_id:job.run_id,spec_id:r.payload.spec_id,spec_revision:r.payload.spec_revision})
  if(originalRoleHash(pin)!==ref.payload_sha256||originalRoleHash(spec)!==r.spec_sha256)deny()
  workerPins.set(db,{transaction:await transaction(db),owner:job.owner_user_id,run_id:job.run_id,pin,spec})
  return pin
 }finally{await db.query('SET LOCAL ROLE agentstudio_api')}
}
