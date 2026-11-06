import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

// Actual fixture closures, terminal DATA ports only. No TLS, network, SQL,
// browser, Worker or service is created by these ordering counterexamples.
const dispatchSource=readFileSync(new URL('./helpers/pg-original-version-release-completion-dispatch.mjs',import.meta.url),'utf8')
const dispatchTree=ts.createSourceFile('dispatch.mjs',dispatchSource,ts.ScriptTarget.Latest,true)
assert.equal(dispatchTree.parseDiagnostics.length,0)
function variable(name){let found;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(dispatchTree)===name){assert(!found);found=node}ts.forEachChild(node,visit)}visit(dispatchTree);assert(found);return found}
const declaration=name=>'const '+variable(name).getText(dispatchTree)+';'
function privateDispatch({oldCapture=false}={}){
 let factory=declaration('privateFactory')
 if(oldCapture){for(const kind of ['model','tool']){const old=`wrap('${kind}',{dispatch:(identity,request)=>${kind}Broker.dispatch(identity,request)})`;assert(factory.includes(old));factory=factory.replace(old,`wrap('${kind}',${kind}Broker)`)}}
 const events=[],identity={issuer:'verified-native-issuer',subject:'verified-subject-different-from-user-id'},calls=[],failures=[]
 const ports={assert,verifiedAlice:identity,privateEvents:events,rememberFailure:(...args)=>failures.push(args),identityPool:{terminal:true},modelDispatch:{WorkflowV2ModelLeaseIdentity:class{constructor(pool){assert.equal(pool,ports.identityPool)}},verifiedWorkflowV2ModelDispatch:(_resolver,broker)=>async raw=>broker.dispatch(identity,raw)},toolDispatch:{WorkflowV2ToolLeaseIdentity:class{constructor(pool){assert.equal(pool,ports.identityPool)}},verifiedWorkflowV2ToolDispatch:(_resolver,broker)=>async raw=>broker.dispatch(identity,raw)},modelHandler:{createWorkflowV2ModelInternalHandler:config=>{calls.push('model_handler');assert.equal(config.executionMode,'agent_native_v2');return async(req)=>config.dispatch(req.raw)}},toolHandler:{createWorkflowV2ToolInternalHandler:config=>{calls.push('tool_handler');assert.equal(config.executionMode,'agent_native_v2');return async(req)=>config.dispatch(req.raw)}},releaseDispatchHttpCause:()=>{throw Error('unexpected HTTP failure')}}
 const api=Function(...Object.keys(ports),'let modelBroker,toolBroker,active=null;'+['dispatchFailure','wrap','observedDispatch'].map(declaration).join('\n')+'\n'+factory+';return{create:privateFactory,set(model,tool){modelBroker=model;toolBroker=tool},active:()=>active,counts:()=>dispatchFailure}')(...Object.values(ports))
 const handler=api.create({reviewedClientFingerprint256:'terminal-DATA'})
 assert.deepEqual(calls,['model_handler','tool_handler']);assert.equal(events.length,0)
 return{...api,handler,events,calls,failures,identity}
}
const proof=()=>({claim:{run_id:'terminal-run'},step_key:'terminal-step',input_sha256:'a'.repeat(64)})
for(const kind of ['model','tool'])test('old TLS handler factory captures an undefined '+kind+' Broker before the callback initializes it',async()=>{
 const f=privateDispatch({oldCapture:true});let count=0;const broker={async dispatch(){count++;return{status:'succeeded',text:'Synthetic'}}};f.set(broker,broker)
 await assert.rejects(f.handler({url:'/__internal/v2/workflow-'+kind+'/dispatch',raw:proof()},{statusCode:200}),TypeError)
 assert.equal(count,0);assert.equal(f.events.length,1);assert.equal(f.active(),null);assert.equal(f.failures[0][1],'broker_dispatch')
})
for(const kind of ['model','tool'])test('actual '+kind+' handler dereferences the initialized private Broker only when dispatching',async()=>{
 const f=privateDispatch(),raw=proof();let count=0
 const broker={async dispatch(identity,request){count++;assert.equal(identity,f.identity);assert.equal(request,raw);assert.equal(f.active().kind,kind);return{status:'succeeded',text:'Synthetic'}}},wrong={dispatch(){throw Error('wrong Broker')}}
 f.set(kind==='model'?broker:wrong,kind==='tool'?broker:wrong)
 assert.deepEqual(await f.handler({url:'/__internal/v2/workflow-'+kind+'/dispatch',raw},{statusCode:200}),{status:'succeeded',text:'Synthetic'})
 assert.equal(count,1);assert.equal(f.events.length,1);assert.equal(f.counts().identity_attempts,1);assert.equal(f.counts().private_requests,1);assert.equal(f.active(),null);assert.deepEqual(f.failures,[])
})
test('actual deferred dispatch keeps the original Broker failure object and never retries',async()=>{
 const f=privateDispatch(),primary=Error('terminal reservation outcome unknown');let count=0;const broker={async dispatch(){count++;throw primary}};f.set(broker,broker)
 await assert.rejects(f.handler({url:'/__internal/v2/workflow-model/dispatch',raw:proof()},{statusCode:200}),error=>error===primary)
 assert.equal(count,1);assert.equal(f.events.length,1);assert.equal(f.active(),null)
})
test('actual disposable TLS source builds its handler before entering the Broker initialization callback',()=>{
 const source=readFileSync(new URL('../services/pg-api/tests/helpers/bound-model-loopback-tls.mjs',import.meta.url),'utf8')
 assert(source.indexOf('const handler=handlerFactory(')<source.indexOf('return await run('))
 assert(dispatchSource.indexOf('modelBroker=new modelDispatch.WorkflowV2ModelDispatch')<dispatchSource.indexOf('readyResolve();await finish'))
 assert(dispatchSource.includes('await ready'))
})

const detailSource=readFileSync(new URL('./pg-original-run-detail-queued-genuine.spec.mjs',import.meta.url),'utf8'),detailTree=ts.createSourceFile('detail.mjs',detailSource,ts.ScriptTarget.Latest,true)
assert.equal(detailTree.parseDiagnostics.length,0)
let stepBody
function findSteps(node){if(ts.isIfStatement(node)&&node.expression.getText(detailTree)==="['workflow_v2','agent_autonomous'].includes(kind)"){assert(!stepBody);stepBody=node.thenStatement.getText(detailTree)}ts.forEachChild(node,findSteps)}findSteps(detailTree);assert(stepBody)
async function observeSteps({status=200,jsonError=null}={}){
 const trace=[],run={id:'terminal-run'},payload={items:[],next_after:null},response={status:()=>status,json:async()=>{trace.push('json');if(jsonError)throw jsonError;return payload}}
 const expect=value=>({toBe:expected=>assert.equal(value,expected),toMatchObject:expected=>assert.deepEqual(value,expected)})
 const b={wire(_page,path){trace.push('wire');assert.equal(path,'/api/v2/workflow-v2-runs/'+run.id+'/steps');return Promise.resolve(response)}}
 const p={getByRole(role,options){assert.equal(role,'button');assert.equal(options.name,'重新读取公开步骤分页');return{async click(){trace.push('click');await Promise.resolve();await Promise.resolve();assert(trace.includes('json'));trace.push('click-done')}}}}
 const ready=async kind=>{assert.equal(kind,'workflow_v2');trace.push('ready')}
 await Function('kind','f','b','p','expect','ready','return(async()=>'+stepBody+')()')('workflow_v2',{owned:{alice:{runs:{workflow_v2:{run}}}}},b,p,expect,ready)
 return trace
}
test('actual public steps body read begins before the click completes, then preserves status and empty-page assertions',async()=>{
 const trace=await observeSteps();assert(trace.indexOf('wire')<trace.indexOf('click'));assert(trace.indexOf('json')<trace.indexOf('click-done'));assert.equal(trace.at(-1),'ready');assert.equal(trace.filter(v=>v==='json').length,1)
})
test('actual public steps observation rejects a non200 response',async()=>{await assert.rejects(observeSteps({status:503}))})
test('actual public steps JSON failure remains fatal without replay',async()=>{const primary=Error('terminal body unavailable');await assert.rejects(observeSteps({jsonError:primary}),error=>error===primary)})
