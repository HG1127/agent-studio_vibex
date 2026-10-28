// Pure query fixtures prove call ordering/idempotence branches only. Actual062
// SQL identity, protected writes/history/rollback need the DB author's run.
import test from 'node:test'
import assert from 'node:assert/strict'
import {AgentDesignLedgerRepository} from '../src/agent-design-ledger.ts'
import {parseAgentDesignSubmission,agentDesignFees,parseAgentDesignControl,parseAgentDesignSaveIntent} from '../src/agent-design-contract.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),sha='a'.repeat(64),identity={issuer:'urn:agentstudio:local:v1',subject:'employee'}
const intent=()=>({action:'submit',purpose:'generate',instruction:'Create role',model_binding:{connection_id:id(2),connection_revision:1,model_id:'model'},output_token_limit:4096,source:null,request_id:id(3),expected_input_sha256:sha,confirm:true,fee_acknowledgement:agentDesignFees.generate})
function fixture(receipt){const calls=[],details=[],db={release(){calls.push('release')},async query(sql,args){calls.push(sql);details.push({sql,args});if(sql.includes('identity_user_id'))return {rows:[{id:id(1)}]};if(sql.includes('AS ok'))return {rows:[{ok:true}]};if(sql.includes('owner_state'))return {rows:[{value:{owner_user_id:id(1),governance_revision:1,epoch:1}}]};if(sql.includes('agent_design_receipt('))return {rows:[{value:receipt}]};if(/agent_design_(control|save)_receipt\(/.test(sql))return {rows:[{value:null}]};return {rows:[]}}};return {calls,details,db,pool:{connect:async()=>db}}}
const row=()=>({protocol:'agent_design_receipt_v1',request_id:id(3),purpose:'generate',model_binding:intent().model_binding,output_token_limit:4096,source:null,request_sha256:parseAgentDesignSubmission(intent()).request_sha256,input_sha256:sha,content_sha256:sha,source_sha256:sha,resources_sha256:sha,owner_governance_revision:1,owner_epoch:1,created_at:'2026-10-29T01:00:00.000Z',state:'queued',body_erased:false,recorded:true,replayed:false})
test('exact original receipt is read before new-submission opt-out, without another record/source read',async()=>{
  const f=fixture(row()),r=new AgentDesignLedgerRepository(f.pool,{audit:async db=>{assert.equal(db,f.db);return true}}),v=await r.submit(identity,intent())
  assert.equal(v.replayed,true);assert.ok(f.calls.indexOf('COMMIT')>f.calls.findIndex(s=>s.includes('agent_design_receipt(')))
  assert.equal(f.calls.some(s=>/agent_design_record|FROM agentstudio.model_connections|FROM agentstudio.agent_specs/.test(s)),false)
})
test('same request id with changed intent is refused and rolled back, not relabeled replay',async()=>{const f=fixture(row()),r=new AgentDesignLedgerRepository(f.pool,{audit:async()=>true});await assert.rejects(()=>r.submit(identity,{...intent(),instruction:'changed'}),e=>e.code==='agent_design_request_conflict');assert.ok(f.calls.includes('ROLLBACK'));assert.ok(!f.calls.includes('COMMIT'))})
test('fresh write defaults off while exact original confirmation stays read-only',async()=>{const f=fixture(null),r=new AgentDesignLedgerRepository(f.pool,{audit:async()=>true});await assert.rejects(()=>r.submit(identity,intent()),e=>e.code==='agent_design_submission_disabled');await assert.rejects(()=>r.confirm(identity,intent()),e=>e.status===404);assert.equal(f.calls.some(s=>s.includes('agent_design_record(')),false)})
test('v4 control receipt621 precedes target design620; exact replay takes no target/source lock',async()=>{
 const control={action:'cancel',request_id:id(7),design_request_id:id(3),confirm:true},f=fixture(null),r=new AgentDesignLedgerRepository(f.pool,{audit:async()=>true})
 await assert.rejects(()=>r.control(identity,control))
 const locks=f.details.filter(c=>c.sql.includes('pg_advisory'))
 assert.match(locks[0].sql,/,621/);assert.deepEqual(locks[0].args,[id(1)+':control:'+id(7)]);assert.match(locks[1].sql,/,620/);assert.deepEqual(locks[1].args,[id(1)+':design:'+id(3)])
 const normalized=parseAgentDesignControl(control),old={protocol:'agent_design_control_receipt_v1',request_id:id(7),design_request_id:id(3),action:'cancel',request_sha256:normalized.request_sha256,created_at:'2026-10-29T01:00:00.000Z',recorded:true,replayed:false},g=fixture(null),query=g.db.query
 g.db.query=async(sql,args)=>sql.includes('agent_design_control_receipt(')?{rows:[{value:old}]}:query(sql,args)
 assert.equal((await new AgentDesignLedgerRepository(g.pool,{audit:async()=>true}).control(identity,control)).replayed,true)
 assert.equal(g.details.some(c=>c.sql.includes(',620)')),false)
})
test('v4 view/preview lock design620 before source; new save locks receipt621 then target and requests UPDATE mode',async()=>{
 const save={action:'save',request_id:id(8),design_request_id:id(3),expected_preview_sha256:sha,expected_result_sha256:sha,expected_source_sha256:sha,expected_candidate_sha256:sha,confirm:true,save_acknowledgement:'APPROVE_EXACT_AGENT_DESIGN_SAVE_ONLY_V1'}
 for(const action of ['view','preview','save']){
  const f=fixture({...row(),state:'succeeded'}),r=new AgentDesignLedgerRepository(f.pool,{allowSaves:true,audit:async()=>true}),stop=Error('source fixture stop');let mode
  r.source.currentOnClient=async(identity,db,owner,selected,lockMode)=>{mode=lockMode;assert.equal(f.details.some(c=>c.sql.includes(',620)')&&c.args[0]===id(1)+':design:'+id(3)),true);throw stop}
  const input={action:'preview_save',design_request_id:id(3),expected_result_sha256:sha,fields:{name:'Name',goal:'Goal',task_scope:'',deliverables:[],task_plan:[],done_criteria:[]}}
  await assert.rejects(()=>action==='view'?r.view(identity,id(3)):action==='preview'?r.previewSave(identity,input):r.save(identity,save,input),e=>e===stop)
  assert.equal(mode,action==='save'?'update':'share');if(action==='save'){assert.match(f.details.find(c=>c.sql.includes('pg_advisory')).sql,/,621/);assert.deepEqual(f.details.find(c=>c.sql.includes('pg_advisory')).args,[id(1)+':save:'+id(8)])}
 }
 const normalized=parseAgentDesignSaveIntent(save),f=fixture(null),query=f.db.query
 f.db.query=async(sql,args)=>sql.includes('agent_design_save_receipt(')?{rows:[{value:{protocol:'agent_design_save_receipt_v1',request_id:id(8),design_request_id:id(3),request_sha256:normalized.request_sha256,preview_sha256:sha,result_sha256:sha,source_sha256:sha,candidate_sha256:sha,purpose:'generate',spec_id:id(9),before_revision:null,after_revision:1,created_at:'2026-10-29T01:00:00.000Z',recorded:true,replayed:false}}]}:query(sql,args)
 assert.equal((await new AgentDesignLedgerRepository(f.pool,{audit:async()=>true}).save(identity,save,null)).replayed,true);assert.equal(f.details.some(c=>c.sql.includes(',620)')),false)
})
