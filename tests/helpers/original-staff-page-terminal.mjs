// Execute the actual accepted page with terminal React/JSX and browser DATA ports.
// SDKs, contract decoders, hashing and request state machines remain real.
// No DOM, listener, SQL engine, HTTP server, Worker or provider is started.
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as staff from '../../src/lib/originalStaffApi.ts'
import * as account from '../../src/lib/originalAccountApi.ts'
import * as ux from '../../src/lib/accountUx.ts'
import * as localContract from '../../shared/native-local-device-contract.mjs'
import * as staffContract from '../../shared/original-staff-contract.mjs'
const source=readFileSync(new URL('../../src/pages/Staff/StaffPage.tsx',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}})
if(compiled.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('page syntax failed')
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
export async function originalStaffPageTerminal(options={}){
 const h={cells:[],cursor:0,effects:[],dirty:true,tree:null,owner:options.owner,status:'authenticated',listeners:new Set(),assignments:[],pbSaves:0,pbClears:0,confirm:options.confirm??(async()=>true),storage:new Map(Object.entries(options.storage??{})),calls:[],disposed:false}
 const cell=(kind,init)=>{const i=h.cursor++;if(!h.cells[i])h.cells[i]={kind,...init()};if(h.cells[i].kind!==kind)throw Error('unstable hook order');return h.cells[i]}
 const react={useState(initial){const c=cell('state',()=>({value:typeof initial==='function'?initial():initial}));return[c.value,next=>{const value=typeof next==='function'?next(c.value):next;if(!Object.is(value,c.value)){c.value=value;h.dirty=true}}]},useRef(value){return cell('ref',()=>({value:{current:value}})).value},useCallback(fn,deps){const c=cell('callback',()=>({fn,deps}));if(!same(c.deps,deps)){c.fn=fn;c.deps=deps}return c.fn},useEffect(effect,deps){const c=cell('effect',()=>({deps:null,cleanup:null}));if(!same(c.deps,deps)){c.deps=deps;h.effects.push(()=>{c.cleanup?.();c.cleanup=effect()??null})}}}
 const node=(type,props,key)=>typeof type==='function'?type(props??{}):({type,props:props??{},key}),jsx={jsx:node,jsxs:node,Fragment:'Fragment'},pb={authStore:{token:'Synthetic stale PB token',record:{id:'stale-pocketbase'},save(){h.pbSaves++},clear(){h.pbClears++}}},auth={getStudioAccountInfo:()=>h.owner?{id:h.owner,active:true}:null,verifyStudioSession:async()=>h.status,vibexAuthHeaders:()=>({})}
 const modules={'react':react,'react/jsx-runtime':jsx,'lucide-react':new Proxy({},{get:(_target,key)=>'icon:'+String(key)}),'@/components/site/SiteShell':{SiteShell:'SiteShell'},'@/components/ui/dialog':Object.fromEntries(['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'].map(k=>[k,k])),'@/components/ui/PasswordField':{PasswordField:'PasswordField'},'@/lib/studioDialogs':{confirmInStudio:message=>h.confirm(message)},'@/lib/pb':{pb,getPocketBaseUrl:()=>'/__pb'},'@/lib/studioAuth':auth,'@/lib/accountUx':ux,'@/lib/studioBackend':{ORIGINAL_PG_UI_ENABLED:options.native!==false},'@/lib/studioSessionPrivacy':{subscribeStudioSessionPrivacy:fn=>{h.listeners.add(fn);return()=>h.listeners.delete(fn)},invalidateStudioSessionPrivacy:()=>h.invalidate()},'@/lib/originalStaffApi':staff,'@/lib/originalAccountApi':account,'../../../shared/native-local-device-contract.mjs':localContract,'../../../shared/original-staff-contract.mjs':staffContract}
 const storage={getItem:key=>h.storage.get(key)??null,setItem:(key,value)=>{if(options.failStorage)throw Error('terminal storage unavailable');h.storage.set(key,value)},removeItem:key=>h.storage.delete(key)}
 const globals={fetch:async(route,init)=>{h.calls.push({route,init});return options.transport(route,init,h)},sessionStorage:storage,window:{location:{assign:path=>h.assignments.push(path)}}},previous=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const[k,v]of Object.entries(globals))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v})
 modules['./PocketBaseStaffPage']={__esModule:true,default:'PocketBaseStaffPage'}
 const module={exports:{}};new Function('require','module','exports',compiled.outputText)(name=>{if(!Object.hasOwn(modules,name))throw Error('unreviewed terminal import '+name);return modules[name]},module,module.exports)
 h.render=()=>{h.cursor=0;h.dirty=false;h.tree=module.exports.default({accountOnly:options.accountOnly??false})}
 h.flush=async()=>{for(let i=0;i<40;i++){if(h.dirty&&!h.disposed)h.render();while(h.effects.length)h.effects.shift()();await new Promise(resolve=>setImmediate(resolve))}return h.tree}
 h.nodes=(predicate)=>{const out=[];const walk=value=>{if(Array.isArray(value)){value.forEach(walk);return}if(!value||typeof value!=='object'||!Object.hasOwn(value,'type'))return;if(predicate(value))out.push(value);walk(value.props.children)};walk(h.tree);return out}
 h.text=value=>{if(Array.isArray(value))return value.map(h.text).join('');if(value===null||value===undefined||typeof value==='boolean')return '';return typeof value==='object'?h.text(value.props?.children):String(value)}
 h.find=(type,predicate=()=>true)=>{const found=h.nodes(n=>n.type===type&&predicate(n.props));if(found.length!==1)throw Error('expected exactly one '+type+', found '+found.length);return found[0]}
 h.click=async(text)=>{const button=h.find('button',p=>h.text(p.children)===text);if(button.props.disabled)throw Error('terminal click on disabled button');const result=button.props.onClick();await h.flush();return result}
 h.change=async(type,predicate,value)=>{const input=h.find(type,predicate);input.props.onChange({target:{value}});await h.flush()}
 h.invalidate=(nextOwner=h.owner)=>{h.owner=nextOwner;for(const listener of [...h.listeners])listener()}
 h.dispose=()=>{h.disposed=true;for(const c of h.cells)if(c.kind==='effect')c.cleanup?.();for(const[k,d]of previous)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}
 try{await h.flush();return h}catch(error){h.dispose();throw error}
}
