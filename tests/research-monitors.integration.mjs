// Actual isolated PB/SQLite, authenticated employees, scheduler, HTTP source and
// Node Worker. Provider decisions are synthetic, never a real-model quality pass.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-monitors-')),setupKey=randomBytes(32).toString('hex'),workerKey=randomBytes(32).toString('hex')
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n))})}),origin=`http://127.0.0.1:${port}`
let pb,logs='',queue=[],modelCalls=0,feedCalls=0,feedStatus=200,hasMore=false,feedItems=[]
const upstream=createServer(async(req,res)=>{
  const reply=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value))}
  if(req.url==='/v1/models')return reply({data:[{id:'fixture-model'}]})
  if(req.url.startsWith('/feed')){feedCalls++;return reply({scope_key:'employment',complete:!hasMore,has_more:hasMore,next_cursor:hasMore?'page2':null,items:feedItems},feedStatus)}
  let raw='';for await(const chunk of req)raw+=chunk
  const body=JSON.parse(raw||'{}'),planning=body.messages?.some(m=>m.role==='system'&&m.content?.includes('助手执行引擎'))
  if(planning)modelCalls++
  const item=planning?queue.shift():null,decision=typeof item==='function'?item():item
  return reply({choices:[{message:{role:'assistant',content:JSON.stringify(decision||{action:'final',final_answer:'Synthetic collector done; human semantic review is required.'})}}]})
})
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));const remote=`http://127.0.0.1:${upstream.address().port}`
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),workerHeaders={'X-Agent-Studio-Worker-Token':workerKey}
async function start(){pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve',`--http=127.0.0.1:${port}`,`--dir=${temp}`,`--hooksDir=${path.join(root,'pocketbase/pb_hooks')}`],{cwd:path.join(root,'pocketbase'),env:{NODE_ENV:'test',AGENT_STUDIO_CAPABILITY_TEST_ONLY:'true',AGENT_STUDIO_CAPABILITY_TEST_ORIGIN:remote,AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:setupKey,AGENT_STUDIO_WORKER_TOKEN:workerKey,AGENT_STUDIO_BACKGROUND_WORKER:'true',AGENT_STUDIO_WORKER_INTERNAL_URL:origin}})
  pb.stdout.on('data',b=>{logs=(logs+b).slice(-18000)});pb.stderr.on('data',b=>{logs=(logs+b).slice(-18000)})
  for(let n=0;n<150;n++){try{if((await fetch(origin+'/api/health')).ok)return}catch{}await sleep(100)}throw Error('PB unavailable '+logs.slice(-3000))}
async function api(method,route,body,token='',headers={}){const r=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()}}
async function ok(method,route,body,token='',status=200,headers={}){const r=await api(method,route,body,token,headers);assert.equal(r.status,status,route+' '+JSON.stringify(r));return r.data}
async function worker(){await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['worker/run.mjs','--once','--quiet'],{cwd:root,windowsHide:true,env:{...process.env,AGENT_STUDIO_WORKER_URL:origin,AGENT_STUDIO_WORKER_TOKEN:workerKey}});let out='';p.stdout.on('data',b=>{out+=b});p.stderr.on('data',b=>{out+=b});p.once('error',reject);p.once('close',code=>code===0?resolve():reject(Error(out)))})}
async function editStoppedDatabase(callback){await stopHeadlessPocketBase(pb);const dbFile=path.resolve(temp,'data.db');assert.ok(dbFile.startsWith(path.resolve(temp)+path.sep));const db=new DatabaseSync(dbFile);try{callback(db)}finally{db.close()}await start()}
try{
  await start();await ok('POST','/api/studio/bootstrap',{email:'owner@example.test',password:'Fixture-Password-2026',display_name:'Owner'},'',201,{'X-Agent-Studio-Setup-Key':setupKey})
  const owner=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'owner@example.test',password:'Fixture-Password-2026'})).token
  await ok('POST','/api/studio/users',{email:'collector@example.test',password:'Fixture-Password-2026',display_name:'Collector',role:'employee'},owner,201)
  const login=await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'collector@example.test',password:'Fixture-Password-2026'}),token=login.token,uid=login.record.id
  const conn=(await ok('POST','/api/model-connections',{name:'monitor fixture',provider:'openai',api_key:'fixture-only-key',base_url:remote+'/v1',models:['fixture-model']},token)).item.id
  assert.equal((await ok('POST','/api/model-connections/test',{connection_id:conn},token)).ok,true)
  const tool=(await ok('POST','/api/tool-connections',{name:'MonitorFeed',description:'Synthetic complete employment list',method:'GET',url:remote+'/feed',headers:[]},token)).item.id
  assert.equal((await ok('POST','/api/tool-connections/test',{connection_id:tool},token)).ok,true)
  const spec=await ok('POST','/api/agent_specs',{name:'Monitor collector',spec:{goal:'Collect watched relation facts',task_scope:'DEMO fixture',tools:['MonitorFeed','business_record_write','business_record_query','calculate'],task_plan:['Collect','Save'],deliverables:['Formal relation records'],done_criteria:['Declared sources fetched']}},token)
  const caseInfo=await ok('POST','/api/business/cases',{title:'Monitor DEMO',data_space:'DEMO',questions:['Current and historical roles?']},token,201),route=`/api/business/cases/${caseInfo.case_id}`
  const base=await ok('POST','/api/knowledge-bases/manage',{action:'create',name:'Revocable monitor identity'},owner),grant=await ok('POST','/api/knowledge-bases/access',{action:'grant',base_id:base.id,recipient_email:'collector@example.test',role:'editor'},owner)
  const identityText='SYNTHETIC_IDENTITY_ONLY',material=await ok('POST',route+'/materials',{filename:'identity.txt',base64:Buffer.from(identityText).toString('base64'),knowledge_base_id:base.id,idempotency_key:'identity-material'},token)
  await worker()
  const materialRef={material_id:material.material_id,segment_id:'block:1',start:0,end:identityText.length,quote:identityText}
  const entities=[]
  for(const [name,type] of [['陈明','PERSON'],['机构甲','ORGANIZATION'],['机构乙','ORGANIZATION'],['机构丙','ORGANIZATION']])entities.push(await ok('POST',route+'/records',{schema_id:'research.entity.v1',expected_version:0,idempotency_key:'entity-'+name,payload:{canonical_name:name,entity_type:type,aliases:[],identity_status:'CONFIRMED',identity_basis:'Synthetic fixture'},source_refs:type==='PERSON'?[materialRef]:[]},token))
  const now=Date.now(),scheduleDefinition={name:'Monitor recurring collector',target_kind:'agent',target_id:spec.id,instruction:'Collect only the defined source and watched relations.',recurrence_kind:'interval',interval_minutes:15,time_zone:'UTC',local_time:'09:00',weekday:1,start_at_ms:now+3600000,next_at_ms:now+3600000,model_connection_id:conn,model_id:'fixture-model',max_steps:12},scheduleId=(await ok('POST','/api/schedules/manage',{action:'create',...scheduleDefinition},token)).id
  const proposal={title:'人物任职监测',schedule_id:scheduleId,adapter_id:'research.relationship-events.v1',target_entity_ids:[entities[0].record_id],relation_types:['EMPLOYMENT'],sources:[{source_id:'feed',tool:'MonitorFeed',input:{},adapter_id:'http.json-items.v1',scope_key:'employment'}],execution_budget:{model_calls:20,tool_calls:20,read_calls:10,search_calls:0,closing_model_calls:1,wall_ms:120000}}
  const preview=await ok('POST',route+'/monitors/preview',proposal,token)
  assert.deepEqual(preview.definition.model_binding,{connection_id:conn,model_id:'fixture-model',provider:'openai'});assert.equal(JSON.stringify(preview).includes('fixture-only-key'),false)
  assert.equal((await api('POST',route+'/monitors',{definition:proposal,preview_hash:'changed',idempotency_key:'monitor'},token)).status,409)
  const createInput={definition:proposal,preview_hash:preview.preview_hash,idempotency_key:'monitor'},monitor=await ok('POST',route+'/monitors',createInput,token)
  assert.equal((await ok('POST',route+'/monitors',createInput,token)).monitor_id,monitor.monitor_id);assert.equal(monitor.enabled,false)
  assert.equal((await api('GET',`/api/business/monitors/${monitor.monitor_id}/checks`,undefined,owner)).status,404)
  assert.equal((await api('GET',route+'/monitors',undefined,'',{'X-Rh-User-Id':uid})).status,401)
  await ok('POST',`/api/business/monitors/${monitor.monitor_id}/control`,{enabled:true,expected_revision:1,expected_schedule_revision:monitor.schedule_revision,next_at_ms:Date.now()},token)
  const history=async()=> (await ok('GET',`/api/business/monitors/${monitor.monitor_id}/checks`,undefined,token)).items
  const currentMonitor=async()=> (await ok('GET',route+'/monitors',undefined,token)).items.find(m=>m.monitor_id===monitor.monitor_id)
  const events=async()=> (await ok('GET',`/api/business/monitors/${monitor.monitor_id}/events`,undefined,token)).items
  const inbox=async(query='')=>ok('GET','/api/business/monitor-inbox'+query,undefined,token)
  async function due(){await editStoppedDatabase(db=>db.prepare('UPDATE agent_studio_schedules SET next_at_ms=? WHERE id=? AND rh_user_id=?').run(Date.now()-10,scheduleId,uid))}
  async function finishCheck(){for(let n=0;n<14;n++){const c=(await history())[0];if(c&&['complete','needs_review','incomplete','blocked','cancelled'].includes(c.status))return c;await worker()}throw Error('Check failed to settle '+JSON.stringify(await history()))}
  async function accept(c){const p=await ok('GET',`/api/business/monitor-checks/${c.check_id}/review-preview`,undefined,token);assert.equal((await api('POST',`/api/business/monitor-checks/${c.check_id}/review`,{preview_hash:p.preview_hash,rationale:'fixture'},owner)).status,404);assert.equal((await api('POST',`/api/business/monitor-checks/${c.check_id}/review`,{preview_hash:'wrong-hash',rationale:'fixture'},token)).status,409);assert.equal((await api('POST',`/api/business/monitor-checks/${c.check_id}/review`,{preview_hash:p.preview_hash,rationale:'fixture'},'',workerHeaders)).status,401);return ok('POST',`/api/business/monitor-checks/${c.check_id}/review`,{preview_hash:p.preview_hash,rationale:'Synthetic employee matched every declared source, subject identity, quote, date and displayed relation version.'},token)}
  const role=(org,date='2020')=>({from_id:entities[0].record_id,to_id:org.record_id,relation_type:'EMPLOYMENT',description:'Synthetic supported role',valid_from:date,valid_to:null,status:'SOURCE_SUPPORTED',missing:['Current end unknown']})
  async function collect(writes=[],options={}){
    const callsBefore=feedCalls;queue=[options.skipSource?{action:'tool',tool:'calculate',tool_input:{expression:'1+1'}}:{action:'tool',tool:'MonitorFeed',tool_input:options.input||{}}]
    await worker();const c=(await history())[0];assert.ok(c)
    const results=(await ok('GET',`/api/agent-runs/${c.run_id}/tool-results`,undefined,token)).items
    const source=results.find(r=>r.tool==='MonitorFeed'),raw=source?await ok('GET',`/api/agent-runs/${c.run_id}/tool-results/${source.result_id}?limit=8000`,undefined,token):null
    if(source){const envelope=await ok('GET',`/api/agent-runs/${c.run_id}/tool-results/${source.result_id}?view=envelope`,undefined,token);assert.match(envelope.envelope.http_response.media_type,/application\/json/)}
    if(options.restart){await stopHeadlessPocketBase(pb);await start()}
    queue=writes.map((w,i)=>({action:'tool',tool:'business_record_write',tool_input:{schema_id:'research.relation.v1',expected_version:w.version||0,...(w.id?{record_id:w.id}:{}),idempotency_key:c.check_id+'-'+i,payload:w.payload,source_refs:raw?[{run_id:c.run_id,result_id:source.result_id,start:0,end:raw.text.length,quote:raw.text}]:[]}})).concat([{action:'final',final_answer:'Collected synthetic facts, pending employee review.'}])
    if(options.race)await Promise.all([worker(),worker()])
    const done=await finishCheck();if(done.error==='monitor_collector_incomplete'){const detail=await ok('GET',`/api/agent-runs/${c.run_id}/detail`,undefined,token);console.error('Collector diagnostic',JSON.stringify({status:detail.run.status,error:detail.run.error,events:detail.events.slice(-5)}))}assert.ok(feedCalls-callsBefore<=1,'A captured declared response is never refetched after restart');return done
  }
  feedCalls=0;feedItems=[role(entities[1])]
  let first=await collect([{payload:feedItems[0]}],{restart:true,race:true});assert.equal(first.status,'needs_review',JSON.stringify(first));assert.equal(first.assessment.collection_complete,true);assert.equal((await events()).length,0)
  assert.equal((await inbox()).items[0].kind,'needs_review');assert.deepEqual((await ok('GET','/api/business/monitor-inbox',undefined,owner)).items,[])
  assert.equal((await api('GET','/api/business/monitor-inbox',undefined,'',{'X-Rh-User-Id':uid})).status,401)
  assert.equal((await api('GET','/api/business/monitor-inbox?after_ms=1&after_id=foreign',undefined,token)).status,400)
  assert.equal((await api('POST','/api/schedules/manage',{action:'toggle',id:scheduleId,enabled:false},owner)).status,404)
  const stoppedReview=first.check_id
  await ok('POST','/api/schedules/manage',{action:'toggle',id:scheduleId,enabled:false},token)
  assert.equal((await currentMonitor()).enabled,false);assert.equal((await history())[0].status,'cancelled');assert.equal((await currentMonitor()).baseline_check_id,'')
  await ok('POST','/api/schedules/manage',{action:'toggle',id:scheduleId,enabled:true,next_at_ms:Date.now()+3600000},token)
  const currentRelation=(await ok('POST',route+'/query',{schema_id:'research.relation.v1'},token)).items[0]
  await due();first=await collect([{id:currentRelation.record_id,version:currentRelation.version,payload:feedItems[0]}]);assert.equal(first.status,'needs_review');assert.notEqual(first.check_id,stoppedReview)
  const stableControl=(await currentMonitor()).schedule_revision
  await ok('POST','/api/schedules/manage',{action:'toggle',id:scheduleId,enabled:true,next_at_ms:Date.now()+3600000},token)
  assert.equal((await currentMonitor()).schedule_revision,stableControl,'Repeated enable must not invalidate a sealed review')
  assert.equal((await api('POST','/api/schedules/manage',{action:'run_now',id:scheduleId},token)).data.error,'monitor_previous_check_incomplete')
  if(process.argv.includes('--browser')){
    const browserSchedule=await ok('POST','/api/schedules/manage',{action:'create',name:'Browser paused collector',target_kind:'agent',target_id:spec.id,instruction:'Browser monitor definition fixture',recurrence_kind:'interval',interval_minutes:15,time_zone:'UTC',local_time:'09:00',weekday:1,start_at_ms:Date.now()+3600000,next_at_ms:Date.now()+3600000,model_connection_id:conn,model_id:'fixture-model',max_steps:12},token)
    const {verifyMonitorBrowser}=await import('./helpers/monitor-browser.mjs');await verifyMonitorBrowser({root,backendOrigin:origin,caseId:caseInfo.case_id,scheduleId:browserSchedule.id,personId:entities[0].record_id});first=(await history())[0]
  }else first=await accept(first)
  assert.equal(first.status,'complete');assert.equal(first.assessment.semantic_state,'baseline_initialized');assert.equal((await events()).length,0)
  let relations=(await ok('POST',route+'/query',{schema_id:'research.relation.v1'},token)).items,original=relations[0]
  await due();let unchanged=await collect();assert.equal(unchanged.status,'complete',JSON.stringify(unchanged));assert.equal(unchanged.assessment.semantic_state,'unchanged');assert.equal((await events()).length,0)
  assert.deepEqual((await inbox()).items,[],'Unchanged checks must stay quiet on the homepage too')
  await ok('POST',route+'/reviews',{record_id:original.record_id,record_version:original.version,decision:'rejected',rationale:'Synthetic employee retracted the earlier interpretation.'},token,201)
  await due();const retracted=await collect();assert.equal(retracted.status,'needs_review');assert.equal((await currentMonitor()).baseline_check_id,unchanged.check_id,'Unchanged collection must preserve a later human rejection');await accept(retracted)
  await due();feedItems.push(role(entities[2],'2010'));let historical=await collect([{payload:feedItems[1]}]);assert.equal(historical.status,'needs_review');historical=await accept(historical);assert.equal(historical.status,'complete');assert.equal((await events()).length,0,'New old reporting must not notify an employment change')
  // Clock advance in the owned stopped fixture makes a recent start provably
  // later than its baseline. No prewritten comparison/success state is injected.
  await editStoppedDatabase(db=>{const row=db.prepare('SELECT assessment FROM agent_studio_monitor_checks WHERE id=? AND owner_uid=?').get(historical.check_id,uid),assessment=JSON.parse(row.assessment);assessment.observed_ms=Date.now()-3*86400000;db.prepare('UPDATE agent_studio_monitor_checks SET assessment=? WHERE id=? AND owner_uid=?').run(JSON.stringify(assessment),historical.check_id,uid);db.prepare('UPDATE agent_studio_schedules SET next_at_ms=? WHERE id=?').run(Date.now()-10,scheduleId)})
  const today=new Date().toISOString().slice(0,10);feedItems.push(role(entities[3],today));let additional=await collect([{payload:feedItems[2]}]);additional=await accept(additional);assert.equal(additional.status,'complete');assert.equal((await events()).filter(e=>e.kind==='additional_role').length,1);assert.equal((await events()).some(e=>e.kind==='role_ended'),false)
  const additionalEvent=(await events()).find(e=>e.kind==='additional_role');assert.equal((await inbox()).items[0].kind,'additional_role')
  await ok('POST',`/api/business/monitor-events/${additionalEvent.event_id}/read`,{},owner);assert.equal((await inbox()).items.length,1,'Another employee cannot mark the owner event read')
  await ok('POST',`/api/business/monitor-events/${additionalEvent.event_id}/read`,{},token);assert.deepEqual((await inbox()).items,[])
  const stableBaseline=additional.check_id
  await due();feedStatus=500;let failed=await collect();assert.equal(failed.status,'incomplete');assert.equal(failed.assessment.collection_complete,false)
  assert.equal(failed.run_available,true)
  assert.equal((await inbox()).items[0].kind,'incomplete')
  assert.equal((await currentMonitor()).baseline_check_id,stableBaseline)
  await due();feedStatus=200;hasMore=true;let partial=await collect();assert.equal(partial.status,'incomplete');assert.equal(partial.error,'monitor_source_coverage_incomplete');hasMore=false
  await due();let missing=await collect([],{skipSource:true});assert.equal(missing.status,'incomplete');assert.equal(missing.error,'monitor_declared_source_missing')
  await due();const beforeOutside=feedCalls;let outside=await collect([],{input:{outside:'unauthorized'}});assert.equal(outside.status,'incomplete');assert.equal(feedCalls,beforeOutside,'Undeclared source input must never reach HTTP')
  // Even a still-verified same-ID connection cannot silently change the scoped
  // monitor's model provider or credential. Mutate only the owned stopped fixture.
  for(const field of ['base_url','api_key']){
    const beforeModel=modelCalls,beforeFeed=feedCalls;let originalValue
    await editStoppedDatabase(db=>{originalValue=db.prepare('SELECT '+field+' FROM model_connections WHERE id=?').get(conn)[field];db.prepare('UPDATE model_connections SET '+field+'=? WHERE id=?').run(originalValue+'-changed',conn);db.prepare('UPDATE agent_studio_schedules SET next_at_ms=? WHERE id=?').run(Date.now()-10,scheduleId)})
    assert.equal((await currentMonitor()).blocked,true);await worker();const changed=(await history())[0];assert.equal(changed.status,'incomplete');assert.equal(changed.run_available,false);assert.equal(changed.error,'monitor_model_configuration_changed');assert.equal(modelCalls,beforeModel);assert.equal(feedCalls,beforeFeed);assert.equal((await currentMonitor()).baseline_check_id,stableBaseline)
    await editStoppedDatabase(db=>db.prepare('UPDATE model_connections SET '+field+'=? WHERE id=?').run(originalValue,conn))
  }
  await due();queue=[{action:'tool',tool:'MonitorFeed',tool_input:{}}];await worker();const beforeModelRotation=modelCalls
  await editStoppedDatabase(db=>db.prepare('UPDATE model_connections SET base_url=? WHERE id=?').run(remote+'/rotated',conn))
  await worker();assert.equal(modelCalls,beforeModelRotation,'Connection rotation also fences the next paid request of an already collecting Run');assert.equal((await history())[0].status,'incomplete')
  await editStoppedDatabase(db=>db.prepare('UPDATE model_connections SET base_url=? WHERE id=?').run(remote+'/v1',conn))
  await due();relations=(await ok('POST',route+'/query',{schema_id:'research.relation.v1'},token)).items;const newest=relations.find(r=>r.payload.to_id===entities[3].record_id);feedItems[2]={...feedItems[2],status:'CONFLICT'}
  let conflict=await collect([{id:newest.record_id,version:newest.version,payload:feedItems[2]}]);assert.equal(conflict.status,'needs_review');conflict=await accept(conflict);assert.equal(conflict.status,'needs_review');assert.equal(conflict.assessment.semantic_state,'needs_resolution')
  const eventCount=(await events()).length;await accept(conflict);assert.equal((await events()).length,eventCount,'Repeated semantic review must not duplicate events');assert.equal((await events()).filter(e=>e.kind==='conflict').length,1)
  const page=await inbox('?limit=1');assert.equal(page.has_more,true);const next=await inbox('?limit=1&'+new URLSearchParams(page.next_cursor));assert.notEqual(page.items[0].item_id,next.items[0].item_id);assert.equal(next.has_more,false)
  await ok('POST',`/api/business/monitor-checks/${conflict.check_id}/discard`,{rationale:'Synthetic conflict requires corrected source and new collection.'},token)
  assert.equal((await currentMonitor()).baseline_check_id,stableBaseline)
  await due();queue=[{action:'tool',tool:'MonitorFeed',tool_input:{}}];await worker();const pausedCheck=(await history())[0],beforePause=modelCalls,active=await currentMonitor()
  await ok('POST','/api/schedules/manage',{action:'toggle',id:scheduleId,enabled:false},token)
  await worker();assert.equal(modelCalls,beforePause,'Pause fences the next paid model request');assert.equal((await history())[0].status,'incomplete')
  assert.equal((await api('POST','/api/agent-runs/start',{spec_id:spec.id,instruction:'forged monitor',model:'fixture-model',config:{case_id:caseInfo.case_id,monitor_check_id:pausedCheck.check_id,custom_model:{connection_id:conn,model_id:'fixture-model'}}},token)).status,403)
  await ok('POST','/api/schedules/manage',{action:'toggle',id:scheduleId,enabled:true,next_at_ms:Date.now()+3600000},token)
  const edited=await ok('POST','/api/schedules/manage',{action:'update',id:scheduleId,...scheduleDefinition,instruction:'Reviewed collector instruction revision.'},token)
  assert.equal(edited.monitor_definition_review_required,true);assert.equal(edited.enabled,false)
  const afterEdit=await currentMonitor();assert.equal(afterEdit.enabled,false);assert.equal(afterEdit.blocked,true);assert.equal(afterEdit.baseline_check_id,stableBaseline)
  assert.equal((await api('POST',`/api/business/monitors/${monitor.monitor_id}/control`,{enabled:true,expected_revision:afterEdit.revision,expected_schedule_revision:afterEdit.schedule_revision,next_at_ms:Date.now()+3600000},token)).status,409)
  const changedProposal={...proposal,title:'监测修订二'},revisionPreview=await ok('POST',route+'/monitors/preview',changedProposal,token),revisionBody={definition:changedProposal,preview_hash:revisionPreview.preview_hash,expected_revision:1,idempotency_key:'revision-two'}
  const revised=await ok('POST',`/api/business/monitors/${monitor.monitor_id}/definition`,revisionBody,token);assert.equal(revised.revision,2);assert.equal(revised.enabled,false);assert.equal(revised.baseline_check_id,'')
  assert.equal((await ok('POST',`/api/business/monitors/${monitor.monitor_id}/definition`,revisionBody,token)).revision,2,'Lost revision replies must not create another version')
  assert.ok((await history()).some(c=>c.check_id===additional.check_id&&c.status==='complete'),'Configuration changes preserve permitted historical evidence')
  assert.equal((await events()).length,eventCount)
  await ok('POST','/api/schedules/manage',{action:'toggle',id:scheduleId,enabled:true,next_at_ms:Date.now()+3600000},token)
  const queued=await ok('POST','/api/schedules/manage',{action:'run_now',id:scheduleId},token),beforeDelete=modelCalls
  assert.equal((await api('POST','/api/schedules/manage',{action:'delete',id:scheduleId},owner)).status,404)
  await ok('POST','/api/schedules/manage',{action:'delete',id:scheduleId},token)
  const deleted=await currentMonitor();assert.equal(deleted.enabled,false);assert.equal(deleted.schedule_revision,null)
  const scheduled=await ok('GET','/api/schedules',undefined,token);assert.ok(!scheduled.items.some(s=>s.id===scheduleId));assert.equal(scheduled.history.find(s=>s.run_id===queued.run_id).status,'cancelled_schedule')
  await worker();assert.equal(modelCalls,beforeDelete,'Deletion cancels pending launch before model dispatch')
  // Recover a legacy orphan control flag without inventing a running schedule.
  await editStoppedDatabase(db=>db.prepare('UPDATE agent_studio_monitors SET enabled=1 WHERE id=?').run(monitor.monitor_id))
  await ok('POST',`/api/business/monitors/${monitor.monitor_id}/control`,{enabled:false,expected_revision:2,expected_schedule_revision:null},token);assert.equal((await currentMonitor()).enabled,false)
  assert.equal((await api('POST',`/api/business/monitors/${monitor.monitor_id}/control`,{enabled:true,expected_revision:2,expected_schedule_revision:null,next_at_ms:Date.now()+3600000},token)).status,409)
  // Pagination stress fixtures copy an actual failed check and a previously
  // reviewed synthetic conflict event. They prove list/UI behavior only, never
  // collection success, additional semantic changes or notification dedup.
  const conflictEvent=(await events()).find(e=>e.kind==='conflict');let counts
  await editStoppedDatabase(db=>{
    const checkRow=db.prepare('SELECT * FROM agent_studio_monitor_checks WHERE id=?').get(failed.check_id),eventRow=db.prepare('SELECT * FROM agent_studio_monitor_events WHERE id=?').get(conflictEvent.event_id)
    function insert(table,row){const keys=Object.keys(row);db.prepare('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]))}
    for(let n=0;n<121;n++){
      const suffix=String(n).padStart(13,'0'),cid='pagingc'+suffix,eid='paginge'+suffix
      insert('agent_studio_monitor_checks',{...checkRow,id:cid,occurrence_id:'pagination-fixture:'+cid,created_ms:first.created_ms+1,updated_ms:first.created_ms+1,error:'pagination_fixture_not_execution'})
      insert('agent_studio_monitor_events',{...eventRow,id:eid,dedup_hash:'pagination-fixture:'+eid,read_ms:0,created_ms:conflictEvent.created_ms+1})
    }
    counts={checks:db.prepare('SELECT count(*) AS n FROM agent_studio_monitor_checks WHERE monitor_id=?').get(monitor.monitor_id).n,events:db.prepare('SELECT count(*) AS n FROM agent_studio_monitor_events WHERE monitor_id=? AND notify=1').get(monitor.monitor_id).n}
  })
  const monitorRoute=`/api/business/monitors/${monitor.monitor_id}`
  async function allPages(kind){const ids=[],cursors=new Set();let query='?limit=7';for(let n=0;n<100;n++){const p=await ok('GET',monitorRoute+'/'+kind+query,undefined,token);assert.ok(p.items.length<=7);ids.push(...p.items.map(r=>r.check_id&&kind==='checks'?r.check_id:r.event_id));if(!p.has_more)return ids;const key=JSON.stringify(p.next_cursor);assert.ok(!cursors.has(key),'Cursor must progress across timestamp ties');cursors.add(key);query='?limit=7&'+new URLSearchParams(p.next_cursor)}throw Error('Unbounded pagination')}
  for(const kind of ['checks','events']){
    const ids=await allPages(kind);assert.equal(ids.length,counts[kind]);assert.equal(new Set(ids).size,ids.length)
    for(const bad of ['?limit=0','?limit=51','?after_ms=1','?after_ms=1&after_id=invalid'])assert.equal((await api('GET',monitorRoute+'/'+kind+bad,undefined,token)).status,400)
  }
  assert.equal((await ok('GET',monitorRoute+'/checks/'+first.check_id,undefined,token)).status,'complete')
  assert.equal((await ok('GET',monitorRoute+'/events/'+conflictEvent.event_id,undefined,token)).check_id,conflict.check_id)
  assert.equal((await api('GET',monitorRoute+'/checks/'+first.check_id,undefined,owner)).status,404)
  assert.equal((await api('GET',monitorRoute+'/events/'+conflictEvent.event_id,undefined,owner)).status,404)
  let revoked=false
  if(process.argv.includes('--browser')){
    const {verifyMonitorHistoryBrowser}=await import('./helpers/monitor-history-browser.mjs')
    await verifyMonitorHistoryBrowser({root,backendOrigin:origin,caseId:caseInfo.case_id,monitorId:monitor.monitor_id,oldCheckId:first.check_id,event:conflictEvent,verifyRead:async()=>assert.ok((await ok('GET',monitorRoute+'/events/'+conflictEvent.event_id,undefined,token)).read_ms>0),onRevoke:async()=>{await ok('POST','/api/knowledge-bases/access',{action:'revoke',base_id:base.id,recipient_id:grant.recipient_id},owner);revoked=true}})
  }
  if(!revoked)await ok('POST','/api/knowledge-bases/access',{action:'revoke',base_id:base.id,recipient_id:grant.recipient_id},owner)
  assert.equal((await currentMonitor()).blocked,true);assert.equal((await events()).length,0)
  const revokedInbox=await inbox();assert.ok(revokedInbox.items.length>0);assert.ok(revokedInbox.items.every(i=>i.kind==='source_unavailable'&&i.title==='监测来源不可用'));assert.equal(JSON.stringify(revokedInbox).includes('陈明'),false)
  assert.ok((await history()).every(c=>c.status==='blocked'&&c.receipts.length===0&&Object.keys(c.assessment).length===0))
  assert.equal((await api('GET',`/api/business/monitor-checks/${additional.check_id}/review-preview`,undefined,token)).status,403)
  assert.equal((await api('GET',monitorRoute+'/events/'+conflictEvent.event_id,undefined,token)).status,403)
  const revokedCheck=await ok('GET',monitorRoute+'/checks/'+first.check_id,undefined,token);assert.equal(revokedCheck.status,'blocked');assert.deepEqual(revokedCheck.receipts,[])
  console.log('PASS monitoring: actual scheduled HTTP collection, sealed scope/budgets, restart, quiet unchanged/history, additive roles, explicit failure/coverage, reviewed deduplicated conflicts, immutable baselines and revoked-source projection; synthetic DEMO only')
}catch(error){console.error(logs.slice(-6500));throw error}finally{
  await stopHeadlessPocketBase(pb);await new Promise(resolve=>upstream.close(resolve));const absolute=path.resolve(temp);assert.ok(absolute.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(absolute).startsWith('agentstudio-monitors-'));fs.rmSync(absolute,{recursive:true,force:true})
}
