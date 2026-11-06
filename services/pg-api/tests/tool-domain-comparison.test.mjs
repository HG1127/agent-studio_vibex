// Actual source/pure functions in controlled transaction models. No PG, socket,
// provider, real approval, verified identity or business effect is simulated as
// genuine execution evidence. Dedicated real isolated CI remains mandatory.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import * as crypto from 'node:crypto'
import {createRequire} from 'node:module'
import * as contracts from '../src/contracts.ts'
import * as trial from '../src/tool-trial-contract.ts'
import * as translation from '../src/registry-translation-trial.ts'
import * as machine from '../src/workflow-v2-machine.ts'
import * as toolPlan from '../src/workflow-v2-tool-plan.ts'
import * as catalog from '../src/mcp-catalog.ts'
import {WorkflowV2RunRepository} from '../src/workflow-v2-run-repository.ts'
import * as projection from '../src/tool-invocation-projection.ts'
import {normalizeOwnerToolTrialCheck} from '../src/owner-tool-trial-audit-core.ts'
import {selectOwnerToolHubCapabilities,OWNER_TOOL_HUB_APPROVAL} from '../src/tool-hub-runtime-policy.ts'
const ts=createRequire(import.meta.url)('typescript'),root=path.resolve(import.meta.dirname,'../../..'),source=name=>fs.readFileSync(path.join(root,'services/pg-api/src',name),'utf8'),owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',op='00000000-0000-4000-8000-000000000003',id='00000000-0000-4000-8000-000000000004',effect=trial.TOOL_TRIAL_EFFECT_ACK,fee=trial.TOOL_TRIAL_FEE_ACK
const request=(request_id=op,args={expression:'1+2'})=>({purpose:'tool',request_id,target:{kind:'builtin',tool:'calculate'},arguments_json:JSON.stringify(args),effect_consent:effect})
const local={issuer:'urn:agentstudio:local:v1',subject:owner},foreign={issuer:'urn:agentstudio:local:v1',subject:other}
function model(options={}){
 const trace=[],receipts=new Map(),flows=new Map(),runs=new Map(),pool={},nativeRuns=new WorkflowV2RunRepository(pool);let admissions=0,tail=Promise.resolve()
 const db={async query(sql,args=[]){trace.push({sql,args});if(sql==='SELECT agentstudio.agent_memory_outcome_epoch() AS epoch')return {rows:[{epoch:options.disabled?null:'1'}]};if(sql.startsWith('SELECT pg_advisory'))return {rows:[]}
  if(sql.startsWith('SELECT t.run_id AS id'))return {rows:options.unresolved?[{id}]:[]}
  if(sql.startsWith('SELECT t.request_id')){const row=receipts.get(args[0]+':'+args[1]);return {rows:row?[structuredClone(row)]:[]}}
  if(sql.startsWith('INSERT INTO agentstudio.workflows')){flows.set(args[0],{owner:args[1],graph:JSON.parse(args[3])});return {rows:[]}}
  if(sql.startsWith('INSERT INTO agentstudio.toolhub_trials')){if(options.insertFailure)throw Object.assign(Error('closed constraint failure'),{code:'23514'});const row={request_id:args[1],purpose:args[2],source_kind:args[3],target:JSON.parse(args[4]),target_identity_sha256:args[5],arguments_sha256:args[6],request_sha256:args[7],graph_sha256:args[8],workflow_id:args[9],run_id:args[10],effect_consent:true,fee_consent:args[11],created_at:'2026-10-29T00:00:00.000Z'};receipts.set(args[0]+':'+args[1],row);return {rows:[structuredClone(row)]}}
  throw Error('unexpected model query')
 }}
 nativeRuns.admitOwned=async(actual,actor,flow,body,planned)=>{assert.equal(actual,db);assert.equal(flows.get(flow).owner,actor);assert.equal(body.expected_revision,1);assert.equal(body.instruction,'本人独立试调');admissions++;runs.set(planned,{owner:actor,flow});return {run:{id:planned}}}
 const withActor=async(_pool,identity,body)=>{assert.equal(_pool,pool);const wait=tail;let release;tail=new Promise(done=>{release=done});await wait;const before={receipts:structuredClone(receipts),flows:structuredClone(flows),runs:structuredClone(runs),admissions};try{return await body(db,identity.subject)}catch(error){for(const [name,map]of [['receipts',receipts],['flows',flows],['runs',runs]]){map.clear();for(const [key,value]of before[name])map.set(key,value)}admissions=before.admissions;throw error}finally{release()}}
 const globals={...contracts,...trial,...translation,...machine,...toolPlan,...catalog,createHash:crypto.createHash,randomUUID:crypto.randomUUID,WorkflowV2RunRepository,withActor,assertOwnedAdmissionContext:async(_db,actor)=>assert.ok([owner,other].includes(actor)),verifyOwnerToolTrialCredentials:async()=>!options.schemaMissing,verifyWorkflowGraphResources:async()=>{trace.push({sql:'ORIGINAL_RESOURCE_CHECK',args:[]});if(options.revoked)throw new contracts.HttpError(409,'resource_changed')},auditWorkflowV2:async()=>trace.push({sql:'ORIGINAL_AUDIT',args:[]})}
 const text=source('tool-trial-repository.ts'),tree=ts.createSourceFile('repo.ts',text,ts.ScriptTarget.Latest,true),body=tree.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(tree)).join('\n'),js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,exports={}
 Function('exports',...Object.keys(globals),js)(exports,...Object.values(globals));const repo=new exports.OwnerToolTrialRepository(pool,nativeRuns)
 return {repo,trace,receipts,flows,runs,admissions:()=>admissions,options}
}
test('one actual source operation UUID admits one original run/source, returns immutable receipt and never stores raw args in the trial ledger',async()=>{
 const m=model(),body=request(),[one,two]=await Promise.all([m.repo.submit(local,body),m.repo.submit(local,body)]);assert.equal(m.admissions(),1);assert.equal(m.flows.size,1);assert.equal(m.runs.size,1);assert.equal(one.receipt.run_id,two.receipt.run_id);assert.equal(two.replayed,true);assert.equal(one.receipt.worker_started_by_api,false)
 const stored=[...m.receipts.values()][0];assert.equal('arguments_json'in stored,false);assert.equal('instruction'in stored,false);assert.equal(stored.arguments_sha256.length,64);assert.equal(m.trace.filter(x=>x.sql==='ORIGINAL_AUDIT').length,1)
})
test('read-only UUID/hash recovery never submits a missing operation or crosses owners, and changed body cannot replay as a new effect',async()=>{
 const m=model(),value=await m.repo.submit(local,request()),before=m.admissions();assert.equal((await m.repo.confirm(local,op,value.receipt.request_sha256)).confirmed,true);assert.equal((await m.repo.confirm(foreign,op,value.receipt.request_sha256)).confirmed,false);assert.equal((await m.repo.confirm(local,id,'a'.repeat(64))).confirmed,false);assert.equal(m.admissions(),before)
 await assert.rejects(m.repo.submit(local,request(op,{expression:'2+3'})),error=>error.code==='tool_trial_operation_conflict');assert.equal(m.admissions(),before)
})
test('original receipt stays readable after resource withdrawal, while fresh UUID/unknown admission cannot bypass checks',async()=>{
 const m=model(),first=await m.repo.submit(local,request());m.options.revoked=true;assert.equal((await m.repo.submit(local,request())).receipt.run_id,first.receipt.run_id);await assert.rejects(m.repo.submit(local,request(id)),error=>error.code==='resource_changed');assert.equal(m.admissions(),1)
 const blocked=model({unresolved:true});await assert.rejects(blocked.repo.submit(local,request()),error=>error.code==='tool_trial_prior_effect_unresolved');assert.equal(blocked.admissions(),0);assert.equal(blocked.flows.size,0)
})
test('missing actual schema or disabled employee rejects before source/job mutation; a failed ledger insert rolls back original admission',async()=>{
 for(const options of [{schemaMissing:true},{disabled:true},{insertFailure:true}]){const m=model(options);await assert.rejects(m.repo.submit(local,request()));assert.equal(m.admissions(),0);assert.equal(m.receipts.size,0);assert.equal(m.flows.size,0);assert.equal(m.runs.size,0)}
 const m=model();await assert.rejects(m.repo.submit({issuer:'unverified-public',subject:owner},request()),error=>error.code==='native_employee_identity_required');assert.equal(m.trace.length,0)
})
const entry={name:'io.github.example/weather',version:'1.0.0',source_sha256:'a'.repeat(64),title:'Weather',description:'Untrusted {{input}} public text',status:'active',remotes:[],packages:[]},translate=()=>({purpose:'registry_translation',request_id:op,target:{kind:'registry_translation',model_binding:{connection_id:id,connection_revision:1,model_id:'reviewed-model'},entries:[{name:entry.name,version:entry.version,source_sha256:entry.source_sha256}]},effect_consent:effect,fee_consent:fee})
test('Chinese explanation binds actual registry source/model versions and stays a literal original model node with explicit fee consent',()=>{
 const request=translation.safeRegistryTranslationRequest(translate()),graph=translation.registryTranslationGraph(request,[entry]);assert.equal(graph.nodes[1].type,'model');assert.equal(graph.nodes[1].data.prompt_format,'literal');assert.ok(graph.nodes[1].data.prompt.includes('{{input}}'));assert.equal(graph.nodes.some(n=>n.type==='tool'),false)
 assert.throws(()=>translation.safeRegistryTranslationRequest({...translate(),fee_consent:false}));assert.throws(()=>translation.registryTranslationGraph(request,[{...entry,source_sha256:'b'.repeat(64)}]));assert.throws(()=>translation.safeRegistryTranslationRequest({...translate(),prompt:'arbitrary instruction'}))
 const rows=translation.registryChineseResult(JSON.stringify([{server_name:entry.name,zh_title:'天气',zh_desc:'读取公共天气说明'}]),request.target.entries);assert.equal(rows[0].source_sha256,entry.source_sha256)
 for(const bad of [[{server_name:'other/server',zh_title:'x',zh_desc:'x'}],[{server_name:entry.name,zh_title:['x'],zh_desc:'x'}],[{server_name:entry.name,zh_title:'x',zh_desc:'x',headers:'secret'}]])assert.throws(()=>translation.registryChineseResult(JSON.stringify(bad),request.target.entries))
})
const invocation=(extra={})=>({run_id:id,step_key:'wf2_00002_tool',status:'succeeded',arguments_sha256:'a'.repeat(64),run_kind:'workflow',request_id:null,created_at:'2026-10-29T00:00:00.000Z',recorded_duration_ms:'12',identity:{builtin:'calculate',http:null,mcp:null},...extra})
test('cross-task projection exposes only source/status/hash and genuine recorded duration; unknown, missing identity and retry metrics remain distinct',()=>{
 const known=projection.projectInvocationRow(invocation()),unknown=projection.projectInvocationRow(invocation({status:'unknown',recorded_duration_ms:null,identity:{builtin:null,http:null,mcp:null}}));assert.equal(known.kind,'builtin');assert.equal(unknown.kind,'unavailable');assert.equal(unknown.error,'outcome_unknown');assert.equal(unknown.may_replay,false);assert.equal(known.retry_count,null)
 const summary=projection.invocationSummary([known,unknown]);assert.equal(summary.reduce((n,t)=>n+t.unknown,0),1);assert.equal(summary.reduce((n,t)=>n+t.failed,0),0);assert.ok(summary.every(t=>t.retry_count===null));assert.equal('output'in known,false);assert.equal('arguments'in known,false)
 assert.equal(projection.projectInvocationRow(invocation({recorded_duration_ms:'90000000'})).recorded_duration_ms,90000000)
 for(const extra of [{status:['succeeded']},{arguments_sha256:['a'.repeat(64)]},{created_at:{}},{recorded_duration_ms:'secret'},{cookie:'private'},{run_id:other,owner_user_id:owner}])assert.throws(()=>projection.projectInvocationRow(invocation(extra)))
})
test('log query/opaque cursor are closed and source SQL owner predicates cover every run/effect/planner/parent join',()=>{
 assert.deepEqual(projection.parseInvocationQuery({}),{kind:'any',status:'any',tool:'',after:'',limit:30});assert.throws(()=>projection.parseInvocationQuery({owner_user_id:other}));assert.throws(()=>projection.parseInvocationQuery({limit:'50'}));assert.throws(()=>projection.parseInvocationQuery({after:'../../private'}));assert.throws(()=>projection.parseInvocationQuery({kind:['http']}))
 const good=Buffer.from(JSON.stringify({run_id:id,step_key:'wf2_00002_tool'})).toString('base64url');assert.equal(projection.parseInvocationCursor(good).run_id,id);assert.throws(()=>projection.parseInvocationCursor(good+'='));assert.throws(()=>projection.parseInvocationCursor(Buffer.from(JSON.stringify({run_id:id,step_key:'x',owner:other})).toString('base64url')))
 for(const alias of ['r','m','p','s','t'])assert.ok(projection.invocationReadSql.includes(alias+'.owner_user_id=e.owner_user_id'))
 assert.ok(projection.invocationReadSql.includes('LIMIT 501'));const final=projection.invocationReadSql.slice(projection.invocationReadSql.lastIndexOf('SELECT run_id::text'));for(const field of ['result_reference','output_text','planner_output','headers','api_key','instruction','params_template'])assert.equal(final.includes(field),false)
 assert.ok(projection.invocationReadSql.includes("e.tool_name IN('workflow:tool','calculate','summarize','knowledge_search','web_fetch','web_search')"))
})
test('tool hub remains separately default off and cannot open writes without original configuration and Workflow gates',()=>{
 const base={listen:true,allowedOrigin:'https://native.example',configurationWrites:true,workflowV2ExecutionUat:true},env={AGENT_STUDIO_PG_OWNER_TOOL_HUB_AVAILABLE:'true',AGENT_STUDIO_PG_OWNER_TOOL_HUB_APPROVED:OWNER_TOOL_HUB_APPROVAL,AGENT_STUDIO_PG_OWNER_TOOL_TRIALS_ENABLED:'true'};assert.deepEqual(selectOwnerToolHubCapabilities({},base),{available:false,trials:false,registry:false});assert.equal(selectOwnerToolHubCapabilities(env,base).trials,true)
 for(const changed of [{configurationWrites:false},{workflowV2ExecutionUat:false},{listen:false},{allowedOrigin:'http://untrusted.example'}])assert.throws(()=>selectOwnerToolHubCapabilities(env,{...base,...changed}))
})
test('069 source parser checks remain closed, including SQL NULL-sensitive target/fee constraints',()=>{
 for(const check of ["(target->>'kind'=source_kind) IS TRUE","(fee_consent OR source_kind='builtin' AND target->>'tool'='calculate') IS TRUE","purpose IN('tool','registry_translation')"]){assert.equal(typeof normalizeOwnerToolTrialCheck(check),'string')}
 const source="(fee_consent OR source_kind='builtin' AND target->>'tool'='calculate') IS TRUE",deparsed="CHECK (((fee_consent OR ((source_kind = 'builtin'::text) AND ((target ->> 'tool'::text) = 'calculate'::text))) IS TRUE))"
 assert.equal(normalizeOwnerToolTrialCheck(source),normalizeOwnerToolTrialCheck(deparsed))
 for(const different of ["((fee_consent OR source_kind='builtin') AND target->>'tool'='calculate') IS TRUE","(fee_consent OR source_kind='builtin' AND target->>'kind'='calculate') IS TRUE","(fee_consent OR source_kind='builtin' AND target->>'tool'='calculate') IS NOT TRUE", "fee_consent OR source_kind='builtin' AND target->>'tool'='calculate'"])assert.notEqual(normalizeOwnerToolTrialCheck(source),normalizeOwnerToolTrialCheck(different))
 for(const unknown of ["(target->'kind'=source_kind) IS TRUE","(target#>>'{kind}'=source_kind) IS TRUE","(target->>'kind'=source_kind) IS FALSE","(target->>'kind'=source_kind) IS TRUE -- skipped", "(target->>'kind'=source_kind) IS TRUE; SELECT 1"])assert.throws(()=>normalizeOwnerToolTrialCheck(unknown))
 const sql=fs.readFileSync(path.join(root,'db/postgres/migrations/pg_v9_069_owner_tool_trials.sql'),'utf8');assert.match(sql,/GRANT SELECT,INSERT ON agentstudio.toolhub_trials TO agentstudio_api/);assert.doesNotMatch(sql,/GRANT .* TO agentstudio_worker/);assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.match(sql,/FORCE ROW LEVEL SECURITY/);assert.match(sql,/checkpoint->'machine'->>'graph_sha256' IS DISTINCT FROM NEW.graph_sha256/)
})
