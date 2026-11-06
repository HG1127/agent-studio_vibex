import {HttpError,type Identity,type SqlPool,type SqlClient} from './contracts.ts'
import {NativeLocalDeviceRepository,LocalDeviceAcknowledgementUnknown,localValue,translateLocalError} from './native-local-device-repository.ts'
import {verifyNativeLocalDeviceOriginal,verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {verifyNativeGuidedSchema} from './native-guided-audit.ts'
import {guidedIntent,guidedReply,guidedPair,type GuidedIntent} from '../../../shared/native-guided-contract.mjs'
import {localId,localObject} from '../../../shared/native-local-device-contract.mjs'
export class NativeGuidedOwnerRepository {
 readonly parent:NativeLocalDeviceRepository
 constructor(pool:SqlPool,{allowWrites=false}:{allowWrites?:boolean}={}){this.parent=new NativeLocalDeviceRepository(pool,{allowWrites})}
 private actor<T>(identity:Identity,rid:string|null,expectedOwner:string,body:(db:SqlClient)=>Promise<T>){localId(expectedOwner);return this.parent.actor(identity,rid,async(db,owner)=>{if(owner!==expectedOwner)throw new HttpError(401,'session_required');await verifyNativeGuidedSchema(db);return body(db)})}
 private async prior(db:SqlClient,intent:GuidedIntent){const v=await localValue(db,'SELECT agentstudio_desktop.guided_receipt($1::jsonb) AS value',[JSON.stringify(intent)]);return v===null?null:guidedReply(v,intent)}
 record(identity:Identity,raw:unknown,expectedOwner:string){const intent=guidedIntent(raw);return this.actor(identity,intent.request_id,expectedOwner,async db=>{const prior=await this.prior(db,intent);if(prior)return prior;if(!this.parent.writes)throw new HttpError(403,'native_local_writes_disabled');const reply=await guidedReply(await localValue(db,'SELECT agentstudio_desktop.guided_record($1::jsonb) AS value',[JSON.stringify(intent)]),intent);const stored=await this.prior(db,intent);if(!stored||JSON.stringify(stored.receipt)!==JSON.stringify(reply.receipt))throw Error('native_guided_invalid_projection');return reply})}
 confirm(identity:Identity,raw:unknown,expectedOwner:string){const intent=guidedIntent(raw);return this.actor(identity,intent.request_id,expectedOwner,async db=>{const reply=await this.prior(db,intent);if(!reply)throw new HttpError(404,'native_local_receipt_not_found');return reply})}
 status(identity:Identity,expectedOwner:string){return this.actor(identity,null,expectedOwner,async db=>{const raw=await localValue(db,'SELECT agentstudio_desktop.guided_status() AS value');if(!Array.isArray(raw)||raw.length>100)throw Error('native_guided_invalid_projection');const ids=new Set<string>();return raw.map(item=>{const v=localObject(item,['id','paired','pairing_expires_ms']);localId(v.id);if(ids.has(v.id)||typeof v.paired!=='boolean'||!Number.isSafeInteger(v.pairing_expires_ms)||v.pairing_expires_ms<1)throw Error('native_guided_invalid_projection');ids.add(v.id);return v})})}
}
export class NativeGuidedExecutorRepository {
 readonly pool:SqlPool
 constructor(pool:SqlPool){this.pool=pool}
 async pair(raw:unknown,confirm:boolean){const value=guidedPair(raw),db=await this.pool.connect();let begun=false,committing=false
  try{await db.query(confirm?'BEGIN READ ONLY':'BEGIN');begun=true;await verifyNativeLocalDeviceOriginal(db,'agentstudio_local_executor');await db.query('SET LOCAL ROLE agentstudio_local_executor');await verifyNativeLocalDeviceSchema(db,'agentstudio_local_executor');await verifyNativeGuidedSchema(db);const result=localObject(await localValue(db,'SELECT agentstudio_desktop.guided_pair($1::jsonb,$2::boolean) AS value',[JSON.stringify(value),confirm]),['id','request_id','paired','replayed']);if(result.id!==value.id||result.request_id!==value.request_id||result.paired!==true||typeof result.replayed!=='boolean')throw Error('native_guided_invalid_projection');committing=true;await db.query('COMMIT');begun=false;return result
  }catch(error){if(begun)await db.query('ROLLBACK').catch(()=>{});if(committing)throw new LocalDeviceAcknowledgementUnknown(value.request_id);return translateLocalError(error)}finally{db.release()}
 }
}
