// Actual hook and privacy helper; React/session/controller are explicit unit DATA ports.
// No browser, real Cookie, HTTP service, provider or backend runtime is created.
import {registerHooks} from 'node:module'
const pgURL=new URL('../../src/pages/AgentRun/usePgOriginalAgentRun.ts',import.meta.url).href,harnessURL=import.meta.url
let mounted=null,active=null,loaded
registerHooks({resolve(specifier,context,next){if(context.parentURL!==pgURL)return next(specifier,context);if(['../../lib/originalAgentRunPrivacy.ts','../../lib/runPresentation.ts'].includes(specifier))return{url:new URL('../../src/lib/'+specifier.split('/').at(-1),import.meta.url).href,shortCircuit:true};if(['react','react-router-dom','../../lib/pgNativePilotApi.ts','../../lib/originalModelConnectionsApi.ts','../../lib/originalHomeAgentApi.ts','../../lib/originalHomeInboxApi.ts','../../lib/originalAgentRunTransport.ts','../../lib/originalAgentRunSession.ts','../../lib/studioAuth.ts','../../lib/unsavedNavigation.ts','./useAgentRun.ts'].includes(specifier))return{url:harnessURL,shortCircuit:true};throw Error('unreviewed private-hook import '+specifier)}})
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
function cell(kind,init){if(!active)throw Error('hook outside unit render');const h=active,i=h.cursor++;if(!h.cells[i]){h.cells[i]=init(h);h.cells[i].kind=kind}if(h.cells[i].kind!==kind)throw Error('unstable hook order');return h.cells[i]}
export function useState(initial){const c=cell('state',h=>{const v={value:typeof initial==='function'?initial():initial};v.set=n=>{const next=typeof n==='function'?n(v.value):n;if(!Object.is(next,v.value)){v.value=next;h.dirty=true}};return v});return[c.value,c.set]}
export function useRef(value){return cell('ref',()=>({value:{current:value}})).value}
export function useEffect(effect,deps){const h=active,c=cell('effect',()=>({deps:null,cleanup:null}));if(!same(c.deps,deps)){c.deps=deps;h.effects.push(()=>{c.cleanup?.();c.cleanup=effect()??null})}}
export function useSearchParams(){return[new URLSearchParams(),()=>{}]}
export const BUILTIN_TOOLS=[],FEEDBACK_TAGS=[],RUN_STATE_META={}
export const getStudioAccountInfo=()=>mounted?.employee?{id:mounted.employee,active:true}:null
export const verifyStudioSession=async()=>mounted?.status??'authenticated'
export const redirectToRhLogin=()=>{}
export const registerUnsavedWorkCheck=()=>()=>{}
export const createPgNativePilotApi=()=>({})
export const createOriginalModelConnectionsApi=()=>({listSnapshot:async()=>{throw Error('unit controller must not call model source')}})
export const createOriginalHomeAgentApi=()=>({})
export const createOriginalHomeInboxApi=()=>({})
export const createOriginalAgentRunTransport=()=>({transport:async()=>{throw Error('network forbidden in hook unit')},close(){}})
export function createOriginalAgentRunSession(options){const h=mounted,listeners=new Set();const c={snapshot:()=>h.view,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},publish(){listeners.forEach(f=>f())},activate:async()=>{},verifyIdentity:async()=>{await options.verifyEmployee()},hidePrivateForIdentity(owner=false){h.view={...h.view,suspended:true,ownerChanged:owner};listeners.forEach(f=>f())},navigationBlocked:()=>false,dispose(){h.disposedControllers++},readResultForCopy:async()=>h.view.activeRun?.result??'',selectRun:async()=>{},selectAgent:async()=>{},poll:async()=>{},reportUnavailable(){},dismissError(){}}
 for(const name of ['submit','control','decide','submitFeedback','forgetMemory','respond'])c[name]=async()=>{h.actions.push(name)}
 h.controller=c;return c
}
export async function originalAgentRunPrivateHookHarness(employee){
 loaded??=import(pgURL);const {usePgOriginalAgentRun}=await loaded
 const id='44444444-4444-4444-8444-444444444444',spec='33333333-3333-4333-8333-333333333333',h={employee,status:'authenticated',cells:[],cursor:0,effects:[],dirty:true,output:null,actions:[],disposedControllers:0,controller:null,listeners:new Map(),view:{employeeId:employee,closed:false,suspended:false,recovering:false,sourceDenied:false,ownerChanged:false,loading:false,agents:[],nativeAgents:[],models:[],selectedAgentId:'',caps:null,workspace:{items:[],pending_items:[]},runs:{detail:{run:{id},human_input_current:true,human_input:{question:'PRIVATE_QUESTION',draft:'PRIVATE_PLAN',kind:'clarification',pending_sha256:'a'.repeat(64)}},loading:false,busy:false},feedback:{busy:false,status:null},memories:{items:[],loading:false},activeRun:{id,spec_id:spec,result:'PRIVATE_RESULT',status:'succeeded'},runHistory:[],pendingApproval:null,error:'',notice:''}}
 mounted=h
 const add=(type,fn)=>{if(!h.listeners.has(type))h.listeners.set(type,new Set());h.listeners.get(type).add(fn)},remove=(type,fn)=>h.listeners.get(type)?.delete(fn)
 const globals={window:{addEventListener:add,removeEventListener:remove,setInterval:()=>1,clearInterval:()=>{},confirm:()=>{throw Error('unexpected confirmation')}},document:{hidden:false},navigator:{clipboard:{writeText:async()=>{h.actions.push('clipboard')}}}}
 const previous=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const[k,v]of Object.entries(globals))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v})
 h.render=()=>{h.cursor=0;h.dirty=false;active=h;try{h.output=usePgOriginalAgentRun()}finally{active=null}}
 h.flush=async()=>{for(let i=0;i<30;i++){if(h.dirty)h.render();while(h.effects.length)h.effects.shift()();await Promise.resolve()}return h.output}
 h.change=async(patch,who=h.employee)=>{h.employee=who;h.view={...h.view,...patch};h.controller.publish();return h.flush()}
 h.dispose=()=>{for(const c of h.cells)if(c.kind==='effect')c.cleanup?.();mounted=null;for(const[k,d]of previous)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}
 await h.flush();return h
}
