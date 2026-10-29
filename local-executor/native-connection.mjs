import {localExecutorRoute,localObject} from '../shared/native-local-device-contract.mjs'
export function nativeServer(raw){
 if(typeof raw!=='string')throw Error('native_local_server_required');const u=new URL(raw)
 if(u.username||u.password||u.search||u.hash||!['/','/__pg_native','/__pg_native/'].includes(u.pathname)||u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('native_local_server_refused')
 return u.href.replace(/\/$/,'')
}
export function nativeConnection(server,token){const base=nativeServer(server);return async(operation,body,signal)=>{
 if(!['pair','pair-confirm','poll','check','complete','confirm'].includes(operation))throw Error('native_local_operation_refused')
 const response=await fetch(base+localExecutorRoute+'/'+operation,{method:'POST',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json',...(token?{'X-Studio-Device-Token':token}:{})},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})
 if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||response.headers.get('content-encoding')&&!['identity'].includes(response.headers.get('content-encoding')))throw Error('native_local_invalid_response')
 const reader=response.body?.getReader();if(!reader)throw Error('native_local_invalid_response');const chunks=[];let n=0
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>1450000)throw Error('native_local_invalid_response');chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(n);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength}let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw Error('native_local_invalid_response')}
 if(!response.ok){const error=Error(response.status===404?'native_local_receipt_not_found':response.status===403?'native_local_authorization_denied':'native_local_transport_unknown');error.status=response.status;throw error}
 return value
}}
export function pairReply(value,requestId){localObject(value,['id','request_id','paired','replayed']);if(value.paired!==true||value.request_id!==requestId||typeof value.replayed!=='boolean')throw Error('native_local_invalid_response');return value}
export function completionReply(value,completion){localObject(value,['id','request_id','status','replayed']);if(value.id!==completion.id||value.request_id!==completion.request_id||!['succeeded','unknown'].includes(value.status)||value.status!==(completion.ok?'succeeded':'unknown')||typeof value.replayed!=='boolean')throw Error('native_local_invalid_response');return value}
