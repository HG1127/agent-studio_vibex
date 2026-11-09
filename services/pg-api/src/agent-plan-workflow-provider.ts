// F05 transport only. Import sends nothing; actual Broker must first reserve
// its own durable effect and recheck actual source immediately before POST.
import {resolve4,resolve6} from 'node:dns/promises'
import {request as httpsRequest,type RequestOptions} from 'node:https'
import {exactProviderEndpoint,resolveSafeProviderAddress,type ProviderResolver} from './model-connection-probe.ts'
import {agentPlanWorkflowExecutionEnabled} from './agent-plan-workflow-runtime-policy.ts'
import {agentPlanWorkflowObject as object,agentPlanWorkflowArray as array,agentPlanWorkflowText as text,agentPlanWorkflowJsonValue,agentPlanWorkflowOutputTokenLimits} from './agent-plan-workflow-contract.ts'
import {parseAgentPlanWorkflowModelJson} from './agent-plan-workflow-result.ts'
export type AgentPlanWorkflowActivation={executionEnabled?:boolean;executionApproval?:string}
export type AgentPlanWorkflowProviderInput={messages:readonly {role:'system'|'user';content:string}[];output_token_limit:4096|8192|16384}
export type AgentPlanWorkflowModelMaterial={provider:'openai'|'anthropic'|'gemini';base_url:string;model_id:string;api_key:string}
const refuse=():never=>{throw Error('agent_plan_workflow_provider_refused')}
/** Bounded strict envelope parser shared by Node transports, not an authority
 * factory. Reject duplicate decoded keys and malformed Unicode before JSONB. */
export function parseAgentPlanWorkflowTransportJson(raw:unknown,max=524288):unknown{
 if(typeof raw!=='string'||!Number.isSafeInteger(max)||max<1||max>524288||Buffer.byteLength(raw)>max||raw.charCodeAt(0)===0xfeff||raw.includes('\0'))return refuse()
 let at=0,count=0
 const space=()=>{while(/[ \r\n\t]/.test(raw[at]??'!'))at++}
 const string=():string=>{const start=at++;while(at<raw.length){const c=raw[at++];if(c==='\\'){at++;continue}if(c==='"'){let v:unknown;try{v=JSON.parse(raw.slice(start,at))}catch{return refuse()}return text(v,max)}}return refuse()}
 const value=(depth:number):unknown=>{
  if(depth>24||++count>15000)return refuse();space();const c=raw[at]
  if(c==='"')return string()
  if(c==='{'){at++;space();const result=Object.create(null) as Record<string,unknown>,seen=new Set<string>();if(raw[at]==='}'){at++;return result}for(;;){space();if(raw[at]!=='"')return refuse();const key=string();if(seen.has(key)||['__proto__','prototype','constructor'].includes(key))return refuse();seen.add(key);space();if(raw[at++]!==':')return refuse();result[key]=value(depth+1);space();if(raw[at]==='}'){at++;return result}if(raw[at++]!==',')return refuse()}}
  if(c==='['){at++;space();const result:unknown[]=[];if(raw[at]===']'){at++;return result}for(;;){if(result.length>=1000)return refuse();result.push(value(depth+1));space();if(raw[at]===']'){at++;return result}if(raw[at++]!==',')return refuse()}}
  for(const [word,v]of [['true',true],['false',false],['null',null]] as const)if(raw.startsWith(word,at)){at+=word.length;return v}
  const m=raw.slice(at).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);if(!m)return refuse();at+=m[0].length;const n=Number(m[0]);if(!Number.isFinite(n)||Object.is(n,-0))return refuse();return n
 }
 const result=value(0);space();if(at!==raw.length)return refuse();return agentPlanWorkflowJsonValue(result)
}
export function prepareAgentPlanWorkflowProviderRequest(rawMaterial:AgentPlanWorkflowModelMaterial,rawInput:AgentPlanWorkflowProviderInput){
 const m=object(rawMaterial,['provider','base_url','model_id','api_key']),input=object(rawInput,['messages','output_token_limit']),endpoint=exactProviderEndpoint(rawMaterial),cap=input.output_token_limit
 if(!agentPlanWorkflowOutputTokenLimits.some(v=>v===cap)||typeof m.api_key!=='string'||m.api_key.length<8||m.api_key.length>4096||/[\s\u0000-\u001f\u007f]/u.test(m.api_key)||typeof m.model_id!=='string'||!/^[A-Za-z0-9._:/-]{1,120}$/.test(m.model_id))return refuse()
 const messages=array(input.messages,2).map((item,index)=>{const v=object(item,['role','content']);if(v.role!==(index===0?'system':'user'))return refuse();return {role:v.role,content:text(v.content,262144,true)}})
 if(messages.length!==2||Buffer.byteLength(JSON.stringify(messages))>262144)return refuse()
 const headers:Record<string,string>={Accept:'application/json','Content-Type':'application/json','User-Agent':'agentstudio-pg18-private-plan-workflow/1'};let path:string,payload:unknown
 if(m.provider==='openai'){path='/v1/chat/completions';headers.Authorization='Bearer '+m.api_key;payload={model:m.model_id,messages,max_completion_tokens:cap,response_format:{type:'json_object'}}}
 else if(m.provider==='anthropic'){path='/v1/messages';headers['x-api-key']=m.api_key;headers['anthropic-version']='2023-06-01';payload={model:m.model_id,system:messages[0]!.content,messages:[messages[1]],max_tokens:cap}}
 else if(m.provider==='gemini'){const model=m.model_id.startsWith('models/')?m.model_id.slice(7):m.model_id;if(!/^[A-Za-z0-9._-]{1,100}$/.test(model))return refuse();path='/v1beta/models/'+model+':generateContent';headers['x-goog-api-key']=m.api_key;payload={systemInstruction:{parts:[{text:messages[0]!.content}]},contents:[{role:'user',parts:[{text:messages[1]!.content}]}],generationConfig:{maxOutputTokens:cap,responseMimeType:'application/json'}}}
 else return refuse()
 const body=Buffer.from(JSON.stringify(payload));if(body.length>524288)return refuse();headers['Content-Length']=String(body.length);return {host:endpoint.host,path,headers,body}
}
export function extractAgentPlanWorkflowProviderText(provider:AgentPlanWorkflowModelMaterial['provider'],raw:unknown):string{
 const v=object(agentPlanWorkflowJsonValue(raw));let result:unknown
 if(provider==='openai'){const choices=array(v.choices,1);if(choices.length!==1)return refuse();const c=object(choices[0]),m=object(c.message);if(c.finish_reason!=='stop'||m.tool_calls!==undefined||m.function_call!==undefined||m.refusal!==undefined&&m.refusal!==null)return refuse();result=m.content}
 else if(provider==='anthropic'){const content=array(v.content,1);if(v.stop_reason!=='end_turn'||content.length!==1)return refuse();const c=object(content[0]);if(c.type!=='text')return refuse();result=c.text}
 else if(provider==='gemini'){const candidates=array(v.candidates,1);if(candidates.length!==1)return refuse();const c=object(candidates[0]),content=object(c.content),parts=array(content.parts,1);if(c.finishReason!=='STOP'||parts.length!==1)return refuse();const p=object(parts[0]);if(p.functionCall!==undefined||p.thought!==undefined)return refuse();result=p.text}
 else return refuse()
 parseAgentPlanWorkflowModelJson(result);return result as string
}
export function createAgentPlanWorkflowProviderExecutor(options:AgentPlanWorkflowActivation={},resolver:ProviderResolver={resolve4,resolve6},request:typeof httpsRequest=httpsRequest){
 if(!agentPlanWorkflowExecutionEnabled(options))throw Error('agent_plan_workflow_provider_disabled')
 return async(material:AgentPlanWorkflowModelMaterial,input:AgentPlanWorkflowProviderInput,signal:AbortSignal,beforePost:()=>Promise<void>):Promise<string>=>{
  if(typeof beforePost!=='function')return refuse();signal.throwIfAborted();const prepared=prepareAgentPlanWorkflowProviderRequest(material,input),address=await resolveSafeProviderAddress(resolver,prepared.host)
  await beforePost();signal.throwIfAborted()
  return new Promise<string>((resolve,reject)=>{
   let settled=false;const chunks:Buffer[]=[]
   const clear=()=>{prepared.body.fill(0);for(const bytes of chunks)bytes.fill(0);for(const key of Object.keys(prepared.headers))prepared.headers[key]=''}
   const fail=()=>{if(!settled){settled=true;clear();reject(Error('agent_plan_workflow_provider_unknown'))}}
   const opts:RequestOptions={protocol:'https:',hostname:prepared.host,servername:prepared.host,port:443,path:prepared.path,method:'POST',headers:prepared.headers,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,family:address.family,lookup:(_host,_opts,callback)=>callback(null,address.address,address.family),signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])}
   try{const req=request(opts,res=>{
    if(settled){res.destroy();return}
    if(res.statusCode!==200||!/^application\/json(?:\s*;|$)/i.test(String(res.headers['content-type']??''))||res.headers['content-encoding']!==undefined&&res.headers['content-encoding']!=='identity'){fail();res.destroy();return}
    let size=0;res.on('data',piece=>{if(settled)return;const bytes=Buffer.from(piece);size+=bytes.length;if(size>524288){fail();res.destroy();return}chunks.push(bytes)})
    res.once('error',fail);res.once('aborted',fail);res.once('end',()=>{if(settled)return;try{const result=extractAgentPlanWorkflowProviderText(material.provider,parseAgentPlanWorkflowTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));settled=true;resolve(result)}catch{fail()}finally{clear()}})
   });req.once('error',fail);req.end(prepared.body)}catch{fail()}
  })
 }
}
