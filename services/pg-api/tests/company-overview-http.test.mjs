// In-memory real Native Cookie closure and HTTP streams. No database, network or browser.
import test from 'node:test'
import assert from 'node:assert/strict'
import {IncomingMessage} from 'node:http'
import {Socket} from 'node:net'
import {HttpError} from '../src/contracts.ts'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {NATIVE_SESSION_COOKIE} from '../src/native-employee-auth.mjs'
import {createCompanyOverviewHttpHandler,createNativeCompanyOverviewBusinessHandler} from '../src/company-overview-http.ts'
import {createNativeOwnOperationsBusinessHandler} from '../src/own-operations-http.ts'

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),origin='https://studio.example.test',token='C'.repeat(43)
const counts={agent_running:7,workflow_running:2,pending_approvals:3,human_input:4,failed_7d:5,overdue_schedules:6,knowledge_bases:8}
const overview=()=>({protocol:'native_company_overview_v1',scope:'company_metadata_only',as_of:'2026-10-28T01:02:03.123Z',window_days:7,
  totals:{employees:205,active:203,...counts},worker:{availability:'unavailable',reason:'telemetry_not_installed'}})
const page=q=>({protocol:'native_company_employee_stats_v1',scope:'company_metadata_only',as_of:'2026-10-28T01:02:03.123Z',limit:q.limit,
  items:[{employee_id:id(3),display_name:'停用员工',enabled:false,status:'disabled',is_admin:false,...counts}],has_more:false,next_after:null})
function fixture(options={}){
  const calls=[],hooks={},identity={issuer:'urn:agentstudio:local:v1',subject:'verified-native'},state={auth:0,fallback:0}
  const repository={async overview(who){calls.push(['overview',who]);return hooks.overview?hooks.overview(who):overview()},
    async employees(who,q){calls.push(['employees',who,q]);return hooks.employees?hooks.employees(who,q):page(q)}}
  const auth={async login(){throw Error('unused')},async provisionEmployee(){throw Error('unused')},async revokeSession(){},
    async getSessionProfile(raw){return hooks.noProfile||raw!==token?null:{id:id(1),email:'synthetic@example.test',display_name:'Synthetic admin',is_admin:hooks.admin===true}},
    async verifySession(raw){state.auth++;return hooks.auth?hooks.auth(raw):raw===token?identity:null}}
  let adapter,composed
  const fallback=async(_req,res)=>{state.fallback++;res.writeHead(404,{});res.end(JSON.stringify({error:'fixture_fallback'}))}
  const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowCompanyOverview:options.available===true,businessHandler:async(req,res)=>{
    if(composed)return composed(req,res)
    if(await adapter(req,res))return
    return fallback(req,res)
  }})
  adapter=createCompanyOverviewHttpHandler({repository,authenticateRequest:native.authenticateRequest,allowedOrigin:origin})
  if(options.composition){
    const company=createNativeCompanyOverviewBusinessHandler({available:options.available===true,
      ...(options.available===true?{repository}:{}),allowedOrigin:origin,authenticateRequest:native.authenticateRequest,businessHandler:fallback})
    composed=createNativeOwnOperationsBusinessHandler({available:false,policy:{configurationWrites:false,employeeProvisioning:false},
      allowedOrigin:origin,authenticateRequest:native.authenticateRequest,businessHandler:company})
  }
  async function call(url='/api/v2/company-overview',options={}){
    const socket=new Socket(),req=new IncomingMessage(socket);req.on('error',()=>{});socket.on('error',()=>{})
    Object.assign(req,{url,method:options.method??'GET',complete:true,headers:{origin,cookie:NATIVE_SESSION_COOKIE+'='+token,...options.headers}})
    for(const part of options.body??[])req.push(Buffer.from(part));req.push(null)
    const res={status:0,headers:{},body:null,writeHead(status,headers){this.status=status;this.headers=headers},end(raw){this.body=JSON.parse(raw)}}
    try{const handled=await(options.direct?adapter(req,res):native.handler(req,res));return {...res,handled}}finally{req.destroy();socket.destroy()}
  }
  return {calls,hooks,identity,state,call}
}
test('two exact GET projections use real Native Cookie closure, independent global totals and disabled subject metadata',async()=>{
  const f=fixture(),a=await f.call(),b=await f.call('/api/v2/company-overview/employees?limit=2&after='+id(2))
  assert.equal(a.status,200);assert.equal(a.body.totals.employees,205);assert.equal(b.status,200);assert.equal(b.body.items.length,1)
  assert.equal(b.body.items[0].agent_running,7);assert.equal(b.body.items[0].enabled,false);assert.equal(b.body.items[0].status,'disabled')
  assert.strictEqual(f.calls[0][1],f.identity);assert.strictEqual(f.calls[1][1],f.identity);assert.deepEqual(f.calls[1][2],{limit:2,after:id(2)})
  assert.deepEqual(a.body.worker,{availability:'unavailable',reason:'telemetry_not_installed'});assert.ok(f.state.auth>=2)
})
test('all successful and refused replies have private noncacheable response headers',async()=>{
  const f=fixture()
  for(const result of [await f.call(),await f.call('/api/v2/company-overview?owner=x')])
    for(const [key,value] of Object.entries({'Cache-Control':'no-store',Pragma:'no-cache','Referrer-Policy':'no-referrer',
      'Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'}))assert.equal(result.headers[key],value)
})
test('Cookie missing, duplicate or revoked and arbitrary alternative identities execute no metadata reads',async()=>{
  for(const headers of [{cookie:undefined},{cookie:NATIVE_SESSION_COOKIE+'='+token+'; '+NATIVE_SESSION_COOKIE+'='+token},
    {authorization:'Bearer synthetic'},{'x-rh-user-id':id(1)},{'x-agentstudio-user-id':id(1)},{'x-forwarded-user':'admin'},{'x-forwarded-email':'private@example.test'}]){
    const f=fixture(),r=await f.call(undefined,{headers});assert.equal(r.status,401);assert.deepEqual(r.body,{error:'session_required'});assert.equal(f.calls.length,0)
  }
  const f=fixture();f.hooks.auth=()=>null;assert.equal((await f.call()).status,401);assert.equal(f.calls.length,0)
})
test('foreign origin, fetch-site and verified foreign issuer cannot read the company',async()=>{
  for(const headers of [{origin:'https://foreign.example.test'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}]){
    const f=fixture(),r=await f.call(undefined,{headers});assert.equal(r.status,403);assert.equal(f.calls.length,0)
  }
  const f=fixture();f.hooks.auth=()=>({...f.identity,issuer:'foreign'});assert.equal((await f.call()).status,403);assert.equal(f.calls.length,0)
})
test('closed canonical queries reject duplicates, aliases, owner selectors and overflow before repository dispatch',async()=>{
  for(const url of ['/api/v2/company-overview?', '/api/v2/company-overview?limit=1','/api/v2/company-overview/employees?limit=21',
    '/api/v2/company-overview/employees?limit=01','/api/v2/company-overview/employees?limit=2&limit=1',
    '/api/v2/company-overview/employees?owner_id='+id(1),'/api/v2/company-overview/employees?after=',
    '/api/v2/company-overview/employees?%6cimit=2','/api/v2/company-overview/employees?limit=+2',
    '/api/v2/company-overview/employees?after='+id(1)+'&after='+id(2)]){
    const f=fixture(),r=await f.call(url);assert.equal(r.status,400,url);assert.equal(f.calls.length,0)
  }
})
test('encoded, normalized, trailing and absolute route aliases are claimed for rejection without fallback',async()=>{
  for(const url of ['/api/v2/%63ompany-overview','/api/v2/x/../company-overview','/api/v2/company-overview/',
    'https://studio.example.test/api/v2/company-overview','/api/v2/company-overview#fragment']){
    const f=fixture(),r=await f.call(url,{direct:true});assert.equal(r.handled,true,url);assert.equal(r.status,400,url)
    assert.equal(f.calls.length,0);assert.equal(f.state.fallback,0)
  }
  const f=fixture();assert.equal((await f.call('/api/v2/company-overview-other',{direct:true})).handled,false)
})
test('unsupported methods and nonempty GET framing execute no read',async()=>{
  for(const method of ['HEAD','POST','PATCH','DELETE','OPTIONS']){
    const f=fixture(),r=await f.call(undefined,{method,direct:true});assert.equal(r.status,405);assert.equal(r.headers.Allow,'GET');assert.equal(f.calls.length,0)
  }
  for(const options of [{headers:{'content-length':'1'}},{headers:{'content-length':'00'}},{headers:{'transfer-encoding':'chunked'}},{body:['x']}]){
    const f=fixture(),r=await f.call(undefined,options);assert.equal(r.status,400);assert.equal(f.calls.length,0)
  }
})
test('each real repository denial keeps only fixed401/403 and never supplies counts or SQL details',async()=>{
  for(const [status,code] of [[401,'session_required'],[403,'admin_required']]){
    const f=fixture();f.hooks.overview=()=>{throw new HttpError(status,code)}
    for(let i=0;i<2;i++){const r=await f.call();assert.equal(r.status,status);assert.deepEqual(r.body,{error:code})}
    assert.equal(f.calls.length,2)
  }
})
test('malformed fulfilled projections, private exceptions and unknown error codes become unavailable rather than zero',async()=>{
  for(const action of [()=>({...overview(),totals:{...overview().totals,active:'0'}}),()=>({...overview(),worker:{availability:'healthy'}}),
    ()=>({...overview(),email:'PRIVATE_SENTINEL'}),()=>{throw Error('PRIVATE_SENTINEL')},()=>{throw new HttpError(403,'PRIVATE_SENTINEL')}]){
    const f=fixture();f.hooks.overview=action;const r=await f.call();assert.equal(r.status,503);assert.deepEqual(r.body,{error:'company_overview_unavailable'})
  }
  const f=fixture();f.hooks.employees=q=>page({limit:1});const r=await f.call('/api/v2/company-overview/employees?limit=2')
  assert.equal(r.status,503);assert.deepEqual(r.body,{error:'company_overview_unavailable'})
})
test('fulfilled hostile getters are refused without executing code before the DTO is sent',async()=>{
  const f=fixture();let invoked=0
  f.hooks.overview=()=>Object.defineProperty(overview(),'totals',{enumerable:true,get(){invoked++;return overview().totals}})
  assert.equal((await f.call()).status,503);assert.equal(invoked,0)
})
test('actual shared Native composition preserves the global policy and unavailable reads still verify Cookie',async()=>{
  const open=fixture({composition:true,available:true})
  assert.equal((await open.call()).status,200)
  assert.equal((await open.call('/api/v2/company-overview/employees?limit=2')).status,200)
  for(const method of ['POST','PATCH','DELETE'])assert.equal((await open.call(undefined,{method})).status,405)
  assert.equal((await open.call('/api/v2/model-connections',{method:'POST'})).status,405)
  assert.equal(open.calls.length,2)
  const closed=fixture({composition:true,available:false})
  assert.deepEqual((await closed.call()).body,{error:'company_overview_unavailable'})
  assert.equal((await closed.call()).status,503);assert.equal(closed.calls.length,0)
  assert.equal((await closed.call(undefined,{headers:{cookie:undefined}})).status,401)
  assert.equal(closed.calls.length,0);assert.equal(closed.state.fallback,0)
})
test('company capability requires both audited installation hint and current server-derived admin profile',async()=>{
  for(const available of [false,true])for(const admin of [false,true]){
    const f=fixture({available});f.hooks.admin=admin
    const r=await f.call('/api/native-auth/capabilities')
    assert.equal(r.status,200)
    if(available&&admin)assert.equal(r.body.company_overview_available,true)
    else assert.equal(Object.hasOwn(r.body,'company_overview_available'),false)
    assert.equal(r.body.config_writes_enabled,false);assert.equal(f.calls.length,0)
    f.hooks.noProfile=true;assert.equal((await f.call('/api/native-auth/capabilities')).status,401)
  }
})
