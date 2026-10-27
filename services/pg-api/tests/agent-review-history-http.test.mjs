// Pure stream/Native Cookie tests. No SQL, listener, provider or socket.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {createHandler} from '../src/http.ts'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {NATIVE_SESSION_COOKIE} from '../src/native-employee-auth.mjs'
import {permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
import {HttpError} from '../src/contracts.ts'
import {agentReviewHistoryCursor} from '../src/agent-review-history-contract.ts'

const origin='https://127.0.0.1:7443',base='/api/v2/agent-reviews',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const target={spec_id:id(1),run_id:id(2),purpose:'evaluate'},path=base+`?spec_id=${id(1)}&run_id=${id(2)}&purpose=evaluate`,token='H'.repeat(43)
const item=()=>({request:{...target,request_id:id(3),request_sha256:'a'.repeat(64),input_sha256:'b'.repeat(64),content_sha256:'c'.repeat(64),owner_epoch:1,source_protocol:'current_task_delivery_v1',created_at:'2026-10-27T01:02:03.123Z'},control:{job_state:'pending',body_erased:false}})
function fixture(settings={}){
  const calls=[],options={review:true,history:true,config:false,submission:false,...settings},identity={issuer:'urn:agentstudio:local:v1',subject:'alice'},hooks={};let dependencies,business
  const auth={async login(){throw Error('unused')},async provisionEmployee(){throw Error('unused')},async revokeSession(){},async verifySession(raw){return raw===token?identity:null},async getSessionProfile(raw){return raw===token?{id:'alice',email:'alice@example.test',display_name:'alice'}:null}}
  const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowAgentReview:options.review,allowAgentReviewHistory:options.history,allowAgentReviewSubmission:options.submission,allowConfigurationWrites:options.config,businessHandler:(req,res)=>{
    if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,{configurationWrites:options.config})){res.writeHead(405,{});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return}
    return business(req,res)
  }})
  dependencies={repository:{},allowedOrigin:origin,verifyToken:async()=>{calls.push('bearer');throw Error('no fallback')},authenticateRequest:native.authenticateRequest,
    agentReviewSourceRepository:{async source(_identity,raw){calls.push('source');return {protocol:'agent_review_source_v1',...raw,expected_source_sha256:'a'.repeat(64),expected_spec_revision:1,expected_spec_sha256:'b'.repeat(64),source_protocol:'current_task_delivery_v1',recorded:false}},async preview(){throw Error('private_source_must_not_run')}},agentReviewLedgerRepository:{async submit(){throw Error('no_new_fee_intent')},async confirm(){throw Error('no_reconstruction')},async change(){throw Error('no_implicit_control')},async confirmControl(){throw Error('no_implicit_confirmation')}},agentOpinionRepository:{async getCurrent(){throw Error('no_private_body_in_history')}},agentReviewHistoryRepository:{async list(identity,query){calls.push({identity,query});if(hooks.list)return hooks.list(identity,query);return {protocol:'agent_paid_review_history_v1',...target,items:[item()],limit:query.limit,has_more:false,next_cursor:null}}}}
  business=createHandler(dependencies)
  async function call(url=path,{method='GET',headers={},raw='',direct=false,cookie=true}={}){
    const req=Readable.from(raw?[Buffer.from(raw)]:[]);Object.assign(req,{url,method,socket:{remoteAddress:'127.0.0.1'},headers:{origin,...(cookie?{cookie:NATIVE_SESSION_COOKIE+'='+token}:{}),...Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]))}})
    const res={status:0,headers:{},text:'',writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.text+=body??''}}
    await(direct?createHandler(dependencies):native.handler)(req,res)
    return {status:res.status,headers:res.headers,body:JSON.parse(res.text)}
  }
  return {call,calls,hooks,dependencies,identity}
}
test('history is an independent Native GET capability while fresh submissions/configuration stay disabled',async()=>{
  const f=fixture(),response=await f.call()
  assert.equal(response.status,200);assert.equal(response.body.protocol,'agent_paid_review_history_v1');assert.deepEqual(response.body.items,[item()])
  assert.deepEqual(f.calls,[{identity:f.identity,query:{...target,limit:20,before:null}}])
  assert.equal(response.headers['Cache-Control'],'no-store');assert.equal(response.headers['X-Content-Type-Options'],'nosniff');assert.equal(response.headers['Referrer-Policy'],'no-referrer')
  const caps=(await f.call('/api/native-auth/capabilities')).body
  assert.equal(caps.agent_review_available,true);assert.equal(caps.agent_review_history_available,true);assert.equal(caps.agent_review_submission_enabled,false);assert.equal(caps.config_writes_enabled,false)
  for(const [review,history,expected] of [[true,false,undefined],[false,true,undefined],[false,false,undefined],[true,true,true]]){
    const reply=(await fixture({review,history}).call('/api/native-auth/capabilities')).body
    assert.equal(reply.agent_review_history_available,expected)
  }
  for(const method of ['POST','PATCH','DELETE','PUT','HEAD'])assert.equal((await f.call(path,{method})).status,405)
})
test('fourth repository mount leaves the original surface intact; authenticated Cookie never falls back to client authority',async()=>{
  const f=fixture();delete f.dependencies.agentReviewHistoryRepository
  assert.equal((await f.call(path,{direct:true})).status,404)
  const source=await f.call(base+'/source',{direct:true,method:'POST',raw:JSON.stringify(target),headers:{'X-AgentStudio-Request':'1','Content-Type':'application/json'}})
  assert.equal(source.status,200)
  const missing=fixture();delete missing.dependencies.agentOpinionRepository;assert.equal((await missing.call(path,{direct:true})).status,404)
  const bare=fixture();delete bare.dependencies.authenticateRequest;assert.equal((await bare.call(path,{direct:true})).status,403);assert.equal(bare.calls.length,0)
  for(const options of [{cookie:false,headers:{'X-Rh-User-Id':id(1)}},{headers:{Authorization:'Bearer x'}},{headers:{Origin:'https://foreign.invalid'}},{headers:{'Sec-Fetch-Site':'same-site'}},{headers:{'Sec-Fetch-Site':'cross-site'}}])assert.ok([401,403].includes((await fixture().call(path,options)).status))
  const wrong=fixture();wrong.identity.issuer='https://foreign.invalid';assert.equal((await wrong.call()).status,403);assert.equal(wrong.calls.length,0)
})
test('strict collection query, no GET body and existing seven query bans reject before any repository call',async()=>{
  const f=fixture()
  for(const url of [base,path+'&owner='+id(1),path+'&purpose=evaluate',path+'&limit=01',path+'#fragment',origin+path,base+'/../agent-reviews'+path.slice(base.length)])assert.equal((await f.call(url)).status,400)
  for(const options of [{raw:'{}'},{headers:{'Content-Length':'2'}},{headers:{'Content-Length':'-1'}},{headers:{'Transfer-Encoding':'chunked'}}])assert.equal((await f.call(path,options)).status,400)
  assert.equal((await f.call(base+'/'+id(3)+'?limit=20')).status,400)
  assert.equal((await f.call(base+'/source?limit=20',{method:'POST',raw:'{}',headers:{'X-AgentStudio-Request':'1','Content-Type':'application/json'}})).status,400)
  assert.equal(f.calls.length,0)
  const before=agentReviewHistoryCursor({created_at:'2026-10-27T01:02:04.123456Z',request_id:id(4)})
  assert.equal((await f.call(path+'&limit=1&before='+before,{headers:{'Content-Length':'0'}})).status,200)
  assert.deepEqual(f.calls[0].query,{...target,limit:1,before})
})
test('HTTP revalidates closed history responses and hides SQL/audit details without an empty fallback',async()=>{
  const f=fixture()
  for(const patch of [{recorded:true},{available:true},{execution:{}},{limit:1},{items:[{...item(),result:{score:0}}]},{items:[{...item(),control:{job_state:'pending',body_erased:true}}]},{has_more:true},{next_cursor:'unsafe'},{spec_id:id(8)}]){
    f.hooks.list=(_identity,query)=>({protocol:'agent_paid_review_history_v1',...target,items:[item()],limit:query.limit,has_more:false,next_cursor:null,...patch})
    const r=await f.call();assert.equal(r.status,409);assert.deepEqual(r.body,{error:'agent_review_history_unavailable'})
  }
  for(const [error,status,code] of [[new HttpError(404,'agent_review_history_not_found'),404,'agent_review_history_not_found'],[new HttpError(409,'agent_review_history_unavailable'),409,'agent_review_history_unavailable'],[Error('unsafe_agent_opinion_privileges private SQL api_key=secret'),500,'internal_error']]){
    f.hooks.list=()=>{throw error};const r=await f.call();assert.equal(r.status,status);assert.deepEqual(r.body,{error:code})
  }
})
