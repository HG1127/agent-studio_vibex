import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativePilotApi} from '../src/lib/pgNativePilotApi.ts'
const plan={task_scope:'仅处理已授权资料',deliverables:['可核对报告'],task_plan:['读取资料','核对结果'],done_criteria:['每项结论可核对']}
test('full manual plan reuses the existing Native Cookie create route with no permissions, task or billing fields',async()=>{
 const calls=[],api=createPgNativePilotApi(async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({item:{id:'synthetic'}}),{status:200})},'')
 await api.createAgent('我的助手','输出报告',plan);assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/v2/agent-specs');const {init}=calls[0];assert.equal(init.method,'POST');assert.equal(init.credentials,'same-origin');const body=JSON.parse(init.body)
 assert.deepEqual(body,{name:'我的助手',spec:{goal:'输出报告',task_scope:plan.task_scope,deliverables:plan.deliverables,task_plan:plan.task_plan,done_criteria:plan.done_criteria,tools:[]}})
 assert.equal(Object.keys(init.headers).some(key=>/authorization|x-rh/i.test(key)),false)
})
test('old two-argument creation remains byte-equivalent at the existing payload boundary',async()=>{
 let body;const api=createPgNativePilotApi(async(_url,init)=>{body=JSON.parse(init.body);return new Response(JSON.stringify({item:{id:'synthetic'}}),{status:200})},'')
 await api.createAgent('基础助手','目标');assert.deepEqual(body,{name:'基础助手',spec:{goal:'目标',task_scope:'',deliverables:[],task_plan:[],done_criteria:[],tools:[]}})
})
test('unknown resource or privilege fields, blank criteria and oversized lists refuse before transport',async()=>{
 let sent=0;const api=createPgNativePilotApi(async()=>{sent++;throw Error('must not send')},'')
 for(const value of [{...plan,model_binding:{}},{...plan,require_approval:false},{...plan,task_scope:''},{...plan,done_criteria:['']},{...plan,task_plan:Array(31).fill('step')},{...plan,deliverables:['x'.repeat(501)]}])await assert.rejects(api.createAgent('助手','目标',value),e=>e.status===400)
 assert.equal(sent,0)
})
test('UTF-8 plan size respects the actual existing 32768-byte Native create limit before POST',async()=>{let sent=0;const api=createPgNativePilotApi(async()=>{sent++;throw Error('must not send')},'');await assert.rejects(api.createAgent('助手','目标',{task_scope:'范围',deliverables:Array(30).fill('文'.repeat(500)),task_plan:Array(30).fill('步骤'),done_criteria:['标准']}),e=>e.status===400);assert.equal(sent,0)})
