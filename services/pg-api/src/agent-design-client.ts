// One-shot design Worker -> private Broker mTLS. Import starts no listener.
import {request as httpsRequest} from "node:https"
import {checkServerIdentity} from "node:tls"
import {timingSafeEqual} from "node:crypto"
import type {ClientRequest,IncomingMessage,ServerResponse} from "node:http"
import {boundCertificateFingerprint,verifyBoundWorkerMutualTlsPeer} from "./bound-worker-mtls.ts"
import {agentDesignExecutionEnabled,agentDesignPrivateRoute as agentDesignRoute,agentDesignPrivateRequestBytes as agentDesignMaxRequestBytes,agentDesignPrivateReplyBytes as agentDesignMaxReplyBytes,type AgentDesignActivation} from "./agent-design-runtime-policy.ts"
import {parseAgentDesignProof,parseAgentDesignReply,type AgentDesignProof,type AgentDesignReply} from "./agent-design-rpc-contract.ts"
import {parseAgentDesignTransportJson} from "./agent-design-value-contract.ts"

export type AgentDesignClientConfig=AgentDesignActivation&{origin:string;reviewedServerFingerprint256:string;ca:Buffer;cert:Buffer;key:Buffer}
export type AgentDesignMutualTlsClient=((proof:AgentDesignProof)=>Promise<AgentDesignReply>)&{readonly close:()=>void}
export function createAgentDesignMutualTlsClient(config:AgentDesignClientConfig,request:typeof httpsRequest=httpsRequest):AgentDesignMutualTlsClient{
  if(!agentDesignExecutionEnabled(config))throw Error("agent_design_client_disabled")
  let origin:URL,pin:Buffer
  try{origin=new URL(config.origin);pin=boundCertificateFingerprint(config.reviewedServerFingerprint256)}catch{throw Error("agent_design_client_disabled")}
  if(origin.origin!==config.origin||origin.protocol!=="https:"||origin.hostname!=="127.0.0.1"||origin.username||origin.password||origin.port!=="7459"||
    [config.ca,config.cert,config.key].some(v=>!Buffer.isBuffer(v)||v.length===0||v.length>65536))throw Error("agent_design_client_disabled")
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
  const send=async(raw:AgentDesignProof):Promise<AgentDesignReply>=>{
    if(closed)throw Error("agent_design_client_closed")
    const proof=parseAgentDesignProof(raw),body=Buffer.from(JSON.stringify(proof))
    if(body.length>agentDesignMaxRequestBytes)throw Error("invalid_agent_design_contract")
    return new Promise((resolve,reject)=>{
      let settled=false,req:ClientRequest|undefined,response:IncomingMessage|undefined
      const destroy=()=>{try{req?.destroy()}catch{};try{response?.destroy()}catch{}}
      const fail=()=>{if(!settled){settled=true;pending.delete(abort);reject(Error("agent_design_transport_unknown"));destroy()}}
      const abort=()=>fail()
      pending.add(abort)
      try{
        req=request({protocol:"https:",hostname:"127.0.0.1",port,servername:"localhost",path:agentDesignRoute,method:"POST",...credentials,rejectUnauthorized:true,minVersion:"TLSv1.2",agent:false,
          signal:AbortSignal.timeout(55000),checkServerIdentity(host,cert){const error=checkServerIdentity(host,cert);if(error)return error;try{if(timingSafeEqual(pin,boundCertificateFingerprint(cert.fingerprint256)))return undefined}catch{};return Error("agent_design_server_certificate_refused")},
          headers:{"Content-Type":"application/json",Accept:"application/json","Content-Length":String(body.length)}},res=>{
          response=res;res.once("aborted",fail);res.once("error",fail)
          if(closed||settled){res.destroy();return}
          if(res.statusCode!==200||!/^application\/json(?:\s*;|$)/i.test(String(res.headers["content-type"]??""))||res.headers["content-encoding"]!==undefined&&res.headers["content-encoding"]!=="identity"){fail();return}
          const chunks:Buffer[]=[];let size=0
          res.on("data",piece=>{if(settled)return;const bytes=Buffer.isBuffer(piece)?piece:Buffer.from(piece);size+=bytes.length;if(size>agentDesignMaxReplyBytes){fail();return}chunks.push(bytes)})
          res.once("end",()=>{if(settled)return;try{const reply=parseAgentDesignReply(parseAgentDesignTransportJson(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))));if(reply.request_id!==proof.request_id)throw Error();settled=true;pending.delete(abort);resolve(reply)}catch{fail()}})
        })
        req.once("error",fail)
        if(closed||settled){destroy();return}
        req.end(body)
      }catch{fail()}
    })
  }
  return Object.defineProperty(send,"close",{value:close}) as AgentDesignMutualTlsClient
}
function reply(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"});res.end(JSON.stringify(body))}
export function createAgentDesignInternalHandler(config:AgentDesignActivation&{reviewedClientFingerprint256:string;dispatch:(proof:AgentDesignProof)=>Promise<AgentDesignReply>}):(req:IncomingMessage,res:ServerResponse)=>Promise<void>{
  if(!agentDesignExecutionEnabled(config)||typeof config.dispatch!=="function")throw Error("agent_design_handler_disabled")
  const pin=boundCertificateFingerprint(config.reviewedClientFingerprint256).toString("hex"),dispatch=config.dispatch
  return async(req,res)=>{
    try{verifyBoundWorkerMutualTlsPeer(req.socket,pin)}catch{reply(res,403,{error:"agent_design_denied"});return}
    if(req.method!=="POST"||req.url!==agentDesignRoute||["cookie","authorization","x-rh-user-id","x-forwarded-client-cert"].some(k=>req.headers[k]!==undefined)){reply(res,404,{error:"agent_design_route_not_found"});return}
    if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers["content-type"]??""))||req.headers["content-encoding"]!==undefined||req.headers["transfer-encoding"]!==undefined){reply(res,415,{error:"agent_design_unsupported_media"});return}
    const length=Number(req.headers["content-length"])
    if(!Number.isSafeInteger(length)||length<1||length>agentDesignMaxRequestBytes){reply(res,413,{error:"agent_design_invalid_size"});return}
    let proof:AgentDesignProof
    // Bound streaming time even if a mutually authenticated peer stalls.
    const timer=setTimeout(()=>req.destroy(Error("agent_design_read_timeout")),5000)
    try{const chunks:Buffer[]=[];let size=0;for await(const piece of req){const bytes=Buffer.isBuffer(piece)?piece:Buffer.from(piece);size+=bytes.length;if(size>length||size>agentDesignMaxRequestBytes)throw Error();chunks.push(bytes)}if(size!==length)throw Error();proof=parseAgentDesignProof(parseAgentDesignTransportJson(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))))}
    catch{reply(res,400,{error:"agent_design_invalid_payload"});return}finally{clearTimeout(timer)}
    try{const result=parseAgentDesignReply(await dispatch(proof));if(result.request_id!==proof.request_id)throw Error();reply(res,200,result)}catch{reply(res,503,{error:"agent_design_outcome_unavailable"})}
  }
}
