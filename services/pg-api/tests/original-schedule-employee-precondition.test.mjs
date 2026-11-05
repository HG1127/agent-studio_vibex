// Pure composition only: actual repositories, transaction control and parsed
// HTTP callback with a closed SQL-string sink. No database or runtime starts.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {Readable} from 'node:stream'
import {createRequire,stripTypeScriptTypes} from 'node:module'
import {ScheduleInventoryRepository} from '../src/schedule-inventory-repository.ts'
import {ScheduleDraftRepository} from '../src/schedule-draft-repository.ts'
import {ScheduleRuntimeRepository} from '../src/schedule-runtime-repository.ts'
import {HttpError,isUuid} from '../src/contracts.ts'
import {optionalExpectedOriginalUiEmployee} from '../src/native-original-ui-preconditions.ts'
const alice='76abcdef-0000-4000-8000-000000000001',bob='76abcdef-0000-4000-8000-000000000002',id='76000000-0000-4000-8000-000000000010',target='76000000-0000-4000-8000-000000000011'
const identity=who=>({issuer:'urn:agentstudio:local:v1',subject:who}),input={name:'Synthetic private schedule',kind:'workflow',target_id:target,time_zone:'UTC',rule:{kind:'daily',local_time:'09:00'}}
function memory(){
 const state={business:[],queries:[],releases:0,rollbacks:0,identityReads:0},reached=Error('closed_business_boundary')
 const pool={connect:async()=>({release(){state.releases++},async query(sql,args=[]){
  state.queries.push({sql,args});if(sql==="SELECT to_regnamespace('agentstudio_roles') IS NOT NULL AS installed,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid")return{rows:[{installed:false,database_oid:'16384'}]};const empty={rows:[]}
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='SET LOCAL ROLE agentstudio_api'||sql.startsWith('SELECT set_config('))return empty
  if(sql==='ROLLBACK'){state.rollbacks++;return empty}
  if(sql.startsWith('SELECT agentstudio.identity_user_id(')){state.identityReads++;return{rows:[{id:args[1]==='alice'?alice:args[1]==='bob'?bob:null}]}}
  state.business.push({sql,args});throw reached
 }})}
 return{state,reached,inventory:new ScheduleInventoryRepository(pool),draft:new ScheduleDraftRepository(pool),runtime:new ScheduleRuntimeRepository(pool,{enabled:true})}
}
const operations={
 list:(m,who,expected)=>m.inventory.list(identity(who),30,expected),
 get:(m,who,expected)=>m.inventory.get(identity(who),id,expected),
 history:(m,who,expected)=>m.inventory.occurrences(identity(who),id,30,expected),
 create:(m,who,expected)=>m.draft.create(identity(who),input,expected),
 updateDraft:(m,who,expected)=>m.draft.update(identity(who),id,input,1,expected),
 deleteDraft:(m,who,expected)=>m.draft.delete(identity(who),id,1,expected),
 execution:(m,who,expected)=>m.runtime.describe(identity(who),id,expected),
 activate:(m,who,expected)=>m.runtime.activate(identity(who),id,{},expected),
 pause:(m,who,expected)=>m.runtime.control(identity(who),id,1,'pause',expected),
 deleteRuntime:(m,who,expected)=>m.runtime.control(identity(who),id,1,'delete',expected),
 runNow:(m,who,expected)=>m.runtime.runNow(identity(who),id,1,expected),
 retry:(m,who,expected)=>m.runtime.retryFailedStart(identity(who),id,1,target,expected),
 edit:(m,who,expected)=>m.runtime.edit(identity(who),id,1,input,expected),
 runtimeList:(m,who,expected)=>m.runtime.list(identity(who),expected),
}
for(const [name,operation]of Object.entries(operations)){
 test('actual '+name+' rejects replaced employee before schedule queries, locks, audits or queue admission',async()=>{
  const m=memory();await assert.rejects(operation(m,'bob',alice),e=>e instanceof HttpError&&e.status===409&&e.code==='employee_session_changed')
  assert.equal(m.state.identityReads,1);assert.deepEqual(m.state.business,[]);assert.equal(m.state.rollbacks,1);assert.equal(m.state.releases,1)
 })
 test('actual '+name+' permits verified same owner and retains absent-header reference caller',async()=>{
  for(const expected of [alice,alice.toUpperCase(),undefined]){const m=memory();await assert.rejects(operation(m,'alice',expected),e=>e===m.reached);assert.equal(m.state.identityReads,1);assert.equal(m.state.business.length,1);assert.equal(m.state.rollbacks,1);assert.equal(m.state.releases,1)}
 })
}
const ts=createRequire(import.meta.url)('typescript'),read=file=>fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8')
function functions(file,names){const source=read(file),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);return names.map(name=>{const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,name);return stripTypeScriptTypes(node.getText(tree).replace(/^export\s+/,''))}).join('\n')}
const code=functions('tool-hub-http.ts',['ownerToolHubRoute'])+'\n'+functions('http.ts',['send','readBody','tokenFrom','allowBodyFields','createHandler'])
function closedStringLiteral(source,name,expected){
 const tree=ts.createSourceFile('closed-route.ts',source,ts.ScriptTarget.Latest,true)
 assert.equal(tree.parseDiagnostics.length,0,'closed_route_syntax_drift')
 const declarations=tree.statements.filter(ts.isVariableStatement).flatMap(statement=>
  statement.declarationList.declarations.filter(node=>ts.isIdentifier(node.name)&&node.name.text===name).map(node=>({statement,node})))
 assert.equal(declarations.length,1,'closed_route_declaration_drift')
 const {statement,node}=declarations[0]
 assert.equal(statement.declarationList.declarations.length,1,'closed_route_multi_binding_refused')
 assert.ok(statement.declarationList.flags&ts.NodeFlags.Const,'closed_route_mutable_refused')
 assert.ok(statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword),'closed_route_export_drift')
 let value=node.initializer
 if(value&&ts.isAsExpression(value)){
  assert.ok(ts.isTypeReferenceNode(value.type)&&ts.isIdentifier(value.type.typeName)&&value.type.typeName.text==='const'&&!value.type.typeArguments,'closed_route_assertion_drift')
  value=value.expression
 }
 assert.ok(value&&ts.isStringLiteral(value),'closed_route_literal_required')
 assert.equal(value.text,expected,'closed_route_value_drift')
 return value.text
}
const originalPreviewLiteral='/api/v2/original-ui/plugin-market/discover-preview'
function bindScheduleHttp(source=read('original-plugin-preview.ts')){
 const originalPluginPreviewPath=closedStringLiteral(source,'originalPluginPreviewPath',originalPreviewLiteral)
 return Function('HttpError','isUuid','optionalExpectedOriginalUiEmployee','originalPluginPreviewPath',code+'\nreturn createHandler')(HttpError,isUuid,optionalExpectedOriginalUiEmployee,originalPluginPreviewPath)
}
// Bind lazily within registered tests: source drift must fail those tests, not
// abort top-level registration after only the repository cases have registered.
const createHandler=deps=>bindScheduleHttp()(deps)
const base='/api/v2/schedules',routes=[
 ['GET',base],['GET',base+'/'+id],['GET',base+'/'+id+'/occurrences'],['GET',base+'/'+id+'/execution'],
 ['POST',base,input],['PATCH',base+'/'+id,{...input,expected_revision:1}],['DELETE',base+'/'+id,{expected_revision:1}],
 ['POST',base+'/'+id+'/activate',{}],['POST',base+'/'+id+'/pause',{expected_revision:1}],['POST',base+'/'+id+'/run-now',{expected_revision:1}],
 ['POST',base+'/'+id+'/retry-start',{expected_revision:1,occurrence_id:target}],
]
async function request(m,[method,path,body],options={}){
 const bytes=body===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(body)),req=Readable.from(bytes.length?[bytes]:[])
 req.method=method;req.url=path;req.headers={cookie:options.cookie??'bob',...(options.expected===null?{}:{'x-agentstudio-expected-employee':options.expected??alice})};req.rawHeaders=options.rawHeaders??Object.entries(req.headers).flat()
 let authCalls=0,bearerCalls=0,reply;const handler=createHandler({repository:{},scheduleInventory:m.inventory,scheduleDraftRepository:m.draft,scheduleRuntimeRepository:m.runtime,
 authenticateRequest:async incoming=>{authCalls++;if(incoming.headers.cookie==='invalid')throw new HttpError(401,'session_required');return identity(incoming.headers.cookie)},verifyToken:async()=>{bearerCalls++;throw Error('bearer_forbidden')}})
 const res={writeHead(status){this.status=status},end(value){reply=JSON.parse(value)}};await handler(req,res);return{status:res.status,body:reply,authCalls,bearerCalls}
}
test('actual schedule HTTP forwards precondition on every read and mutation including runtime and draft fallback',async()=>{
 for(const runtime of [true,false])for(const route of routes){const m=memory();if(!runtime&&route[1].split('/').length>5)continue;if(!runtime)m.runtime=undefined
  const result=await request(m,route);assert.equal(result.status,409,route.join(' '));assert.equal(result.body.error,'employee_session_changed');assert.equal(result.authCalls,1);assert.equal(result.bearerCalls,0);assert.equal(m.state.identityReads,1);assert.deepEqual(m.state.business,[])
 }
})
test('HTTP checks Cookie before malformed condition and rejects duplicates before identity SQL',async()=>{
 const invalid=memory(),denied=await request(invalid,routes[0],{cookie:'invalid',expected:'invalid'});assert.equal(denied.status,401);assert.equal(invalid.state.identityReads,0);assert.equal(denied.bearerCalls,0)
 for(const options of [{expected:'invalid'},{rawHeaders:[]},{rawHeaders:['X-AgentStudio-Expected-Employee',alice,'x-agentstudio-expected-employee',alice]},{rawHeaders:['X-AgentStudio-Expected-Employee',bob]}]){
  const m=memory(),result=await request(m,routes[0],options);assert.equal(result.status,400);assert.equal(result.body.error,'invalid_original_ui_employee_precondition');assert.equal(m.state.identityReads,0);assert.deepEqual(m.state.business,[])
 }
})
test('no-header HTTP remains a reference contract while condition never provisions an inactive employee',async()=>{
 const m=memory(),result=await request(m,routes[0],{cookie:'alice',expected:null});assert.equal(result.status,500);assert.equal(m.state.business.length,1)
 const inactive=memory(),refused=await request(inactive,routes[0],{cookie:'inactive'});assert.equal(refused.status,403);assert.equal(refused.body.error,'employee_not_provisioned');assert.equal(inactive.state.identityReads,1);assert.deepEqual(inactive.state.business,[])
})
test('expected employee cannot open the disabled schedule execution gate',async()=>{
 for(const name of ['activate','runNow','retry','edit','runtimeList']){
  const m=memory();m.runtime.enabled=false;await assert.rejects(operations[name](m,'alice',alice),e=>e instanceof HttpError&&e.status===403&&e.code==='schedule_execution_disabled')
  assert.equal(m.state.identityReads,0);assert.deepEqual(m.state.business,[])
 }
 // Revocation remains available when new execution is disabled.
 const m=memory();m.runtime.enabled=false;await assert.rejects(operations.pause(m,'bob',alice),e=>e.code==='employee_session_changed');assert.deepEqual(m.state.business,[])
})

// Dependency drift controls use DATA source snippets only; they never import
// the preview module or evaluate any of its executable statements.
const literalSource=value=>"export const originalPluginPreviewPath="+value+" as const"
for(const [label,source]of [
 ['missing binding',"export const otherPath='/nope' as const"],
 ['duplicate binding',literalSource(JSON.stringify(originalPreviewLiteral))+';'+literalSource(JSON.stringify(originalPreviewLiteral))],
 ['changed path',literalSource(JSON.stringify(originalPreviewLiteral+'/drift'))],
 ['mutable binding',"export let originalPluginPreviewPath="+JSON.stringify(originalPreviewLiteral)],
 ['template literal',"export const originalPluginPreviewPath="+'`'+originalPreviewLiteral+'`'],
 ['computed value',"export const originalPluginPreviewPath="+JSON.stringify(originalPreviewLiteral)+".slice(0)"],
 ['executable initializer',"export const originalPluginPreviewPath=(()=>{globalThis.closedRouteSideEffect=true;return "+JSON.stringify(originalPreviewLiteral)+"})()"],
 ['non-const assertion',"export const originalPluginPreviewPath="+JSON.stringify(originalPreviewLiteral)+" as string"],
 ['parenthesized expression',"export const originalPluginPreviewPath=("+JSON.stringify(originalPreviewLiteral)+")"],
 ['multiple bindings',"export const originalPluginPreviewPath="+JSON.stringify(originalPreviewLiteral)+",other='/unused'"],
 ['unexported binding',"const originalPluginPreviewPath="+JSON.stringify(originalPreviewLiteral)],
])test('schedule VM refuses route dependency drift: '+label,()=>{
 assert.throws(()=>closedStringLiteral(source,'originalPluginPreviewPath',originalPreviewLiteral),assert.AssertionError)
})
test('schedule route extraction reads a literal without evaluating unrelated module statements',()=>{
 delete globalThis.closedRouteSideEffect
 const value=closedStringLiteral('globalThis.closedRouteSideEffect=true;'+literalSource(JSON.stringify(originalPreviewLiteral)),'originalPluginPreviewPath',originalPreviewLiteral)
 assert.equal(value,originalPreviewLiteral);assert.equal(globalThis.closedRouteSideEffect,undefined)
})
async function probeScheduleFactory(factory){
 let authCalls=0,bearerCalls=0,reply
 const handler=factory({repository:{},scheduleInventory:{},authenticateRequest:async()=>{authCalls++;throw new HttpError(401,'session_required')},verifyToken:async()=>{bearerCalls++;throw Error('bearer_forbidden')}})
 const req=Readable.from([]);req.method='GET';req.url='/api/v2/schedules';req.headers={cookie:'invalid'};req.rawHeaders=['cookie','invalid']
 const res={writeHead(status){this.status=status},end(value){reply=JSON.parse(value)}}
 await handler(req,res);return{status:res.status,body:reply,authCalls,bearerCalls}
}
test('missing original preview binding reproduces500 before authentication; real literal binding restores401',async()=>{
 const unbound=Function('HttpError','isUuid','optionalExpectedOriginalUiEmployee',code+'\nreturn createHandler')(HttpError,isUuid,optionalExpectedOriginalUiEmployee)
 const before=await probeScheduleFactory(unbound),after=await probeScheduleFactory(bindScheduleHttp())
 assert.equal(before.status,500);assert.equal(before.authCalls,0);assert.equal(before.bearerCalls,0)
 assert.equal(after.status,401);assert.equal(after.body.error,'invalid_token');assert.equal(after.authCalls,1);assert.equal(after.bearerCalls,0)
})
test('a newly unbound handler dependency remains observable instead of being stubbed permissively',async()=>{
 const marker='const originalPluginPreview=path===originalPluginPreviewPath'
 assert.equal(code.split(marker).length,2)
 const drifted=code.replace(marker,'const originalPluginPreview=path===unreviewedOriginalPluginPreviewPath')
 const factory=Function('HttpError','isUuid','optionalExpectedOriginalUiEmployee','originalPluginPreviewPath',drifted+'\nreturn createHandler')(HttpError,isUuid,optionalExpectedOriginalUiEmployee,originalPreviewLiteral)
 const result=await probeScheduleFactory(factory);assert.equal(result.status,500);assert.equal(result.authCalls,0)
})
test('literal dependency drift is rejected when the registered HTTP test invokes its factory',()=>{
 assert.throws(()=>bindScheduleHttp(literalSource(JSON.stringify('/changed-route'))),assert.AssertionError)
})
test('schedule precondition dependency suite reached final registration',()=>{
 assert.equal(closedStringLiteral(read('original-plugin-preview.ts'),'originalPluginPreviewPath',originalPreviewLiteral),originalPreviewLiteral)
 assert.equal(typeof createHandler,'function')
})
