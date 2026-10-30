// Pure control-flow regression: actual repositories/transactions/parsers and
// parsed HTTP callback, with closed in-memory SQL sinks. No PostgreSQL, RLS,
// real Cookie verifier, provider transport, server or Worker is exercised.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {Readable} from 'node:stream'
import {createRequire,stripTypeScriptTypes} from 'node:module'
import {ModelConnectionRepository,safeModelConnectionInput} from '../src/model-connection-repository.ts'
import {HttpError,isUuid} from '../src/contracts.ts'
import {optionalExpectedOriginalUiEmployee,expectedOriginalUiEmployee} from '../src/native-original-ui-preconditions.ts'
import {parseAgentDesignTransportJson} from '../src/agent-design-value-contract.ts'
import {encryptModelSecret} from '../src/model-connection-crypto.ts'
const alice='68000000-0000-4000-8000-000000000001',bob='68000000-0000-4000-8000-000000000002',id='68000000-0000-4000-8000-000000000010',key=Buffer.alloc(32,19),secretText='synthetic-saved-secret-never-audited',identity=who=>({issuer:'urn:agentstudio:local:v1',subject:who}),copy=value=>structuredClone(value),input=extra=>({name:'Synthetic connection',provider:'openai',base_url:'https://api.openai.com/v1',models:['synthetic-model'],enabled:true,...extra}),header=(owner=alice)=>({headers:{'x-agentstudio-expected-employee':owner},rawHeaders:['X-AgentStudio-Expected-Employee',owner]})
globalThis.fetch=()=>assert.fail('real network/provider transport is forbidden in this pure suite')
function row(owner=alice,extra={}){const encrypted=encryptModelSecret(secretText,key);return{id,owner_user_id:owner,name:'Synthetic connection',provider:'openai',base_url:'https://api.openai.com/v1',api_key_tail:secretText.slice(-4),enabled:true,status:'untested',last_latency_ms:0,last_checked_at:null,models:['synthetic-model'],last_error:'',revision:1,created_at:'2026-10-30T00:00:00.000Z',updated_at:'2026-10-30T00:00:00.000Z',api_key_ciphertext:encrypted.ciphertext,api_key_nonce:encrypted.nonce,api_key_tag:encrypted.tag,...extra}}
function publicRow(value){const {api_key_ciphertext,api_key_nonce,api_key_tag,...visible}=value;return copy(visible)}
function memory({initial=[row()],auditFailure=null,resolveOwner}={}){
 const state={rows:new Map(initial.map(value=>[value.id,copy(value)])),audits:[],queries:[],releases:0,commits:0,rollbacks:0,providerCalls:0,identityReads:0,secretReads:0},makePool=broker=>({connect:async()=>{
  let staged,events=[],role=null,actor=null,dirty=false
  return{release(){state.releases++},async query(sql,args=[]){
   state.queries.push({sql,args:copy(args),role,actor});const empty=()=>({rows:[]})
   if(sql==='BEGIN'){staged=new Map([...state.rows].map(([k,v])=>[k,copy(v)]));return empty()}
   if(sql==='COMMIT'){state.commits++;if(dirty)state.rows=staged;state.audits.push(...events);return empty()}
   if(sql==='ROLLBACK'){state.rollbacks++;return empty()}
   assert.ok(staged,'actual transaction must start before scope/business calls')
   if(sql.startsWith('SET LOCAL ROLE ')){role=sql.slice('SET LOCAL ROLE '.length);assert.equal(role,broker?'agentstudio_model_broker':'agentstudio_api');return empty()}
   if(sql==='SELECT current_user AS role')return{rows:[{role}]}
   if(sql.includes('agentstudio.identity_user_id(')){state.identityReads++;const owner=resolveOwner?resolveOwner({broker,subject:args[1],read:state.identityReads}):args[1]==='alice'?alice:args[1]==='bob'?bob:null;return{rows:[{id:owner}]}}
   if(sql.startsWith('SELECT set_config(')){if(sql.includes("'agentstudio.actor_id'"))actor=args[0];return empty()}
   assert.ok(isUuid(actor),'actual identity mapping and actor setting precede business SQL')
   if(sql.startsWith('INSERT INTO agentstudio.audit_events')){
    assert.equal(role,'agentstudio_api');if(auditFailure)throw auditFailure
    const probe=sql.includes("'model.connection_probe'"),event={owner_user_id:args[0],actor_user_id:args[0],action:probe?'model.connection_probe':args[1],target_kind:'model_connection',target_id:probe?args[1]:args[2],result:probe?args[2]:'succeeded',metadata:JSON.parse(args[3])};events.push(event);return empty()
   }
   if(sql.startsWith('SELECT ')){
    const secret=sql.includes('api_key_ciphertext');if(secret){assert.equal(role,'agentstudio_model_broker');state.secretReads++}
    else assert.equal(role,'agentstudio_api')
    if(sql.includes('WHERE id=$1::uuid AND owner_user_id=$2::uuid')){assert.equal(args[1],actor);const selected=staged.get(args[0]);if(!selected||selected.owner_user_id!==actor)return empty();if(sql.startsWith('SELECT revision,enabled '))return{rows:[{revision:selected.revision,enabled:selected.enabled}]};if(sql.startsWith('SELECT revision '))return{rows:[{revision:selected.revision}]};return{rows:[secret?copy(selected):publicRow(selected)]}}
    if(sql.includes('WHERE owner_user_id=$1::uuid'))return{rows:[...staged.values()].filter(value=>value.owner_user_id===actor).map(publicRow)}
   }
   assert.equal(role,'agentstudio_api')
   if(sql.startsWith('INSERT INTO agentstudio.model_connections')){assert.equal(args[0],actor);const value=row(actor,{name:args[1],provider:args[2],base_url:args[3],api_key_ciphertext:args[4],api_key_nonce:args[5],api_key_tag:args[6],api_key_tail:args[7],enabled:args[8],models:JSON.parse(args[9])});staged.set(id,value);dirty=true;return{rows:[publicRow(value)]}}
   if(sql.startsWith('UPDATE agentstudio.model_connections ')){
    assert.equal(args[1],actor);const value=staged.get(args[0]);if(!value||value.owner_user_id!==actor)return empty()
    if(sql.includes('SET status=$4::text')){if(value.revision!==args[2])return empty();Object.assign(value,{status:args[3],last_latency_ms:args[4],last_error:args[5],last_checked_at:'2026-10-30T00:00:01.000Z',revision:value.revision+1})}
    else{const rotate=sql.includes('api_key_ciphertext=$6'),offset=rotate?10:6;if(value.revision!==args[offset+1])return empty();Object.assign(value,{name:args[2],provider:args[3],base_url:args[4],enabled:args[offset-1],models:JSON.parse(args[offset]),status:'untested',last_latency_ms:0,last_checked_at:null,last_error:'',revision:value.revision+1});if(rotate)Object.assign(value,{api_key_ciphertext:args[5],api_key_nonce:args[6],api_key_tag:args[7],api_key_tail:args[8]})}
    dirty=true;return{rows:[publicRow(value)]}
   }
   if(sql.startsWith('DELETE FROM agentstudio.model_connections ')){assert.equal(args[1],actor);const value=staged.get(args[0]);if(!value||value.owner_user_id!==actor||args.length===3&&value.revision!==args[2])return empty();staged.delete(args[0]);dirty=true;return{rows:[{id:args[0]}]}}
   assert.fail('unrecognized SQL in closed memory sink')
  }}
 }}),apiPool=makePool(false),brokerPool=makePool(true)
 return{state,repo:new ModelConnectionRepository(apiPool,key,brokerPool),probe:async material=>{state.providerCalls++;assert.equal(material.api_key,secretText);return{status:'ok',latency_ms:3,error_code:''}}}
}
const business=state=>state.queries.filter(q=>/^(?:SELECT .* FROM agentstudio\.model_connections|INSERT INTO agentstudio\.(?:model_connections|audit_events)|UPDATE agentstudio\.model_connections|DELETE FROM agentstudio\.model_connections)/.test(q.sql)),mutation=state=>state.queries.filter(q=>/^(?:INSERT|UPDATE|DELETE)/.test(q.sql)),status=expected=>error=>error instanceof HttpError&&error.status===expected
const ts=createRequire(import.meta.url)('typescript'),read=file=>fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8')
function functions(file,names){const text=read(file),tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),result=names.map(name=>{const node=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node,name);return stripTypeScriptTypes(node.getText(tree).replace(/^export\s+/,''))});return result.join('\n')}
const httpCode=functions('tool-hub-http.ts',['ownerToolHubRoute'])+'\n'+functions('http.ts',['send','readBody','tokenFrom','allowBodyFields','createHandler']),createHandler=Function('HttpError','isUuid','safeModelConnectionInput','optionalExpectedOriginalUiEmployee','parseAgentDesignTransportJson',httpCode+'\nreturn createHandler')(HttpError,isUuid,safeModelConnectionInput,optionalExpectedOriginalUiEmployee,parseAgentDesignTransportJson)
async function request(m,options={}){
 const{method='DELETE',path='/api/v2/model-connections/'+id,body=Object.hasOwn(options,'body')?undefined:{expected_revision:1},bytes,expected=Object.hasOwn(options,'expected')?undefined:alice,rawHeaders,headers={},cookie='alice',authFailure=false,probe=true}=options
 const data=bytes??(body===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(body))),req=Readable.from(data.length?[data]:[]);req.method=method;req.url=path;req.headers={origin:'https://studio.invalid',cookie,...(data.length?{'content-type':'application/json','content-length':String(data.length)}:{}),...(expected===undefined?{}:{'x-agentstudio-expected-employee':expected}),...headers};req.rawHeaders=rawHeaders??Object.entries(req.headers).flatMap(([key,value])=>[key,value]);let authCalls=0,verifyCalls=0,reply
 const handler=createHandler({repository:{},modelConnectionRepository:m.repo,...(probe?{modelConnectionProbe:m.probe}:{}),allowedOrigin:'https://studio.invalid',authenticateRequest:async incoming=>{authCalls++;if(authFailure||!['alice','bob'].includes(incoming.headers.cookie))throw new HttpError(401,'session_required');return identity(incoming.headers.cookie)},verifyToken:async()=>{verifyCalls++;assert.fail('Cookie authentication must never fall back to bearer')}})
 const res={writeHead(code,value){this.code=code;this.headers=value},end(value){reply=JSON.parse(value)}};await handler(req,res);return{status:res.code,body:reply,headers:res.headers,authCalls,verifyCalls}
}
test('strict optional expected employee accepts genuine absence and one canonical condition',()=>{
 assert.equal(optionalExpectedOriginalUiEmployee({headers:{},rawHeaders:[]}),undefined);assert.equal(optionalExpectedOriginalUiEmployee(header(alice.toUpperCase())),alice);assert.equal(expectedOriginalUiEmployee(header()),alice)
 for(const req of [{headers:{},rawHeaders:['X-AgentStudio-Expected-Employee',alice]},header(''),header(' '+alice),header('not-a-uuid'),{headers:{'x-agentstudio-expected-employee':[alice]},rawHeaders:['X-AgentStudio-Expected-Employee',alice]},{...header(),rawHeaders:[]},{...header(),rawHeaders:['X-AgentStudio-Expected-Employee',alice,'x-agentstudio-expected-employee',alice]},{...header(),rawHeaders:['X-AgentStudio-Expected-Employee',bob]},{...header(),rawHeaders:['X-AgentStudio-Expected-Employee']}])assert.throws(()=>optionalExpectedOriginalUiEmployee(req),status(400))
})
test('all four actual repository operations check resolved owner before any model SQL or provider call',async()=>{
 for(const operation of ['create','update','delete','probe']){const m=memory(),work=operation==='create'?()=>m.repo.create(identity('bob'),input({api_key:secretText}),alice):operation==='update'?()=>m.repo.update(identity('bob'),id,input(),1,alice):operation==='delete'?()=>m.repo.delete(identity('bob'),id,1,alice):()=>m.repo.testConnection(identity('bob'),id,1,m.probe,alice);await assert.rejects(work(),error=>error.status===409&&error.code==='employee_session_changed');assert.equal(m.state.identityReads,1);assert.deepEqual(business(m.state),[]);assert.equal(m.state.secretReads,0);assert.equal(m.state.providerCalls,0);assert.equal(m.state.rollbacks,1);assert.equal(m.state.releases,1)}
})
test('strict update and delete conceal a foreign target with404 and no mutations',async()=>{
 for(const operation of ['update','delete']){const m=memory(),work=operation==='update'?()=>m.repo.update(identity('bob'),id,input(),1,bob):()=>m.repo.delete(identity('bob'),id,1,bob);await assert.rejects(work(),status(404));assert.deepEqual(mutation(m.state),[]);assert.equal(m.state.rows.get(id).revision,1);assert.deepEqual(m.state.audits,[])}
})
test('strict delete stale revision fails409 under owner row lock before DML or audit',async()=>{
 const m=memory({initial:[row(alice,{revision:2})]});await assert.rejects(m.repo.delete(identity('alice'),id,1,alice),status(409));assert.ok(m.state.queries.some(q=>q.sql.includes('FOR UPDATE')));assert.deepEqual(mutation(m.state),[]);assert.equal(m.state.rows.get(id).revision,2);assert.deepEqual(m.state.audits,[])
})
test('strict delete requires a revision and valid CAS deletes once with safe same-transaction audit',async()=>{
 const m=memory();await assert.rejects(Promise.resolve().then(()=>m.repo.delete(identity('alice'),id,undefined,alice)),status(400));assert.equal(m.state.identityReads,0);assert.equal(await m.repo.delete(identity('alice'),id,1,alice),true);assert.equal(m.state.rows.size,0);assert.deepEqual(m.state.audits,[{owner_user_id:alice,actor_user_id:alice,action:'model.connection_delete',target_kind:'model_connection',target_id:id,result:'succeeded',metadata:{revision:1}}]);const order=m.state.queries.map(q=>q.sql);assert.ok(order.findIndex(q=>q.includes('FOR UPDATE'))<order.findIndex(q=>q.startsWith('DELETE')));assert.ok(order.findIndex(q=>q.startsWith('DELETE'))<order.findIndex(q=>q.startsWith('INSERT INTO agentstudio.audit_events')));assert.ok(order.findIndex(q=>q.startsWith('INSERT INTO agentstudio.audit_events'))<order.indexOf('COMMIT'));assert.equal(m.state.queries.find(q=>q.sql.startsWith('DELETE')).args[2],1)
})
test('legacy no-header repository create update and unversioned delete remain legal',async()=>{
 const m=memory({initial:[]});assert.equal((await m.repo.create(identity('alice'),input({api_key:secretText}))).revision,1);assert.equal(await m.repo.update(identity('alice'),id,input(),99),null);assert.equal(await m.repo.delete(identity('bob'),id),false);assert.equal(await m.repo.delete(identity('alice'),id),true);assert.equal(await m.repo.delete(identity('alice'),id),false)
})
test('actual create audit is fixed and contains only returned revision without secrets or input fields',async()=>{
 const m=memory({initial:[]}),saved=await m.repo.create(identity('alice'),input({api_key:secretText}),alice);assert.equal(saved.revision,1);assert.equal(m.state.audits[0].action,'model.connection_create');assert.deepEqual(m.state.audits[0].metadata,{revision:1});assert.doesNotMatch(JSON.stringify(m.state.audits),/api_key|ciphertext|nonce|tag|Synthetic connection|api\.openai|synthetic-saved/);assert.equal(m.state.commits,1)
})
test('metadata update preserves encrypted secret and writes fixed update audit after CAS lock',async()=>{
 const m=memory(),before=copy(m.state.rows.get(id)),saved=await m.repo.update(identity('alice'),id,input({name:'Updated metadata'}),1,alice);assert.equal(saved.revision,2);assert.equal(m.state.audits[0].action,'model.connection_update');assert.deepEqual(m.state.audits[0].metadata,{revision:2});for(const field of ['api_key_ciphertext','api_key_nonce','api_key_tag'])assert.deepEqual(m.state.rows.get(id)[field],before[field]);assert.equal(m.state.secretReads,0);assert.ok(!business(m.state).filter(q=>!q.sql.startsWith('INSERT INTO agentstudio.audit_events')).some(q=>/api_key_ciphertext|api_key_nonce|api_key_tag/.test(q.sql)))
})
test('actual enable and disable transitions have distinct fixed audits while metadata saves stay update',async()=>{
 const m=memory();await m.repo.update(identity('alice'),id,input({enabled:false}),1,alice);await m.repo.update(identity('alice'),id,input({enabled:true}),2,alice);await m.repo.update(identity('alice'),id,input({name:'ordinary update'}),3,alice);assert.deepEqual(m.state.audits.map(e=>[e.action,e.metadata.revision]),[['model.connection_disable',2],['model.connection_enable',3],['model.connection_update',4]])
})
test('actual key rotation replaces ciphertext without placing key or ciphertext in audit metadata',async()=>{
 const m=memory(),before=copy(m.state.rows.get(id).api_key_ciphertext),next='synthetic-rotated-secret-9876';await m.repo.update(identity('alice'),id,input({api_key:next}),1,alice);assert.notDeepEqual(m.state.rows.get(id).api_key_ciphertext,before);assert.equal(m.state.rows.get(id).api_key_tail,'9876');assert.deepEqual(m.state.audits[0].metadata,{revision:2});assert.equal(JSON.stringify(m.state.audits).includes(next),false)
})
test('audit rejection rolls back create update and delete and preserves original failure object',async()=>{
 for(const operation of ['create','update','delete']){const primary=Error('synthetic private audit failure'),m=memory({initial:operation==='create'?[]:[row()],auditFailure:primary}),before=copy([...m.state.rows]);const work=operation==='create'?()=>m.repo.create(identity('alice'),input({api_key:secretText}),alice):operation==='update'?()=>m.repo.update(identity('alice'),id,input({enabled:false}),1,alice):()=>m.repo.delete(identity('alice'),id,1,alice);await assert.rejects(work(),error=>error===primary);assert.deepEqual([...m.state.rows],before);assert.deepEqual(m.state.audits,[]);assert.equal(m.state.commits,0);assert.equal(m.state.rollbacks,1);assert.equal(m.state.releases,1)}
})
test('actual saved probe checks broker owner then decrypts saved material and retains original audit',async()=>{
 const m=memory(),saved=await m.repo.testConnection(identity('alice'),id,1,m.probe,alice);assert.equal(saved.revision,2);assert.equal(saved.status,'ok');assert.equal(m.state.secretReads,1);assert.equal(m.state.providerCalls,1);assert.equal(m.state.identityReads,2);assert.deepEqual(m.state.audits[0],{owner_user_id:alice,actor_user_id:alice,action:'model.connection_probe',target_kind:'model_connection',target_id:id,result:'succeeded',metadata:{latency_ms:3,error_code:''}})
})
test('probe persistence checks resolved owner again before status SQL after the broker transaction',async()=>{
 const m=memory({resolveOwner:({broker})=>broker?alice:bob});await assert.rejects(m.repo.testConnection(identity('alice'),id,1,m.probe,alice),status(409));assert.equal(m.state.providerCalls,1);assert.equal(m.state.secretReads,1);assert.equal(m.state.rows.get(id).revision,1);assert.equal(m.state.audits.length,0);assert.deepEqual(mutation(m.state),[])
})
test('actual HTTP authentication occurs before parsing an expected header and never uses it as identity',async()=>{
 const m=memory(),result=await request(m,{cookie:'invalid',headers:{'x-rh-user-id':alice},expected:alice});assert.equal(result.status,401);assert.equal(result.authCalls,1);assert.equal(result.verifyCalls,0);assert.equal(m.state.identityReads,0);assert.deepEqual(business(m.state),[])
})
test('actual HTTP create update delete and probe fence a replacement Bob Cookie before business access',async()=>{
 for(const operation of ['create','update','delete','probe']){const m=memory(),options=operation==='create'?{method:'POST',path:'/api/v2/model-connections',body:input({api_key:secretText})}:operation==='update'?{method:'PATCH',body:{...input(),expected_revision:1}}:operation==='probe'?{method:'POST',path:'/api/v2/model-connections/'+id+'/probe',body:{expected_revision:1}}:{};const result=await request(m,{...options,cookie:'bob',expected:alice});assert.equal(result.status,409);assert.equal(result.body.error,'employee_session_changed');assert.equal(result.authCalls,1);assert.deepEqual(business(m.state),[]);assert.equal(m.state.providerCalls,0)}
})
test('actual HTTP rejects duplicate array malformed or inconsistent expected headers after authentication',async()=>{
 for(const options of [{expected:[alice]},{expected:''},{expected:' '+alice},{expected:'invalid'},{rawHeaders:['X-AgentStudio-Expected-Employee',alice,'x-agentstudio-expected-employee',alice]},{rawHeaders:[]},{rawHeaders:['X-AgentStudio-Expected-Employee',bob]}]){const m=memory(),result=await request(m,options);assert.equal(result.status,400);assert.equal(result.body.error,'invalid_original_ui_employee_precondition');assert.equal(result.authCalls,1);assert.equal(m.state.identityReads,0)}
})
test('strict HTTP DELETE accepts only closed positive safe expected_revision JSON',async()=>{
 const cases=[{},[],null,{expected_revision:'1'},{expected_revision:0},{expected_revision:-1},{expected_revision:1.5},{expected_revision:9007199254740992},{expected_revision:1,owner_user_id:alice},{expected_revision:1,id},{expected_revision:1,api_key:secretText}]
 for(const body of cases){const m=memory(),result=await request(m,{body});assert.equal(result.status,400);assert.equal(m.state.identityReads,0);assert.deepEqual(mutation(m.state),[])}
 for(const bytes of [Buffer.alloc(0),Buffer.from('{'),Buffer.from('{"expected_revision":1,"expected_revision":2}'),Buffer.from('{"expected_revision":1,"expected_\\u0072evision":2}'),Buffer.from([0xff]),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('{"expected_revision":1}')])]){const m=memory(),result=await request(m,{bytes,headers:{'content-type':'application/json'}});assert.equal(result.status,400);assert.equal(m.state.identityReads,0)}
})
test('strict HTTP DELETE enforces JSON encoding byte limit and consistent framing before repository',async()=>{
 for(const [options,expectedStatus]of [[{headers:{'content-type':'text/plain'}},415],[{headers:{'content-encoding':'gzip'}},415],[{headers:{'content-length':'bad'}},400],[{headers:{'content-length':'1'}},400],[{headers:{'transfer-encoding':'chunked'}},400],[{bytes:Buffer.alloc(513,32)},413]]){const m=memory(),result=await request(m,options);assert.equal(result.status,expectedStatus);assert.equal(m.state.identityReads,0);assert.deepEqual(mutation(m.state),[])}
})
test('strict HTTP DELETE returns successful ACK only after CAS and audit; stale and foreign cases have no effects',async()=>{
 const valid=memory(),ack=await request(valid);assert.deepEqual(ack.body,{ok:true,id});assert.equal(ack.status,200);assert.equal(valid.state.audits[0].action,'model.connection_delete')
 const stale=memory({initial:[row(alice,{revision:2})]}),conflict=await request(stale);assert.equal(conflict.status,409);assert.equal(stale.state.rows.size,1);assert.equal(stale.state.audits.length,0)
 const foreign=memory(),denied=await request(foreign,{expected:bob,cookie:'bob'});assert.equal(denied.status,404);assert.equal(foreign.state.rows.size,1);assert.equal(foreign.state.audits.length,0)
})
test('legacy no-header HTTP DELETE preserves its unversioned contract while GET ignores write preconditions',async()=>{
 const m=memory({initial:[row(alice,{revision:8})]}),deleted=await request(m,{expected:undefined,bytes:Buffer.from('legacy ignored body'),headers:{'content-type':'text/plain'}});assert.equal(deleted.status,200);assert.equal(m.state.rows.size,0);assert.equal(m.state.audits[0].metadata.revision,8)
 const readOnly=memory(),listed=await request(readOnly,{method:'GET',path:'/api/v2/model-connections',expected:'malformed',body:undefined});assert.equal(listed.status,200);assert.equal(listed.body.items.length,1)
})
test('actual HTTP create/update sanitize fields and still preserve legacy callers without expected headers',async()=>{
 const m=memory({initial:[]}),created=await request(m,{method:'POST',path:'/api/v2/model-connections',body:input({api_key:secretText}),expected:undefined});assert.equal(created.status,201);assert.equal(Object.hasOwn(created.body.item,'api_key_ciphertext'),false);const changed=await request(m,{method:'PATCH',body:{...input({enabled:false}),expected_revision:1},expected:undefined});assert.equal(changed.status,200);assert.equal(changed.body.item.revision,2);assert.equal(m.state.audits.at(-1).action,'model.connection_disable')
 for(const body of [{...input({api_key:secretText}),owner_user_id:bob},{...input({api_key:secretText}),api_key_ciphertext:'fake'}]){const q=memory({initial:[]}),denied=await request(q,{method:'POST',path:'/api/v2/model-connections',body});assert.equal(denied.status,400);assert.deepEqual(mutation(q.state),[])}
})
test('disabled real probe composition never calls a provider and audit failures expose only closed HTTP error',async()=>{
 const disabled=memory(),refused=await request(disabled,{method:'POST',path:'/api/v2/model-connections/'+id+'/probe',probe:false});assert.equal(refused.status,503);assert.equal(refused.body.error,'provider_probe_disabled');assert.equal(disabled.state.providerCalls,0);assert.equal(disabled.state.secretReads,0)
 const primary=Error('synthetic private key ciphertext error'),m=memory({auditFailure:primary}),result=await request(m);assert.equal(result.status,500);assert.deepEqual(result.body,{error:'internal_error'});assert.equal(m.state.rows.size,1);assert.equal(m.state.rollbacks,1)
})

test('strict original-page marker is on the actual owner-CAS-audit repository instance as a readonly literal',()=>{
 const m=memory();assert.equal(m.repo.originalUiProtocol,'native_model_connections_owner_cas_v1');assert.equal(Object.hasOwn(m.repo,'originalUiProtocol'),true);assert.equal(Object.hasOwn({},'originalUiProtocol'),false)
 const source=read('model-connection-repository.ts'),tree=ts.createSourceFile('repository.ts',source,ts.ScriptTarget.Latest,true),klass=tree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='ModelConnectionRepository'),property=klass.members.find(n=>ts.isPropertyDeclaration(n)&&n.name.getText(tree)==='originalUiProtocol');assert.ok(property);assert.ok(property.modifiers?.some(n=>n.kind===ts.SyntaxKind.ReadonlyKeyword));assert.equal(property.initializer.getText(tree),'"native_model_connections_owner_cas_v1" as const')
})
