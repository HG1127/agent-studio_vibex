// In-memory HTTP streams plus real Native Cookie/Origin/CSRF handlers. All
// repositories are unit doubles: no SQL/PGlite, listener, provider or socket.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {createHandler} from '../src/http.ts'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {NATIVE_SESSION_COOKIE} from '../src/native-employee-auth.mjs'
import {permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
import {parseAgentReviewSubmission,agentReviewDimensions} from '../src/agent-review-contract.ts'
import {parseAgentReviewControl} from '../src/agent-review-control.ts'
import {agentAssessmentOutputHash} from '../src/agent-assessment-contract.ts'
import {HttpError} from '../src/contracts.ts'
import {publicAgentReviewPreview} from '../src/agent-review-public-contract.ts'

const origin='https://127.0.0.1:7443',base='/api/v2/agent-reviews',created='2026-10-27T01:02:03.000Z'
const id=n=>`${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`
const target={purpose:'evaluate',spec_id:id(1),run_id:id(2)}
const choice={...target,action:'preview',expected_source_sha256:'a'.repeat(64),expected_spec_revision:2,expected_spec_sha256:'b'.repeat(64),model_binding:{connection_id:id(3),connection_revision:3,model_id:'synthetic'},output_token_limit:2048,feedback_sources:[],evaluation_sources:[]}
const submission={...choice,action:'submit',request_id:id(4),expected_input_sha256:'c'.repeat(64),confirm:true,fee_acknowledgement:'APPROVE_ONE_PAID_AGENT_EVALUATION_V1'}
const control=(action='erase')=>({action,request_id:id(5),review_id:submission.request_id,expected_request_sha256:parseAgentReviewSubmission(submission).request_sha256,confirm:true})
const prepared=selected=>({protocol:'agent_paid_review_prepared_input_v1',choice:structuredClone(selected),messages:[{role:'system',content:'privateSyntheticSystem'},{role:'user',content:'privateSyntheticPrompt api_key=neverPublish'}],input_sha256:'c'.repeat(64),content_sha256:'d'.repeat(64),owner_epoch:2,source_protocol:selected.purpose==='evaluate'?'current_task_delivery_v1':'employee_statement_anchor_v1',byte_length:1024,output_token_limit:selected.output_token_limit,recorded:false})
function receipt(raw,replayed=false){const v=parseAgentReviewSubmission(raw);return {protocol:'agent_paid_review_receipt_v1',request_id:v.request_id,spec_id:v.spec_id,run_id:v.run_id,purpose:v.purpose,request_sha256:v.request_sha256,input_sha256:v.expected_input_sha256,content_sha256:'d'.repeat(64),owner_epoch:2,source_protocol:v.purpose==='evaluate'?'current_task_delivery_v1':'employee_statement_anchor_v1',created_at:created,state:'pending',body_erased:false,recorded:true,replayed}}
function fixture(){
  const tokens={alice:'A'.repeat(43),bob:'B'.repeat(43)},sessions=new Map(Object.entries(tokens).map(([subject,token])=>[token,{issuer:'urn:agentstudio:local:v1',subject}]))
  const calls=[],records=new Map(),controls=new Map(),hooks={};let settings,handler,dependencies
  const key=(identity,request)=>identity.subject+':'+request
  const missing=()=>{throw new HttpError(404,'agent_review_receipt_not_found')}
  const original=(identity,raw)=>{const value=parseAgentReviewSubmission(raw),old=records.get(key(identity,value.request_id));if(!old)return null;if(old.request_sha256!==value.request_sha256)throw new HttpError(409,'agent_review_request_conflict');return {...old,replayed:true}}
  const source={async source(identity,raw){calls.push({method:'source',identity,raw});if(hooks.source)return hooks.source(identity,raw);return {protocol:'agent_review_source_v1',...raw,expected_source_sha256:'a'.repeat(64),expected_spec_revision:2,expected_spec_sha256:'b'.repeat(64),source_protocol:raw.purpose==='evaluate'?'current_task_delivery_v1':'employee_statement_anchor_v1',recorded:false}},async preview(identity,raw){calls.push({method:'preview',identity,raw});return hooks.preview?hooks.preview(identity,raw):prepared(raw)}}
  const ledger={async submit(identity,raw){calls.push({method:'submit',identity,raw});const old=original(identity,raw);if(old)return old;if(!settings.config||!settings.submit)throw new HttpError(403,'agent_review_submission_disabled');const row=receipt(raw);records.set(key(identity,row.request_id),row);return hooks.receipt?hooks.receipt(row):{...row}},async confirm(identity,raw){calls.push({method:'confirm',identity,raw});return original(identity,raw)||missing()},async change(identity,raw){calls.push({method:'change',identity,raw});const v=parseAgentReviewControl(raw),k=key(identity,v.request_id),old=controls.get(k);if(old){if(old.request_sha256!==v.request_sha256)throw new HttpError(409,'agent_review_request_conflict');return {...old,replayed:true}}const row=records.get(key(identity,v.review_id));if(!row)missing();if(row.request_sha256!==v.expected_request_sha256)throw new HttpError(409,'agent_review_request_conflict');if(v.action==='erase'){row.state='erased';row.body_erased=true}else if(row.state==='pending')row.state='cancelled';const r={protocol:'agent_paid_review_control_receipt_v1',request_id:v.request_id,review_id:v.review_id,action:v.action,request_sha256:v.request_sha256,created_at:created,recorded:true,replayed:false};controls.set(k,r);return {...r}},async confirmControl(identity,raw){calls.push({method:'confirmControl',identity,raw});const v=parseAgentReviewControl(raw),old=controls.get(key(identity,v.request_id));if(!old)missing();if(old.request_sha256!==v.request_sha256)throw new HttpError(409,'agent_review_request_conflict');return {...old,replayed:true}}}
  const opinions={async getCurrent(identity,reviewId){calls.push({method:'getCurrent',identity,raw:reviewId});if(hooks.current)return hooks.current(identity,reviewId);const row=records.get(key(identity,reviewId));if(!row)throw new HttpError(404,'agent_opinion_not_found');const {protocol:_p,state,body_erased,recorded:_r,replayed:_e,...request}=row;return {protocol:'agent_paid_review_view_v1',request,execution:{job_state:state,lease_state:null,outcome:null},body_erased,available:false,result:null}}}
  const auth={async login(){throw Error('not used')},async revokeSession(token){sessions.delete(token)},async provisionEmployee(){throw Error('not used')},async verifySession(token){return sessions.get(token)||null},async getSessionProfile(token){const identity=sessions.get(token);return identity?{id:identity.subject,email:identity.subject+'@example.test',display_name:identity.subject,is_admin:true}:null}}
  function configure(next={}){
    settings={config:false,submit:false,available:true,...next};let business
    const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowAgentReview:settings.available,allowAgentReviewSubmission:settings.submit,allowConfigurationWrites:settings.config,businessHandler:(req,res)=>{
      const path=new URL(req.url,origin).pathname
      if(!permitNativePg18BusinessUatRequest(path,req.method,{configurationWrites:settings.config})){res.writeHead(405,{'Cache-Control':'no-store'});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return}
      return business(req,res)
    }})
    dependencies={repository:{},allowedOrigin:origin,verifyToken:async()=>{calls.push({method:'bearer'});throw Error('no fallback')},authenticateRequest:native.authenticateRequest,...(settings.available?{agentReviewSourceRepository:source,agentReviewLedgerRepository:ledger,agentOpinionRepository:opinions}:{})}
    business=createHandler(dependencies);handler=native.handler
  }
  configure()
  async function call(path,{body,raw,method=body!==undefined||raw!==undefined?'POST':'GET',who='alice',headers={},csrf=true,sendOrigin=true,cookie=true,direct=false}={}){
    const bytes=raw!==undefined?(Buffer.isBuffer(raw)?raw:Buffer.from(raw)):body!==undefined?Buffer.from(JSON.stringify(body)):Buffer.alloc(0)
    const req=Readable.from(bytes.length?[bytes]:[]);Object.assign(req,{url:path,method,socket:{remoteAddress:'127.0.0.1'},headers:{...(sendOrigin?{origin}:{}),...(csrf?{'x-agentstudio-request':'1'}:{}),...(cookie?{cookie:NATIVE_SESSION_COOKIE+'='+tokens[who]}:{}),...(body!==undefined||raw!==undefined?{'content-type':'application/json'}:{}),...Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]))}})
    const response={status:0,headers:{},text:'',writeHead(status,h){this.status=status;this.headers=h},end(value){this.text+=value??''}}
    await (direct?createHandler(dependencies):handler)(req,response)
    return {status:response.status,headers:response.headers,body:JSON.parse(response.text)}
  }
  return {call,configure,calls,hooks,records,controls,sessions,tokens,get dependencies(){return dependencies}}
}

test('closed admission preserves safe source/preview and delegates immutable recovery/privacy without an HTTP fresh-write gate',async()=>{
  const f=fixture(),source=await f.call(base+'/source',{body:target}),preview=await f.call(base+'/preview',{body:choice})
  assert.equal(source.status,200);assert.equal(source.body.protocol,'agent_review_source_v1');assert.equal(preview.status,200)
  assert.deepEqual(Object.keys(preview.body).sort(),['protocol','choice','input_sha256','content_sha256','owner_epoch','source_protocol','byte_length','output_token_limit','recorded'].sort())
  assert.equal(preview.body.protocol,'agent_paid_review_preview_v1');assert.equal(preview.body.recorded,false);assert.deepEqual(preview.body.choice,choice)
  assert.doesNotMatch(JSON.stringify(preview.body),/messages|privateSynthetic|api_key|owner_user_id|lease_token/)
  assert.equal((await f.call(base+'/submit',{body:submission})).status,403)
  f.configure({config:true,submit:true});const first=await f.call(base+'/submit',{body:submission});assert.equal(first.status,200);assert.equal(first.body.replayed,false)
  f.configure();const confirmed=await f.call(base+'/confirm',{body:submission}),replay=await f.call(base+'/submit',{body:submission})
  assert.equal(confirmed.body.replayed,true);assert.equal(replay.body.replayed,true);assert.equal(f.records.size,1)
  assert.equal((await f.call(base+'/submit',{body:{...submission,request_id:id(6)}})).status,403)
  assert.equal((await f.call(base+'/submit',{body:{...submission,output_token_limit:4096}})).status,409)
  const erased=await f.call(base+'/'+submission.request_id+'/control',{body:control()});assert.equal(erased.status,200);assert.equal(erased.body.recorded,true)
  assert.equal((await f.call(base+'/'+submission.request_id+'/control-confirm',{body:control()})).body.replayed,true)
  const current=await f.call(base+'/'+submission.request_id);assert.equal(current.body.available,false);assert.equal(current.body.body_erased,true);assert.equal(current.body.result,null)
  assert.equal((await f.call(base+'/submit',{body:submission})).body.state,'erased');assert.equal(f.records.size,1);assert.equal(f.controls.size,1)
  assert.deepEqual(f.calls.find(c=>c.method==='submit').raw,submission,'HTTP passes the original closed payload rather than a new request ID or recomputed intent')
  for(const reply of [source,preview,first,confirmed,erased,current])assert.equal(reply.headers['Cache-Control'],'no-store')
})
test('every route uses Native Cookie identity and existing Origin/fetch-site/POST CSRF rules, with no Bearer or X-Rh fallback',async()=>{
  const f=fixture();f.configure({config:true,submit:true});await f.call(base+'/submit',{body:submission})
  for(const [path,body] of [[base+'/source',target],[base+'/preview',choice],[base+'/submit',submission],[base+'/confirm',submission],[base+'/'+id(4)+'/control',control()],[base+'/'+id(4)+'/control-confirm',control()]]){
    for(const options of [{cookie:false,headers:{'X-Rh-User-Id':id(1)}},{headers:{Authorization:'Bearer opaque'}},{csrf:false},{sendOrigin:false},{headers:{Origin:'https://foreign.invalid'}},{headers:{'Sec-Fetch-Site':'same-site'}}])assert.ok([401,403].includes((await f.call(path,{body,...options})).status))
  }
  assert.equal((await f.call(base+'/'+id(4),{who:'bob',headers:{'X-Rh-User-Id':id(1)}})).status,404)
  assert.equal((await f.call(base+'/'+id(4),{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403)
  f.sessions.delete(f.tokens.alice);assert.equal((await f.call(base+'/preview',{body:choice})).status,401)
  assert.equal(f.calls.some(c=>c.method==='bearer'),false)
  const bare=fixture();delete bare.dependencies.authenticateRequest
  assert.equal((await bare.call(base+'/source',{body:target,direct:true,headers:{Authorization:'Bearer opaque'}})).status,403);assert.equal(bare.calls.length,0)
})
test('absent schema removes the whole surface and capabilities; complete availability never implies independent admission',async()=>{
  const f=fixture()
  for(const [settings,available,enabled] of [[{},true,false],[{config:true},true,false],[{config:true,submit:true},true,true],[{submit:true},true,false],[{available:false,config:true,submit:true},false,false]]){
    f.configure(settings);const response=await f.call('/api/native-auth/capabilities')
    assert.equal(response.status,200);assert.equal(response.body.agent_review_available,available?true:undefined);assert.equal(response.body.agent_review_submission_enabled,available?enabled:undefined)
    assert.equal(response.body.agent_review_prior_supported,undefined);assert.equal(response.body.agent_review_generated_acceptance_enabled,undefined)
    if(!available)assert.equal((await f.call(base+'/source',{body:target})).status,404)
  }
  f.configure();delete f.dependencies.agentOpinionRepository;assert.equal((await f.call(base+'/preview',{body:choice,direct:true})).status,404)
})
test('closed methods/paths, strict UTF8 JSON, declared/chunked size bounds and path-control IDs refuse before repository invocation',async()=>{
  const f=fixture(),before=()=>f.calls.length
  for(const path of [base+'/preview?admin=true',base+'/preview?',base+'/'+id(4)+'?source=private',base+'/'+id(4)+'/control?owner='+id(1)])assert.equal((await f.call(path,path.includes('/'+id(4)+'?')?{}:{body:path.includes('control')?control():choice})).status,400)
  for(const path of [origin+base+'/preview',base+'/'+id(4)+'/../preview',base+'/preview#private'])assert.equal((await f.call(path,{body:choice})).status,400)
  for(const method of ['GET','PATCH','DELETE','PUT','HEAD'])assert.equal((await f.call(base+'/preview',{body:choice,method})).status,405)
  const at=before();assert.equal((await f.call(base+'/'+id(6)+'/control',{body:control()})).status,400);assert.equal(before(),at)
  for(const type of ['text/plain','application/json; charset=latin1','application/json; profile=private','application/json; charset=utf-8; charset=utf-8'])assert.equal((await f.call(base+'/source',{body:target,headers:{'Content-Type':type}})).status,415)
  assert.equal((await f.call(base+'/source',{body:target,headers:{'Content-Type':'Application/JSON; charset=UTF-8'}})).status,200)
  for(const length of ['-1','NaN','1.5','9007199254740992','8193'])assert.equal((await f.call(base+'/source',{body:target,headers:{'Content-Length':length}})).status,413)
  assert.equal((await f.call(base+'/source',{raw:JSON.stringify({...target,extra:'x'.repeat(8192)})})).status,413)
  for(const action of ['preview','submit','confirm'])assert.equal((await f.call(base+'/'+action,{raw:'x'.repeat(16385)})).status,413)
  assert.equal((await f.call(base+'/'+id(4)+'/control',{raw:'x'.repeat(8193)})).status,413)
  for(const raw of ['[]','null','{',Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xff,0x22,0x7d])])assert.equal((await f.call(base+'/source',{raw})).status,400)
  for(const body of [{...target,owner_user_id:id(1)},{...target,messages:[]},{...choice,paid:true},{...submission,request_sha256:'f'.repeat(64)}])assert.equal((await f.call(base+(body.action==='preview'?'/preview':body.action==='submit'?'/submit':'/source'),{body})).status,400)
})
test('preview rejects unsupported parents and malformed backend metadata without publishing a prepared body or evaluating accessors',async()=>{
  const f=fixture(),prior={...choice,purpose:'optimize',feedback_sources:[],evaluation_sources:[{run_id:id(2),review_id:id(6),result_sha256:'f'.repeat(64)}]}
  assert.equal((await f.call(base+'/preview',{body:prior})).status,409);assert.equal(f.calls.length,0)
  for(const patch of [{recorded:true},{protocol:'agent_paid_review_input_v1'},{owner_epoch:0},{owner_epoch:Number.MAX_SAFE_INTEGER},{input_sha256:'A'.repeat(64)},{content_sha256:null},{source_protocol:'employee_statement_anchor_v1'},{byte_length:0},{byte_length:262145},{byte_length:1.5},{output_token_limit:4096},{choice:{...choice,expected_spec_revision:3}},{owner_user_id:id(1)}]){
    f.hooks.preview=()=>({...prepared(choice),...patch});const r=await f.call(base+'/preview',{body:choice});assert.equal(r.status,502);assert.deepEqual(r.body,{error:'agent_review_response_unavailable'})
  }
  let gets=0;const unsafe=prepared(choice);Object.defineProperty(unsafe,'messages',{get(){gets++;throw Error('private accessor')},enumerable:true})
  assert.throws(()=>publicAgentReviewPreview(unsafe,choice),/agent_review_response_unavailable/);assert.equal(gets,0)
  f.hooks.preview=()=>{throw Error('privateSyntheticPrompt SQL api_key=neverPublish')};const failure=await f.call(base+'/preview',{body:choice});assert.equal(failure.status,500);assert.deepEqual(failure.body,{error:'internal_error'})
  f.hooks.source=()=>({...target,protocol:'agent_review_source_v1',recorded:false,messages:['neverPublish']});assert.equal((await f.call(base+'/source',{body:target})).status,502)
})
test('current result preserves score zero and failed/unknown truth while invalid result or receipt responses remain closed',async()=>{
  const f=fixture();f.configure({config:true,submit:true});const r=(await f.call(base+'/submit',{body:submission})).body
  const {protocol:_p,state,body_erased,recorded:_r,replayed:_e,...request}=r
  const result={score:0,dimensions:agentReviewDimensions.map(name=>({name,score:0,comment:'待核对'})),suggestions:[]},hash=agentAssessmentOutputHash(id(4),'evaluate',request.input_sha256,result)
  const view={protocol:'agent_paid_review_view_v1',request,execution:{job_state:state,lease_state:'succeeded',outcome:{status:'succeeded',completion_sha256:'e'.repeat(64),result_sha256:hash,failure_code:null,created_at:created}},body_erased,available:true,result}
  f.hooks.current=()=>view;let response=await f.call(base+'/'+id(4));assert.equal(response.status,200);assert.equal(response.body.result.score,0);assert.equal(response.body.available,true)
  for(const status of ['failed','unknown']){f.hooks.current=()=>({...view,execution:{job_state:'pending',lease_state:status,outcome:{status,completion_sha256:'e'.repeat(64),result_sha256:null,failure_code:'provider_outcome_unknown',created_at:created}},available:false,result:null});response=await f.call(base+'/'+id(4));assert.equal(response.status,200);assert.equal(response.body.execution.outcome.status,status);assert.equal(response.body.result,null);assert.equal(response.body.available,false)}
  f.hooks.current=()=>({...view,choice,messages:prepared(choice).messages});assert.equal((await f.call(base+'/'+id(4))).status,502)
  f.hooks.current=()=>({...view,request:{...request,request_id:id(6)},available:false,result:null});assert.equal((await f.call(base+'/'+id(4))).status,502)
  f.hooks.receipt=row=>({...row,messages:prepared(choice).messages});assert.equal((await f.call(base+'/submit',{body:{...submission,request_id:id(7)}})).status,502)
})
