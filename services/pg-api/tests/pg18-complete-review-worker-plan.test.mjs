// Pure protocol/HBA tests only; no SQL, Pool, app CLI or fake positive auditor.
import test from 'node:test'
import assert from 'node:assert/strict'
import {complete069ReviewWorkerAbi as abi,complete069ReviewWorkerTargetGuardSql as guard,complete069ReviewWorkerReservationSql as reserve,complete069ReviewWorkerActivationSql as activate,complete069ReviewWorkerPlan as plan,inspectComplete069ReviewWorkerHba as hba,parseComplete069ReviewWorkerArguments as parse,complete069ReviewWorkerRefusal as refusal} from '../src/pg18-complete-review-worker-plan.mjs'
import {serviceLoginKinds,serviceLogins,serviceLoginTargetGuardSql} from '../src/pg18-service-login-policy.mjs'
import {completeServiceActions} from '../src/pg18-complete-service-plan.mjs'
import {checkedComplete069ReviewWorkerIntent as checked} from '../src/pg18-complete-review-worker-journal.mjs'
const hash='a'.repeat(64),id='12345678-1234-4123-8123-123456789012',args=['--prepare','--profile','complete069','--confirm-database','agent_studio','--expected-source-sha256',hash,'--expected-system-identifier','123','--expected-database-oid','5','--operation-id',id]
test('one fixed review LOGIN leaves original six, C eight actions and ledger grants closed',()=>{
 assert.equal(abi.login,'agentstudio_review_worker_login');assert.equal(abi.group,'agentstudio_review_worker');assert.equal(guard,serviceLoginTargetGuardSql)
 assert.deepEqual(serviceLoginKinds,['api','worker','identity','broker','index-worker','index-broker']);assert.equal(Object.values(serviceLogins).some(v=>v.login===abi.login),false)
 assert.deepEqual(completeServiceActions,['api','native-auth','first-admin','worker','identity','broker','index-worker','index-broker'])
 assert.equal(reserve,'CREATE ROLE agentstudio_review_worker_login NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 3;\nGRANT CONNECT ON DATABASE agent_studio TO agentstudio_review_worker_login;\nGRANT agentstudio_review_worker TO agentstudio_review_worker_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;')
 assert.doesNotMatch(reserve,/IF NOT EXISTS|PASSWORD|schema_migrations|agentstudio_api|agentstudio_stage_worker|GRANT (?:SELECT|EXECUTE|USAGE|CREATE)|agent_studio_telemetry/)
 const p=plan();for(const k of ['original_six_enum_changed','C_eight_actions_changed','migration_ledger_writes','review_dispatch_login_included','activation_via_this_module','preparation_is_runtime_authorization','credentials_read','network_used','writes_performed','services_started','production_cutover_allowed'])assert.equal(p[k],false)
 assert.equal(p.new_table_column_function_schema_or_ledger_grants,0);assert.equal(p.existing057_version_column_grant_unchanged,true)
})
test('canonical SCRAM is the only activation input; role/plaintext/SQL interpolation is refused',()=>{
 const v='SCRAM-SHA-256$15000:'+Buffer.alloc(16,1).toString('base64')+'$'+Buffer.alloc(32,2).toString('base64')+':'+Buffer.alloc(32,3).toString('base64')
 assert.equal(activate(v),"ALTER ROLE agentstudio_review_worker_login LOGIN PASSWORD '"+v+"';")
 for(const bad of [undefined,'password',v+"';GRANT agentstudio_api TO agentstudio_stage_worker;--",v.replace('15000','4096'),v.replace('AQEB','AQE=')])assert.throws(()=>activate(bad),/scram_refused/)
})
test('independent HBA checks ordering, fixed user/database, both remote families and rule ambiguity',()=>{
 const r=(n,type,db,method,address=null,netmask=null,user=abi.login)=>({rule_number:n,type,database:[db],user_name:[user],auth_method:method,address,netmask,error:null,options:null})
 const good=[r(1,'local','all','reject'),r(2,'host','agent_studio','scram-sha-256','127.0.0.1','255.255.255.255'),r(3,'host','all','reject','0.0.0.0','0.0.0.0'),r(4,'host','all','reject','::','::')]
 assert.equal(hba(good).safe,true)
 for(const first of [r(1,'host','all','trust','127.0.0.1','255.255.255.255'),r(1,'host','all','trust','samehost',null,'+agentstudio_review_worker'),r(1,'host','all','scram-sha-256','hostname.invalid',null,'all'),r(1,'local','all','peer')])assert.equal(hba([first,...good.map(v=>({...v,rule_number:v.rule_number+1}))]).safe,false)
 assert.equal(hba(good.slice(0,3)).safe,false);assert.equal(hba(good.map(v=>({...v,user_name:['all']}))).safe,false)
 assert.equal(hba([...good,good[0]]).safe,false);assert.equal(hba(good.map(v=>({...v,options:['clientcert=verify-full']}))).safe,false)
})
test('explicit argument schema fixes source and physical target and accepts no account selector',()=>{
 assert.deepEqual(parse(args),{mode:'prepare',sourceSha256:hash,target:{system_identifier:'123',database_oid:'5'},operationId:id})
 assert.deepEqual(parse(['--plan']),{mode:'plan'})
 for(const [i,v]of [[0,'--serve'],[2,'complete050'],[4,'agent_studio_telemetry'],[6,hash+'0'],[8,'0'],[10,'-1'],[12,'bad']]){const a=[...args];a[i]=v;assert.throws(()=>parse(a),/arguments_refused/)}
 for(const extra of [['--login','agentstudio_stage_worker'],['--action','worker'],['--repair']])assert.throws(()=>parse([...args,...extra]))
})
test('review record binds baseline/source/target and cannot masquerade as C intent or runtime authorization',()=>{
 const cfg=parse(args),v={format:'complete069_review_worker_operation_v1',profile:'complete069',database:'agent_studio',operator:'postgres',login:abi.login,group:abi.group,baseline_catalog_sha256:'b'.repeat(64),operation_id:id,source_sha256:hash,target:cfg.target,verifier_sha256:'c'.repeat(64),started_at:'2026-10-30T00:00:00.000Z'}
 assert.equal(checked(v,cfg).operation_id,id)
 for(const patch of [{format:'complete069_service_operation_v1'},{login:'agentstudio_stage_worker'},{group:'agentstudio_api'},{baseline_catalog_sha256:'bad'},{target:{...cfg.target,database_oid:'6'}},{password:'raw'},{action:'worker'},{runtime_authorization:true},{services_started:true}])assert.throws(()=>checked({...v,...patch},cfg))
 assert.equal(refusal(Error('private SQL password')),'complete069_review_worker_operation_refused')
 assert.equal(refusal(Error('complete069_review_worker_hba_refused')),'complete069_review_worker_hba_refused')
})
