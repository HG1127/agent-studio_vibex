// Test-only074 prerequisite setup. No import-time SQL/Pool/Worker/network effects.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {completeProfileSqlBody} from '../../src/pg18-complete-profile-source.mjs'
export const monitor074PrerequisiteMigrations=Object.freeze([
 '063_agent_template_market','064_agent_plan_workflow','065_agent_internal_share',
 '066_agent_approval_delegation','067_native_local_devices','068_agent_public_callers','069_owner_tool_trials',
])
export const monitor074FixtureBaseVersions=Object.freeze([
 'pg18_fresh_runtime_001','pg18_native_auth_001','pg_v8_001','pg_v8_004','pg_v8_005',
 ...Array.from({length:44},(_,i)=>'pg_v9_'+String(i+19).padStart(3,'0')),
].sort())
const sha=v=>createHash('sha256').update(v).digest('hex')
export function monitor074PrerequisitePlan(read){
 return Object.freeze(monitor074PrerequisiteMigrations.map(suffix=>{
  const path='db/postgres/migrations/pg_v9_'+suffix+'.sql',raw=read(path)
  // Root's closed path + accepted raw-hash selector. No glob, normalization,
  // ledger fabrication, SQL rewrite or removed installation preflight.
  const sql=completeProfileSqlBody(path,raw)
  return Object.freeze({path,version:'pg_v9_'+suffix.slice(0,3),sha256:sha(raw),sql})
 }))
}
export function assertMonitor074PrerequisiteLedger(rows,versions,baseline=[]){
 assert(Array.isArray(rows),'complete unfiltered migration ledger required')
 assert(rows.every(r=>r&&Object.keys(r).sort().join(',')==='description,version'&&typeof r.version==='string'&&typeof r.description==='string'),'complete ledger row shape')
 assert.deepEqual(rows.map(r=>r.version).sort(),[...versions].sort(),'unexpected/missing/duplicate migration ledger row')
 for(const row of baseline)assert.deepEqual(rows.find(r=>r.version===row.version),row,'existing migration receipt changed')
}
const ledgerSql='SELECT version,description FROM agentstudio.schema_migrations ORDER BY version'
export async function installMonitor074Prerequisites(f){
 // Called only after requireNativeMonitor074Ci/assertSources and the real
 // agentDesignGenuineFixture. That fixture installs001-057, then058-062.
 const plan=monitor074PrerequisitePlan(p=>readFileSync(new URL('../../../../'+p,import.meta.url)))
 const db=await f.adminPool.connect();let begun=false,committing=false,discard=false,baseline
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');begun=true
  await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='45000ms'; SET LOCAL lock_timeout='5000ms'")
  baseline=(await db.query(ledgerSql)).rows
  assertMonitor074PrerequisiteLedger(baseline,monitor074FixtureBaseVersions)
  const versions=[...monitor074FixtureBaseVersions]
  for(const step of plan){
   await db.query(step.sql)
   versions.push(step.version)
   assertMonitor074PrerequisiteLedger((await db.query(ledgerSql)).rows,versions,baseline)
  }
  committing=true;await db.query('COMMIT');begun=false
 }catch(error){if(committing)discard=true;throw error}
 finally{if(begun)try{await db.query('ROLLBACK')}catch{discard=true}db.release(discard)}
 // The same real original API login and unchanged audit sequence used by
 // verifyCompleteProfile:066 recursively verifies065->064->063->062 and the
 // preceding chain;067,068,069 each run their actual current catalog checks.
 const [{verifyApprovalDelegationCredentials},{verifyNativeLocalDeviceOriginal,verifyNativeLocalDeviceSchema},{verifyAgentCallerCredentials},{verifyOwnerToolTrialCredentials}]=await Promise.all([
  import('../../src/approval-delegation-audit.ts'),import('../../src/native-local-device-audit.ts'),import('../../src/agent-caller-audit.ts'),import('../../src/owner-tool-trial-audit.ts'),
 ])
 const api=await f.pool.connect();let readBegun=false,readDiscard=false
 try{
  await api.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');readBegun=true
  await api.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL statement_timeout='45000ms'; SET LOCAL lock_timeout='5000ms'")
  assert.equal(await verifyNativeLocalDeviceOriginal(api,'agentstudio_api'),true)
  await api.query('SET LOCAL ROLE agentstudio_api')
  assert.equal(await verifyApprovalDelegationCredentials(api),true)
  assert.equal(await verifyNativeLocalDeviceSchema(api),true)
  assert.equal(await verifyAgentCallerCredentials(api),true)
  assert.equal(await verifyOwnerToolTrialCredentials(api),true)
 }finally{try{if(readBegun)await api.query('ROLLBACK')}catch(error){readDiscard=true;throw error}finally{api.release(readDiscard)}}
 // Re-read every ledger row on the actual admin connection after API audits.
 // No WHERE, filtered projection or substituted version can make this pass.
 const final=(await f.db.query(ledgerSql)).rows
 assertMonitor074PrerequisiteLedger(final,[...monitor074FixtureBaseVersions,...plan.map(p=>p.version)],baseline)
 return Object.freeze({versions:plan.map(p=>p.version),source_sha256s:plan.map(p=>p.sha256),actual_predecessor_audits:true})
}
