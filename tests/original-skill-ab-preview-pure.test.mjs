import test from 'node:test'
import assert from 'node:assert/strict'
import {OriginalRoleUiRepository} from '../services/pg-api/src/original-role-ui-repository.ts'
import {prepareOriginalSkillAbOnClient} from '../services/pg-api/src/original-skill-ab-source.ts'
import {prepareOriginalRoleUiPool} from '../services/pg-api/src/original-role-ui-policy.ts'
import {originalRoleHash,originalSkillHash} from '../services/pg-api/src/original-role-execution.mjs'
import {originalSkillAbSelection,originalSkillAbPreview} from '../shared/original-skill-ab-contract.ts'
import {skillAbMessages,SKILL_AB_SCENARIO} from '../shared/skill-ab-compare.ts'
import {createOriginalRoleApi} from '../src/lib/originalRoleApi.ts'
import {frame,literalConnection,literalSupplier,startup,actor,roleEnv} from './helpers/original-role-client-frames.mjs'
const owner='00000001-1111-4111-8111-111111111111',other='00000002-1111-4111-8111-111111111111',modelId='00000004-1111-4111-8111-111111111111',identity={issuer:'urn:agentstudio:local:v1',subject:'verified-native-employee'}
const content='---\nname: analysis-method\ndescription: Reviewed immutable method\n---\nSeparate facts and hypotheses. Calculate unit economics before judging the opportunity.',hash=originalSkillHash(content)
const selection=()=>({skill_ref:{id:'abc123abc123abc',version:1,hash},model_binding:{connection_id:modelId,connection_revision:3,model_id:'literal-model'}})
const owned=()=>frame(/current_user='agentstudio_api'/,[{ok:true}])
const library=()=>({owner_user_id:owner,id:'abc123abc123abc',version:'1',name:'analysis-method',description:'Reviewed immutable method',content,content_sha256:hash})
const model=()=>({owner_user_id:owner,revision:'3',enabled:true,status:'ok',provider:'openai',base_url:'https://api.openai.com/v1',models:['literal-model']})
function entry(){const frames=actor(owner);frames[0]=frame(/^BEGIN$/);return [...startup(),...frames,owned(),owned(),frame(/SELECT agentstudio.agent_memory_outcome_epoch/,[{epoch:'8'}])]}
async function execute(frames,raw=selection(),expected=owner){const db=literalConnection(frames),pool=literalSupplier(db);await prepareOriginalRoleUiPool(pool,roleEnv);const repo=new OriginalRoleUiRepository(pool,false);return {db,run:()=>repo.previewSkillAB(identity,expected,raw)}}
async function actualPreview(){const x=await execute([...entry(),frame(/original_skill_reviews.*s.active.*FOR SHARE OF s,v,r/,[library()]),frame(/SELECT owner_user_id,revision,enabled,status,provider,base_url,models FROM agentstudio.model_connections/,[model()]),frame(/^COMMIT$/)]);const value=await x.run();x.db.done();return {value,db:x.db}}
test('actual UI repository locking read transaction produces exact approved Skill/model fee preview without writes or provider effects',async()=>{
 const {value,db}=await actualPreview(),p=value.preview;assert.equal(value.employee_id,owner);assert.equal(p.owner_epoch,8);assert.deepEqual(p.skill,{...selection().skill_ref,name:'analysis-method'});assert.deepEqual(p.model_binding,selection().model_binding)
 assert.equal(p.scenario,SKILL_AB_SCENARIO);assert.equal(p.input_characters.with_skill,skillAbMessages('with_skill',content)[1].content.length);assert.equal(p.input_characters.baseline,skillAbMessages('baseline',content)[1].content.length)
 assert.equal(p.sample_count,2);assert.equal(p.output_token_limit,900);assert.equal(p.total_reported_token_stop,40000);assert.equal(p.possible_charges,true);assert.equal(p.price_estimate,null);assert.equal(p.recorded,false);assert.equal(p.execution_available,false)
 const {preview_sha256,...core}=p;assert.equal(originalRoleHash(core),preview_sha256);assert.ok(!JSON.stringify(value).includes(content))
 assert.ok(!db.calls.some(c=>/INSERT INTO|UPDATE agentstudio|DELETE FROM|api_key_ciphertext/.test(c.sql)))
 assert.equal(db.calls.filter(c=>c.sql==='BEGIN').length,1);assert.equal(db.calls.filter(c=>c.sql==='COMMIT').length,1)
})
test('selection fields are closed and cannot smuggle content, prompt, tools, fee consent or a different output budget',()=>{
 const good=selection();assert.deepEqual(originalSkillAbSelection(good),good)
 for(const raw of [{...good,content},{...good,prompt:'injected'},{...good,tools:['web_search']},{...good,confirm:true},{...good,max_tokens:4096},{...good,skill_ref:{...good.skill_ref,version:'1'}},{...good,model_binding:{...good.model_binding,url:'https://evil.invalid'}}])assert.throws(()=>originalSkillAbSelection(raw))
})
test('unselected role profile and foreign identity cannot use preview as a new authority',async()=>{
 const db=literalConnection([]);await assert.rejects(()=>prepareOriginalSkillAbOnClient(db,owner,selection()),/ui_profile_required/);db.done()
 const repo=new OriginalRoleUiRepository(undefined,false);await assert.rejects(()=>repo.previewSkillAB({issuer:'unverified',subject:'arbitrary'},owner,selection()),/native_employee_identity_required/)
})
for(const [name,change]of Object.entries({foreignOwner:s=>s.owner_user_id=other,wrongVersion:s=>s.version='2',wrongHash:s=>s.content_sha256='f'.repeat(64),changedContent:s=>s.content+=' changed',wrongName:s=>s.name='other-method'}))test('actual owned Skill source refuses '+name+' before any model read',async()=>{
 const s=library();change(s);const x=await execute([...entry(),frame(/original_skill_reviews.*FOR SHARE OF s,v,r/,[s]),frame(/^ROLLBACK$/)])
 await assert.rejects(x.run,/original_skill_ab_skill_unavailable/);assert.ok(!x.db.calls.some(c=>/FROM agentstudio.model_connections/.test(c.sql)));x.db.done()
})
test('missing actual active/reviewed exact Skill cannot be replaced by latest or browser text',async()=>{
 const x=await execute([...entry(),frame(/original_skill_reviews.*FOR SHARE OF s,v,r/),frame(/^ROLLBACK$/)])
 await assert.rejects(x.run,/original_skill_ab_skill_unavailable/);x.db.done()
})
for(const [name,change]of Object.entries({owner:m=>m.owner_user_id=other,revision:m=>m.revision='4',disabled:m=>m.enabled=false,untested:m=>m.status='untested',missingModel:m=>m.models=['other'],unsafeEndpoint:m=>m.base_url='https://127.0.0.1/v1'}))test('actual exact owner model selection refuses '+name,async()=>{
 const m=model();change(m);const x=await execute([...entry(),frame(/original_skill_reviews.*FOR SHARE OF s,v,r/,[library()]),frame(/FROM agentstudio.model_connections/,[m]),frame(/^ROLLBACK$/)])
 await assert.rejects(x.run,/original_skill_ab_model_unavailable/);x.db.done()
})
test('real employee mapping fails before Skill/model source data when expected owner changed',async()=>{
 const a=actor(owner);a[0]=frame(/^BEGIN$/);const x=await execute([...startup(),...a,frame(/^ROLLBACK$/)],selection(),other)
 await assert.rejects(x.run,/employee_session_changed/);assert.ok(!x.db.calls.some(c=>/original_skill_reviews.*FOR SHARE/.test(c.sql)));x.db.done()
})
test('actual SDK consumes exact preview route with employee condition and verifies hash; preview failure has no pending paid write',async()=>{
 const {value}=await actualPreview(),requests=[],api=createOriginalRoleApi({employeeId:owner,storage:null,transport:async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}})}})
 const p=await api.previewAB(selection());assert.deepEqual(p,value.preview);assert.equal(api.pendingWrites(),0);assert.equal(requests.length,1);assert.equal(requests[0].url,'/__pg_native/api/v2/original-ui/role-skills/ab/preview');assert.equal(requests[0].init.headers['X-AgentStudio-Expected-Employee'],owner);assert.deepEqual(JSON.parse(requests[0].init.body),selection())
 const unavailable=createOriginalRoleApi({employeeId:owner,storage:null,transport:async()=>{throw Error('literal read failure')}})
 await assert.rejects(()=>unavailable.previewAB(selection()),/original_role_unavailable/);assert.equal(unavailable.pendingWrites(),0)
})
test('wire preview cannot assert execution ready, waive fees, leak text or change actual selected model',async()=>{
 const {value}=await actualPreview()
 for(const change of [p=>p.execution_available=true,p=>p.possible_charges=false,p=>p.output_token_limit=4096,p=>p.price_estimate=0,p=>p.skill.content=content,p=>p.model_binding.model_id='other',p=>p.owner_user_id=other,p=>p.preview_sha256='f'.repeat(64)]){
  const mutated=structuredClone(value);change(mutated.preview)
  const api=createOriginalRoleApi({employeeId:owner,storage:null,transport:async()=>new Response(JSON.stringify(mutated),{headers:{'content-type':'application/json'}})})
  await assert.rejects(()=>api.previewAB(selection()))
 }
 const accessor=structuredClone(value.preview);let called=false;Object.defineProperty(accessor,'sample_count',{enumerable:true,get(){called=true;return 2}});assert.throws(()=>originalSkillAbPreview(accessor,{owner,selection:selection()}));assert.equal(called,false)
})
