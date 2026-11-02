import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import {E,OTHER,S,R,A,acceptance,harness} from './helpers/original-version-release-terminal-data.mjs'
const B='90000000-0000-4000-8000-000000000002',source=fs.readFileSync(new URL('../src/pages/VersionRelease/usePgVersionRelease.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('hook.ts',source,ts.ScriptTarget.Latest,true)
assert.equal(tree.parseDiagnostics.length,0)
const effects=[]
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useEffect'){const text=node.getText(tree);if(text.includes('recoverTest(recovered)')||text.includes("previous.get('testRun')===id"))effects.push(text)}ts.forEachChild(node,visit)}visit(tree);assert.equal(effects.length,2)
async function model({oldDependencies=false}={}){
 const reads=[],h=harness({api:{acceptance:async(spec,id)=>{assert.equal(spec,S);reads.push(id);return acceptance({run_id:id,status:id===R?'succeeded':'awaiting_approval',test_current:id===R})},change:async(_spec,choice)=>({spec_id:S,request_id:choice.request_id,replayed:false,run_id:B,status:'queued',source_sha256:A,spec_revision:3})}})
 await h.controller.start(S,R)
 let params=new URLSearchParams({spec:S,testRun:R,retained:'yes'}),previous=[],pending=[]
 const current={getView:()=>h.controller.getView(),recoverTest(id){const promise=h.controller.recoverTest(id);pending.push(promise);return promise}}
 let text=effects.join(';')
 if(oldDependencies){const deps='[recovered,wanted,view.selectedSpecId]';assert(text.includes(deps));text=text.replace(deps,'[recovered,wanted,view.selectedSpecId,view.testRun?.id]')}
 const run=Function('useEffect','recovered','wanted','view','owned','setParams','urlWriteRef',text),urlWriteRef={current:null}
 function render(){const registered=[],setParams=update=>{params=update(params)},view=h.controller.getView();urlWriteRef.current=setParams;run((effect,deps)=>registered.push({effect,deps}),params.get('testRun')??'',S,view,{current},setParams,urlWriteRef);const due=registered.filter((entry,i)=>{const old=previous[i];return!old||entry.deps.some((v,j)=>!Object.is(v,old[j]))});previous=registered.map(entry=>entry.deps);for(const entry of due)entry.effect();return due.length}
 async function settle(frames=8){for(let i=0;i<frames;i++){const due=render(),work=pending;pending=[];await Promise.all(work);if(!due&&!work.length)return i}return frames}
 await settle()
 return{h,reads,settle,render,url:()=>params,route(id){params=new URLSearchParams(params);if(id)params.set('testRun',id);else params.delete('testRun')},async createNew(){h.controller.setTestInstruction('Second actual terminal acceptance');h.controller.setNativeAcceptanceConfirmed(true);await h.controller.handleRunTest();assert.equal(h.controller.getView().testRun?.id,B)}}
}
test('old hook dependency feeds a new local acceptance back into recovery of the old URL run',async()=>{const m=await model({oldDependencies:true});await m.createNew();const before=m.reads.length;assert.equal(await m.settle(8),8);assert(m.reads.slice(before).includes(R));assert(m.reads.slice(before).includes(B));assert(m.reads.length-before>=4)})
test('actual hook mirrors a newly registered run without recovering its older URL, and reaches stable effects',async()=>{const m=await model();await m.createNew();const before=m.reads.length;assert((await m.settle())<3);assert.equal(m.h.controller.getView().testRun.id,B);assert.equal(m.url().get('testRun'),B);assert.deepEqual(m.reads.slice(before),[]);assert.equal(m.url().get('retained'),'yes')})
test('an explicit same-page back/forward URL change still reads its exact owned acceptance once',async()=>{const m=await model();await m.createNew();await m.settle();for(const id of [R,B,R]){const before=m.reads.length;m.route(id);assert((await m.settle())<4);assert.equal(m.h.controller.getView().testRun.id,id);assert.equal(m.url().get('testRun'),id);assert.deepEqual(m.reads.slice(before),[id])}})
test('URL effects cannot restore an old employee after verified owner replacement',async()=>{const m=await model();await m.createNew();await m.settle();m.h.switchEmployee(OTHER);await m.h.controller.checkScope();const before=m.reads.length;m.route(R);await m.settle();assert.equal(m.h.controller.getView().testRun,null);assert.equal(m.h.controller.getView().nativeBlocked,true);assert.deepEqual(m.reads.slice(before),[]);assert.notEqual(E,OTHER)})
