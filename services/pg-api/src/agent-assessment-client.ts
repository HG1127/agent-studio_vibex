// One-shot review Worker -> private Broker mTLS. Import starts no listener.
import {request as httpsRequest} from "node:https"
import {checkServerIdentity} from "node:tls"
import {timingSafeEqual} from "node:crypto"
import type {ClientRequest,IncomingMessage,ServerResponse} from "node:http"
import {boundCertificateFingerprint,verifyBoundWorkerMutualTlsPeer} from "./bound-worker-mtls.ts"
import {agentAssessmentExecutionEnabled,agentAssessmentRoute,agentAssessmentMaxRequestBytes,agentAssessmentMaxReplyBytes,parseAgentAssessmentProof,parseAgentAssessmentReply,type AgentAssessmentActivation,type AgentAssessmentProof,type AgentAssessmentReply} from "./agent-assessment-contract.ts"

export type AgentAssessmentClientConfig=AgentAssessmentActivation&{origin:string;reviewedServerFingerprint256:string;ca:Buffer;cert:Buffer;key:Buffer}
export type AgentAssessmentMutualTlsClient=((proof:AgentAssessmentProof)=>Promise<AgentAssessmentReply>)&{readonly close:()=>void}
export function createAgentAssessmentMutualTlsClient(config:AgentAssessmentClientConfig,request:typeof httpsRequest=httpsRequest):AgentAssessmentMutualTlsClient{
  if(!agentAssessmentExecutionEnabled(config))throw Error("agent_assessment_client_disabled")
  let origin:URL,pin:Buffer
  try{origin=new URL(config.origin);pin=boundCertificateFingerprint(config.reviewedServerFingerprint256)}catch{throw Error("agent_assessment_client_disabled")}
  if(origin.origin!==config.origin||origin.protocol!=="https:"||origin.hostname!=="127.0.0.1"||origin.username||origin.password||!origin.port||Number(origin.port)<1024||Number(origin.port)>65535||
    [config.ca,config.cert,config.key].some(v=>!Buffer.isBuffer(v)||v.length===0||v.length>65536))throw Error("agent_assessment_client_disabled")
  const port=Number(origin.port),credentials={ca:Buffer.from(config.ca),cert:Buffer.from(config.cert),key:Buffer.from(config.key)}
  let closed=false
  const pending=new Set<()=>void>()
  const close=()=>{
    if(closed)return
    closed=true
    // Aborting an RPC does not assert a provider outcome or permit resend.
    // Erase only our copies; the caller retains ownership of its buffers.
    try{for(const abort of [...pending])abort()}finally{for(const bytes of Object.values(credentials))bytes.fill(0)}
  }
  const send=async(raw:AgentAssessmentProof):Promise<AgentAssessmentReply>=>{
    if(closed)throw Error("agent_assessment_client_closed")
    const proof=parseAgentAssessmentProof(raw),body=Buffer.from(JSON.stringify(proof))
    if(body.length>agentAssessmentMaxRequestBytes)throw Error("invalid_agent_assessment_contract")
    return new Promise((resolve,reject)=>{
      let settled=false,req:ClientRequest|undefined,response:IncomingMessage|undefined
      const destroy=()=>{try{req?.destroy()}catch{};try{response?.destroy()}catch{}}
      const fail=()=>{if(!settled){settled=true;pending.delete(abort);reject(Error("agent_assessment_transport_unknown"));destroy()}}
      const abort=()=>fail()
      pending.add(abort)
      try{
        req=request({protocol:"https:",hostname:"127.0.0.1",port,servername:"localhost",path:agentAssessmentRoute,method:"POST",...credentials,rejectUnauthorized:true,minVersion:"TLSv1.2",agent:false,
          signal:AbortSignal.timeout(55000),checkServerIdentity(host,cert){const error=checkServerIdentity(host,cert);if(error)return error;try{if(timingSafeEqual(pin,boundCertificateFingerprint(cert.fingerprint256)))return undefined}catch{};return Error("agent_assessment_server_certificate_refused")},
          headers:{"Content-Type":"application/json",Accept:"application/json","Content-Length":String(body.length)}},res=>{
          response=res;res.once("aborted",fail);res.once("error",fail)
          if(closed||settled){res.destroy();return}
          if(res.statusCode!==200||!/^application\/json(?:\s*;|$)/i.test(String(res.headers["content-type"]??""))||res.headers["content-encoding"]!==undefined&&res.headers["content-encoding"]!=="identity"){fail();return}
          const chunks:Buffer[]=[];let size=0
          res.on("data",piece=>{if(settled)return;const bytes=Buffer.isBuffer(piece)?piece:Buffer.from(piece);size+=bytes.length;if(size>agentAssessmentMaxReplyBytes){fail();return}chunks.push(bytes)})
          res.once("end",()=>{if(settled)return;try{const reply=parseAgentAssessmentReply(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))));if(reply.request_id!==proof.request_id)throw Error();settled=true;pending.delete(abort);resolve(reply)}catch{fail()}})
        })
        req.once("error",fail)
        if(closed||settled){destroy();return}
        req.end(body)
      }catch{fail()}
    })
  }
  return Object.defineProperty(send,"close",{value:close}) as AgentAssessmentMutualTlsClient
}
function reply(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"});res.end(JSON.stringify(body))}
export function createAgentAssessmentInternalHandler(config:AgentAssessmentActivation&{reviewedClientFingerprint256:string;dispatch:(proof:AgentAssessmentProof)=>Promise<AgentAssessmentReply>}):(req:IncomingMessage,res:ServerResponse)=>Promise<void>{
  if(!agentAssessmentExecutionEnabled(config)||typeof config.dispatch!=="function")throw Error("agent_assessment_handler_disabled")
  const pin=boundCertificateFingerprint(config.reviewedClientFingerprint256).toString("hex"),dispatch=config.dispatch
  return async(req,res)=>{
    try{verifyBoundWorkerMutualTlsPeer(req.socket,pin)}catch{reply(res,403,{error:"agent_assessment_denied"});return}
    if(req.method!=="POST"||req.url!==agentAssessmentRoute||["cookie","authorization","x-rh-user-id","x-forwarded-client-cert"].some(k=>req.headers[k]!==undefined)){reply(res,404,{error:"agent_assessment_route_not_found"});return}
    if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers["content-type"]??""))||req.headers["content-encoding"]!==undefined||req.headers["transfer-encoding"]!==undefined){reply(res,415,{error:"agent_assessment_unsupported_media"});return}
    const length=Number(req.headers["content-length"])
    if(!Number.isSafeInteger(length)||length<1||length>agentAssessmentMaxRequestBytes){reply(res,413,{error:"agent_assessment_invalid_size"});return}
    let proof:AgentAssessmentProof
    // Bound streaming time even if a mutually authenticated peer stalls.
    const timer=setTimeout(()=>req.destroy(Error("agent_assessment_read_timeout")),5000)
    try{const chunks:Buffer[]=[];let size=0;for await(const piece of req){const bytes=Buffer.isBuffer(piece)?piece:Buffer.from(piece);size+=bytes.length;if(size>length||size>agentAssessmentMaxRequestBytes)throw Error();chunks.push(bytes)}if(size!==length)throw Error();proof=parseAgentAssessmentProof(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))))}
    catch{reply(res,400,{error:"agent_assessment_invalid_payload"});return}finally{clearTimeout(timer)}
    try{const result=parseAgentAssessmentReply(await dispatch(proof));if(result.request_id!==proof.request_id)throw Error();reply(res,200,result)}catch{reply(res,503,{error:"agent_assessment_outcome_unavailable"})}
  }
}
