// Independent private review Broker: durable reservation precedes all key
// reads and POSTs. No autonomous-run impersonation or inherited fee consent.
import {resolve4,resolve6} from "node:dns/promises"
import {request as httpsRequest,type RequestOptions} from "node:https"
import {HttpError,isUuid,type Identity,type SqlPool,type SqlClient} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {withModelBrokerActor} from "./model-broker-actor.ts"
import {decryptModelSecret} from "./model-connection-crypto.ts"
import {exactProviderEndpoint,resolveSafeProviderAddress,type ProviderResolver} from "./model-connection-probe.ts"
import type {SelectedModelMaterial,PreparedSelectedModelRequest} from "./model-connection-executor.ts"
import {parseAgentReviewPreview,type AgentReviewPreview} from "./agent-review-contract.ts"
import {AgentReviewSourceRepository} from "./agent-review-source.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
import {verifyAgentAssessmentCredentials} from "./agent-assessment-audit.ts"
import {assertAgentAssessmentSession} from "./agent-assessment-role.ts"
import {agentAssessmentExecutionEnabled,assessmentObject,assessmentSha,assessmentVersion,parseAgentAssessmentProof,parseAgentAssessmentReply,normalizeAgentAssessmentCompletion,agentAssessmentOutputHash,type AgentAssessmentActivation,type AgentAssessmentProof,type AgentAssessmentReply,type AgentAssessmentPurpose,type AgentAssessmentCompletion} from "./agent-assessment-contract.ts"

type Messages=[{role:"system";content:string},{role:"user";content:string}]
export type AgentAssessmentProviderInput={messages:Messages;output_token_limit:2048|4096|8192|16384}
export type AgentAssessmentExecutor=(material:SelectedModelMaterial,input:AgentAssessmentProviderInput,signal:AbortSignal,beforePost:()=>Promise<void>)=>Promise<string>
type Context={identity:Identity;owner_user_id:string;request_id:string;purpose:AgentAssessmentPurpose;request_sha256:string;input_sha256:string;content_sha256:string;owner_epoch:number;source_protocol:"current_task_delivery_v1"|"employee_statement_anchor_v1";choice:AgentReviewPreview;messages:Messages}
type Model={revision:number|string;enabled:boolean;status:string;provider:SelectedModelMaterial["provider"];base_url:string;models:unknown}
type Secret=Model&{api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array;api_key_tag:Uint8Array}
const unavailable=():never=>{throw new HttpError(409,"agent_assessment_context_unavailable")}
function models(raw:unknown):string[]{if(typeof raw==="string")try{raw=JSON.parse(raw)}catch{return unavailable()};if(!Array.isArray(raw)||raw.some(v=>typeof v!=="string"))return unavailable();return raw as string[]}
function number(raw:unknown):number{if(typeof raw==="string"&&/^[1-9][0-9]*$/.test(raw))raw=Number(raw);return assessmentVersion(raw)}
function messages(raw:unknown):Messages{
  if(!Array.isArray(raw)||raw.length!==2||Reflect.ownKeys(raw).length!==3)return unavailable()
  for(let i=0;i<2;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,String(i))??{},"value"))return unavailable()
  const values=raw.map((item,index)=>{const v=assessmentObject(item,["role","content"]);if(v.role!==(index===0?"system":"user")||typeof v.content!=="string"||!v.content.length||v.content.includes("\0"))return unavailable();return {role:v.role,content:v.content}})
  if(Buffer.byteLength(canonicalMcpJson(values))>262144)return unavailable()
  return values as Messages
}
function context(raw:unknown,proof:AgentAssessmentProof):Context{
  const v=assessmentObject(raw,["identity","owner_user_id","request_id","purpose","request_sha256","input_sha256","content_sha256","owner_epoch","source_protocol","choice","messages"])
  const identity=assessmentObject(v.identity,["issuer","subject"]),choice=parseAgentReviewPreview(v.choice)
  if(identity.issuer!=="urn:agentstudio:local:v1"||typeof identity.subject!=="string"||!identity.subject||identity.subject.length>1000||!isUuid(v.owner_user_id)||v.owner_user_id!==v.owner_user_id.toLowerCase()||v.request_id!==proof.request_id||v.purpose!==choice.purpose||choice.evaluation_sources.length||v.source_protocol!==(choice.purpose==="evaluate"?"current_task_delivery_v1":"employee_statement_anchor_v1")||canonicalMcpJson(v.choice)!==canonicalMcpJson(choice))return unavailable()
  const selected={identity:{issuer:identity.issuer,subject:identity.subject},owner_user_id:v.owner_user_id,request_id:proof.request_id,purpose:choice.purpose,request_sha256:assessmentSha(v.request_sha256),input_sha256:assessmentSha(v.input_sha256),content_sha256:assessmentSha(v.content_sha256),owner_epoch:number(v.owner_epoch),source_protocol:v.source_protocol as Context["source_protocol"],choice,messages:messages(v.messages)}
  const content=agentMemoryHash(canonicalMcpJson({protocol:"agent_paid_review_input_v1",choice,messages:selected.messages})),input=agentMemoryHash(canonicalMcpJson({protocol:"agent_paid_review_prepared_input_v1",owner:selected.owner_user_id,owner_epoch:selected.owner_epoch,source_protocol:selected.source_protocol,content_sha256:content}))
  if(content!==selected.content_sha256||input!==selected.input_sha256)return unavailable()
  return selected
}

// Review-specific adapter preserves the sealed system/user messages and exact
// selected token cap, including full descriptive output capacity.
export function prepareAgentAssessmentProviderRequest(material:SelectedModelMaterial,input:AgentAssessmentProviderInput):PreparedSelectedModelRequest{
  const endpoint=exactProviderEndpoint(material),selected=messages(input.messages),cap=input.output_token_limit
  if(![2048,4096,8192,16384].includes(cap)||typeof cap!=="number"||typeof material.api_key!=="string"||material.api_key.length<8||material.api_key.length>4096||/[\s\u0000-\u001f\u007f]/u.test(material.api_key)||typeof material.model_id!=="string"||!/^[A-Za-z0-9._:/-]{1,120}$/.test(material.model_id))throw Error("invalid_agent_assessment_provider_material")
  const headers:Record<string,string>={Accept:"application/json","Content-Type":"application/json","User-Agent":"agentstudio-pg18-private-review/1"}
  let path:string,payload:unknown
  if(material.provider==="openai"){path="/v1/chat/completions";headers.Authorization="Bearer "+material.api_key;payload={model:material.model_id,messages:selected,max_completion_tokens:cap,response_format:{type:"json_object"}}}
  else if(material.provider==="anthropic"){path="/v1/messages";headers["x-api-key"]=material.api_key;headers["anthropic-version"]="2023-06-01";payload={model:material.model_id,system:selected[0].content,messages:[selected[1]],max_tokens:cap}}
  else{const model=material.model_id.startsWith("models/")?material.model_id.slice(7):material.model_id;if(!/^[A-Za-z0-9._-]{1,100}$/.test(model))throw Error("invalid_agent_assessment_model");path="/v1beta/models/"+model+":generateContent";headers["x-goog-api-key"]=material.api_key;payload={systemInstruction:{parts:[{text:selected[0].content}]},contents:[{role:"user",parts:[{text:selected[1].content}]}],generationConfig:{maxOutputTokens:cap,responseMimeType:"application/json"}}}
  const body=Buffer.from(JSON.stringify(payload));if(body.length>524288)throw Error("agent_assessment_provider_input_too_large");headers["Content-Length"]=String(body.length)
  return {host:endpoint.host,path,headers,body}
}
function providerText(provider:SelectedModelMaterial["provider"],raw:unknown):string{
  const v=raw as {choices?:{message?:{content?:unknown;tool_calls?:unknown;function_call?:unknown};finish_reason?:string}[];stop_reason?:string;content?:{type?:string;text?:unknown}[];candidates?:{finishReason?:string;content?:{parts?:{text?:unknown;functionCall?:unknown;thought?:unknown}[]}}[]}|null
  let value:unknown
  if(provider==="openai"){const item=v?.choices?.[0];if(!item||item.message?.tool_calls!==undefined||item.message?.function_call!==undefined||item.finish_reason!=="stop")throw Error();value=item.message?.content}
  else if(provider==="anthropic"){if(v?.stop_reason!=="end_turn"||!Array.isArray(v.content)||v.content.length!==1||v.content[0]?.type!=="text")throw Error();value=v.content[0].text}
  else{const candidate=v?.candidates?.[0],parts=candidate?.content?.parts;if(candidate?.finishReason!=="STOP"||!Array.isArray(parts)||parts.length!==1||parts[0]?.functionCall!==undefined||parts[0]?.thought!==undefined)throw Error();value=parts[0]?.text}
  if(typeof value!=="string"||!value.trim()||value.length>131072||value.includes("\0"))throw Error()
  return value
}
export function createAgentAssessmentProviderExecutor(options:AgentAssessmentActivation={},resolver:ProviderResolver={resolve4,resolve6},request:typeof httpsRequest=httpsRequest):AgentAssessmentExecutor{
  if(!agentAssessmentExecutionEnabled(options))throw Error("agent_assessment_provider_disabled")
  return async(material,input,signal,beforePost)=>{
    signal.throwIfAborted();const prepared=prepareAgentAssessmentProviderRequest(material,input),address=await resolveSafeProviderAddress(resolver,prepared.host)
    await beforePost();signal.throwIfAborted()
    return new Promise<string>((resolve,reject)=>{
      let settled=false
      const fail=()=>{if(!settled){settled=true;reject(Error("agent_assessment_provider_unknown"))}}
      const opts:RequestOptions={protocol:"https:",hostname:prepared.host,servername:prepared.host,port:443,path:prepared.path,method:"POST",headers:prepared.headers,rejectUnauthorized:true,minVersion:"TLSv1.2",agent:false,family:address.family,lookup:(_host,_opts,cb)=>cb(null,address.address,address.family),signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])}
      try{const req=request(opts,res=>{
        if(res.statusCode!==200||!/^application\/json(?:\s*;|$)/i.test(String(res.headers["content-type"]??""))||res.headers["content-encoding"]!==undefined&&res.headers["content-encoding"]!=="identity"){fail();res.destroy();return}
        let used=0;const chunks:Buffer[]=[]
        res.on("data",piece=>{if(settled)return;const bytes=Buffer.isBuffer(piece)?piece:Buffer.from(piece);used+=bytes.length;if(used>524288){fail();res.destroy();return}chunks.push(bytes)})
        res.once("error",fail);res.once("aborted",fail)
        res.once("end",()=>{if(settled)return;try{const result=providerText(material.provider,JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))));settled=true;resolve(result)}catch{fail()}})
      });req.once("error",fail);req.end(prepared.body)}catch{fail()}
    })
  }
}

export class AgentAssessmentBroker{
  readonly businessPool:SqlPool;readonly dispatchPool:SqlPool;readonly secretPool:SqlPool;readonly enabled:boolean
  private readonly key:Buffer;private readonly execute:AgentAssessmentExecutor
  constructor(businessPool:SqlPool,dispatchPool:SqlPool,secretPool:SqlPool,key:Buffer,options:AgentAssessmentActivation&{executor?:AgentAssessmentExecutor;resolver?:ProviderResolver;request?:typeof httpsRequest}={}){
    if(!businessPool||!dispatchPool||!secretPool||businessPool===dispatchPool||businessPool===secretPool||dispatchPool===secretPool||!Buffer.isBuffer(key)||key.length!==32||options.executor!==undefined&&typeof options.executor!=="function")throw Error("agent_assessment_independent_pools_required")
    this.businessPool=businessPool;this.dispatchPool=dispatchPool;this.secretPool=secretPool;this.key=key;this.enabled=agentAssessmentExecutionEnabled(options)
    this.execute=options.executor??(this.enabled?createAgentAssessmentProviderExecutor(options,options.resolver,options.request):async()=>{throw Error("agent_assessment_execution_disabled")})
  }
  private async call<T>(name:"context"|"reserve"|"finish",proof:AgentAssessmentProof,completion?:AgentAssessmentCompletion):Promise<T>{
    const db=await this.dispatchPool.connect();let begun=false
    try{
      await db.query("BEGIN");begun=true
      await assertAgentAssessmentSession(db,"agentstudio_review_dispatch")
      await db.query("SET LOCAL ROLE agentstudio_review_dispatch")
      await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
      if((await db.query<{role:string}>("SELECT current_user AS role")).rows[0]?.role!=="agentstudio_review_dispatch")return unavailable()
      if(!await verifyAgentAssessmentCredentials(db))throw Error("agent_assessment_schema_required")
      const args:unknown[]=[proof.request_id,proof.lease_token,proof.lease_version,proof.worker_id];if(name==="finish")args.push(JSON.stringify(completion))
      const result=(await db.query<{value:T}>("SELECT agentstudio.agent_assessment_"+name+"($1::uuid,$2::uuid,$3::bigint,$4::uuid"+(name==="finish"?",$5::jsonb":"")+") AS value",args)).rows[0]?.value
      if(result===undefined)return unavailable()
      await db.query("COMMIT");begun=false;return result
    }catch(error){if(begun)await db.query("ROLLBACK").catch(()=>undefined);throw error}finally{db.release()}
  }
  private async source(db:SqlClient,owner:string,selected:Context){
    await assertOwnedAdmissionContext(db,owner)
    if(owner!==selected.owner_user_id||!await verifyAgentAssessmentCredentials(db))return unavailable()
    const prepared=await new AgentReviewSourceRepository(this.businessPool).prepareOnClient(selected.identity,db,owner,selected.choice)
    if(prepared.owner_epoch!==selected.owner_epoch||prepared.input_sha256!==selected.input_sha256||prepared.content_sha256!==selected.content_sha256||prepared.source_protocol!==selected.source_protocol||canonicalMcpJson(prepared.choice)!==canonicalMcpJson(selected.choice)||canonicalMcpJson(prepared.messages)!==canonicalMcpJson(selected.messages))return unavailable()
    const binding=selected.choice.model_binding,row=(await db.query<Model>("SELECT revision,enabled,status,provider,base_url,models FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[binding.connection_id,owner])).rows[0]
    if(!row||number(row.revision)!==binding.connection_revision||!row.enabled||row.status!=="ok"||!models(row.models).includes(binding.model_id))return unavailable()
    exactProviderEndpoint(row);return row
  }
  private async credential(selected:Context,expected:Model):Promise<SelectedModelMaterial>{
    return withModelBrokerActor(this.secretPool,selected.identity,async(db,owner)=>{
      if(owner!==selected.owner_user_id)return unavailable()
      const binding=selected.choice.model_binding,row=(await db.query<Secret>("SELECT revision,enabled,status,provider,base_url,models,api_key_ciphertext,api_key_nonce,api_key_tag FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[binding.connection_id,owner])).rows[0]
      if(!row||!row.enabled||row.status!=="ok"||number(row.revision)!==binding.connection_revision||row.provider!==expected.provider||row.base_url!==expected.base_url||!models(row.models).includes(binding.model_id))return unavailable()
      exactProviderEndpoint(row)
      return {provider:row.provider,base_url:row.base_url,model_id:binding.model_id,api_key:decryptModelSecret({ciphertext:Buffer.from(row.api_key_ciphertext),nonce:Buffer.from(row.api_key_nonce),tag:Buffer.from(row.api_key_tag)},this.key)}
    })
  }
  async dispatch(raw:unknown):Promise<AgentAssessmentReply>{
    if(!this.enabled)throw Error("agent_assessment_execution_disabled")
    const proof=parseAgentAssessmentProof(raw),selected=context(await this.call("context",proof),proof)
    let reserved=false,attempted=false
    try{
      return await withActor(this.businessPool,selected.identity,async(db,owner)=>{
        await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
        const metadata=await this.source(db,owner,selected)
        // Each dispatch transaction is short and has no reverse540 wait.
        // reserve must throw if ANY prior reservation exists, never return a
        // replay-send permission. COMMIT completes before credential().
        const rawReservation=await this.call<unknown>("reserve",proof)
        reserved=true
        const reservation=assessmentObject(rawReservation,["request_id","effect_id","state","request_sha256","input_sha256","content_sha256"])
        if(reservation.request_id!==proof.request_id||!isUuid(reservation.effect_id)||reservation.state!=="reserved"||reservation.request_sha256!==selected.request_sha256||reservation.input_sha256!==selected.input_sha256||reservation.content_sha256!==selected.content_sha256)return unavailable()
        const material=await this.credential(selected,metadata)
        const recheck=async()=>{
          const fresh=context(await this.call("context",proof),proof)
          if(canonicalMcpJson(fresh)!==canonicalMcpJson(selected))return unavailable()
          await this.source(db,owner,selected)
        }
        await recheck()
        const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,text:string
        try{attempted=true;text=await Promise.race([this.execute(material,{messages:selected.messages,output_token_limit:selected.choice.output_token_limit},controller.signal,recheck),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("agent_assessment_provider_unknown"))},30000)})])}
        finally{if(timer)clearTimeout(timer);material.api_key=""}
        const completion=normalizeAgentAssessmentCompletion(selected.purpose,{status:"succeeded",result:JSON.parse(text)})
        if(completion.status!=="succeeded")return unavailable()
        await recheck()
        const result=parseAgentAssessmentReply(await this.call("finish",proof,completion))
        if(result.request_id!==proof.request_id||result.state!=="succeeded"||result.result_sha256!==agentAssessmentOutputHash(proof.request_id,selected.purpose,selected.input_sha256,completion.result))return unavailable()
        return result
      })
    }catch{
      // Reservation survives API rollback, timeout, malformed result and
      // finish acknowledgement loss. No code path retries reserve or POST.
      if(reserved){const failure:AgentAssessmentCompletion={status:attempted?"unknown":"failed",failure_code:attempted?"provider_outcome_unknown":"credential_or_source_unavailable"};try{const result=parseAgentAssessmentReply(await this.call("finish",proof,failure));if(result.request_id===proof.request_id&&result.state!=="succeeded")return result}catch{}}
      throw new HttpError(503,"agent_assessment_outcome_unavailable")
    }
  }
}
