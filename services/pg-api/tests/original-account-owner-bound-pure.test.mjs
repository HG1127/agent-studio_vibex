import test from 'node:test'
import assert from 'node:assert/strict'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {NativeEmployeeGovernanceRepository} from '../src/native-employee-governance.mjs'
import {NativeAuthRepository} from '../src/native-auth-repository.mjs'
import {hashOpaqueSession,hashEmployeePassword,verifyEmployeePassword,validateEmployeePassword} from '../src/native-employee-auth.mjs'
import {originalAccountPasswordProtocol,parseOriginalAccountExpectedOwner,parseOriginalAccountPasswordInput,parseOriginalAccountPasswordCapabilities,parseOriginalAccountPasswordResponse} from '../../../shared/original-account-contract.ts'

// Actual methods receive terminal request/response/SqlClient DATA only. No
// socket, SQL engine, Native process, browser or Worker is created here.
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
const tokens={a:Buffer.alloc(32,1).toString('base64url'),b:Buffer.alloc(32,2).toString('base64url')},origin='https://account.synthetic.test'
const choice={old_password:'SameSyntheticPassword#2026',new_password:'ChangedSyntheticPassword#2026'}
const caps=(writes=true)=>({mode:'native_pg18',config_writes_enabled:writes,employee_governance_available:true,employee_governance_enabled:writes,original_account_password_protocol:originalAccountPasswordProtocol,original_account_password_available:true,original_account_password_enabled:writes})
function fixture({bound=true,governance=true,writes=true,provision=true,change}={}){
 const calls=[]
 const profiles=new Map([[tokens.a,{id:A,email:'a@example.test',display_name:'A',is_admin:false}],[tokens.b,{id:B,email:'b@example.test',display_name:'B',is_admin:false}]])
 const auth={async login(){return{token:tokens.b,expiresAt:new Date(Date.now()+60000),is_admin:false}},async provisionEmployee(){throw Error('unused')},async revokeSession(){throw Error('unused')},async getSessionProfile(token){calls.push(['profile',token]);return profiles.get(token)??null},async changePassword(token,body){calls.push(['legacy',token,body]);return{ok:true,reauthenticate:true}}}
 if(bound){auth.accountPasswordProtocol=originalAccountPasswordProtocol;auth.changePasswordForOwner=async(token,body,owner)=>{calls.push(['bound',token,body,owner]);return change?change(token,body,owner):{ok:true,reauthenticate:true}}}
 const {handler}=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowEmployeeGovernance:governance,allowConfigurationWrites:writes,allowEmployeeProvisioning:provision,businessHandler(){throw Error('business route not allowed in this test')}})
 return{calls,auth,async invoke({owner=A,token=tokens.a,route='/api/native-auth/change-password',method='POST',headers={},body=choice}={}){
  let reads=0,status,responseHeaders,responseBody
  const req={url:route,method,socket:{remoteAddress:'127.0.0.1'},headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json','x-agentstudio-request':'1',...(token?{cookie:'__Host-agentstudio_session='+token}:{}),...(owner===null?{}:{'x-agentstudio-expected-owner':owner}),...headers},async *[Symbol.asyncIterator](){reads++;yield Buffer.from(JSON.stringify(body))}}
  const res={writeHead(code,values){status=code;responseHeaders=values},end(value){responseBody=JSON.parse(value)}}
  await handler(req,res)
  return{status,headers:responseHeaders,body:responseBody,reads}
 }}
}
test('actual owner-bound handler refuses stale A form carrying B Cookie before reading password body',async()=>{
 const f=fixture(),r=await f.invoke({token:tokens.b})
 assert.equal(r.status,401);assert.equal(r.body.error,'session_changed');assert.equal(r.reads,0);assert.equal(f.calls.filter(c=>c[0]==='bound'||c[0]==='legacy').length,0);assert.equal(r.headers['Set-Cookie'],undefined)
})
test('actual owner-bound handler calls only its explicit port and never emits a Cookie deletion',async()=>{
 const f=fixture(),r=await f.invoke()
 assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true,reauthenticate:true});assert.equal(r.headers['Set-Cookie'],undefined)
 assert.deepEqual(f.calls.filter(c=>c[0]==='bound'),[['bound',tokens.a,choice,A]]);assert.equal(f.calls.some(c=>c[0]==='legacy'),false)
})
test('legacy password contract retains its explicit Cookie clearing behavior',async()=>{
 const f=fixture(),r=await f.invoke({owner:null});assert.equal(r.status,200);assert.match(r.headers['Set-Cookie'],/Max-Age=0/);assert.equal(f.calls.filter(c=>c[0]==='legacy').length,1)
})
test('a delayed A completion cannot delete the newer B login Cookie',async()=>{
 let release,entered;const wait=new Promise(resolve=>{release=resolve}),ready=new Promise(resolve=>{entered=resolve})
 const f=fixture({change:async()=>{entered();await wait;return{ok:true,reauthenticate:true}}}),pending=f.invoke();await Promise.race([ready,pending.then(()=>{throw Error('owner_bound_port_not_entered')})])
 const login=await f.invoke({route:'/api/native-auth/login',owner:null,body:{email:'b@example.test',password:'SyntheticBPassword#2026'}})
 assert.equal(login.status,200);assert.match(login.headers['Set-Cookie'],new RegExp(tokens.b))
 release();const completed=await pending;assert.equal(completed.status,200);assert.equal(completed.headers['Set-Cookie'],undefined)
 const me=await f.invoke({route:'/api/native-auth/me',method:'GET',owner:null,token:tokens.b});assert.equal(me.body.user.id,B)
})
for(const owner of ['',A+' ',A+'\n',[A],A+','+B,'00000000-0000-0000-0000-000000000000'])test('malformed expected-owner header refused: '+JSON.stringify(owner),async()=>{
 const f=fixture(),r=await f.invoke({owner});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_expected_owner');assert.equal(r.reads,0);assert.equal(f.calls.some(c=>c[0]==='bound'||c[0]==='legacy'),false)
})
for(const settings of [{bound:false},{governance:false},{writes:false}])test('missing explicit account admission stays closed '+JSON.stringify(settings),async()=>{
 const f=fixture(settings),r=await f.invoke();assert(r.status>=400);assert.equal(r.reads,0);assert.equal(f.calls.some(c=>c[0]==='bound'||c[0]==='legacy'),false)
 const observed=await f.invoke({route:'/api/native-auth/capabilities',method:'GET',owner:null});const parsed=parseOriginalAccountPasswordCapabilities(observed.body)
 assert.equal(parsed.enabled,false);if(settings.bound===false||settings.governance===false)assert.equal(parsed.available,false)
})
for(const headers of [{origin:'https://foreign.test'},{'sec-fetch-site':'cross-site'},{'x-agentstudio-request':'0'},{authorization:'Bearer forged'}])test('original origin, CSRF and Cookie-only refusals remain intact '+JSON.stringify(headers),async()=>{
 const f=fixture(),r=await f.invoke({headers});assert([401,403].includes(r.status));assert.equal(r.reads,0);assert.equal(f.calls.length,0)
})
test('verified repository exposes an explicit port and rejects invalid expected owner before forwarding',async()=>{
 const r=new NativeAuthRepository({}),calls=[];r.governance={changePassword(...args){calls.push(args);return{ok:true,reauthenticate:true}}}
 assert.equal(r.accountPasswordProtocol,originalAccountPasswordProtocol);assert.deepEqual(r.changePasswordForOwner(tokens.a,choice,A.toUpperCase()),{ok:true,reauthenticate:true});assert.deepEqual(calls,[[tokens.a,choice,A]])
 assert.throws(()=>r.changePasswordForOwner(tokens.a,choice,'forged'),/invalid_expected_owner/);assert.equal(calls.length,1)
})
function governance(actor){
 const calls=[],password=hashEmployeePassword(choice.old_password)
 const db={async query(sql,args){calls.push({sql,args});if(sql.includes('SELECT a.user_id,a.is_admin'))return{rows:[{user_id:actor,is_admin:false}]};if(sql.startsWith('SELECT password_record'))return{rows:[{password_record:await password}]};return{rows:[]}}}
 const repository=new NativeEmployeeGovernanceRepository({},async(_pool,callback)=>{calls.push({transaction:true});return callback(db)})
 return{calls,repository}
}
test('actual governance write compares the transaction-locked verified actor before password read or write',async()=>{
 const f=governance(B);await assert.rejects(f.repository.changePassword(tokens.b,choice,A),/session_changed/)
 assert.equal(f.calls[0].transaction,true);assert.equal(f.calls[1].sql,'SELECT pg_advisory_xact_lock(61824,20261048)')
 assert(f.calls[2].sql.includes('FOR SHARE OF a,u,s'));assert.deepEqual(f.calls[2].args[0],hashOpaqueSession(tokens.b))
 assert.equal(f.calls.length,3)
})
test('actual governance success keeps credential hash, all A session revocation and private audit in one transaction',async()=>{
 const f=governance(A);assert.deepEqual(await f.repository.changePassword(tokens.a,choice,A),{ok:true,reauthenticate:true})
 const write=f.calls.find(c=>c.sql?.startsWith('UPDATE agentstudio_auth.accounts SET password_record'))
 assert.equal(write.args[0],A);assert.equal(await verifyEmployeePassword(choice.new_password,write.args[1]),true)
 const revoke=f.calls.find(c=>c.sql?.startsWith('UPDATE agentstudio_auth.sessions'));assert.deepEqual(revoke.args,[A]);assert(revoke.sql.includes('revoked_at IS NULL'))
 const audit=f.calls.find(c=>c.sql?.startsWith('INSERT INTO agentstudio_auth.employee_governance_events'));assert.equal(audit.args[0],A);assert.equal(audit.args[1],A);assert.equal(audit.args[2],'employee.password');assert.equal(audit.args.at(-1),'{}')
 assert.equal(f.calls.filter(c=>c.transaction).length,1)
})
test('invalid expected owner cannot start even the terminal transaction port',async()=>{const f=governance(A);await assert.rejects(f.repository.changePassword(tokens.a,choice,'forged'),/invalid_expected_owner/);assert.equal(f.calls.length,0)})
test('new DTO preserves actual UTF-8 password policy and rejects accessors without executing them',()=>{
 for(const password of ['中'.repeat(4),'中'.repeat(85)+'a','a'.repeat(256),'密码OnlyUnicode123']){assert.equal(parseOriginalAccountPasswordInput({...choice,new_password:password}).new_password,password);assert.equal(validateEmployeePassword(password),password)}
 for(const password of ['a'.repeat(11),'a'.repeat(257),'中'.repeat(86),'!'.repeat(12),'Password\n1234'])assert.throws(()=>parseOriginalAccountPasswordInput({...choice,new_password:password}))
 let reads=0;const accessor={new_password:choice.new_password};Object.defineProperty(accessor,'old_password',{enumerable:true,get(){reads++;return choice.old_password}});assert.throws(()=>parseOriginalAccountPasswordInput(accessor));assert.equal(reads,0)
 assert.equal(parseOriginalAccountExpectedOwner(A.toUpperCase()),A);assert.deepEqual(parseOriginalAccountPasswordResponse({ok:true,reauthenticate:true}),{ok:true,reauthenticate:true})
 assert.throws(()=>parseOriginalAccountPasswordResponse({ok:true,reauthenticate:true,owner:A}));assert.throws(()=>parseOriginalAccountPasswordCapabilities({...caps(),original_account_password_enabled:false}))
 assert.deepEqual(parseOriginalAccountPasswordCapabilities(caps(false)),{available:true,enabled:false,protocol:originalAccountPasswordProtocol})
 assert.deepEqual(parseOriginalAccountPasswordCapabilities({mode:'native_pg18',config_writes_enabled:true}),{available:false,enabled:false,protocol:null})
 assert.throws(()=>parseOriginalAccountPasswordCapabilities({...caps(),original_account_password_protocol:undefined}))
})
