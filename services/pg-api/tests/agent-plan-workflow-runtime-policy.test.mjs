// Pure policy/query-order models only. No real SQL roles, grants or auditor.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {agentPlanWorkflowNativeApproval as native,agentPlanWorkflowExecutionApproval as execution,agentPlanWorkflowPrivateRoute,selectNativeAgentPlanWorkflowCapabilities as select,selectAgentPlanWorkflowServiceOptIn as service,agentPlanWorkflowExecutionEnabled as enabled,assertAgentPlanWorkflowSession as session,requireAgentPlanWorkflowAudit as audit,inspectAgentPlanWorkflowApiPool as inspect} from '../src/agent-plan-workflow-runtime-policy.ts'
const prefix='AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_',role='agentstudio_plan_workflow_worker'
const env=more=>({[prefix+'AVAILABLE']:'true',[prefix+'APPROVED']:native,...more})
function model(change={}){const calls=[],safe={login:true,inherit:false,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false,initial_role:true};let released=0
 const db={query:async(sql,values)=>{calls.push([sql,values]);let rows=sql.includes('WHERE rolname=session_user')?[{...safe,...change.login}]:sql.includes('WHERE rolname=$1')?[{...safe,login:false,...change.target}]:sql.includes('pg_has_role')?(change.reachable??[{name:role}]):sql.includes('pg_auth_members')?(change.direct??[{name:role,admin:false,inherit:false,set:true}]):sql==='SELECT current_user AS role'?[{role:'agentstudio_api'}]:[];return {rows}},release(){released++}}
 return {db,calls,pool:{connect:async()=>db},released:()=>released}
}
test('F05 defaults independently off; F01 approvals and unrelated flags cannot enable it',()=>{
 assert.deepEqual(select({},false,'',false),{available:false,submissions:false,saves:false});assert.equal(service({}),false);assert.equal(enabled(),false)
 assert.deepEqual(select({AGENT_STUDIO_PG18_AGENT_DESIGN_AVAILABLE:'true'},false,'',false),{available:false,submissions:false,saves:false})
 assert.throws(()=>select(env({[prefix+'APPROVED']:'APPROVE_DISPOSABLE_PG18_NATIVE_AGENT_DESIGN_ONLY'}),true,'https://local.test',true))
 assert.equal(agentPlanWorkflowPrivateRoute,'/__internal/v1/agent-plan-workflow/dispatch')
})
test('Native and service opt-ins require complete exact independent approval and HTTPS origin',()=>{
 assert.deepEqual(select(env({[prefix+'SUBMISSIONS_ENABLED']:'true'}),true,'https://local.test',true),{available:true,submissions:true,saves:false})
 for(const [e,listen,origin,writes]of [[env(),false,'https://local.test',true],[env(),true,'http://local.test',true],[env(),true,'https://local.test/',true],[env({[prefix+'AVAILABLE']:'false'}),true,'https://local.test',true],[env({[prefix+'SAVES_ENABLED']:'true'}),true,'https://local.test',false]])assert.throws(()=>select(e,listen,origin,writes))
 assert.equal(service({[prefix+'EXECUTION_ENABLED']:'true',[prefix+'EXECUTION_APPROVED']:execution}),true);assert.equal(enabled({executionEnabled:true,executionApproval:execution}),true)
 for(const e of [{[prefix+'EXECUTION_ENABLED']:'true'},{[prefix+'EXECUTION_APPROVED']:execution},{[prefix+'EXECUTION_ENABLED']:'true',[prefix+'EXECUTION_APPROVED']:native}])assert.throws(()=>service(e))
 assert.throws(()=>enabled({executionEnabled:true,executionApproval:native}))
})
test('session model inspects original LOGIN, target NOLOGIN, transitive reachability and direct grant before SET ROLE',async()=>{
 const m=model();await session(m.db,role);assert.equal(m.calls.length,4);assert.deepEqual(m.calls[1][1],[role]);assert.ok(m.calls.every(([sql])=>!sql.includes('SET LOCAL ROLE')))
})
test('session refuses unsafe LOGIN/target and any extra, inherited, admin or non-settable grant',async()=>{
 for(const change of [{login:{initial_role:false}},{login:{inherit:true}},{login:{superuser:true}},{target:{login:true}},{target:{bypassrls:true}},{target:{inherit:true}},{reachable:[{name:role},{name:'agentstudio_api'}]},{direct:[{name:role,admin:true,inherit:false,set:true}]},{direct:[{name:role,admin:false,inherit:true,set:true}]},{direct:[{name:role,admin:false,inherit:false,set:false}]}])await assert.rejects(()=>session(model(change).db,role),/session_role_refused/)
 await assert.rejects(()=>session(model().db,'agentstudio_design_worker'),/session_role_refused/)
})
test('actual auditor is mandatory on the exact client; false, truthy and absent do not pass',async()=>{
 const m=model();for(const verifier of [undefined,async()=>false,async()=>1])await assert.rejects(()=>audit(m.db,verifier),/actual_auditor_required/)
 let seen;await audit(m.db,async db=>{seen=db;return true});assert.equal(seen,m.db)
})
test('API pool inspection always rolls back original client and releases after audit refusal',async()=>{
 const m=model();await assert.rejects(()=>inspect(m.pool,async()=>false),/actual_auditor_required/);assert.equal(m.calls[0][0],'BEGIN READ ONLY');assert.equal(m.calls.at(-1)[0],'ROLLBACK');assert.equal(m.released(),1)
})
test('pending real auditor has no loader, fallback module, computed import or F01 import',()=>{
 const source=readFileSync(new URL('../src/agent-plan-workflow-runtime-policy.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/\bimport\s*\(|agent-design-|loadAgentPlanWorkflow|return\s+async[^\n]*true/)
})
