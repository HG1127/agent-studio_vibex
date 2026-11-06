import {createOriginalAgentQualityHttp} from '../../services/pg-api/src/original-agent-quality-http.ts'
import {Buffer} from 'node:buffer'
/** In-process request/response ports only, no browser or listening server. */
export function quality089HttpFetch(repo,options){
 const calls=[],origin='https://studio.example.test';let drop=options.dropReply===true
 const handler=createOriginalAgentQualityHttp({repo,allowedOrigin:origin,authenticateRequest:async()=>options.identity})
 const fetch=async(input,init={})=>{const path=String(input).replace(/^\/__pg_native/,''),method=init.method??'GET';calls.push({path,method});const pairs=Object.entries(init.headers??{}).flatMap(([k,v])=>[k,String(v)]),headers=Object.fromEntries(Object.entries(init.headers??{}).map(([k,v])=>[k.toLowerCase(),String(v)]));headers.origin=origin;headers.host='studio.example.test';pairs.push('Origin',origin,'Host','studio.example.test');const bytes=Buffer.from(init.body??'');if(bytes.length){headers['content-length']=String(bytes.length);pairs.push('Content-Length',String(bytes.length))}const req={url:path,method,headers,rawHeaders:pairs,destroy(){},async *[Symbol.asyncIterator](){if(bytes.length)yield bytes}},res={status:0,headers:{},body:'',writeHead(status,value){this.status=status;this.headers=value},end(body){this.body=body}};if(!await handler(req,res))throw Error('terminal_HTTP_route_not_handled');if(method==='POST'&&drop){drop=false;throw Error('terminal_reply_lost_after_handler')}return{status:res.status,ok:res.status>=200&&res.status<300,headers:{get:name=>Object.entries(res.headers).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]??null},text:async()=>res.body}}
 return{fetch,calls,handler}
}
