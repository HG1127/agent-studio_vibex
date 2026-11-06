import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {NativeMonitorLiveFreezer} from '../src/native-monitor-live-freeze.ts'
import {NativeMonitorBusinessData} from '../src/native-monitor-business-data.ts'
import {monitorCanonical,monitorHash} from '../src/native-monitor-source-contract.ts'
// Persisted-shape doubles run the real data/source/freezer code. They do not
// execute the authored SQL, prove RLS, or replace Hosted PG interruption tests.
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(1),caseId=id(2),run=id(3),check=id(4),token=id(5),jobId=id(6),result=id(7),fact=id(8),stamp=1793310000000
const lease=()=>({check_id:check,lease_token:token,lease_version:2})
const entity=(record_id,version=1)=>({record_id,version,schema_id:'research.entity.v1',payload:{canonical_name:'Owned '+record_id,entity_type:record_id===id(100)?'PERSON':'ORGANIZATION',aliases:[],identity_status:'CONFIRMED',identity_basis:'employee confirmed'},source_refs:[],relation_versions:[],run_id:'',created_ms:stamp})
function fixture({size=21,...options}={}){
 const state={role:'agentstudio_api',begins:0,appends:0,finishes:0,currentChecks:0,reads:[],...options},trace=[],records=new Map()
 for(let i=0;i<size;i++)records.set(id(100+i)+':1',entity(id(100+i)))
 if(size>=3){
  records.set(id(100)+':2',entity(id(100),2))
  records.set(id(102)+':1',{record_id:id(102),version:1,schema_id:'research.relation.v1',payload:{from_id:id(100),to_id:id(101),relation_type:'EMPLOYMENT',description:'Source statement',valid_from:'2026',valid_to:null,status:'SOURCE_SUPPORTED',missing:[]},source_refs:[{run_id:run,result_id:result,start:0,end:4,quote:'FACT'}],relation_versions:[{record_id:id(100),version:1},{record_id:id(101),version:1}],run_id:run,created_ms:stamp})
 }
 const manifest=[...new Map([...records.values()].map(r=>[r.record_id,{record_id:r.record_id,version:r.version}])).values()].sort((a,b)=>a.record_id.localeCompare(b.record_id))
 const definition={title:'Owned monitor',adapter_id:'research.relationship-events.v1',target_entity_ids:size?[id(100)]:[],target_pins:[],relation_types:['EMPLOYMENT'],sources:[]}
 const payload={text:'FACT full body',structuredContent:null,data_space:'LIVE',coverage:{stored_complete:true},redacted:false,usable_as_evidence:true}
 const receipt={id:result,owner_user_id:owner,case_id:caseId,run_id:run,step_key:'source-roles',monitor_check_id:check,source_id:'roles',request_hash:'a'.repeat(64),payload,source_scope:{knowledge_base_ids:[],documents:[],semantic_used:false,dependency_runs:[]},content_hash:monitorHash(payload),created_ms:String(stamp)}
 state.job={id:jobId,owner_user_id:owner,case_id:caseId,check_id:check,run_id:run,manifest,manifest_hash:monitorHash(manifest),next_index:0,records:[],reference_records:[],status:'running',error:'',created_ms:stamp,updated_ms:stamp}
 const db={async query(sql,p=[]){
  trace.push({sql,p,role:state.role})
  if(sql==='SET LOCAL ROLE agentstudio_monitor_worker'){state.role='agentstudio_monitor_worker';return{rows:[]}}
  if(sql==='SET LOCAL ROLE agentstudio_api'){state.role='agentstudio_api';return{rows:[]}}
  if(sql.includes("current_user='agentstudio_api'"))return{rows:[{ok:state.role==='agentstudio_api'&&p[0]===owner}]}
  if(sql.startsWith('SELECT c.case_id,c.run_id,m.definition_hash'))return{rows:state.missingContext?[]:[{case_id:caseId,run_id:run,definition_hash:monitorHash(definition),definition}]}
  if(sql.includes('monitor_live_case_read_lock('))return{rows:[{value:p[0]===caseId?{id:caseId,title:'Owned case',data_space:'LIVE',questions:[{question_id:id(90),question:'Q'}],created_ms:String(stamp)}:null}]}
  if(sql.includes('monitor_live_freeze_begin(')){
   assert.equal(state.role,'agentstudio_monitor_worker');assert.deepEqual(p,[check,token,2]);state.begins++
   if(state.beginThrows)throw Error('actual_lease_or_collection_not_ready')
   return{rows:[{value:structuredClone({...state.job,...state.jobOverride})}]}
  }
  if(sql.startsWith('SELECT record_id,version::text AS version,schema_id')){
   const record=p.length===4?records.get(p[2]+':'+p[3]):[...records.values()].filter(r=>r.record_id===p[2]).at(-1)
   state.reads.push(p[2]+':'+(p[3]??'latest'))
   if(!record)return{rows:[]}
   return{rows:[{...record,version:String(record.version),run_id:record.run_id||null,created_ms:String(record.created_ms)}]}
  }
  if(sql.includes('monitor_live_freeze_append(')){
   assert.equal(state.role,'agentstudio_monitor_worker');assert.equal(p[3],state.job.next_index)
   const batch=JSON.parse(p[4]),refs=JSON.parse(p[5]);assert(batch.length>=1&&batch.length<=20)
   state.appends++
   if(state.appendThrows)throw Error('actual_append_lease_lost')
   state.job.records.push(...batch);state.job.next_index+=batch.length
   state.job.reference_records=[...new Map([...state.job.reference_records,...refs].map(r=>[r.record_id+':'+r.version,r])).values()].sort((a,b)=>a.record_id.localeCompare(b.record_id)||a.version-b.version)
   return{rows:[{value:structuredClone({...state.job,...state.appendOverride})}]}
  }
  if(sql.includes('monitor_live_freeze_finish(')){
   assert.equal(state.role,'agentstudio_monitor_worker');assert.equal(state.job.next_index,manifest.length)
   state.finishes++;state.finishedPayload=JSON.parse(p[3])
   assert.equal(p[4],monitorCanonical(state.finishedPayload))
   assert.deepEqual(state.finishedPayload,{records:state.job.records,reference_records:state.job.reference_records,created_ms:stamp})
   if(state.manifestChanged)throw Error('monitor_live_snapshot_changed')
   if(state.finishThrows)throw Error('actual_finish_lease_lost')
   return{rows:[{value:fact}]}
  }
  if(sql.includes('AS ready'))return{rows:[{ready:true}]}
  if(sql.includes(' AS installed'))return{rows:[{installed:true,human_installed:false}]}
  if(sql.includes('knowledge_query_execution_validate_run($1'))return{rows:[{ok:!state.revoked}]}
  if(sql.includes('FROM agentstudio.runs WHERE'))return{rows:[{id:p[0],owner_user_id:owner}]}
  if(sql.startsWith('SELECT source_scope'))return{rows:[{source_scope:receipt.source_scope}]}
  if(sql.startsWith('SELECT id,owner_user_id,case_id'))return{rows:[receipt]}
  throw Error('unexpected pure freeze query '+sql)
 }}
 const data=new NativeMonitorBusinessData(async()=>{throw Error('freeze cannot write business records')})
 const current=async(dbArg,actualOwner,monitor)=>{assert.equal(dbArg,db);assert.equal(actualOwner,owner);assert.equal(monitor.case_id,caseId);state.currentChecks++;if(state.currentChanged)throw Error('actual_native_resource_changed')}
 const freezer=()=>new NativeMonitorLiveFreezer(data,current)
 return{state,trace,db,records,freezer}
}
test('one bounded batch commits a durable cursor; a new freezer resumes with no replay of prior base records',async()=>{
 const f=fixture(),one=await f.freezer().step(f.db,owner,lease())
 assert.deepEqual(one,{status:'freezing',check_id:check,next_index:20,total:21})
 assert.equal(f.state.appends,1);assert.equal(f.state.finishes,0)
 assert.deepEqual(f.state.job.reference_records.map(r=>[r.record_id,r.version]),[[id(100),1]])
 const readBefore=f.state.reads.length,two=await f.freezer().step(f.db,owner,lease())
 assert.equal(two.next_index,21);assert.equal(f.state.reads.length-readBefore,1)
 const three=await f.freezer().step(f.db,owner,lease())
 assert.deepEqual(three,{status:'analyzing',check_id:check,fact_set_id:fact});assert.equal(f.state.finishes,1)
 assert.equal(f.state.finishedPayload.records.length,21);assert.equal(f.state.role,'agentstudio_api')
 assert(!f.trace.some(q=>/^\s*(INSERT|UPDATE|DELETE|BEGIN|COMMIT)/.test(q.sql)))
})
test('an empty manifest freezes a real empty case without inventing an entity or replaying a GET',async()=>{
 const f=fixture({size:0}),out=await f.freezer().step(f.db,owner,lease())
 assert.equal(out.status,'analyzing');assert.equal(f.state.appends,0);assert.deepEqual(f.state.finishedPayload.records,[])
})
test('lease is closed, caller owner/context substitutions and forged journal manifests cannot progress',async()=>{
 const f=fixture()
 for(const invalid of [{...lease(),owner_user_id:owner},{...lease(),lease_version:0},{...lease(),check_id:'caller-check'}])await assert.rejects(()=>f.freezer().step(f.db,owner,invalid))
 for(const jobOverride of [{owner_user_id:id(20)},{case_id:id(21)},{run_id:id(22)},{check_id:id(23)},{manifest_hash:'b'.repeat(64)},{next_index:21},{status:'complete'},{manifest:[{record_id:id(100),version:1},{record_id:id(100),version:1}]}]){
  const x=fixture({jobOverride});await assert.rejects(()=>x.freezer().step(x.db,owner,lease()));assert.equal(x.state.appends,0);assert.equal(x.state.finishes,0);assert.equal(x.state.role,'agentstudio_api')
 }
 const x=fixture({missingContext:true});await assert.rejects(()=>x.freezer().step(x.db,owner,lease()));assert.equal(x.state.begins,0)
})
test('lease or RPC failure restores API role, returns no snapshot and does not retry',async()=>{
 for(const options of [{beginThrows:true},{appendThrows:true},{appendOverride:{next_index:19}}]){
  const f=fixture(options);await assert.rejects(()=>f.freezer().step(f.db,owner,lease()))
  assert.equal(f.state.role,'agentstudio_api');assert.equal(f.state.begins,1);assert(f.state.appends<=1);assert.equal(f.state.finishes,0)
 }
 const f=fixture({size:0,finishThrows:true});await assert.rejects(()=>f.freezer().step(f.db,owner,lease()),/actual_finish_lease_lost/);assert.equal(f.state.finishes,1);assert.equal(f.state.role,'agentstudio_api')
})
test('permission and resource changes between chunks are rechecked before immutable snapshot commit',async()=>{
 const revoked=fixture({size:3});await revoked.freezer().step(revoked.db,owner,lease());revoked.state.revoked=true
 await assert.rejects(()=>revoked.freezer().step(revoked.db,owner,lease()),e=>e.code==='monitor_source_unavailable')
 assert.equal(revoked.state.finishes,0)
 const changed=fixture({size:3});await changed.freezer().step(changed.db,owner,lease());changed.state.currentChanged=true
 await assert.rejects(()=>changed.freezer().step(changed.db,owner,lease()),/actual_native_resource_changed/);assert.equal(changed.state.finishes,0)
 const concurrent=fixture({size:3});await concurrent.freezer().step(concurrent.db,owner,lease());concurrent.state.manifestChanged=true
 await assert.rejects(()=>concurrent.freezer().step(concurrent.db,owner,lease()),/monitor_live_snapshot_changed/);assert.equal(concurrent.state.finishes,1)
})
test('corrupt committed record bytes or reference substitution cannot be normalized into a snapshot',async()=>{
 const f=fixture({size:3});await f.freezer().step(f.db,owner,lease())
 f.state.job.records[0].payload.canonical_name='tampered durable response'
 await assert.rejects(()=>f.freezer().step(f.db,owner,lease()),e=>e.code==='monitor_freeze_integrity_error')
 assert.equal(f.state.finishes,0)
 const x=fixture();x.state.job.reference_records=[entity(id(100),2)]
 await assert.rejects(()=>x.freezer().step(x.db,owner,lease()),e=>e.code==='monitor_freeze_integrity_error')
})
test('authored freeze RPCs preserve server manifest, exact cursor/DTO/closure checks, final ACL and atomic fact/check commit',()=>{
 const sql=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_074_monitor_live.sql',import.meta.url),'utf8')
 const body=name=>new RegExp('CREATE FUNCTION agentstudio\\.'+name+'\\([^;]*?AS \\$fn\\$([\\s\\S]*?)\\$fn\\$;').exec(sql)?.[1]
 const start=body('monitor_live_freeze_begin'),append=body('monitor_live_freeze_append'),finish=body('monitor_live_freeze_finish')
 assert(start&&append&&finish)
 assert.match(start,/status='succeeded'/);assert.match(start,/manifest_value=agentstudio.monitor_live_manifest\(c.owner_user_id,c.case_id\)/)
 assert.match(start,/q.source_definition=s.value/);assert.match(start,/r.monitor_check_id=c.id/)
 assert.match(append,/j.next_index<>\$4/);assert.match(append,/jsonb_array_length\(\$5\) NOT BETWEEN 1 AND 20/);assert.match(append,/IS DISTINCT FROM agentstudio.monitor_live_record_dto/)
 assert.match(finish,/j.manifest IS DISTINCT FROM agentstudio.monitor_live_manifest/);assert.match(finish,/WITH RECURSIVE pins/)
 assert.match(finish,/expected_refs IS DISTINCT FROM j.reference_records/);assert.match(finish,/knowledge_query_execution_validate_run\(source_run,''\)/)
 const acl=finish.indexOf('knowledge_query_execution_validate_run'),factInsert=finish.indexOf('INSERT INTO agentstudio.monitor_live_fact_sets'),advance=finish.indexOf("SET status='analyzing'")
 assert(acl>=0&&factInsert>acl&&advance>factInsert);assert.doesNotMatch(finish,/baseline_check_id\s*=/)
})
