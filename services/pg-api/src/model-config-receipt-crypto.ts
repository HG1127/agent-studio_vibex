import {createHash,createHmac,timingSafeEqual} from 'node:crypto'
import {HttpError} from './contracts.ts'
import {modelConfigPublicIntent,modelConfigBlindMessage,type ModelConfigOperation} from '../../../shared/model-config-receipt-contract.ts'
const mac=(key:Buffer,domain:string,value:string)=>createHmac('sha256',createHmac('sha256',key).update(domain).digest()).update(value).digest('hex')
export function sameModelConfigMac(a:string,b:string):boolean{return/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'))}
export function modelConfigIntentMac(key:Buffer,owner:string,op:ModelConfigOperation):string{
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('invalid_model_config_receipt_key')
 const publicIntent=modelConfigPublicIntent(op,owner),publicHash=createHash('sha256').update(publicIntent).digest('hex');if(!sameModelConfigMac(publicHash,op.public_intent_sha256))throw new HttpError(400,'model_config_public_intent_mismatch')
 if(op.input?.api_key){const binding=op.key_binding!;const blind=Buffer.from(binding.blind,'base64url');try{if(blind.length!==32||blind.toString('base64url')!==binding.blind||!sameModelConfigMac(createHmac('sha256',blind).update(modelConfigBlindMessage(publicHash,op.input.api_key)).digest('hex'),binding.commitment))throw new HttpError(400,'model_config_key_binding_mismatch')}finally{blind.fill(0)}}
 // The ephemeral client blind is part of the secret intent and is never stored.
 return mac(key,'agentstudio:model-config-receipt075:intent:v1',JSON.stringify({owner,public_intent:publicIntent,input:op.input,key_binding:op.key_binding}))
}
export type ModelConfigReceiptEvidence={owner_user_id:string;request_id:string;action:string;target_id:string;expected_revision:number|null;after_revision:number|null;outcome:string;public_intent_sha256:string;key_commitment:string|null;intent_hmac:string;audit_event_id:string}
export function modelConfigEvidenceMac(key:Buffer,row:ModelConfigReceiptEvidence):string{return mac(key,'agentstudio:model-config-receipt075:evidence:v1',JSON.stringify({owner_user_id:row.owner_user_id,request_id:row.request_id,action:row.action,target_id:row.target_id,expected_revision:row.expected_revision,after_revision:row.after_revision,outcome:row.outcome,public_intent_sha256:row.public_intent_sha256,key_commitment:row.key_commitment,intent_hmac:row.intent_hmac,audit_event_id:row.audit_event_id}))}
