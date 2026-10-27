// Pure IncomingMessage streams + real Native Cookie/origin wrapper. Repository
// doubles prove transport dispatch/projection only, not SQL/commit acceptance.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {createHandler} from '../src/http.ts'
import {HttpError,safeAgentSpec} from '../src/contracts.ts'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {NATIVE_SESSION_COOKIE} from '../src/native-employee-auth.mjs'
import {permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
import {agentGeneratedAcknowledgement,agentGeneratedCandidateHash,agentGeneratedChangedKeys,agentGeneratedFeedbackHash,agentGeneratedPreviewHash,agentGeneratedRequestHash,agentGeneratedReceiptHash} from '../src/agent-generated-acceptance-contract.ts'

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),hash=letter=>letter.repeat(64)
const base='/api/v2/agent-generated-acceptances',origin='https://studio.example.test',token='G'.repeat(43)
const unsafe={'Content-Type':'application/json','X-AgentStudio-Request':'1'}
function vectors({full=false}={}){
  const before={goal:'原目标😀',task_scope:'',deliverables:[],task_plan:[],done_criteria:[]}
  const after=full?{goal:'😀'.repeat(1500),task_scope:'界'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))}:
    {goal:'生成完整目标😀',task_scope:'描述边界',deliverables:['核对'],task_plan:['实施'],done_criteria:['留证']}
  const source={review_id:id(1),spec_id:id(2),target_run_id:id(3),review_request_sha256:hash('a'),input_sha256:hash('b'),content_sha256:hash('c'),result_sha256:hash('d'),completion_sha256:hash('e'),source_owner_epoch:5,source_protocol:'employee_statement_anchor_v1'}
  const refs=[{run_id:id(4),feedback_id:id(5),feedback_sha256:hash('f'),feedback_revision:7,feedback_source_sha256:hash('a'),statement_sha256:hash('b')}]
  const binding={source,feedback_sources:refs,feedback_sources_sha256:agentGeneratedFeedbackHash(refs),anchor:{run_id:id(4),feedback_id:id(5)},before:{revision:41,source_sha256:hash('6'),descriptive:before},
    candidate:{descriptive:after,candidate_sha256:agentGeneratedCandidateHash('Preserved synthetic name',safeAgentSpec({...after,tools:['calculate'],knowledge_base_ids:[],require_plan_review:true}))},changed_keys:agentGeneratedChangedKeys(before,after)}
  const preview={protocol:'agent_generated_preview_v1',...binding,preview_sha256:agentGeneratedPreviewHash(binding),recorded:false}
  const input={action:'preview',review_id:source.review_id,spec_id:source.spec_id,target_run_id:source.target_run_id}
  const original={action:'accept',request_id:id(99),...Object.fromEntries(Object.entries(input).filter(([key])=>key!=='action')),anchor_run_id:id(4),anchor_feedback_id:id(5),
    expected_preview_sha256:preview.preview_sha256,expected_result_sha256:source.result_sha256,expected_spec_revision:41,expected_spec_sha256:hash('6'),expected_candidate_sha256:binding.candidate.candidate_sha256,confirm:true,acceptance_acknowledgement:agentGeneratedAcknowledgement}
  const receipt=(replayed=false)=>{
    const core={protocol:'agent_generated_acceptance_receipt_v1',source_kind:'generated_opinion',request_id:original.request_id,request_sha256:agentGeneratedRequestHash(original),source,feedback_sources:refs,feedback_sources_sha256:binding.feedback_sources_sha256,anchor:binding.anchor,
      before:{revision:41,source_sha256:hash('6'),revision_id:id(6)},after:{revision:42,source_sha256:hash('7'),revision_id:id(7)},candidate_sha256:binding.candidate.candidate_sha256,changed_keys:binding.changed_keys,preview_sha256:preview.preview_sha256,
      acceptance_owner_epoch:5,created_at:'2026-10-27T09:00:00.000Z'}
    return {...core,receipt_sha256:agentGeneratedReceiptHash(core),recorded:true,replayed}
  }
  return {preview,input,original,receipt}
}
function fixture(options={}){
  const {installed=true,config=false,fresh=false,available=installed}=options,v=vectors(options),calls=[],hooks={},identity={issuer:'urn:agentstudio:local:v1',subject:'verified-native-employee'},state={commits:0,stored:false,oidcFallback:0}
  const policy={configurationWrites:config,employeeProvisioning:false,runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false,agentGeneratedAcceptanceUat:fresh}
  const repo={
    async preview(who,body){calls.push({method:'preview',identity:who,body});return hooks.preview?hooks.preview(who,body):v.preview},
    async accept(who,body){calls.push({method:'accept',identity:who,body});if(hooks.accept)return hooks.accept(who,body);if(state.stored)return v.receipt(true);if(!config||!fresh)throw new HttpError(403,'agent_generated_acceptance_disabled');state.stored=true;state.commits++;return v.receipt(false)},
    async confirm(who,body){calls.push({method:'confirm',identity:who,body});if(hooks.confirm)return hooks.confirm(who,body);if(!state.stored)throw new HttpError(404,'agent_generated_receipt_not_found');return v.receipt(true)},
    async receipt(who,review){calls.push({method:'receipt',identity:who,review});if(hooks.receipt)return hooks.receipt(who,review);if(!state.stored)throw new HttpError(404,'agent_generated_receipt_not_found');return v.receipt(true)}
  }
  const auth={async login(){throw Error('unused')},async provisionEmployee(){throw Error('unused')},async revokeSession(){},async verifySession(raw){return raw===token?identity:null},async getSessionProfile(raw){return raw===token?{id:id(90),email:'synthetic@example.test',display_name:'Synthetic employee',is_admin:false}:null}}
  let business
  const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:config,allowAgentGeneratedAcceptance:available,allowAgentGeneratedAcceptanceWrites:fresh,
    businessHandler(req,res){
      const path=new URL(req.url,'http://127.0.0.1').pathname
      if(!permitNativePg18BusinessUatRequest(path,req.method,policy)){res.writeHead(405,{});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return}
      return business(req,res)
    }})
  const deps={repository:{},allowedOrigin:origin,async verifyToken(){state.oidcFallback++;throw Error('must_not_use_oidc')},authenticateRequest:native.authenticateRequest,...(installed?{agentGeneratedAcceptanceRepository:repo}:{})}
  business=createHandler(deps)
  async function call(path,settings={}){
    const method=settings.method??'GET',chunks=settings.chunks??(settings.raw!==undefined?[Buffer.from(settings.raw)]:[])
    const req=Readable.from(chunks);Object.assign(req,{url:path,method,socket:{remoteAddress:'127.0.0.1'},headers:{origin,...(settings.cookie===false?{}:{cookie:NATIVE_SESSION_COOKIE+'='+token}),...Object.fromEntries(Object.entries(settings.headers??{}).map(([key,value])=>[key.toLowerCase(),value]))}})
    const res={status:0,headers:{},text:'',writeHead(status,headers){this.status=status;this.headers=headers},end(value){this.text+=value??''}}
    await(settings.direct?createHandler(deps):native.handler)(req,res)
    return {status:res.status,headers:res.headers,body:JSON.parse(res.text)}
  }
  const post=(action,body,settings={})=>call(base+'/'+action,{method:'POST',raw:JSON.stringify(body),...settings,headers:{...unsafe,...settings.headers}})
  return {v,calls,hooks,identity,state,deps,call,post}
}

test('four real handlers use strict root DTOs and verified Cookie identity, with independent readonly preview',async()=>{
  const f=fixture({full:true})
  const preview=await f.post('preview',f.v.input)
  assert.equal(preview.status,200);assert.equal(Object.keys(preview.body).length,10);assert.deepEqual(preview.body,f.v.preview);assert.ok(JSON.stringify(preview.body).length>23000)
  assert.equal(f.calls[0].identity,f.identity);assert.deepEqual(f.calls[0].body,f.v.input);assert.equal(f.state.commits,0)
  for(const [key,value] of Object.entries({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}))assert.equal(preview.headers[key],value)
  assert.equal((await f.post('accept',f.v.original)).status,403)
  assert.equal((await f.post('confirm',f.v.original)).status,404)
  assert.equal((await f.call(base+'/reviews/'+id(1))).status,404);assert.equal(f.state.oidcFallback,0)
})

test('exact accept replay, confirm and known receipt remain reachable with config/fresh closed; no outer fresh check',async()=>{
  const f=fixture();f.state.stored=true
  for(const [method,path,body] of [['POST','accept',f.v.original],['POST','confirm',f.v.original],['GET','reviews/'+id(1)]]){
    const reply=method==='POST'?await f.post(path,body):await f.call(base+'/'+path)
    assert.equal(reply.status,200);assert.deepEqual(reply.body,f.v.receipt(true));assert.equal(Object.keys(reply.body).length,18)
  }
  assert.deepEqual(f.calls.map(v=>v.method),['accept','confirm','receipt']);assert.equal(f.state.commits,0)
  assert.deepEqual(f.calls[0].body,f.v.original);assert.deepEqual(f.calls[1].body,f.v.original)
})

test('fresh config mutation and generated opt-in both needed; no feature inherits old fee/model permissions',async()=>{
  for(const [config,fresh,status] of [[false,false,403],[true,false,403],[false,true,403],[true,true,200]]){
    const f=fixture({config,fresh}),reply=await f.post('accept',f.v.original)
    assert.equal(reply.status,status);assert.equal(f.state.commits,status===200?1:0)
  }
})

test('missing schema mount returns404 for all four routes and omits capabilities',async()=>{
  const f=fixture({installed:false})
  for(const action of ['preview','accept','confirm'])assert.equal((await f.post(action,action==='preview'?f.v.input:f.v.original)).status,404)
  assert.equal((await f.call(base+'/reviews/'+id(1))).status,404);assert.equal(f.calls.length,0)
  const caps=(await f.call('/api/native-auth/capabilities')).body
  assert.equal(caps.agent_generated_acceptance_available,undefined);assert.equal(caps.agent_generated_acceptance_enabled,undefined)
})

test('Native capability distinguishes schema availability and independent fresh/config permission',async()=>{
  for(const [available,config,fresh,enabled] of [[true,false,false,false],[true,true,false,false],[true,false,true,false],[true,true,true,true],[false,true,true,undefined]]){
    const f=fixture({available,config,fresh}),caps=(await f.call('/api/native-auth/capabilities')).body
    assert.equal(caps.agent_generated_acceptance_available,available?true:undefined);assert.equal(caps.agent_generated_acceptance_enabled,enabled)
    assert.equal(caps.agent_review_submission_enabled,undefined)
  }
})

test('Cookie-only authentication and actual Native issuer never fall back to Bearer/X-Rh/OIDC',async()=>{
  for(const settings of [{cookie:false,headers:{'X-Rh-User-Id':id(90)}},{headers:{Authorization:'Bearer fake'}},{headers:{Cookie:NATIVE_SESSION_COOKIE+'='+token+'; '+NATIVE_SESSION_COOKIE+'='+token}}]){
    const f=fixture(),reply=await f.post('preview',f.v.input,settings);assert.equal(reply.status,401);assert.equal(f.calls.length,0);assert.equal(f.state.oidcFallback,0)
  }
  const bare=fixture();delete bare.deps.authenticateRequest
  assert.equal((await bare.post('preview',bare.v.input,{direct:true})).status,403);assert.equal(bare.state.oidcFallback,0)
  const oidc=fixture();oidc.identity.issuer='https://foreign.example.test'
  assert.equal((await oidc.post('preview',oidc.v.input)).status,403);assert.equal(oidc.calls.length,0)
})

test('unsafePOST Origin/custom CSRF and fetch-site guards apply equally to readonly preview/confirm',async()=>{
  for(const action of ['preview','accept','confirm'])for(const headers of [{Origin:undefined},{Origin:'https://foreign.example.test'},{'X-AgentStudio-Request':undefined},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'}]){
    const f=fixture(),reply=await f.post(action,action==='preview'?f.v.input:f.v.original,{headers})
    assert.equal(reply.status,403);assert.equal(f.calls.length,0)
  }
})

test('canonical query-free paths, lowercase IDs and methods reject before repository dispatch',async()=>{
  for(const path of [base+'/preview?q=1',base+'/preview#part',origin+base+'/preview',base+'/../agent-generated-acceptances/preview',base+'/%70review',base+'/preview/']){
    const f=fixture(),reply=await f.call(path,{direct:true,method:'POST',raw:JSON.stringify(f.v.input),headers:unsafe});assert.ok(reply.status>=400&&reply.status<500,path);assert.equal(f.calls.length,0)
  }
  const f=fixture();assert.equal((await f.call(base+'/reviews/ABCDEF00-0000-4000-8000-000000000001',{direct:true})).status,400)
  for(const method of ['GET','PATCH','DELETE','HEAD','OPTIONS'])assert.equal((await f.call(base+'/preview',{direct:true,method,headers:unsafe})).status,405)
  assert.equal((await f.call(base+'/reviews/'+id(1),{direct:true,method:'POST',raw:'{}',headers:unsafe})).status,405);assert.equal(f.calls.length,0)
})

test('POST validates exact4/14 inputs without caller hashes, execution/config/fee overrides or action reconstruction',async()=>{
  const f=fixture()
  for(const patch of [{owner_user_id:id(90)},{request_sha256:hash('a')},{spec:{}},{result:{}},{fee_acknowledgement:'paid'},{action:'confirm'},{confirm:false}])
    assert.equal((await f.post('accept',{...f.v.original,...patch})).status,400)
  for(const patch of [{action:'accept'},{run_id:id(3)},{target_run_id:'bad'},{owner_user_id:id(90)}])assert.equal((await f.post('preview',{...f.v.input,...patch})).status,400)
  assert.equal(f.calls.length,0)
})

test('strict stream reader refuses BOM/invalidUTF8/badJSON/nonobject/body overflow and GET payloads',async()=>{
  const f=fixture(),json=Buffer.from(JSON.stringify(f.v.input))
  for(const chunks of [[Buffer.from([0xef,0xbb,0xbf]),json],[Buffer.from([0xff])],[Buffer.from('[')],[Buffer.from('null')],[Buffer.from('[]')]])
    assert.equal((await f.call(base+'/preview',{method:'POST',headers:unsafe,chunks})).status,400)
  assert.equal((await f.call(base+'/preview',{method:'POST',headers:unsafe,chunks:[Buffer.alloc(5000,32),Buffer.alloc(4000,32)]})).status,413)
  assert.equal((await f.post('preview',f.v.input,{headers:{'Content-Type':'text/plain'}})).status,415)
  assert.equal((await f.post('preview',f.v.input,{headers:{'Content-Length':'8193'}})).status,413)
  for(const settings of [{raw:'{}'},{headers:{'Content-Length':'2'}},{headers:{'Transfer-Encoding':'chunked'}}])assert.equal((await f.call(base+'/reviews/'+id(1),settings)).status,400)
  assert.equal(f.calls.length,0)
})

test('malformed fulfilled response is5xx even after simulated commit, never a definitive fresh rejection',async()=>{
  const f=fixture({config:true,fresh:true})
  f.hooks.accept=()=>{f.state.commits++;return {...f.v.receipt(false),private_body:'forbidden'}}
  const reply=await f.post('accept',f.v.original)
  assert.equal(f.state.commits,1);assert.equal(reply.status,500);assert.deepEqual(reply.body,{error:'internal_error'})
  f.hooks.preview=()=>({...f.v.preview,source:{...f.v.preview.source,spec_id:id(77)}})
  assert.equal((await f.post('preview',f.v.input)).status,500)
})

test('confirm/GET demand genuine replayed exact original/known review and independently verify visible receipt intent hash',async()=>{
  const f=fixture();f.state.stored=true
  f.hooks.confirm=()=>f.v.receipt(false);assert.equal((await f.post('confirm',f.v.original)).status,500)
  f.hooks.receipt=()=>f.v.receipt(false);assert.equal((await f.call(base+'/reviews/'+id(1))).status,500)
  delete f.hooks.receipt;assert.equal((await f.call(base+'/reviews/'+id(8))).status,500)
  const malformed=f.v.receipt(true);malformed.request_sha256=hash('0');const {receipt_sha256,recorded,replayed,...core}=malformed;malformed.receipt_sha256=agentGeneratedReceiptHash(core)
  f.hooks.receipt=()=>malformed;assert.equal((await f.call(base+'/reviews/'+id(1))).status,500)
  f.hooks.confirm=()=>f.v.receipt(true);assert.equal((await f.post('confirm',{...f.v.original,expected_candidate_sha256:hash('0')})).status,500)
})

test('repository rejections retain exact statuses while audit/SQL details stay hidden and no envelope is fabricated',async()=>{
  const f=fixture()
  for(const [error,status,body] of [[new HttpError(409,'agent_generated_request_conflict'),409,{error:'agent_generated_request_conflict'}],[new HttpError(404,'agent_generated_receipt_not_found'),404,{error:'agent_generated_receipt_not_found'}],[Error('unsafe_agent_generated_privileges private SQL api_key=secret'),500,{error:'internal_error'}]]){
    f.hooks.confirm=()=>{throw error};const reply=await f.post('confirm',f.v.original);assert.equal(reply.status,status);assert.deepEqual(reply.body,body)
  }
})
