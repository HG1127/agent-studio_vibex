import test from 'node:test'
import assert from 'node:assert/strict'
import {generateOpaqueSession,hashOpaqueSession,NATIVE_LOCAL_ISSUER} from '../src/native-employee-auth.mjs'
import {NativeCurrentCompanyAdmin,NativeCompanyAdminError} from '../src/native-current-company-admin.mjs'

// A closed auth SQL protocol fake. No DB or telemetry is created. These cases
// verify capability lifetime, identity change and failure ordering; actual
// PostgreSQL privilege and revocation races require the separate hosted suite.
const base=()=>({user_id:'b52c29a2-c099-42c1-a8c0-f950d720784a',external_subject:'local-employee-subject',enabled:true,is_admin:true,status:'active',revision:'1',expires_at:'2099-01-01 00:00:00+00',checked_at:'2026-10-28 00:00:00+00'})
function fixture(options={}){
  const token=generateOpaqueSession().token,calls=[],releases=[]
  let connections=0
  const pool={async connect(){
    const ordinal=++connections
    if(options.connect)await options.connect(ordinal)
    return {async query(sql,values=[]){
      calls.push({ordinal,sql,values})
      if(options.query)await options.query(sql,ordinal)
      if(sql.startsWith('BEGIN ')||sql.startsWith('SET LOCAL ')||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]}
      if(sql.startsWith('SELECT current_user::text AS role,'))return {rows:[{role:'agentstudio_native_auth',login:'agentstudio_native_login',database:'agent_studio',read_only:'on',search_path:'pg_catalog',safe_login:true,...options.role}]}
      if(sql.startsWith('SELECT c.oid AS id,c.relname AS name'))return {rows:options.governanceAbsent?[]:[{id:10,name:'accounts'},{id:11,name:'employee_governance_events'}]}
      if(sql.startsWith('SELECT attname AS name,format_type'))return {rows:[{name:'share_enabled',type:'boolean',required:true,default_value:'true'},{name:'governance_revision',type:'bigint',required:true,default_value:'1'}]}
      if(sql.startsWith('SELECT NOT rolcanlogin')||sql.startsWith("SELECT c.relkind='r'")||sql.startsWith('SELECT count(*)=2')||sql.startsWith('SELECT NOT has_column_privilege'))return {rows:[{ok:true}]}
      if(sql.startsWith('SELECT a.attname AS name,has_column_privilege')){
        const reads=['id','external_issuer','external_subject','status','display_name','created_at'],inserts=['id','external_issuer','external_subject','display_name','status']
        return {rows:reads.map(name=>({name,read:true,insert:inserts.includes(name),update:name==='status'}))}
      }
      if(sql.startsWith('SELECT a.user_id::text AS user_id,')){
        assert.deepEqual(values,[hashOpaqueSession(token),NATIVE_LOCAL_ISSUER])
        return {rows:options.rows?options.rows(ordinal):[base()]}
      }
      throw Error('unexpected_auth_query')
    },async release(destroy){releases.push(destroy);if(options.releaseError)throw Error('sensitive_release_detail')}}
  }}
  const guard=new NativeCurrentCompanyAdmin(pool)
  return {token,guard,calls,releases,get connections(){return connections}}
}
const rejected=(promise,status,code)=>assert.rejects(promise,e=>e instanceof NativeCompanyAdminError&&e.status===status&&e.code===code)
const unavailable=promise=>rejected(promise,503,'company_admin_authorization_unavailable')
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}

test('opaque context authorizes only current Native admin and consumes a fresh postcheck',async()=>{
  const f=fixture(),context=await f.guard.authorize(f.token)
  assert.equal(Object.getPrototypeOf(context),null);assert.equal(Object.isFrozen(context),true);assert.deepEqual(Reflect.ownKeys(context),[])
  f.guard.assertBeforeRead(f.token,context)
  await f.guard.confirmAfterRead(f.token,context)
  assert.equal(f.connections,2);assert.deepEqual(f.releases,[false,false])
  for(const ordinal of [1,2]){
    const sql=f.calls.filter(c=>c.ordinal===ordinal).map(c=>c.sql)
    assert.equal(sql[0],'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');assert.equal(sql.at(-1),'COMMIT')
    assert.ok(sql.some(s=>s.includes('SET LOCAL search_path=pg_catalog')))
    assert.ok(sql.some(s=>s.includes('s.expires_at>clock_timestamp()')))
    assert.ok(sql.some(s=>s.includes('a.governance_revision::text')))
    assert.ok(sql.every(s=>!s.includes('studio_telemetry')&&!s.includes('schema_migrations')&&!/FOR UPDATE|FOR SHARE|\bINSERT\b|\bDELETE\b|\bUPDATE\b/.test(s.replaceAll("'SELECT,INSERT,UPDATE,REFERENCES'",'').replaceAll("'DELETE,TRUNCATE,TRIGGER'",'').replaceAll("'SELECT'",'').replaceAll("'INSERT'",'').replaceAll("'UPDATE'",'').replaceAll("'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'",''))))
  }
  await unavailable(f.guard.confirmAfterRead(f.token,context));assert.equal(f.connections,2)
})
test('JWTs, browser identities, malformed and missing cookies refuse before auth connect',async()=>{
  const f=fixture()
  for(const token of ['',null,undefined,{issuer:NATIVE_LOCAL_ISSUER,subject:'caller'},'eyJhbGciOiJIUzI1NiJ9.payload.signature','X-Rh-User-Id:admin'])await rejected(f.guard.authorize(token),401,'session_required')
  assert.equal(f.connections,0)
})
test('forged contexts and contexts from a different guard instance have no authority',async()=>{
  const f=fixture(),g=fixture(),context=await f.guard.authorize(f.token)
  for(const raw of [{},Object.freeze({is_admin:true}),Object.create(context),JSON.parse(JSON.stringify(context)),undefined])await unavailable(f.guard.confirmAfterRead(f.token,raw))
  await unavailable(g.guard.confirmAfterRead(f.token,context));assert.equal(g.connections,0)
  await f.guard.confirmAfterRead(f.token,context)
})
test('another valid Cookie consumes and rejects a bound request context before connecting',async()=>{
  const f=fixture(),context=await f.guard.authorize(f.token),other=generateOpaqueSession().token
  await unavailable(f.guard.confirmAfterRead(other,context));await unavailable(f.guard.confirmAfterRead(f.token,context));assert.equal(f.connections,1)
})
test('synchronous before-read guard rejects changed Cookie and permanently invalidates context',async()=>{
  for(const [other,status]of [[generateOpaqueSession().token,503],['invalid-cookie',401]]){
    const f=fixture(),context=await f.guard.authorize(f.token)
    assert.throws(()=>f.guard.assertBeforeRead(other,context),e=>e.status===status)
    await unavailable(f.guard.confirmAfterRead(f.token,context));assert.equal(f.connections,1)
  }
})
test('missing or expired sessions and disabled account fail closed; non-admin gives403',async()=>{
  for(const row of [null,{enabled:false},{status:'disabled'},{expires_at:base().checked_at},{is_admin:false}]){
    const f=fixture({rows:()=>row===null?[]:[{...base(),...row}]})
    await rejected(f.guard.authorize(f.token),row?.is_admin===false?403:401,row?.is_admin===false?'admin_required':'session_required')
    assert.deepEqual(f.releases,[false]);assert.equal(f.calls.at(-1).sql,'ROLLBACK')
  }
})
test('fresh postcheck rejects revoked or demoted session and the context cannot be replayed',async()=>{
  for(const row of [null,{is_admin:false}]){
    const f=fixture({rows:n=>n===1?[base()]:row===null?[]:[{...base(),...row}]}),context=await f.guard.authorize(f.token)
    await rejected(f.guard.confirmAfterRead(f.token,context),row===null?401:403,row===null?'session_required':'admin_required')
    await unavailable(f.guard.confirmAfterRead(f.token,context));assert.equal(f.connections,2)
  }
})
test('postcheck rejects account, subject, session-expiry and governance revision replacement',async()=>{
  for(const change of [{user_id:'b52c29a2-c099-42c1-a8c0-f950d720784b'},{external_subject:'another-subject'},{expires_at:'2099-01-02 00:00:00+00'},{revision:'2'}]){
    const f=fixture({rows:n=>[{...base(),...(n===2?change:{})}]}),context=await f.guard.authorize(f.token)
    await unavailable(f.guard.confirmAfterRead(f.token,context))
    assert.equal(f.connections,2)
  }
})
test('demotion followed by re-enable cannot reuse an earlier context even with admin true again',async()=>{
  const f=fixture({rows:n=>[{...base(),revision:n===1?'1':'3'}]}),context=await f.guard.authorize(f.token)
  await unavailable(f.guard.confirmAfterRead(f.token,context))
})
test('postcheck consumes context synchronously before its auth pool await',async()=>{
  const entered=deferred(),release=deferred(),f=fixture({connect:async n=>{if(n===2){entered.resolve();await release.promise}}}),context=await f.guard.authorize(f.token)
  const first=f.guard.confirmAfterRead(f.token,context);await entered.promise
  await unavailable(f.guard.confirmAfterRead(f.token,context));assert.equal(f.connections,2)
  release.resolve();await first
})
test('unsafe auth role, login, transaction or metadata refuses before session lookup',async()=>{
  for(const role of [{role:'agentstudio_api'},{login:'agentstudio_stage_login'},{database:'other'},{read_only:'off'},{search_path:'public'},{safe_login:false},{extra:true}]){
    const f=fixture({role});await unavailable(f.guard.authorize(f.token))
    assert.equal(f.calls.some(c=>c.sql.startsWith('SELECT a.user_id::text')),false)
  }
})
test('legacy absent governance schema refuses instead of assigning a default revision',async()=>{
  const f=fixture({governanceAbsent:true});await unavailable(f.guard.authorize(f.token))
  assert.equal(f.calls.some(c=>c.sql.startsWith('SELECT a.user_id::text')),false)
})
test('malformed, ambiguous and accessor-based session rows fail closed',async()=>{
  const accessor={...base()};Object.defineProperty(accessor,'revision',{enumerable:true,get(){throw Error('getter_should_not_run')}})
  for(const rows of [[base(),base()],[{...base(),revision:'0'}],[{...base(),revision:'9223372036854775808'}],[{...base(),is_admin:1}],[{...base(),checked_at:'infinity'}],[{...base(),extra:true}],[accessor]]){
    const f=fixture({rows:()=>rows});await unavailable(f.guard.authorize(f.token))
  }
})
test('failed rollback destroys the auth client and SQL details do not escape',async()=>{
  const f=fixture({query:sql=>{if(sql.startsWith('SELECT a.user_id::text')||sql==='ROLLBACK')throw Error('privateSQL/password/detail')}})
  await unavailable(f.guard.authorize(f.token));assert.deepEqual(f.releases,[true])
})
test('commit or client release failures cannot mint a successful context',async()=>{
  for(const options of [{query:sql=>{if(sql==='COMMIT')throw Error('commit_ack_lost')}},{releaseError:true}]){
    const f=fixture(options);await unavailable(f.guard.authorize(f.token))
  }
})
test('auth admission allows at most two in-flight reads and creates no extra pool queue',async()=>{
  const firstEntered=deferred(),secondEntered=deferred(),release=deferred(),f=fixture({connect:async n=>{(n===1?firstEntered:secondEntered).resolve();await release.promise}})
  const first=f.guard.authorize(f.token);await firstEntered.promise
  const second=f.guard.authorize(f.token);await secondEntered.promise
  await unavailable(f.guard.authorize(f.token));assert.equal(f.connections,2)
  release.resolve();await Promise.all([first,second])
})
test('real elapsed context expiry refuses before telemetry read or fresh auth connection',{timeout:15000},async()=>{
  const f=fixture(),context=await f.guard.authorize(f.token)
  await new Promise(resolve=>setTimeout(resolve,10025))
  assert.throws(()=>f.guard.assertBeforeRead(f.token,context),e=>e.status===503)
  await unavailable(f.guard.confirmAfterRead(f.token,context));assert.equal(f.connections,1)
})
