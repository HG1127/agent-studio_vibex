// Actual provider factory; synthetic DNS/request streams only. No socket/provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {createModelDraftDiscoveryProvider} from '../services/pg-api/src/model-draft-discovery-provider.ts'
import {parseModelDraftProbeInput,modelDraftProbeProtocol} from '../shared/model-draft-probe-contract.ts'
const key='synthetic-draft-probe-key-1010',input={provider:'openai',base_url:'https://api.openai.com/v1',api_key:key},requestId='11111111-1111-4111-8111-111111111111'
function wire(pages=[{data:[{id:'provider-real-model-id'}]}],options={}){const requests=[],dns=[],events=[];let at=0,checks=0
 const resolver={resolve4:async host=>{dns.push(host);if(options.dnsError)throw Error('PRIVATE_DIAGNOSTIC');return options.addresses??['8.8.8.8']},resolve6:async()=>[]}
 const request=(args,callback)=>{requests.push(args);events.push('GET');const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>req.emit('error',Error('PRIVATE_DIAGNOSTIC'));req.end=()=>queueMicrotask(()=>{const stream=new PassThrough();stream.statusCode=options.status??200;stream.headers={'content-type':options.type??'application/json',...(options.headers??{})};callback(stream);stream.end(options.bytes??Buffer.from(JSON.stringify(pages[at++]??pages.at(-1))))});return req}
 const probe=createModelDraftDiscoveryProvider(resolver,request);return{requests,dns,events,run:(v=input)=>probe(v,async()=>{checks++;events.push('verified_owner');if(options.authError)throw Error('PRIVATE_IDENTITY')}),checks:()=>checks}
}
test('strict draft union has no caller owner, model cache, save flag or mixed credential fields',()=>{
 const body={protocol:modelDraftProbeProtocol,request_id:requestId,provider:'openai',base_url:input.base_url,credential:{kind:'draft',api_key:key}};assert.deepEqual(parseModelDraftProbeInput(body),body)
 for(const bad of [{...body,owner_user_id:requestId},{...body,models:['invented']},{...body,save:true},{...body,credential:{kind:'draft',api_key:key,connection_id:requestId}},{...body,credential:{kind:'saved',connection_id:requestId,expected_revision:1,api_key:key}}])assert.throws(()=>parseModelDraftProbeInput(bad))
 let called=0;const getter=Object.defineProperty({},'api_key',{enumerable:true,get(){called++;return key}});assert.throws(()=>parseModelDraftProbeInput({...body,credential:getter}));assert.equal(called,0)
})
test('actual GET factory returns provider IDs, with verified owner gates before DNS/dial and pinned TLS/auth headers',async()=>{
 const w=wire(),out=await w.run();assert.equal(out.ok,true);assert.deepEqual(out.models,['provider-real-model-id']);assert.equal(out.complete,true);assert.equal(w.requests.length,1);assert.deepEqual(w.events,['verified_owner','verified_owner','GET']);const req=w.requests[0];assert.equal(req.method,'GET');assert.equal(req.path,'/v1/models');assert.equal(req.headers.Authorization,'Bearer '+key);assert.equal(req.rejectUnauthorized,true);assert.equal(req.agent,false);assert.equal(req.minVersion,'TLSv1.2');req.lookup('ignored',{},(_e,address,family)=>{assert.equal(address,'8.8.8.8');assert.equal(family,4)})
})
test('allowlist and unsafe mixed DNS refuse before credential header construction or dial',async()=>{
 for(const base_url of ['http://127.0.0.1/v1','https://other.example/v1','https://api.openai.com/v1?redirect=x','https://api.openai.com/v1/']){const w=wire(),out=await w.run({...input,base_url});assert.equal(out.ok,false);assert.equal(out.error_code,'provider_endpoint_not_allowlisted');assert.equal(w.dns.length,0);assert.equal(w.requests.length,0)}
 for(const addresses of [['127.0.0.1'],['8.8.8.8','10.0.0.1'],['169.254.169.254'],[]]){const w=wire(undefined,{addresses}),out=await w.run();assert.equal(out.error_code,'provider_dns_unsafe');assert.equal(w.requests.length,0)}
 const denied=wire(undefined,{authError:true});assert.equal((await denied.run()).ok,false);assert.equal(denied.dns.length,0);assert.equal(denied.requests.length,0)
})
test('Anthropic follows exact last_id cursor with bounded GET pages and existing API version headers',async()=>{
 const w=wire([{data:[{id:'claude-synthetic-a'}],has_more:true,last_id:'claude-synthetic-a'},{data:[{id:'claude-synthetic-b'}],has_more:false,last_id:'claude-synthetic-b'}]),out=await w.run({provider:'anthropic',base_url:'https://api.anthropic.com/v1',api_key:key});assert.deepEqual(out.models,['claude-synthetic-a','claude-synthetic-b']);assert.equal(out.ok,true);assert.equal(w.requests[0].path,'/v1/models?limit=100');assert.equal(w.requests[1].path,'/v1/models?limit=100&after_id=claude-synthetic-a');assert.equal(w.requests[0].headers['x-api-key'],key);assert.equal(w.requests[0].headers['anthropic-version'],'2023-06-01');assert.equal(w.checks(),3)
})
test('Gemini follows nextPageToken and preserves actual models resource names without key in URL',async()=>{
 const w=wire([{models:[{name:'models/synthetic-one'}],nextPageToken:'safe+cursor/='},{models:[{name:'models/synthetic-two'}]}]),out=await w.run({provider:'gemini',base_url:'https://generativelanguage.googleapis.com/v1beta',api_key:key});assert.equal(out.ok,true);assert.deepEqual(out.models,['models/synthetic-one','models/synthetic-two']);assert.equal(w.requests[0].headers['x-goog-api-key'],key);assert.equal(w.requests[0].path,'/v1beta/models?pageSize=100');assert(w.requests[1].path.includes('pageToken=safe%2Bcursor%2F%3D'));assert(w.requests.every(v=>!v.path.includes(key)))
})
test('missing/invalid IDs, duplicate pages or unfinished inventory never become fabricated or partial success',async()=>{
 for(const pages of [[{data:[{}]}],[{data:[{id:'unsafe\nmodel'}]}],[{data:[{id:'same'},{id:'same'}]}],[{data:'cached-model-list'}]]){const w=wire(pages),out=await w.run();assert.equal(out.ok,false);assert.deepEqual(out.models,[]);assert.equal(out.complete,false)}
 const repeated=wire([{data:[{id:'repeat'}],has_more:true,last_id:'repeat'}]);assert.equal((await repeated.run({provider:'anthropic',base_url:'https://api.anthropic.com/v1',api_key:key})).ok,false)
 const many=wire([{data:Array.from({length:301},(_,i)=>({id:'model-'+i}))}]);assert.equal((await many.run()).ok,false)
})
test('redirect/auth/rate/server failures return fixed sanitized codes and never follow another URL',async()=>{
 for(const [status,error_code]of [[302,'provider_response_rejected'],[401,'provider_credential_rejected'],[403,'provider_credential_rejected'],[429,'provider_rate_limited'],[500,'provider_response_rejected']]){const w=wire(undefined,{status,headers:{location:'https://PRIVATE.invalid/'+key}}),out=await w.run();assert.equal(out.error_code,error_code);assert.equal(w.requests.length,1);assert.equal(JSON.stringify(out).includes(key),false)}
})
test('content type/UTF8/length/size/compression and provider key echoes are rejected without exposing a body',async()=>{
 for(const options of [{type:'text/html'},{bytes:Buffer.from([0xff])},{headers:{'content-length':'9'}},{headers:{'content-length':'999999'}},{headers:{'content-encoding':'gzip'}},{bytes:Buffer.alloc(131073,32)},{bytes:Buffer.from(JSON.stringify({data:[{id:key}]}))}]){const w=wire(undefined,options),out=await w.run();assert.equal(out.ok,false);assert.deepEqual(out.models,[]);assert.equal(JSON.stringify(out).includes(key),false)}
})
test('whole DNS budget expires before a late public lookup can construct credentials or dial',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let resolveDns,requests=0
 const dns=new Promise(resolve=>resolveDns=resolve),probe=createModelDraftDiscoveryProvider({resolve4:()=>dns,resolve6:async()=>[]},()=>{requests++;throw Error('must not dial')})
 const pending=probe({...input},async()=>{});await Promise.resolve();await Promise.resolve();t.mock.timers.tick(6000);const out=await pending;assert.equal(out.error_code,'provider_probe_timeout');assert.equal(requests,0);resolveDns(['8.8.8.8']);await Promise.resolve();await Promise.resolve();assert.equal(requests,0)
})
test('bounded four-page or300-model incomplete inventory is refused without accepting a partial discovery',async()=>{
 const pages=Array.from({length:4},(_,i)=>({models:[{name:'models/page-'+i}],nextPageToken:'cursor-'+i})),w=wire(pages),out=await w.run({provider:'gemini',base_url:'https://generativelanguage.googleapis.com/v1beta',api_key:key});assert.equal(w.requests.length,4);assert.equal(out.ok,false);assert.equal(out.error_code,'provider_models_incomplete');assert.deepEqual(out.models,[])
})
