// Dedicated A/B provider port. One bounded POST, exact model and provider usage;
// no tools, streaming, fallback model, retry or generic Agent executor.
import {resolve4,resolve6} from 'node:dns/promises'
import {request as httpsRequest,type RequestOptions} from 'node:https'
import {exactProviderEndpoint,resolveSafeProviderAddress,type ProviderResolver} from './model-connection-probe.ts'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import {roleObject,roleText} from '../../../shared/original-role-execution-contract.mjs'
import {SKILL_AB_OUTPUT_MAX_TOKENS,SKILL_AB_MAX_INSTRUCTION,type SkillAbMessage} from '../../../shared/skill-ab-compare.ts'
export type SkillAbMaterial={provider:'openai'|'anthropic'|'gemini';base_url:string;model_id:string;api_key:string}
export type SkillAbCompletion={model_id:string;text:string;input_tokens:number;output_tokens:number;total_tokens:number;truncated:boolean}
export const skillAbExecutionApproval='APPROVE_DISPOSABLE_PG18_SKILL_AB_EXECUTION_ONLY' as const
export type SkillAbExecutionOptions={executionEnabled?:boolean;executionApproval?:string}
export function skillAbExecutionEnabled(options:SkillAbExecutionOptions):boolean{
 if(options.executionEnabled===undefined||options.executionEnabled===false)return false
 if(options.executionEnabled!==true||options.executionApproval!==skillAbExecutionApproval)throw Error('original_skill_ab_execution_not_approved')
 return true
}
function bad():never{throw Error('original_skill_ab_provider_unconfirmed')}
function tokens(v:unknown):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>10000000)bad();return v}
function one(raw:unknown):Record<string,unknown>{if(!Array.isArray(raw)||raw.length!==1||Reflect.ownKeys(raw).length!==2)bad();const d=Object.getOwnPropertyDescriptor(raw,'0');if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();return object(d.value)}
function object(raw:unknown):Record<string,unknown>{if(!raw||typeof raw!=='object'||Array.isArray(raw))bad();return roleObject(raw,[],Object.keys(raw))}
export function prepareSkillAbProviderRequest(material:SkillAbMaterial,messages:SkillAbMessage[]){
 const endpoint=exactProviderEndpoint(material)
 if(typeof material.api_key!=='string'||material.api_key.length<8||material.api_key.length>4096||/[\s\u0000-\u001f\u007f]/u.test(material.api_key)||typeof material.model_id!=='string'||!/^[A-Za-z0-9._:/-]{1,120}$/.test(material.model_id))bad()
 if(!Array.isArray(messages)||messages.length!==2||Reflect.ownKeys(messages).length!==3)bad()
 const safe=Array.from({length:2},(_,i)=>{const d=Object.getOwnPropertyDescriptor(messages,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();const m=roleObject(d.value,['role','content']);if(m.role!==(i===0?'system':'user'))bad();return {role:m.role,content:roleText(m.content,SKILL_AB_MAX_INSTRUCTION,true)}})
 const headers:Record<string,string>={Accept:'application/json','Content-Type':'application/json','User-Agent':'agentstudio-private-skill-ab/1'}
 let path:string,payload:unknown
 if(material.provider==='openai'){
  path='/v1/chat/completions';headers.Authorization='Bearer '+material.api_key
  payload={model:material.model_id,messages:safe,max_completion_tokens:SKILL_AB_OUTPUT_MAX_TOKENS}
 }else if(material.provider==='anthropic'){
  path='/v1/messages';headers['x-api-key']=material.api_key;headers['anthropic-version']='2023-06-01'
  payload={model:material.model_id,system:safe[0]!.content,messages:[safe[1]],max_tokens:SKILL_AB_OUTPUT_MAX_TOKENS}
 }else{
  const model=material.model_id.replace(/^models\//,'');if(!/^[A-Za-z0-9._-]{1,100}$/.test(model))bad()
  path='/v1beta/models/'+model+':generateContent';headers['x-goog-api-key']=material.api_key
  payload={systemInstruction:{parts:[{text:safe[0]!.content}]},contents:[{role:'user',parts:[{text:safe[1]!.content}]}],generationConfig:{maxOutputTokens:SKILL_AB_OUTPUT_MAX_TOKENS}}
 }
 const body=Buffer.from(JSON.stringify(payload));if(body.length>131072)bad();headers['Content-Length']=String(body.length)
 return {host:endpoint.host,path,headers,body}
}
export function extractSkillAbCompletion(provider:SkillAbMaterial['provider'],modelId:string,raw:unknown):SkillAbCompletion{
 const v=object(raw);let text:unknown,input:number,output:number,total:number,truncated:boolean
 if(provider==='openai'){
  if(v.model!==modelId)bad();const c=one(v.choices),m=object(c.message),u=object(v.usage)
  if(!['stop','length'].includes(String(c.finish_reason))||m.tool_calls!==undefined||m.function_call!==undefined||m.refusal!==undefined&&m.refusal!==null)bad()
  text=m.content;input=tokens(u.prompt_tokens);output=tokens(u.completion_tokens);total=tokens(u.total_tokens);if(total!==input+output)bad();truncated=c.finish_reason==='length'
 }else if(provider==='anthropic'){
  if(v.model!==modelId||!['end_turn','max_tokens'].includes(String(v.stop_reason)))bad();const c=one(v.content),u=object(v.usage);if(c.type!=='text')bad()
  text=c.text;input=tokens(u.input_tokens)+(u.cache_creation_input_tokens===undefined?0:tokens(u.cache_creation_input_tokens))+(u.cache_read_input_tokens===undefined?0:tokens(u.cache_read_input_tokens));output=tokens(u.output_tokens);total=input+output;truncated=v.stop_reason==='max_tokens'
 }else if(provider==='gemini'){
  if(typeof v.modelVersion!=='string'||v.modelVersion.replace(/^models\//,'')!==modelId.replace(/^models\//,''))bad()
  const c=one(v.candidates),m=object(c.content),p=one(m.parts),u=object(v.usageMetadata)
  if(!['STOP','MAX_TOKENS'].includes(String(c.finishReason))||p.functionCall!==undefined||p.thought!==undefined||m.role!==undefined&&m.role!=='model')bad()
  text=p.text;input=tokens(u.promptTokenCount);output=tokens(u.candidatesTokenCount)+(u.thoughtsTokenCount===undefined?0:tokens(u.thoughtsTokenCount));total=tokens(u.totalTokenCount);if(total!==input+output)bad();truncated=c.finishReason==='MAX_TOKENS'
 }else return bad()
 if(input>10000000||total>10000000||output>900)bad()
 return {model_id:modelId,text:roleText(text,12000,true),input_tokens:input,output_tokens:output,total_tokens:total,truncated}
}
export function createSkillAbProviderExecutor(options:SkillAbExecutionOptions={},resolver:ProviderResolver={resolve4,resolve6},request:typeof httpsRequest=httpsRequest){
 if(!skillAbExecutionEnabled(options))throw Error('original_skill_ab_provider_disabled')
 return async(material:SkillAbMaterial,messages:SkillAbMessage[],signal:AbortSignal,beforePost:()=>Promise<void>):Promise<SkillAbCompletion>=>{
  signal.throwIfAborted();const prepared=prepareSkillAbProviderRequest(material,messages)
  try{
   const address=await resolveSafeProviderAddress(resolver,prepared.host)
   // The real Broker's committed one-use reservation is the final check.
   await beforePost();signal.throwIfAborted()
   return await new Promise<SkillAbCompletion>((resolve,reject)=>{
    let settled=false;const fail=()=>{if(!settled){settled=true;reject(Error('original_skill_ab_provider_outcome_unknown'))}}
    const opts:RequestOptions={protocol:'https:',hostname:prepared.host,servername:prepared.host,port:443,path:prepared.path,method:'POST',headers:prepared.headers,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,family:address.family,lookup:(_host,_opts,cb)=>cb(null,address.address,address.family),signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])}
    try{const req=request(opts,res=>{
     if(res.statusCode!==200||!/^application\/json(?:\s*;|$)/i.test(String(res.headers['content-type']??''))||res.headers['content-encoding']!==undefined&&res.headers['content-encoding']!=='identity'){fail();res.destroy();return}
     const declared=res.headers['content-length'];if(declared!==undefined&&(typeof declared!=='string'||!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>524288)){fail();res.destroy();return}
     let size=0;const chunks:Buffer[]=[]
     res.on('data',piece=>{if(settled)return;const b=Buffer.isBuffer(piece)?piece:Buffer.from(piece);size+=b.length;if(size>524288){fail();res.destroy();return}chunks.push(b)})
     res.once('error',fail);res.once('aborted',fail)
     res.once('end',()=>{if(settled)return;try{if(declared!==undefined&&Number(declared)!==size)bad();const raw=parseLocalTransportJson(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(chunks)),524288),completion=extractSkillAbCompletion(material.provider,material.model_id,raw);settled=true;resolve(completion)}catch{fail()}finally{for(const b of chunks)b.fill(0)}})
    });req.once('error',fail);req.end(prepared.body)}catch{fail()}
   })
  }finally{prepared.body.fill(0)}
 }
}
