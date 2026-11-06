import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {captureOriginalScheduleWorkerTarget as capture,checkOriginalScheduleWorkerTarget as target,checkOriginalScheduleWorkerRole as role,checkOriginalScheduleWorkerMembers as members} from './helpers/pg-original-schedule-worker-login-policy.mjs'
const expectedTarget={host:'127.0.0.1',port:5432,database:'agentstudio_pg18_ci',user:'agentstudio_admin'},actualTarget={database:'agentstudio_pg18_ci',login:'agentstudio_admin',superuser:true,primary:true,version:180006,system_identifier:'7564381234567890123',database_oid:'16384',postmaster_started_us:'1793618374123456',server_addr:'172.19.0.2',server_port:5432},binding=capture(actualTarget,expectedTarget)
const selectedRole={name:'agentstudio_stage_worker',login:false,superuser:false,inherits:false,bypassrls:false,createrole:false,createdb:false,replication:false,config:null,valid_until:null,connection_limit:-1,no_direct_privileges:true,connect:true,database_create:false,connections:0,verifier:'SCRAM-SHA-256$4096:'+Buffer.alloc(16,1).toString('base64')+'$'+Buffer.alloc(32,2).toString('base64')+':'+Buffer.alloc(32,3).toString('base64')}
const grants=[{role:'agentstudio_api',member:'agentstudio_stage_worker',admin:false,inherit:false,set:true},{role:'agentstudio_worker',member:'agentstudio_stage_worker',admin:false,inherit:false,set:true}]
test('loopback client permit is separate from an exact initialized Docker server binding',()=>{target(actualTarget,expectedTarget,binding);assert.equal(binding.server_addr,'172.19.0.2');assert(Object.isFrozen(binding));for(const [k,v]of Object.entries({database:'agent_studio',login:'postgres',superuser:false,primary:false,version:170006}))assert.throws(()=>target({...actualTarget,[k]:v},expectedTarget,binding),/boundary_refused/);for(const [k,v]of Object.entries({host:'172.19.0.2',port:5333,database:'agent_studio',user:'postgres'}))assert.throws(()=>target(actualTarget,{...expectedTarget,[k]:v},binding),k)})
test('NOLOGIN is a required before-state and LOGIN is a required after-state',()=>{role(selectedRole,false);role({...selectedRole,login:true},true);assert.throws(()=>role(selectedRole,true));assert.throws(()=>role({...selectedRole,login:true},false))})
test('privileged/inheriting/mutable/direct-grant roles fail closed',()=>{for(const [k,v]of Object.entries({name:'synthetic_bypass',superuser:true,inherits:true,bypassrls:true,createrole:true,createdb:true,replication:true,config:[],valid_until:'2099-01-01',connection_limit:0,no_direct_privileges:false,connect:false,database_create:true,connections:-1,verifier:'md5never'}))assert.throws(()=>role({...selectedRole,[k]:v},false),k)})
test('exact two Worker/API memberships require no admin/inherit and explicit SET',()=>{members(grants);members([...grants].reverse());for(const [k,v]of Object.entries({role:'agentstudio_model_broker',member:'other_login',admin:true,inherit:true,set:false}))assert.throws(()=>members([{...grants[0],[k]:v},grants[1]]),k);assert.throws(()=>members([...grants,{...grants[0],role:'agentstudio_bound_dispatch'}]));assert.throws(()=>members([grants[0],grants[0]]));assert.throws(()=>members([grants[0]]))})
const source=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8')
test('negative control uses actual known SCRAM login attempt before explicit activation',()=>{const s=source('tests/helpers/pg-original-schedule-worker-login.mjs');assert(s.indexOf('requireOriginalScheduleWorkerCi(env)')<s.indexOf("import('node:module')"));assert(s.includes('password:expectedDisabledPassword'));assert(s.includes("error?.code==='28000'&&/not permitted to log in/"));assert(s.includes('serviceLoginDefinition(\'worker\')'));assert(s.includes('secrets.serviceLoginVerifier(password)'));assert(s.includes("randomBytes(40).toString('hex')"));assert(s.indexOf('if(!refused)')<s.indexOf('ALTER ROLE agentstudio_stage_worker LOGIN PASSWORD'));assert(!s.includes('activatePreparedServiceLogin('));assert(!s.includes("SET SESSION AUTHORIZATION"));assert(!s.includes('pg18_service_login_worker_001'))})
test('real worker audit and044 audit precede all scheduler/Worker construction',()=>{const s=source('tests/helpers/pg-original-schedule-worker-backend-fixture.mjs'),activation=s.indexOf('workerLoginActivation=await activateOriginalScheduleWorkerLogin'),connect=s.indexOf('workerPool=poolFor(workerLoginActivation.login,workerLoginActivation.password'),boundary=s.indexOf('await workerRole.verifyPgWorkerRoleBoundary'),audit=s.indexOf('await scheduleAudit.verifyScheduleRuntimeSchema(workerPool)'),construct=s.indexOf('new schedulerModule.ScheduleRuntimeWorker');assert(activation>0&&activation<connect&&connect<boundary&&boundary<audit&&audit<construct);assert(s.includes("assert.equal(actual.login,'agentstudio_stage_worker')"));assert(s.indexOf('for(const pool of pools)await clean(()=>pool.end())')<s.indexOf('workerLoginActivation.restore()'))})
test('restoration retains fixed NOLOGIN, original verifier, unchanged ledger and refuses live sessions',()=>{const s=source('tests/helpers/pg-original-schedule-worker-login.mjs');for(const token of ['role.connections!==0','original_schedule_worker_connections_not_drained','ALTER ROLE agentstudio_stage_worker NOLOGIN PASSWORD','after.verifier!==oldVerifier','JSON.stringify((await db.query(ledgerSQL)).rows)!==ledger','await admin.end()'])assert(s.includes(token),token);assert(!/UPDATE\s+agentstudio\.(?:runs|jobs|schedule_occurrences)/i.test(s))})

test('same database/admin/PG18/address cannot hide another cluster,DB OID or server restart',()=>{
 for(const [k,v]of Object.entries({system_identifier:'7564381234567890124',database_oid:'16385',postmaster_started_us:'1793618374123457',server_addr:'172.19.0.3',server_port:5433,version:180007}))assert.throws(()=>target({...actualTarget,[k]:v},expectedTarget,binding),k)
 for(const address of ['10.0.0.2','192.168.1.2','127.0.0.1','203.0.113.2','::1'])assert.throws(()=>target({...actualTarget,server_addr:address},expectedTarget,binding),address)
 assert.throws(()=>target(actualTarget,expectedTarget));assert.throws(()=>target(actualTarget,expectedTarget,{}))
})
test('physical IDs stay canonical decimal strings without numeric precision loss',()=>{
 for(const key of ['system_identifier','database_oid','postmaster_started_us']){
  for(const value of [null,undefined,0,123,1n,'','0','-1','01','1.1','1e6',' 123','123 ','9'.repeat(21)])assert.throws(()=>capture({...actualTarget,[key]:value},expectedTarget),key+':'+String(value))
  const missing={...actualTarget};delete missing[key];assert.throws(()=>capture(missing,expectedTarget))
 }
 assert.throws(()=>capture({...actualTarget,database_oid:'4294967296'},expectedTarget))
 assert.throws(()=>capture({...actualTarget,system_identifier:'18446744073709551616'},expectedTarget))
 assert.throws(()=>capture({...actualTarget,postmaster_started_us:'9223372036854775808'},expectedTarget))
 for(const server_addr of [null,'','not-an-IP','172.19.0.0/16'])assert.throws(()=>capture({...actualTarget,server_addr},expectedTarget))
 assert.throws(()=>capture({...actualTarget,server_port:null},expectedTarget));assert.throws(()=>capture({...actualTarget,server_port:0},expectedTarget))
})
test('the initialized reference is immutable and exact; no missing/extra/accessor identity fields',()=>{
 const copy={...actualTarget},ref=capture(copy,expectedTarget);copy.system_identifier='7564381234567890124';assert.equal(ref.system_identifier,actualTarget.system_identifier)
 assert.throws(()=>{ref.database_oid='99999'});assert.throws(()=>target(actualTarget,expectedTarget,{...binding,unknown:true}))
 assert.throws(()=>capture({...actualTarget,host:'127.0.0.1'},expectedTarget))
 const accessor={...actualTarget};Object.defineProperty(accessor,'system_identifier',{get(){throw Error('getter_must_not_run')},enumerable:true});assert.throws(()=>capture(accessor,expectedTarget),/boundary_refused/)
})
test('source captures only from already initialized f.db before constructing the new admin Pool',()=>{
 const s=source('tests/helpers/pg-original-schedule-worker-login.mjs'),backend=source('tests/helpers/pg-original-schedule-worker-backend-fixture.mjs')
 const guard=s.indexOf('const permit=requireOriginalScheduleWorkerCi(env)'),captureQuery=s.indexOf('initializedAdmin.query(originalScheduleWorkerTargetSQL)'),bound=s.indexOf('const binding=captureOriginalScheduleWorkerTarget'),pool=s.indexOf('admin=new pg.Pool')
 assert(guard>=0&&guard<captureQuery&&captureQuery<bound&&bound<pool)
 assert(backend.includes("activateOriginalScheduleWorkerLogin(f.db,passwordFor('agentstudio_stage_worker'),env)"))
 assert(s.includes('system_identifier::text'));assert(s.includes('oid::text'));assert(s.includes('pg_catalog.pg_postmaster_start_time())*1000000)::bigint::text'))
 assert(!s.includes('host(inet_server_addr()) AS host'))
})
test('every independent activation/restore admin lease is checked before transaction work',()=>{
 const s=source('tests/helpers/pg-original-schedule-worker-login.mjs')
 assert.equal((s.match(/await admin\.connect\(\)/g)??[]).length,1)
 assert.equal((s.match(/await connectBoundAdmin\(\)/g)??[]).length,3)
 assert(s.includes('try{await checkInstance(db);return db}catch(error){db.release(true);throw error}'))
 assert(s.includes('checkOriginalScheduleWorkerTarget(rows[0],permit.target,binding)'))
 assert(s.includes('const inspect=async(db,enabled)=>{await checkInstance(db);'))
 assert.equal((s.match(/captureOriginalScheduleWorkerTarget\(/g)??[]).length,1)
})
