import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {confirmInStudio,inputInStudio,noticeInStudio,respondToStudioDialog,subscribeStudioDialogs} from '../src/lib/studioDialogs.ts'
import {invalidateStudioSessionPrivacy} from '../src/lib/studioSessionPrivacy.ts'
import {registerUnsavedWorkCheck,shouldNavigateFromUnsavedWorkAsync,isSameEditorRoute,installUnsavedHistoryGuard,recordRenderedStudioRoute,protectInternalLinkClickAsync} from '../src/lib/unsavedNavigation.ts'

const settle=()=>new Promise(resolve=>setImmediate(resolve))
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
test('accepted dialogs deny consent and input while the actual host is absent',async()=>{
 assert.equal(await confirmInStudio('确认修改？'),false);assert.equal(await inputInStudio('修改名称'),null);await noticeInStudio('操作提示')
})
test('actual queued confirm/input/notice interactions retain accepted behavior',async()=>{
 let current;const off=subscribeStudioDialogs(value=>{current=value})
 try{
  const first=confirmInStudio('确认第一个操作？'),second=inputInStudio('修改名称'),third=noticeInStudio('操作提示')
  assert.equal(current.mode,'confirm');respondToStudioDialog(current.id,true);assert.equal(await first,true)
  assert.equal(current.mode,'input');respondToStudioDialog(current.id,'新名称');assert.equal(await second,'新名称')
  assert.equal(current.mode,'notice');respondToStudioDialog(current.id,true);await third;assert.equal(current,null)
 }finally{off()}
})
for(const mode of ['confirm','input'])test('privacy invalidation denies every old '+mode+' dialog and stale consent cannot approve the replacement context',async()=>{
 let current;const off=subscribeStudioDialogs(value=>{current=value})
 try{
  const pending=mode==='confirm'?confirmInStudio('旧员工的操作'):inputInStudio('旧员工的名称'),id=current.id,queued=inputInStudio('旧员工的队列')
  invalidateStudioSessionPrivacy();assert.equal(current,null);assert.equal(await pending,mode==='confirm'?false:null);assert.equal(await queued,null)
  const replacement=confirmInStudio('新员工的操作');assert.notEqual(current.id,id);respondToStudioDialog(id,true);assert.equal(current.message,'新员工的操作');respondToStudioDialog(current.id,false);assert.equal(await replacement,false)
 }finally{off()}
})
test('removing the final host denies active and queued requests',async()=>{
 let current;const off=subscribeStudioDialogs(value=>{current=value});const first=confirmInStudio('未确认操作'),second=inputInStudio('未提交名称');assert(current);off();assert.equal(await first,false);assert.equal(await second,null)
})
test('accepted editor identity distinguishes knowledge bases and preserves same-document steps',async()=>{
 assert.equal(isSameEditorRoute('/knowledge-bases?base=a','/knowledge-bases?base=b'),false)
 assert.equal(isSameEditorRoute('/agent-create?spec=a','/agent-create?spec=a&step=2'),true)
 const off=registerUnsavedWorkCheck(()=>true);let asked=0
 try{
  assert.equal(await shouldNavigateFromUnsavedWorkAsync('/knowledge-bases?base=a','/knowledge-bases?base=b',async()=>{asked++;return false}),false);assert.equal(asked,1)
  assert.equal(await shouldNavigateFromUnsavedWorkAsync('/agent-create','/skills',()=>{throw Error('dialog failed')}),false)
  assert.equal(await shouldNavigateFromUnsavedWorkAsync('/agent-create','/skills',async()=>true),true)
 }finally{off()}
})
function historyWindow(){
 const callbacks=new Map(),timers=new Map(),calls=[],paths={2:'/skills',3:'/agent-create?spec=a'};let serial=0
 const win={location:{pathname:'/agent-create',search:'?spec=a'},history:{state:{idx:3},go(offset){calls.push(offset);win.history.state={idx:win.history.state.idx+offset};setPath(paths[win.history.state.idx]);emit()}},addEventListener(name,callback){callbacks.set(name,callback)},removeEventListener(name,callback){if(callbacks.get(name)===callback)callbacks.delete(name)},setTimeout(callback){timers.set(++serial,callback);return serial},clearTimeout(id){timers.delete(id)}}
 function setPath(path){const value=new URL(path,'https://studio.test');win.location.pathname=value.pathname;win.location.search=value.search}
 function emit(){const event={state:win.history.state,stopped:false,stopImmediatePropagation(){this.stopped=true}};callbacks.get('popstate')?.(event);return event}
 return{win,calls,timers,back(){win.history.state={idx:2};setPath(paths[2]);return emit()},displace(){setPath('/other')},emit}
}
test('actual history guard restores the current editor before awaiting a branded decision, then permits one approved traversal',async()=>{
 const dirty=registerUnsavedWorkCheck(()=>true),answer=deferred(),f=historyWindow();recordRenderedStudioRoute('/agent-create?spec=a',3);const off=installUnsavedHistoryGuard(f.win,()=>answer.promise)
 try{assert.equal(f.back().stopped,true);assert.deepEqual(f.calls,[1]);assert.equal(f.win.history.state.idx,3);await settle();answer.resolve(true);await settle();assert.deepEqual(f.calls,[1,-1]);assert.equal(f.win.history.state.idx,2)}finally{off();dirty()}
})
for(const reason of ['uninstalled','displaced','denied','dialog rejected','dialog threw'])test('delayed history consent cannot navigate after '+reason,async()=>{
 const dirty=registerUnsavedWorkCheck(()=>true),answer=deferred(),f=historyWindow();recordRenderedStudioRoute('/agent-create?spec=a',3)
 const ask=reason==='dialog threw'?()=>{throw Error('terminal dialog fault')}:reason==='dialog rejected'?()=>Promise.reject(Error('terminal dialog fault')):()=>answer.promise,off=installUnsavedHistoryGuard(f.win,ask)
 try{f.back();await settle();if(reason==='uninstalled')off();if(reason==='displaced')f.displace();answer.resolve(reason!=='denied');await settle();assert.deepEqual(f.calls,[1])}finally{off();dirty()}
})
for(const errorMode of ['throw','reject'])test('actual SPA anchor interception denies '+errorMode+' without escaping or navigating',async()=>{
 const previous=globalThis.Element,dirty=registerUnsavedWorkCheck(()=>true);const anchor={href:'https://studio.test/skills',target:'',hasAttribute:()=>false};class Element{closest(){return anchor}}globalThis.Element=Element
 const event={button:0,defaultPrevented:false,target:new Element(),preventDefault(){this.defaultPrevented=true},stopPropagation(){},stopImmediatePropagation(){}},routes=[]
 try{const ask=()=>{if(errorMode==='throw')throw Error('terminal dialog fault');return Promise.reject(Error('terminal dialog fault'))};assert.equal(protectInternalLinkClickAsync(event,'https://studio.test/agent-create',ask,to=>routes.push(to)),false);assert.equal(event.defaultPrevented,true);await settle();assert.deepEqual(routes,[])}finally{globalThis.Element=previous;dirty()}
})
test('actual accepted host mounts above routes while basename and server-verified authentication stay in their existing modules',()=>{
 const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8'),host=readFileSync(new URL('../src/components/site/StudioDialogHost.tsx',import.meta.url),'utf8'),auth=readFileSync(new URL('../src/lib/studioAuth.ts',import.meta.url),'utf8')
 assert(main.includes('<StudioDialogHost/><BrowserRouter'));assert(main.includes('getStudioBasename as getBasename'));assert(!main.includes('window.confirm'));assert(host.includes('onPointerDownOutside={event=>event.preventDefault()}'));assert(host.includes('<DialogDescription'));assert(host.includes('maxLength={500}'));assert(!host.includes('dangerouslySetInnerHTML'));assert(auth.includes('createPgEmployeeSession'));assert(auth.includes('invalidateStudioSessionPrivacy()\n  if (pgAuth)'))
})
