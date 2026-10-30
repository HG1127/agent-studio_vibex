// API fixtures are pure UI/session behavior; not actual Native or SQL authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativeAgentDesignSession} from '../src/lib/pgNativeAgentDesignSession.ts'
import {deriveAgentDesignCandidate} from '../services/pg-api/src/agent-design-result.ts'
import {agentDesignHash,parseAgentDesignSaveIntent} from '../services/pg-api/src/agent-design-contract.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),sha='a'.repeat(64)
const choice={action:'preview',purpose:'generate',instruction:'设计方案',model_binding:{connection_id:id(2),connection_revision:1,model_id:'model'},output_token_limit:4096,source:null}
const preview=()=>({protocol:'agent_design_preview_v1',choice,input_sha256:sha,content_sha256:sha,source_sha256:sha,resources_sha256:sha,byte_length:600,output_token_limit:4096,fields_sent:{purpose:'generate',instruction:choice.instruction,before:null,current_tool_names:[],tool_suggestions_are_not_grants:true},recorded:false})
const receipt=(request=id(3),replayed=false)=>({protocol:'agent_design_receipt_v1',request_id:request,purpose:'generate',model_binding:choice.model_binding,output_token_limit:4096,source:null,request_sha256:sha,input_sha256:sha,content_sha256:sha,source_sha256:sha,resources_sha256:sha,owner_governance_revision:1,owner_epoch:1,created_at:'2026-10-29T01:00:00.000Z',state:'queued',body_erased:false,recorded:true,replayed})
const active=s=>{s.setActive(true);s.setAvailability({available:true,submissions:true,saves:true})}
test('three capabilities default off and preview cannot automatically submit/save',async()=>{let calls=0;const api={preview:async()=>{calls++;return preview()},submit:async()=>{calls++;return receipt()},save:async()=>{calls++;throw Error()}},s=createPgNativeAgentDesignSession(api,{employeeId:id(1),requestId:()=>id(3)});await s.preview(choice);assert.equal(calls,0);active(s);await s.preview(choice);assert.equal(calls,1);assert.ok(s.snapshot().preview);assert.equal(s.snapshot().receipt,null);s.dispose()})
test('unknown submit retains frozen exact body; opt-out permits only original read-only confirmation',async()=>{const calls=[],api={preview:async()=>preview(),submit:async(body,signal,confirm)=>{calls.push({body,confirm});if(!confirm)throw Error('ACK lost');return receipt(body.request_id,true)}},s=createPgNativeAgentDesignSession(api,{employeeId:id(1),requestId:()=>id(3)});active(s);await s.preview(choice);await s.submit();assert.ok(s.snapshot().pending);const original=s.snapshot().pending.body;assert.equal(Object.isFrozen(original),true);s.setAvailability({available:true,submissions:false,saves:false});await s.submit();assert.equal(calls.length,1);await s.confirmOriginal();assert.equal(calls.length,2);assert.equal(calls[1].confirm,true);assert.equal(JSON.stringify(calls[1].body),JSON.stringify(original));assert.equal(s.snapshot().pending,null);assert.equal(s.snapshot().receipt.replayed,true);s.dispose()})
test('scope deactivation/disposal fences late async results even when API ignores abort',async()=>{let resolve;const api={preview:()=>new Promise(r=>resolve=r)},s=createPgNativeAgentDesignSession(api,{employeeId:id(1)});active(s);const pending=s.preview(choice);s.setActive(false);resolve(preview());await pending;assert.equal(s.snapshot().preview,null);s.setActive(true);const late=s.preview(choice);s.dispose();resolve(preview());await late;assert.equal(s.snapshot().preview,null);assert.equal(s.matchesScope(api,id(1)),false)})
test('inactive or temporarily closed same-employee view hides but retains original unknown receipt recovery',async()=>{
 const calls=[],api={preview:async()=>preview(),submit:async(body,signal,confirm)=>{calls.push(confirm===true);if(!confirm)throw Error('unknown');return receipt(body.request_id,true)}},s=createPgNativeAgentDesignSession(api,{employeeId:id(1),requestId:()=>id(3)})
 active(s);await s.preview(choice);await s.submit();s.setActive(false);assert.equal(s.snapshot().pending,null);s.setActive(true);assert.equal(s.snapshot().pending.kind,'submit');s.setAvailability({available:false});assert.equal(s.snapshot().pending,null);s.setAvailability({available:true});assert.equal(s.snapshot().pending.kind,'submit');await s.confirmOriginal();assert.deepEqual(calls,[false,true]);assert.equal(s.snapshot().pending,null);s.dispose()
})
test('403 and401 clear prior content before notifying UI',async()=>{let expired=0;for(const code of [403,401]){const s=createPgNativeAgentDesignSession({preview:async()=>{throw {status:code}}},{employeeId:id(1),onExpired:()=>expired++});active(s);await s.preview(choice);assert.equal(s.snapshot().available,false);assert.equal(s.snapshot().preview,null);s.dispose()}assert.equal(expired,1)})
test('revision reads exact current source before preview and never invents an old role',async()=>{
  const calls=[],source={spec_id:id(4),revision:7,source_sha256:sha}
  const api={
    source:async spec=>{calls.push(['source',spec]);return {source}},
    preview:async value=>{calls.push(['preview',value]);return {...preview(),choice:value,fields_sent:{purpose:'revise',instruction:value.instruction,before:{name:'Old',goal:'Goal',task_scope:'',deliverables:[],task_plan:[],done_criteria:[]},current_tool_names:[],tool_suggestions_are_not_grants:true}}}
  }
  const s=createPgNativeAgentDesignSession(api,{employeeId:id(1)});active(s)
  await s.previewRevision({instruction:'修改目标',model_binding:choice.model_binding,output_token_limit:4096},id(4))
  assert.equal(calls[0][0],'source');assert.deepEqual(calls[1][1].source,source);assert.equal(s.snapshot().preview.choice.purpose,'revise');s.dispose()
})
test('complete edited fields require separate preview/save and save ACK recovery never submits a second save',async()=>{
  const output={name:'Designed',goal:'Goal',task_scope:'Scope',deliverables:['Deliver'],task_plan:['Plan'],done_criteria:['Done'],tools:['Advice']},calls=[]
  let next=3
  const api={preview:async()=>preview(),submit:async()=>receipt(),view:async()=>({protocol:'agent_design_view_v1',receipt:{...receipt(),state:'succeeded'},result_status:'available',result:{protocol:'agent_design_result_data_v1',request_id:id(3),result_sha256:sha,result:output}}),
    previewSave:async v=>{calls.push(['preview-save',v]);const candidate=deriveAgentDesignCandidate(null,output,v.fields),binding={design_request_id:id(3),purpose:'generate',result_sha256:sha,input_sha256:sha,source_sha256:sha,resources_sha256:sha,fields:v.fields,candidate_sha256:candidate.candidate_sha256};return {protocol:'agent_design_save_preview_v1',...Object.fromEntries(Object.entries(binding).filter(([k])=>k!=='candidate_sha256')),candidate,preview_sha256:agentDesignHash({protocol:'agent_design_save_preview_binding_v1',...binding}),recorded:false}},
    save:async(raw,signal,confirm)=>{calls.push(['save',raw,confirm]);if(!confirm)throw Error('save ACK lost');const v=parseAgentDesignSaveIntent(raw);return {protocol:'agent_design_save_receipt_v1',request_id:v.request_id,design_request_id:v.design_request_id,request_sha256:v.request_sha256,preview_sha256:v.expected_preview_sha256,result_sha256:v.expected_result_sha256,source_sha256:v.expected_source_sha256,candidate_sha256:v.expected_candidate_sha256,purpose:'generate',spec_id:id(9),before_revision:null,after_revision:1,created_at:'2026-10-29T01:00:00.000Z',recorded:true,replayed:true}}
  }
  const s=createPgNativeAgentDesignSession(api,{employeeId:id(1),requestId:()=>id(next++)});active(s)
  await s.preview(choice);await s.submit();await s.readResult();assert.equal(calls.length,0);assert.equal(s.snapshot().fields.task_scope,'Scope')
  s.editFields({...s.snapshot().fields,goal:'Edited goal'});await s.previewSave();assert.equal(calls.length,1);assert.equal(s.snapshot().savePreview.candidate.spec.goal,'Edited goal');assert.deepEqual(s.snapshot().savePreview.candidate.spec.tools,[])
  await s.save();assert.equal(calls.length,2);assert.equal(s.snapshot().pending.kind,'save');assert.equal(next,5)
  s.setAvailability({available:true,submissions:false,saves:false});await s.save();assert.equal(calls.length,2);await s.confirmOriginal();assert.equal(calls.length,3);assert.equal(calls[2][2],true);assert.equal(s.snapshot().saveReceipt.spec_id,id(9));assert.equal(s.snapshot().pending,null);assert.equal(next,5);s.dispose()
})
