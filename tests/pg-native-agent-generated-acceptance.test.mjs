import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {agentGeneratedTarget,agentGeneratedPreviewInput,agentGeneratedAcceptance,agentGeneratedPreview,agentGeneratedReceipt,agentGeneratedOriginal,agentGeneratedFeedbackHash,agentGeneratedPreviewHash,agentGeneratedRequestHash,agentGeneratedReceiptHash,agentGeneratedCanonical} from '../src/lib/pgNativeAgentGeneratedAcceptance.ts'
const vector={"preview":{"protocol":"agent_generated_preview_v1","source":{"review_id":"00000000-0000-4000-8000-000000000001","spec_id":"00000000-0000-4000-8000-000000000002","target_run_id":"00000000-0000-4000-8000-000000000010","review_request_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","input_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","content_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","result_sha256":"970398afce4e1a4d8a75370ca122eeaa8f97c1b4738dccf97f67f140eafb9ffe","completion_sha256":"131316f32a2847821db3060415c354d0d86659adebfc27339bf70fa059812032","source_owner_epoch":5,"source_protocol":"employee_statement_anchor_v1"},"feedback_sources":[{"run_id":"00000000-0000-4000-8000-000000000020","feedback_id":"00000000-0000-4000-8000-000000000030","feedback_sha256":"2222222222222222222222222222222222222222222222222222222222222222","feedback_revision":2,"feedback_source_sha256":"3333333333333333333333333333333333333333333333333333333333333333","statement_sha256":"4444444444444444444444444444444444444444444444444444444444444444"},{"run_id":"00000000-0000-4000-8000-000000000021","feedback_id":"00000000-0000-4000-8000-000000000031","feedback_sha256":"3333333333333333333333333333333333333333333333333333333333333333","feedback_revision":3,"feedback_source_sha256":"4444444444444444444444444444444444444444444444444444444444444444","statement_sha256":"5555555555555555555555555555555555555555555555555555555555555555"}],"feedback_sources_sha256":"4b3f320b0735d977b047e928dee11c6a24530fb3f34922413e5dbb9efb6c4882","anchor":{"run_id":"00000000-0000-4000-8000-000000000020","feedback_id":"00000000-0000-4000-8000-000000000030"},"before":{"revision":41,"source_sha256":"6666666666666666666666666666666666666666666666666666666666666666","descriptive":{"goal":"旧目标😀","task_scope":"范围","deliverables":["现有"],"task_plan":[],"done_criteria":[]}},"candidate":{"descriptive":{"goal":"新目标😀","task_scope":"边界:只改描述","deliverables":["核对"],"task_plan":["实施"],"done_criteria":["验收"]},"candidate_sha256":"4346238ecc429d9014e822a8aea5e70fc8a41027ead2cb096a4a853762c5eec5"},"changed_keys":["goal","task_scope","deliverables","task_plan","done_criteria"],"preview_sha256":"8f4aa4b5aafcb31dff37e4398c47881adeedd0e117b3b41f65035410d5b9dcfc","recorded":false},"original":{"action":"accept","request_id":"00000000-0000-4000-8000-000000000099","review_id":"00000000-0000-4000-8000-000000000001","spec_id":"00000000-0000-4000-8000-000000000002","target_run_id":"00000000-0000-4000-8000-000000000010","anchor_run_id":"00000000-0000-4000-8000-000000000020","anchor_feedback_id":"00000000-0000-4000-8000-000000000030","expected_preview_sha256":"8f4aa4b5aafcb31dff37e4398c47881adeedd0e117b3b41f65035410d5b9dcfc","expected_result_sha256":"970398afce4e1a4d8a75370ca122eeaa8f97c1b4738dccf97f67f140eafb9ffe","expected_spec_revision":41,"expected_spec_sha256":"6666666666666666666666666666666666666666666666666666666666666666","expected_candidate_sha256":"4346238ecc429d9014e822a8aea5e70fc8a41027ead2cb096a4a853762c5eec5","confirm":true,"acceptance_acknowledgement":"APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1"},"receipt":{"protocol":"agent_generated_acceptance_receipt_v1","source_kind":"generated_opinion","request_id":"00000000-0000-4000-8000-000000000099","request_sha256":"9ef887bfb3cc9ce0f19c83a5fae0bc34560acc6103b3daaa545fb96c8a49692f","source":{"review_id":"00000000-0000-4000-8000-000000000001","spec_id":"00000000-0000-4000-8000-000000000002","target_run_id":"00000000-0000-4000-8000-000000000010","review_request_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","input_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","content_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","result_sha256":"970398afce4e1a4d8a75370ca122eeaa8f97c1b4738dccf97f67f140eafb9ffe","completion_sha256":"131316f32a2847821db3060415c354d0d86659adebfc27339bf70fa059812032","source_owner_epoch":5,"source_protocol":"employee_statement_anchor_v1"},"feedback_sources":[{"run_id":"00000000-0000-4000-8000-000000000020","feedback_id":"00000000-0000-4000-8000-000000000030","feedback_sha256":"2222222222222222222222222222222222222222222222222222222222222222","feedback_revision":2,"feedback_source_sha256":"3333333333333333333333333333333333333333333333333333333333333333","statement_sha256":"4444444444444444444444444444444444444444444444444444444444444444"},{"run_id":"00000000-0000-4000-8000-000000000021","feedback_id":"00000000-0000-4000-8000-000000000031","feedback_sha256":"3333333333333333333333333333333333333333333333333333333333333333","feedback_revision":3,"feedback_source_sha256":"4444444444444444444444444444444444444444444444444444444444444444","statement_sha256":"5555555555555555555555555555555555555555555555555555555555555555"}],"feedback_sources_sha256":"4b3f320b0735d977b047e928dee11c6a24530fb3f34922413e5dbb9efb6c4882","anchor":{"run_id":"00000000-0000-4000-8000-000000000020","feedback_id":"00000000-0000-4000-8000-000000000030"},"before":{"revision":41,"source_sha256":"6666666666666666666666666666666666666666666666666666666666666666","revision_id":"00000000-0000-4000-8000-000000000090"},"after":{"revision":42,"source_sha256":"7777777777777777777777777777777777777777777777777777777777777777","revision_id":"00000000-0000-4000-8000-000000000091"},"candidate_sha256":"4346238ecc429d9014e822a8aea5e70fc8a41027ead2cb096a4a853762c5eec5","changed_keys":["goal","task_scope","deliverables","task_plan","done_criteria"],"preview_sha256":"8f4aa4b5aafcb31dff37e4398c47881adeedd0e117b3b41f65035410d5b9dcfc","acceptance_owner_epoch":5,"created_at":"2026-10-27T01:02:03.123Z","receipt_sha256":"d8c7bb9fef3352c106383ebb63c1dec67654491d94f8b539eed69fe0dddd3db7","recorded":true,"replayed":false}};

const clone=v=>structuredClone(v),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const order=v=>Array.isArray(v)?v.map(order):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,order(v[k])])):v;
const sha=v=>createHash('sha256').update(JSON.stringify(order(v)),'utf8').digest('hex');
const target={review_id:id(1),spec_id:id(2),target_run_id:id(10)};
function sealPreview(p){const {protocol,recorded,preview_sha256,...binding}=p;p.feedback_sources_sha256=sha({protocol:'agent_generated_feedback_set_v1',sources:p.feedback_sources});p.preview_sha256=sha({protocol:'agent_generated_preview_binding_v1',...binding,feedback_sources_sha256:p.feedback_sources_sha256});return p}
function sealReceipt(r){const {receipt_sha256,recorded,replayed,...core}=r;r.receipt_sha256=sha(core);return r}
function response(original=vector.original,replayed=false){const r=clone(vector.receipt);r.request_id=original.request_id;r.request_sha256=sha({protocol:'agent_generated_accept_intent_v1',...original});r.replayed=replayed;return sealReceipt(r)}

test('frozen cross-runtime canonical vectors: feedback/preview/intent/permanent receipt, exact15 core',async()=>{
 const p=await agentGeneratedPreview(vector.preview,target);assert.deepEqual(p,vector.preview);assert.equal(await agentGeneratedFeedbackHash(p.feedback_sources),'4b3f320b0735d977b047e928dee11c6a24530fb3f34922413e5dbb9efb6c4882');assert.equal(await agentGeneratedPreviewHash(p),'8f4aa4b5aafcb31dff37e4398c47881adeedd0e117b3b41f65035410d5b9dcfc');
 const original=agentGeneratedOriginal(p,id(99));assert.deepEqual(original,vector.original);assert.equal(await agentGeneratedRequestHash(original),'9ef887bfb3cc9ce0f19c83a5fae0bc34560acc6103b3daaa545fb96c8a49692f');
 assert.equal(Object.keys(original).length,14);assert.equal(Object.keys(vector.receipt).length,18);assert.equal(await agentGeneratedReceiptHash(vector.receipt),'d8c7bb9fef3352c106383ebb63c1dec67654491d94f8b539eed69fe0dddd3db7');assert.deepEqual(await agentGeneratedReceipt(vector.receipt,{target,original}),vector.receipt);
 assert.notEqual(p.source.target_run_id,p.anchor.run_id);assert.equal(p.source.spec_id,target.spec_id);
})
test('preview input and accept intent are exact, lowercase, independent of model fee consent',()=>{
 assert.deepEqual(agentGeneratedPreviewInput({action:'preview',...target}),{action:'preview',...target});assert.deepEqual(agentGeneratedTarget(target),target);
 for(const patch of [{action:'confirm'},{confirm:false},{acceptance_acknowledgement:'APPROVE_MODEL_FEE'},{request_sha256:'a'.repeat(64)},{owner_user_id:id(7)},{descriptive:{}},{request_id:id(1)},{request_id:id(30)},{review_id:'ABCDEF00-0000-4000-8000-000000000001'},{expected_spec_revision:'41'}])assert.throws(()=>agentGeneratedAcceptance({...vector.original,...patch}),/invalid_agent_generated_request/);
 assert.throws(()=>agentGeneratedOriginal(vector.preview,id(31)),/invalid_agent_generated_request/);
})
test('foreign prototypes, symbols, accessors and sparse arrays refuse without invoking getters',async()=>{
 let reads=0;const p=clone(vector.preview);Object.defineProperty(p,'candidate',{get(){reads++;return vector.preview.candidate},enumerable:true});await assert.rejects(agentGeneratedPreview(p));assert.equal(reads,0);
 for(const p of [Object.assign(Object.create({private:true}),vector.preview),{...vector.preview,[Symbol('secret')]:1}])await assert.rejects(agentGeneratedPreview(p));
 const sparse=clone(vector.preview);sparse.candidate.descriptive.deliverables=Array(2);await assert.rejects(agentGeneratedPreview(sparse));
})
for(const kind of ['preview','receipt']){
 const parse=kind==='preview'?agentGeneratedPreview:agentGeneratedReceipt;
 const nested=raw=>kind==='preview'?raw.candidate.descriptive.deliverables:raw.feedback_sources;
 test(`${kind} rejects foreign and null nested array prototypes while ordinary dense arrays remain valid`,async()=>{
  assert.deepEqual(await parse(clone(vector[kind])),vector[kind]);
  for(const prototype of [Object.create(Array.prototype),null]){
   const raw=clone(vector[kind]);Object.setPrototypeOf(nested(raw),prototype);
   assert.throws(()=>agentGeneratedCanonical(raw),/invalid_agent_generated_projection/);
   await assert.rejects(parse(raw),/invalid_agent_generated_projection/);
  }
 })
 test(`${kind} rejects a foreign nested array before reading its inherited map getter`,async()=>{
  let reads=0;const raw=clone(vector[kind]),prototype=Object.create(Array.prototype);
  Object.defineProperty(prototype,'map',{get(){reads++;return Array.prototype.map}});
  Object.setPrototypeOf(nested(raw),prototype);
  assert.throws(()=>agentGeneratedCanonical(raw),/invalid_agent_generated_projection/);assert.equal(reads,0);
  await assert.rejects(parse(raw),/invalid_agent_generated_projection/);assert.equal(reads,0);
 })
}
test('complete-five result, exact changed subset and no-op are mandatory',async()=>{
 for(const mutate of [p=>delete p.candidate.descriptive.task_plan,p=>p.candidate.descriptive.tools=['http'],p=>p.changed_keys.reverse(),p=>p.changed_keys.push('goal'),p=>p.changed_keys=['goal'],p=>{p.candidate.descriptive=clone(p.before.descriptive);p.changed_keys=['goal']}]){const p=clone(vector.preview);mutate(p);sealPreview(p);await assert.rejects(agentGeneratedPreview(p));}
})
test('all selected feedback refs are canonical, unique and bind the actual first anchor',async()=>{
 for(const mutate of [p=>p.feedback_sources.reverse(),p=>p.feedback_sources.push(clone(p.feedback_sources[0])),p=>p.feedback_sources[1].run_id=p.feedback_sources[0].run_id,p=>p.feedback_sources[1].feedback_id=p.feedback_sources[0].feedback_id,p=>p.anchor={run_id:id(21),feedback_id:id(31)},p=>p.feedback_sources=[],p=>p.feedback_sources[0].feedback_revision=0]){const p=clone(vector.preview);mutate(p);sealPreview(p);await assert.rejects(agentGeneratedPreview(p));}
 const p=clone(vector.preview);p.feedback_sources[0].statement_sha256='f'.repeat(64);await assert.rejects(agentGeneratedPreview(p));
})
test('full-capacity UTF16 descriptions exceed old23KB limit without truncation; empty optional fields remain exact',async()=>{
 const p=clone(vector.preview),d=p.candidate.descriptive;d.goal='新'.repeat(3000);d.task_scope='😀'.repeat(2000);for(const k of ['deliverables','task_plan','done_criteria'])d[k]=Array(30).fill('交'.repeat(500));sealPreview(p);
 assert.ok(JSON.stringify(p).length>23000);const parsed=await agentGeneratedPreview(p);assert.deepEqual(parsed.candidate.descriptive,d);
 for(const [k,n]of [['goal',3001],['task_scope',4001]]){const q=clone(p);q.candidate.descriptive[k]='字'.repeat(n);sealPreview(q);await assert.rejects(agentGeneratedPreview(q));}
 const q=clone(vector.preview);q.candidate.descriptive={goal:'新的完整目标',task_scope:'',deliverables:[],task_plan:[],done_criteria:[]};q.changed_keys=['goal','task_scope','deliverables'];sealPreview(q);assert.deepEqual((await agentGeneratedPreview(q)).candidate.descriptive,q.candidate.descriptive);
})
test('normalization is rejection, never trimming, masking, surrogate replacement or silent array clipping',async()=>{
 for(const value of [' x','x ','\u0000','\ud800','token=private123','sk-abcdefghijk']){const p=clone(vector.preview);p.candidate.descriptive.goal=value;sealPreview(p);await assert.rejects(agentGeneratedPreview(p));}
 const p=clone(vector.preview);p.candidate.descriptive.goal='逐字 e\u0301 😀 " \\ \n换行';sealPreview(p);assert.equal((await agentGeneratedPreview(p)).candidate.descriptive.goal,p.candidate.descriptive.goal);
 assert.throws(()=>agentGeneratedCanonical({n:NaN}));assert.throws(()=>agentGeneratedCanonical({n:undefined}));assert.throws(()=>agentGeneratedCanonical({n:-0}));
})
test('preview verifies visible binding hash and requested exact target',async()=>{
 for(const patch of [{preview_sha256:'a'.repeat(64)},{feedback_sources_sha256:'b'.repeat(64)},{recorded:true},{tools_note:'grant tools'},{available:true}])await assert.rejects(agentGeneratedPreview({...vector.preview,...patch}));
 await assert.rejects(agentGeneratedPreview(vector.preview,{...target,target_run_id:id(11)}));
})
test('receipt has no body, resources, fees or current-role claims; exact metadata invariants reject',async()=>{
 await assert.rejects(agentGeneratedReceipt({...vector.receipt,request_id:target.review_id}),/invalid_agent_generated_projection/);
 for(const patch of [{recorded:false},{replayed:'true'},{owner_user_id:id(1)},{result:{}},{available:true},{execution:{}},{descriptive:{}},{receipt_sha256:'a'.repeat(64)},{acceptance_owner_epoch:6},{created_at:'2026-02-30T00:00:00.000Z'}])await assert.rejects(agentGeneratedReceipt({...vector.receipt,...patch}));
 for(const mutate of [r=>r.after.revision++,r=>r.after.revision_id=r.before.revision_id,r=>r.after.source_sha256=r.before.source_sha256,r=>r.request_sha256='f'.repeat(64),r=>r.changed_keys.reverse()]){const r=clone(vector.receipt);mutate(r);sealReceipt(r);await assert.rejects(agentGeneratedReceipt(r));}
})
test('receipt matches exact original and readonly recovery requires replayed=true',async()=>{
 await assert.rejects(agentGeneratedReceipt(vector.receipt,{replayed:true}));const r=response(vector.original,true);assert.deepEqual(await agentGeneratedReceipt(r,{target,original:vector.original,replayed:true}),r);
 for(const key of ['expected_preview_sha256','expected_result_sha256','expected_spec_sha256','expected_candidate_sha256'])await assert.rejects(agentGeneratedReceipt(r,{original:{...vector.original,[key]:'e'.repeat(64)}}));
 await assert.rejects(agentGeneratedReceipt(r,{original:{...vector.original,request_id:id(98)}}));
})
test('safe-integer boundary preserves actual after=before+1',async()=>{
 const r=clone(vector.receipt);r.before.revision=Number.MAX_SAFE_INTEGER-2;r.after.revision=r.before.revision+1;const original={...vector.original,expected_spec_revision:r.before.revision};r.request_sha256=sha({protocol:'agent_generated_accept_intent_v1',...original});sealReceipt(r);assert.equal((await agentGeneratedReceipt(r,{original})).after.revision,Number.MAX_SAFE_INTEGER-1);
})
test('asynchronous parser copies wire data before WebCrypto waits',async()=>{
 const p=clone(vector.preview),work=agentGeneratedPreview(p);p.source.spec_id=id(999);p.candidate.descriptive.goal='mutated';assert.deepEqual(await work,vector.preview);
 const raw=clone(vector.receipt),original=clone(vector.original),read=agentGeneratedReceipt(raw,{original});raw.source.review_id=id(999);original.request_id=id(888);assert.deepEqual(await read,vector.receipt);
})
