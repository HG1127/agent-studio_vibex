// Actual handlers/parsers/SDK with injected streams and repository values only.
// No listener, real Cookie session, employee, database, fee or ACL proof.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {createAgentPlanWorkflowHttpHandler} from '../src/agent-plan-workflow-http.ts'
import {HttpError} from '../src/contracts.ts'
import {NATIVE_SESSION_COOKIE} from '../src/native-employee-auth.mjs'
import {agentPlanWorkflowCancelAcknowledgement} from '../src/agent-plan-workflow-rpc-contract.ts'
import {createPgNativeAgentPlanWorkflowApi} from '../../../src/lib/pgNativeAgentPlanWorkflow.ts'
import {browserValues,id,hex} from '../../../tests/helpers/agent-plan-workflow-browser-values.mjs'
const origin='https://localhost:17443',base='/api/v2/agent-plan-workflow',identity={issuer:'urn:agentstudio:local:v1',subject:'synthetic-employee'}
function request(path,method='GET',body,extra={}){
  const value=body===undefined?'':typeof body==='string'?body:JSON.stringify(body),r=Readable.from(value?[Buffer.from(value)]:[])
  Object.assign(r,{url:path,method,headers:{origin,cookie:NATIVE_SESSION_COOKIE+'='+'a'.repeat(43),...(method!=='GET'?{'content-type':'application/json','x-agentstudio-request':'1','content-length':String(Buffer.byteLength(value))}:{}),...extra}});return r
}
const response=()=>({writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=JSON.parse(body)}})
async function fixture(auth=async()=>identity){
  const f=await browserValues(),calls=[];let authCalls=0
  const repo={source:{reference:async(who,selected)=>{calls.push(['source',who,selected]);return f.sourceResponse}},preview:async(who,choice)=>{calls.push(['preview',who,choice]);return f.preview},
    submit:async(who,body)=>{calls.push(['submit',who,body]);return f.receipt(body)},confirm:async(who,body)=>{calls.push(['confirm',who,body]);return f.receipt(body,{replayed:true})},view:async(who,key)=>{calls.push(['view',who,key]);return f.view({...f.submit,request_id:key})},
    control:async(who,body,confirm)=>{calls.push(['control',who,body,confirm]);return f.controlReceipt(body,{replayed:confirm})},previewSave:async(who,input)=>{calls.push(['previewSave',who,input]);return f.savePreview(input)},save:async(who,intent,input,confirm)=>{calls.push(['save',who,intent,input,confirm]);return f.saveReceipt(intent,{replayed:confirm})}}
  const run=createAgentPlanWorkflowHttpHandler({repository:repo,authenticateRequest:async req=>{authCalls++;return auth(req)},allowedOrigin:origin,available:true})
  const send=async(path,method='POST',body,headers)=>{const res=response();assert.equal(await run(request(base+path,method,body,headers),res),true);return res}
  return {f,repo,run,send,calls,authCalls:()=>authCalls}
}
test('all ten exact Native routes round-trip through actual browser SDK and original repository method arguments',async()=>{
  const x=await fixture(),api=createPgNativeAgentPlanWorkflowApi({rootPath:'',transport:async(url,init)=>{
    const req=request(url,init.method,init.body,Object.fromEntries(Object.entries(init.headers).map(([key,value])=>[key.toLowerCase(),value]))),res=response();await x.run(req,res);return new Response(JSON.stringify(res.body),{status:res.status,headers:res.headers})
  }})
  await api.source(x.f.selection);await api.preview(x.f.choice);await api.submit(x.f.submit);await api.confirm(x.f.submit);await api.view(x.f.submit.request_id)
  const control={action:'cancel',request_id:id(103),generation_request_id:x.f.submit.request_id,confirm:true,acknowledgement:agentPlanWorkflowCancelAcknowledgement}
  await api.control(control);await api.confirmControl(control);await api.previewSave(x.f.previewInput);await api.save(x.f.save);await api.confirmSave(x.f.save.intent)
  assert.equal(x.calls.length,10);assert.equal(x.authCalls(),20)
  assert.deepEqual(x.calls.find(c=>c[0]==='source')[2],x.f.selection)
  const saves=x.calls.filter(c=>c[0]==='save');assert.equal(saves[0][4],false);assert.equal(saves[1][3],undefined);assert.equal(saves[1][4],true)
})
test('default-off and unrelated routes mount nothing and never authenticate or call a repository',async()=>{
  let auth=0;const run=createAgentPlanWorkflowHttpHandler({repository:{},authenticateRequest:async()=>{auth++;throw Error()},allowedOrigin:origin}),res=response()
  assert.equal(await run(request('/api/v2/other'),res),false);assert.equal(await run(request(base+'/source','POST',{}),res),true);assert.equal(res.status,404);assert.equal(auth,0)
})
test('Origin/CSRF/Cookie/Bearer/user-header aliases and path/query overrides never reach business methods',async()=>{
  const x=await fixture()
  for(const [suffix,extra]of [['/source',{origin:'https://outside.invalid'}],['/source',{'x-agentstudio-request':undefined}],['/source',{cookie:undefined}],['/source',{authorization:'Bearer fake'}],['/source',{'x-rh-user-id':'fake'}],['/source',{'x_rh_user_id':'fake'}],['/source',{'x-rh-user_id':'fake'}],['/%73ource',{}],['/source?owner=other',{}]]){
    const r=await x.send(suffix,'POST',x.f.selection,extra);assert.ok([400,401,403].includes(r.status))
  }
  assert.equal(x.calls.length,0)
})
test('closed body and strict JSON/media/framing bounds refuse malformed or identity-bearing submissions',async()=>{
  const x=await fixture()
  for(const [body,headers,status]of [[{...x.f.selection,identity},undefined,400],['{"purpose":"x","purpose":"y"}',undefined,400],[x.f.selection,{'content-type':'text/plain'},415],[x.f.selection,{'content-length':'999999'},413],[x.f.selection,{'content-length':'1'},400],[x.f.selection,{'content-encoding':'gzip'},415]]){
    assert.equal((await x.send('/source','POST',body,headers)).status,status)
  }
  assert.equal(x.calls.length,0)
})
test('employee deactivation or account change after business await suppresses result and immutable request metadata',async()=>{
  for(const mode of ['disabled','changed','mutable-original']){
    let active=true;const shared={...identity},x=await fixture(async()=>{if(!active&&mode==='disabled')throw new HttpError(401,'session_required');return mode==='mutable-original'?shared:{...identity,subject:active?identity.subject:'other-employee'}})
    x.repo.submit=async(_who,intent)=>{active=false;if(mode==='mutable-original')shared.subject='other-employee';return x.f.receipt(intent)}
    const r=await x.send('/requests','POST',x.f.submit);assert.equal(r.status,401);assert.equal(Object.hasOwn(r.body,'request_id'),false)
  }
})
test('historical view is reauthenticated and a self-inconsistent result hash is never200',async()=>{
  const x=await fixture();x.repo.view=async()=>{const v=await x.f.view();v.result.result_sha256=hex(9);return v}
  assert.equal((await x.send('/requests/'+x.f.submit.request_id,'GET')).status,500)
})
test('fulfilled business projection errors remain uncertain500, including typed business-looking projection values',async()=>{
  const x=await fixture();x.repo.submit=async()=>({protocol:'wrong'})
  const r=await x.send('/requests','POST',x.f.submit);assert.equal(r.status,500);assert.deepEqual(r.body,{error:'internal_error'})
})
test('save preview returns only the exact edited candidate and validated candidate/preview digests',async()=>{
  for(const mutate of [v=>v.candidate_sha256=hex(8),v=>v.preview_sha256=hex(9),v=>v.candidate.name='not the reviewed edit']){
    const x=await fixture();x.repo.previewSave=async()=>{const v=structuredClone(x.f.save_preview);mutate(v);return v}
    assert.equal((await x.send('/preview-save','POST',x.f.previewInput)).status,500)
  }
})
