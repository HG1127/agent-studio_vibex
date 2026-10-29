import {HttpError,type Identity,type SqlClient,type SqlPool} from './contracts.ts'
import {withActorClient,assertOwnedAdmissionContext} from './repository.ts'
import {localObject,localId,localDigest,parseLocalIntent,parseLocalDevice,parseLocalJob,parseLocalReply,matchLocalReply,type LocalIntent} from '../../../shared/native-local-device-contract.mjs'
import {verifyNativeLocalDeviceOriginal,verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {validateNativeLocalArguments} from './native-local-device-validation.ts'
export class LocalDeviceAcknowledgementUnknown extends HttpError {readonly request_id:string|null;constructor(id:string|null){super(503,'native_local_acknowledgement_unknown');this.request_id=id}}
export function translateLocalError(e:unknown):never{
 if(e instanceof HttpError)throw e
 const x=e as {code?:string;message?:string},code=x?.message??''
 if(x?.code==='P0001'){
  if(['native_local_job_not_found','native_local_receipt_not_found'].includes(code))throw new HttpError(404,code)
  if(/^(native_local_(?:token|pair|claim)_denied|agent_design_native_owner_required)$/.test(code))throw new HttpError(403,'native_local_device_denied')
  if(/^native_local_(?:request_conflict|device_unavailable|tool_unavailable|catalog_changed|device_offline|completion_denied|lease_denied|approval_denied|run_denied)$/.test(code))throw new HttpError(409,code)
  if(code==='native_local_device_limit')throw new HttpError(429,code)
 }
 throw new HttpError(503,'native_local_unavailable')
}
export async function localValue(db:SqlClient,query:string,args:unknown[]=[]){const rows=(await db.query<{value:unknown}>(query,args)).rows;if(rows.length!==1)throw Error('native_local_invalid_projection');return rows[0]!.value}
export class NativeLocalDeviceRepository {
 readonly pool:SqlPool;readonly writes:boolean
 constructor(pool:SqlPool,{allowWrites=false}:{allowWrites?:boolean}={}){this.pool=pool;this.writes=allowWrites===true}
 async actor<T>(identity:Identity,rid:string|null,body:(db:SqlClient,owner:string)=>Promise<T>):Promise<T>{
  if(identity.issuer!=='urn:agentstudio:local:v1'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
  const db=await this.pool.connect();let begun=false,committing=false
  try{
   await db.query('BEGIN');begun=true;await verifyNativeLocalDeviceOriginal(db,'agentstudio_api')
   const result=await withActorClient(db,this.pool,identity,async(c,owner)=>{await assertOwnedAdmissionContext(c,owner);await verifyNativeLocalDeviceSchema(c);const {verifyAgentInternalShareCredentials}=await import('./agent-internal-share-audit.ts');await verifyAgentInternalShareCredentials(c);return body(c,owner)})
   committing=true;await db.query('COMMIT');begun=false;return result
  }catch(e){if(begun)await db.query('ROLLBACK').catch(()=>{});if(committing)throw new LocalDeviceAcknowledgementUnknown(rid);return translateLocalError(e)}finally{db.release()}
 }
 list(identity:Identity){return this.actor(identity,null,async db=>{const v=await localValue(db,'SELECT agentstudio.native_local_list() AS value');if(!Array.isArray(v)||v.length>100)throw Error('native_local_invalid_projection');const result=v.map(parseLocalDevice);if(new Set(result.map(x=>x.id)).size!==result.length)throw Error('native_local_invalid_projection');for(const d of result)if(d.catalog_sha256!==await localDigest(d.catalog))throw Error('native_local_invalid_projection');return result})}
 get(identity:Identity,id:unknown){return this.actor(identity,null,async db=>parseLocalJob(await localValue(db,'SELECT agentstudio.native_local_get($1::uuid) AS value',[localId(id)])))}
 private async prior(db:SqlClient,intent:LocalIntent){const raw=await localValue(db,'SELECT agentstudio.native_local_receipt($1::uuid) AS value',[intent.request_id]);if(raw===null)return null;try{return await matchLocalReply({receipt:raw,pairing_code:null,replayed:true},intent)}catch{throw new HttpError(409,'native_local_request_conflict')}}
 record(identity:Identity,raw:unknown){const intent=parseLocalIntent(raw);return this.actor(identity,intent.request_id,async db=>{
  const prior=await this.prior(db,intent);if(prior)return prior
  if(!this.writes)throw new HttpError(403,'native_local_writes_disabled')
  if(intent.action==='enqueue')await validateNativeLocalArguments(db,intent.id,intent.input)
  const value=await matchLocalReply(await localValue(db,'SELECT agentstudio.native_local_record($1::jsonb) AS value',[JSON.stringify(intent)]),intent)
  const receipt=await this.prior(db,intent);if(!receipt||JSON.stringify(receipt.receipt)!==JSON.stringify(value.receipt))throw Error('native_local_invalid_projection');return value
 })}
 confirm(identity:Identity,raw:unknown){const intent=parseLocalIntent(raw);return this.actor(identity,intent.request_id,async db=>{const prior=await this.prior(db,intent);if(!prior)throw new HttpError(404,'native_local_receipt_not_found');return parseLocalReply(prior)})}
}
export class NativeLocalExecutorRepository {
 readonly pool:SqlPool
 constructor(pool:SqlPool){this.pool=pool}
 async call(operation:'pair'|'pair-confirm'|'poll'|'check'|'complete'|'confirm',token:string|null,raw:unknown){
  const db=await this.pool.connect();let begun=false,committing=false;const rid=raw&&typeof raw==='object'&&Object.hasOwn(raw,'request_id')?String((raw as Record<string,unknown>).request_id):null
  try{
   await db.query('BEGIN');begun=true;await verifyNativeLocalDeviceOriginal(db,'agentstudio_local_executor');await db.query('SET LOCAL ROLE agentstudio_local_executor');await verifyNativeLocalDeviceSchema(db)
   let value:unknown
   if(operation==='pair'||operation==='pair-confirm')value=await localValue(db,'SELECT agentstudio.native_local_pair($1::jsonb,$2::boolean) AS value',[JSON.stringify(raw),operation==='pair-confirm'])
   else if(operation==='poll'){const v=localObject(raw,['catalog','claim']);value=await localValue(db,'SELECT agentstudio.native_local_poll($1::text,$2::jsonb,$3::text) AS value',[token,JSON.stringify(v.catalog),v.claim])}
   else if(operation==='check'){const v=localObject(raw,['id','claim']);value=await localValue(db,'SELECT agentstudio.native_local_check($1::text,$2::uuid,$3::text) AS value',[token,v.id,v.claim])}
   else value=await localValue(db,'SELECT agentstudio.native_local_complete($1::text,$2::jsonb,$3::boolean) AS value',[token,JSON.stringify(raw),operation==='confirm'])
   committing=true;await db.query('COMMIT');begun=false;return value
  }catch(e){if(begun)await db.query('ROLLBACK').catch(()=>{});if(committing)throw new LocalDeviceAcknowledgementUnknown(rid);return translateLocalError(e)}finally{db.release()}
 }
}
