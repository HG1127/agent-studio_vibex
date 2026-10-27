import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {createAgentAssessmentMutualTlsClient,createAgentAssessmentInternalHandler} from '../src/agent-assessment-client.ts'
import {agentAssessmentApproval,agentAssessmentRoute} from '../src/agent-assessment-contract.ts'
import {AgentAssessmentBroker,prepareAgentAssessmentProviderRequest,createAgentAssessmentProviderExecutor} from '../src/agent-assessment-broker.ts'
const active={executionEnabled:true,executionApproval:agentAssessmentApproval}
const proof={request_id:'abcdef01-abcd-4abc-8def-123456789abc',lease_token:'fedcba01-fedc-4fed-8cba-abcdef012345',lease_version:1,worker_id:'11111111-1111-4111-8111-111111111111'}
const result={request_id:proof.request_id,state:'succeeded',result_sha256:'a'.repeat(64)}
const config=()=>({...active,origin:'https://127.0.0.1:7459',reviewedServerFingerprint256:'AB'.repeat(32),ca:Buffer.from('synthetic-ca'),cert:Buffer.from('synthetic-cert'),key:Buffer.from('synthetic-key')})
function fake({body=JSON.stringify(result),status=200,type='application/json',encoding,error=false,events=[]}={}){
  return (options,callback)=>{events.push({options});const req=new EventEmitter();req.end=bytes=>{events.push({body:Buffer.from(bytes)});queueMicrotask(()=>{if(error){req.emit('error',Error('private-key'));return}const res=new EventEmitter();res.statusCode=status;res.headers={'content-type':type,...(encoding?{'content-encoding':encoding}:{})};res.destroy=()=>{};callback(res);res.emit('data',Buffer.isBuffer(body)?body:Buffer.from(body));res.emit('end')})};return req}
}
test('private client requires separate approval, fixed loopback TLS and copied trust material',async()=>{
  for(const patch of [{executionEnabled:false},{executionApproval:'old-approval'},{origin:'http://127.0.0.1:7459'},{origin:'https://example.com:7459'},{origin:'https://127.0.0.1:7459/path'},{origin:'https://user:pass@127.0.0.1:7459'},{origin:'https://127.0.0.1:443'},{reviewedServerFingerprint256:'bad'},{key:Buffer.alloc(0)}])assert.throws(()=>createAgentAssessmentMutualTlsClient({...config(),...patch}))
  const settings=config(),events=[],send=createAgentAssessmentMutualTlsClient(settings,fake({events}));settings.ca.fill(0);settings.origin='https://evil.invalid';assert.deepEqual(await send(proof),result)
  const options=events[0].options;assert.equal(options.ca.toString(),'synthetic-ca');assert.equal(options.rejectUnauthorized,true);assert.equal(options.servername,'localhost');assert.equal(options.agent,false);assert.equal(options.path,agentAssessmentRoute);assert.deepEqual(JSON.parse(events[1].body),proof)
  const cert={subjectaltname:'DNS:localhost',fingerprint256:'AB'.repeat(32)};assert.equal(options.checkServerIdentity('localhost',cert),undefined);assert.ok(options.checkServerIdentity('foreign.invalid',cert));assert.ok(options.checkServerIdentity('localhost',{...cert,fingerprint256:'CD'.repeat(32)}))
  for(const name of ['cookie','authorization','x-rh-user-id','x-forwarded-client-cert'])assert.equal(options.headers[name],undefined)
})
test('private transport refuses redirects, oversized/malformed/private replies once without retry',async()=>{
  for(const variation of [{status:302},{type:'text/html'},{encoding:'gzip'},{error:true},{body:Buffer.from([0xc3,0x28])},{body:'x'.repeat(2049)},{body:JSON.stringify({...result,result:{private:'body'}})},{body:JSON.stringify({...result,request_id:proof.worker_id})}]){const events=[];await assert.rejects(createAgentAssessmentMutualTlsClient(config(),fake({...variation,events}))(proof),/agent_assessment_transport_unknown/);assert.equal(events.filter(v=>v.options).length,1)}
  let called=0;await assert.rejects(createAgentAssessmentMutualTlsClient(config(),()=>{called++;throw Error()})({...proof,messages:[]}));assert.equal(called,0)
})
test('private handler denies plain/header-spoofed peers before reading a body or invoking Broker',async()=>{
  let dispatches=0,reads=0;const handler=createAgentAssessmentInternalHandler({...active,reviewedClientFingerprint256:'AB'.repeat(32),dispatch:async()=>{dispatches++;return result}})
  const req={socket:{authorized:true,encrypted:true},headers:{'x-forwarded-client-cert':'pretend'},async *[Symbol.asyncIterator](){reads++;yield Buffer.from('{}')}};let status,body;await handler(req,{writeHead(v){status=v},end(v){body=JSON.parse(v)}});assert.equal(status,403);assert.equal(reads,0);assert.equal(dispatches,0);assert.deepEqual(body,{error:'agent_assessment_denied'})
})
const input={messages:[{role:'system',content:'严格只输出评审JSON'},{role:'user',content:'原始的、已封存的输入'}],output_token_limit:16384}
const material=provider=>({provider,base_url:provider==='openai'?'https://api.openai.com/v1':provider==='anthropic'?'https://api.anthropic.com/v1':'https://generativelanguage.googleapis.com/v1beta',model_id:'synthetic-model',api_key:'synthetic-private-key'})
test('real review provider adapter preserves exact selected messages and token cap for all three providers',()=>{
  for(const provider of ['openai','anthropic','gemini']){const prepared=prepareAgentAssessmentProviderRequest(material(provider),input),body=JSON.parse(prepared.body);assert.equal(prepared.headers['Content-Length'],String(prepared.body.length));assert.ok(!prepared.path.includes('synthetic-private-key'));if(provider==='openai'){assert.deepEqual(body.messages,input.messages);assert.equal(body.max_completion_tokens,16384)}else if(provider==='anthropic'){assert.equal(body.system,input.messages[0].content);assert.deepEqual(body.messages,[input.messages[1]]);assert.equal(body.max_tokens,16384)}else{assert.equal(body.systemInstruction.parts[0].text,input.messages[0].content);assert.equal(body.contents[0].parts[0].text,input.messages[1].content);assert.equal(body.generationConfig.maxOutputTokens,16384)}}
  for(const patch of [{base_url:'https://evil.invalid'},{model_id:'../../escape?'},{api_key:'bad\nkey'}])assert.throws(()=>prepareAgentAssessmentProviderRequest({...material('openai'),...patch},input))
})
test('real provider transport pins public DNS, checks lease/source after DNS immediately before exactly one POST',async()=>{
  const events=[],resolver={async resolve4(){events.push('dns4');return ['8.8.8.8']},async resolve6(){events.push('dns6');return []}}
  const request=fake({body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"score":0}'}}]}),events})
  const execute=createAgentAssessmentProviderExecutor(active,resolver,request);assert.equal(await execute(material('openai'),input,new AbortController().signal,async()=>{events.push('recheck')}),'{"score":0}')
  const index=events.findIndex(v=>v.options);assert.ok(events.indexOf('recheck')<index);const options=events[index].options;assert.equal(options.hostname,'api.openai.com');assert.equal(options.rejectUnauthorized,true);assert.equal(options.port,443);assert.equal(options.agent,false);options.lookup('ignored',{},(_error,address,family)=>{assert.equal(address,'8.8.8.8');assert.equal(family,4)})
  assert.equal(events.filter(v=>v.options).length,1)
})
test('unsafe DNS and stale-source refusal prevent a provider socket; ambiguous provider errors never resend',async()=>{
  let sockets=0,rechecks=0;const requester=()=>{sockets++;throw Error('private')}
  await assert.rejects(createAgentAssessmentProviderExecutor(active,{async resolve4(){return ['127.0.0.1']},async resolve6(){return []}},requester)(material('openai'),input,new AbortController().signal,async()=>{rechecks++}));assert.equal(sockets,0);assert.equal(rechecks,0)
  const resolver={async resolve4(){return ['8.8.8.8']},async resolve6(){return []}};await assert.rejects(createAgentAssessmentProviderExecutor(active,resolver,requester)(material('openai'),input,new AbortController().signal,async()=>{throw Error('stale')}));assert.equal(sockets,0)
  for(const variation of [{status:302},{error:true},{body:JSON.stringify({choices:[{finish_reason:'tool_calls',message:{tool_calls:[],content:'{}'}}]})},{body:'x'.repeat(524289)}]){const events=[];await assert.rejects(createAgentAssessmentProviderExecutor(active,resolver,fake({...variation,events}))(material('openai'),input,new AbortController().signal,async()=>{}),/agent_assessment_provider_unknown/);assert.equal(events.filter(v=>v.options).length,1)}
})
test('Broker requires distinct API, dispatch and model-secret pools and remains off before any identity/key/network operation',async()=>{
  let connections=0,executions=0;const pool=()=>({async connect(){connections++;throw Error('no real database')}}),business=pool(),dispatch=pool(),secret=pool()
  const broker=new AgentAssessmentBroker(business,dispatch,secret,Buffer.alloc(32),{executor:async()=>{executions++;throw Error()}})
  await assert.rejects(broker.dispatch(proof),/agent_assessment_execution_disabled/);assert.equal(connections,0);assert.equal(executions,0)
  for(const args of [[business,business,secret],[business,dispatch,business],[business,dispatch,dispatch]])assert.throws(()=>new AgentAssessmentBroker(...args,Buffer.alloc(32),active),/independent_pools_required/)
})
test('provider transport supports full review JSON capacity and rejects truncated or tool/thought completions',async()=>{
  const resolver={async resolve4(){return ['8.8.8.8']},async resolve6(){return []}},text=JSON.stringify({descriptive:{goal:'合'.repeat(3000),task_scope:'范'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))},tools_note:'',rationale:'本人确认前只是建议'})
  for(const [provider,response] of [['openai',{choices:[{finish_reason:'stop',message:{content:text}}]}],['anthropic',{stop_reason:'end_turn',content:[{type:'text',text}]}],['gemini',{candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}]])assert.equal(await createAgentAssessmentProviderExecutor(active,resolver,fake({body:JSON.stringify(response)}))(material(provider),input,new AbortController().signal,async()=>{}),text)
  for(const [provider,response] of [['anthropic',{stop_reason:'max_tokens',content:[{type:'text',text:'{}'}]}],['gemini',{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}],['gemini',{candidates:[{finishReason:'STOP',content:{parts:[{text:'{}',thought:true}]}}]}]])await assert.rejects(createAgentAssessmentProviderExecutor(active,resolver,fake({body:JSON.stringify(response)}))(material(provider),input,new AbortController().signal,async()=>{}),/agent_assessment_provider_unknown/)
})
