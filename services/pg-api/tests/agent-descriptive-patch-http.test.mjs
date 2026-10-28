// Pure transport tests: REAL Native authentication wrapper and IncomingMessage
// streams without listening/connecting sockets. Auth store/repository doubles
// prove dispatch/privacy only, NOT SQL, authenticated DB identity or COMMIT.
import test from 'node:test'
import assert from 'node:assert/strict'
import {IncomingMessage} from 'node:http'
import {Socket} from 'node:net'
import {HttpError,safeAgentSpec} from '../src/contracts.ts'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {NATIVE_SESSION_COOKIE} from '../src/native-employee-auth.mjs'
import {createAgentDescriptivePatchHttpHandler,agentDescriptivePatchHttpBase as base} from '../src/agent-descriptive-patch-http.ts'
import {deriveAgentDescriptivePatchCandidate,agentDescriptivePatchKeys as D,agentDescriptivePatchAcknowledgement,
  agentDescriptivePatchFeedbackHash,agentDescriptivePatchPreviewHash,agentDescriptivePatchRequestHash,agentDescriptivePatchReceiptHash,
  freezeAgentDescriptivePatchOriginal} from '../src/agent-descriptive-patch-contract.ts'

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),H=c=>c.repeat(64),clone=v=>structuredClone(v)
const origin='https://studio.example.test',token='P'.repeat(43),unsafe={'Content-Type':'application/json','X-AgentStudio-Request':'1'}
const omitPublic=p=>{const {protocol,preview_sha256,recorded,...binding}=clone(p);return binding}
function vectors({full=false}={}){
  const spec=safeAgentSpec({goal:'原目标😀',task_scope:'继承范围',deliverables:['旧交付'],task_plan:[],done_criteria:['原验收'],tools:['calculate'],knowledge_base_ids:[],model_binding:{connection_id:id(40),connection_revision:7,model_id:'synthetic'},require_plan_review:true})
  const descriptive=full?{goal:'😀'.repeat(1500),task_scope:'界'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))}:{goal:'实际部分生成目标😀',deliverables:[]}
  const derived=deriveAgentDescriptivePatchCandidate('Preserved synthetic name',spec,{descriptive,tools_note:'PRIVATE_TOOLS_NOTE',rationale:'PRIVATE_RATIONALE'})
  const pick=value=>Object.fromEntries(D.map(k=>[k,clone(value[k])]))
  const source={purpose:'optimize',review_id:id(1),spec_id:id(2),target_run_id:id(3),review_request_sha256:H('a'),input_sha256:H('b'),content_sha256:H('c'),result_sha256:H('d'),completion_sha256:H('e'),source_owner_epoch:5,source_protocol:'employee_statement_anchor_v1'}
  const refs=[{run_id:id(4),feedback_id:id(5),feedback_sha256:H('f'),feedback_revision:7,feedback_source_sha256:H('a'),statement_sha256:H('b')}]
  const binding={source_kind:'feedback_generated_descriptive_patch',mode:'provided_fields',source,feedback_sources:refs,feedback_sources_sha256:agentDescriptivePatchFeedbackHash(refs),anchor:{run_id:id(4),feedback_id:id(5)},before:{revision:41,source_sha256:H('6'),descriptive:pick(spec)},model_patch:derived.model_patch,candidate:{descriptive:pick(derived.spec),candidate_sha256:derived.candidate_sha256},changed_keys:derived.changed_keys}
  const preview={protocol:'agent_descriptive_patch_preview_v1',...binding,preview_sha256:agentDescriptivePatchPreviewHash(binding),recorded:false}
  const input={action:'preview',review_id:id(1),spec_id:id(2),target_run_id:id(3)}
  const original=freezeAgentDescriptivePatchOriginal({action:'accept',request_id:id(99),review_id:id(1),spec_id:id(2),target_run_id:id(3),anchor_run_id:id(4),anchor_feedback_id:id(5),expected_preview_sha256:preview.preview_sha256,expected_result_sha256:source.result_sha256,expected_patch_sha256:derived.model_patch.patch_sha256,expected_spec_revision:41,expected_spec_sha256:H('6'),expected_candidate_sha256:derived.candidate_sha256,confirm:true,acceptance_acknowledgement:agentDescriptivePatchAcknowledgement})
  const core={protocol:'agent_descriptive_patch_receipt_v1',source_kind:binding.source_kind,mode:binding.mode,request_id:original.request_id,request_sha256:agentDescriptivePatchRequestHash(original),source,feedback_sources:refs,feedback_sources_sha256:binding.feedback_sources_sha256,anchor:binding.anchor,before:{revision:41,source_sha256:H('6'),revision_id:id(6)},after:{revision:42,source_sha256:H('7'),revision_id:id(7)},provided_keys:clone(derived.model_patch.provided_keys),patch_sha256:derived.model_patch.patch_sha256,candidate_sha256:derived.candidate_sha256,changed_keys:derived.changed_keys,preview_sha256:preview.preview_sha256,acceptance_owner_epoch:5,created_at:'2026-10-28T00:00:00.000Z'}
  const receipt=(replayed=false)=>({...clone(core),receipt_sha256:agentDescriptivePatchReceiptHash(core),recorded:true,replayed})
  return {preview,input,original,receipt,core}
}
function fixture(options={}){
  const v=vectors(options),calls=[],hooks={},identity={issuer:'urn:agentstudio:local:v1',subject:'synthetic-verified-native'},state={stored:false,simulatedMutations:0,authCalls:0,fallbackCalls:0,oidcCalls:0}
  const repo={
    async preview(who,body){calls.push({method:'preview',identity:who,body});return hooks.preview?hooks.preview(who,body):v.preview},
    async accept(who,body){calls.push({method:'accept',identity:who,body});if(hooks.accept)return hooks.accept(who,body);if(state.stored)return v.receipt(true);if(!options.config||!options.fresh)throw new HttpError(403,'agent_descriptive_patch_acceptance_disabled');state.stored=true;state.simulatedMutations++;return v.receipt(false)},
    async confirm(who,body){calls.push({method:'confirm',identity:who,body});if(hooks.confirm)return hooks.confirm(who,body);if(!state.stored)throw new HttpError(404,'agent_descriptive_patch_receipt_not_found');return v.receipt(true)},
    async receipt(who,review){calls.push({method:'receipt',identity:who,review});if(hooks.receipt)return hooks.receipt(who,review);if(!state.stored)throw new HttpError(404,'agent_descriptive_patch_receipt_not_found');return v.receipt(true)}
  }
  const auth={async login(){throw Error('unused')},async provisionEmployee(){throw Error('unused')},async revokeSession(){},async getSessionProfile(){return null},async verifySession(raw){state.authCalls++;if(hooks.auth)return hooks.auth(raw);return raw===token?identity:null}}
  let adapter
  const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:options.config===true,businessHandler:async(req,res)=>{
    if(await adapter(req,res))return
    state.fallbackCalls++;res.writeHead(404,{});res.end(JSON.stringify({error:'fixture_fallback'}))
  }})
  const deps={repository:repo,authenticateRequest:native.authenticateRequest,allowedOrigin:origin,verifyToken(){state.oidcCalls++;throw Error('must_not_use_oidc')}}
  adapter=createAgentDescriptivePatchHttpHandler(deps)
  async function call(path,settings={}){
    const socket=new Socket(),req=new IncomingMessage(socket)
    req.on('error',()=>{});socket.on('error',()=>{})
    req.method=settings.method??'GET';req.url=path;req.complete=true
    req.headers={origin,...(settings.cookie===false?{}:{cookie:NATIVE_SESSION_COOKIE+'='+token}),...Object.fromEntries(Object.entries(settings.headers??{}).map(([k,v])=>[k.toLowerCase(),v]))}
    const chunks=settings.chunks??(settings.raw!==undefined?[Buffer.from(settings.raw)]:[])
    for(const bytes of chunks)req.push(bytes);req.push(null)
    let iteratorCalls=0;const iterate=req[Symbol.asyncIterator].bind(req)
    req[Symbol.asyncIterator]=()=>{iteratorCalls++;if(settings.forbidRead)throw Error('unsupported_route_must_not_read_body');return iterate()}
    const res={status:0,headers:{},text:'',writeHead(status,headers){this.status=status;this.headers=headers},end(value){this.text+=value??''}}
    try{
      const handled=await(settings.direct?adapter(req,res):native.handler(req,res))
      return {status:res.status,headers:res.headers,body:res.text?JSON.parse(res.text):undefined,handled,iteratorCalls,actualIncomingMessage:req instanceof IncomingMessage}
    }finally{req.destroy();socket.destroy()}
  }
  const post=(action,body,settings={})=>call(base+'/'+action,{method:'POST',raw:JSON.stringify(body),...settings,headers:{...unsafe,...settings.headers}})
  return {v,repo,deps,hooks,calls,identity,state,call,post}
}
const noStore=reply=>{
  for(const [key,value] of Object.entries({'Cache-Control':'no-store',Pragma:'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}))assert.equal(reply.headers[key],value)
}

test('four unmounted handlers use actual Native closure/IncomingMessage streams and exact independent DTO projections',async()=>{
  const f=fixture({full:true}),p=await f.post('preview',f.v.input)
  assert.equal(p.actualIncomingMessage,true);assert.equal(p.status,200);assert.equal(Object.keys(p.body).length,13);assert.deepEqual(p.body,f.v.preview);assert.ok(Buffer.byteLength(JSON.stringify(p.body))>100000);noStore(p)
  assert.strictEqual(f.calls[0].identity,f.identity);assert.deepEqual(f.calls[0].body,f.v.input);assert.equal(f.state.simulatedMutations,0)
  assert.equal((await f.post('accept',f.v.original)).status,403);assert.equal((await f.post('confirm',f.v.original)).status,404);assert.equal((await f.call(base+'/reviews/'+id(1))).status,404)
  assert.deepEqual(f.calls.map(c=>c.method),['preview','accept','confirm','receipt']);assert.equal(f.state.oidcCalls,0)
})

test('accept forwards all15 original fields to repo with fresh/config off so original recovery remains reachable',async()=>{
  const f=fixture();f.state.stored=true
  for(const action of ['accept','confirm']){const r=await f.post(action,f.v.original);assert.equal(r.status,200);assert.deepEqual(r.body,f.v.receipt(true));assert.equal(Object.keys(r.body).length,21);noStore(r)}
  const r=await f.call(base+'/reviews/'+id(1));assert.equal(r.status,200);assert.deepEqual(r.body,f.v.receipt(true));noStore(r)
  assert.deepEqual(f.calls.map(c=>c.method),['accept','confirm','receipt']);assert.deepEqual(f.calls[0].body,f.v.original);assert.equal(Object.keys(f.calls[0].body).length,15)
  assert.equal(f.calls[0].body.expected_patch_sha256,f.v.original.expected_patch_sha256);assert.equal(Object.isFrozen(f.calls[0].body),true);assert.equal(f.state.simulatedMutations,0)
})

test('transport has no fresh/config gate or fee/provider permission; only the repository double decides fresh status',async()=>{
  for(const [config,fresh,status] of [[false,false,403],[true,false,403],[false,true,403],[true,true,200]]){
    const f=fixture({config,fresh}),r=await f.post('accept',f.v.original)
    assert.equal(r.status,status);assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'accept');assert.deepEqual(f.calls[0].body,f.v.original)
    assert.equal(f.state.simulatedMutations,status===200?1:0);assert.equal(f.state.oidcCalls,0);noStore(r)
  }
})

test('Native Cookie-only identity rejects Bearer, forwarded owner header, malformed/duplicate cookies and foreign issuer',async()=>{
  for(const settings of [{cookie:false},{headers:{Authorization:'Bearer PRIVATE_TOKEN'}},{headers:{'X-Rh-User-Id':id(90)}},{headers:{Cookie:NATIVE_SESSION_COOKIE+'=bad'}},{headers:{Cookie:NATIVE_SESSION_COOKIE+'='+token+'; '+NATIVE_SESSION_COOKIE+'='+token}},{headers:{Cookie:['a','b']}}]){
    const f=fixture(),r=await f.post('preview',f.v.input,settings);assert.ok(r.status===401||r.status===403);assert.equal(f.calls.length,0);assert.equal(f.state.oidcCalls,0);noStore(r)
  }
  for(const bad of [{issuer:'https://foreign.example.test',subject:'external'}, {issuer:'urn:agentstudio:local:v1',subject:''}, {}]){
    const f=fixture();f.hooks.auth=()=>bad;const r=await f.post('preview',f.v.input);assert.equal(r.status,403);assert.equal(f.calls.length,0)
  }
})

test('real unsafe Native Origin/custom header/fetch-site rules cover allPOSTs, including preview and confirm',async()=>{
  for(const action of ['preview','accept','confirm'])for(const bad of [{Origin:undefined},{Origin:'https://foreign.example.test'},{Origin:['https://studio.example.test']},{'X-AgentStudio-Request':undefined},{'X-AgentStudio-Request':['1']},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'}]){
    const f=fixture(),r=await f.post(action,action==='preview'?f.v.input:f.v.original,{headers:bad});assert.equal(r.status,403);assert.equal(f.calls.length,0);noStore(r)
  }
  for(const headers of [{Origin:'https://foreign.example.test'},{'Sec-Fetch-Site':'same-site'}]){const f=fixture();f.state.stored=true;assert.equal((await f.call(base+'/reviews/'+id(1),{headers})).status,403);assert.equal(f.calls.length,0)}
  const f=fixture();f.state.stored=true;assert.equal((await f.call(base+'/reviews/'+id(1),{headers:{Origin:undefined}})).status,200)
})

test('dependencies are explicitly Native-only and unrelated families return false without body/auth/repo IO',async()=>{
  const f=fixture()
  for(const patch of [{repository:undefined},{repository:{preview(){}}},{authenticateRequest:undefined},{allowedOrigin:'https://studio.example.test/'},{allowedOrigin:'http://outside.example.test'}])assert.throws(()=>createAgentDescriptivePatchHttpHandler({...f.deps,...patch}),/invalid_agent_descriptive_patch_http_dependencies/)
  for(const path of ['/api/v2/agent-generated-acceptances/preview','/api/v2/agent-reviews','/healthz','/api/v2/agent-descriptive-patches-other']){
    const r=await f.call(path,{direct:true,cookie:false,forbidRead:true});assert.equal(r.handled,false);assert.equal(r.status,0);assert.equal(r.iteratorCalls,0)
  }
  assert.equal(f.calls.length,0);assert.equal(f.state.authCalls,0);assert.equal(f.state.oidcCalls,0)
})

test('canonical route family rejects query/fragment/absolute/encoded/dot/trailing aliases and uppercase review IDs',async()=>{
  const f=fixture()
  for(const path of [base,base+'/unknown',base+'/preview?q=1',base+'/preview#part',origin+base+'/preview',base+'/../agent-descriptive-patches/preview',base+'/%70review',base+'/preview/',base.replace('agent-','%61gent-')+'/preview']){
    const r=await f.call(path,{direct:true,method:'POST',raw:JSON.stringify(f.v.input),headers:unsafe});assert.equal(r.handled,true,path);assert.equal(r.status,400,path)
  }
  const r=await f.call(base+'/reviews/ABCDEF00-0000-4000-8000-000000000001',{direct:true});assert.equal(r.status,400);assert.equal(f.calls.length,0)
})

test('unsupported methods send405/Allow without reading streams, verifying session or calling a repository',async()=>{
  const f=fixture()
  for(const method of ['GET','HEAD','OPTIONS','PUT','PATCH','DELETE']){
    const r=await f.call(base+'/preview',{method,headers:unsafe,raw:'{}',forbidRead:true});assert.equal(r.status,405);assert.equal(r.headers.Allow,'POST');assert.equal(r.iteratorCalls,0);noStore(r)
  }
  for(const method of ['POST','HEAD','OPTIONS','PUT','DELETE']){const r=await f.call(base+'/reviews/'+id(1),{method,headers:unsafe,raw:'{}',forbidRead:true});assert.equal(r.status,405);assert.equal(r.headers.Allow,'GET');assert.equal(r.iteratorCalls,0)}
  assert.equal(f.calls.length,0);assert.equal(f.state.authCalls,0)
})

test('exact4/15 bodies never reconstruct consent or admit caller owner/identity/output/selected/human/prior/config fields',async()=>{
  const f=fixture()
  for(const patch of [{owner_user_id:id(90)},{identity:f.identity},{request_sha256:H('a')},{result:{}},{descriptive:{}},{spec:{}},{selected_keys:['goal']},{human_patch:{goal:'edited'}},{evaluation_sources:[]},{allowAcceptance:true},{fee_acknowledgement:'paid'},{action:'confirm'},{confirm:false}])assert.equal((await f.post('accept',{...f.v.original,...patch})).status,400)
  for(const patch of [{action:'accept'},{owner_user_id:id(90)},{identity:f.identity},{run_id:id(3)},{target_run_id:'bad'}])assert.equal((await f.post('preview',{...f.v.input,...patch})).status,400)
  const {expected_patch_sha256,...old}=f.v.original;assert.equal((await f.post('accept',{...old,acceptance_acknowledgement:'APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1'})).status,400)
  assert.equal((await f.post('confirm',{...f.v.original,action:'confirm'})).status,400);assert.equal(f.calls.length,0)
})

test('strict byte streams refuse invalid UTF8/BOM/JSON/root/type/length and transfer ambiguities before repo',async()=>{
  const f=fixture(),json=Buffer.from(JSON.stringify(f.v.input))
  for(const chunks of [[Buffer.from([0xef,0xbb,0xbf]),json],[Buffer.from([0xff])],[Buffer.from('{')],[Buffer.from('null')],[Buffer.from('[]')]])assert.equal((await f.call(base+'/preview',{method:'POST',headers:unsafe,chunks})).status,400)
  for(const headers of [{'Content-Length':'-1'},{'Content-Length':'01'},{'Content-Length':['10','10']},{'Content-Length':'0'},{'Content-Length':String(json.length+1)},{'Transfer-Encoding':'gzip'},{'Transfer-Encoding':['chunked']},{'Content-Length':String(json.length),'Transfer-Encoding':'chunked'}])assert.equal((await f.post('preview',f.v.input,{headers})).status,400)
  assert.equal((await f.post('preview',f.v.input,{headers:{'Content-Type':'text/plain'}})).status,415)
  assert.equal((await f.post('preview',f.v.input,{headers:{'Content-Length':'8193'}})).status,413)
  assert.equal((await f.call(base+'/preview',{method:'POST',headers:unsafe,chunks:[Buffer.alloc(4096,32),Buffer.alloc(4097,32)]})).status,413)
  assert.equal(f.calls.length,0)
})

test('8192-byte boundary and chunked UTF8 requests preserve the exact accepted root without truncation',async()=>{
  const f=fixture(),raw=JSON.stringify(f.v.input),padded=raw+' '.repeat(8192-Buffer.byteLength(raw))
  const a=await f.call(base+'/preview',{method:'POST',raw:padded,headers:{...unsafe,'Content-Length':'8192'}});assert.equal(a.status,200);assert.deepEqual(f.calls[0].body,f.v.input)
  const bytes=Buffer.from(raw),b=await f.call(base+'/preview',{method:'POST',chunks:[bytes.subarray(0,13),bytes.subarray(13,51),bytes.subarray(51)],headers:{...unsafe,'Transfer-Encoding':'chunked'}})
  assert.equal(b.status,200);assert.deepEqual(f.calls[1].body,f.v.input)
})

test('GET receipt requires truly empty body and no transfer encoding or nonzero/ambiguous content length',async()=>{
  const f=fixture();f.state.stored=true
  for(const settings of [{raw:'{}'},{headers:{'Content-Length':'2'}},{headers:{'Content-Length':'00'}},{headers:{'Content-Length':['0']}},{headers:{'Transfer-Encoding':'chunked'}}])assert.equal((await f.call(base+'/reviews/'+id(1),settings)).status,400)
  assert.equal(f.calls.length,0);const r=await f.call(base+'/reviews/'+id(1),{headers:{'Content-Length':'0'}});assert.equal(r.status,200);noStore(r)
})

test('fulfilled malformed output is500 even after simulated mutation, never a definitive400/409 write rejection',async()=>{
  const f=fixture({config:true,fresh:true});f.hooks.accept=()=>{f.state.simulatedMutations++;return {...f.v.receipt(false),private_body:'PRIVATE_SQL_SECRET'}}
  const r=await f.post('accept',f.v.original);assert.equal(r.status,500);assert.deepEqual(r.body,{error:'internal_error'});assert.equal(f.state.simulatedMutations,1);noStore(r)
  const p=clone(f.v.preview);p.source.spec_id=id(77);p.preview_sha256=agentDescriptivePatchPreviewHash(omitPublic(p));f.hooks.preview=()=>p
  assert.equal((await f.post('preview',f.v.input)).status,500)
  f.hooks.preview=()=>({...f.v.preview,private_messages:['PRIVATE']});assert.equal((await f.post('preview',f.v.input)).status,500)
})

test('confirm/GET require replay, original/known review scope and visible exact15 request-hash consistency',async()=>{
  const f=fixture();f.state.stored=true
  f.hooks.confirm=()=>f.v.receipt(false);assert.equal((await f.post('confirm',f.v.original)).status,500)
  f.hooks.receipt=()=>f.v.receipt(false);assert.equal((await f.call(base+'/reviews/'+id(1))).status,500)
  delete f.hooks.receipt;assert.equal((await f.call(base+'/reviews/'+id(8))).status,500)
  const core=clone(f.v.core);core.request_sha256=H('0');f.hooks.receipt=()=>({...core,receipt_sha256:agentDescriptivePatchReceiptHash(core),recorded:true,replayed:true})
  assert.equal((await f.call(base+'/reviews/'+id(1))).status,500)
  f.hooks.confirm=()=>f.v.receipt(true);assert.equal((await f.post('confirm',{...f.v.original,expected_patch_sha256:H('0')})).status,500)
})

test('unsafe fulfilled descriptors are refused without invoking getters or serializing private output',async()=>{
  const f=fixture();let reads=0;const bad=f.v.receipt(true)
  Object.defineProperty(bad,'provided_keys',{enumerable:true,get(){reads++;throw Error('PRIVATE getter')}})
  f.hooks.confirm=()=>bad;const r=await f.post('confirm',f.v.original);assert.equal(r.status,500);assert.deepEqual(r.body,{error:'internal_error'});assert.equal(reads,0)
  f.hooks.preview=()=>({...f.v.preview,[Symbol('private')]:true});assert.equal((await f.post('preview',f.v.input)).status,500)
})

test('error whitelist retains only approved fixed status/code while SQL/auth/schema/private details disappear',async()=>{
  const f=fixture(),known=new HttpError(409,'agent_descriptive_patch_request_conflict');known.message='PRIVATE SQL parameters api_key=must_not_escape'
  for(const [error,status,code] of [[known,409,'agent_descriptive_patch_request_conflict'],[new HttpError(404,'agent_descriptive_patch_receipt_not_found'),404,'agent_descriptive_patch_receipt_not_found'],[new HttpError(409,'PRIVATE_SQL_DETAIL'),500,'internal_error'],[new HttpError(400,'agent_descriptive_patch_request_conflict'),500,'internal_error'],[Error('unsafe_agent_descriptive_patch_privileges PRIVATE SQL'),500,'internal_error'],[{status:409,code:'agent_descriptive_patch_request_conflict',detail:'PRIVATE'},500,'internal_error']]){
    f.hooks.confirm=()=>{throw error};const r=await f.post('confirm',f.v.original);assert.equal(r.status,status);assert.deepEqual(r.body,{error:code});noStore(r)
  }
  f.hooks.auth=()=>{throw Error('PRIVATE authentication DB details')};const r=await f.post('preview',f.v.input);assert.equal(r.status,500);assert.deepEqual(r.body,{error:'internal_error'});assert.equal(f.state.oidcCalls,0)
})
