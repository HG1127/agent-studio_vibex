import test from 'node:test'
import assert from 'node:assert/strict'
import {NativeMonitorLiveAnalysis} from '../src/native-monitor-live-analysis.ts'
import {NativeMonitorBusinessData} from '../src/native-monitor-business-data.ts'
import {monitorHash,monitorSourceProjection} from '../src/native-monitor-source-contract.ts'
// SQL-shape double of persisted inputs; no PG/RLS/browser proof.
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const owner=id(1),caseId=id(2),monitorId=id(3),checkId=id(4),baselineId=id(5),run=id(6),result=id(7),person=id(8),org=id(9),relation=id(10),factSet=id(11),baselineFactSet=id(12),stamp=1793310000000
function fixture(options={}){
 const trace=[],writes=[],scope={knowledge_base_ids:[],documents:[],semantic_used:false,dependency_runs:[]}
 const source={source_id:'roles',tool:'web_fetch',input:{url:'https://example.invalid/role'},request_hash:monitorHash(['web_fetch',{url:'https://example.invalid/role'}]),adapter_id:'web.text.v1',scope_key:'',required_markers:['FACT']}
 const payload={text:'FACT '+'.'.repeat(100),structuredContent:null,data_space:'LIVE',coverage:{stored_complete:true},redacted:false,usable_as_evidence:true,http_response:{status:200,complete:true,empty:false,media_type:'text/plain'}}
 const receipt={id:result,owner_user_id:owner,case_id:caseId,run_id:run,step_key:'declared_source_1',monitor_check_id:checkId,source_id:'roles',request_hash:source.request_hash,payload,source_scope:scope,content_hash:monitorHash(payload),created_ms:String(stamp)}
 const reference={run_id:run,result_id:result,start:0,end:4,quote:'FACT'}
 const entity=(record_id,entity_type)=>({record_id,version:1,schema_id:'research.entity.v1',payload:{canonical_name:entity_type,entity_type,aliases:[],identity_status:'CONFIRMED',identity_basis:'employee confirmed'},source_refs:[],relation_versions:[],run_id:'',created_ms:stamp})
 const records=[entity(person,'PERSON'),entity(org,'ORGANIZATION'),{record_id:relation,version:1,schema_id:'research.relation.v1',payload:{from_id:person,to_id:org,relation_type:'EMPLOYMENT',description:'declared supported fact',valid_from:'2020',valid_to:null,status:'SOURCE_SUPPORTED',missing:[]},source_refs:[reference],relation_versions:[{record_id:person,version:1},{record_id:org,version:1}],run_id:run,created_ms:stamp}]
 const definition={title:'original monitor',schedule_id:id(13),adapter_id:'research.relationship-events.v1',target_entity_ids:[person],target_pins:[{record_id:person,version:1}],relation_types:['EMPLOYMENT'],sources:[source]}
 const monitor={id:monitorId,owner_user_id:owner,case_id:caseId,revision:'1',enabled:true,definition_hash:monitorHash(definition),definition,baseline_check_id:options.first?null:baselineId,current_check_id:checkId}
 const pins=[{source_id:'roles',run_id:run,result_id:result,content_hash:receipt.content_hash,projection_hash:monitorSourceProjection(source,payload).projection_hash}]
 const check={id:checkId,owner_user_id:owner,monitor_id:monitorId,case_id:caseId,monitor_revision:'1',definition_hash:monitor.definition_hash,run_id:run,status:'analyzing',fact_set_id:factSet,baseline_check_id:monitor.baseline_check_id,receipts:pins,assessment:{},error:'',created_ms:String(stamp)}
 const baseline={...check,id:baselineId,status:'complete',fact_set_id:baselineFactSet,baseline_check_id:null,assessment:{observed_ms:stamp-1000}}
 const snapshot={records,reference_records:[],created_ms:stamp}
 let decision=options.rejected?'rejected':'accepted',reviewAccepted=options.oldReview??false
 const db={async query(sql,p=[]){
  trace.push({sql,params:p})
  if(sql.includes("current_user='agentstudio_api'"))return{rows:[{ok:p[0]===owner}]}
  if(sql.includes(' AS api_only'))return{rows:[{epoch:options.disabled?null:'7',api_only:!options.worker}]}
  if(sql.includes('AS ready'))return{rows:[{ready:true}]}
  if(sql.includes(' AS installed'))return{rows:[{installed:true,human_installed:false}]}
  if(sql.includes('knowledge_query_execution_validate_run($1'))return{rows:[{ok:!options.revoked}]}
  if(sql.includes('FROM agentstudio.runs WHERE'))return{rows:[{id:p[0],owner_user_id:owner}]}
  if(sql.startsWith('SELECT source_scope'))return{rows:[{source_scope:scope}]}
  if(sql.includes('monitor_live_case_read_lock('))return{rows:[{value:{id:caseId,title:'Owned case',data_space:'LIVE',questions:[{question_id:id(14),question:'Declared question'}],created_ms:String(stamp)}}]}
  if(sql.startsWith('SELECT id,owner_user_id,case_id,run_id'))return{rows:[receipt]}
  if(sql.includes('monitor_live_monitor_read_lock('))return{rows:[{value:{...monitor}}]}
  if(sql.includes('monitor_live_check_read_lock('))return{rows:[{value:{...(p[0]===baselineId?baseline:check)}}]}
  if(sql.startsWith('SELECT definition,definition_hash'))return{rows:[{definition,definition_hash:monitor.definition_hash}]}
  if(sql.startsWith('SELECT id,payload,content_hash'))return{rows:[{id:p[0],payload:snapshot,content_hash:monitorHash(snapshot)}]}
  if(sql.startsWith('SELECT record_id,version::text')){const r=records.find(r=>r.record_id===p[2]);return{rows:r?[{...r,version:String(options.stale&&p[3]===undefined?2:r.version),run_id:r.run_id||null,created_ms:String(r.created_ms)}]:[]}}
  if(sql.startsWith('SELECT r.record_id'))return{rows:[{record_id:relation,version:'1'}]}
  if(sql.startsWith('SELECT agentstudio.monitor_live_record_review(')){decision=p[3];writes.push(sql);return{rows:[{value:{review_id:id(16),record_id:p[1],record_version:p[2],decision:p[3],review_method:'human',actor_uid:owner,created_ms:stamp,revision:2,governance_revision:7}}]}}
  if(sql.startsWith('SELECT agentstudio.monitor_live_check_review(')){if(p[3]==='accepted')reviewAccepted=true;writes.push(sql);return{rows:[{value:id(15)}]}}
  if(sql.startsWith('SELECT agentstudio.monitor_live_check_state(')){assert.equal(check.status,p[3]);writes.push(sql);check.status=p[4];check.error=p[5];check.assessment=JSON.parse(p[6]);return{rows:[{value:checkId}]}}
  if(sql.startsWith('SELECT agentstudio.monitor_live_assessment_commit(')){assert.equal(check.status,p[3]);const command=JSON.parse(p[5]);writes.push(sql);if(command.can_advance){monitor.baseline_check_id=checkId;check.status='complete';check.error='';check.assessment=command.assessment}else{check.status='needs_review';check.error='monitor_fact_resolution_required';check.assessment=command.assessment};return{rows:[{value:checkId}]}}
  if(sql.startsWith('SELECT decision FROM agentstudio.monitor_live_record_reviews'))return{rows:[{decision}]}
  if(sql.startsWith('SELECT id FROM agentstudio.monitor_live_reviews'))return{rows:reviewAccepted?[{id:id(15)}]:[]}
  if(sql.startsWith('SELECT (coalesce(max(revision)'))return{rows:[{revision:'2'}]}
  if(sql.startsWith('INSERT INTO agentstudio.monitor_live_reviews')){reviewAccepted=true;writes.push(sql);return{rows:[]}}
  if(sql.startsWith('INSERT INTO agentstudio.monitor_live_record_reviews')){decision=sql.includes('RETURNING')?p[5]:'accepted';writes.push(sql);return{rows:sql.includes('RETURNING')?[{created_ms:String(stamp),revision:'2'}]:[]}}
  if(sql.startsWith('INSERT INTO agentstudio.monitor_live_events')){writes.push(sql);return{rows:[]}}
  if(sql.startsWith('UPDATE agentstudio.monitor_live_monitors')){writes.push(sql);monitor.baseline_check_id=p[0];return{rows:[{id:monitorId}]}}
  if(sql.startsWith('UPDATE agentstudio.monitor_live_checks')){writes.push(sql);check.status=p[3];check.error=p[4];check.assessment=JSON.parse(p[5]);return{rows:[{id:checkId}]}}
  throw Error('unexpected SQL in pure fixture: '+sql)
 }}
 const data=new NativeMonitorBusinessData(async()=>{throw Error('no model write authorized by this fixture')})
 const analysis=new NativeMonitorLiveAnalysis(data,async()=>{if(options.changed)throw Error('monitor_configuration_changed')})
 return{db,data,analysis,trace,writes,monitor,check,records}
}
test('later rejected business fact blocks baseline even with an old accepted monitor preview',async()=>{
 const f=fixture({rejected:true,oldReview:true}),out=await f.analysis.analyze(f.db,owner,checkId)
 assert.equal(out.status,'needs_review');assert.equal(out.assessment.baseline_advanced,false)
 assert.equal(f.monitor.baseline_check_id,baselineId)
 assert(!f.writes.some(s=>s.includes('monitor_live_monitors')||s.includes('monitor_live_events')))
})
test('unchanged accepted facts advance from real current manifest without another human confirmation',async()=>{
 const f=fixture(),out=await f.analysis.analyze(f.db,owner,checkId)
 assert.equal(out.status,'complete');assert.equal(out.assessment.semantic_state,'unchanged')
 assert.equal(f.monitor.baseline_check_id,checkId);assert(!f.trace.some(q=>q.sql.includes('monitor_live_check_review(')||q.sql.includes('monitor_live_record_review(')))
 assert(f.trace.some(q=>q.sql.startsWith('SELECT r.record_id')))
})
test('first baseline remains pending without a human review',async()=>{
 const f=fixture({first:true}),out=await f.analysis.analyze(f.db,owner,checkId)
 assert.equal(out.status,'needs_review');assert.equal(f.monitor.baseline_check_id,null)
 assert(!f.writes.some(s=>s.includes('monitor_live_monitors')))
})
test('stale preview, Worker membership and revoked Native employee cannot insert acceptance',async()=>{
 for(const options of [{worker:true},{disabled:true},{}]){
  const f=fixture({...options,first:true}),p=await f.analysis.preview(f.db,owner,checkId)
  await assert.rejects(()=>f.analysis.analyze(f.db,owner,checkId,{preview_hash:options.worker||options.disabled?p.preview_hash:'b'.repeat(64),rationale:'employee confirmed the declared facts'}))
  assert.equal(f.writes.length,0);assert.equal(f.monitor.baseline_check_id,null)
 }
})
test('fresh employee review appends accepted record review before atomic baseline advancement',async()=>{
 const f=fixture({first:true,rejected:true}),p=await f.analysis.preview(f.db,owner,checkId)
 const out=await f.analysis.analyze(f.db,owner,checkId,{preview_hash:p.preview_hash,rationale:'employee confirmed current source anchors'})
 assert.equal(out.status,'complete');assert.equal(out.assessment.semantic_state,'baseline_initialized')
 const review=f.writes.findIndex(s=>s.includes('monitor_live_record_review('))
 const baseline=f.writes.findIndex(s=>s.includes('monitor_live_assessment_commit('))
 assert(review>=0&&baseline>review);assert.equal(f.monitor.baseline_check_id,checkId)
})
test('source access revocation or changed configuration aborts before all baseline and review mutations',async()=>{
 for(const options of [{revoked:true},{changed:true}]){
  const f=fixture({...options,oldReview:true})
  await assert.rejects(()=>f.analysis.analyze(f.db,owner,checkId))
  assert.equal(f.writes.length,0);assert.equal(f.monitor.baseline_check_id,baselineId)
 }
})
test('analysis cannot be constructed without the current definition gate',()=>{
 assert.throws(()=>new NativeMonitorLiveAnalysis(new NativeMonitorBusinessData(async()=>{}),undefined),/monitor_current_definition_gate_required/)
})

test('original employee fact-review appends the current rejected decision and blocks a prior monitor approval',async()=>{
 const f=fixture({oldReview:true})
 const out=await f.data.review(f.db,owner,caseId,{record_id:relation,record_version:1,decision:'rejected',rationale:'source does not support the relation'})
 assert.equal(out.decision,'rejected');assert.equal(out.review_method,'human');assert.equal(out.actor_uid,owner);assert.equal(out.revision,2)
 const check=await f.analysis.analyze(f.db,owner,checkId)
 assert.equal(check.status,'needs_review');assert.equal(f.monitor.baseline_check_id,baselineId)
})
test('fact-review rejects Worker identity, source revocation, stale version and unsupported record type before insertion',async()=>{
 for(const [options,record_id,code]of [[{worker:true},relation,'monitor_employee_review_required'],[{revoked:true},relation,'monitor_source_unavailable'],[{stale:true},relation,'review_version_stale'],[{},person,'claim_review_required']]){
  const f=fixture(options)
  await assert.rejects(()=>f.data.review(f.db,owner,caseId,{record_id,record_version:1,decision:'accepted',rationale:'review'}),error=>error.code===code)
  assert.equal(f.writes.length,0)
 }
})
test('fact-review does not accept a fabricated actor or a non-supported relation',async()=>{
 const f=fixture()
 await assert.rejects(()=>f.data.review(f.db,owner,caseId,{record_id:relation,record_version:1,decision:'accepted',rationale:'review',actor_uid:owner}),error=>error.code==='invalid_business_payload')
 f.records.find(r=>r.record_id===relation).payload.status='CANDIDATE'
 await assert.rejects(()=>f.data.review(f.db,owner,caseId,{record_id:relation,record_version:1,decision:'accepted',rationale:'review'}),error=>error.code==='supported_claim_required')
 assert.equal(f.writes.length,0)
})

test('original check detail returns usable historical receipt bindings after current ACL checks',async()=>{
 const f=fixture(),out=await f.analysis.readCheck(f.db,owner,monitorId,checkId)
 assert.equal(out.check_id,checkId);assert.equal(out.run_available,true);assert.equal(out.status,'analyzing')
 assert.equal(out.fact_set_id,factSet);assert.equal(out.receipts[0].result_id,result)
 assert(!JSON.stringify(out).includes('FACT '));assert(!Object.hasOwn(out,'context'))
})
test('source revocation redacts only the affected original check details and preserves its pending metadata',async()=>{
 const f=fixture({revoked:true}),out=await f.analysis.readCheck(f.db,owner,monitorId,checkId)
 assert.equal(out.status,'blocked');assert.equal(out.historical_status,'analyzing');assert.equal(out.run_available,false)
 assert.equal(out.fact_set_id,null);assert.equal(out.baseline_check_id,null);assert.deepEqual(out.receipts,[]);assert.deepEqual(out.assessment,{})
 assert.equal(out.created_ms,stamp);assert.equal(f.writes.length,0)
})
test('mixed monitor/check detail is404 before evidence disclosure; original review preview omits internal context',async()=>{
 const f=fixture();f.check.monitor_id=id(99)
 await assert.rejects(()=>f.analysis.readCheck(f.db,owner,monitorId,checkId),error=>error.code==='monitor_check_not_found'&&error.status===404)
 const ok=fixture(),p=await ok.analysis.reviewPreview(ok.db,owner,checkId)
 assert.deepEqual(Object.keys(p).sort(),['check','comparison','preview_hash','receipts','records'])
 assert.equal(p.check.check_id,checkId);assert.equal(p.records[0].record_id,relation);assert.equal(p.preview_hash.length,64)
})
test('employee discard appends audit, cancels only the pending check and preserves the accepted baseline',async()=>{
 const f=fixture();f.check.status='needs_review'
 const out=await f.analysis.discard(f.db,owner,checkId,{rationale:'skip this unaccepted collection'})
 assert.equal(out.status,'cancelled');assert.equal(out.baseline_advanced,false);assert.equal(f.monitor.baseline_check_id,baselineId)
 assert(f.trace.some(q=>q.sql.includes('monitor_live_check_review(')&&q.params[3]==='discarded'));assert(!f.writes.some(s=>s.startsWith('UPDATE agentstudio.monitor_live_monitors')))
})
test('discard refuses Worker authority, unknown keys and nonpending checks without writes',async()=>{
 for(const [options,raw]of [[{worker:true},{rationale:'skip'}],[{},{rationale:'skip',actor_uid:owner}],[{},{rationale:'skip'}]]){
  const f=fixture(options)
  await assert.rejects(()=>f.analysis.discard(f.db,owner,checkId,raw))
  assert.equal(f.writes.length,0);assert.equal(f.monitor.baseline_check_id,baselineId)
 }
})
