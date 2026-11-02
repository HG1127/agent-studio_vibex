import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {NativeMonitorRequestAdmission} from '../src/native-monitor-request-admission.ts'
import {createNativeMonitorLiveHttp} from '../src/native-monitor-live-http.ts'
import {NativeMonitorLiveRepository} from '../src/native-monitor-live-repository.ts'
import {HttpError} from '../src/contracts.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),a=id(1),b=id(2),monitor=id(3),check=id(4),result=id(5),run=id(6),origin='https://localhost:7443',base='/api/v2/original-ui/business'
const identity={issuer:'urn:agentstudio:local:v1',subject:'real-cookie-a'}
function req(path,{employee=a,method='GET',body='',headers={},rawHeaders,ip='127.0.0.1'}={}){
 return Object.assign(Readable.from(body?[Buffer.from(body)]:[]),{url:path,method,socket:{remoteAddress:ip},...(rawHeaders?{rawHeaders}:{}),headers:{origin,cookie:'__Host-agentstudio_session='+'a'.repeat(43),'sec-fetch-site':'same-origin','x-agentstudio-expected-employee':employee,...(method==='POST'?{'x-agentstudio-request':'1','content-type':'application/json','content-length':String(Buffer.byteLength(body))}:{}),...headers}})
}
const response=()=>({writeHead(status,headers){this.status=status;this.headers=headers},end(raw){this.body=JSON.parse(raw)}})
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}}
test('every concrete GET dispatch supplies expected employee and rechecks Cookie both before and after read',async()=>{
 const calls=[];let auth=0
 const repository=new Proxy({}, {get(_t,name){return async(...args)=>{calls.push({name,args});return{items:[]}}}})
 const http=createNativeMonitorLiveHttp({repository,allowedOrigin:origin,authenticateRequest:async()=>{auth++;return identity}})
 const routes=[[base+'/collector-schedules','schedules'],[base+'/cases/'+a,'caseGet'],[base+'/cases/'+a+'/monitors','monitorList'],[base+'/monitors/'+monitor,'monitorGet'],[base+'/monitors/'+monitor+'/checks?limit=20','history'],[base+'/monitors/'+monitor+'/events/'+check,'eventGet'],[base+'/monitors/'+monitor+'/checks/'+check,'checkGet'],[base+'/monitor-checks/'+check+'/review-preview','reviewPreview'],[base+'/runs/'+run+'/results/'+result,'result'],['/api/v2/original-ui/monitor-inbox?limit=10','inbox']]
 for(const [route,name]of routes){const out=response(),before=auth;await http(req(route),out);assert.equal(out.status,200,name);assert.equal(auth-before,3);assert.equal(calls.at(-1).name,name);assert.equal(calls.at(-1).args.at(-1),a)}
})
for(const employee of [undefined,'',a.toUpperCase(),[a],a+','+a])test('missing/invalid expected employee is rejected before authentication '+JSON.stringify(employee),async()=>{
 let touched=0;const http=createNativeMonitorLiveHttp({repository:{schedules:async()=>assert.fail('read')},allowedOrigin:origin,authenticateRequest:async()=>{touched++;return identity}}),out=response()
 // Our ids contain no letters; use an explicitly non-canonical uppercase hex id.
 const value=employee===a.toUpperCase()?'AAAAAAAA-0000-4000-8000-000000000001':employee
 await http(req(base+'/collector-schedules',{headers:{'x-agentstudio-expected-employee':value}}),out)
 assert.equal(out.status,400);assert.equal(touched,0)
})
test('duplicate raw header is rejected, even if an upstream normalized it to one valid value',async()=>{
 const out=response(),http=createNativeMonitorLiveHttp({repository:{},allowedOrigin:origin,authenticateRequest:async()=>assert.fail('auth')})
 await http(req(base+'/collector-schedules',{rawHeaders:['X-AgentStudio-Expected-Employee',a,'x-agentstudio-expected-employee',a]}),out);assert.equal(out.status,400)
})
test('actual repository maps Native identity to real owner and rejects mismatched employee before catalog/business reads',async()=>{
 const trace=[],db={query:async(sql,params=[])=>{trace.push({sql,params});if(sql.includes('identity_user_id'))return{rows:[{id:b}]};if(sql.startsWith('BEGIN')||sql.startsWith('SET LOCAL')||sql.startsWith('SELECT set_config')||sql==='ROLLBACK')return{rows:[]};assert.fail('unexpected business/catalog query '+sql)},release(){}}
 const repository=new NativeMonitorLiveRepository({connect:async()=>db})
 await assert.rejects(repository.schedules(identity,a),e=>e.status===409&&e.code==='employee_session_changed')
 assert(trace.some(r=>r.sql.includes('identity_user_id')&&r.params[1]===identity.subject));assert(trace.some(r=>r.sql==='ROLLBACK'))
 assert.equal(trace.some(r=>r.sql.includes('pg_catalog.pg_class')),false)
})
for(const changeAt of [2,3])test('Cookie change at auth check '+changeAt+' never exposes a successful body',async()=>{
 let reads=0,auth=0;const out=response(),http=createNativeMonitorLiveHttp({repository:{schedules:async()=>{reads++;return{private:'employee A source'}}},allowedOrigin:origin,authenticateRequest:async()=>++auth>=changeAt?{...identity,subject:'different'}:identity})
 await http(req(base+'/collector-schedules'),out);assert.equal(out.status,409);assert.equal(reads,changeAt===2?0:1);assert.equal(JSON.stringify(out.body).includes('source'),false)
})
test('session revocation after read returns 401 and not cached facts',async()=>{
 let auth=0;const out=response(),http=createNativeMonitorLiveHttp({repository:{schedules:async()=>({private:'facts'})},allowedOrigin:origin,authenticateRequest:async()=>{if(++auth===3)throw new HttpError(401,'session_required');return identity}})
 await http(req(base+'/collector-schedules'),out);assert.equal(out.status,401);assert.deepEqual(out.body,{error:'session_required'})
})
test('actual handler limits concurrent owner reads before a seventh repository operation',async()=>{
 const waiting=deferred();let reads=0;const http=createNativeMonitorLiveHttp({repository:{schedules:async()=>{reads++;return waiting.promise}},allowedOrigin:origin,authenticateRequest:async()=>identity})
 const first=Array.from({length:6},()=>{const out=response();return{out,task:http(req(base+'/collector-schedules'),out)}})
 while(reads<6)await new Promise(resolve=>setImmediate(resolve))
 const blocked=response();await http(req(base+'/collector-schedules'),blocked);assert.equal(blocked.status,429);assert.equal(reads,6);assert.equal(blocked.headers['Retry-After'],'10');assert.equal('items'in blocked.body,false)
 waiting.resolve({items:[]});await Promise.all(first.map(x=>x.task));assert(first.every(x=>x.out.status===200))
 const next=response();await http(req(base+'/collector-schedules'),next);assert.equal(next.status,200)
})
test('actual handler rate limit cannot be reset by a request permit, owner or health parameter',async()=>{
 let reads=0;const http=createNativeMonitorLiveHttp({repository:{schedules:async()=>{reads++;return{items:[]}}},allowedOrigin:origin,authenticateRequest:async()=>identity})
 for(let n=0;n<40;n++){const out=response();await http(req(base+'/collector-schedules'),out);assert.equal(out.status,200)}
 const limited=response();await http(req(base+'/collector-schedules',{headers:{'x-permit':'true','x-owner':b,'x-health':'ok'}}),limited)
 assert.equal(limited.status,429);assert.equal(reads,40);assert.deepEqual(limited.body,{error:'monitor_request_rate_limited'})
})
test('auth failures release global/IP leases; denied writes remain default off',async()=>{
 const deny=createNativeMonitorLiveHttp({repository:{},allowedOrigin:origin,authenticateRequest:async()=>{throw new HttpError(401,'session_required')}})
 for(let n=0;n<20;n++){const out=response();await deny(req(base+'/collector-schedules'),out);assert.equal(out.status,401)}
 const off=createNativeMonitorLiveHttp({repository:{caseCreate:async()=>assert.fail('writes off')},allowedOrigin:origin,authenticateRequest:async()=>identity}),out=response()
 await off(req(base+'/cases',{method:'POST',body:'{}'}),out);assert.equal(out.status,403)
})
test('bounded limiter isolates owner quota, permits only time-window recovery and clamps clock rollback',()=>{
 let now=10000;const gate=new NativeMonitorRequestAdmission(()=>now),other={...identity,subject:'other'}
 for(let n=0;n<40;n++)gate.admitOwner(identity)()
 assert.throws(()=>gate.admitOwner(identity),e=>e.status===429);gate.admitOwner(other)()
 now=0;assert.throws(()=>gate.admitOwner(identity),e=>e.status===429)
 now=20000;gate.admitOwner(identity)()
})
test('global and IP active limits are bounded and release is idempotent',()=>{
 const gate=new NativeMonitorRequestAdmission(()=>0),releases=[]
 for(let n=0;n<64;n++)releases.push(gate.admitIp('ip-'+n))
 assert.throws(()=>gate.admitIp('new'),e=>e.status===429)
 releases[0]();releases[0]();const next=gate.admitIp('new');assert.throws(()=>gate.admitIp('another'),e=>e.status===429);next();for(const release of releases)release()
 const same=Array.from({length:12},()=>gate.admitIp('same'));assert.throws(()=>gate.admitIp('same'),e=>e.status===429);same.forEach(f=>f());gate.admitIp('same')()
})
for(const type of ['ip','owner'])test(type+' admission map cannot grow beyond 2048 keys or evict active entries',()=>{
 let now=0;const gate=new NativeMonitorRequestAdmission(()=>now),admit=n=>type==='ip'?gate.admitIp('ip-'+n):gate.admitOwner({...identity,subject:'owner-'+n})
 for(let n=0;n<2048;n++)admit(n)()
 assert.throws(()=>admit(2049),e=>e.status===429);now=10000;const release=admit(2049);now=20000;for(let n=0;n<2047;n++)admit(n)();assert.throws(()=>admit(3000),e=>e.status===429);release()
})
test('invalid clock fails closed without issuing a healthy or empty DTO',()=>{const gate=new NativeMonitorRequestAdmission(()=>NaN);assert.throws(()=>gate.admitIp('ip'),e=>e.status===503)})
