import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalRoleApi} from '../src/lib/originalRoleApi.ts'
import {originalRoleHash} from '../services/pg-api/src/original-role-execution.mjs'
import {skillAbIntentHashData,skillAbFeeAcknowledgement,skillAbResultHashData,skillAbControlHashData} from '../shared/original-skill-ab-execution-contract.ts'
import {selectSkillAbNative,prepareOriginalSkillAbNativeRuntime,skillAbNativeApproval} from '../services/pg-api/src/original-skill-ab-native-runtime.ts'
import {skillAbExecutionApproval} from '../services/pg-api/src/original-skill-ab-provider.ts'
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,owner=id(1),requestId=id(8),selection={skill_ref:{id:'abc123abc123abc',version:1,hash:'a'.repeat(64)},model_binding:{connection_id:id(4),connection_revision:3,model_id:'literal-model'}}
const intent=()=>({...structuredClone(selection),request_id:requestId,expected_input_sha256:'b'.repeat(64),confirm:true,fee_acknowledgement:skillAbFeeAcknowledgement})
const receipt=()=>({protocol:'original_skill_ab_receipt_v1',owner_user_id:owner,request_id:requestId,request_sha256:originalRoleHash(skillAbIntentHashData(intent())),selection:structuredClone(selection),input_sha256:'b'.repeat(64),source_sha256:'c'.repeat(64),owner_epoch:8,state:'active',trials:[0,1].map(ordinal=>({ordinal,label:ordinal?'B':'A',variant:ordinal?'with_skill':'baseline',state:'planned',started_once:false,input_tokens:null,output_tokens:null,total_tokens:null,truncated:null,result_sha256:null,elapsed_ms:null})),recorded:true})
const response=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}})
function storage(){const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}}
const api=(saved,transport,extra={})=>createOriginalRoleApi({employeeId:owner,storage:saved,transport,...extra})
function view(r=receipt()){return {receipt:r,result_status:'pending',results:[]}}

test('lost submission persists only original owner locator; same action and reload query its exact receipt with zero POST replay',async()=>{
 const saved=storage(),methods=[],send=async(url,init)=>{methods.push(init.method);assert.equal(init.credentials,'same-origin');assert.equal(init.headers['X-AgentStudio-Expected-Employee'],owner);if(init.method==='POST')throw Error('literal lost ACK');assert.match(url,/\/requests\/00000008.*request_sha256=/);return response({employee_id:owner,receipt:receipt()})},first=api(saved,send).ab()
 await assert.rejects(()=>first.submit(intent()),/outcome_unknown/);assert.equal(first.locators().length,1);assert.ok([...saved.values.keys()][0].endsWith(owner));assert.deepEqual(await first.submit(intent()),receipt())
 const restored=api(saved,send).ab();assert.deepEqual(await restored.submit(intent()),receipt());assert.deepEqual(methods,['POST','GET','GET'])
 const wire=[...saved.values.values()][0];for(const word of ['content','prompt','text','api_key','model_id','fee_acknowledgement'])assert.ok(!wire.includes('"'+word+'"'))
})
test('unknown trial POST is attempted once; subsequent clicks and reload only read the original view',async()=>{
 const saved=storage(),calls=[],r=receipt();r.trials[0].state='reserved';r.trials[0].started_once=true
 const send=async(url,init)=>{calls.push({url,method:init.method});if(url.endsWith('/submit'))return response({employee_id:owner,receipt:receipt()});if(init.method==='POST')throw Error('literal unknown provider outcome');return response({employee_id:owner,view:view(r)})},first=api(saved,send).ab()
 await first.submit(intent());await assert.rejects(()=>first.startTrial(requestId,0),/outcome_unknown/);await first.startTrial(requestId,0);await api(saved,send).ab().startTrial(requestId,0)
 assert.deepEqual(calls.map(c=>c.method),['POST','POST','GET','GET']);assert.equal(calls.filter(c=>/trials\/0$/.test(c.url)&&c.method==='POST').length,1);assert.deepEqual(first.locators()[0].attempted,[0]);assert.equal(calls.some(c=>/trials\/1/.test(c.url)),false)
})
test('concurrent double-click shares the persisted original submission and cannot POST twice',async()=>{
 const saved=storage(),calls=[],client=api(saved,async(url,init)=>{calls.push(init.method);return response({employee_id:owner,receipt:receipt()})}).ab()
 await Promise.all([client.submit(intent()),client.submit(intent())]);assert.equal(calls.filter(m=>m==='POST').length,1);assert.equal(calls.filter(m=>m==='GET').length,1)
})
test('concurrent trial actions cannot obtain a second private attempt',async()=>{
 const saved=storage(),calls=[],client=api(saved,async(url,init)=>{calls.push({url,method:init.method});return url.endsWith('/submit')?response({employee_id:owner,receipt:receipt()}):response({employee_id:owner,view:view()})}).ab()
 await client.submit(intent());await Promise.all([client.startTrial(requestId,0),client.startTrial(requestId,0)]);assert.equal(calls.filter(c=>c.url.endsWith('/trials/0')&&c.method==='POST').length,1)
})
test('storage failure precedes every paid submission and does not create a false locator',async()=>{
 let calls=0;const client=api({getItem:()=>null,setItem(){throw Error('literal quota')}},async()=>{calls++;throw Error()}).ab()
 await assert.rejects(()=>client.submit(intent()),/locator_storage_unavailable/);assert.equal(calls,0);assert.equal(client.locators().length,0)
})
test('bad successful receipt retains original locator and only allows read confirmation',async()=>{
 const saved=storage(),calls=[],wrong=receipt();wrong.selection.model_binding.model_id='unselected-model'
 const client=api(saved,async(_url,init)=>{calls.push(init.method);return response({employee_id:owner,receipt:wrong})}).ab()
 await assert.rejects(()=>client.submit(intent()),/receipt_unconfirmed/);await assert.rejects(()=>client.submit(intent()),/receipt_unconfirmed/);assert.deepEqual(calls,['POST','GET']);assert.equal(client.locators().length,1)
})
test('view verifies real result body hash and replaces prior available text with null on stale/erased source',async()=>{
 const saved=storage(),r=receipt(),text='合成单位经济分析';Object.assign(r.trials[0],{state:'succeeded',started_once:true,input_tokens:100,output_tokens:30,total_tokens:130,truncated:false,elapsed_ms:20,result_sha256:'a'.repeat(64)});r.trials[0].result_sha256=originalRoleHash(skillAbResultHashData(r,{ordinal:0,text}));let status='available',changed=false
 const client=api(saved,async(url)=>url.endsWith('/submit')?response({employee_id:owner,receipt:receipt()}):response({employee_id:owner,view:status==='available'?{receipt:r,result_status:status,results:[{ordinal:0,text:changed?'changed':text,result_sha256:r.trials[0].result_sha256}]}:{receipt:{...r,state:status==='erased'?'erased':'active'},result_status:status,results:null}})).ab()
 await client.submit(intent());assert.equal((await client.view(requestId)).results[0].text,text);changed=true;await assert.rejects(()=>client.view(requestId),/result_unconfirmed/);changed=false;status='stale';assert.equal((await client.view(requestId)).results,null);status='erased';assert.equal((await client.view(requestId)).results,null);assert.ok(![...saved.values.values()][0].includes(text))
})
test('control ACK loss and simultaneous clicks preserve one original operation and use only read-only control confirmation later',async()=>{
 const saved=storage(),calls=[];let operation
 const send=async(url,init)=>{calls.push(url);if(url.endsWith('/submit'))return response({employee_id:owner,receipt:receipt()});const body=JSON.parse(init.body);operation=operation??body;if(url.endsWith('/control'))throw Error('literal control ACK lost');assert.deepEqual(body,operation);return response({employee_id:owner,receipt:{protocol:'original_skill_ab_control_receipt_v1',owner_user_id:owner,operation_id:body.operation_id,request_id:requestId,action:body.action,request_sha256:originalRoleHash(skillAbControlHashData(body)),recorded:true}})}
 const client=api(saved,send).ab();await client.submit(intent());const result=await Promise.allSettled([client.control(requestId,'erase'),client.control(requestId,'erase')]);assert.ok(result.every(r=>r.status==='rejected'));await client.control(requestId,'erase');await api(saved,send).ab().control(requestId,'erase');assert.equal(calls.filter(p=>p.endsWith('/control')).length,1);assert.equal(calls.filter(p=>p.endsWith('/control-confirm')).length,2)
})
test('closed session and owner switch refuse before a new transport or second charge',async()=>{
 const saved=storage();let current=owner,calls=0;const outer=api(saved,async()=>{calls++;return response({employee_id:owner,receipt:receipt()})},{currentEmployee:()=>current}),client=outer.ab();await client.submit(intent());current=id(2);await assert.rejects(()=>client.startTrial(requestId,0),/employee_session_changed/);assert.equal(calls,1);client.close();await assert.rejects(()=>client.view(requestId),/session_closed/);assert.equal(calls,1)
})
test('corrupt or body-containing local locator fails closed without overwriting or querying it',()=>{
 const saved=storage();saved.values.set('agentstudio:original-skill-ab:v1:'+owner,JSON.stringify({protocol:'original-skill-ab-locators.v1',entries:[{request_id:requestId,request_sha256:'a'.repeat(64),input_sha256:'b'.repeat(64),skill_ref:selection.skill_ref,attempted:[],content:'forbidden private body'}],controls:[]}));let calls=0
 const outer=api(saved,async()=>{calls++;throw Error()});assert.throws(()=>outer.ab(),/locator_storage_invalid/);assert.equal(calls,0);assert.ok([...saved.values.values()][0].includes('forbidden private body'))
})

const baseFee={AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:'true',AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED:'APPROVE_DISPOSABLE_PG18_OWNER_BOUND_GENERATION_UAT_ONLY',AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:'true',AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED:'true',AGENT_STUDIO_PG18_UAT_APPROVAL:'APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY',AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED:'APPROVE_DISPOSABLE_PG18_RUN_APPROVAL_UAT_ONLY'}
const own={AGENT_STUDIO_ORIGINAL_SKILL_AB_AVAILABLE:'true',AGENT_STUDIO_ORIGINAL_SKILL_AB_SUBMISSIONS_ENABLED:'true',AGENT_STUDIO_ORIGINAL_SKILL_AB_APPROVED:skillAbNativeApproval,AGENT_STUDIO_ORIGINAL_SKILL_AB_EXECUTION_ENABLED:'true',AGENT_STUDIO_ORIGINAL_SKILL_AB_EXECUTION_APPROVED:skillAbExecutionApproval}
test('Native A/B admission requires its own opt-in and every existing paid/config/approval gate',async()=>{
 const args={listen:true,allowedOrigin:'https://127.0.0.1:7403',configurationWrites:true,uid:1100}
 assert.deepEqual(selectSkillAbNative({...args,env:baseFee}),{available:false,submissions:false});assert.deepEqual(selectSkillAbNative({...args,env:{...baseFee,...own}}),{available:true,submissions:true})
 for(const patch of [{uid:0},{uid:undefined},{listen:false},{allowedOrigin:'http://127.0.0.1:7403'},{configurationWrites:false}])assert.throws(()=>selectSkillAbNative({...args,...patch,env:{...baseFee,...own}}))
 for(const env of [own,{...baseFee,...own,AGENT_STUDIO_ORIGINAL_SKILL_AB_EXECUTION_APPROVED:undefined},{...baseFee,...own,AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED:undefined},{...baseFee,...own,AGENT_STUDIO_ORIGINAL_SKILL_AB_APPROVED:'generic'}])assert.throws(()=>selectSkillAbNative({...args,env}))
 assert.deepEqual(await prepareOriginalSkillAbNativeRuntime({...args,env:{},pool:undefined,authenticateRequest:undefined}),null)
})
test('read/confirmation availability can remain enabled while new A/B submissions are explicitly absent',()=>{const env={AGENT_STUDIO_ORIGINAL_SKILL_AB_AVAILABLE:'true',AGENT_STUDIO_ORIGINAL_SKILL_AB_APPROVED:skillAbNativeApproval};assert.deepEqual(selectSkillAbNative({env,listen:true,allowedOrigin:'https://127.0.0.1:7403',configurationWrites:false,uid:1100}),{available:true,submissions:false})})
