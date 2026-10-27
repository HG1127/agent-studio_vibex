import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareAgentReviewInput} from '../src/agent-review-input.ts'
import {safeAgentSpec} from '../src/contracts.ts'
const id=n=>`${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`
const choice={action:'preview',purpose:'evaluate',spec_id:id(1),run_id:id(2),expected_source_sha256:'a'.repeat(64),expected_spec_revision:3,expected_spec_sha256:'b'.repeat(64),model_binding:{connection_id:id(3),connection_revision:4,model_id:'synthetic-review'},output_token_limit:2048,feedback_sources:[],evaluation_sources:[]}
const material=()=>({role:{name:'Synthetic private role',revision:3,source_sha256:'b'.repeat(64),spec:safeAgentSpec({goal:'完整角色',task_scope:'完整范围',tools:['summarize'],model_binding:choice.model_binding})},run:{id:id(2),spec_id:id(1),status:'cancelled',instruction:'完整本人任务 token=syntheticReviewTaskPrivate',result_text:'',source_sha256:'a'.repeat(64)},feedback:[],evaluations:[]})
test('review input is a closed purpose-bound data projection with no I/O, private binding IDs, checkpoint, reasoning or source authority',()=>{
  const raw=material(),before=structuredClone(raw),result=prepareAgentReviewInput(choice,raw),data=JSON.parse(result.messages[1].content)
  assert.equal(data.task.status,'cancelled');assert.equal(data.task.instruction,'完整本人任务 token=***');assert.match(result.input_sha256,/^[a-f0-9]{64}$/);assert.deepEqual(raw,before)
  assert.doesNotMatch(JSON.stringify(result.messages),new RegExp(choice.model_binding.connection_id+'|syntheticReviewTaskPrivate|model_binding|api_key_ciphertext|checkpoint'))
  for(const patch of [{checkpoint:{thinking:'private'}},{owner_user_id:id(5)},{thinking:'private'}])assert.throws(()=>prepareAgentReviewInput(choice,{...raw,run:{...raw.run,...patch}}))
})
test('evaluation preserves complete bounded Chinese role and final delivery without silently reusing intermediate transcript or truncating source fields',()=>{
  const raw=material();raw.role.spec=safeAgentSpec({goal:'合'.repeat(3000),task_scope:'范'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500)),tools:[]});raw.run.instruction='任'.repeat(2000);raw.run.result_text='果'.repeat(20000)
  const result=prepareAgentReviewInput(choice,raw),data=JSON.parse(result.messages[1].content)
  assert.equal(data.agent.goal.length,3000);assert.equal(data.agent.task_scope.length,4000);assert.deepEqual(data.agent.task_plan,raw.role.spec.task_plan);assert.equal(data.task.delivery.length,20000);assert.equal(data.task.instruction.length,2000);assert.ok(result.byte_length<262144)
  assert.throws(()=>prepareAgentReviewInput(choice,{...raw,run:{...raw.run,result_text:'x'.repeat(20001)}}))
})
test('optimization includes only explicitly selected employee feedback and opinions, omits task transcript, and seals generation/model/token/version changes',()=>{
  const feedback={run_id:id(2),feedback_id:id(5),feedback_sha256:'e'.repeat(64)},selected={...choice,purpose:'optimize',feedback_sources:[feedback]},raw=material();raw.feedback=[{...feedback,rating:'down',tags:['核对😀'],comment:'意见 token=syntheticReviewFeedbackPrivate'}];raw.run.result_text='Private unselected final delivery'
  const result=prepareAgentReviewInput(selected,raw),data=JSON.parse(result.messages[1].content);assert.equal(data.task,null);assert.equal(data.employee_statements[0].comment,'意见 token=***');assert.doesNotMatch(result.messages[1].content,/Private unselected final delivery|syntheticReviewFeedbackPrivate/)
  const changedSource={...feedback,feedback_sha256:'f'.repeat(64)},changed=prepareAgentReviewInput({...selected,feedback_sources:[changedSource]},{...raw,feedback:[{...raw.feedback[0],...changedSource}]});assert.notEqual(changed.input_sha256,result.input_sha256)
  assert.notEqual(prepareAgentReviewInput({...selected,model_binding:{...selected.model_binding,connection_revision:5}},raw).input_sha256,result.input_sha256)
  assert.notEqual(prepareAgentReviewInput({...selected,output_token_limit:4096},raw).input_sha256,result.input_sha256)
})
test('review material rejects mismatched sources, extra private fields, ongoing tasks, unselected opinions and malformed Unicode before any provider exists',()=>{
  const raw=material()
  for(const patch of [{status:'running'},{id:id(6)},{spec_id:id(7)},{source_sha256:'c'.repeat(64)},{instruction:'\ud800'}])assert.throws(()=>prepareAgentReviewInput(choice,{...raw,run:{...raw.run,...patch}}))
  assert.throws(()=>prepareAgentReviewInput(choice,{...raw,role:{...raw.role,revision:4}}));assert.throws(()=>prepareAgentReviewInput(choice,{...raw,feedback:[{}]}));assert.throws(()=>prepareAgentReviewInput(choice,{...raw,evaluations:[{}]}));assert.throws(()=>prepareAgentReviewInput(choice,{...raw,private_journal:'hidden'}))
})
