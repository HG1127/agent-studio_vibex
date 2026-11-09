// Pure transport contract tests, not actual network/business acknowledgements.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createPublicAgentCaller,PublicAgentCallerError} from '../../../src/lib/pgPublicAgentCaller.ts'
const id='00000000-0000-4000-8000-000000000001',key='acs_api_'+id+'_g1_'+'A'.repeat(43),choice={request_id:'00000000-0000-4000-8000-000000000002',session_id:'00000000-0000-4000-8000-000000000003',input:'Original explicitly confirmed task',fee_ack:'RUN_ONCE_WITHIN_OWNER_APPROVED_LIMITS',confirm:true},config={baseUrl:'https://native.example',origin:'https://customer.example',key}
test('closed409 and closed429 quota responses are definite once-only rejections with no automatic mutation retry',async()=>{
 for(const status of[409,429]){let sent=0;const client=createPublicAgentCaller({...config,transport:async()=>{sent++;return new Response(JSON.stringify({error:'agent_caller_key_limit'}),{status,headers:{'Content-Type':'application/json'}})}});await assert.rejects(()=>client.submit(choice),e=>e instanceof PublicAgentCallerError&&e.status===status&&e.definite&&e.code==='agent_caller_key_limit');assert.equal(sent,1);client.dispose()}
})
test('an unreviewed retry hint cannot schedule execution or erase the original request needed for explicit confirmation',async()=>{
 const sent=[],client=createPublicAgentCaller({...config,transport:async(url,options)=>{sent.push({url,method:options.method,body:JSON.parse(options.body)});return new Response(JSON.stringify(sent.length===1?{error:'agent_caller_key_limit',retry_after_s:60}:{error:'agent_caller_not_found'}),{status:sent.length===1?429:404,headers:{'Content-Type':'application/json'}})}})
 await assert.rejects(()=>client.submit(choice),e=>e instanceof PublicAgentCallerError&&!e.definite&&e.code==='agent_caller_outcome_unknown');assert.equal(sent.length,1);await assert.rejects(()=>client.confirm(choice),e=>e instanceof PublicAgentCallerError&&e.definite&&e.status===404);assert.deepEqual(sent.map(x=>x.url),['https://native.example/api/v2/public/agent/run','https://native.example/api/v2/public/agent/confirm']);assert.deepEqual(sent[0].body,choice);assert.deepEqual(sent[1].body,{choice});client.dispose()
})
