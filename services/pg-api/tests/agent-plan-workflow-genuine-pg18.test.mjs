// Genuine original-client PG18 SQL/API-repository suite. Never skipped locally:
// the pure guard refuses before source imports, pools or SQL initialization.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireAgentPlanWorkflowGenuineCi} from './helpers/agent-plan-workflow-genuine-guard.mjs'
test('F05 actual064 catalog, source proofs, one-use dispatch and atomic Workflow persistence',{concurrency:false,timeout:900000},async t=>{
 requireAgentPlanWorkflowGenuineCi()
 const [{agentPlanWorkflowGenuineFixture},crypto,fs]=await Promise.all([import('./helpers/agent-plan-workflow-genuine-fixture.mjs'),import('node:crypto'),import('node:fs')])
 const f=await agentPlanWorkflowGenuineFixture(),hash=value=>crypto.createHash('sha256').update(f.contract.canonicalAgentPlanWorkflowValue(value)).digest('hex')
 const run=async(name,body)=>{let completed=false,failure;await t.test(name,async()=>{try{await body();completed=true}catch(e){failure=e;throw e}});if(!completed)throw failure??Error('F05 child did not finish '+name)}
 const cancel=p=>f.ledger.control(p.identity,f.control(p,'cancel'))
 const meta=p=>f.admin(async db=>(await db.query('SELECT j.state,(SELECT count(*)::integer FROM agentstudio.agent_plan_workflow_reservations e WHERE e.owner_user_id=j.owner_user_id AND e.request_id=j.request_id) AS spent,(SELECT count(*)::integer FROM agentstudio.agent_plan_workflow_outputs o WHERE o.owner_user_id=j.owner_user_id AND o.request_id=j.request_id) AS outputs,(SELECT count(*)::integer FROM agentstudio.agent_plan_workflow_inputs i WHERE i.owner_user_id=j.owner_user_id AND i.request_id=j.request_id) AS inputs FROM agentstudio.agent_plan_workflow_jobs j WHERE j.owner_user_id=$1 AND j.request_id=$2',[f.users[p.who],p.intent.request_id])).rows[0])
 try{
  await run('actual API and both independent authenticated private roles verify full catalogs',async()=>{assert.deepEqual(await f.roleAudit(),[true,true,true]);const rows=await f.admin(async db=>(await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version IN('pg_v9_063','pg_v9_064') ORDER BY version")).rows);assert.deepEqual(rows.map(r=>r.version),['pg_v9_063','pg_v9_064'])})
  const vectorRaw=fs.readFileSync(new URL('./fixtures/agent-plan-workflow-canonical-vectors.json',import.meta.url));assert.equal(crypto.createHash('sha256').update(vectorRaw).digest('hex'),'c1553d4fc46839c885d1fb27f0e5bff1598d0681ee8fde4d0141ed9f68f88580')
  const vectors=JSON.parse(vectorRaw).vectors;assert.equal(vectors.length,18)
  for(const vector of vectors)await run('actual SQL canonical parity '+vector.name,async()=>{assert.equal(hash(vector.value),vector.sha256);const r=await f.admin(async db=>(await db.query("SELECT agentstudio.agent_design_compact($1::jsonb) AS canonical,agentstudio.agent_plan_workflow_digest($1::jsonb) AS sha,octet_length(agentstudio.agent_design_compact($1::jsonb)) AS bytes",[JSON.stringify(vector.value)])).rows[0]);assert.equal(r.canonical,vector.canonical_utf8);assert.equal(r.bytes,vector.utf8_length);assert.equal(r.sha,vector.sha256)})
  const negative=async()=>{
   await assert.rejects(()=>f.api('alice',async()=>true),/unsafe_agent_plan_workflow_privileges/)
   for(const [key,pool]of Object.entries(f.privatePools))await assert.rejects(()=>f.asRole(pool,'agentstudio_plan_workflow_'+key,db=>f.audit(db)),/unsafe_agent_plan_workflow_privileges/)
  }
  const tamper=async(apply,restore)=>{await f.roleAudit();let applied=false;try{await f.admin(apply);applied=true;await negative()}finally{if(applied)await f.admin(restore)}assert.deepEqual(await f.roleAudit(),[true,true,true])}
  const target='agentstudio.agent_plan_workflow_requests'
  for(const [name,apply,restore]of [
   ['extra reserved family role',db=>db.query('CREATE ROLE agentstudio_plan_workflow_fixture_extra NOLOGIN'),db=>db.query('DROP ROLE agentstudio_plan_workflow_fixture_extra')],
   ['private table API read',db=>db.query('GRANT SELECT ON '+target+' TO agentstudio_api'),db=>db.query('REVOKE SELECT ON '+target+' FROM agentstudio_api')],
   ['private column dispatch read',db=>db.query('GRANT SELECT(input_sha256) ON '+target+' TO agentstudio_plan_workflow_dispatch'),db=>db.query('REVOKE SELECT(input_sha256) ON '+target+' FROM agentstudio_plan_workflow_dispatch')],
   ['helper PUBLIC execute',db=>db.query('GRANT EXECUTE ON FUNCTION agentstudio.agent_plan_workflow_digest(jsonb) TO PUBLIC'),db=>db.query('REVOKE EXECUTE ON FUNCTION agentstudio.agent_plan_workflow_digest(jsonb) FROM PUBLIC')],
   ['cross-family RPC execute',db=>db.query('GRANT EXECUTE ON FUNCTION agentstudio.agent_plan_workflow_finish(uuid,uuid,bigint,uuid,jsonb) TO agentstudio_plan_workflow_worker'),db=>db.query('REVOKE EXECUTE ON FUNCTION agentstudio.agent_plan_workflow_finish(uuid,uuid,bigint,uuid,jsonb) FROM agentstudio_plan_workflow_worker')],
   ['old review RPC execute',db=>db.query('GRANT EXECUTE ON FUNCTION agentstudio.agent_design_claim(uuid) TO agentstudio_plan_workflow_worker'),db=>db.query('REVOKE EXECUTE ON FUNCTION agentstudio.agent_design_claim(uuid) FROM agentstudio_plan_workflow_worker')],
   ['RLS disabled',db=>db.query('ALTER TABLE '+target+' DISABLE ROW LEVEL SECURITY'),db=>db.query('ALTER TABLE '+target+' ENABLE ROW LEVEL SECURITY')],
   ['forced RLS disabled',db=>db.query('ALTER TABLE '+target+' NO FORCE ROW LEVEL SECURITY'),db=>db.query('ALTER TABLE '+target+' FORCE ROW LEVEL SECURITY')],
   ['immutable hook disabled',db=>db.query('ALTER TABLE '+target+' DISABLE TRIGGER agent_plan_workflow_requests_immutable'),db=>db.query('ALTER TABLE '+target+' ENABLE TRIGGER agent_plan_workflow_requests_immutable')],
   ['extra private index',db=>db.query('CREATE INDEX agent_plan_workflow_fixture_extra ON '+target+'(request_id)'),db=>db.query('DROP INDEX agentstudio.agent_plan_workflow_fixture_extra')],
   ['private source timezone drift',db=>db.query("ALTER FUNCTION agentstudio.agent_plan_workflow_source_private(uuid,jsonb,boolean) SET TimeZone='Asia/Shanghai'"),db=>db.query("ALTER FUNCTION agentstudio.agent_plan_workflow_source_private(uuid,jsonb,boolean) SET TimeZone='UTC'")]
  ])await run('actual catalog refusal/restoration: '+name,()=>tamper(apply,restore))
  await run('generation confirmation is exactly once with independent owner scope and paid acknowledgement',async()=>{
   const p=await f.submitted(),before=await f.state(),old=await f.ledger.confirm(p.identity,p.intent);assert.equal(old.replayed,true);assert.equal(old.request_sha256,hash(f.contract.agentPlanWorkflowPaidIntentValue(p.intent)));assert.deepEqual(await f.state(),before)
   assert.equal(await f.api('bob',db=>f.call(db,'receipt',[p.intent.request_id])),null)
   await assert.rejects(()=>f.ledger.submit(p.identity,{...p.intent,instruction:'different input'}));await assert.rejects(()=>f.ledger.submit(p.identity,{...p.intent,fee_acknowledgement:'old_or_implicit'}));assert.deepEqual(await f.state(),before)
   const c=await cancel(p);assert.equal(c.state,'cancelled');assert.equal(await f.ledger.claim(crypto.randomUUID()),null)
  })
  await run('actual source/record independently rebuilds input and rejects forged prepared values',async()=>{
   const p=await f.submitted(),before=await f.state(),intent={...p.intent,request_id:crypto.randomUUID()}
   await assert.rejects(()=>f.api('alice',db=>f.call(db,'record',[intent,{...p.prepared,owner_user_id:f.users.bob}])));assert.deepEqual(await f.state(),before);await cancel(p)
  })
  await run('concurrent real claimants and reservation transactions grant one effect only',async()=>{
   const p=await f.submitted(),claims=await Promise.all([f.ledger.claim(crypto.randomUUID()),f.ledger.claim(crypto.randomUUID())]);assert.equal(claims.filter(Boolean).length,1);const lease=f.proof(claims.find(Boolean));assert.equal(lease.request_id,p.intent.request_id)
   const reserved=await Promise.allSettled([f.ledger.reserve(lease),f.ledger.reserve(lease)]);assert.equal(reserved.filter(v=>v.status==='fulfilled').length,1);assert.equal(reserved.filter(v=>v.status==='rejected').length,1);assert.equal((await meta(p)).spent,1)
   const c=await cancel(p);assert.equal(c.state,'unknown');assert.equal((await f.ledger.pause(lease)).state,'unknown');assert.equal(await f.ledger.claim(crypto.randomUUID()),null)
  })
  await run('source Agent ABA after submission pauses without any reservation',async()=>{
   const p=await f.submitted();await f.admin(async db=>{await db.query("UPDATE agentstudio.agent_specs SET name=name||'x' WHERE id=$1",[p.receipt.source.spec_id]);await db.query('UPDATE agentstudio.agent_specs SET name=$2 WHERE id=$1',[p.receipt.source.spec_id,p.prepared.source_values.name])})
   assert.equal(await f.ledger.claim(crypto.randomUUID()),null);assert.deepEqual(await meta(p),{state:'paused',spent:0,outputs:0,inputs:1});await cancel(p)
  })
  await run('source encrypted model ABA after reservation records unknown and retains spent',async()=>{
   const p=await f.submitted(),lease=await f.claimed(p);await f.ledger.reserve(lease)
   await f.admin(async db=>{await db.query("UPDATE agentstudio.model_connections SET api_key_ciphertext=api_key_ciphertext||decode('ff','hex') WHERE id=$1",[p.choice.generation_model.connection_id]);await db.query('UPDATE agentstudio.model_connections SET api_key_ciphertext=substring(api_key_ciphertext FROM 1 FOR octet_length(api_key_ciphertext)-1) WHERE id=$1',[p.choice.generation_model.connection_id])})
   const reply=await f.ledger.finish(lease,{status:'succeeded',model_json:JSON.stringify(f.output())});assert.equal(reply.state,'unknown');assert.equal(reply.completion_sha256,hash({protocol:'agent_plan_workflow_completion_v1',purpose:f.contract.agentPlanWorkflowPurpose,request_id:p.intent.request_id,completion:f.result.normalizeAgentPlanWorkflowCompletion({status:'succeeded',model_json:JSON.stringify(f.output())})}));assert.deepEqual(await meta(p),{state:'unknown',spent:1,outputs:0,inputs:1});assert.equal(await f.ledger.claim(crypto.randomUUID()),null)
  })
  await run('a separately selected generation model cannot become an execution binding',async()=>{
   const created=await f.models.create(f.identities.alice,{name:'F05 generation only',provider:'openai',base_url:'https://api.openai.com/v1',api_key:'synthetic-generation-only-never-network',models:['generation-only'],enabled:true}),model=await f.models.testConnection(f.identities.alice,created.id,created.revision,async()=>({status:'ok',latency_ms:1,error_code:''})),binding={connection_id:model.id,connection_revision:model.revision,model_id:'generation-only'}
   const p=await f.submitted('alice','generation selection is not execution authority',binding),lease=await f.claimed(p);await f.ledger.reserve(lease)
   const output=f.output();output.graph.nodes[1]={id:'calc',type:'model',position:{x:200,y:0},data:{title:'计算',prompt:'{{input}}',model_binding:binding}}
   await assert.rejects(()=>f.ledger.finish(lease,{status:'succeeded',model_json:JSON.stringify(output)}),e=>e.code==='P0001'&&/agent_plan_workflow_invalid_result_references/.test(e.message));assert.equal((await f.ledger.pause(lease)).state,'unknown');assert.deepEqual(await meta(p),{state:'unknown',spent:1,outputs:0,inputs:1})
  })
  await run('actual Native account deactivation after reservation seals the existing effect as unknown',async()=>{
   const p=await f.submitted('bob'),lease=await f.claimed(p);await f.ledger.reserve(lease)
   await f.admin(db=>db.query('UPDATE agentstudio_auth.accounts SET enabled=false,governance_revision=governance_revision+1 WHERE user_id=$1',[f.users.bob]))
   try{const reply=await f.ledger.finish(lease,{status:'succeeded',model_json:JSON.stringify(f.output())});assert.equal(reply.state,'unknown');assert.deepEqual(await meta(p),{state:'unknown',spent:1,outputs:0,inputs:1});assert.equal(await f.ledger.claim(crypto.randomUUID()),null)}finally{await f.admin(db=>db.query('UPDATE agentstudio_auth.accounts SET enabled=true,governance_revision=governance_revision+1 WHERE user_id=$1',[f.users.bob]))}
  })
  await run('cancellation during a possibly sent effect cannot publish a returned success',async()=>{
   const p=await f.submitted(),lease=await f.claimed(p);await f.ledger.reserve(lease);const control=f.control(p,'cancel'),receipt=await f.ledger.control(p.identity,control);assert.equal(receipt.state,'unknown')
   const completion={status:'succeeded',model_json:JSON.stringify(f.output())},reply=await f.ledger.finish(lease,completion);assert.equal(reply.state,'unknown');assert.equal((await meta(p)).spent,1)
   assert.deepEqual(await f.ledger.control(p.identity,control,true),{...receipt,replayed:true});await assert.rejects(()=>f.ledger.finish(lease,{status:'unknown',failure_code:'different_completion'}));assert.equal((await meta(p)).outputs,0)
  })
  await run('expiry after reservation cannot become success or obtain another effect',async()=>{
   const p=await f.submitted(),lease=await f.claimed(p);await f.ledger.reserve(lease);await f.admin(db=>db.query("UPDATE agentstudio.agent_plan_workflow_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE owner_user_id=$1 AND request_id=$2",[f.users.alice,p.intent.request_id]));const reply=await f.ledger.finish(lease,{status:'succeeded',model_json:JSON.stringify(f.output())});assert.equal(reply.state,'unknown');assert.equal(await f.ledger.claim(crypto.randomUUID()),null);assert.equal((await meta(p)).spent,1)
  })
  await run('failed and unknown outcomes never promote on a changed completion',async()=>{
   for(const status of ['failed','unknown']){const p=await f.submitted(),lease=await f.claimed(p);await f.ledger.reserve(lease);const completion={status,failure_code:'synthetic_failure'},reply=await f.ledger.finish(lease,completion);assert.equal(reply.state,status);assert.deepEqual(await f.ledger.finish(lease,completion),reply);await assert.rejects(()=>f.ledger.finish(lease,{status:'succeeded',model_json:JSON.stringify(f.output())}));assert.equal((await meta(p)).outputs,0);assert.equal((await meta(p)).spent,1)}
  })
  await run('bounded loop topology and exact paid result survive atomic independent Workflow save',async()=>{
   const p=await f.succeeded(),model=f.output(),graph=structuredClone(model.graph);graph.nodes.splice(1,0,{id:'loop',type:'loop',position:{x:100,y:0},data:{title:'循环',mode:'count',count:2,max_iterations:2}});graph.edges=[{id:'a',source:'start',target:'loop'},{id:'b',source:'loop',target:'calc'},{id:'c',source:'calc',target:'loop'},{id:'d',source:'loop',target:'end',sourceHandle:'done'}]
   const s=await f.saveInput(p,{name:'编辑后的循环草稿',graph}),before=await f.state(),receipt=await f.ledger.save(p.identity,s.intent,s.input);assert.equal(receipt.workflow_revision,1);const after=await f.state();assert.equal(after.workflows,before.workflows+1);assert.equal(after.saves,before.saves+1);assert.equal(after.provenance,before.provenance+1);assert.equal(after.audits,before.audits+2);assert.equal(after.old_runs,before.old_runs);assert.equal(after.old_effects,before.old_effects)
   const w=await f.workflow.get(p.identity,receipt.workflow_id);assert.deepEqual(w.graph,s.preview.candidate.graph);assert.equal(w.name,s.preview.candidate.name)
   const provenance=await f.admin(async db=>(await db.query('SELECT p.*,s.receipt FROM agentstudio.agent_plan_workflow_save_provenance p JOIN agentstudio.agent_plan_workflow_save_receipts s USING(owner_user_id,save_request_id) WHERE p.save_request_id=$1',[receipt.request_id])).rows[0]);assert.equal(provenance.generation_request_id,p.intent.request_id);assert.equal(provenance.candidate_sha256,receipt.candidate_sha256);assert.equal(provenance.result_sha256,p.view.result.result_sha256)
   assert.deepEqual(await f.ledger.save(p.identity,s.intent,s.input,true),{...receipt,replayed:true});assert.deepEqual(await f.state(),after)
   await f.workflow.update(p.identity,w.id,'后续独立编辑',w.graph,w.revision);assert.deepEqual(await f.ledger.save(p.identity,s.intent,s.input,true),{...receipt,replayed:true})
   for(const [table,key]of [['save_receipts','save_request_id'],['save_provenance','save_request_id'],['reservations','request_id'],['outcomes','request_id']])await assert.rejects(()=>f.admin(db=>db.query('DELETE FROM agentstudio.agent_plan_workflow_'+table+' WHERE '+key+'=$1',[key==='save_request_id'?receipt.request_id:p.intent.request_id])),e=>e.code==='P0001'&&/agent_plan_workflow_immutable_evidence/.test(e.message))
   await f.ledger.control(p.identity,f.control(p,'erase'));assert.equal((await meta(p)).inputs,0);assert.equal((await meta(p)).outputs,0);assert.equal((await meta(p)).spent,1);assert.ok(await f.workflow.get(p.identity,w.id));assert.deepEqual(await f.ledger.save(p.identity,s.intent,s.input,true),{...receipt,replayed:true});assert.equal((await f.ledger.finish(p.lease,p.completion)).state,'succeeded');assert.equal((await meta(p)).state,'erased')
  })
  await run('unrelated Workflow UUID collision is rejected without adopting it',async()=>{
   const p=await f.succeeded(),s=await f.saveInput(p);await f.workflow.createIdempotent(p.identity,s.intent.request_id,s.preview.candidate.name,s.preview.candidate.graph);const before=await f.state();await assert.rejects(()=>f.ledger.save(p.identity,s.intent,s.input));assert.deepEqual(await f.state(),before)
  })
  await run('stale original paid output remains readable while new saving is refused',async()=>{
   const p=await f.succeeded(),s=await f.saveInput(p),old=await f.agents.get(p.identity,p.receipt.source.spec_id),{require_approval:_,...spec}=old.spec
   assert.ok(await f.agents.update(p.identity,old.id,old.name,f.contracts.safeAgentSpec({...spec,goal:'Actual later source text must not overwrite the paid artifact'}),old.revision))
   const view=await f.ledger.view(p.identity,p.intent.request_id);assert.equal(view.result_status,'stale');assert.deepEqual(view.result,p.view.result)
   const before=await f.state();await assert.rejects(()=>f.ledger.save(p.identity,s.intent,s.input));assert.deepEqual(await f.state(),before)
  })
  await run('explicit outer rollback removes Workflow, both audits, provenance and receipt together',async()=>{
   const p=await f.succeeded(),s=await f.saveInput(p),before=await f.state();await assert.rejects(()=>f.api('alice',async db=>{assert.equal(await f.call(db,'save_record',[s.intent,s.preview]),s.intent.request_id);throw Error('F05 explicit save rollback')}),/F05 explicit save rollback/);assert.deepEqual(await f.state(),before);assert.equal(await f.api('alice',db=>f.call(db,'save_receipt',[s.intent.request_id])),null);const r=await f.ledger.save(p.identity,s.intent,s.input);assert.equal(r.workflow_revision,1)
  })
  await run('erasure destroys only bodies; original immutable completion and controls remain confirmable',async()=>{
   const p=await f.succeeded(),control=f.control(p,'erase'),receipt=await f.ledger.control(p.identity,control),before=await f.state();assert.equal(receipt.state,'erased');assert.equal(await f.api('alice',db=>f.call(db,'read_result',[p.intent.request_id])),null);const v=await f.ledger.view(p.identity,p.intent.request_id);assert.equal(v.result_status,'erased');assert.equal(v.receipt.body_erased,true);assert.equal(v.receipt.request_sha256,p.receipt.request_sha256);assert.deepEqual(await f.ledger.finish(p.lease,p.completion),p.reply);assert.deepEqual(await f.ledger.control(p.identity,control,true),{...receipt,replayed:true});assert.deepEqual(await f.state(),before);assert.equal(await f.ledger.claim(crypto.randomUUID()),null)
  })
  await run('final actual catalogs remain valid and F05 created no run or old effect',async()=>{assert.deepEqual(await f.roleAudit(),[true,true,true]);const state=await f.state();assert.equal(state.old_runs,0);assert.equal(state.old_effects,0)})
 }finally{await f.close()}
})
