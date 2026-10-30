// Synthetic DNS/wire responses only: no network, real key, fee or provider call.
import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {readFileSync} from 'node:fs'
import {prepareAgentPlanWorkflowProviderRequest as prepare,extractAgentPlanWorkflowProviderText as extract,parseAgentPlanWorkflowTransportJson as parse,createAgentPlanWorkflowProviderExecutor as executor} from '../src/agent-plan-workflow-provider.ts'
import {agentPlanWorkflowExecutionApproval as approval} from '../src/agent-plan-workflow-runtime-policy.ts'
const activation={executionEnabled:true,executionApproval:approval},input={messages:[{role:'system',content:'有界草图'},{role:'user',content:'设计而不执行'}],output_token_limit:8192},material=provider=>({provider,base_url:provider==='openai'?'https://api.openai.com/v1':provider==='anthropic'?'https://api.anthropic.com/v1':'https://generativelanguage.googleapis.com/v1beta',model_id:provider==='gemini'?'models/gemini-test':'model-test',api_key:'synthetic_test_key_only'})
const output={protocol:'agent_plan_workflow_model_output_v1',name:'草图',graph:{version:2,nodes:[{id:'s',type:'start',position:{x:0,y:0},data:{title:'s'}},{id:'m',type:'model',position:{x:1,y:1},data:{title:'m',prompt:'分析'}},{id:'e',type:'end',position:{x:2,y:2},data:{title:'e'}}],edges:[{id:'a',source:'s',target:'m'},{id:'b',source:'m',target:'e'}]}},modelJson=JSON.stringify(output),wire={choices:[{finish_reason:'stop',message:{content:modelJson}}]}
function transport(value=wire,options={}){const calls=[];const request=(opts,callback)=>{const req=new EventEmitter();req.destroy=()=>{req.destroyed=true};opts.signal?.addEventListener('abort',()=>req.emit('error',Error('aborted')),{once:true});req.end=body=>{calls.push({opts:{...opts,headers:{...opts.headers}},body:Buffer.from(body)});if(options.hang)return req;queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=options.status??200;res.headers={'content-type':'application/json',...options.headers};res.destroy=()=>{};callback(res);res.emit('data',Buffer.from(typeof value==='string'?value:JSON.stringify(value)));res.emit('end')});return req};return req};return {calls,request}}
const resolver={resolve4:async()=>['93.184.216.34'],resolve6:async()=>[]}
test('own default-off/approval, exact provider and bounded cap reject before transport',()=>{
 assert.throws(()=>executor(),/disabled/);assert.throws(()=>executor({executionEnabled:true,executionApproval:'APPROVE_DISPOSABLE_PG18_AGENT_DESIGN_EXECUTION_ONLY'}));for(const patch of [{output_token_limit:32768},{messages:[input.messages[1]]},{messages:[{role:'user',content:'x'},input.messages[1]]}])assert.throws(()=>prepare(material('openai'),{...input,...patch}));assert.throws(()=>prepare({...material('openai'),base_url:'https://attacker.invalid/v1'},input))
})
test('three established provider request shapes carry exact cap/two messages and no key in URL/body',()=>{
 for(const provider of ['openai','anthropic','gemini']){const p=prepare(material(provider),input),body=JSON.parse(p.body);assert.equal(p.headers['Content-Length'],String(p.body.length));assert.ok(!p.path.includes('synthetic'));assert.ok(!p.body.includes(Buffer.from('synthetic_test_key_only')));if(provider==='openai'){assert.equal(body.max_completion_tokens,8192);assert.deepEqual(body.messages,input.messages);assert.equal(p.path,'/v1/chat/completions')}else if(provider==='anthropic'){assert.equal(body.max_tokens,8192);assert.equal(body.system,input.messages[0].content)}else{assert.equal(body.generationConfig.maxOutputTokens,8192);assert.equal(body.generationConfig.responseMimeType,'application/json')}}
})
test('strict bounded transport JSON rejects duplicate decoded keys, prototype hooks, trailing data, BOM, bad Unicode and negative zero',()=>{
 assert.equal(parse('{"n":0.0000001}').n,1e-7)
 for(const value of ['{"a":1,"\\u0061":2}','{"__proto__":{}}','{} {}','\ufeff{}','{"n":-0}','{"n":1e999}','{"a":"\\ud800"}',' '.repeat(524289),'[1,]'])assert.throws(()=>parse(value))
})
test('only complete F05 graph text is accepted; truncation/tool output and old F01 role are refused without repair',()=>{
 assert.equal(extract('openai',wire),modelJson);assert.equal(extract('anthropic',{stop_reason:'end_turn',content:[{type:'text',text:modelJson}]}),modelJson);assert.equal(extract('gemini',{candidates:[{finishReason:'STOP',content:{parts:[{text:modelJson}]}}]}),modelJson)
 for(const value of [{choices:[{finish_reason:'length',message:{content:modelJson}}]},{choices:[{finish_reason:'stop',message:{content:modelJson,tool_calls:[]}}]},{choices:[{finish_reason:'stop',message:{content:'{"goal":"F01"}'}}]},{choices:[...wire.choices,...wire.choices]}])assert.throws(()=>extract('openai',value))
})
test('actual fixed-address resolver and immediately-before-POST guard run before exactly one synthetic request',async()=>{
 const t=transport(),order=[],run=executor(activation,{resolve4:async host=>{order.push('dns');assert.equal(host,'api.openai.com');return ['93.184.216.34']},resolve6:async()=>[]},t.request),result=await run(material('openai'),input,new AbortController().signal,async()=>{order.push('guard')});assert.equal(result,modelJson);assert.deepEqual(order,['dns','guard']);assert.equal(t.calls.length,1);assert.equal(t.calls[0].opts.method,'POST');assert.equal(t.calls[0].opts.port,443);assert.equal(t.calls[0].opts.agent,false);assert.equal(t.calls[0].opts.rejectUnauthorized,true);assert.equal(t.calls[0].opts.minVersion,'TLSv1.2');assert.equal(t.calls[0].opts.servername,'api.openai.com')
 let resolved;t.calls[0].opts.lookup('api.openai.com',{},(...args)=>{resolved=args});assert.deepEqual(resolved,[null,'93.184.216.34',4])
})
test('unsafe DNS, aborted signal or final source refusal never creates a POST',async()=>{
 const t=transport();await assert.rejects(()=>executor(activation,{resolve4:async()=>['127.0.0.1'],resolve6:async()=>[]},t.request)(material('openai'),input,new AbortController().signal,async()=>{}));await assert.rejects(()=>executor(activation,resolver,t.request)(material('openai'),input,new AbortController().signal,async()=>{throw Error('source_changed')}),/source_changed/);const c=new AbortController();c.abort();await assert.rejects(()=>executor(activation,resolver,t.request)(material('openai'),input,c.signal,async()=>{}));assert.equal(t.calls.length,0)
})
test('bad status/media/encoding/oversize or malformed wire yields unknown after one POST, without resend or cap change',async()=>{
 for(const [value,options]of [[wire,{status:302}],[wire,{headers:{'content-type':'text/plain'}}],[wire,{headers:{'content-encoding':'gzip'}}],['x'.repeat(524289),{}],['{"choices":[],"choices":[]}',{}]]){const t=transport(value,options);await assert.rejects(()=>executor(activation,resolver,t.request)(material('openai'),input,new AbortController().signal,async()=>{}),/provider_unknown/);assert.equal(t.calls.length,1);assert.equal(JSON.parse(t.calls[0].body).max_completion_tokens,8192)}
})
test('actual abort rejects the in-flight synthetic request as unknown; no automatic second request',async()=>{
 const t=transport(wire,{hang:true}),c=new AbortController(),work=executor(activation,resolver,t.request)(material('openai'),input,c.signal,async()=>{});await new Promise(resolve=>setImmediate(resolve));assert.equal(t.calls.length,1);c.abort();await assert.rejects(()=>work,/provider_unknown/);assert.equal(t.calls.length,1)
})
test('provider imports no F01 fee/parser/Worker authority and creates no listener/loop',()=>{const source=readFileSync(new URL('../src/agent-plan-workflow-provider.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/agent-design-|setInterval|createServer|\.listen\(/);assert.equal((source.match(/const req=request\(/g)??[]).length,1)})
