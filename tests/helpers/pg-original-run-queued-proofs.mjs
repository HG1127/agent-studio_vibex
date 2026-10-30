import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
export function createOriginalRunQueuedProofs(f,owned,identities,observed){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
 const snapshots=new Map();let serial=0
 const runRow=async(who,id)=>{assert(['alice','bob'].includes(who)&&uuid.test(id));const rows=(await f.db.query('SELECT id,owner_user_id,kind,agent_spec_id,workflow_id,status,step_count,checkpoint FROM agentstudio.runs WHERE id=$1::uuid',[id])).rows;assert.equal(rows.length,1);assert.equal(rows[0].owner_user_id,f.users[who]);return rows[0]}
 return{
  clearProofs(){snapshots.clear()},
  async assertZeroExecution(){
   assert.equal(f.providerRequests.length,0);assert.equal(f.credentialReads(),0);assert.equal(observed.modelCredentialReads(),0);f.assertNoProviderErrors()
   const row=(await f.db.query("SELECT (SELECT count(*)::integer FROM agentstudio.external_effects) AS effects,(SELECT count(*)::integer FROM agentstudio.run_steps) AS steps,(SELECT count(*)::integer FROM agentstudio.jobs WHERE status IN('leased','running','succeeded')) AS executed_jobs,(SELECT count(*)::integer FROM agentstudio.audit_events WHERE action='model.connection_probe') AS probes,(SELECT coalesce(sum(step_count),0)::integer FROM agentstudio.runs) AS step_count")).rows[0]
   assert.equal(row.effects,0);assert.equal(row.steps,0);assert.equal(row.executed_jobs,0);assert.equal(row.step_count,0);assert.equal(row.probes,observed.initialProbeAudits)
   return{provider_calls:0,story_model_material_reads:0,design_credential_reads:0,external_effects:0,executed_steps:0,executed_jobs:0,extra_model_probes:0,inherited_seed_probes:row.probes}
  },
  async proveAdmission(){
   let auditCount=0,memoryContextCount=0
   for(const who of ['alice','bob'])for(const[kind,d]of Object.entries(owned[who].runs)){
    const row=await runRow(who,d.run.id),agent=kind.startsWith('agent_'),resource=agent?row.agent_spec_id:row.workflow_id
    assert.equal(row.kind,agent?'agent':'workflow');assert.equal(resource,d.run[agent?'agent_spec_id':'workflow_id']);assert.equal(row.status,'queued');assert.equal(Number(row.step_count),0)
    assert.equal(row.checkpoint.execution_mode??null,kind==='agent_single'?null:kind==='workflow_safe'?'start_end_only':kind==='workflow_v2'?'workflow_native_v2':'agent_native_v2')
    const jobs=(await f.db.query('SELECT owner_user_id,run_id,status,payload FROM agentstudio.jobs WHERE run_id=$1::uuid',[row.id])).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].owner_user_id,f.users[who]);assert.equal(jobs[0].run_id,row.id);assert.equal(jobs[0].status,'queued')
    const audits=(await f.db.query("SELECT owner_user_id,actor_user_id,run_id,action,result FROM agentstudio.audit_events WHERE run_id=$1::uuid AND action IN('workflow.run_submit','workflow.v2_submit','agent.v2_submit')",[row.id])).rows
    // Legacy safe Agent admission has a real queue row but no submit-audit
    // contract. Record that limitation; never synthesize an audit for it.
    if(kind==='agent_single')assert.equal(audits.length,0)
    else{assert.equal(audits.length,1);const a=audits[0];assert.equal(a.owner_user_id,f.users[who]);assert.equal(a.actor_user_id,f.users[who]);assert.equal(a.result,'succeeded');auditCount++}
    if(kind==='agent_autonomous'){const receipt=(await f.db.query('SELECT owner_user_id,run_id,spec_id,spec_revision,protocol FROM agentstudio.agent_memory_run_contexts WHERE run_id=$1::uuid',[row.id])).rows;assert.equal(receipt.length,1);assert.equal(receipt[0].owner_user_id,f.users[who]);assert.equal(receipt[0].spec_id,resource);assert.equal(receipt[0].protocol,'agent_memory_context_v1');memoryContextCount++}
   }
   const count=(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.model_connections WHERE owner_user_id=$1::uuid',[f.users.alice])).rows[0].n;assert.equal(count,61);const last=(await f.db.query('SELECT id FROM agentstudio.model_connections WHERE owner_user_id=$1::uuid ORDER BY updated_at DESC,id ASC OFFSET 60 LIMIT 1',[f.users.alice])).rows;assert.equal(last[0]?.id,owned.alice.parent.spec.model_binding.connection_id)
   return{actual_owned_queued_runs:8,actual_submit_audits:auditCount,actual_memory_context_receipts:memoryContextCount,actual_alice_model_rows:count,legacy_safe_agent_submit_audit_missing:true,all_queued_step_counts:0}
  },
  async runState(who,id){const r=await runRow(who,id);return{id:r.id,status:r.status,step_count:Number(r.step_count),actual_owner_verified:true}},
  async controlReceipts(who,id,body,expected){
   assert(['alice','bob'].includes(who)&&uuid.test(id)&&body&&uuid.test(body.operation_id)&&/^[a-f0-9]{64}$/.test(body.expected_state_sha256))
   const rows=(await f.db.query("SELECT owner_user_id,actor_user_id,run_id,metadata,result FROM agentstudio.audit_events WHERE action='agent.v2_run_control' AND run_id=$1::uuid AND metadata->>'operation_id'=$2::text",[id,body.operation_id])).rows;assert.equal(rows.length,expected)
   for(const row of rows){assert.equal(row.owner_user_id,f.users[who]);assert.equal(row.actor_user_id,f.users[who]);assert.equal(row.run_id,id);assert.equal(row.result,'succeeded');assert.equal(row.metadata.operation_id,body.operation_id);assert.equal(row.metadata.run_id,id);assert.equal(row.metadata.action,'pause');assert.equal(row.metadata.request_sha256,createHash('sha256').update(JSON.stringify([id,'pause',body.operation_id,body.expected_state_sha256])).digest('hex'))}
   return{actual_exact_receipt_rows:rows.length,actual_owner_and_actor_verified:true}
  },
  async feedbackCheckpoint(){const rows=(await f.db.query('SELECT * FROM agentstudio.agent_feedback_receipts ORDER BY owner_user_id,request_id')).rows,token='feedback_'+(++serial);assert(snapshots.size<8);snapshots.set(token,JSON.stringify(rows));return token},
  async feedbackUnchanged(token){assert(snapshots.has(token));const rows=(await f.db.query('SELECT * FROM agentstudio.agent_feedback_receipts ORDER BY owner_user_id,request_id')).rows;assert.equal(JSON.stringify(rows)===snapshots.get(token),true,'revoked feedback must not register a receipt');return{actual_feedback_receipts_unchanged:true}},
  async proveForeignIsolation(who,id){const current=await runRow(who,id),other=who==='alice'?'bob':'alice',mode=current.checkpoint.execution_mode;const kind=mode==='agent_native_v2'?'agent-autonomous-runs':mode==='workflow_native_v2'?'workflow-v2-runs':mode==='start_end_only'?'workflow-runs':'runs';return{expected_foreign_route:'/api/v2/'+kind+'/'+id,foreign_employee:f.users[other],owner:f.users[who]}},
 }
}
