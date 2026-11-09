import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalModelConnectionsApi,parseOriginalModelConnection,normalizeOriginalModelInput,OriginalModelConnectionsError} from '../src/lib/originalModelConnectionsApi.ts'
import {employee,other,id,row,input,json,terminalModelTransport} from './helpers/original-model-connections-unit-data.mjs'
const client=options=>{const data=terminalModelTransport(options);return{...data,api:createOriginalModelConnectionsApi({employeeId:employee,rootPath:'',transport:data.transport})}}
test('actual public model DTO parser keeps owner/revision/status and nullable check time without secrets',()=>{
 const actual=parseOriginalModelConnection(row({last_checked_at:null}),employee);assert.equal(actual.owner_user_id,employee);assert.equal(actual.revision,7);assert.equal(actual.last_checked_at,null)
 for(const invalid of [row({owner_user_id:other}),{...row(),api_key:'must-refuse'},{...row(),api_key_ciphertext:'must-refuse'},row({revision:0}),row({models:['same','same']}),row({last_checked_at:'yesterday'}),row({last_error:'Bearer secret'})])assert.throws(()=>parseOriginalModelConnection(invalid,employee))
 let called=0;const bad={...row()};Object.defineProperty(bad,'models',{enumerable:true,get(){called++;return[]}});assert.throws(()=>parseOriginalModelConnection(bad,employee));assert.equal(called,0)
})
test('full input validation refuses unsafe URL, excess models and secret/caller fields without coercing them',()=>{
 assert.equal(normalizeOriginalModelInput(input(),true).name,'Synthetic new model')
 for(const extra of [{base_url:'http://api.openai.com/v1'},{base_url:'https://127.0.0.1/v1'},{base_url:'https://a.local/v1'},{base_url:'https://u:p@example.test/v1'},{owner_user_id:employee},{revision:7},{models:Array(301).fill('excess')},{api_key:'short'},{api_key:'secret with spaces'}])assert.throws(()=>normalizeOriginalModelInput({...input(),...extra},true))
 assert.throws(()=>normalizeOriginalModelInput({...input(),models:['duplicate','duplicate']},true));assert.throws(()=>normalizeOriginalModelInput({...input(),api_key:undefined},true))
})
test('list and get use the existing bounded Native metadata routes with actual response parsers',async()=>{
 const f=client();assert.equal((await f.api.list())[0].revision,7);assert.equal((await f.api.get(id)).id,id);assert.equal(f.requests[0].route,'/api/v2/model-connections?limit=50')
 for(const req of f.requests){assert.equal(req.init.credentials,'same-origin');assert.equal(req.init.redirect,'error');assert.equal(req.init.headers.Authorization,undefined);assert.equal(req.init.headers['X-Rh-User-Id'],undefined);assert.equal(req.init.headers['X-AgentStudio-Expected-Employee'],undefined)}
})
test('missing strict server contract or configuration-write capability prevents every mutation before any secret request',async()=>{
 for(const options of [{protocol:false},{writes:false}]){const f=client(options);for(const invoke of [()=>f.api.create(input()),()=>f.api.update(row(),input({api_key:undefined})),()=>f.api.delete(row()),()=>f.api.probe(row())])await assert.rejects(invoke,error=>error.status===405&&!error.outcomeUnknown);assert.equal(f.writes().length,0)}
})
test('create sends only full metadata/key to Native once, with fixed employee condition and original CSRF',async()=>{
 const f=client(),saved=await f.api.create(input());assert.equal(saved.revision,1);assert.equal(saved.status,'untested');assert.equal(saved.api_key_tail,'0002');assert.equal(Object.hasOwn(saved,'api_key'),false)
 const request=f.writes()[0];assert.deepEqual(Object.keys(request.body).sort(),['api_key','base_url','enabled','models','name','provider']);assert.equal(request.init.headers['X-AgentStudio-Expected-Employee'],employee);assert.equal(request.init.headers['X-AgentStudio-Request'],'1');assert.equal(request.init.headers.Authorization,undefined);assert.equal(request.init.headers['X-Rh-User-Id'],undefined);assert.equal(f.writes().length,1)
})
test('metadata update preserves the stored secret, sends expected revision and validates actual untested status',async()=>{
 const f=client(),selected=row(),value=input({name:selected.name,models:selected.models,api_key:undefined,enabled:false}),saved=await f.api.update(selected,value)
 assert.equal(saved.enabled,false);assert.equal(saved.revision,8);assert.equal(saved.api_key_tail,selected.api_key_tail);assert.equal(saved.status,'untested');assert.equal(saved.last_checked_at,null)
 assert.equal(f.writes()[0].body.expected_revision,7);assert.equal(Object.hasOwn(f.writes()[0].body,'api_key'),false)
})
test('strict original delete carries the exact selected revision and refuses stale responses',async()=>{
 const f=client(),answer=await f.api.delete(row());assert.deepEqual(answer,{ok:true,id});assert.equal(f.writes()[0].body.expected_revision,7);assert.equal(f.records.has(id),false)
 const stale=client({rows:[row({revision:8})]});await assert.rejects(stale.api.delete(row()),error=>error.status===409&&!error.outcomeUnknown);assert(stale.records.has(id))
})
test('saved probe remains separately gated and reports configured models, not fabricated model discovery',async()=>{
 const closed=client();await assert.rejects(closed.api.probe(row()),error=>error.code==='provider_probe_disabled');assert.equal(closed.writes().length,0)
 const f=client({probe:true}),saved=await f.api.probe(row());assert.equal(saved.revision,8);assert.deepEqual(saved.models,row().models);assert.equal(f.writes()[0].route,'/api/v2/model-connections/'+id+'/probe');assert.deepEqual(f.writes()[0].body,{expected_revision:7});assert.equal(Object.hasOwn(f.writes()[0].body,'api_key'),false)
})
test('actual foreign/mismatched success DTO is uncertain and cannot be displayed as saved',async()=>{
 for(const mutate of [item=>({...item,owner_user_id:other}),item=>({...item,revision:99}),item=>({...item,revision:0}),item=>({...item,id:'malformed-id'}),item=>({...item,base_url:'http://unsafe.invalid'}),item=>({...item,models:['changed']})]){const f=client({afterWrite:async(_req,response)=>{const data=await response.json();return json({item:mutate(data.item)})}});await assert.rejects(f.api.update(row(),input({api_key:undefined})),error=>error instanceof OriginalModelConnectionsError&&error.outcomeUnknown);assert.equal(f.writes().length,1)}
})
test('known owner/revision refusals remain definite; a lost/500 acknowledgement is uncertain with no retry',async()=>{
 const refused=client({intercept:request=>request.init.method==='PATCH'?json({error:'employee_session_changed'},409):undefined});await assert.rejects(refused.api.update(row(),input({api_key:undefined})),error=>error.code==='employee_session_changed'&&!error.outcomeUnknown)
 for(const afterWrite of [()=>{throw Error('terminal reply lost')},()=>json({error:'service_unavailable'},503)]){const f=client({afterWrite});await assert.rejects(f.api.create(input()),error=>error.outcomeUnknown);assert.equal(f.writes().length,1)}
})
test('whole response timeout and size declarations are bounded inside the unchanged8s maximum',async()=>{
 assert.throws(()=>createOriginalModelConnectionsApi({employeeId:employee,timeoutMs:8001}));assert.throws(()=>createOriginalModelConnectionsApi({employeeId:employee,rootPath:'https://outside.invalid'}))
 let cancelled=false;const api=createOriginalModelConnectionsApi({employeeId:employee,rootPath:'',timeoutMs:15,transport:async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'))},cancel(){cancelled=true}}),{headers:{'Content-Type':'application/json'}})})
 await assert.rejects(api.list(),error=>error.status===0&&!error.outcomeUnknown);await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,true)
 const bad=createOriginalModelConnectionsApi({employeeId:employee,rootPath:'',transport:async()=>new Response('{"items":[]}',{headers:{'Content-Type':'application/json','Content-Length':'1048577'}})});await assert.rejects(bad.list(),error=>error.status===503)
})
