import {HttpError,type Identity,type SqlPool,type SqlClient} from './contracts.ts'
import {withActor,withActorClient,assertOwnedAdmissionContext} from './repository.ts'
import {withModelBrokerActor} from './model-broker-actor.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {decryptModelSecret,parseModelEncryptionKey} from './model-connection-crypto.ts'
import {exactProviderEndpoint} from './model-connection-probe.ts'
import {createModelDraftDiscoveryProvider,type ModelDiscoveryTransport} from './model-draft-discovery-provider.ts'
import {modelDraftProbeProtocol,modelDraftProbeMode,parseModelDraftProbeInput,parseModelDraftProbeResult,draftProbeId,type ModelDraftProbeInput,type ModelDraftProbeResult} from '../../../shared/model-draft-probe-contract.ts'
export class ModelDraftProbeRepository{
 readonly protocol=modelDraftProbeProtocol
 readonly enabled:boolean
 private readonly active=new Set<string>()
 private readonly recent=new Map<string,number>()
 private readonly transport:ModelDiscoveryTransport|null
 private readonly key:Buffer
 private readonly pool:SqlPool
 private readonly brokerPool:SqlPool
 constructor(pool:SqlPool,brokerPool:SqlPool,key:string|Buffer,options:{configurationWrites?:boolean;modelProbeUat?:boolean;transport?:ModelDiscoveryTransport;now?:()=>number}={}){
  this.pool=pool;this.brokerPool=brokerPool;this.enabled=options.configurationWrites===true&&options.modelProbeUat===true;this.transport=this.enabled?(options.transport??createModelDraftDiscoveryProvider()):null;this.key=Buffer.isBuffer(key)?key:parseModelEncryptionKey(key);this.now=options.now??Date.now
 }
 private readonly now:()=>number
 private async selected(db:SqlClient,actor:string,input:ModelDraftProbeInput){
  if(input.credential.kind!=='saved')return
  const c=input.credential,row=(await db.query<{provider:string;base_url:string;revision:string|number}>('SELECT provider,base_url,revision FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE',[c.connection_id,actor])).rows[0]
  if(!row)throw new HttpError(404,'model_connection_not_found')
  if(Number(row.revision)!==c.expected_revision)throw new HttpError(409,'revision_conflict')
  if(row.provider!==input.provider||row.base_url!==input.base_url)throw new HttpError(409,'draft_stored_credential_scope_changed')
 }
 private async audit(db:SqlClient,owner:string,input:ModelDraftProbeInput,phase:'admitted'|'finished',outcome?:ModelDraftProbeResult){
  const saved=input.credential.kind==='saved'?input.credential:null
  await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES($1::uuid,$1::uuid,$2::text,'model_connection_draft_probe',$3::text,$4::text,$5::jsonb)",[owner,'model.connection_draft_probe_'+phase,input.request_id,phase==='admitted'?'succeeded':outcome?.ok?'succeeded':'failed',JSON.stringify({protocol:modelDraftProbeProtocol,credential_source:input.credential.kind,provider:input.provider,connection_id:saved?.connection_id??null,connection_revision:saved?.expected_revision??null,...(outcome?{error_code:outcome.error_code,latency_ms:outcome.latency_ms,model_count:outcome.models.length,complete:outcome.complete}:{})})])
 }
 async probe(identity:Identity,raw:unknown,expectedEmployee:string):Promise<ModelDraftProbeResult>{
  if(!this.enabled||!this.transport)throw new HttpError(405,'model_draft_probe_disabled')
  const expected=draftProbeId(expectedEmployee);let reserved:string|null=null,input:ModelDraftProbeInput|undefined
  try{
   input=await withActor(this.pool,identity,async(db,actor)=>{
    assertOriginalUiEmployee(actor,expected);await assertOwnedAdmissionContext(db,actor)
    const normalized=parseModelDraftProbeInput(raw);try{exactProviderEndpoint(normalized)}catch{throw new HttpError(400,'provider_endpoint_not_allowlisted')}await this.selected(db,actor,normalized)
    const now=this.now();for(const[owner,until]of this.recent)if(until<=now&&!this.active.has(owner))this.recent.delete(owner)
    if(this.active.size>=4||this.active.has(actor)||(this.recent.get(actor)??0)>now||this.recent.size>=1024)throw new HttpError(429,'model_draft_probe_rate_limited')
    this.active.add(actor);this.recent.set(actor,now+30000);reserved=actor
    // Admission success is not a provider success or an exact outcome receipt.
    // Commit this owner event before credential use or egress.
    await this.audit(db,actor,normalized,'admitted');return normalized
   })
   const admitted=input
   return await withActor(this.pool,identity,async(db,actor)=>{
    assertOriginalUiEmployee(actor,expected);if(actor!==reserved)throw new HttpError(409,'employee_session_changed');await assertOwnedAdmissionContext(db,actor);await this.selected(db,actor,admitted)
    let key:string
    if(admitted.credential.kind==='draft')key=admitted.credential.api_key
    else{const c=admitted.credential;key=await withModelBrokerActor(this.brokerPool,identity,async(secretDb,secretActor)=>{
     assertOriginalUiEmployee(secretActor,expected);if(secretActor!==actor)throw new HttpError(409,'employee_session_changed')
     const row=(await secretDb.query<{provider:string;base_url:string;revision:string|number;api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array;api_key_tag:Uint8Array}>('SELECT provider,base_url,revision,api_key_ciphertext,api_key_nonce,api_key_tag FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid',[c.connection_id,secretActor])).rows[0]
     if(!row)throw new HttpError(404,'model_connection_not_found');if(Number(row.revision)!==c.expected_revision)throw new HttpError(409,'revision_conflict');if(row.provider!==admitted.provider||row.base_url!==admitted.base_url)throw new HttpError(409,'draft_stored_credential_scope_changed')
     return decryptModelSecret({ciphertext:Buffer.from(row.api_key_ciphertext),nonce:Buffer.from(row.api_key_nonce),tag:Buffer.from(row.api_key_tag)},this.key)
    })}
    try{
     const beforeNetwork=async()=>{await withActorClient(db,this.pool,identity,async(current,actual)=>{assertOriginalUiEmployee(actual,expected);if(actual!==actor)throw new HttpError(409,'employee_session_changed');await assertOwnedAdmissionContext(current,actual);await this.selected(current,actual,admitted)})}
     const outcome=await this.transport!({provider:admitted.provider,base_url:admitted.base_url,api_key:key},beforeNetwork)
     await beforeNetwork()
     const saved=admitted.credential.kind==='saved'?admitted.credential:null,result=parseModelDraftProbeResult({protocol:modelDraftProbeProtocol,request_id:admitted.request_id,mode:modelDraftProbeMode,owner_user_id:actor,credential_source:admitted.credential.kind,connection_id:saved?.connection_id??null,connection_revision:saved?.expected_revision??null,...outcome},admitted,actor)
     if(result.models.some(id=>id.includes(key)))throw new HttpError(503,'invalid_model_draft_probe_result')
     await this.audit(db,actor,admitted,'finished',result);return result
    }finally{key=''}
   })
  }finally{if(reserved)this.active.delete(reserved);if(input?.credential.kind==='draft')input.credential.api_key=''}
 }
}
