import {request as httpRequest} from 'node:http'
import {request as httpsRequest} from 'node:https'
import {localExecutorRoute,localObject} from '../shared/native-local-device-contract.mjs'
export function nativeServer(raw){
 if(typeof raw!=='string')throw Error('native_local_server_required');const u=new URL(raw)
 if(u.username||u.password||u.search||u.hash||!['/','/__pg_native','/__pg_native/'].includes(u.pathname)||u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('native_local_server_refused')
 return u.href.replace(/\/$/,'')
}
// The dedicated CLI protocol forbids browser fetch metadata as well as employee
// credentials. Node fetch adds Sec-Fetch-Mode itself, so use the native request
// client with a closed header set and no redirects or ambient cookie handling.
export function nativeRequestPlan(server,operation,body,token,signal){
 if(!['pair','pair-confirm','poll','check','complete','confirm'].includes(operation))throw Error('native_local_operation_refused')
 if(token!==undefined&&token!==null&&(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)))throw Error('native_local_device_token_invalid')
 const bytes=Buffer.from(JSON.stringify(body)),url=new URL(nativeServer(server)+localExecutorRoute+'/'+operation)
 if(bytes.length>1450000)throw Error('native_local_request_limit')
 const options={method:'POST',agent:false,headers:{Accept:'application/json','Content-Type':'application/json','Content-Length':String(bytes.length),...(token?{'X-Studio-Device-Token':token}:{})},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),...(url.protocol==='https:'?{rejectUnauthorized:true,minVersion:'TLSv1.2'}:{})}
 return{url,options,bytes}
}
export async function readNativeResponse(response){
 if(response.statusCode>=300&&response.statusCode<400){response.destroy();throw Error('native_local_redirect_refused')}
 if(!/^application\/json(?:\s*;|$)/i.test(response.headers['content-type']??'')||response.headers['content-encoding']!==undefined&&response.headers['content-encoding']!=='identity'){response.destroy();throw Error('native_local_invalid_response')}
 const chunks=[];let n=0
 try{for await(const part of response){const bytes=Buffer.from(part);n+=bytes.length;if(n>1450000)throw Error('native_local_invalid_response');chunks.push(bytes)}}catch(error){response.destroy();throw error}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,n)))}catch{throw Error('native_local_invalid_response')}
 if(response.statusCode<200||response.statusCode>=300){const error=Error(response.statusCode===404?'native_local_receipt_not_found':response.statusCode===403?'native_local_authorization_denied':'native_local_transport_unknown');error.status=response.statusCode;throw error}
 return value
}
export function nativeConnection(server,token){const base=nativeServer(server);return async(operation,body,signal)=>{
 const plan=nativeRequestPlan(base,operation,body,token,signal),request=plan.url.protocol==='https:'?httpsRequest:httpRequest
 return new Promise((resolve,reject)=>{const req=request(plan.url,plan.options,response=>{void readNativeResponse(response).then(resolve,reject)});req.once('error',reject);req.end(plan.bytes)})
}}
export function pairReply(value,requestId){localObject(value,['id','request_id','paired','replayed']);if(value.paired!==true||value.request_id!==requestId||typeof value.replayed!=='boolean')throw Error('native_local_invalid_response');return value}
export function completionReply(value,completion){localObject(value,['id','request_id','status','replayed']);if(value.id!==completion.id||value.request_id!==completion.request_id||!['succeeded','unknown'].includes(value.status)||value.status!==(completion.ok?'succeeded':'unknown')||typeof value.replayed!=='boolean')throw Error('native_local_invalid_response');return value}
