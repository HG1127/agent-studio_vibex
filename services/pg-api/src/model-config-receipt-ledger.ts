import {HttpError,type SqlClient} from './contracts.ts'
import type {ModelConnectionRepository,ModelConnectionRow} from './model-connection-repository.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {modelConfigIntentMac,modelConfigEvidenceMac,sameModelConfigMac,type ModelConfigReceiptEvidence} from './model-config-receipt-crypto.ts'
import {modelConfigReceiptProtocol,parseModelConfigOperation,pendingFromModelConfigOperation,parseModelConfigReceipt,receiptId,clearModelConfigOperationSecrets,type ModelConfigOperation,type ModelConfigReceipt} from '../../../shared/model-config-receipt-contract.ts'
type ReceiptRow=ModelConfigReceiptEvidence&{receipt_hmac:string;recorded_at:string|Date}
const columns='owner_user_id,request_id,action,target_id,expected_revision,after_revision,outcome,public_intent_sha256,key_commitment,intent_hmac,receipt_hmac,audit_event_id,recorded_at'
const invalid=():never=>{throw new HttpError(503,'model_config_receipt_evidence_invalid')}
function rowValue(raw:ReceiptRow):ReceiptRow{if(!raw||typeof raw!=='object')return invalid();const value={...raw,expected_revision:raw.expected_revision===null?null:Number(raw.expected_revision),after_revision:raw.after_revision===null?null:Number(raw.after_revision)};for(const field of ['owner_user_id','request_id','target_id','audit_event_id'] as const)try{receiptId(value[field])}catch{return invalid()}if(value.expected_revision!==null&&(!Number.isSafeInteger(value.expected_revision)||value.expected_revision<1)||value.after_revision!==null&&(!Number.isSafeInteger(value.after_revision)||value.after_revision<1))return invalid();return value}
function project(row:ReceiptRow):ModelConfigReceipt{
 const pending={format:'agentstudio.original-model-receipt.v2' as const,employee_id:row.owner_user_id,request_id:row.request_id,action:row.action as ModelConfigReceipt['action'],id:row.action==='create'?null:row.target_id,revision:row.expected_revision,public_intent_sha256:row.public_intent_sha256,key_commitment:row.key_commitment,created_at:1}
 try{return parseModelConfigReceipt({protocol:modelConfigReceiptProtocol,owner_user_id:row.owner_user_id,request_id:row.request_id,action:row.action,connection_id:row.target_id,before_revision:row.expected_revision,after_revision:row.after_revision,outcome:row.outcome,public_intent_sha256:row.public_intent_sha256,key_commitment:row.key_commitment,audit_event_id:row.audit_event_id,recorded_at:new Date(row.recorded_at instanceof Date?row.recorded_at.getTime():row.recorded_at).toISOString()},pending)}catch{return invalid()}
}
async function verifyEvidence(db:SqlClient,key:Buffer,raw:ReceiptRow,owner:string):Promise<ReceiptRow>{
 const row=rowValue(raw);if(row.owner_user_id!==owner||!sameModelConfigMac(modelConfigEvidenceMac(key,row),row.receipt_hmac))return invalid()
 const audit=(await db.query<{owner_user_id:string;actor_user_id:string;action:string;target_kind:string;target_id:string;result:string;metadata:unknown}>('SELECT owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata FROM agentstudio.audit_events WHERE id=$1::uuid AND owner_user_id=$2::uuid',[row.audit_event_id,owner])).rows[0]
 const actions:Record<string,string>={created:'model.connection_create',updated:'model.connection_update',enabled:'model.connection_enable',disabled:'model.connection_disable',deleted:'model.connection_delete'},action=actions[row.outcome]
 if(!audit||audit.owner_user_id!==owner||audit.actor_user_id!==owner||audit.action!==action||audit.target_kind!=='model_connection'||audit.target_id!==row.target_id||audit.result!=='succeeded'||!audit.metadata||typeof audit.metadata!=='object'||Array.isArray(audit.metadata)||Object.keys(audit.metadata).length!==1||(audit.metadata as {revision?:unknown}).revision!==(row.after_revision??row.expected_revision))return invalid()
 project(row);return row
}
export type ModelConfigWriteAck={receipt:ModelConfigReceipt;item:ModelConnectionRow|null;replayed:boolean}
/** Same actual withActor transaction owns lock, model DML, audit and receipt.
 * Exported for pure terminal-control tests; it never attests schema readiness. */
export async function submitModelConfigOnActor(db:SqlClient,actor:string,models:ModelConnectionRepository,raw:unknown,expectedEmployee:string):Promise<ModelConfigWriteAck>{
 assertOriginalUiEmployee(actor,expectedEmployee);await assertOwnedAdmissionContext(db,actor)
 const isolation=(await db.query<{ok:boolean}>("SELECT current_setting('transaction_isolation')='read committed' AS ok")).rows[0];if(isolation?.ok!==true)throw new HttpError(503,'model_config_receipt_isolation_required')
 const op=parseModelConfigOperation(raw)
 try{
  const intentMac=modelConfigIntentMac(models.encryptionKey,actor,op)
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,75075))',[actor+':'+op.request_id])
  const prior=(await db.query<ReceiptRow>('SELECT '+columns+' FROM agentstudio.model_config_write_receipts075 WHERE owner_user_id=$1::uuid AND request_id=$2::uuid',[actor,op.request_id])).rows[0]
  if(prior){const recorded=await verifyEvidence(db,models.encryptionKey,prior,actor);if(!sameModelConfigMac(recorded.intent_hmac,intentMac))throw new HttpError(409,'model_config_request_conflict');const receipt=project(recorded);try{parseModelConfigReceipt(receipt,pendingFromModelConfigOperation(op,actor,1))}catch{return invalid()}return{receipt,item:null,replayed:true}}
  // Only the fresh branch may encrypt credentials or mutate a model.
  const written=await models.writeConfigOnActor(db,actor,op),row:ModelConfigReceiptEvidence={owner_user_id:actor,request_id:op.request_id,action:op.action,target_id:written.id,expected_revision:written.before_revision,after_revision:written.after_revision,outcome:written.outcome,public_intent_sha256:op.public_intent_sha256,key_commitment:op.key_binding?.commitment??null,intent_hmac:intentMac,audit_event_id:written.audit_event_id},evidenceMac=modelConfigEvidenceMac(models.encryptionKey,row)
  const inserted=(await db.query<ReceiptRow>('INSERT INTO agentstudio.model_config_write_receipts075(owner_user_id,request_id,action,target_id,expected_revision,after_revision,outcome,public_intent_sha256,key_commitment,intent_hmac,receipt_hmac,audit_event_id) VALUES($1::uuid,$2::uuid,$3::text,$4::uuid,$5::bigint,$6::bigint,$7::text,$8::text,$9::text,$10::text,$11::text,$12::uuid) RETURNING '+columns,[actor,op.request_id,op.action,written.id,written.before_revision,written.after_revision,written.outcome,op.public_intent_sha256,row.key_commitment,intentMac,evidenceMac,written.audit_event_id])).rows[0]
  if(!inserted)return invalid();const verified=await verifyEvidence(db,models.encryptionKey,inserted,actor),receipt=project(verified)
  try{parseModelConfigReceipt(receipt,pendingFromModelConfigOperation(op,actor,1))}catch{return invalid()}
  return{receipt,item:written.item,replayed:false}
 }finally{clearModelConfigOperationSecrets(op)}
}
export async function readModelConfigReceiptOnActor(db:SqlClient,actor:string,models:ModelConnectionRepository,requestId:string,expectedEmployee:string):Promise<ModelConfigReceipt>{
 assertOriginalUiEmployee(actor,expectedEmployee);await assertOwnedAdmissionContext(db,actor);receiptId(requestId)
 const row=(await db.query<ReceiptRow>('SELECT '+columns+' FROM agentstudio.model_config_write_receipts075 WHERE owner_user_id=$1::uuid AND request_id=$2::uuid',[actor,requestId])).rows[0]
 // Absence does not prove rollback: an original transaction may still commit.
 if(!row)throw new HttpError(404,'model_config_receipt_not_recorded')
 return project(await verifyEvidence(db,models.encryptionKey,row,actor))
}
