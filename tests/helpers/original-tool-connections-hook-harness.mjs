import fs from 'node:fs'
import {registerHooks} from 'node:module'
import {createHash} from 'node:crypto'
import {owner,terminalTools} from './original-tool-connections-terminal-data.mjs'
// Actual original wrapper + native hook + client/controller. Only React,
// session verification and fetch are terminal DATA ports. No app/server runs.
const entryURL=new URL('../../src/pages/ToolConnections/useToolConnections.ts',import.meta.url).href,pgURL=new URL('../../src/pages/ToolConnections/usePgToolConnections.ts',import.meta.url).href,harnessURL=import.meta.url
let loaded,mounted=null,active=null
registerHooks({resolve(specifier,context,next){
 if(context.parentURL===entryURL){
  if(['react','@/lib/pb','@/lib/studioAuth','@/lib/anonUid'].includes(specifier))return{url:harnessURL,shortCircuit:true}
  if(specifier==='./usePgToolConnections.ts')return{url:pgURL,shortCircuit:true}
  if(specifier==='../../lib/toolPresentation.ts')return{url:new URL('../../src/lib/toolPresentation.ts',import.meta.url).href,shortCircuit:true}
  throw Error('unreviewed original tool wrapper import '+specifier)
 }
 if(context.parentURL===pgURL){
  if(['react','../../lib/studioAuth.ts'].includes(specifier))return{url:harnessURL,shortCircuit:true}
  if(specifier==='../../lib/originalToolConnectionsApi.ts')return{url:new URL('../../src/lib/originalToolConnectionsApi.ts',import.meta.url).href,shortCircuit:true}
  if(specifier==='../../lib/originalToolConnections.ts')return{url:new URL('../../src/lib/originalToolConnections.ts',import.meta.url).href,shortCircuit:true}
  if(specifier==='../../lib/toolPresentation.ts')return{url:new URL('../../src/lib/toolPresentation.ts',import.meta.url).href,shortCircuit:true}
  throw Error('unreviewed original PG tool hook import '+specifier)
 }return next(specifier,context)
},load(url,context,next){const result=next(url,context);if(url!==entryURL)return result;return{...result,source:"import.meta.env={VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED:'true'};\n"+Buffer.from(result.source).toString('utf8')}}})
const current=()=>{if(!active)throw Error('hook outside terminal render');return active},same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
function cell(kind,init){const h=current(),i=h.cursor++;if(!h.cells[i]){h.cells[i]=init(h);h.cells[i].kind=kind}if(h.cells[i].kind!==kind)throw Error('unstable original tool hook order');return h.cells[i]}
export function useState(initial){const c=cell('state',h=>{const v={value:typeof initial==='function'?initial():initial};v.set=next=>{const value=typeof next==='function'?next(v.value):next;if(!Object.is(value,v.value)){v.value=value;h.dirty=true}};return v});return[c.value,c.set]}
export function useRef(value){return cell('ref',()=>({value:{current:value}})).value}
export function useMemo(work,deps){const c=cell('memo',()=>({deps:undefined,value:undefined}));if(!same(c.deps,deps)){c.deps=deps;c.value=work()}return c.value}
export const useCallback=(work,deps)=>useMemo(()=>work,deps)
export function useEffect(effect,deps){const h=current(),c=cell('effect',()=>({deps:undefined,cleanup:null}));if(!same(c.deps,deps)){c.deps=deps;h.effects.push(()=>{c.cleanup?.();c.cleanup=effect()??null})}}
export const LOCAL_ANON_UID='not-a-native-identity'
export function getPocketBaseUrl(){throw Error('unexpected legacy tool backend')}
export function vibexAuthHeaders(){throw Error('unexpected legacy tool headers')}
export function decodeRhToken(){throw Error('unexpected legacy tool identity')}
export function getStudioAccountInfo(){return mounted&&mounted.currentEmployee?{id:mounted.currentEmployee,active:true,role:'employee'}:null}
export async function verifyStudioSession(){if(mounted?.verifyError)throw mounted.verifyError;return mounted?.sessionStatus??'authenticated'}
export function redirectToRhLogin(){if(mounted)mounted.redirects++}
export const sourceBinding=()=>[entryURL,pgURL,new URL('../../src/lib/originalToolConnections.ts',import.meta.url).href].map(url=>({url,sha256:createHash('sha256').update(fs.readFileSync(new URL(url))).digest('hex'),actual_React_or_browser:false}))
export async function createOriginalToolHookHarness(options={}){
 loaded??=import(entryURL);const {useToolConnections}=await loaded
 const h={cells:[],cursor:0,effects:[],dirty:true,output:null,disposed:false,currentEmployee:owner,sessionStatus:'authenticated',verifyError:null,redirects:0,storage:new Map(options.storage??[]),listeners:new Map(),driver:terminalTools(options)}
 mounted=h
 const listen=(type,fn)=>{if(!h.listeners.has(type))h.listeners.set(type,new Set());h.listeners.get(type).add(fn)},unlisten=(type,fn)=>h.listeners.get(type)?.delete(fn)
 const globals={window:{addEventListener:listen,removeEventListener:unlisten},document:{visibilityState:'visible',addEventListener:listen,removeEventListener:unlisten},sessionStorage:{getItem:key=>h.storage.get(key)??null,setItem:(key,value)=>h.storage.set(key,value),removeItem:key=>h.storage.delete(key)},fetch:(...args)=>h.driver.transport(...args)}
 const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));for(const[key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
 h.render=()=>{h.cursor=0;h.dirty=false;active=h;try{h.output=useToolConnections()}finally{active=null}}
 h.flush=async()=>{for(let i=0;i<80;i++){if(h.dirty)h.render();while(h.effects.length)h.effects.shift()();await Promise.resolve()}await new Promise(resolve=>setImmediate(resolve));if(h.dirty)h.render();while(h.effects.length)h.effects.shift()();return h.output}
 h.emit=async type=>{for(const fn of [...h.listeners.get(type)??[]])fn();return h.flush()}
 h.dispose=()=>{if(h.disposed)return;h.disposed=true;if(mounted===h)mounted=null;for(const c of h.cells)if(c.kind==='effect')c.cleanup?.();for(const[key,d]of previous)if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}
 await h.flush();return h
}
