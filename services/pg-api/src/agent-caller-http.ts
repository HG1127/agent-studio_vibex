import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {nativeSessionToken,verifyNativeOrigin} from './native-auth-http.mjs'
import {parseAgentDesignTransportJson} from './agent-design-value-contract.ts'
import {agentTemplateMarketObject as O} from './agent-template-market-contract.ts'
import {agentCallerId,agentCallerOrigin,parseAgentCallerBearer,parseAgentCallerOwnerChoice,parseAgentCallerOwnerTest,parseAgentCallerWorkspace,parseAgentCallerHistory,parseAgentCallerOwnerReply,matchAgentCallerOwnerReceipt,parseAgentCallerRunChoice,parseAgentCallerRunReply,parseAgentCallerPublicStatus,matchAgentCallerRunReceipt} from '../../../shared/agent-caller-contract.ts'
import type {AgentCallerRepository} from './agent-caller-repository.ts'
import {agentCallerWidgetScript,renderAgentCallerFrame} from './agent-caller-embed.ts'
const root='/api/v2/integrate',publicRoot='/api/v2/public/agent'
const invalid=():never=>{throw new HttpError(400,'agent_caller_invalid_request')}
const input=<T>(fn:()=>T):T=>{try{return fn()}catch{return invalid()}}
function headers(res:ServerResponse,status:number,type:string,origin?:string,extra:Record<string,string>={}){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store',Pragma:'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':origin?'cross-origin':'same-origin',...(origin?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{}),...extra})}
function send(res:ServerResponse,status:number,value:unknown,origin?:string,extra:Record<string,string>={}){headers(res,status,'application/json; charset=utf-8',origin,extra);res.end(JSON.stringify(value))}
function forbiddenActorHeaders(req:IncomingMessage){return Object.keys(req.headers).some(key=>/^(?:x[-_]rh[-_]user[-_]id|x[-_](?:agentstudio[-_])?(?:owner|actor|user)[-_]id)$/i.test(key))}
function duplicateHeaders(req:IncomingMessage){const seen=new Set<string>();for(let i=0;i<req.rawHeaders.length;i+=2){const name=req.rawHeaders[i]!.toLowerCase();if(['authorization','origin','cookie','content-type','content-length','transfer-encoding','x-agentstudio-request'].includes(name)){if(seen.has(name))return true;seen.add(name)}}return false}
function path(req:IncomingMessage,related:(raw:string)=>boolean){const raw=req.url??'';let parsed:URL|undefined,decoded='';try{parsed=new URL(raw,'https://internal.invalid');decoded=decodeURIComponent(parsed.pathname)}catch{};const owns=[raw.split(/[?#]/,1)[0]??'',parsed?.pathname??'',decoded].some(related);return{raw,parsed,owns,valid:Boolean(parsed&&raw===parsed.pathname&&!parsed.search&&!raw.includes('#')&&!parsed.pathname.includes('%'))}}
async function empty(req:IncomingMessage){if(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')return invalid();for await(const part of req)if(Buffer.byteLength(part)>0)return invalid()}
async function read(req:IncomingMessage){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']??''))||req.headers['content-encoding']!==undefined)throw new HttpError(415,'agent_caller_json_required')
 const length=req.headers['content-length'],transfer=req.headers['transfer-encoding'];if(length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)))return invalid();if(length!==undefined&&(!Number.isSafeInteger(Number(length))||Number(length)>32768))throw new HttpError(413,'agent_caller_request_too_large');if(transfer!==undefined&&(transfer!=='chunked'||length!==undefined))return invalid()
 const timer=setTimeout(()=>req.destroy(Error('agent_caller_read_timeout')),5000);try{const chunks:Buffer[]=[];let size=0;for await(const part of req){const b=Buffer.isBuffer(part)?part:Buffer.from(part);size+=b.length;if(size>32768)throw new HttpError(413,'agent_caller_request_too_large');chunks.push(b)}if(length!==undefined&&Number(length)!==size)return invalid();return input(()=>parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))))}finally{clearTimeout(timer)}
}
function error(res:ServerResponse,e:unknown,origin?:string,extra?:Record<string,string>){const known=e instanceof HttpError&&/^agent_caller_[a-z_]{1,64}$/.test(e.code);send(res,known?e.status:503,{error:known?e.code:'agent_caller_outcome_unknown'},origin,extra)}
export function createAgentCallerOwnerHttp({repository:r,authenticateRequest,allowedOrigin,allowWrites=false,allowAdmission=false}:{repository:Pick<AgentCallerRepository,'workspace'|'history'|'change'|'ownerConfirm'|'ownerTest'|'ownerTestConfirm'|'ownerPoll'>;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>;allowedOrigin:string;allowWrites?:boolean;allowAdmission?:boolean}){
 const origin=agentCallerOrigin(allowedOrigin)
 async function identity(req:IncomingMessage){let i:Identity;try{i=await authenticateRequest(req)}catch(e){if(e instanceof Error&&'status'in e&&e.status===401&&e.message==='session_required')throw new HttpError(401,'agent_caller_native_session_required');throw e}if(i?.issuer!=='urn:agentstudio:local:v1'||typeof i.subject!=='string'||!i.subject||i.subject.length>255)throw new HttpError(401,'agent_caller_native_session_required');return{issuer:i.issuer,subject:i.subject}}
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const route=path(req,s=>s===root||s.startsWith(root+'/'));if(!route.owns)return false
  let allow:string|undefined
  try{
   try{verifyNativeOrigin(req,origin,req.method!=='GET')}catch{throw new HttpError(403,'agent_caller_native_origin_denied')}
   if(duplicateHeaders(req)||forbiddenActorHeaders(req))throw new HttpError(403,'agent_caller_native_session_required')
   if(req.headers.authorization!==undefined||!nativeSessionToken(req))throw new HttpError(401,'agent_caller_native_session_required')
   if(!route.valid)return invalid()
   const suffix=route.raw.slice(root.length),key=/^\/keys\/([a-f0-9-]{36})(\/reissue)?$/.exec(suffix),poll=/^\/test-run\/([a-f0-9-]{36})$/.exec(suffix),get=['/agents','/keys','/budget','/embed-config','/invocations','/stats'].includes(suffix)||Boolean(poll),confirm=suffix==='/confirm',testConfirm=suffix==='/test-run/confirm',test=suffix==='/test-run'
   const post=['/keys','/budget','/embed-config'].includes(suffix)||Boolean(key?.[2])||confirm||test||testConfirm,del=Boolean(key&&!key[2]);allow=[...(get?['GET']:[]),...(post?['POST']:[]),...(del?['DELETE']:[])].join(', ')
   if(!allow)return invalid();if(!allow.split(', ').includes(req.method??''))throw new HttpError(405,'agent_caller_method_not_allowed')
   const actor=await identity(req);let value:unknown
   if(req.method==='GET'){await empty(req);value=poll?parseAgentCallerPublicStatus(await r.ownerPoll(actor,origin,input(()=>agentCallerId(poll[1])))):['/invocations','/stats'].includes(suffix)?parseAgentCallerHistory(await r.history(actor)):parseAgentCallerWorkspace(await r.workspace(actor))}
   else{
    const body=await read(req)
    if(test||testConfirm){const request=input(()=>parseAgentCallerOwnerTest(body));if(test&&!allowAdmission)throw new HttpError(403,'agent_caller_admission_disabled');const result=parseAgentCallerRunReply(await(testConfirm?r.ownerTestConfirm(actor,origin,request):r.ownerTest(actor,origin,request)));await matchAgentCallerRunReceipt(result.receipt,request.choice,request,origin,'owner_test');if(testConfirm&&!result.replayed)throw Error();value=result}
    else{
     const choice=input(()=>parseAgentCallerOwnerChoice(confirm?O(body,['choice']).choice:body))
     if(!confirm){if(!allowWrites)throw new HttpError(403,'agent_caller_writes_disabled');if(suffix==='/budget'?choice.action!=='budget':suffix==='/embed-config'?choice.action!=='configure_embed':suffix==='/keys'?choice.action!=='create':key?.[2]?choice.action!=='rotate'||choice.credential_id!==key[1]:choice.action!=='revoke'||choice.credential_id!==key?.[1])return invalid()}
     const result=parseAgentCallerOwnerReply(await(confirm?r.ownerConfirm(actor,choice.request_id):r.change(actor,choice)));await matchAgentCallerOwnerReceipt(result,choice);if(confirm&&!result.replayed)throw Error();value=result
    }
   }
   if(Buffer.byteLength(JSON.stringify(value))>1048576)throw Error();const after=await identity(req);if(after.issuer!==actor.issuer||after.subject!==actor.subject)throw new HttpError(401,'agent_caller_native_session_required');send(res,200,value,undefined,{'X-Frame-Options':'DENY'})
  }catch(e){error(res,e,undefined,allow?{Allow:allow}:{})}
  return true
 }
}
export function createAgentCallerPublicHttp({repository:r}:{repository:Pick<AgentCallerRepository,'run'|'confirm'|'poll'|'embed'|'preflight'>}){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const route=path(req,s=>s===publicRoot||s.startsWith(publicRoot+'/')||s==='/embed.js'||s==='/embed'||s.startsWith('/embed/'));if(!route.owns)return false
  let origin:string|undefined
  try{
   if(duplicateHeaders(req)||forbiddenActorHeaders(req)||req.headers.cookie!==undefined||req.headers['x-agentstudio-request']!==undefined)throw new HttpError(401,'agent_caller_authorization_required')
   if(!route.valid)return invalid()
   const frame=/^\/embed\/([a-f0-9-]{36})$/.exec(route.raw),poll=new RegExp('^'+publicRoot+'/poll/([a-f0-9-]{36})$').exec(route.raw),run=route.raw===publicRoot+'/run',confirm=route.raw===publicRoot+'/confirm',script=route.raw==='/embed.js'
   if(!frame&&!poll&&!run&&!confirm&&!script)return invalid()
   if(frame||script){if(req.method!=='GET'||req.headers.authorization!==undefined)throw new HttpError(405,'agent_caller_method_not_allowed');await empty(req);if(script){headers(res,200,'text/javascript; charset=utf-8',undefined,{'Cross-Origin-Resource-Policy':'cross-origin'});res.end(agentCallerWidgetScript);return true}const result=renderAgentCallerFrame(await r.embed(input(()=>agentCallerId(frame![1]))));headers(res,200,'text/html; charset=utf-8',undefined,{'Content-Security-Policy':result.csp,'Cross-Origin-Resource-Policy':'cross-origin'});res.end(result.html);return true}
   try{origin=agentCallerOrigin(req.headers.origin)}catch{throw new HttpError(401,'agent_caller_authorization_required')}
   if(req.method==='OPTIONS'){
    await empty(req);if(req.headers.authorization!==undefined||req.headers['access-control-request-method']!==(poll?'GET':'POST'))return invalid();const requested=String(req.headers['access-control-request-headers']??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);if(!requested.includes('authorization')||requested.some(x=>!['authorization','content-type','accept'].includes(x))||new Set(requested).size!==requested.length)return invalid();if(!await r.preflight(origin))throw new HttpError(403,'agent_caller_origin_denied');headers(res,204,'application/json; charset=utf-8',origin,{'Access-Control-Allow-Methods':poll?'GET':'POST','Access-Control-Allow-Headers':'Authorization, Content-Type, Accept','Access-Control-Max-Age':'0',Vary:'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'});res.end();return true
   }
   if(req.method!==(poll?'GET':'POST'))throw new HttpError(405,'agent_caller_method_not_allowed')
   let key:ReturnType<typeof parseAgentCallerBearer>;try{key=parseAgentCallerBearer(req.headers.authorization)}catch{throw new HttpError(401,'agent_caller_authorization_required')}
   let value:unknown
   if(poll){await empty(req);value=parseAgentCallerPublicStatus(await r.poll(key.raw,origin,input(()=>agentCallerId(poll[1]))))}
   else{const body=await read(req),choice=input(()=>parseAgentCallerRunChoice(confirm?O(body,['choice']).choice:body)),result=parseAgentCallerRunReply(await(confirm?r.confirm(key.raw,origin,choice):r.run(key.raw,origin,choice)));await matchAgentCallerRunReceipt(result.receipt,choice,key,origin);if(confirm&&!result.replayed)throw Error();value=result}
   send(res,200,value,origin,{'X-Frame-Options':'DENY'})
  }catch(e){error(res,e,origin,{'X-Frame-Options':'DENY'})}
  return true
 }
}
