// Pure refusals only. Invented negative rows never establish SQL authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {verifyAgentDesignCompanyDependencies} from '../src/agent-design-predecessor-audit-core.ts'
const denied=async rows=>{
  const queries=[]
  const db={async query(sql){queries.push(sql);assert.match(sql,/design062:dependency_principal/);return {rows}},release(){throw Error('caller connection must remain owned by caller')}}
  await assert.rejects(()=>verifyAgentDesignCompanyDependencies(db),/unsafe_company_overview_privileges/)
  assert.equal(queries.length,1)
  assert.ok(queries.every(sql=>!/^\s*(SET|BEGIN|COMMIT|ROLLBACK|GRANT|INSERT|UPDATE|DELETE)/.test(sql)))
}
test('new062 worker predecessor never accepts an API/admin/review principal',async()=>{
  for(const role of ['agentstudio_api','agentstudio_admin','agentstudio_review_worker','agentstudio_review_dispatch'])await denied([{id:100,role,safe:true}])
})
test('unsafe real-principal predicate or missing login ID refuses before061 catalog reads',async()=>{
  for(const role of ['agentstudio_design_worker','agentstudio_design_dispatch']){
    await denied([{id:100,role,safe:false}]);await denied([{id:null,role,safe:true}])
  }
})
test('missing or duplicate principal rows cannot become successful dependency proof',async()=>{
  await denied([]);await denied([{id:100,role:'agentstudio_design_worker',safe:true},{id:101,role:'agentstudio_design_dispatch',safe:true}])
})
