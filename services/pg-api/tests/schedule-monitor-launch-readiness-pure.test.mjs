import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {requireMonitorScheduleLaunchReady} from '../src/schedule-monitor-launch-readiness.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(1),occurrence=id(2),schedule=id(3)
// Narrow SqlClient terminal frames only. No Pool,Worker,SQL evaluator or DB.
// The SELECT capability assumptions below are independently checked against
// authored001/044/074 source; these are not PostgreSQL execution evidence.
function client(options={}){
 const state={role:'agentstudio_api',actor:owner,...options},trace=[]
 return{state,trace,async query(sql,params=[]){
  if(/^(?:BEGIN|COMMIT|ROLLBACK)|(?:INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/.test(sql))throw Error('unexpected_transaction_or_write')
  if(sql.startsWith('SET LOCAL ROLE ')){state.role=sql.slice('SET LOCAL ROLE '.length);trace.push({phase:'role',role:state.role});return{rows:[]}}
  if(sql.includes("current_user='agentstudio_api'")){trace.push({phase:'context',role:state.role});return{rows:[{ok:state.role==='agentstudio_api'&&state.actor===params[0]&&!state.badContext}]}}
  if(sql.includes('FROM agentstudio.schedule_occurrences')){trace.push({phase:'metadata',role:state.role,params:[...params]});if(state.role!=='agentstudio_api')throw Object.assign(Error('synthetic_permission_refused'),{code:'42501'});assert.deepEqual(params,[occurrence,owner]);assert(sql.startsWith('SELECT schedule_id FROM '));assert(sql.endsWith('WHERE id=$1::uuid AND owner_user_id=$2::uuid'));return{rows:state.metadata??[{schedule_id:schedule}]}}
  if(sql==='SELECT agentstudio.monitor_live_schedule_ready($1::uuid) AS ready'){trace.push({phase:'ready',role:state.role,params:[...params]});if(state.role!=='agentstudio_worker')throw Error('synthetic_RPC_role_refused');assert.deepEqual(params,[schedule]);if(state.refusal)throw state.refusal;return{rows:state.reply??[{ready:true}]}}
  throw Error('unexpected_statement')
 },release(){throw Error('helper_must_not_release_parent_connection')}}
}
test('actual readiness helper reads only owned API metadata,calls worker RPC,and restores API before admission',async()=>{
 const c=client();await requireMonitorScheduleLaunchReady(c,owner,occurrence);assert.deepEqual(c.trace.map(t=>[t.phase,t.role]),[['context','agentstudio_api'],['metadata','agentstudio_api'],['role','agentstudio_worker'],['ready','agentstudio_worker'],['role','agentstudio_api']]);assert.equal(c.state.actor,owner);assert.deepEqual(c.trace[1].params,[occurrence,owner]);assert.deepEqual(c.trace[3].params,[schedule])
})
test('ordinary schedule false preserves existing no-monitor behavior and restores API',async()=>{
 const c=client({reply:[{ready:false}]});await requireMonitorScheduleLaunchReady(c,owner,occurrence);assert.equal(c.state.role,'agentstudio_api');assert.equal(c.trace.filter(t=>t.phase==='ready').length,1)
})
for(const start of [{role:'agentstudio_worker'},{actor:id(9)},{badContext:true}])test('wrong API/owner admission context stops before metadata or RPC '+JSON.stringify(start),async()=>{const c=client(start);await assert.rejects(requireMonitorScheduleLaunchReady(c,owner,occurrence),e=>e.code==='owned_admission_context_required');assert.deepEqual(c.trace.map(t=>t.phase),['context'])})
for(const pair of [['bad',occurrence],[owner,'bad'],['',occurrence],[null,occurrence],[owner,null]])test('invalid owner/occurrence never reaches client '+JSON.stringify(pair),async()=>{const c=client();await assert.rejects(requireMonitorScheduleLaunchReady(c,...pair),e=>e.code==='invalid_schedule_claim');assert.equal(c.trace.length,0)})
for(const metadata of [[],[{schedule_id:'bad'}],[{schedule_id:null}],[{}],[{schedule_id:schedule},{schedule_id:schedule}]])test('absent/foreign/malformed metadata cannot switch worker or call RPC '+JSON.stringify(metadata),async()=>{const c=client({metadata});await assert.rejects(requireMonitorScheduleLaunchReady(c,owner,occurrence),e=>e.code==='schedule_monitor_occurrence_unavailable');assert.deepEqual(c.trace.map(t=>t.phase),['context','metadata'])})
for(const reply of [[],[{}],[{ready:null}],[{ready:'true'}],[{ready:true},{ready:true}]])test('unconfirmed RPC reply fails without admission or local retry '+JSON.stringify(reply),async()=>{const c=client({reply});await assert.rejects(requireMonitorScheduleLaunchReady(c,owner,occurrence),e=>e.code==='schedule_monitor_readiness_unconfirmed');assert.equal(c.trace.filter(t=>t.phase==='ready').length,1);assert.equal(c.trace.filter(t=>t.phase==='metadata').length,1);assert.equal(c.state.role,'agentstudio_worker')})
test('original RPC refusal propagates identically,no re-entry/admission/local rollback or reset masks it',async()=>{const refusal=Object.assign(Error('previous_monitor_check_incomplete'),{code:'closed_synthetic_refusal'}),c=client({refusal});await assert.rejects(requireMonitorScheduleLaunchReady(c,owner,occurrence),e=>e===refusal);assert.equal(c.state.role,'agentstudio_worker');assert.equal(c.trace.filter(t=>t.phase==='ready').length,1)})
test('proven previous worker table-probe violates source capability;new actual helper preserves minimal roles',async()=>{
 const c=client({role:'agentstudio_worker'});await assert.rejects(c.query('SELECT agentstudio.monitor_live_schedule_ready(schedule_id) FROM agentstudio.schedule_occurrences WHERE id=$1::uuid AND owner_user_id=$2::uuid',[occurrence,owner]),e=>e.code==='42501')
 const read=file=>fs.readFileSync(new URL('../../../'+file,import.meta.url),'utf8'),core=read('db/postgres/001_stage_schema.sql'),scheduleSQL=read('db/postgres/migrations/pg_v9_044_schedule_execution.sql'),monitorSQL=read('db/postgres/migrations/pg_v9_074_monitor_live.sql');assert(core.includes('ON agentstudio.jobs TO agentstudio_worker'));assert(!/GRANT[^;]*schedule_occurrences[^;]*TO agentstudio_worker/i.test(core+scheduleSQL+monitorSQL));assert(scheduleSQL.includes('ON agentstudio.schedule_occurrences TO agentstudio_api'));assert(monitorSQL.includes('GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_schedule_ready(uuid) TO agentstudio_worker;'));assert(!monitorSQL.includes('GRANT EXECUTE ON FUNCTION agentstudio.monitor_live_schedule_ready(uuid) TO agentstudio_api;'))
})
test('scheduler source invokes helper after verified identity/owner and before Agent admission;failure/backoff unchanged',()=>{
 const s=fs.readFileSync(new URL('../src/schedule-runtime-worker.ts',import.meta.url),'utf8');assert(!s.includes('monitor_live_schedule_ready(schedule_id) FROM'))
 const actor=s.indexOf('const result=await withActorClient(db,this.pool,ctx.identity'),ownerCheck=s.indexOf('if(owner!==ctx.owner_user_id)',actor),ready=s.indexOf('await requireMonitorScheduleLaunchReady(client,owner,claim.occurrence_id)',ownerCheck),admit=s.indexOf('this.agents.admitOwned',ready);assert(actor>=0&&ownerCheck>actor&&ready>ownerCheck&&admit>ready);assert(s.includes('if(this.monitorBusinessEnabled)await requireMonitorScheduleLaunchReady'))
 const open=s.indexOf('monitor_live_open_occurrence',admit),origin=s.indexOf('schedule_register_origin',admit);assert(origin>admit&&open>origin);assert(s.includes('schedule_launch_failed'));assert(!s.includes('setTimeout'));assert(!s.includes('GRANT '));assert(!s.includes('REVOKE '))
})
