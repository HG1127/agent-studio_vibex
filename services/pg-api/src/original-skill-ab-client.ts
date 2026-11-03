import {request as httpsRequest} from 'node:https'
import {checkServerIdentity} from 'node:tls'
import {timingSafeEqual} from 'node:crypto'
import type {ClientRequest,IncomingMessage,ServerResponse} from 'node:http'
import {boundCertificateFingerprint,verifyBoundWorkerMutualTlsPeer} from './bound-worker-mtls.ts'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import {skillAbProof,skillAbDispatchReply,type SkillAbProof} from '../../../shared/original-skill-ab-execution-contract.ts'
import {skillAbExecutionEnabled,type SkillAbExecutionOptions} from './original-skill-ab-provider.ts'
import {OriginalSkillAbBroker} from './original-skill-ab-broker.ts'
export const skillAbPrivateRoute='/__internal/v1/original-skill-ab/dispatch'
export type SkillAbReply=ReturnType<typeof skillAbDispatchReply>
export type SkillAbMutualTlsClient=((proof:SkillAbProof)=>Promise<SkillAbReply>)&{readonly close:()=>void}
const clients=new WeakSet<Function>()
export const isSkillAbMutualTlsClient=(raw:unknown):raw is SkillAbMutualTlsClient=>typeof raw==='function'&&clients.has(raw)
export function createSkillAbMutualTlsClient(config:SkillAbExecutionOptions&{origin:string;reviewedServerFingerprint256:string;ca:Buffer;cert:Buffer;key:Buffer},request:typeof httpsRequest=httpsRequest):SkillAbMutualTlsClient{
 if(!skillAbExecutionEnabled(config))throw Error('original_skill_ab_client_disabled')
 let origin:URL,pin:Buffer;try{origin=new URL(config.origin);pin=boundCertificateFingerprint(config.reviewedServerFingerprint256)}catch{throw Error('original_skill_ab_client_disabled')}
 if(origin.origin!==config.origin||origin.protocol!=='https:'||origin.hostname!=='127.0.0.1'||origin.port!=='7461'||origin.username||origin.password||[config.ca,config.cert,config.key].some(v=>!Buffer.isBuffer(v)||v.length===0||v.length>65536))throw Error('original_skill_ab_client_disabled')
 const credentials={ca:Buffer.from(config.ca),cert:Buffer.from(config.cert),key:Buffer.from(config.key)},pending=new Set<()=>void>();let closed=false
 const close=()=>{if(closed)return;closed=true;try{for(const abort of pending)abort()}finally{pending.clear();for(const b of Object.values(credentials))b.fill(0)}}
 const send=async(raw:SkillAbProof):Promise<SkillAbReply>=>{
  if(closed)throw Error('original_skill_ab_client_closed');const proof=skillAbProof(raw),body=Buffer.from(JSON.stringify(proof));if(body.length>2048)throw Error('original_skill_ab_private_request_invalid')
  return new Promise((resolve,reject)=>{let settled=false,req:ClientRequest|undefined,res:IncomingMessage|undefined
   const fail=()=>{if(settled)return;settled=true;pending.delete(fail);reject(Error('original_skill_ab_transport_unknown'));try{req?.destroy();res?.destroy()}catch{}}
   pending.add(fail)
   try{req=request({protocol:'https:',hostname:'127.0.0.1',port:7461,servername:'localhost',path:skillAbPrivateRoute,method:'POST',...credentials,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(55000),checkServerIdentity(host,cert){const error=checkServerIdentity(host,cert);if(error)return error;try{if(timingSafeEqual(pin,boundCertificateFingerprint(cert.fingerprint256)))return undefined}catch{};return Error('original_skill_ab_server_certificate_refused')},headers:{Accept:'application/json','Content-Type':'application/json','Content-Length':String(body.length)}},response=>{
    res=response;response.once('error',fail);response.once('aborted',fail)
    if(settled||closed||response.statusCode!==200||!/^application\/json(?:\s*;|$)/i.test(String(response.headers['content-type']??''))||response.headers['content-encoding']!==undefined&&response.headers['content-encoding']!=='identity'){fail();return}
    const length=response.headers['content-length'];if(length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>2048)){fail();return}
    let size=0;const chunks:Buffer[]=[];response.on('data',part=>{if(settled)return;const b=Buffer.isBuffer(part)?part:Buffer.from(part);size+=b.length;if(size>2048){fail();return}chunks.push(b)})
    response.once('end',()=>{if(settled)return;try{if(length!==undefined&&Number(length)!==size)throw Error();const value=skillAbDispatchReply(parseLocalTransportJson(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(chunks)),2048),proof);settled=true;pending.delete(fail);resolve(value)}catch{fail()}})
   });req.once('error',fail);if(closed||settled){req.destroy();return}req.end(body)}catch{fail()}
  })
 }
 const client=Object.assign(send,{close});clients.add(client);return client
}
function reply(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});res.end(JSON.stringify(body))}
export function createSkillAbInternalHandler(config:SkillAbExecutionOptions&{reviewedClientFingerprint256:string;broker:OriginalSkillAbBroker}){
 if(!skillAbExecutionEnabled(config)||!(config.broker instanceof OriginalSkillAbBroker)||!config.broker.enabled)throw Error('original_skill_ab_handler_disabled')
 const pin=boundCertificateFingerprint(config.reviewedClientFingerprint256).toString('hex')
 return async(req:IncomingMessage,res:ServerResponse)=>{
  try{verifyBoundWorkerMutualTlsPeer(req.socket,pin)}catch{reply(res,403,{error:'original_skill_ab_denied'});return}
  if(req.method!=='POST'||req.url!==skillAbPrivateRoute||['cookie','authorization','x-rh-user-id','x-forwarded-client-cert'].some(k=>req.headers[k]!==undefined)){reply(res,404,{error:'original_skill_ab_route_not_found'});return}
  if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??''))||req.headers['content-encoding']!==undefined||req.headers['transfer-encoding']!==undefined){reply(res,415,{error:'original_skill_ab_unsupported_media'});return}
  const length=Number(req.headers['content-length']);if(!Number.isSafeInteger(length)||length<1||length>2048){reply(res,413,{error:'original_skill_ab_invalid_size'});return}
  let proof:SkillAbProof;const timer=setTimeout(()=>req.destroy(Error('original_skill_ab_read_timeout')),5000)
  try{let size=0;const chunks:Buffer[]=[];for await(const part of req){const b=Buffer.from(part);size+=b.length;if(size>length||size>2048)throw Error();chunks.push(b)}if(size!==length)throw Error();proof=skillAbProof(parseLocalTransportJson(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(chunks)),2048))}catch{reply(res,400,{error:'original_skill_ab_invalid_payload'});return}finally{clearTimeout(timer)}
  try{reply(res,200,skillAbDispatchReply(await config.broker.dispatch(proof),proof))}catch{reply(res,503,{error:'original_skill_ab_outcome_unavailable'})}
 }
}
