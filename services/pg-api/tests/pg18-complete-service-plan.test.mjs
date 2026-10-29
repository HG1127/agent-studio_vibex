// Pure only: no driver, server, mock positive auditor or filesystem secrets.
import test from 'node:test'
import assert from 'node:assert/strict'
import {completeServiceActions,completeServiceDefinition,completeServiceSql,completeServicePlan,parseCompleteServiceArguments,completeServiceRefusal} from '../src/pg18-complete-service-plan.mjs'
import {serviceLoginKinds,serviceLogins} from '../src/pg18-service-login-policy.mjs'
import {checkedCompleteServiceIntent} from '../src/pg18-complete-service-journal.mjs'
const sha='a'.repeat(64),id='12345678-1234-4123-8123-123456789012',argv=['--prepare','--profile','complete069','--action','worker','--confirm-database','agent_studio','--expected-source-sha256',sha,'--expected-system-identifier','123','--expected-database-oid','5','--operation-id',id]
test('full069 plan reuses original six definitions and keeps Executor out of old protocol',()=>{
 const p=completeServicePlan();assert.deepEqual(p.original_six,serviceLoginKinds)
 for(const k of serviceLoginKinds)assert.equal(completeServiceDefinition(k),serviceLogins[k])
 assert.equal(completeServiceActions.length,8);assert.equal(p.first_admin_implementation,'native-first-admin-cli.mjs:run')
 for(const key of ['migration_ledger_write','old_protocol_changed','executor_account_included','automatic_retry_authorized','services_started','network_used','secrets_read','writes_performed','production_cutover_allowed'])assert.equal(p[key],false)
 for(const v of ['executor','native','api;DROP ROLE postgres','constructor','__proto__','first-admin'])assert.throws(()=>completeServiceDefinition(v))
})
test('exact explicit argument schema binds action, source, physical target and unique operation',()=>{
 const c=parseCompleteServiceArguments(argv);assert.deepEqual(c,{mode:'prepare',action:'worker',sourceSha256:sha,target:{system_identifier:'123',database_oid:'5'},operationId:id})
 assert.deepEqual(parseCompleteServiceArguments(['--plan']),{mode:'plan'})
 for(const [i,value]of [[0,'--activate'],[2,'complete050'],[4,'executor'],[6,'agent_studio_telemetry'],[8,sha+'0'],[10,'0'],[12,'-1'],[14,id.toUpperCase()]]){const a=[...argv];a[i]=value;if(i===14)a[i]='not-a-uuid';assert.throws(()=>parseCompleteServiceArguments(a))}
 assert.throws(()=>parseCompleteServiceArguments([...argv,'--repair']))
})
test('fixed role SQL preserves API/Worker original password and closes SCRAM interpolation',()=>{
 assert.deepEqual(completeServiceSql('api'),['ALTER ROLE agentstudio_stage_login LOGIN'])
 assert.deepEqual(completeServiceSql('worker'),['ALTER ROLE agentstudio_stage_worker LOGIN'])
 const verifier='SCRAM-SHA-256$15000:'+Buffer.alloc(16,1).toString('base64')+'$'+Buffer.alloc(32,2).toString('base64')+':'+Buffer.alloc(32,3).toString('base64')
 for(const k of ['native-auth','identity','broker','index-worker','index-broker']){const s=completeServiceSql(k,verifier).join(';');assert.doesNotMatch(s,/schema_migrations|pg18_service_login_|TEMP|agent_studio_telemetry/);assert.match(s,/LOGIN PASSWORD 'SCRAM-SHA-256/);if(k!=='native-auth')assert.match(s,/WITH ADMIN FALSE, INHERIT FALSE, SET TRUE/)}
 for(const k of ['api','worker'])assert.throws(()=>completeServiceSql(k,verifier))
 for(const value of [undefined,'secret',verifier+"';ALTER ROLE postgres LOGIN;--",verifier.replace('15000','4096'),verifier.replace('AQEB','AQE=')])assert.throws(()=>completeServiceSql('broker',value))
})
test('separate root intent binds exact cohort and cannot contain secret or old receipt fields',()=>{
 const c=parseCompleteServiceArguments(argv),v={format:'complete069_service_operation_v1',profile:'complete069',database:'agent_studio',operator:'postgres',action:c.action,operation_id:id,source_sha256:sha,target:c.target,verifier_sha256:'b'.repeat(64),started_at:'2026-10-29T00:00:00.000Z'}
 assert.equal(checkedCompleteServiceIntent(v,c).operation_id,id)
 for(const extra of [{password:'redacted'},{verifier:'redacted'},{email:'redacted'},{receipt:'pg18_service_login_worker_001'},{activated_at:'now'}])assert.throws(()=>checkedCompleteServiceIntent({...v,...extra},c))
 assert.throws(()=>checkedCompleteServiceIntent({...v,target:{...v.target,database_oid:'6'}},c))
 assert.equal(completeServiceRefusal(Error('private SQL or password')),'complete_service_operation_refused')
 assert.equal(completeServiceRefusal(Object.assign(Error('private SQL'),{code:'42702'})),'complete_service_sqlstate_42702')
})
