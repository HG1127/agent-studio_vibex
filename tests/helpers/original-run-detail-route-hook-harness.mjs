import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {registerHooks} from 'node:module'
import {pathToFileURL} from 'node:url'

// The actual original hook, route parser, controller and DTO projection execute.
// React scheduling, verified identity and API responses are terminal memory DATA.
// No React renderer, browser, fetch, SQL, Worker or service is started.
const root=process.env.ORIGINAL_DETAIL_HOOK_SOURCE_ROOT
 ?pathToFileURL(process.env.ORIGINAL_DETAIL_HOOK_SOURCE_ROOT.replaceAll('\\','/')+'/')
 :new URL('../../',import.meta.url)
const source=path=>new URL(path,root).href,harness=import.meta.url
const entry=source('src/pages/RunDetail/usePgOriginalRunDetail.ts')
const session=source('src/lib/originalRunDetailSession.ts'),projection=source('src/lib/originalRunDetailProjection.ts')
registerHooks({resolve(specifier,context,next){
 if(context.parentURL===entry){
  if(specifier==='../../lib/originalRunDetailSession.ts')return{url:session,shortCircuit:true}
  if(specifier==='../../lib/originalRunDetailRoute.ts')return{url:source('src/lib/originalRunDetailRoute.ts'),shortCircuit:true}
  if(specifier==='../../lib/originalRunDetailProjection.ts')return{url:projection,shortCircuit:true}
  if(['react','react-router-dom','../../lib/pgNativePilotApi.ts','../../lib/originalRunDetailTransport.ts','../../lib/studioAuth.ts','../../lib/studioBackend.ts','../../lib/unsavedNavigation.ts','../../lib/runPresentation.ts'].includes(specifier))return{url:harness,shortCircuit:true}
  throw Error('unreviewed route hook import '+specifier)
 }
 if(context.parentURL===session){
  if(specifier==='./originalRunDetailRoute.ts')return{url:source('src/lib/originalRunDetailRoute.ts'),shortCircuit:true}
  if(specifier==='./originalRunDetailProjection.ts')return{url:projection,shortCircuit:true}
  if(['./pgNativePilotApi.ts','./pgNativeAgentRunControl.ts'].includes(specifier))return{url:harness,shortCircuit:true}
  throw Error('unreviewed detail session import '+specifier)
 }
 if(context.parentURL===projection){
  if(specifier==='./originalRunDetailRoute.ts')return{url:source('src/lib/originalRunDetailRoute.ts'),shortCircuit:true}
  if(['./pgNativeAgentRunControl.ts','../../services/pg-api/src/run-step-metadata.ts'].includes(specifier))return{url:harness,shortCircuit:true}
  throw Error('unreviewed detail projection import '+specifier)
 }
 return next(specifier,context)
}})
export const E='11111111-1111-4111-8111-111111111111',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',R='22222222-2222-4222-8222-222222222222',S='33333333-3333-4333-8333-333333333333'
let mounted,active,loaded
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
function cell(kind,init){if(!active)throw Error('hook outside render');const h=active,i=h.cursor++;if(!h.cells[i]){h.cells[i]=init(h);h.cells[i].kind=kind}if(h.cells[i].kind!==kind)throw Error('unstable hook order');return h.cells[i]}
export function useState(initial){const c=cell('state',h=>{const v={value:typeof initial==='function'?initial():initial};v.set=n=>{const next=typeof n==='function'?n(v.value):n;if(!Object.is(next,v.value)){v.value=next;h.dirty=true}};return v});return[c.value,c.set]}
export function useRef(initial){return cell('ref',()=>({value:{current:initial}})).value}
export function useEffect(effect,deps){const h=active,c=cell('effect',()=>({deps:undefined,cleanup:null}));if(!same(c.deps,deps)){c.deps=deps;h.effects.push(()=>{c.cleanup?.();c.cleanup=effect()??null})}}
export function useSearchParams(){return[new URLSearchParams(mounted.search),value=>{mounted.search=String(typeof value==='function'?value(new URLSearchParams(mounted.search)):value);window.location.search='?'+mounted.search;mounted.dirty=true}]}
export const getStudioAccountInfo=()=>mounted?{id:mounted.employee,active:true}:null
export const verifyStudioSession=async()=>mounted.verifyFailure?'unavailable':'authenticated'
export const getStudioBackend=()=>'native_pg'
export const redirectToRhLogin=()=>{throw Error('unexpected login navigation')}
export const registerUnsavedWorkCheck=()=>()=>{}
export const RUN_STATE_META={}
export const formatRunDetailTime=value=>value
export class PgNativePilotError extends Error{constructor(status,code){super(code);this.status=status;this.code=code}}
export const createPgNativePilotApi=transport=>transport
export const createOriginalRunDetailTransport=()=>({transport:mounted.api,close(){}})
export const nativeRunControlView=()=>{throw Error('unexercised control projection')}
export const nativeRunControlRequest=()=>{throw Error('unexercised control request')}
export const nativeRunControlConfirmed=()=>{throw Error('unexercised control receipt')}
export const safeRunStepMetadata=()=>{throw Error('unexercised populated step')}
export function sourceBinding(){return[entry,session,projection,source('src/lib/originalRunDetailRoute.ts')].map(url=>({url,sha256:createHash('sha256').update(fs.readFileSync(new URL(url))).digest('hex')}))}
export async function createDetailRouteHarness({kind='agent_autonomous',search='run='+R+'&kind='+kind,employee=E,owner=E,deferFirst=false}={}){
 if(mounted)throw Error('dispose prior route harness')
 loaded??=import(entry);const {usePgOriginalRunDetail}=await loaded
 const h={cells:[],cursor:0,effects:[],dirty:true,search,employee,owner,kind,output:null,reads:[],posts:[],timers:new Map(),listeners:new Map(),firstRelease:null,firstEntered:false,verifyFailure:false}
 const read=async requested=>{
  const item={method:'GET',kind:requested,id:R,status:requested===h.kind&&h.employee===h.owner?200:404};h.reads.push(item)
  if(deferFirst&&!h.firstEntered){h.firstEntered=true;await new Promise(resolve=>{h.firstRelease=resolve})}
  if(item.status===404)throw new PgNativePilotError(404,requested.startsWith('workflow')?'workflow_run_not_found':'agent_run_not_found')
  return{execution_mode:requested==='agent_autonomous'?'agent_native_v2':requested==='workflow_v2'?'workflow_native_v2':requested==='workflow_safe'?'start_end_only':undefined,run:{id:R,owner_user_id:h.owner,kind:requested.startsWith('agent')?'agent':'workflow',agent_spec_id:requested.startsWith('agent')?S:null,workflow_id:requested.startsWith('agent')?null:S,status:'queued',instruction:'Synthetic owned instruction',checkpoint:{execution_mode:requested==='agent_autonomous'?'agent_native_v2':undefined,spec_revision:1,workflow_revision:1},step_count:0,result_text:'',last_error_code:'',created_at:'2026-11-02T00:00:00.000Z',updated_at:'2026-11-02T00:00:00.000Z',finished_at:null},steps:[],steps_truncated:false}
 }
 h.api={getRun:()=>read('agent_single'),getWorkflowRun:()=>read('workflow_safe'),getWorkflowV2Run:()=>read('workflow_v2'),getAutonomousAgentRun:()=>read('agent_autonomous'),getConfigCapabilities:async()=>({original_run_interactions_protocol:'native_original_run_interaction_v1'}),getWorkflowV2Outputs:async()=>({run:{run_id:R,workflow_id:S,workflow_revision:1,updated_at:'2026-11-02T00:00:00.000Z'}})}
 for(const name of ['controlAutonomousAgentRun','confirmAutonomousAgentRunControl','cancelAutonomousAgentRun','cancelWorkflowV2Run'])h.api[name]=async()=>{h.posts.push(name);throw Error('unexpected route write')}
 mounted=h
 let timer=0
 const listen=(type,fn)=>{if(!h.listeners.has(type))h.listeners.set(type,new Set());h.listeners.get(type).add(fn)},unlisten=(type,fn)=>h.listeners.get(type)?.delete(fn)
 const globals={window:{location:{search:'?'+search},addEventListener:listen,removeEventListener:unlisten,setInterval:fn=>{const id=++timer;h.timers.set(id,fn);return id},clearInterval:id=>h.timers.delete(id)},document:{hidden:false,addEventListener:listen,removeEventListener:unlisten},sessionStorage:{getItem:()=>null,setItem(){throw Error('unexpected recovery write')},removeItem(){throw Error('unexpected recovery clear')}},clearTimeout(){}}
 const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));for(const[k,v]of Object.entries(globals))Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true})
 h.render=()=>{h.cursor=0;h.dirty=false;active=h;try{h.output=usePgOriginalRunDetail()}finally{active=null}}
 h.flush=async()=>{for(let n=0;n<200;n++){if(h.dirty)h.render();while(h.effects.length)h.effects.shift()();await Promise.resolve()}return h.output}
 h.route=async search=>{h.search=search;window.location.search='?'+search;h.dirty=true;return h.flush()}
 h.emit=async type=>{for(const fn of [...h.listeners.get(type)??[]])fn();return h.flush()}
 h.visibility=async hidden=>{document.hidden=hidden;return h.emit('visibilitychange')}
 h.dispose=()=>{for(const c of h.cells)if(c.kind==='effect')c.cleanup?.();mounted=null;for(const[k,v]of previous)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}
 await h.flush();return h
}
