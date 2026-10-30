// Called only after the ORIGINAL Native Cookie authentication/Origin checks.
import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,isUuid,type Identity} from './contracts.ts'
import {OwnerToolTrialRepository,parseOwnerToolTrialRequest,requireToolHubNativeIdentity} from './tool-trial-repository.ts'
import {OwnerToolInvocationRepository} from './tool-invocation-projection.ts'
import {publicRegistryList,publicRegistryDetail,type RegistryRead,type RegistryPage,type RegistryEntry} from './public-mcp-registry.ts'
import type {ToolHubCapabilities} from './tool-hub-runtime-policy.ts'
export type OwnerToolHubHttpContext={capabilities:ToolHubCapabilities;trials:OwnerToolTrialRepository;invocations:OwnerToolInvocationRepository;registryRead?:(input:RegistryRead,signal:AbortSignal)=>Promise<RegistryPage>}
export function ownerToolHubRoute(path:string):boolean{return path==='/api/v2/tool-hub'||path.startsWith('/api/v2/tool-hub/')}
function invalid():never{throw new HttpError(400,'invalid_tool_hub_request')}
function reply(res:ServerResponse,value:unknown,status=200){const body=JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});res.end(body)}
function query(url:URL,allowed:readonly string[]){const seen=new Set<string>();for(const [key]of url.searchParams){if(!allowed.includes(key)||seen.has(key))invalid();seen.add(key)}return url.searchParams}
async function body(req:IncomingMessage){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??''))||req.headers['content-encoding']!==undefined)throw new HttpError(415,'json_content_type_required')
 const length=req.headers['content-length'],transfer=req.headers['transfer-encoding'];if(length!==undefined&&(typeof length!=='string'||! /^(0|[1-9][0-9]*)$/.test(length)||Number(length)>32768))throw new HttpError(413,'request_too_large');if(transfer!==undefined&&(transfer!=='chunked'||length!==undefined))invalid()
 const timer=setTimeout(()=>req.destroy(Error('tool_hub_body_timeout')),5000);try{const chunks:Buffer[]=[];let size=0;for await(const piece of req){const bytes=Buffer.isBuffer(piece)?piece:Buffer.from(piece);size+=bytes.length;if(size>32768)throw new HttpError(413,'request_too_large');chunks.push(bytes)}if(length!==undefined&&size!==Number(length))invalid();try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch{invalid()}}finally{clearTimeout(timer)}
}
async function registrySources(ctx:OwnerToolHubHttpContext,raw:unknown):Promise<RegistryEntry[]>{
 const request=parseOwnerToolTrialRequest(raw);if(request.purpose==='tool')return []
 if(!ctx.capabilities.registry||!ctx.registryRead)throw new HttpError(503,'public_mcp_registry_disabled')
 const signal=AbortSignal.timeout(5000),current:RegistryEntry[]=[]
 for(const pin of request.target.entries){signal.throwIfAborted();const page=await ctx.registryRead(publicRegistryDetail(pin.name,pin.version),signal);current.push(...page.items)}return current
}
export async function handleOwnerToolHubHttp(req:IncomingMessage,res:ServerResponse,identity:Identity,ctx:OwnerToolHubHttpContext):Promise<void>{
 requireToolHubNativeIdentity(identity)
 const url=new URL(req.url??'/','http://127.0.0.1'),path=url.pathname,method=req.method
 if(typeof req.url!=='string'||req.url.split('?')[0]!==path||req.url.includes('#')||/%|\\/.test(path))invalid()
 if(method==='GET'&&(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0'))invalid()
 if(path==='/api/v2/tool-hub'&&method==='GET'){query(url,[]);return reply(res,{...ctx.capabilities,scope:'owner_only',worker_started_by_api:false,worker_liveness:'not_inferred'})}
 if(!ctx.capabilities.available)throw new HttpError(503,'owner_tool_hub_disabled')
 if(path==='/api/v2/tool-hub/registry'||path==='/api/v2/tool-hub/registry/detail'){
  if(method!=='GET')throw new HttpError(405,'method_not_allowed')
  if(!ctx.capabilities.registry||!ctx.registryRead)throw new HttpError(503,'public_mcp_registry_disabled')
  const params=query(url,path.endsWith('/detail')?['name','version']:['search','cursor']),input=path.endsWith('/detail')?publicRegistryDetail(params.get('name'),params.get('version')??'latest'):publicRegistryList(params.get('search')??'',params.get('cursor')??''),page=await ctx.registryRead(input,AbortSignal.timeout(5000)),chinese=await ctx.trials.translations(identity,page.items)
  return reply(res,{...page,chinese})
 }
 if(path==='/api/v2/tool-hub/invocations'&&method==='GET'){
  const params=query(url,['kind','status','tool','after','limit']),limit=params.get('limit');if(limit!==null&&!/^[1-9][0-9]?$/.test(limit))invalid()
  return reply(res,await ctx.invocations.list(identity,{...(params.has('kind')?{kind:params.get('kind')}:{}),...(params.has('status')?{status:params.get('status')}:{}),...(params.has('tool')?{tool:params.get('tool')}:{}),...(params.has('after')?{after:params.get('after')}:{}),...(limit!==null?{limit:Number(limit)}:{})}))
 }
 if((path==='/api/v2/tool-hub/stats'||path==='/api/v2/tool-hub/harness')&&method==='GET'){query(url,[]);return reply(res,await(path.endsWith('/stats')?ctx.invocations.stats(identity):ctx.invocations.harness(identity)))}
 if(path==='/api/v2/tool-hub/trials'&&method==='GET'){const params=query(url,['after','limit']),limit=params.get('limit');if(limit!==null&&!/^[1-9][0-9]?$/.test(limit))invalid();return reply(res,await ctx.trials.list(identity,params.get('after')??undefined,limit===null?30:Number(limit)))}
 const match=/^\/api\/v2\/tool-hub\/trials\/([0-9a-fA-F-]{36})(?:\/(confirm|decision|cancel))?$/.exec(path)
 if(match&&isUuid(match[1])){
  const id=match[1]!,action=match[2]
  if(method==='GET'&&action==='confirm'){const params=query(url,['request_sha256']);return reply(res,await ctx.trials.confirm(identity,id,params.get('request_sha256')??''))}
  if(method==='GET'&&!action){query(url,[]);return reply(res,await ctx.trials.detail(identity,id))}
  if(method==='POST'&&(action==='decision'||action==='cancel')){query(url,[]);if(!ctx.capabilities.trials)throw new HttpError(405,'owner_tool_trials_writes_disabled');const raw=await body(req);if(action==='cancel'&&(!raw||typeof raw!=='object'||Array.isArray(raw)||Reflect.ownKeys(raw).length))invalid();return reply(res,await(action==='decision'?ctx.trials.decide(identity,id,raw):ctx.trials.cancel(identity,id)))}
 }
 if(method==='POST'&&(path==='/api/v2/tool-hub/trials'||path==='/api/v2/tool-hub/trials/preview')){query(url,[]);if(!ctx.capabilities.trials)throw new HttpError(405,'owner_tool_trials_writes_disabled');const raw=await body(req),current=await registrySources(ctx,raw);return reply(res,await(path.endsWith('/preview')?ctx.trials.preview(identity,raw,current):ctx.trials.submit(identity,raw,current)),path.endsWith('/preview')?200:201)}
 throw new HttpError(404,'tool_hub_route_not_found')
}
