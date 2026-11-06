// Pure policy/schema tests. These classifiers are never positive DB auditors.
import test from 'node:test'
import assert from 'node:assert/strict'
import {reviewStackDefinitions as defs,reviewStackPriorLogins as prior,parseReviewStackArguments as parse,reviewStackSql as sql,inspectReviewStackRoleMatrix as matrix,inspectReviewStackHba as hba,reviewStackPlan as plan} from '../src/pg18-complete-review-stack-plan.mjs'
import {checkedReviewStackIntent as checked} from '../src/pg18-complete-review-stack-journal.mjs'
import {completeServiceActions} from '../src/pg18-complete-service-plan.mjs'
import {serviceLoginKinds} from '../src/pg18-service-login-policy.mjs'
const source='a'.repeat(64),id='12345678-1234-4123-8123-123456789012',reviewId='12345678-1234-4123-8123-123456789013',executorId='12345678-1234-4123-8123-123456789014',args=['--prepare','--profile','complete069','--confirm-database','agent_studio','--expected-source-sha256',source,'--expected-system-identifier','123','--expected-database-oid','5','--review-operation-id',reviewId,'--executor-operation-id',executorId,'--operation-id',id]
const verifier=n=>'SCRAM-SHA-256$15000:'+Buffer.alloc(16,n).toString('base64')+'$'+Buffer.alloc(32,n+1).toString('base64')+':'+Buffer.alloc(32,n+2).toString('base64')
test('fixed three-account SQL preserves original limits/groups and excludes every old ABI or object grant',()=>{
 assert.deepEqual(defs.map(d=>[d.login,d.group,d.connlimit]),[['agentstudio_review_dispatch_login','agentstudio_review_dispatch',-1],['agentstudio_design_worker_login','agentstudio_design_worker',-1],['agentstudio_design_dispatch_login','agentstudio_design_dispatch',-1]])
 assert.equal(prior.find(d=>d.login==='agentstudio_local_executor_login').connlimit,3);assert.equal(prior.find(d=>d.login==='agentstudio_review_worker_login').connlimit,3)
 assert.equal(serviceLoginKinds.length,6);assert.equal(completeServiceActions.length,8)
 const v=Object.fromEntries(defs.map((d,i)=>[d.login,verifier(i+1)])),statements=sql(v)
 assert.equal(statements.length,12);assert.equal(statements.filter(s=>s.startsWith('CREATE ROLE')).length,3);assert.equal(statements.filter(s=>s.startsWith('ALTER ROLE')).length,3)
 for(const d of defs){assert.ok(statements.includes('GRANT CONNECT ON DATABASE agent_studio TO '+d.login));assert.ok(statements.includes('GRANT '+d.group+' TO '+d.login+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE'))}
 assert.doesNotMatch(statements.join('\n'),/IF NOT EXISTS|schema_migrations|GRANT (?:SELECT|USAGE|EXECUTE)|agent_studio_telemetry|agentstudio_api TO|ALTER ROLE agentstudio_stage/)
 for(const patch of [{extra:verifier(2)}, {[defs[0].login]:'raw-password'}, {[defs[1].login]:verifier(1)+"';DROP ROLE postgres"}])assert.throws(()=>sql({...v,...patch}))
 assert.equal(plan().runtime_authorization,false);assert.equal(plan().preparation_starts_worker_Broker_provider_or_queue,false)
})
test('exact argument and external-intent schemas bind all three operation IDs, source and physical target',()=>{
 const cfg=parse(args);assert.equal(cfg.executorOperationId,executorId);assert.equal(cfg.reviewOperationId,reviewId)
 const value={format:'complete069_review_stack_operation_v1',profile:'complete069',database:'agent_studio',operator:'postgres',operation_id:id,source_sha256:source,target:cfg.target,verifier_sha256s:Object.fromEntries(defs.map(d=>[d.login,'b'.repeat(64)])),before_catalog_sha256:'c'.repeat(64),before_images_sha256:'d'.repeat(64),before_ledger_sha256:'e'.repeat(64),review_operation_id:reviewId,review_intent_sha256:'f'.repeat(64),executor_operation_id:executorId,executor_intent_sha256:'1'.repeat(64),started_at:'2026-10-30T00:00:00.000Z'}
 assert.equal(checked(value,cfg).operation_id,id)
 for(const patch of [{password:'raw'},{format:'complete069_review_worker_operation_v1'},{review_operation_id:id},{executor_intent_sha256:'bad'},{verifier_sha256s:{...value.verifier_sha256s,agentstudio_stage_worker:'b'.repeat(64)}},{target:{...cfg.target,database_oid:'6'}}])assert.throws(()=>checked({...value,...patch},cfg))
 for(const [at,v]of [[0,'--serve'],[4,'other'],[6,'bad'],[12,id],[14,reviewId]]){const a=[...args];a[at]=v;assert.throws(()=>parse(a))}
 assert.throws(()=>parse([...args,'--role','arbitrary']));assert.deepEqual(parse(['--plan']),{mode:'plan'})
})
const systems=['pg_checkpoint','pg_create_subscription','pg_database_owner','pg_execute_server_program','pg_maintain','pg_monitor','pg_read_all_data','pg_read_all_settings','pg_read_all_stats','pg_read_server_files','pg_signal_autovacuum_worker','pg_signal_backend','pg_stat_scan_tables','pg_use_reserved_connections','pg_write_all_data','pg_write_server_files']
function rows(prepared){const flags={login:false,inherit:false,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false,connlimit:-1,config:null,until:null,verifier:null},snapshotRoles=[...new Set(prior.flatMap(d=>[d.login,...d.groups]).concat(defs.map(d=>d.group)))],loginMap=new Map([...prior,...(prepared?defs.map(d=>({...d,groups:[d.group]})):[])].map(d=>[d.login,d]));const app=[...new Set([...snapshotRoles,...(prepared?defs.map(d=>d.login):[])])].map((name,i)=>{const d=loginMap.get(name);return {...flags,id:String(20000+i),name,...(d?{login:true,connlimit:d.connlimit,verifier:verifier(1)}:{})}});return {snapshotRoles,roles:[...app,...systems.map((name,i)=>({...flags,id:String(100+i),name,inherit:true})),{...flags,id:'10',name:'postgres',login:true,inherit:true,superuser:true,bypassrls:true,createdb:true,createrole:true,replication:true,verifier:verifier(1)}],members:[...['pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables'].map(parent=>({child:'pg_monitor',parent,grantor:'postgres',admin:false,inherit:true,set:true})),...prior.flatMap(d=>d.groups.map(parent=>({child:d.login,parent,grantor:'postgres',admin:false,inherit:false,set:true}))),...(prepared?defs.map(d=>({child:d.login,parent:d.group,grantor:'postgres',admin:false,inherit:false,set:true})):[])]}}
test('all-global matrix requires Executor, exact memberships and fixed new limits; unknown roles cannot be filtered',()=>{
 for(const prepared of [false,true]){const f=rows(prepared);assert.equal(matrix(f.roles,f.members,f.snapshotRoles,prepared).prepared,prepared)
  for(const patch of [{name:'unreviewed_login',id:'90000'},{name:'agentstudio_unknown',id:'90000'},{name:'pg_unknown',id:'99'}])assert.throws(()=>matrix([...f.roles,{...f.roles[0],...patch}],f.members,f.snapshotRoles,prepared),/unknown_global_role_refused/)
  assert.throws(()=>matrix(f.roles.filter(r=>r.name!=='agentstudio_local_executor_login'),f.members,f.snapshotRoles,prepared))
  assert.throws(()=>matrix(f.roles,f.members.filter(m=>m.child!=='pg_monitor'),f.snapshotRoles,prepared))
  assert.throws(()=>matrix(f.roles,[...f.members,{child:'pg_monitor',parent:'pg_write_all_data',grantor:'postgres',admin:false,inherit:true,set:true}],f.snapshotRoles,prepared))
  assert.throws(()=>matrix(f.roles,[...f.members,{child:'agentstudio_stage_worker',parent:'agentstudio_design_worker',grantor:'postgres',admin:false,inherit:false,set:true}],f.snapshotRoles,prepared))
  assert.throws(()=>matrix(f.roles.map(r=>r.name==='pg_monitor'?{...r,id:'90000'}:r),f.members,f.snapshotRoles,prepared))
 }
 const f=rows(true);assert.throws(()=>matrix(f.roles.map(r=>r.name===defs[0].login?{...r,connlimit:3}:r),f.members,f.snapshotRoles,true))
 assert.throws(()=>matrix(f.roles,f.members.map(r=>r.child===defs[1].login?{...r,inherit:true}:r),f.snapshotRoles,true))
})
test('fixed three-user HBA accepts only first-match SCRAM plus local and both-family remote reject',()=>{
 let number=0;const r=(type,database,user_name,auth_method,address=null,netmask=null)=>({rule_number:++number,type,database:[database],user_name:[user_name],auth_method,address,netmask,error:null,options:null}),good=defs.flatMap(d=>[r('local','all',d.login,'reject'),r('host','agent_studio',d.login,'scram-sha-256','127.0.0.1','255.255.255.255'),r('host','all',d.login,'reject','0.0.0.0','0.0.0.0'),r('host','all',d.login,'reject','::','::')])
 assert.equal(hba(good),true)
 const trust={...good[1],rule_number:1,database:['all'],auth_method:'trust'};assert.equal(hba([trust,...good.map(x=>({...x,rule_number:x.rule_number+1}))]),false)
 assert.equal(hba(good.filter(x=>x.user_name[0]!==defs[2].login)),false)
 assert.equal(hba(good.map(x=>({...x,user_name:['all']}))),false)
})
