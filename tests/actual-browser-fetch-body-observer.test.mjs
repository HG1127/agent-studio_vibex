// VM and real in-memory Fetch Responses only; no browser/server/DB evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {installActualBrowserFetchBodyObserver as install} from './helpers/actual-browser-fetch-body-observer.mjs'
const config={key:'__f05ActualBodyObservation',basePath:'/api/v2/agent-plan-workflow',maxBytes:524288},path=config.basePath+'/preview'
function fixture(fetch){const window={fetch},location={href:'https://localhost:17443/index.html',origin:'https://localhost:17443'};vm.runInNewContext('('+install.toString()+')('+JSON.stringify(config)+')',{window,location,URL,TextDecoder,Uint8Array});return {window,observe:window[config.key]}}
async function read(f,id){for(let i=0;i<100&&!f.observe.ready(id);i++)await new Promise(setImmediate);assert.equal(f.observe.ready(id),true);return f.observe.read(id)}
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}})
test('original fetch Promise, Response, URL, options and AbortSignal identities are unchanged, with one fetch',async()=>{
 const original=response({request_id:'same',input:'actual'}),promise=Promise.resolve(original),controller=new AbortController(),options=Object.freeze({method:'POST',body:'{"purpose":"synthetic"}',signal:controller.signal});let calls=0,args
 const f=fixture((...value)=>{calls++;args=value;return promise}),id=f.observe.arm(path,'POST'),actual=f.window.fetch('/__pg_native'+path,options)
 assert.equal(actual,promise);assert.equal(await actual,original);assert.equal(args[0],'/__pg_native'+path);assert.equal(args[1],options);assert.equal(args[1].signal,controller.signal)
 assert.equal(await original.text(),'{"request_id":"same","input":"actual"}');const observed=await read(f,id)
 assert.equal(observed.error,undefined);assert.equal(observed.status,200);assert.equal(observed.value.request_id,'same');assert.equal(observed.request.purpose,'synthetic');assert.equal(calls,1)
})
test('unarmed or foreign requests are not cloned and remain the same original transport',async()=>{
 let clones=0;const original=response({ok:true}),clone=original.clone.bind(original);original.clone=()=>{clones++;return clone()};const promise=Promise.resolve(original),f=fixture(()=>promise)
 f.observe.arm(path,'POST');assert.equal(f.window.fetch('https://other.example'+path,{method:'POST'}),promise);await promise;await new Promise(setImmediate);assert.equal(clones,0)
})
test('complete actual EOF is required even after valid JSON bytes arrive',async()=>{
 let streamController;const raw=new Response(new ReadableStream({start(value){streamController=value;value.enqueue(new TextEncoder().encode('{"ok":true}'))}}),{headers:{'content-type':'application/json'}}),f=fixture(()=>Promise.resolve(raw)),id=f.observe.arm(path,'GET')
 await f.window.fetch(path,{method:'GET'});await new Promise(setImmediate);assert.equal(f.observe.ready(id),false);streamController.close();const observed=await read(f,id);assert.equal(observed.value.ok,true)
})
test('malformed, length-mismatched, oversized and invalid UTF-8 clones fail without replacing the original Response',async()=>{
 const values=[()=>new Response('bad',{headers:{'content-type':'application/json'}}),()=>new Response('{"ok":true}',{headers:{'content-type':'application/json','content-length':'1'}}),()=>new Response('x'.repeat(524289),{headers:{'content-type':'application/json'}}),()=>new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}})]
 for(const make of values){const original=make(),f=fixture(()=>Promise.resolve(original)),id=f.observe.arm(path,'GET');assert.equal(await f.window.fetch(path,{method:'GET'}),original);const observed=await read(f,id);assert.equal(observed.error,'actual_response_body_incomplete');assert.equal(observed.value,undefined)}
})
test('original fetch rejection is neither swallowed nor retried',async()=>{
 const failure=Error('actual_fetch_aborted');let calls=0;const f=fixture(()=>{calls++;return Promise.reject(failure)}),id=f.observe.arm(path,'GET')
 await assert.rejects(f.window.fetch(path,{method:'GET'}),error=>error===failure);assert.equal((await read(f,id)).error,'actual_response_body_incomplete');assert.equal(calls,1)
})
test('each arm consumes one matching actual response and one read, without changing body or request identity',async()=>{
 let count=0;const f=fixture(()=>Promise.resolve(response({sequence:++count}))),one=f.observe.arm(path,'GET'),two=f.observe.arm(path,'GET')
 await f.window.fetch(path,{method:'GET'});await f.window.fetch(path,{method:'GET'});assert.equal((await read(f,one)).value.sequence,1);assert.equal((await read(f,two)).value.sequence,2);assert.equal(f.observe.read(one),null);assert.equal(count,2)
})
