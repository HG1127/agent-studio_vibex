// Real handler/auth/policy functions with synthetic streams and a deliberately
// mocked repository. No live Cookie session, HTTP server, SQL or effect proof.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {createHandler} from '../src/http.ts'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {NATIVE_SESSION_COOKIE} from '../src/native-employee-auth.mjs'
import {permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
const origin='https://native.example',owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',token='a'.repeat(43),body=()=>({purpose:'tool',request_id:id,target:{kind:'builtin',tool:'calculate'},arguments_json:'{"expression":"1+2"}',effect_consent:'APPROVE_ONE_OWNER_TOOL_TRIAL_EFFECT'})
function fixture(options={}){
 const calls=[],identity={issuer:'urn:agentstudio:local:v1',subject:owner},auth={login:async()=>{},getSessionProfile:async()=>{},revokeSession:async()=>{},provisionEmployee:async()=>{},verifySession:async supplied=>supplied===token?identity:null},native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,businessHandler:async()=>{}}),ctx={capabilities:{available:true,trials:true,registry:false,...options.capabilities},trials:{preview:async(actor,value)=>{calls.push({kind:'preview',actor,value});return {preview:true}},confirm:async(actor,request,hash)=>{calls.push({kind:'confirm',actor,request,hash});return {confirmed:false,receipt:null,worker_started_by_api:false}}},invocations:{stats:async actor=>{calls.push({kind:'stats',actor});return {scope:'owner_only'}}},registryRead:async()=>{calls.push({kind:'REGISTRY_NETWORK_MUST_NOT_RUN'});throw Error('no network in models')}}
 const handler=createHandler({repository:{},allowedOrigin:origin,verifyToken:async()=>{calls.push({kind:'OIDC_FALLBACK_MUST_NOT_RUN'});return identity},...(!options.legacy?{authenticateRequest:native.authenticateRequest}:{}),ownerToolHub:ctx})
 async function request(url,method='GET',value,headers={}){const data=value===undefined?null:Buffer.from(typeof value==='string'?value:JSON.stringify(value)),req=Readable.from(data?[data]:[]);req.url=url;req.method=method;req.headers={cookie:NATIVE_SESSION_COOKIE+'='+token,origin,'sec-fetch-site':'same-origin',...(method==='POST'?{'x-agentstudio-request':'1','content-type':'application/json','content-length':String(data?.length??0)}:{}),...headers};const res={status:0,headers:null,body:null,writeHead(status,h){this.status=status;this.headers=h},end(text){this.body=JSON.parse(text)}};await handler(req,res);return res}
 return {request,calls,identity}
}
test('actual Native handler ignores forged employee header and authenticates the original Cookie before owner tool dispatch',async()=>{
 const f=fixture(),good=await f.request('/api/v2/tool-hub/stats','GET',undefined,{'x-rh-user-id':'forged-other-owner'});assert.equal(good.status,200);assert.deepEqual(f.calls,[{kind:'stats',actor:f.identity}]);assert.equal(good.headers['Cache-Control'],'no-store')
 for(const headers of [{cookie:''},{authorization:'Bearer forged'},{origin:'https://other.example'},{'sec-fetch-site':'cross-site'}]){const before=f.calls.length,result=await f.request('/api/v2/tool-hub/stats','GET',undefined,headers);assert.ok([401,403].includes(result.status));assert.equal(f.calls.length,before)}
 const legacy=fixture({legacy:true});assert.equal((await legacy.request('/api/v2/tool-hub')).status,404);assert.equal(legacy.calls.length,0)
})
test('actual POST reader retains original Native CSRF checks and rejects forged source/owner/raw destination before repository dispatch',async()=>{
 const f=fixture();assert.equal((await f.request('/api/v2/tool-hub/trials/preview','POST',body())).status,200);assert.equal(f.calls[0].value.request_id,id)
 for(const [value,headers]of [[body(),{'x-agentstudio-request':undefined}],[{...body(),owner_user_id:owner},{}],[{...body(),target:{kind:'http',url:'https://private.example'}},{}],[body(),{'content-type':'text/plain'}],['{bad',{}],[body(),{'content-encoding':'gzip'}]]){const before=f.calls.length,result=await f.request('/api/v2/tool-hub/trials/preview','POST',value,headers);assert.ok([400,403,415].includes(result.status));assert.equal(f.calls.length,before)}
})
test('read-only original confirmation remains available when fresh writes are disabled and never contacts registry or resubmits',async()=>{
 const f=fixture({capabilities:{trials:false}}),result=await f.request('/api/v2/tool-hub/trials/'+id+'/confirm?request_sha256='+'a'.repeat(64));assert.equal(result.status,200);assert.equal(f.calls[0].kind,'confirm');assert.equal(f.calls[0].request,id);assert.equal(f.calls[0].hash,'a'.repeat(64));assert.equal((await f.request('/api/v2/tool-hub/trials/preview','POST',body())).status,405);assert.equal(f.calls.length,1)
 const policy={configurationWrites:false,workflowV2ExecutionUat:false};assert.equal(permitNativePg18BusinessUatRequest('/api/v2/tool-hub/trials/'+id+'/confirm','GET',policy),true);assert.equal(permitNativePg18BusinessUatRequest('/api/v2/tool-hub/trials','POST',policy),false)
})
test('closed route/query forms refuse encoded aliases, duplicate owner filters, fragments and GET bodies before any projection',async()=>{
 const f=fixture();for(const [path,headers]of [['/api/v2/tool-hub/stats?owner_user_id='+owner,{}],['/api/v2/tool-hub/trials/'+id+'/confirm?request_sha256=a&request_sha256=b',{}],['/api/v2/tool-hub/other/../stats',{}],['/api/v2/tool-hub/stats#private',{}],['/api/v2/tool-hub/stats',{'transfer-encoding':'chunked'}]]){const result=await f.request(path,'GET',undefined,headers);assert.equal(result.status,400);assert.equal(f.calls.length,0)}
})
test('public directory and paid explanation stay independently gated, with consent checked before any public-source read',async()=>{
 const f=fixture();assert.equal((await f.request('/api/v2/tool-hub/registry')).status,503);const translation={purpose:'registry_translation',request_id:id,target:{kind:'registry_translation',model_binding:{connection_id:id,connection_revision:1,model_id:'test-model'},entries:[{name:'io.github.test/example',version:'1.0',source_sha256:'a'.repeat(64)}]},effect_consent:'APPROVE_ONE_OWNER_TOOL_TRIAL_EFFECT',fee_consent:false};assert.equal((await f.request('/api/v2/tool-hub/trials/preview','POST',translation)).status,400);assert.equal(f.calls.length,0)
})
