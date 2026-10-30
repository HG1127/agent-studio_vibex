// Composable Native-cookie F05 API. Import mounts nothing. Exact Root HTTP ABI;
// no employee identity/permission/credential object can be supplied by a body.
import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {AgentPlanWorkflowAcknowledgementUnknown,type AgentPlanWorkflowLedgerRepository} from './agent-plan-workflow-ledger.ts'
import {requireAgentPlanWorkflowNative,agentPlanWorkflowHash as hash} from './agent-plan-workflow-source.ts'
import {agentPlanWorkflowPurpose as purpose,agentPlanWorkflowObject as object,agentPlanWorkflowId as id,agentPlanWorkflowText as text,canonicalAgentPlanWorkflowValue as canonical,parseAgentPlanWorkflowSource,parseAgentPlanWorkflowModel,parseAgentPlanWorkflowChoice,parseAgentPlanWorkflowSubmission,parseAgentPlanWorkflowSaveIntent,agentPlanWorkflowPaidIntentValue,agentPlanWorkflowSaveIntentValue} from './agent-plan-workflow-contract.ts'
import {prepareAgentPlanWorkflowInput} from './agent-plan-workflow-result.ts'
import {parseAgentPlanWorkflowPrepared,parseAgentPlanWorkflowReceipt,parseAgentPlanWorkflowView,parseAgentPlanWorkflowControl,parseAgentPlanWorkflowControlReceipt,parseAgentPlanWorkflowSavePreviewInput,parseAgentPlanWorkflowSavePreview,parseAgentPlanWorkflowSaveReceipt} from './agent-plan-workflow-rpc-contract.ts'
import {parseAgentPlanWorkflowTransportJson} from './agent-plan-workflow-provider.ts'
export const agentPlanWorkflowHttpBase='/api/v2/agent-plan-workflow' as const
type Repository=Pick<AgentPlanWorkflowLedgerRepository,'preview'|'submit'|'confirm'|'view'|'control'|'previewSave'|'save'>&{source:Pick<AgentPlanWorkflowLedgerRepository['source'],'reference'>}
type Dependencies={repository:Repository;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string;available?:boolean}
const invalid=():never=>{throw new HttpError(400,'invalid_agent_plan_workflow_request')}
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b)
const input=<T>(fn:()=>T):T=>{try{return fn()}catch{return invalid()}}
function response(res:ServerResponse,status:number,value:unknown,allow?:string){
 if(res.destroyed||res.writableEnded)return
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Pragma:'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin',...(allow?{Allow:allow}:{})});res.end(JSON.stringify(value))
}
function projection<T>(fn:()=>T):T{try{const value=fn();if(Buffer.byteLength(JSON.stringify(value))>524288)throw Error();return value}catch{throw Error('agent_plan_workflow_uncertain_response')}}
async function body(req:IncomingMessage,max:number){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??''))||req.headers['content-encoding']!==undefined)throw new HttpError(415,'json_content_type_required')
 const length=req.headers['content-length'],transfer=req.headers['transfer-encoding']
 if(length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)))return invalid()
 if(length!==undefined&&(!Number.isSafeInteger(Number(length))||Number(length)>max))throw new HttpError(413,'request_too_large')
 if(transfer!==undefined&&(transfer!=='chunked'||length!==undefined))return invalid()
 const timer=setTimeout(()=>req.destroy(Error('agent_plan_workflow_read_timeout')),5000)
 try{const chunks:Buffer[]=[];let bytes=0;for await(const piece of req){const b=Buffer.from(piece);bytes+=b.length;if(bytes>max)throw new HttpError(413,'request_too_large');chunks.push(b)}if(length!==undefined&&Number(length)!==bytes)return invalid();return input(()=>parseAgentPlanWorkflowTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),max))}finally{clearTimeout(timer)}
}
async function empty(req:IncomingMessage){if(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')return invalid();for await(const piece of req)if(Buffer.byteLength(piece)>0)return invalid()}
function sourceSelection(raw:unknown){const v=object(raw,['purpose','spec_id','generation_model']);if(v.purpose!==purpose)return invalid();return {purpose,spec_id:id(v.spec_id),generation_model:parseAgentPlanWorkflowModel(v.generation_model)}}
function sourceReference(raw:unknown){const v=object(raw,['protocol','purpose','source','name','generation_model','recorded']);if(v.protocol!=='agent_plan_workflow_source_v1'||v.purpose!==purpose||v.recorded!==false)throw Error();return {protocol:'agent_plan_workflow_source_v1' as const,purpose,source:parseAgentPlanWorkflowSource(v.source),name:text(v.name,120,true),generation_model:parseAgentPlanWorkflowModel(v.generation_model),recorded:false as const}}
export function createAgentPlanWorkflowHttpHandler({repository:r,authenticateRequest,allowedOrigin,available=false}:Dependencies){
 if(!r||typeof authenticateRequest!=='function'||typeof available!=='boolean')throw Error('agent_plan_workflow_http_dependencies_required')
 verifyNativeOrigin({headers:{}} as IncomingMessage,allowedOrigin,false)
 async function authenticate(req:IncomingMessage):Promise<Identity>{
  let verified:Identity
  try{verified=await authenticateRequest(req)}catch(error){if(error instanceof Error&&Object.getOwnPropertyDescriptor(error,'status')?.value===401&&['session_required','native_cookie_only'].includes(error.message))throw new HttpError(401,'session_required');throw error}
  requireAgentPlanWorkflowNative(verified)
  return {issuer:verified.issuer,subject:verified.subject}
 }
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const raw=req.url??'',prefix=(v:string)=>v===agentPlanWorkflowHttpBase||v.startsWith(agentPlanWorkflowHttpBase+'/');let path='',decoded=''
  try{path=new URL(raw,'http://127.0.0.1').pathname;decoded=decodeURIComponent(path)}catch{}
  if(![raw.split(/[?#]/,1)[0]??'',path,decoded].some(prefix))return false
  if(!available){response(res,404,{error:'agent_plan_workflow_unavailable'});return true}
  let allow:string|undefined,verifyCurrent:(()=>Promise<void>)|undefined
  try{
   try{verifyNativeOrigin(req,allowedOrigin,req.method!=='GET')}catch{throw new HttpError(403,'native_request_origin_denied')}
   if(req.headers.authorization!==undefined||!nativeSessionToken(req))throw new HttpError(401,'session_required')
   if(['x-rh-user-id','x_rh_user_id','x-rh-user_id'].some(key=>req.headers[key]!==undefined))throw new HttpError(403,'native_employee_identity_required')
   if(raw!==path||raw.includes('%'))return invalid()
   const action=/^\/api\/v2\/agent-plan-workflow\/(source|preview|requests|confirm|control|control\/confirm|preview-save|save|save\/confirm)$/.exec(path),item=/^\/api\/v2\/agent-plan-workflow\/requests\/([a-f0-9-]{36})$/.exec(path)
   if(!action&&!item)return invalid();allow=item?'GET':'POST';if(req.method!==allow)throw new HttpError(405,'method_not_allowed')
   const identity=await authenticate(req)
   verifyCurrent=async()=>{const current=await authenticate(req);if(current.issuer!==identity.issuer||current.subject!==identity.subject)throw new HttpError(401,'session_required')}
   if(item){await empty(req);const requestId=input(()=>id(item[1])),value=await r.view(identity,requestId),output=projection(()=>{const v=parseAgentPlanWorkflowView(value);if(v.receipt.request_id!==requestId||v.result&&hash(v.result.value)!==v.result.result_sha256)throw Error();return v});await verifyCurrent();response(res,200,output);return true}
   const name=action![1]!,rawBody=await body(req,['preview-save','save'].includes(name)?524288:32768);let value:unknown,decode:()=>unknown
   if(name==='source'){const selected=input(()=>sourceSelection(rawBody));value=await r.source.reference(identity,selected);decode=()=>{const v=sourceReference(value);if(v.source.spec_id!==selected.spec_id||!same(v.generation_model,selected.generation_model))throw Error();return v}}
   else if(name==='preview'){const selected=input(()=>parseAgentPlanWorkflowChoice(rawBody));value=await r.preview(identity,selected);decode=()=>{const v=parseAgentPlanWorkflowPrepared(value),p=prepareAgentPlanWorkflowInput(v.choice,v.source_values);if(!same(v.choice,selected)||v.input_sha256!==hash(p.input_value)||v.content_sha256!==hash(p.content_value))throw Error();return v}}
   else if(name==='requests'||name==='confirm'){const intent=input(()=>parseAgentPlanWorkflowSubmission(rawBody));value=await r[name==='requests'?'submit':'confirm'](identity,intent);decode=()=>{const v=parseAgentPlanWorkflowReceipt(value);if(v.request_id!==intent.request_id||v.request_sha256!==hash(agentPlanWorkflowPaidIntentValue(intent))||v.input_sha256!==intent.expected_input_sha256||!same(v.source,intent.source)||!same(v.generation_model,intent.generation_model)||v.output_token_limit!==intent.output_token_limit||name==='confirm'&&!v.replayed)throw Error();return v}}
   else if(name==='control'||name==='control/confirm'){const intent=input(()=>parseAgentPlanWorkflowControl(rawBody));value=await r.control(identity,intent,name==='control/confirm');decode=()=>{const v=parseAgentPlanWorkflowControlReceipt(value);if(v.request_id!==intent.request_id||v.generation_request_id!==intent.generation_request_id||v.action!==intent.action||v.request_sha256!==hash({protocol:'agent_plan_workflow_control_intent_v1',purpose,intent,authority:false})||name==='control/confirm'&&!v.replayed)throw Error();return v}}
   else if(name==='preview-save'){const selected=input(()=>parseAgentPlanWorkflowSavePreviewInput(rawBody));value=await r.previewSave(identity,selected);decode=()=>{const v=parseAgentPlanWorkflowSavePreview(value),binding={generation_request_id:v.generation_request_id,purpose,source:v.source,input_sha256:v.input_sha256,result_sha256:v.result_sha256,model_versions_sha256:v.model_versions_sha256,candidate_sha256:v.candidate_sha256};if(v.generation_request_id!==selected.generation_request_id||v.result_sha256!==selected.expected_result_sha256||selected.edits&&!same(selected.edits,v.candidate)||v.candidate_sha256!==hash({protocol:'agent_plan_workflow_candidate_v1',purpose,source:v.source,...v.candidate})||v.preview_sha256!==hash({protocol:'agent_plan_workflow_save_preview_binding_v1',...binding}))throw Error();return v}}
   else{const wrapper=input(()=>object(rawBody,name==='save'?['intent','preview_input']:['intent'])),intent=input(()=>parseAgentPlanWorkflowSaveIntent(wrapper.intent)),preview=name==='save'?input(()=>parseAgentPlanWorkflowSavePreviewInput(wrapper.preview_input)):undefined;value=await r.save(identity,intent,preview,name==='save/confirm');decode=()=>{const v=parseAgentPlanWorkflowSaveReceipt(value);if(v.request_id!==intent.request_id||v.generation_request_id!==intent.generation_request_id||!same(v.source,intent.source)||v.request_sha256!==hash(agentPlanWorkflowSaveIntentValue(intent))||v.result_sha256!==intent.expected_result_sha256||v.preview_sha256!==intent.expected_preview_sha256||v.candidate_sha256!==intent.expected_candidate_sha256||name==='save/confirm'&&!v.replayed)throw Error();return v}}
   const output=projection(decode);await verifyCurrent();response(res,200,output)
  }catch(error){
   if(verifyCurrent)try{await verifyCurrent()}catch(authError){const denied=authError instanceof HttpError&&[401,403].includes(authError.status);response(res,denied?authError.status:500,{error:denied?authError.code:'internal_error'},allow);return true}
   if(error instanceof AgentPlanWorkflowAcknowledgementUnknown){response(res,503,{error:error.code,request_id:error.request_id,retry_allowed:false},allow);return true}
   const known=error instanceof HttpError&&/^(?:agent_plan_workflow_[a-z_]+|invalid_agent_plan_workflow_request|native_employee_identity_required|native_request_origin_denied|session_required|method_not_allowed|request_too_large|json_content_type_required|agent_spec_not_found)$/.test(error.code)
   response(res,known?error.status:500,{error:known?error.code:'internal_error'},allow)
  }
  return true
 }
}
