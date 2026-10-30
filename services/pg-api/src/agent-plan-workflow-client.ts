// Private one-shot F05 Worker -> Broker mTLS. No default endpoint, listener,
// service entry or telemetry slot. Root must supply reviewed loopback config.
import {request as httpsRequest} from 'node:https'
import {checkServerIdentity} from 'node:tls'
import {timingSafeEqual} from 'node:crypto'
import type {ClientRequest,IncomingMessage,ServerResponse} from 'node:http'
import {boundCertificateFingerprint,verifyBoundWorkerMutualTlsPeer} from './bound-worker-mtls.ts'
import {agentPlanWorkflowExecutionEnabled,agentPlanWorkflowPrivateRoute as route,agentPlanWorkflowPrivateRequestBytes as requestBytes,agentPlanWorkflowPrivateReplyBytes as replyBytes} from './agent-plan-workflow-runtime-policy.ts'
import {parseAgentPlanWorkflowDispatchProof,parseAgentPlanWorkflowDispatchReply,type AgentPlanWorkflowDispatchProof} from './agent-plan-workflow-rpc-contract.ts'
import {parseAgentPlanWorkflowTransportJson,type AgentPlanWorkflowActivation} from './agent-plan-workflow-provider.ts'
type Reply=ReturnType<typeof parseAgentPlanWorkflowDispatchReply>
export type AgentPlanWorkflowClientConfig=AgentPlanWorkflowActivation&{reviewedOrigin:string;reviewedServerFingerprint256:string;ca:Buffer;cert:Buffer;key:Buffer}
export type AgentPlanWorkflowMutualTlsClient=((proof:AgentPlanWorkflowDispatchProof)=>Promise<Reply>)&{readonly close:()=>void}
export function createAgentPlanWorkflowMutualTlsClient(config:AgentPlanWorkflowClientConfig,request:typeof httpsRequest=httpsRequest):AgentPlanWorkflowMutualTlsClient{
 if(!agentPlanWorkflowExecutionEnabled(config))throw Error('agent_plan_workflow_client_disabled')
 let origin:URL,pin:Buffer
 try{origin=new URL(config.reviewedOrigin);pin=boundCertificateFingerprint(config.reviewedServerFingerprint256)}catch{throw Error('agent_plan_workflow_client_configuration_refused')}
 const port=Number(origin.port)
 if(origin.origin!==config.reviewedOrigin||origin.protocol!=='https:'||origin.hostname!=='127.0.0.1'||origin.username||origin.password||!Number.isInteger(port)||port<1024||port>65535||[5333,5432].includes(port)||[config.ca,config.cert,config.key].some(v=>!Buffer.isBuffer(v)||!v.length||v.length>65536))throw Error('agent_plan_workflow_client_configuration_refused')
 const credentials={ca:Buffer.from(config.ca),cert:Buffer.from(config.cert),key:Buffer.from(config.key)},pending=new Set<()=>void>();let closed=false
 const close=()=>{if(closed)return;closed=true;try{for(const abort of [...pending])abort()}finally{for(const bytes of Object.values(credentials))bytes.fill(0)}}
 const send=async(raw:AgentPlanWorkflowDispatchProof):Promise<Reply>=>{
  if(closed)throw Error('agent_plan_workflow_client_closed')
  const proof=parseAgentPlanWorkflowDispatchProof(raw),body=Buffer.from(JSON.stringify(proof));if(body.length>requestBytes)throw Error('agent_plan_workflow_private_payload_refused')
  return new Promise((resolve,reject)=>{
   let settled=false,req:ClientRequest|undefined,res:IncomingMessage|undefined
   const chunks:Buffer[]=[]
   const destroy=()=>{try{req?.destroy()}catch{};try{res?.destroy()}catch{}}
   const clear=()=>{for(const b of chunks)b.fill(0)}
   const fail=()=>{if(settled)return;settled=true;pending.delete(abort);clear();reject(Error('agent_plan_workflow_transport_unknown'));destroy()}
   const abort=()=>fail();pending.add(abort)
   try{
    req=request({protocol:'https:',hostname:'127.0.0.1',port,servername:'localhost',path:route,method:'POST',...credentials,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(55000),
     checkServerIdentity(host,certificate){const error=checkServerIdentity(host,certificate);if(error)return error;try{if(timingSafeEqual(pin,boundCertificateFingerprint(certificate.fingerprint256)))return undefined}catch{};return Error('agent_plan_workflow_server_certificate_refused')},
     headers:{'Content-Type':'application/json',Accept:'application/json','Content-Length':String(body.length)}},response=>{
      res=response;res.once('error',fail);res.once('aborted',fail)
      if(settled||closed){res.destroy();return}
      if(res.statusCode!==200||!/^application\/json(?:\s*;|$)/i.test(String(res.headers['content-type']??''))||res.headers['content-encoding']!==undefined&&res.headers['content-encoding']!=='identity'){fail();return}
      let size=0;res.on('data',piece=>{if(settled)return;const bytes=Buffer.from(piece);size+=bytes.length;if(size>replyBytes){fail();return}chunks.push(bytes)})
      res.once('end',()=>{if(settled)return;try{const reply=parseAgentPlanWorkflowDispatchReply(parseAgentPlanWorkflowTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),replyBytes));if(reply.request_id!==proof.request_id)throw Error();settled=true;pending.delete(abort);resolve(reply)}catch{fail()}finally{clear()}})
     })
    req.once('error',fail);if(closed||settled){destroy();return}req.end(body)
   }catch{fail()}
  })
 }
 return Object.defineProperty(send,'close',{value:close}) as AgentPlanWorkflowMutualTlsClient
}
function respond(res:ServerResponse,status:number,value:unknown){if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});res.end(JSON.stringify(value))}
export function createAgentPlanWorkflowInternalHandler(config:AgentPlanWorkflowActivation&{reviewedClientFingerprint256:string;dispatch:(proof:AgentPlanWorkflowDispatchProof)=>Promise<Reply>}):(req:IncomingMessage,res:ServerResponse)=>Promise<void>{
 if(!agentPlanWorkflowExecutionEnabled(config)||typeof config.dispatch!=='function')throw Error('agent_plan_workflow_handler_disabled')
 const pin=boundCertificateFingerprint(config.reviewedClientFingerprint256).toString('hex'),dispatch=config.dispatch
 return async(req,res)=>{
  try{verifyBoundWorkerMutualTlsPeer(req.socket,pin)}catch{respond(res,403,{error:'agent_plan_workflow_denied'});return}
  if(req.method!=='POST'||req.url!==route||['cookie','authorization','x-rh-user-id','x-forwarded-client-cert'].some(k=>req.headers[k]!==undefined)){respond(res,404,{error:'agent_plan_workflow_route_not_found'});return}
  if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??''))||req.headers['content-encoding']!==undefined||req.headers['transfer-encoding']!==undefined){respond(res,415,{error:'agent_plan_workflow_unsupported_media'});return}
  const rawLength=req.headers['content-length'];if(typeof rawLength!=='string'||!/^[1-9][0-9]*$/.test(rawLength)||!Number.isSafeInteger(Number(rawLength))||Number(rawLength)>requestBytes){respond(res,413,{error:'agent_plan_workflow_invalid_size'});return}
  const length=Number(rawLength),timer=setTimeout(()=>req.destroy(Error('agent_plan_workflow_read_timeout')),5000);let proof:AgentPlanWorkflowDispatchProof
  try{let bytes=0;const chunks:Buffer[]=[];for await(const piece of req){const b=Buffer.from(piece);bytes+=b.length;if(bytes>length||bytes>requestBytes)throw Error();chunks.push(b)}if(bytes!==length)throw Error();proof=parseAgentPlanWorkflowDispatchProof(parseAgentPlanWorkflowTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),requestBytes))}
  catch{respond(res,400,{error:'agent_plan_workflow_invalid_payload'});return}finally{clearTimeout(timer)}
  try{const reply=parseAgentPlanWorkflowDispatchReply(await dispatch(proof));if(reply.request_id!==proof.request_id||Buffer.byteLength(JSON.stringify(reply))>replyBytes)throw Error();respond(res,200,reply)}catch{respond(res,503,{error:'agent_plan_workflow_outcome_unavailable'})}
 }
}
