import test from "node:test"
import assert from "node:assert/strict"
import {preparationFixture} from "./helpers/pg18-preparation-fixture.mjs"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {ScheduleDraftRepository} from "../src/schedule-draft-repository.ts"
import {ScheduleRuntimeRepository} from "../src/schedule-runtime-repository.ts"
import {ScheduleRuntimeWorker} from "../src/schedule-runtime-worker.ts"
import {SCHEDULE_BACKGROUND_ACK} from "../src/schedule-runtime-contract.ts"
import {verifyScheduleRuntimeSchema,verifyScheduleCredentials} from "../src/schedule-runtime-audit.ts"
import {selectScheduleRuntime,SCHEDULE_RUNTIME_MARKER} from "../src/schedule-runtime-policy.ts"
import {parseScheduleActivation,recurrenceNext} from "../src/schedule-runtime-contract.ts"
import {randomUUID} from "node:crypto"
import {ScheduleInventoryRepository} from "../src/schedule-inventory-repository.ts"
import {ToolConnectionRepository} from "../src/tool-connection-repository.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {createHandler} from "../src/http.ts"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
import {createServer} from "node:http"
export async function scheduleFixture(){
  const f=await preparationFixture()
  try{const admin=await f.ready()
    const identity=(await f.db.query("SELECT external_issuer AS issuer,external_subject AS subject FROM agentstudio.users WHERE id=$1",[admin.id])).rows[0]
    let tail=Promise.resolve()
    const pool={async connect(){const prior=tail;let release;tail=new Promise(resolve=>{release=resolve});await prior;return {...f.api,release}}}
    return {...f,admin,identity,pool,flows:new WorkflowRepository(pool),runs:new WorkflowV2RunRepository(pool),drafts:new ScheduleDraftRepository(pool),schedules:new ScheduleRuntimeRepository(pool,{enabled:true}),dispatcher:new ScheduleRuntimeWorker(pool,"schedule-test")}}
  catch(error){await f.close();throw Error("schedule_fixture_failed:"+error.message+" position:"+(error.position??"unknown"))}
}
test("native scheduling installs genuine 044 after043 with private authority/origin/receipt ledgers and no runtime activation",async()=>{
  const f=await scheduleFixture()
  try{
    await verifyScheduleRuntimeSchema(f.pool)
    assert.equal((await f.db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v9_044'")).rows.length,1)
    const roles=(await f.db.query("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname='agentstudio_scheduler'")).rows
    assert.equal(roles[0].safe,true)
    for(const table of ["schedule_execution_authorities","schedule_execution_origins","schedule_execution_effect_receipts"]){
      const state=(await f.db.query("SELECT relrowsecurity AND relforcerowsecurity AS forced FROM pg_class WHERE oid=('agentstudio.'||$1)::regclass",[table])).rows[0]
      assert.equal(state.forced,true)
      for(const role of ["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch","agentstudio_native_auth"])
        assert.equal((await f.db.query("SELECT has_any_column_privilege($1,('agentstudio.'||$2)::regclass,'SELECT,INSERT,UPDATE,REFERENCES') AS exposed",[role,table])).rows[0].exposed,false)
    }
    assert.equal((await f.db.query("SELECT has_column_privilege('agentstudio_api','agentstudio.schedule_occurrences','lease_token','SELECT') AS exposed")).rows[0].exposed,false)
  }finally{await f.close()}
})
const node=(id,type,data={})=>({id,type,position:{x:0,y:0},data:{title:id,...data}})
const edge=(source,target)=>({id:source+"_"+target,source,target})
const graph=(effect=true)=>({version:2,nodes:[node("start","start"),...(effect?[node("tool","tool",{tool:"calculate",params_template:'{"expression":"2+2"}'})]:[]),node("end","end",{output_template:effect?"{{tool.output}}":"{{start.output}}"})],edges:effect?[edge("start","tool"),edge("tool","end")]:[edge("start","end")]})
async function activated(f,{effect=true,rule={kind:"interval",interval_minutes:15},maxAuto=10,maxOccurrences=null,runtimeGraph,anchor=new Date().toISOString()}={}){
  const flow=await f.flows.create(f.identity,"Synthetic schedule",runtimeGraph??graph(effect))
  const draft=await f.drafts.create(f.identity,{name:"Synthetic recurrence",kind:"workflow",target_id:flow.id,time_zone:"UTC",rule})
  const body={expected_revision:draft.revision,expected_target_revision:flow.revision,instruction:"synthetic scheduled instruction",max_steps:1,anchor_at:anchor,expires_at:null,max_occurrences:maxOccurrences,max_auto_effects:maxAuto,background_ack:SCHEDULE_BACKGROUND_ACK,knowledge_charge_ack:null,request_id:randomUUID()}
  return {flow,draft,body,activation:await f.schedules.activate(f.identity,draft.id,body)}
}
function scheduledWorker(pool,id,options={}){return new WorkflowV2Worker(pool,id,{...options,scheduleExecutionApproved:true})}
async function complete(f,id,worker){for(let i=0;i<30;i++){
  const tick=await worker.tick(),view=await f.runs.get(f.identity,id)
  if(["succeeded","failed","paused","awaiting_approval"].includes(view.run.status))return {tick,view}
}throw Error("scheduled_synthetic_run_did_not_complete")}
test("explicit standing authority starts one owned run/job/origin atomically and auto-approves bounded read work",async()=>{
  const f=await scheduleFixture();let calls=0
  try{
    const {draft,body,activation}=await activated(f)
    assert.equal((await f.schedules.activate(f.identity,draft.id,body)).replayed,true)
    const state=await f.schedules.describe(f.identity,draft.id);assert.equal(state.source_current,true)
    const occurrence=await f.schedules.runNow(f.identity,draft.id,Number(activation.revision))
    await assert.rejects(f.schedules.runNow(f.identity,draft.id,Number(activation.revision)),/schedule_already_queued/)
    const launch=await f.dispatcher.tick();assert.equal(launch.status,"started");assert.equal(launch.run_id,occurrence.run_id)
    assert.equal((await f.db.query("SELECT (SELECT count(*) FROM agentstudio.runs)::int AS runs,(SELECT count(*) FROM agentstudio.jobs)::int AS jobs,(SELECT count(*) FROM agentstudio.schedule_execution_origins)::int AS origins")).rows[0].origins,1)
    const worker=scheduledWorker(f.pool,"scheduled-flow",{executor:{async execute(){calls++;return "4"}}})
    const {view}=await complete(f,launch.run_id,worker);assert.equal(view.run.status,"succeeded");assert.equal(view.run.result_text,"4");assert.equal(calls,1)
    assert.equal((await f.dispatcher.tick()).status,"idle")
    const receipts=(await f.db.query("SELECT count(*)::int AS n FROM agentstudio.schedule_execution_effect_receipts")).rows[0].n;assert.equal(receipts,1)
    const approval=(await f.db.query("SELECT status,knowledge_query_charge_acknowledged FROM agentstudio.approvals")).rows[0];assert.equal(approval.status,"approved");assert.equal(approval.knowledge_query_charge_acknowledged,false)
    const history=await new ScheduleInventoryRepository(f.pool).occurrences(f.identity,draft.id)
    assert.equal(history[0].run_status,"succeeded");assert.equal(Object.hasOwn(history[0],"lease_token"),false)
    await f.schedules.control(f.identity,draft.id,Number(activation.revision),"pause")
    assert.equal((await f.runs.get(f.identity,launch.run_id)).run.result_text,"4")
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.audit_events WHERE action='schedule.standing_approval'")).rows[0].n,1)
  }finally{await f.close()}
})
test("pause and changed target fence nonterminal scheduled work, but a manual run retains ordinary step approval",async()=>{
  const f=await scheduleFixture();let calls=0
  try{
    const {flow,draft,activation}=await activated(f)
    await f.schedules.runNow(f.identity,draft.id,Number(activation.revision));const launched=await f.dispatcher.tick()
    await f.schedules.control(f.identity,draft.id,Number(activation.revision),"pause")
    const worker=scheduledWorker(f.pool,"source-fence",{executor:{async execute(){calls++;return "4"}}})
    assert.equal((await worker.tick()).status,"failed");assert.equal(calls,0)
    assert.equal((await f.db.query("SELECT last_error_code FROM agentstudio.runs WHERE id=$1",[launched.run_id])).rows[0].last_error_code,"schedule_source_unavailable")
    const manual=await f.runs.submit(f.identity,flow.id,{expected_revision:flow.revision,idempotency_key:"manual_schedule_fence",instruction:"manual"})
    assert.equal((await worker.tick()).status,"awaiting_approval");assert.equal(calls,0)
    assert.equal((await f.runs.get(f.identity,manual.run.id)).approvals[0].status,"pending")
    const changed=await activated(f);await f.schedules.runNow(f.identity,changed.draft.id,Number(changed.activation.revision))
    await f.flows.update(f.identity,changed.flow.id,"Updated target",graph(),changed.flow.revision)
    assert.equal((await f.dispatcher.tick()).status,"stale")
    assert.equal((await f.schedules.describe(f.identity,changed.draft.id)).enabled,false)
  }finally{await f.close()}
})
test("atomic launch rollback retries the same occurrence/run id, exhausts four attempts and supports an explicit failed-start retry",async()=>{
  const f=await scheduleFixture()
  try{
    const {draft,activation}=await activated(f,{effect:false});const queued=await f.schedules.runNow(f.identity,draft.id,Number(activation.revision))
    await f.db.exec("CREATE FUNCTION public.synthetic_schedule_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_schedule_fault'; END $$; CREATE TRIGGER synthetic_schedule_fault BEFORE INSERT ON agentstudio.jobs FOR EACH ROW EXECUTE FUNCTION public.synthetic_schedule_fault()")
    for(let i=1;i<=4;i++){
      const result=await f.dispatcher.tick();assert.equal(result.status,i===4?"failed_start":"retryable")
      assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,0)
      assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.schedule_execution_origins")).rows[0].n,0)
      await f.db.query("UPDATE agentstudio.schedule_occurrences SET next_retry_at=clock_timestamp()-interval '1 second' WHERE id=$1",[queued.occurrence_id])
    }
    assert.equal((await f.dispatcher.tick()).status,"idle")
    const reset=await f.schedules.retryFailedStart(f.identity,draft.id,Number(activation.revision),queued.occurrence_id);assert.equal(reset.run_id,queued.run_id)
    await f.db.exec("DROP TRIGGER synthetic_schedule_fault ON agentstudio.jobs")
    const started=await f.dispatcher.tick();assert.equal(started.status,"started");assert.equal(started.run_id,queued.run_id)
    await assert.rejects(f.schedules.retryFailedStart(f.identity,draft.id,Number(activation.revision),queued.occurrence_id),e=>e.code==="schedule_failed_start_not_retryable")
    assert.equal((await f.db.query("SELECT used_occurrences FROM agentstudio.schedule_execution_authorities")).rows[0].used_occurrences,1)
  }finally{await f.close()}
})
test("single occurrences disable naturally without revoking their run, and activation replay after due time does not reactivate them",async()=>{
  const f=await scheduleFixture()
  try{
    const future=new Date(Date.now()+86400000),{draft,body,activation}=await activated(f,{effect:false,rule:{kind:"once",start_date:future.toISOString().slice(0,10),local_time:"12:00"}})
    // Synthetic clock advance: next_at is the scheduler cursor, deliberately
    // excluded from the owner's immutable authority material.
    await f.db.query("UPDATE agentstudio.schedules SET next_at=clock_timestamp()-interval '1 second' WHERE id=$1",[draft.id])
    const started=await f.dispatcher.tick();assert.equal(started.status,"started")
    const state=await f.schedules.describe(f.identity,draft.id);assert.equal(state.enabled,false);assert.equal(state.next_at,null);assert.equal(state.revision,Number(activation.revision));assert.equal(state.source_current,true)
    assert.equal((await complete(f,started.run_id,scheduledWorker(f.pool,"once-workflow"))).view.run.status,"succeeded")
    assert.equal((await f.schedules.activate(f.identity,draft.id,body)).replayed,true)
    assert.equal((await f.schedules.describe(f.identity,draft.id)).enabled,false)
    assert.equal((await f.dispatcher.tick()).status,"idle")
  }finally{await f.close()}
})
test("automatic effect quota falls back to step consent; external POST is never automatically approved",async()=>{
  const f=await scheduleFixture();let calls=0
  try{
    const two={version:2,nodes:[node("start","start"),node("one","tool",{tool:"calculate",params_template:'{"expression":"1+1"}'}),node("two","tool",{tool:"calculate",params_template:'{"expression":"2+2"}'}),node("end","end",{output_template:"{{two.output}}"})],edges:[edge("start","one"),edge("one","two"),edge("two","end")]}
    const a=await activated(f,{runtimeGraph:two,maxAuto:1});await f.schedules.runNow(f.identity,a.draft.id,Number(a.activation.revision));const first=await f.dispatcher.tick()
    const worker=scheduledWorker(f.pool,"quota",{executor:{async execute(){calls++;return "synthetic"}}})
    assert.equal((await complete(f,first.run_id,worker)).view.run.status,"awaiting_approval");assert.equal(calls,1)
    await f.runs.cancel(f.identity,first.run_id)
    const tools=new ToolConnectionRepository(f.pool,Buffer.from("0123456789abcdef".repeat(4),"hex"))
    const connection=await tools.create(f.identity,{name:"Synthetic external write",description:"Synthetic fixture only",url:"https://api.example.com/v1/write",method:"POST",headers:[],body_template:"{{input}}",timeout_s:12,enabled:true})
    const external={version:2,nodes:[node("start","start"),node("post","tool",{tool_binding:{connection_id:connection.id,connection_revision:connection.revision},params_template:'{"value":"synthetic"}'}),node("end","end",{output_template:"{{post.output}}"})],edges:[edge("start","post"),edge("post","end")]}
    const b=await activated(f,{runtimeGraph:external});await f.schedules.runNow(f.identity,b.draft.id,Number(b.activation.revision));const second=await f.dispatcher.tick()
    assert.equal((await complete(f,second.run_id,worker)).view.run.status,"awaiting_approval");assert.equal(calls,1)
  }finally{await f.close()}
})
test("a lost automatic effect response remains paused across restarts and is never sent twice",async()=>{
  const f=await scheduleFixture();let calls=0
  try{
    const a=await activated(f);await f.schedules.runNow(f.identity,a.draft.id,Number(a.activation.revision));const run=await f.dispatcher.tick()
    const options={executor:{async execute(){calls++;throw Error("synthetic_lost_response")}}}
    assert.equal((await complete(f,run.run_id,scheduledWorker(f.pool,"lost",options))).view.run.status,"paused")
    assert.equal((await scheduledWorker(f.pool,"restart",options).tick()).status,"idle");assert.equal(calls,1)
    await assert.rejects(f.schedules.retryFailedStart(f.identity,a.draft.id,Number(a.activation.revision),run.occurrence_id),e=>e.code==="schedule_failed_start_not_retryable")
  }finally{await f.close()}
})
test("scheduler is explicitly disabled by default and recurrence math preserves DST and lost-response replay",()=>{
  assert.equal(selectScheduleRuntime({}),false)
  assert.throws(()=>selectScheduleRuntime({AGENT_STUDIO_PG18_SCHEDULE_RUNTIME_ENABLED:"true"}),/unsafe_native_schedule_activation/)
  assert.throws(()=>selectScheduleRuntime({AGENT_STUDIO_PG18_SCHEDULE_RUNTIME_APPROVED:SCHEDULE_RUNTIME_MARKER}),/unsafe_native_schedule_activation/)
  assert.equal(selectScheduleRuntime({AGENT_STUDIO_PG18_SCHEDULE_RUNTIME_ENABLED:"true",AGENT_STUDIO_PG18_SCHEDULE_RUNTIME_APPROVED:SCHEDULE_RUNTIME_MARKER}),true)
  const anchor="2026-01-01T00:00:00.000Z",rule={kind:"daily",local_time:"02:30"}
  assert.equal(new Date(recurrenceNext(rule,"America/New_York",anchor,Date.parse("2026-03-08T06:00:00Z"))).toISOString(),"2026-03-09T06:30:00.000Z")
  assert.equal(new Date(recurrenceNext({kind:"daily",local_time:"01:30"},"America/New_York",anchor,Date.parse("2026-11-01T05:31:00Z"),Date.parse("2026-11-01T05:30:00Z"))).toISOString(),"2026-11-02T06:30:00.000Z")
  const id="11111111-1111-4111-8111-111111111111",row={name:"Once",kind:"workflow",workflow_id:id,agent_spec_id:null,time_zone:"UTC",recurrence:{config_format:"pg_schedule_draft_v1",execution_supported:false,rule:{kind:"once",start_date:"2026-01-01",local_time:"12:00"}}}
  const body={expected_revision:1,expected_target_revision:1,instruction:"Synthetic",max_steps:1,anchor_at:anchor,expires_at:null,max_occurrences:1,max_auto_effects:5,background_ack:SCHEDULE_BACKGROUND_ACK,knowledge_charge_ack:null,request_id:id}
  assert.throws(()=>parseScheduleActivation(body,row,Date.parse("2026-01-02T00:00:00Z")),e=>e.code==="schedule_has_no_future_occurrence")
  assert.equal(parseScheduleActivation(body,row,Date.parse("2026-01-02T00:00:00Z"),true).next,null)
})
test("invalid time zones are quarantined; occurrence quota and crashed fourth launch cannot keep a schedule spinning",async()=>{
  const f=await scheduleFixture()
  try{
    const a=await activated(f,{effect:false,maxOccurrences:1})
    await f.schedules.runNow(f.identity,a.draft.id,Number(a.activation.revision));await f.dispatcher.tick()
    await f.db.query("UPDATE agentstudio.schedules SET next_at=clock_timestamp()-interval '1 second' WHERE id=$1",[a.draft.id])
    assert.equal((await f.dispatcher.tick()).status,"idle");assert.equal((await f.schedules.describe(f.identity,a.draft.id)).enabled,false)
    const b=await activated(f,{effect:false});const queued=await f.schedules.runNow(f.identity,b.draft.id,Number(b.activation.revision))
    await f.db.query("UPDATE agentstudio.schedule_occurrences SET status='launching',attempts=4,lease_until=clock_timestamp()-interval '1 second',lease_token=gen_random_uuid(),lease_owner='dead-worker',lease_version=4 WHERE id=$1",[queued.occurrence_id])
    assert.equal((await f.dispatcher.tick()).status,"stale")
    assert.equal((await f.db.query("SELECT status FROM agentstudio.schedule_occurrences WHERE id=$1",[queued.occurrence_id])).rows[0].status,"failed_start")
    await f.db.query("UPDATE agentstudio.schedules SET time_zone='Broken/Time',next_at=clock_timestamp()-interval '1 second' WHERE id=$1",[b.draft.id])
    assert.equal((await f.dispatcher.tick()).status,"invalid_schedule")
    assert.equal((await f.schedules.describe(f.identity,b.draft.id)).enabled,false)
  }finally{await f.close()}
})
test("private grant, RLS, role and helper-surface drift are refused even when runtime flags are off",async()=>{
  const f=await scheduleFixture()
  try{
    for(const sql of ["ALTER ROLE agentstudio_scheduler LOGIN","GRANT SELECT ON agentstudio.schedule_execution_origins TO agentstudio_worker",
      "GRANT SELECT(lease_token) ON agentstudio.schedule_occurrences TO agentstudio_api","ALTER TABLE agentstudio.schedule_execution_authorities NO FORCE ROW LEVEL SECURITY",
      "GRANT SELECT(password_record) ON agentstudio_auth.accounts TO agentstudio_scheduler",
      "ALTER TABLE agentstudio.runs DISABLE TRIGGER native_schedule_run_status",
      "DROP TRIGGER native_schedule_run_status ON agentstudio.runs",
      "GRANT EXECUTE ON FUNCTION agentstudio.schedule_sync_run_status() TO agentstudio_worker",
      "CREATE FUNCTION agentstudio.schedule_unreviewed() RETURNS boolean LANGUAGE sql AS 'SELECT true'"]){
      await f.rollback(async db=>{await db.query(sql);await db.query("SET LOCAL ROLE agentstudio_api");await assert.rejects(verifyScheduleCredentials(db),/unsafe_native_schedule_privileges/)})
    }
    await verifyScheduleRuntimeSchema(f.pool)
  }finally{await f.close()}
})
test("Worker opt-in is required even for previously queued authority; owner pause and draft deletion remain available after execution is disabled",async()=>{
  const f=await scheduleFixture();let calls=0
  try{
    const a=await activated(f);await f.schedules.runNow(f.identity,a.draft.id,Number(a.activation.revision));const queued=await f.dispatcher.tick()
    const off=new WorkflowV2Worker(f.pool,"schedule-off",{executor:{async execute(){calls++;return "must not send"}}})
    assert.equal((await off.tick()).status,"paused");assert.equal(calls,0)
    assert.equal((await f.db.query("SELECT last_error_code FROM agentstudio.runs WHERE id=$1",[queued.run_id])).rows[0].last_error_code,"schedule_execution_disabled")
    const disabled=new ScheduleRuntimeRepository(f.pool)
    assert.equal((await disabled.describe(f.identity,a.draft.id)).authority_id,a.activation.authority_id)
    assert.equal(await disabled.control(f.identity,a.draft.id,Number(a.activation.revision),"pause"),true)
    await assert.rejects(disabled.runNow(f.identity,a.draft.id,Number(a.activation.revision)+1),e=>e.code==="schedule_execution_disabled")
    const draft=await f.schedules.edit(f.identity,a.draft.id,Number(a.activation.revision)+1,{name:"Edited history",kind:"workflow",target_id:a.flow.id,time_zone:"UTC",rule:{kind:"daily",local_time:"09:00"}})
    assert.equal(await f.drafts.delete(f.identity,draft.id,draft.revision),true)
    assert.equal(await new ScheduleInventoryRepository(f.pool).get(f.identity,draft.id),null)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.schedule_execution_origins WHERE run_id=$1",[queued.run_id])).rows[0].n,1)
  }finally{await f.close()}
})
test("a manual trigger colliding with the automatic once bucket consumes it and advances the cursor without another run",async()=>{
  const f=await scheduleFixture()
  try{
    const tomorrow=new Date(Date.now()+86400000),a=await activated(f,{effect:false,rule:{kind:"once",start_date:tomorrow.toISOString().slice(0,10),local_time:"12:00"}})
    const queued=await f.schedules.runNow(f.identity,a.draft.id,Number(a.activation.revision))
    await f.db.query("UPDATE agentstudio.schedules SET next_at=(SELECT scheduled_for FROM agentstudio.schedule_occurrences WHERE id=$2) WHERE id=$1",[a.draft.id,queued.occurrence_id])
    assert.equal((await f.dispatcher.tick()).run_id,queued.run_id)
    assert.equal((await f.dispatcher.tick()).status,"idle")
    assert.equal((await f.schedules.describe(f.identity,a.draft.id)).enabled,false)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,1)
  }finally{await f.close()}
})
test("Native Cookie/CSRF HTTP routes activate, dedupe, expose safe history and permit pause after execution opt-out",async()=>{
  const f=await scheduleFixture();let server
  try{
    let native;server=createServer((req,res)=>native.handler(req,res));await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
    const origin="http://127.0.0.1:"+server.address().port
    const deps={repository:new AgentSpecRepository(f.pool),scheduleInventory:new ScheduleInventoryRepository(f.pool),scheduleDraftRepository:f.drafts,
      scheduleRuntimeRepository:f.schedules,allowedOrigin:origin,verifyToken:async()=>{throw Error("native_cookie_only")},authenticateRequest:req=>native.authenticateRequest(req)}
    native=createNativeAuthHttpHandler({auth:f.store,allowedOrigin:origin,allowConfigurationWrites:true,allowWorkflowV2Submission:true,allowAutonomousAgentSubmission:true,allowScheduleRuntime:true,businessHandler:createHandler(deps)})
    let cookie=""
    const api=createPgNativePilotApi(async(route,init={})=>{
      const response=await fetch(origin+route,{...init,headers:{...init.headers,...(cookie?{Cookie:cookie}:{}),...(init.method!=="GET"?{Origin:origin}:{})}})
      const next=response.headers.get("set-cookie");if(next)cookie=next.split(";")[0]
      return response
    },"")
    const denied=await fetch(origin+"/api/v2/schedules",{headers:{"X-Rh-User-Id":f.admin.id}});assert.equal(denied.status,401)
    await api.login("synthetic-admin@example.test","SyntheticServiceAdmin#2026")
    assert.equal((await api.getConfigCapabilities()).schedule_execution_enabled,true)
    const flow=await f.flows.create(f.identity,"HTTP schedule",graph(false))
    const draft=await api.createScheduleDraft({name:"HTTP schedule",kind:"workflow",target_id:flow.id,time_zone:"UTC",rule:{kind:"interval",interval_minutes:15}})
    const body={expected_revision:draft.revision,expected_target_revision:flow.revision,instruction:"Synthetic HTTP task",max_steps:1,anchor_at:new Date().toISOString(),expires_at:null,max_occurrences:null,max_auto_effects:5,background_ack:SCHEDULE_BACKGROUND_ACK,knowledge_charge_ack:null,request_id:randomUUID()}
    const grant=await api.activateSchedule(draft.id,body);assert.equal((await api.activateSchedule(draft.id,body)).replayed,true)
    assert.equal((await api.getScheduleExecution(draft.id)).source_current,true)
    const queued=await api.runScheduleNow(draft.id,grant.revision)
    await assert.rejects(api.runScheduleNow(draft.id,grant.revision),e=>e.status===409)
    assert.equal((await f.dispatcher.tick()).run_id,queued.run_id)
    const history=await api.listScheduleOccurrences(draft.id);assert.equal(history.length,1);assert.equal(Object.hasOwn(history[0],"lease_token"),false)
    deps.scheduleRuntimeRepository=new ScheduleRuntimeRepository(f.pool)
    await assert.rejects(api.runScheduleNow(draft.id,grant.revision),e=>e.status===403)
    assert.equal((await api.pauseSchedule(draft.id,grant.revision)).ok,true)
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await f.close()}
})
test("lost launch COMMIT acknowledgement recovers the existing occurrence/run/job/origin without readmitting it",async()=>{
  const f=await scheduleFixture()
  try{
    const a=await activated(f,{effect:false});const queued=await f.schedules.runNow(f.identity,a.draft.id,Number(a.activation.revision));let lost=false
    const pool={async connect(){const db=await f.pool.connect();let registered=false
      return {release:()=>db.release(),async query(sql,args=[]){const result=await db.query(sql,args)
        if(sql.startsWith("SELECT agentstudio.schedule_register_origin("))registered=true
        if(sql==="COMMIT"&&registered&&!lost){lost=true;throw Error("synthetic_schedule_commit_response_lost")}
        return result}}}}
    assert.equal((await new ScheduleRuntimeWorker(pool,"lost-start").tick()).status,"already_started")
    assert.equal((await f.dispatcher.tick()).status,"idle")
    const counts=(await f.db.query("SELECT (SELECT count(*) FROM agentstudio.runs)::int AS runs,(SELECT count(*) FROM agentstudio.jobs)::int AS jobs,(SELECT count(*) FROM agentstudio.schedule_execution_origins)::int AS origins")).rows[0]
    assert.deepEqual(counts,{runs:1,jobs:1,origins:1});assert.equal((await f.runs.get(f.identity,queued.run_id)).run.status,"queued")
  }finally{await f.close()}
})
test("legacy imported schedules with plausible rules remain read-only and cannot acquire native execution authority",async()=>{
  const f=await scheduleFixture()
  try{
    const a=await activated(f,{effect:false})
    const draft=await f.drafts.create(f.identity,{name:"Legacy quarantine",kind:"workflow",target_id:a.flow.id,time_zone:"UTC",rule:{kind:"interval",interval_minutes:15}})
    await f.db.query("UPDATE agentstudio.schedules SET recurrence=jsonb_set(recurrence,'{config_format}','\"legacy_schedule_import_v1\"'::jsonb) WHERE id=$1",[draft.id])
    const body={...a.body,expected_revision:draft.revision,request_id:randomUUID()}
    await assert.rejects(f.schedules.activate(f.identity,draft.id,body),e=>e.code==="schedule_requires_native_draft")
    await assert.rejects(f.schedules.edit(f.identity,draft.id,draft.revision,{name:"Bypass quarantine",kind:"workflow",target_id:a.flow.id,time_zone:"UTC",rule:{kind:"daily",local_time:"09:00"}}),e=>e.code==="schedule_requires_native_draft")
    await assert.rejects(f.schedules.control(f.identity,draft.id,draft.revision,"delete"),e=>e.code==="schedule_requires_native_draft")
    await f.rollback(async db=>{
      await db.query("SET LOCAL ROLE agentstudio_api");await db.query("SELECT set_config('agentstudio.actor_id',$1,true)",[f.admin.id])
      await assert.rejects(db.query("SELECT agentstudio.schedule_activate($1::uuid,$2::bigint,$3::jsonb,clock_timestamp()+interval '15 minutes',agentstudio.schedule_resource_fingerprint($1::uuid),$4::uuid)",
        [draft.id,draft.revision,JSON.stringify((await f.db.query("SELECT execution FROM agentstudio.schedules WHERE id=$1",[a.draft.id])).rows[0].execution),randomUUID()]),/schedule_requires_native_draft/)
    })
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.schedule_execution_authorities WHERE schedule_id=$1",[draft.id])).rows[0].n,0)
    assert.equal(await f.schedules.control(f.identity,draft.id,draft.revision,"pause"),true)
  }finally{await f.close()}
})
test("an unfinished occurrence blocks overlapping launches and terminal run status is reflected in schedule history",async()=>{
  const f=await scheduleFixture()
  try{
    const a=await activated(f,{effect:false});const first=await f.schedules.runNow(f.identity,a.draft.id,Number(a.activation.revision))
    assert.equal((await f.dispatcher.tick()).run_id,first.run_id)
    for(const [index,status] of ["queued","running","awaiting_approval","paused"].entries()){
      await f.db.query("UPDATE agentstudio.runs SET status=$2 WHERE id=$1",[first.run_id,status])
      await f.db.query("UPDATE agentstudio.schedules SET next_at=clock_timestamp()-($2*interval '1 second') WHERE id=$1",[a.draft.id,index+1])
      assert.equal((await f.dispatcher.tick()).status,"skipped_overlap")
    }
    await f.db.query("UPDATE agentstudio.runs SET status='queued' WHERE id=$1",[first.run_id])
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,1)
    const before=await new ScheduleInventoryRepository(f.pool).occurrences(f.identity,a.draft.id)
    assert.equal(before.some(row=>row.status==="skipped_overlap"&&row.error_code==="previous_run_incomplete"&&row.run_id===null),true)
    assert.equal((await complete(f,first.run_id,scheduledWorker(f.pool,"finish-overlap"))).view.run.status,"succeeded")
    const after=await new ScheduleInventoryRepository(f.pool).occurrences(f.identity,a.draft.id)
    assert.equal(after.find(row=>row.run_id===first.run_id).status,"succeeded")
    await f.db.query("UPDATE agentstudio.schedules SET next_at=clock_timestamp()-interval '2 seconds' WHERE id=$1",[a.draft.id])
    assert.equal((await f.dispatcher.tick()).status,"started")
  }finally{await f.close()}
})
test("a live launch reservation blocks another occurrence before a run exists, and cancellation releases the slot",async()=>{
  const f=await scheduleFixture()
  try{
    const a=await activated(f,{effect:false}),queued=await f.schedules.runNow(f.identity,a.draft.id,Number(a.activation.revision))
    const due=(await f.db.query("SELECT scheduled_for FROM agentstudio.schedule_occurrences WHERE id=$1",[queued.occurrence_id])).rows[0].scheduled_for
    const claim=(await f.db.query("SELECT agentstudio.schedule_reserve($1,$2,$3,NULL,'schedule-test') AS claim",[a.draft.id,Number(a.activation.revision),due])).rows[0].claim
    assert.equal(claim.occurrence_id,queued.occurrence_id)
    await f.db.query("UPDATE agentstudio.schedules SET next_at=clock_timestamp()-interval '1 second' WHERE id=$1",[a.draft.id])
    assert.equal((await f.dispatcher.tick()).status,"skipped_overlap")
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,0)
    assert.equal((await f.dispatcher.launch(claim)).run_id,queued.run_id)
    await f.db.query("UPDATE agentstudio.runs SET status='cancelled' WHERE id=$1",[queued.run_id])
    assert.equal((await new ScheduleInventoryRepository(f.pool).occurrences(f.identity,a.draft.id)).find(row=>row.run_id===queued.run_id).status,"cancelled_run")
    await f.db.query("UPDATE agentstudio.schedules SET next_at=clock_timestamp()-interval '2 seconds' WHERE id=$1",[a.draft.id])
    assert.equal((await f.dispatcher.tick()).status,"started")
    await f.db.query("UPDATE agentstudio.runs SET status='failed' WHERE id<>$1",[queued.run_id])
    assert.equal((await new ScheduleInventoryRepository(f.pool).occurrences(f.identity,a.draft.id)).some(row=>row.status==="failed"),true)
  }finally{await f.close()}
})
test("interval, daily and weekly plans retain a future effective anchor without dispatching early",async()=>{
  const f=await scheduleFixture()
  try{
    const anchor=new Date(Date.now()+2*86400000).toISOString()
    for(const rule of [{kind:"interval",interval_minutes:15},{kind:"daily",local_time:"09:00"},{kind:"weekly",local_time:"09:00",weekday:1}]){
      const a=await activated(f,{effect:false,rule,anchor}),state=await f.schedules.describe(f.identity,a.draft.id)
      assert.equal(state.execution.anchor_at,anchor)
      const row=await new ScheduleInventoryRepository(f.pool).get(f.identity,a.draft.id)
      assert.equal(new Date(row.next_at).getTime()>=Date.parse(anchor),true)
    }
    assert.equal((await f.dispatcher.tick()).status,"idle")
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,0)
  }finally{await f.close()}
})
