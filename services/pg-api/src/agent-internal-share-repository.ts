import {HttpError,type Identity,type SqlClient,type SqlPool} from './contracts.ts'
import {withActorClient,assertOwnedAdmissionContext} from './repository.ts'
import {requireInternalShareNative} from './agent-internal-share-runtime-policy.ts'
import {internalShareId,parseInternalShareIntent,parseInternalShareList,parseInternalSharePreview,parseInternalShareRecovery,parseInternalShareReply,matchInternalShareReceipt,type InternalShareIntent} from '../../../shared/agent-internal-share-contract.ts'
export class InternalShareAcknowledgementUnknown extends HttpError{readonly request_id:string|null;constructor(id:string|null){super(503,'agent_internal_share_acknowledgement_unknown');this.request_id=id}}
function translated(error:unknown):never{
 if(error instanceof HttpError)throw error
 const e=error as {code?:string;message?:string};if(e?.code==='P0001'){
  if(['agent_internal_share_member_required','agent_design_native_owner_required'].includes(e.message??''))throw new HttpError(403,'agent_internal_share_member_required')
  if(['agent_internal_share_code_unavailable','agent_internal_share_invite_not_found','agent_template_market_source_unavailable'].includes(e.message??''))throw new HttpError(404,e.message==='agent_template_market_source_unavailable'?'agent_internal_share_source_unavailable':e.message!)
  if(e.message==='agent_internal_share_invite_limit')throw new HttpError(429,e.message)
  if(['agent_internal_share_review_required','agent_internal_share_request_conflict','agent_template_market_source_resource_changed'].includes(e.message??''))throw new HttpError(409,e.message==='agent_template_market_source_resource_changed'?'agent_internal_share_review_required':e.message!)
  if(e.message?.startsWith('agent_internal_share_invalid_')||e.message==='agent_template_market_invalid_source')throw new HttpError(400,'invalid_internal_share_value')
 }
 throw new HttpError(503,'agent_internal_share_unavailable')
}
export class AgentInternalShareRepository{
 readonly pool:SqlPool;readonly writes:boolean
 constructor(pool:SqlPool,{allowWrites=false}:{allowWrites?:boolean}={}){this.pool=pool;this.writes=allowWrites===true}
 private async actor<T>(identity:Identity,requestId:string|null,body:(db:SqlClient)=>Promise<T>,expectedEmployee?:string):Promise<T>{
  requireInternalShareNative(identity);const db=await this.pool.connect();let begun=false,committing=false
  try{await db.query('BEGIN');begun=true;const value=await withActorClient(db,this.pool,identity,async(client,owner)=>{await assertOwnedAdmissionContext(client,owner);if(expectedEmployee!==undefined&&owner!==expectedEmployee)throw new HttpError(409,'agent_internal_share_employee_changed');const {verifyAgentInternalShareCredentials}=await import('./agent-internal-share-audit.ts');if(await verifyAgentInternalShareCredentials(client)!==true)throw new HttpError(503,'agent_internal_share_schema_required');return body(client)});committing=true;await db.query('COMMIT');begun=false;return value}
  catch(e){if(begun)await db.query('ROLLBACK').catch(()=>{});if(committing)throw new InternalShareAcknowledgementUnknown(requestId);return translated(e)}finally{db.release()}
 }
 private async value(db:SqlClient,query:string,args:unknown[]=[]){const rows=(await db.query<{value:unknown}>(query,args)).rows;if(rows.length!==1)throw Error('agent_internal_share_invalid_projection');return rows[0]!.value}
 list(identity:Identity){return this.actor(identity,null,async db=>parseInternalShareList(await this.value(db,'SELECT agentstudio.agent_internal_share_list() AS value')))}
 preview(identity:Identity,raw:unknown){const id=internalShareId(raw);return this.actor(identity,null,async db=>{const value=await parseInternalSharePreview(await this.value(db,'SELECT agentstudio.agent_internal_share_preview($1::uuid) AS value',[id]));if(value.source.spec_id!==id)throw Error('agent_internal_share_invalid_projection');return value})}
 private async receipt(db:SqlClient,intent:InternalShareIntent){const raw=parseInternalShareRecovery(await this.value(db,'SELECT agentstudio.agent_internal_share_receipt($1::uuid) AS value',[intent.request_id]));if(raw.status==='not_recorded'){if(raw.request_id!==intent.request_id)throw Error('agent_internal_share_invalid_projection');return null}try{return await matchInternalShareReceipt(raw.receipt,intent)}catch{throw new HttpError(409,'agent_internal_share_request_conflict')}}
 record(identity:Identity,raw:unknown,expectedEmployee?:string){const expected=expectedEmployee===undefined?undefined:internalShareId(expectedEmployee),intent=parseInternalShareIntent(raw);return this.actor(identity,intent.request_id,async db=>{
  const old=await this.receipt(db,intent);if(old)return{protocol:'agent_internal_share_reply_v1' as const,receipt:old,share_code:null,replayed:true}
  if(!this.writes)throw new HttpError(403,'agent_internal_share_writes_disabled')
  const reply=parseInternalShareReply(await this.value(db,'SELECT agentstudio.agent_internal_share_record($1::jsonb) AS value',[JSON.stringify(intent)]));await matchInternalShareReceipt(reply.receipt,intent)
  const receipt=await this.receipt(db,intent);if(!receipt||JSON.stringify(receipt)!==JSON.stringify(reply.receipt))throw Error('agent_internal_share_invalid_projection')
  return reply
 },expected)}
 confirm(identity:Identity,raw:unknown,expectedEmployee?:string){const expected=expectedEmployee===undefined?undefined:internalShareId(expectedEmployee),intent=parseInternalShareIntent(raw);return this.actor(identity,intent.request_id,async db=>{const receipt=await this.receipt(db,intent);if(!receipt)throw new HttpError(404,'agent_internal_share_receipt_not_found');return{protocol:'agent_internal_share_reply_v1' as const,receipt,share_code:null,replayed:true}},expected)}
}
