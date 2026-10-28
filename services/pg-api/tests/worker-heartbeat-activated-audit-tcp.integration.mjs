// Author-only until its own fresh hosted PG18 matrix executes.
// No local DB/SQL. This tests catalog comparisons, never operator/Native authority.
import test from 'node:test'
import {requireWorkerHeartbeatCi,workerHeartbeatCiAdminOptions} from './helpers/worker-heartbeat-ci-guard.mjs'

const capability=requireWorkerHeartbeatCi()
workerHeartbeatCiAdminOptions(capability,'telemetry') // Genuine private capability before helper/pg/business imports.
const {workerHeartbeatActivatedAuditFixture,heartbeatActivatedAuditSafeError}=await import('./helpers/worker-heartbeat-activated-audit-ci.mjs')

test('real activated reader catalog beside unchanged original full060/full061',{concurrency:false,timeout:600000},async t=>{
 let f
 try{
  f=await workerHeartbeatActivatedAuditFixture(capability)
  const cases=[
   ['fixed source pins, distinct telemetry DB and original050/060/061 plus physical main rows',()=>f.baseline()],
   ['actual reader LOGIN has exactly two independent TCP slots and third connection is refused',()=>f.readerIdentityAndLimits()],
   ['actual DB owner and writer LOGIN cannot impersonate the reader catalog session',()=>f.ownerAndWriterRefused()],
   ['explicit OID/login/role-count profiles are comparisons only and incorrect expectations refuse',()=>f.profileRefusals()],
   ['committed owner LOGIN drift refuses then compensation restores owner NOLOGIN',()=>f.ownerLoginDrift()],
   ['existing real reader TCP detects its committed NOLOGIN drift and recovers',()=>f.readerNoLoginDrift()],
   ['actual nineteenth telemetry role refuses then is removed',()=>f.extraRoleDrift()],
   ['actual writer inheritance and connection-limit drifts refuse and restore',()=>f.roleFlagDrifts()],
   ['real heap alias with builtin handler refuses and restores original heap',()=>f.heapAliasDrift()],
   ['real extra reader table SELECT ACL refuses and is revoked',()=>f.tableAclDrift()],
   ['real generation-column SELECT ACL refuses and is revoked',()=>f.columnAclDrift()],
   ['real column default drift refuses and restores original expression',()=>f.columnDefaultDrift()],
   ['real security-definer routine body pin drift refuses then original definition restores',()=>f.routineBodyDrift()],
   ['actual reader cannot SELECT registry/generation/sensitive rows or SET ROLE',()=>f.readerRawDenied()],
   ['unchanged dormant auditor really refuses the active LOGIN catalog',()=>f.dormantRejects()],
   ['actual reader requires RR, READ ONLY and controlled search_path',()=>f.contextsRefuse()],
   ['reader pools close, original roles/schema/registry restore and main physical rows remain identical',()=>f.finish()],
  ]
  for(const [name,run]of cases)await t.test(name,{concurrency:false,timeout:120000},async()=>{
   try{await run()}catch(error){throw heartbeatActivatedAuditSafeError('case_failed',error)}
  })
 }catch(error){throw heartbeatActivatedAuditSafeError('suite_failed',error)}
 finally{if(f)await f.close()}
})
