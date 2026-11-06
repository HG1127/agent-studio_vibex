// Actual hook and privacy helper; React/session/controller are explicit unit DATA ports.
// No browser, real Cookie, HTTP service, provider or backend runtime is created.
import {registerHooks} from 'node:module'
const pgURL=new URL('../../src/pages/AgentRun/usePgOriginalAgentRun.ts',import.meta.url).href,qualityURL=new URL('../../src/lib/useOriginalAgentQuality.ts',import.meta.url).href,harnessURL=import.meta.url
let mounted=null,active=null,loaded
registerHooks({resolve(specifier,context,next){
 if(context.parentURL===qualityURL&&specifier==='react')return{url:harnessURL,shortCircuit:true}
 if(context.parentURL!==pgURL)return next(specifier,context)
 if(['../../../shared/original-agent-run-options.ts','../../lib/originalAgentRunPreparationApi.ts','../../lib/agentTaskDispatch.ts','../../lib/localDeviceConnection.ts','../../lib/useOriginalAgentQuality.ts','../../lib/originalAgentRunPrivacy.ts','../../lib/runPresentation.ts'].includes(specifier))return{url:new URL(specifier,pgURL).href,shortCircuit:true}
 if(['react','react-router-dom','../../lib/pgNativePilotApi.ts','../../lib/originalModelConnectionsApi.ts','../../lib/originalHomeAgentApi.ts','../../lib/originalHomeInboxApi.ts','../../lib/originalAgentRunTransport.ts','../../lib/originalAgentRunSession.ts','../../lib/studioAuth.ts','../../lib/unsavedNavigation.ts','./useAgentRun.ts'].includes(specifier))return{url:harnessURL,shortCircuit:true}
 throw Error('unreviewed private-hook import '+specifier)
},load(url,context,next){const result=next(url,context);if(url!==pgURL)return result;return{...result,source:"import.meta.env={VITE_AGENT_STUDIO_ORIGINAL_ROLES_UI_ENABLED:'false'};\n"+Buffer.from(result.source).toString('utf8')}}})
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
function cell(kind,init){if(!active)throw Error('hook outside unit render');const h=active,i=h.cursor++;if(!h.cells[i]){h.cells[i]=init(h);h.cells[i].kind=kind}if(h.cells[i].kind!==kind)throw Error('unstable hook order');return h.cells[i]}
export function useState(initial){const c=cell('state',h=>{const v={value:typeof initial==='function'?initial():initial};v.set=n=>{const next=typeof n==='function'?n(v.value):n;if(!Object.is(next,v.value)){v.value=next;h.dirty=true}};return v});return[c.value,c.set]}
export function useRef(value){return cell('ref',()=>({value:{current:value}})).value}
export function useEffect(effect,deps){const h=active,c=cell('effect',()=>({deps:null,cleanup:null}));if(!same(c.deps,deps)){c.deps=deps;h.effects.push(()=>{c.cleanup?.();c.cleanup=effect()??null})}}
export function useSearchParams(){return[new URLSearchParams(),()=>{}]}
export const BUILTIN_TOOLS=[],FEEDBACK_TAGS=[],RUN_STATE_META={}
export const getStudioAccountInfo=()=>mounted?.auth?mounted.auth.account():mounted?.employee?{id:mounted.employee,active:true}:null
export const verifyStudioSession=async()=>mounted?.auth?mounted.auth.verify():mounted?.status??'authenticated'
export const redirectToRhLogin=()=>{}
export const registerUnsavedWorkCheck=()=>()=>{}
export const createPgNativePilotApi=()=>({})
export const createOriginalModelConnectionsApi=()=>({listSnapshot:async()=>{throw Error('unit controller must not call model source')}})
export const createOriginalHomeAgentApi=()=>({})
export const createOriginalHomeInboxApi=()=>({})
export const createOriginalAgentRunTransport=()=>({transport:async()=>{throw Error('network forbidden in hook unit')},close(){}})
export function createOriginalAgentRunSession(options){const h=mounted,listeners=new Set();const c={snapshot:()=>h.view,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},publish(){listeners.forEach(f=>f())},activate:async()=>{},verifyIdentity:async()=>{await options.verifyEmployee()},hidePrivateForIdentity(owner=false){h.view={...h.view,suspended:true,ownerChanged:owner};listeners.forEach(f=>f())},navigationBlocked:()=>false,retireRunDraft(){h.retiredDrafts++},dispose(){h.disposedControllers++},readResultForCopy:async()=>h.view.activeRun?.result??'',selectRun:async()=>{},selectAgent:async()=>{},poll:async()=>{},reportUnavailable(){},dismissError(){}}
 for(const name of ['submit','control','decide','submitFeedback','forgetMemory','respond'])c[name]=async()=>{h.actions.push(name)}
 h.controller=c;return c
}
export async function originalAgentRunPrivateHookHarness(employee,auth=null){
 loaded??=import(pgURL);const {usePgOriginalAgentRun}=await loaded
 const id='44444444-4444-4444-8444-444444444444',spec='33333333-3333-4333-8333-333333333333',stamp='2026-11-03T00:00:00.000Z'
 const detail={execution_mode:'agent_native_v2',replayed:false,run:{id,owner_user_id:employee,agent_spec_id:spec,workflow_id:null,kind:'agent',status:'awaiting_input',instruction:'PRIVATE_INSTRUCTION',result_text:'PRIVATE_RESULT',step_count:0,checkpoint:{stage:'agent_v2_human_input',spec_revision:1,max_steps:3,require_plan_review:false},last_error_code:'',created_at:stamp,updated_at:stamp,finished_at:null},steps:[],steps_truncated:false,approvals:[],pending_effect:null,human_input_current:true,human_input:{question:'PRIVATE_QUESTION',draft:'PRIVATE_PLAN',kind:'clarification',pending_sha256:'a'.repeat(64)}}
 const h={employee,auth,status:'authenticated',cells:[],cursor:0,effects:[],dirty:true,output:null,actions:[],retiredDrafts:0,disposedControllers:0,controller:null,listeners:new Map(),view:{employeeId:employee,identityEpoch:0,qualitySelectionEpoch:0,closed:false,suspended:false,recovering:false,sourceDenied:false,ownerChanged:false,loading:false,agents:[],nativeAgents:[],models:[],selectedAgentId:'',caps:null,preparation:null,preparationChoice:{localDeviceId:String(),structuredPlanning:false},preparationLoading:false,preparationError:'',optimizationRecovery:{loading:false,candidate:null,linked:false,error:''},workspace:{items:[],pending_items:[],pending_count:0,agent_run_total:0},runs:{detail,runs:[],loading:false,busy:false,error:'',pendingSubmit:null,pendingMutation:null,pendingHumanResponse:null},feedback:{busy:false,loading:false,status:null,pending:null,error:''},memories:{items:[],loading:false,busy:false,pending:null,error:''},activeRun:{id,spec_id:spec,spec_revision:1,instruction:'PRIVATE_INSTRUCTION',result:'PRIVATE_RESULT',status:'awaiting_input',current_step:0,max_steps:3,feedback:null,created:stamp,updated:stamp},runHistory:[],pendingApproval:null,error:'',notice:''}}
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
