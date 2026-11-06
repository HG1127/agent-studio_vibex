// Pure protocol/stream tests. No listener, socket, DNS, PG, Worker, CLI process,
// provider or positive external response is constructed by these checks.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {nativeRequestPlan,readNativeResponse} from '../../../local-executor/native-connection.mjs'
import {nativeLocalCliFailureCodes} from './helpers/native-local-cli-failure-codes.mjs'
const token='a'.repeat(64)
function response(parts,{status=200,type='application/json; charset=utf-8',encoding}={}){const stream=Readable.from(parts);stream.statusCode=status;stream.headers={'content-type':type,...(encoding?{'content-encoding':encoding}:{})};return stream}
test('actual Node fetch injects forbidden browser metadata even with credentials omitted; intercept before any network',async()=>{
 let seen,calls=0
 await assert.rejects(fetch('https://native.invalid/api/public/native-local-executor/pair-confirm',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'},credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',dispatcher:{dispatch(options,handler){seen=options.headers;calls++;handler.onError(Error('intercepted_before_network'));return true}}}))
 const headers={};if(Array.isArray(seen)){for(let i=0;i<seen.length;i+=2)headers[String(seen[i]).toLowerCase()]=String(seen[i+1])}else for(const [key,value]of Object.entries(seen??{}))headers[key.toLowerCase()]=String(value)
 assert.equal(calls,1);assert.equal(headers['sec-fetch-mode'],'cors')
})
test('native CLI request plan fixes route and byte length and emits only its closed protocol headers',()=>{
 for(const operation of ['pair','pair-confirm','poll','check','complete','confirm']){
  const plan=nativeRequestPlan('https://native.example.test/__pg_native/',operation,{label:'中文'},operation.startsWith('pair')?undefined:token)
  assert.equal(plan.url.href,'https://native.example.test/__pg_native/api/public/native-local-executor/'+operation);assert.equal(plan.options.method,'POST');assert.equal(plan.options.agent,false);assert.equal(plan.options.rejectUnauthorized,true);assert.equal(plan.options.minVersion,'TLSv1.2');assert.equal(plan.options.headers['Content-Length'],String(plan.bytes.length));assert.ok(plan.bytes.length>JSON.stringify({label:'中文'}).length)
  const expected=['Accept','Content-Type','Content-Length',...(operation.startsWith('pair')?[]:['X-Studio-Device-Token'])].sort();assert.deepEqual(Object.keys(plan.options.headers).sort(),expected)
  assert.ok(!Object.keys(plan.options.headers).some(k=>/^(?:cookie|authorization|origin|referer|sec-fetch-)/i.test(k)))
 }
})
test('native CLI keeps server URL restrictions, exact operations, token syntax and request bound',()=>{
 for(const server of ['http://outside.example','https://user:password@native.example','https://native.example/path','https://native.example/?query=1','https://native.example/#fragment'])assert.throws(()=>nativeRequestPlan(server,'poll',{},token),/native_local_server_refused/)
 for(const operation of ['pair/confirm','../poll','poll?x=1','get'])assert.throws(()=>nativeRequestPlan('https://native.example',operation,{},token),/native_local_operation_refused/)
 assert.throws(()=>nativeRequestPlan('https://native.example','poll',{},'bad\r\nCookie: x'),/native_local_device_token_invalid/);assert.throws(()=>nativeRequestPlan('https://native.example','complete',{text:'x'.repeat(1450000)},token),/native_local_request_limit/)
 assert.equal(nativeRequestPlan('http://127.0.0.1:17443','poll',{},token).url.protocol,'http:')
})
test('native CLI propagates cancellation without clearing or bypassing the original signal',()=>{const controller=new AbortController();controller.abort();assert.equal(nativeRequestPlan('https://native.example','poll',{},token,controller.signal).options.signal.aborted,true)})
test('native response stream decodes actual bytes and retains response limit, UTF8, type, encoding and redirect fences',async()=>{
 assert.deepEqual(await readNativeResponse(response([Buffer.from('{"job":'),Buffer.from('null}')])),{job:null})
 for(const stream of [response([Buffer.alloc(1450001,32)]),response([Buffer.from([0xff])]),response([Buffer.from('not-json')]),response([Buffer.from('{}')],{type:'text/plain'}),response([Buffer.from('{}')],{encoding:'gzip'}),response([],{status:302})])await assert.rejects(()=>readNativeResponse(stream),/native_local_(?:invalid_response|redirect_refused)/)
})
test('native response errors retain only fixed status-based codes and never include remote bodies',async()=>{
 for(const [status,code]of [[403,'native_local_authorization_denied'],[404,'native_local_receipt_not_found'],[503,'native_local_transport_unknown']])await assert.rejects(()=>readNativeResponse(response([Buffer.from('{"secret":"never-copy-this-remote-detail"}')],{status})),error=>error.status===status&&error.message===code&&!error.message.includes('never-copy'))
})
test('test-only CLI diagnostic projection emits bounded known codes and excludes secrets, paths and arbitrary errors',()=>{const raw='secret '+'b'.repeat(64)+' C:/private/credentials.key native_local_authorization_denied arbitrary_failure native_local_authorization_denied ERR_TLS_CERT_ALTNAME_INVALID';assert.deepEqual(nativeLocalCliFailureCodes(raw),['native_local_authorization_denied','ERR_TLS_CERT_ALTNAME_INVALID']);assert.deepEqual(nativeLocalCliFailureCodes('unknown output'),[])})
