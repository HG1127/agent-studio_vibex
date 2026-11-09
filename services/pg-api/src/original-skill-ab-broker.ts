import type {request as HttpsRequest} from 'node:https'
import {HttpError,type SqlPool} from './contracts.ts'
import {OriginalRoleUiRepository} from './original-role-ui-repository.ts'
import {originalSkillAbMaterialOnClient} from './original-skill-ab-source.ts'
import {originalRoleCanonical} from './original-role-execution.mjs'
import {withModelBrokerActor} from './model-broker-actor.ts'
import {decryptModelSecret} from './model-connection-crypto.ts'
import {roleObject,roleText} from '../../../shared/original-role-execution-contract.mjs'
import {originalSkillAbSelection} from '../../../shared/original-skill-ab-contract.ts'
import {abId,abSha,skillAbProof,skillAbDispatchReply,type SkillAbProof} from '../../../shared/original-skill-ab-execution-contract.ts'
import {createSkillAbProviderExecutor,skillAbExecutionEnabled,type SkillAbExecutionOptions,type SkillAbCompletion,type SkillAbMaterial} from './original-skill-ab-provider.ts'
import {skillAbDispatchTransaction,auditSkillAbClient} from './original-skill-ab-runtime.ts'
import type {ProviderResolver} from './model-connection-probe.ts'
function deny():never{throw new HttpError(409,'original_skill_ab_dispatch_refused')}
// Closed field shape after the checks below. Raw messages/provider remain
// untrusted until current() compares the fresh owned source before dispatch.
type Context={
 protocol:'original_skill_ab_dispatch_context_v1';proof:SkillAbProof
 owner_user_id:string;identity:{issuer:'urn:agentstudio:local:v1';subject:string}
 selection:ReturnType<typeof originalSkillAbSelection>;owner_epoch:number
 input_sha256:string;source_sha256:string;variant:'baseline'|'with_skill'
 messages:unknown;provider:unknown;base_url:string
}
function context(raw:unknown,proof:SkillAbProof):Context{
 const c=roleObject(raw,['protocol','proof','owner_user_id','identity','selection','owner_epoch','input_sha256','source_sha256','variant','messages','provider','base_url'])
 const identity=roleObject(c.identity,['issuer','subject']),selection=originalSkillAbSelection(c.selection)
 if(c.protocol!=='original_skill_ab_dispatch_context_v1'||originalRoleCanonical(skillAbProof(c.proof))!==originalRoleCanonical(proof)||identity.issuer!=='urn:agentstudio:local:v1'||c.variant!=='baseline'&&c.variant!=='with_skill'||typeof c.owner_epoch!=='number'||!Number.isSafeInteger(c.owner_epoch)||c.owner_epoch<1||!['openai','anthropic','gemini'].includes(String(c.provider))||typeof c.base_url!=='string')deny()
 return {protocol:'original_skill_ab_dispatch_context_v1',proof,owner_user_id:abId(c.owner_user_id),identity:{issuer:'urn:agentstudio:local:v1',subject:roleText(identity.subject,1000,true)},selection,owner_epoch:c.owner_epoch,input_sha256:abSha(c.input_sha256),source_sha256:abSha(c.source_sha256),variant:c.variant,messages:c.messages,provider:c.provider,base_url:c.base_url}
}

type Secret={owner_user_id:string;revision:string|number;enabled:boolean;status:string;provider:SkillAbMaterial['provider'];base_url:string;models:unknown;api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array;api_key_tag:Uint8Array}
/** Independently owned business/dispatch/credential pools. No Worker, listener
 * or provider operation starts on import or construction. */
export class OriginalSkillAbBroker{
 readonly business:SqlPool;readonly dispatchPool:SqlPool;readonly secret:SqlPool
 readonly enabled:boolean;private readonly key:Buffer;private closed=false;private readonly active=new Set<AbortController>()
 private readonly execute:ReturnType<typeof createSkillAbProviderExecutor>|null
 constructor(business:SqlPool,dispatchPool:SqlPool,secret:SqlPool,key:Buffer,options:SkillAbExecutionOptions&{resolver?:ProviderResolver;request?:typeof HttpsRequest}={}){
  this.business=business;this.dispatchPool=dispatchPool;this.secret=secret
  this.enabled=skillAbExecutionEnabled(options)
  if(!business||!dispatchPool||!secret||business===dispatchPool||business===secret||dispatchPool===secret||!Buffer.isBuffer(key)||key.length!==32)throw Error('original_skill_ab_independent_pools_required')
  this.key=Buffer.from(key);this.execute=this.enabled?createSkillAbProviderExecutor(options,options.resolver,options.request):null
 }
 close(){if(this.closed)return;this.closed=true;for(const c of this.active)c.abort();this.key.fill(0)}
 private async rpc(name:'context'|'reserve'|'finish',proof:SkillAbProof,completion?:SkillAbCompletion|null){
  return skillAbDispatchTransaction(this.dispatchPool,async db=>{
   await auditSkillAbClient(db,this.dispatchPool,'agentstudio_skill_ab_dispatch')
   const args:unknown[]=[proof.request_id,proof.ordinal,proof.dispatch_token];if(name==='finish')args.push(completion===undefined?null:JSON.stringify(completion))
   const raw=(await db.query<{value:unknown}>(`SELECT agentstudio_skill_ab.${name}($1::uuid,$2::integer,$3::uuid${name==='finish'?',$4::jsonb':''}) AS value`,args)).rows[0]?.value
   if(raw===undefined)deny();return raw
  })
 }
 private async current(c:Context){
  if(this.closed)deny()
  return new OriginalRoleUiRepository(this.business,false).actor(c.identity,c.owner_user_id,false,async(db,owner)=>{
   await auditSkillAbClient(db,this.business,'agentstudio_api')
   const m=await originalSkillAbMaterialOnClient(db,owner,c.selection),p=m.preview
   if(p.owner_epoch!==c.owner_epoch||p.input_sha256!==c.input_sha256||p.source_sha256!==c.source_sha256||originalRoleCanonical(m.messages[c.variant])!==originalRoleCanonical(c.messages)||m.provider!==c.provider||m.base_url!==c.base_url)deny()
   return m
  })
 }
 async dispatch(raw:unknown){
  if(!this.enabled||!this.execute||this.closed)throw new HttpError(403,'original_skill_ab_execution_disabled')
  const proof=skillAbProof(raw),c=context(await this.rpc('context',proof),proof)
  let completion:SkillAbCompletion|null=null;const controller=new AbortController();this.active.add(controller)
  try{
   const source=await this.current(c),b=c.selection.model_binding
   const material=await withModelBrokerActor(this.secret,c.identity,async(db,owner)=>{
    if(owner!==c.owner_user_id)deny()
    const rows=(await db.query<Secret>('SELECT owner_user_id,revision,enabled,status,provider,base_url,models,api_key_ciphertext,api_key_nonce,api_key_tag FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid',[b.connection_id,owner])).rows,r=rows[0]
    if(rows.length!==1||!r||r.owner_user_id!==owner||Number(r.revision)!==b.connection_revision||r.enabled!==true||r.status!=='ok'||r.provider!==source.provider||r.base_url!==source.base_url||!Array.isArray(r.models)||!r.models.includes(b.model_id))deny()
    return {provider:r.provider,base_url:r.base_url,model_id:b.model_id,api_key:decryptModelSecret({ciphertext:Buffer.from(r.api_key_ciphertext),nonce:Buffer.from(r.api_key_nonce),tag:Buffer.from(r.api_key_tag)},this.key)}
   })
   completion=await this.execute(material,source.messages[c.variant],controller.signal,async()=>{
    await this.current(c)
    if(this.closed||await this.rpc('reserve',proof)!==true)deny()
   })
   await this.current(c)
  }catch{completion=null}
  finally{this.active.delete(controller)}
  // A failed/ambiguous provider or commit never loops, reclaims or resends.
  try{return skillAbDispatchReply(await this.rpc('finish',proof,completion),proof)}catch{return {protocol:'original_skill_ab_dispatch_reply_v1' as const,request_id:proof.request_id,ordinal:proof.ordinal,state:'unknown' as const}}
 }
}
