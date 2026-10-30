import fs from 'node:fs'
import {registerHooks} from 'node:module'
import {createHash} from 'node:crypto'
export {OriginalHomeApiError} from '../../src/lib/originalHomeAgentApi.ts'

// Pure hook/control-flow port. No DOM renderer, React scheduler, HTTP server,
// PostgreSQL, provider, browser or application bootstrap runs in this harness.
// Only imports and import.meta.env are supplied; the actual useHome function
// and its callbacks/effects are loaded unchanged by Node's type stripping.
let active=null,loaded
const harnessURL=import.meta.url,sutURL=new URL('../../src/pages/Home/useHome.ts',import.meta.url).href
const actual=new Map([
 ['@/lib/agentEditorDraft','../../src/lib/agentEditorDraft.ts'],
 ['@/lib/originalHomeAgentEditor','../../src/lib/originalHomeAgentEditor.ts'],
 ['@/lib/agentToolMatcher','../../src/lib/agentToolMatcher.ts'],
 ['./presets','../../src/pages/Home/presets.ts'],
])
const ports=new Set(['react','react-router-dom','@/lib/llm','@/lib/pb','@/lib/studioAuth','@/lib/anonUid','@/lib/unsavedNavigation','@/lib/knowledgeBases','@/lib/currentAgentConnectionSnapshot','@/lib/localDevices','@/lib/authoringRequirements','@/lib/studioBackend','@/lib/originalHomeAgentApi'])
registerHooks({
 resolve(specifier,context,next){
  if(context.parentURL===sutURL){
   if(ports.has(specifier))return{url:harnessURL,shortCircuit:true}
   if(actual.has(specifier))return{url:new URL(actual.get(specifier),harnessURL).href,shortCircuit:true}
   throw Error('unreviewed useHome test import '+specifier)
  }
  return next(specifier,context)
 },
 load(url,context,next){
  const result=next(url,context)
  if(url!==sutURL)return result
  return{...result,source:"import.meta.env={VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED:'true'};\n"+Buffer.from(result.source).toString('utf8')}
 },
})
export const sourceBinding=()=>{const b=fs.readFileSync(new URL(sutURL));return{url:sutURL,sha256:createHash('sha256').update(b).digest('hex'),adapter:'static imports -> explicit DATA ports; one import.meta.env prefix; useHome body unchanged',real_React_or_browser:false}}
const current=()=>{if(!active)throw Error('hook outside pure harness render');return active}
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
function cell(kind,initialize){const h=current(),index=h.cursor++;if(!h.cells[index]){h.cells[index]=initialize(h);h.cells[index].kind=kind}if(h.cells[index].kind!==kind)throw Error('unstable hook order');return h.cells[index]}
export function useState(initial){const c=cell('state',h=>{const state={value:typeof initial==='function'?initial():initial};state.set=value=>{const next=typeof value==='function'?value(state.value):value;if(!Object.is(next,state.value)){state.value=next;h.dirty=true}};return state});return[c.value,c.set]}
export function useRef(value){return cell('ref',()=>({value:{current:value}})).value}
export function useMemo(factory,deps){const c=cell('memo',()=>({deps:undefined,value:undefined}));if(!same(c.deps,deps)){c.value=factory();c.deps=deps}return c.value}
export function useCallback(callback,deps){return useMemo(()=>callback,deps)}
export function useEffect(effect,deps){const h=current(),c=cell('effect',()=>({deps:undefined,cleanup:null}));if(!same(c.deps,deps)){c.deps=deps;h.effects.push(()=>{c.cleanup?.();c.cleanup=effect()??null})}}
export function useSearchParams(){return[current().query,()=>{throw Error('unexpected query mutation')} ]}
export const ORIGINAL_PG_UI_ENABLED=true,LOCAL_ANON_UID='not-used-in-native'
export function decodeRhToken(){return{sub:current().owner,nickName:'Pure employee'}}
export function createOriginalHomeAgentApi(){return current().api}
export function registerUnsavedWorkCheck(){return()=>{}}
export function redirectToRhLogin(){throw Error('unexpected navigation')}
export function vibexAuthHeaders(){throw Error('unexpected legacy headers')}
export function getPocketBaseUrl(){throw Error('unexpected legacy backend')}
export async function callLlmWithFallback(){throw Error('unexpected provider')}
export async function getKnowledgeBases(){throw Error('unexpected legacy knowledge')}
export async function fetchCurrentAgentConnectionSnapshot(){throw Error('unexpected legacy resources')}
export async function localApi(){throw Error('unexpected legacy API')}
export async function captureRequirements(){throw Error('unexpected requirement provider')}
export async function previewRequirements(){throw Error('unexpected requirement provider')}
export const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
export const employee='22222222-2222-4222-8222-222222222222'
export const ids={a:'11111111-1111-4111-8111-111111111111',b:'33333333-3333-4333-8333-333333333333',c:'44444444-4444-4444-8444-444444444444',copy:'99999999-9999-4999-8999-999999999999'}
export const wire=(id=ids.a,extra={})=>({id,owner_user_id:employee,name:'Agent '+id[0],revision:7,spec:{goal:'原目标',task_scope:'原范围',deliverables:['交付物'],tools:[],task_plan:['步骤'],done_criteria:['验收'],knowledge_base_ids:[],require_approval:true},authoring:{format:'agentstudio.home-authoring.v1',source:'create',template_key:'',tool_requirements:[]},created_at:'2026-10-30T00:00:00Z',updated_at:'2026-10-30T01:00:00Z',...extra})
const emptyResources=()=>({connectedHttp:[],verifiedMarket:[],knowledgeBases:[],bindings:{http:[],mcp:[]}})
export async function createHomeHarness(options={}){
 loaded??=import(sutURL);const {useHome}=await loaded
 const h={owner:options.owner??employee,query:new URLSearchParams(options.query??''),cells:[],cursor:0,effects:[],dirty:true,output:null,calls:[],timers:new Map(),storage:new Map(options.storage??[]),listeners:new Map(),disposed:false}
 let nextTimer=0
 const records=new Map((options.records??[wire(ids.a),wire(ids.b),wire(ids.c)]).map(r=>[r.id,r]))
 const defaults={
  resources:()=>emptyResources(),catalog:()=>({items:[],totalItems:0,page:1,perPage:1,totalPages:0}),
  get:id=>{if(!records.has(id))throw Error('missing pure record');return records.get(id)},
  create:draft=>wire(ids.copy,{name:draft.name,spec:draft.spec,authoring:draft.authoring,revision:1}),
  update:(id,revision,draft)=>wire(id,{name:draft.name,spec:draft.spec,authoring:draft.authoring??records.get(id)?.authoring??null,revision:revision+1}),
 }
 h.api=Object.fromEntries(Object.keys(defaults).map(name=>[name,(...args)=>{h.calls.push({name,args});try{return Promise.resolve((options.api?.[name]??defaults[name])(...args))}catch(error){return Promise.reject(error)}}]))
 const globals={window:{confirm:()=>true,setTimeout:(callback,delay)=>{const id=++nextTimer;h.timers.set(id,{callback,delay});return id},clearTimeout:id=>h.timers.delete(id),addEventListener:(type,callback)=>{if(!h.listeners.has(type))h.listeners.set(type,new Set());h.listeners.get(type).add(callback)},removeEventListener:(type,callback)=>h.listeners.get(type)?.delete(callback)},document:{visibilityState:'visible',getElementById:()=>null},requestAnimationFrame:callback=>{callback(0);return 0},sessionStorage:{getItem:key=>h.storage.get(key)??null,setItem:(key,value)=>h.storage.set(key,value),removeItem:key=>h.storage.delete(key)}}
 const original=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
 h.render=()=>{if(h.disposed)throw Error('render after disposal');h.cursor=0;h.dirty=false;active=h;try{h.output=useHome()}finally{active=null}}
 h.flush=async()=>{for(let i=0;i<40;i++){if(h.dirty)h.render();while(h.effects.length)h.effects.shift()();await Promise.resolve()}return h.output}
 h.runTimers=async(delay=450)=>{await h.flush();for(const [id,timer] of [...h.timers])if(timer.delay===delay&&h.timers.delete(id))timer.callback();return h.flush()}
 h.emit=async(type)=>{for(const callback of [...h.listeners.get(type)??[]])callback();return h.flush()}
 h.dispose=()=>{if(h.disposed)return;h.disposed=true;for(const c of h.cells)if(c.kind==='effect')c.cleanup?.();for(const [key,d] of original)if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}
 await h.flush();return h
}
