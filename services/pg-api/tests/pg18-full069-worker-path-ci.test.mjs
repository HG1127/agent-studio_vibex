import test from 'node:test'
import assert from 'node:assert/strict'
import {pathCiApproval,requirePathCiApproval,assertPathCiResult,assertPathCiWarm,assertPathCiCleanup,pathCiOriginalSevenLogins,pathCiTelemetryHbaLines,pathCiTelemetryHbaText,pathCiNetworkDrift} from './helpers/pg18-full069-worker-path-ci-contract.mjs'
import fs from 'node:fs'
import {inspectComplete069ReviewWorkerHba} from '../src/pg18-complete-review-worker-plan.mjs'
import {verifyPg18ServiceHbaOrder} from '../src/native-activation-cli.mjs'
import {runFull069WorkerPathCiFixture} from './pg18-full069-worker-path-ci.integration.mjs'
import {runFull069WorkerPathCi} from '../../../ops/pg18-full069-worker-path-ci.mjs'
import {runOwnedFull069WorkerPathCi} from './helpers/pg18-full069-worker-path-ci-fixture.mjs'
import {liveEntries} from '../src/pg18-full069-worker-live-contract.mjs'
import {pathCiTrustFailures} from './helpers/pg18-full069-worker-path-ci-contract.mjs'
import {full069WorkerLiveTrustFailureData} from '../src/pg18-full069-worker-live-trust.mjs'
import {WorkerHeartbeatControlError,controlErrorCodes} from '../src/worker-heartbeat-activation-control-contract.ts'
const id='11111111-1111-4111-8111-111111111111',clone=v=>JSON.parse(JSON.stringify(v))
function record(){return {format:'pg18_full069_worker_path_validation_result_v1',run_id:id,validation_completed:true,reason:null,details:{worker_stop:liveEntries.map(entry=>({id:entry.id,graceful:true,absent:true,supervisor_absent:true,identity_verified:true,forced:false})),native_stop:{id:'native',graceful:true,absent:true,supervisor_absent:true,identity_verified:true,forced:false},proxy_stop:{graceful:true,proxy_closed:true},cleanup:{telemetry_backend_count:0,readers_in_flight:0,queues:{jobs:0,runs:0,reviews:0,queries:0}}},qualifies_run:false,qualifying_window_started:false,BEGIN_or_END_receipt_issued:false,production_cutover_allowed:false}}
test('bounded result data requires all false qualification flags and cannot change a run identifier',()=>{const r=record();assert.equal(assertPathCiResult(r,id),r);assert.equal(assertPathCiCleanup(r,id),true);assert.throws(()=>assertPathCiResult(r,'different'),/short_result/);for(const key of['qualifies_run','qualifying_window_started','BEGIN_or_END_receipt_issued','production_cutover_allowed']){const v=clone(r);v[key]=true;assert.throws(()=>assertPathCiResult(v,id),/short_result/)}})
test('failure, unknown fields and a warm observation cannot be presented as completed validation',()=>{for(const edit of[r=>r.validation_completed=false,r=>r.reason='full069_worker_live_failed',r=>r.exitCode=0]){const r=record();edit(r);assert.throws(()=>assertPathCiResult(r,id),/short_result/)}const warm={...record(),validation_completed:false,details:{phase:'warm'}};assert.equal(assertPathCiWarm(warm,id),warm);assert.throws(()=>assertPathCiResult(warm,id),/short_result/);assert.throws(()=>assertPathCiWarm(record(),id),/short_result/)})
test('seven graceful stops require actual identity and both process absences with no forced kill',()=>{for(const edit of[r=>r.details.worker_stop.pop(),r=>r.details.worker_stop[0].id='different',r=>r.details.worker_stop[1].id=r.details.worker_stop[0].id,r=>r.details.worker_stop[0].forced=true,r=>r.details.worker_stop[0].identity_verified=false,r=>r.details.worker_stop[0].absent=false,r=>r.details.worker_stop[0].supervisor_absent=false,r=>r.details.native_stop.graceful=false,r=>r.details.native_stop.id='prepare',r=>r.details.native_stop.identity_verified=false,r=>r.details.native_stop.forced=true,r=>r.details.proxy_stop.graceful=false,r=>r.details.proxy_stop.proxy_closed=false]){const r=record();edit(r);assert.throws(()=>assertPathCiCleanup(r,id),/short_cleanup/)}})
for(const queue of['jobs','runs','reviews','queries'])test('nonempty '+queue+' prevents successful CI evidence',()=>{const r=record();r.details.cleanup.queues[queue]=1;assert.throws(()=>assertPathCiCleanup(r,id),/short_cleanup/)})
test('any remaining Writer/Reader backend, in-flight Reader or missing queue refuses',()=>{for(const edit of[r=>r.details.cleanup.telemetry_backend_count=1,r=>r.details.cleanup.readers_in_flight=1,r=>delete r.details.cleanup.queues.jobs,r=>r.details.cleanup.queues.unchecked=0]){const r=record();edit(r);assert.throws(()=>assertPathCiCleanup(r,id),/short_cleanup/)}})
test('separate bounded approval has one exact value and does not replace original CI admission',async()=>{assert.throws(()=>requirePathCiApproval({}),/approval/);assert.throws(()=>requirePathCiApproval({AGENT_STUDIO_FULL069_WORKER_PATH_CI_APPROVED:'production'}),/approval/);assert.equal(requirePathCiApproval({AGENT_STUDIO_FULL069_WORKER_PATH_CI_APPROVED:pathCiApproval}),undefined);await assert.rejects(runFull069WorkerPathCiFixture(['--run'],{AGENT_STUDIO_FULL069_WORKER_PATH_CI_APPROVED:pathCiApproval}),/complete_install_ci_refused:ambient_environment_required/);await assert.rejects(runFull069WorkerPathCi(['--run'],{AGENT_STUDIO_FULL069_WORKER_PATH_CI_APPROVED:pathCiApproval}),/complete_install_ci_refused:ambient_environment_required/)})
test('unknown verbs and duration arguments reject before setup imports',async()=>{for(const argv of[[],['--run-short'],['--run','--minimum-ms','1'],['--accept-end']]){await assert.rejects(runFull069WorkerPathCiFixture(argv),/arguments/);await assert.rejects(runFull069WorkerPathCi(argv),/arguments/)}})
test('fabricated fixture references cannot reach stage/Pool/filesystem setup',async()=>{for(const forged of[{},Object.create(null),null,undefined])await assert.rejects(runOwnedFull069WorkerPathCi(forged),/complete_install_ci_refused:unsealed_ci_permit/)})
// Pure pg_hba_file_rules-shaped vectors; not a PostgreSQL execution/proof.
function hbaRows(text){return text.trimEnd().split('\n').map((line,i)=>{const fields=line.split(/\s+/),local=fields[0]==='local',cidr=local?[]:fields[3].split('/');return {rule_number:i+1,type:fields[0],database:[fields[1]],user_name:[fields[2]],address:local?null:cidr[0],netmask:local?null:cidr[1]==='32'?'255.255.255.255':cidr[0].includes(':')?'::':'0.0.0.0',auth_method:fields[local?3:4],error:null,options:null}})}
const originalSevenSafe=rows=>pathCiOriginalSevenLogins.every(login=>{const v=verifyPg18ServiceHbaOrder(rows,login);return v.local===true&&v.tcp===true})
test('telemetry HBA retains all original C7 strings and exact four Review rules with actual newline encoding',()=>{
 const lines=pathCiTelemetryHbaLines(),text=pathCiTelemetryHbaText(),review='agentstudio_review_worker_login'
 assert.deepEqual(lines.slice(0,4),['local all '+review+' reject','host agent_studio '+review+' 127.0.0.1/32 scram-sha-256','host all '+review+' 0.0.0.0/0 reject','host all '+review+' ::/0 reject'])
 const original=['local all postgres peer',...pathCiOriginalSevenLogins.map(n=>'local agent_studio '+n+' reject'),'local all all reject','host all postgres 127.0.0.1/32 scram-sha-256',...pathCiOriginalSevenLogins.map(n=>'host agent_studio '+n+' 127.0.0.1/32 scram-sha-256'),'host all all 0.0.0.0/0 reject','host all all ::/0 reject']
 assert.deepEqual(lines.filter(line=>!line.includes(review)&&!line.includes('studio_telemetry_')),original)
 assert.equal(lines.length,57);assert.equal(text,lines.join('\n')+'\n');assert.equal(text.includes('\\n'),false);assert.equal(Buffer.from(text).filter(byte=>byte===10).length,57)
 const rows=hbaRows(text);assert.equal(originalSevenSafe(rows),true);assert.equal(inspectComplete069ReviewWorkerHba(rows).safe,true)
})
test('original Review guard reproduces old telemetry rewrite refusal while original C7 guards still pass',()=>{
 const review='agentstudio_review_worker_login',old=pathCiTelemetryHbaLines().filter(line=>line!=='host all '+review+' 0.0.0.0/0 reject'&&line!=='host all '+review+' ::/0 reject').map(line=>line==='local all '+review+' reject'?'local agent_studio '+review+' reject':line).join('\n')+'\n',rows=hbaRows(old),observed=inspectComplete069ReviewWorkerHba(rows)
 assert.equal(originalSevenSafe(rows),true);assert.equal(observed.local_reject,false);assert.equal(observed.remote_ipv4_reject,false);assert.equal(observed.remote_ipv6_reject,false);assert.equal(observed.safe,false)
})
test('generic remote rejection never substitutes either required fixed Review family guard',()=>{
 for(const suffix of['0.0.0.0/0','::/0']){const lines=pathCiTelemetryHbaLines().filter(line=>line!=='host all agentstudio_review_worker_login '+suffix+' reject'),rows=hbaRows(lines.join('\n')+'\n');assert.ok(lines.includes('host all all '+suffix+' reject'));assert.equal(inspectComplete069ReviewWorkerHba(rows).safe,false);assert.equal(originalSevenSafe(rows),true)}
})
test('earlier trust refuses through original current Review and C7 guards',()=>{
 const rows=hbaRows('host all all 127.0.0.1/32 trust\n'+pathCiTelemetryHbaText());assert.equal(inspectComplete069ReviewWorkerHba(rows).safe,false);assert.equal(originalSevenSafe(rows),false)
})
test('all17 telemetry LOOPBACK rules precede generic rejects and leave owner NOLOGIN unlisted',()=>{
 const lines=pathCiTelemetryHbaLines(),hosts=lines.filter(line=>line.startsWith('host agent_studio_telemetry ')),locals=lines.filter(line=>line.startsWith('local agent_studio_telemetry '));assert.equal(hosts.length,17);assert.equal(locals.length,17);assert.equal(lines.some(line=>line.includes('studio_telemetry_owner')),false)
 for(const line of hosts)assert.ok(lines.indexOf(line)<lines.indexOf('host all all 0.0.0.0/0 reject'))
 for(const line of locals)assert.ok(lines.indexOf(line)<lines.indexOf('local all all reject'))
 assert.ok(hosts.every(line=>line.endsWith(' 127.0.0.1/32 scram-sha-256')));assert.ok(locals.every(line=>line.endsWith(' reject')))
})
test('fixture reads actual final PG rules after reload then calls unchanged guards before telemetry creation',()=>{
 const source=fs.readFileSync(new URL('./helpers/pg18-full069-worker-path-ci-fixture.mjs',import.meta.url),'utf8'),reload=source.indexOf("'hba_reload_wait',5000)"),read=source.indexOf('FROM pg_hba_file_rules ORDER BY rule_number',reload),review=source.indexOf('inspectComplete069ReviewWorkerHba(hbaRows)',read),seven=source.indexOf('verifyPg18ServiceHbaOrder(hbaRows,login)',read),create=source.indexOf("await s.admin.query('CREATE DATABASE agent_studio_telemetry OWNER postgres')",read)
 assert.ok(reload>=0&&read>reload&&review>read&&seven>read&&create>review&&create>seven);assert.ok(source.includes('input:Buffer.from(hbaText)'));assert.ok(source.includes("fail('current_hba_review_or_original_seven')"));assert.equal(source.slice(read,create).includes('.filter('),false);assert.ok(source.includes('/var/lib/agentstudio-full069-path-runtime-'));assert.equal(source.includes('/opt/agentstudio-full069-path-ci-'),false)
})
test('network drift observation distinguishes exact bytes and chain counters without granting hash acceptance',()=>{
 const before='*filter\n:OUTPUT ACCEPT [1:20]\n:AS_F069 - [0:0]\n-A OUTPUT -m owner --uid-owner 61001 -j AS_F069\nCOMMIT',after=before.replace('[1:20]','[2:40]'),same=pathCiNetworkDrift(before,before),changed=pathCiNetworkDrift(before,after)
 assert.equal(same.exact_same,true);assert.equal(same.changed_only_chain_counters,false);assert.equal(same.changed_line_count,0);assert.equal(changed.exact_same,false);assert.equal(changed.changed_only_chain_counters,true);assert.equal(changed.changed_line_count,1);for(const v of[same,changed]){assert.equal(v.observed_data_only,true);assert.equal(v.qualifies_run,false);assert.equal(v.production_cutover_allowed,false);assert.equal(Object.isFrozen(v),true)}
})
test('network drift cannot classify policy, UID, rule order, extra rule or rule counter changes as chain counters',()=>{
 const before='*filter\n:OUTPUT ACCEPT [1:20]\n-A OUTPUT -m owner --uid-owner 61001 -j ACCEPT\n-A OUTPUT -j REJECT\nCOMMIT'
 for(const after of[before.replace('OUTPUT ACCEPT','OUTPUT DROP'),before.replace('61001','61002'),before.replace('-j ACCEPT','-j DROP'),before.replace('COMMIT','-A OUTPUT -j ACCEPT\nCOMMIT'),before.split('\n').reverse().join('\n'),before.replace('--uid-owner 61001','--uid-owner 61001 -c 1 2'),before.replace(':OUTPUT ACCEPT [1:20]',':OUTPUT ACCEPT [2:40] ').replace('61001','61002')])assert.equal(pathCiNetworkDrift(before,after).changed_only_chain_counters,false)
})
test('network drift data refuses nontext, NUL and oversized input before analysis',()=>{for(const value of[null,{},Buffer.from('x'),'a\0b','x'.repeat(2097153)]){assert.throws(()=>pathCiNetworkDrift(value,''),/network_observation_shape/);assert.throws(()=>pathCiNetworkDrift('',value),/network_observation_shape/)}})

const diagnostic=(phase='source_capture',error=new Error('private-message'),key=null)=>full069WorkerLiveTrustFailureData(phase,error,key),encoded=v=>JSON.stringify(v)+'\n'
test('actual trust formatter observations survive the bounded CI stderr parser without authority',()=>{
 for(const phase of ['host_admission','configuration','operator_key','signed_profile','source_capture','source_verify','host_runtime','telemetry_read','telemetry_envelope','telemetry_root_profile','telemetry_binding','writer_scope','credential_read','C_records','handle_publish']){
  const record=diagnostic(phase),result=pathCiTrustFailures('unrelated bounded stderr\n'+encoded(record));assert.deepEqual(result,[record]);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result[0]));assert.equal(result[0].observed_data_only,true);assert.equal(result[0].qualifies_run,false);assert.equal(result[0].production_cutover_allowed,false);assert.equal(JSON.stringify(result).includes('private-message'),false)
 }
})
test('original control error codes are forwarded only under the exact closed control class',()=>{
 for(const code of controlErrorCodes){const record=diagnostic('telemetry_root_profile',new WorkerHeartbeatControlError(code));assert.deepEqual(pathCiTrustFailures(encoded(record)),[record]);assert.deepEqual(pathCiTrustFailures(encoded({...record,error_class:'Error'})),[])}
})
test('stderr diagnostic fields cannot smuggle messages, secrets, paths or positive flags',()=>{
 const original=diagnostic();for(const edit of [v=>v.message='secret',v=>v.path='/etc/private',v=>v.error_code='private-password',v=>v.error_class='CustomError',v=>v.phase='private-path',v=>v.event='success',v=>v.qualifies_run=true,v=>v.production_cutover_allowed=true,v=>v.observed_data_only=false,v=>delete v.error_code]){const record={...original};edit(record);assert.deepEqual(pathCiTrustFailures(encoded(record)),[])}
})
test('only fixed credential names can cross the credential read observation boundary',()=>{
 for(const key of ['admin','api','native_auth','worker','identity','broker','index_worker','index_broker','review_worker','employee_profile','employee_password','tls_ca','tls_certificate','tls_key','executor']){const record=diagnostic('credential_read',new Error(),key);assert.deepEqual(pathCiTrustFailures(encoded(record)),[record]);assert.deepEqual(pathCiTrustFailures(encoded({...record,phase:'source_capture'})),[])}assert.deepEqual(pathCiTrustFailures(encoded({...diagnostic('credential_read'),credential_key:'/etc/private'})),[])
})
test('unknown, mismatched and nonstring diagnostic error codes never cross the parser',()=>{
 for(const [error_class,error_code]of [[null,'ENOENT'],['WorkerHeartbeatControlError','EPIPE'],['Error','28P01'],['Error',{}],['Error',1]])assert.deepEqual(pathCiTrustFailures(encoded({...diagnostic(),error_class,error_code})),[])
 for(const Type of [Error,TypeError,RangeError,SyntaxError]){const record=diagnostic('credential_read',Object.assign(new Type('secret'),{code:'EACCES'}),'admin');assert.deepEqual(pathCiTrustFailures(encoded(record)),[record])}
 assert.deepEqual(pathCiTrustFailures(encoded(diagnostic('source_capture',null))),[diagnostic('source_capture',null)])
})
test('malformed, NUL, oversized and ambiguous stderr cannot produce a diagnostic record',()=>{
 for(const value of [null,undefined,{},Buffer.from('x'),'\0'+encoded(diagnostic()),'x'.repeat(262145),encoded(diagnostic()).repeat(2),'[]\nnull\n1\n{}\n'])assert.deepEqual(pathCiTrustFailures(value),[])
 const oversized=encoded({...diagnostic(),extra:'x'.repeat(1024)});assert.deepEqual(pathCiTrustFailures(oversized),[]);assert.deepEqual(pathCiTrustFailures('invalid JSON\n'+encoded(diagnostic())),[diagnostic()])
})
