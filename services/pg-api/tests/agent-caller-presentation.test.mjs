// Pure presentation/session/transaction-boundary mechanics. Synthetic rows
// and query-order doubles supply no database or caller authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {verifyWorkflowV2HistorySource} from '../src/workflow-v2-run-repository.ts'
import {HttpError} from '../src/contracts.ts'
import {agentCallerRecentHistory,agentCallerElapsed,agentCallerApiExamples} from '../../../src/lib/pgNativeAgentCallerPresentation.ts'
import {createPgNativeAgentCallerSession} from '../../../src/lib/pgNativeAgentCallerSession.ts'
import {PgNativeAgentCallerError} from '../../../src/lib/pgNativeAgentCallers.ts'
const item=(id,credential,mode,version,created,status='succeeded')=>({id,credential_id:credential,mode,version_id:version,created_ms:created,updated_ms:created+1200,status}),now=Date.parse('2026-10-29T00:30:00Z'),rows=[item('1','api-key','public','old-api-version',Date.parse('2026-10-28T23:59:59Z')),item('2','embed-key','public','embed-version',now),item('3','api-key','owner_test','old-api-version',now,'paused'),item('4','absent','public','retained-version',now,'failed')],history={items:rows,stats:{total:999,succeeded:900,failed:20,active:70,unknown:9,retained:true}},keys=[{id:'api-key',kind:'api',version_id:'new-api-version'},{id:'embed-key',kind:'embed',version_id:'embed-version'}]
test('Owner source filters distinguish API, embed and private tests without inventing a missing credential kind',()=>{
 for(const [filter,ids]of[['all',['1','2','3','4']],['api',['1']],['embed',['2']],['owner_test',['3']],['unknown',['4']]])assert.deepEqual(agentCallerRecentHistory(history,keys,filter,'all',now).rows.map(r=>r.item.id),ids)
})
test('history version filter uses the immutable record version after the same key binds a newer publish',()=>{
 const value=agentCallerRecentHistory(history,keys,'all','old-api-version',now);assert.deepEqual(value.rows.map(r=>r.item.id),['1','3']);assert.equal(value.versions.includes('new-api-version'),false);assert.deepEqual(agentCallerRecentHistory(history,keys,'api','old-api-version',now).rows.map(r=>r.item.id),['1'])
})
test('recent source and success counts remain explicitly limited to loaded rows and UTC boundaries',()=>{
 const value=agentCallerRecentHistory(history,keys,'embed','all',now);assert.deepEqual(value.summary,{loaded:4,today:3,api:1,embed:1,owner_test:1,unknown:1,succeeded:2,success_rate:50});assert.equal(history.stats.total,999);assert.equal(value.rows.length,1)
})
test('empty loaded records and elapsed display do not invent success or negative execution latency',()=>{
 assert.equal(agentCallerRecentHistory({items:[],stats:history.stats},[],undefined,undefined,now).summary.success_rate,0);assert.equal(agentCallerElapsed(1000,900),'0 ms');assert.equal(agentCallerElapsed(1000,1200),'200 ms');assert.equal(agentCallerElapsed(1000,2600),'1.6 s')
})
test('public examples preserve independent Bearer, actual browser Origin, original UUID confirmation and no automatic submit',()=>{
 const v=agentCallerApiExamples('https://native.example/__pg_native/api/v2/public/agent','https://customer.example');assert.ok(v.curl.includes('Authorization: Bearer $AGENT_CALLER_KEY'));assert.ok(v.curl.includes('Origin: https://customer.example'));assert.ok(v.curl.includes('/confirm'));assert.ok(v.curl.includes('@choice.json'));assert.ok(v.javascript.includes('credentials: "omit"'));assert.ok(v.javascript.includes('redirect: "error"'));assert.ok(v.javascript.includes('request("/confirm", "POST", { choice })'));assert.ok(v.javascript.includes('const submitOnce ='));assert.equal(/await submitOnce\(/.test(v.javascript),false);assert.equal(/(?:localStorage|sessionStorage|while\s*\(|setInterval)/.test(v.javascript),false);assert.equal(v.javascript.includes('Cookie'),false);assert.equal(v.curl.includes('rhk_'),false)
})
test('copy examples cannot reflect credential URL userinfo, query strings, arbitrary endpoints or noncanonical Origins',()=>{
 for(const [base,origin]of[['http://native.example/api/v2/public/agent','https://customer.example'],['https://key@native.example/api/v2/public/agent','https://customer.example'],['https://native.example/api/v2/public/agent?secret=x','https://customer.example'],['https://native.example/other','https://customer.example'],['https://native.example/api/v2/public/agent','https://customer.example/path']])assert.throws(()=>agentCallerApiExamples(base,origin))
})
const emptyHistory=()=>({protocol:'agent_caller_owner_history_v1',items:[],stats:{total:0,succeeded:0,failed:0,active:0,unknown:0,retained:true}}),emptyWorkspace=()=>({protocol:'agent_caller_owner_workspace_v1',budget:null,credentials:[],agents:[],owner_epoch:1}),flush=async()=>{await new Promise(r=>setImmediate(r))}
test('background history refresh never reloads fee forms or writes and stops during an original unknown mutation',async()=>{
 let workspaces=0,histories=0,writes=0;const api={workspace:async()=>{workspaces++;return emptyWorkspace()},history:async()=>{histories++;return emptyHistory()},change:async()=>{writes++;throw new PgNativeAgentCallerError(0,'agent_caller_outcome_unknown')}},session=createPgNativeAgentCallerSession(api,()=>{},()=>{});session.activate(true,true,true,false);await flush();assert.equal(workspaces,1);assert.equal(histories,1);await session.refreshHistory();assert.equal(workspaces,1);assert.equal(histories,2);assert.equal(writes,0);assert.equal(session.snapshot().busy,false);await session.change({action:'budget',request_id:'00000000-0000-4000-8000-000000000001',expected_revision:0,enabled:false,daily_run_limit:1,daily_model_limit:1,daily_tool_limit:0,concurrent_limit:1,fee_ack:null,confirm:true});assert.ok(session.snapshot().pending);await session.refreshHistory();assert.equal(histories,2);assert.equal(writes,1);session.dispose()
})
test('a real pending history response is aborted and fenced when its employee panel leaves',async()=>{
 let hold=false,release,signal;const api={workspace:async()=>emptyWorkspace(),history:async s=>{if(!hold)return emptyHistory();signal=s;return new Promise(r=>{release=r})}},session=createPgNativeAgentCallerSession(api,()=>{},()=>{});session.activate(true,true,false,false);await flush();hold=true;const pending=session.refreshHistory();session.activate(false,true,false,false);assert.equal(signal.aborted,true);release({...emptyHistory(),stats:{...emptyHistory().stats,total:999}});await pending;assert.equal(session.snapshot().active,false);assert.equal(session.snapshot().history.stats.total,0);session.dispose()
})

// This query-order double only models PostgreSQL's aborted-transaction rule;
// it executes no SQL and supplies no positive snapshot/auditor authority.
function historyTransaction(){let aborted=false;const calls=[];return{calls,fail(){aborted=true},db:{async query(sql){calls.push(sql);if(sql==='ROLLBACK TO SAVEPOINT workflow_v2_history_source'){aborted=false;return{rows:[]}}if(aborted)throw Error('synthetic_transaction_aborted');return{rows:[]}}}}}
test('revoked historical source stays unavailable while rollback makes the later Owner metadata read possible',async()=>{
 const f=historyTransaction();assert.equal(await verifyWorkflowV2HistorySource(f.db,async()=>{f.fail();throw new HttpError(409,'agent_caller_source_unavailable')}),false);await f.db.query('later_owner_metadata');assert.deepEqual(f.calls,['SAVEPOINT workflow_v2_history_source','ROLLBACK TO SAVEPOINT workflow_v2_history_source','RELEASE SAVEPOINT workflow_v2_history_source','later_owner_metadata'])
})
test('historical source infrastructure failures keep their original identity after savepoint recovery',async()=>{
 const f=historyTransaction(),failure=Error('synthetic_infrastructure_failure');await assert.rejects(()=>verifyWorkflowV2HistorySource(f.db,async()=>{f.fail();throw failure}),e=>e===failure);assert.deepEqual(f.calls,['SAVEPOINT workflow_v2_history_source','ROLLBACK TO SAVEPOINT workflow_v2_history_source','RELEASE SAVEPOINT workflow_v2_history_source'])
})
test('a completed historical source check releases its savepoint without rolling back the enclosing read',async()=>{
 const f=historyTransaction();let checks=0;assert.equal(await verifyWorkflowV2HistorySource(f.db,async()=>{checks++}),true);assert.equal(checks,1);assert.deepEqual(f.calls,['SAVEPOINT workflow_v2_history_source','RELEASE SAVEPOINT workflow_v2_history_source'])
})
