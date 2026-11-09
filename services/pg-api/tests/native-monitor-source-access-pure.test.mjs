import test from 'node:test'
import assert from 'node:assert/strict'
import {readMonitorStoredReceipt,readMonitorReceiptFragment,parseMonitorSourceScope,assertMonitorRunSources} from '../src/native-monitor-source-access.ts'
import {monitorHash,monitorCanonical} from '../src/native-monitor-source-contract.ts'
import {parseMonitorRecordWrite,NativeMonitorBusinessData} from '../src/native-monitor-business-data.ts'
import {requireMonitorEmployeeReview} from '../src/native-monitor-live-analysis.ts'
// SQL-shape/current-ACL doubles only. These are not real PG/RLS evidence.
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(100),run=id(10),caseId=id(20),result=id(30),base=id(40),doc=id(50)
const scope=(extra={})=>({knowledge_base_ids:[],documents:[],semantic_used:false,dependency_runs:[],...extra})
function database(options={}){
 const trace=[],scopes=options.scopes??[scope()],payload={text:'a'.repeat(5000)+'FACT_TAIL',structuredContent:null,data_space:'LIVE',coverage:{stored_complete:true},redacted:false,usable_as_evidence:true},receipt={id:result,owner_user_id:owner,case_id:options.sourceCase??caseId,run_id:run,step_key:'declared_source_1',monitor_check_id:id(60),source_id:'roles',request_hash:'a'.repeat(64),payload,source_scope:scopes[0]??scope(),content_hash:monitorHash(payload),created_ms:'1793310000000'}
 const db={async query(sql,params=[]){trace.push({sql,params})
  if(sql.includes("current_user='agentstudio_api'"))return{rows:[{ok:params[0]===owner}]}
  if(sql.includes('AS ready'))return{rows:[{ready:options.missingRuntime!==true}]}
  if(sql.includes(' AS installed'))return{rows:[{installed:true,human_installed:false}]}
  if(sql.includes('knowledge_query_execution_validate_run($1'))return{rows:[{ok:options.revoked!==true}]}
  if(sql.includes('FROM agentstudio.runs WHERE'))return{rows:options.missingRun?[]:[{id:params[0],owner_user_id:options.crossOwner?id(200):owner}]}
  if(sql.startsWith('SELECT source_scope'))return{rows:scopes.map(source_scope=>({source_scope}))}
  if(sql.includes('knowledge_sharing_enabled'))return{rows:[{enabled:true}]}
  if(sql.includes('AS matches'))return{rows:[{matches:true}]}
  if(sql.includes('knowledge_runtime_scope'))return{rows:options.revokedBase?[]:params[0].map(base_id=>({base_id,owner_user_id:id(200),access_role:'viewer'}))}
  if(sql.includes('knowledge_query_scope('))return{rows:[{value:{fence:params[1].map(base_id=>({base_id,semantic_allowed:options.semantic!==false}))}}]}
  if(sql.includes('FROM agentstudio.knowledge_documents'))return{rows:options.missingDocument?[]:[{id:params[0]}]}
  if(sql.includes('monitor_live_case_read_lock('))return{rows:[{value:options.missingCase?null:{id:params[0]}}]}
  if(sql.startsWith('SELECT id,owner_user_id,case_id'))return{rows:[{...receipt,...options.receipt}]}
  if(sql.includes(' AS api_only'))return{rows:[{epoch:options.disabled?null:'7',api_only:options.worker!==true}]}
  throw Error('unexpected pure SQL: '+sql)
 }}
 return{db,trace,receipt}
}
test('persisted tail is returned only after actual owner/case/run/knowledge callbacks, with UTF16 anchors',async()=>{
 const f=database(),stored=await readMonitorStoredReceipt(f.db,owner,caseId,run,result),fragment=readMonitorReceiptFragment(stored,{field:'text',offset:5000,limit:4000})
 assert.equal(fragment.text,'FACT_TAIL');assert.equal(fragment.total_length,5009);assert.equal(fragment.has_more,false)
 assert(f.trace.findIndex(x=>x.sql.includes('knowledge_query_execution_validate_run($1'))<f.trace.findIndex(x=>x.sql.startsWith('SELECT id,owner_user_id,case_id')))
 assert(f.trace.every(x=>!/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT)/.test(x.sql)))
})
test('same-owner cross-case receipt checks both cases, while foreign owner/case and hash tamper fail',async()=>{
 const f=database({sourceCase:id(21)});await readMonitorStoredReceipt(f.db,owner,caseId,run,result);assert.deepEqual(f.trace.filter(q=>q.sql.includes('monitor_live_case_read_lock(')).map(q=>q.params[0]),[caseId,id(21)])
 for(const options of [{crossOwner:true},{missingCase:true},{missingRun:true},{receipt:{content_hash:'b'.repeat(64)}},{receipt:{owner_user_id:id(200)}},{receipt:{run_id:id(11)}}])await assert.rejects(()=>readMonitorStoredReceipt(database(options).db,owner,caseId,run,result),/monitor_source_unavailable/)
})
test('revoked current observations, missing runtime, grants, semantic permission or documents cannot be cached away',async()=>{
 for(const options of [{revoked:true},{missingRuntime:true},{revokedBase:true,scopes:[scope({knowledge_base_ids:[base]})]},{semantic:false,scopes:[scope({knowledge_base_ids:[base],semantic_used:true})]},{missingDocument:true,scopes:[scope({knowledge_base_ids:[base],documents:[{base_id:base,document_id:doc}]})]}])await assert.rejects(()=>readMonitorStoredReceipt(database(options).db,owner,caseId,run,result))
 const f=database({scopes:[scope({knowledge_base_ids:[base],semantic_used:true,documents:[{base_id:base,document_id:doc}]})]});await readMonitorStoredReceipt(f.db,owner,caseId,run,result);assert(f.trace.some(q=>q.sql.includes('knowledge_query_scope(')));assert(f.trace.some(q=>q.sql.includes('knowledge_documents')))
})
test('same-run dependencies are visited once, oversized/malformed scopes are explicit failures',async()=>{
 const f=database({scopes:[scope({dependency_runs:[run]})]});await assertMonitorRunSources(f.db,owner,run);assert.equal(f.trace.filter(q=>q.sql.includes('FROM agentstudio.runs WHERE')).length,1)
 for(const value of [scope({semantic_used:true}),scope({knowledge_base_ids:[base,base]}),scope({documents:[{base_id:base,document_id:doc}]}),scope({materials:['caller-readable']}),scope({dependency_runs:Array(101).fill(run)})])assert.throws(()=>parseMonitorSourceScope(value))
})
test('employee review rejects Worker/Broker membership and disabled identities, independent of model claims',async()=>{
 assert.equal(await requireMonitorEmployeeReview(database().db,owner),7)
 await assert.rejects(()=>requireMonitorEmployeeReview(database({worker:true}).db,owner),e=>e.status===403)
 await assert.rejects(()=>requireMonitorEmployeeReview(database({disabled:true}).db,owner),e=>e.status===401)
})
const entity=()=>({expected_version:0,schema_id:'research.entity.v1',payload:{canonical_name:'Synthetic Person',entity_type:'PERSON',aliases:[],identity_status:'CONFIRMED',identity_basis:'Employee reviewed'},source_refs:[],idempotency_key:'new-entity'})
test('original business schema and closed write input retain version/idempotency; no caller run/owner authority',()=>{
 assert.equal(parseMonitorRecordWrite(entity()).schema_id,'research.entity.v1')
 for(const change of [{run_id:run},{owner_user_id:owner},{expected_version:1},{expected_version:Number.MAX_SAFE_INTEGER},{source_refs:[{run_id:run,result_id:result,start:1,end:4,quote:'xx'}]}])assert.throws(()=>parseMonitorRecordWrite({...entity(),...change}))
 assert.throws(()=>new NativeMonitorBusinessData(undefined),/run_write_gate_required/)
 const v=entity();Object.defineProperty(v.payload,'canonical_name',{get(){assert.fail('getter executed')},enumerable:true});assert.throws(()=>parseMonitorRecordWrite(v))
})
test('semantic canonical hashes reject non-finite, malformed UTF16 or accessors rather than normalize evidence',()=>{
 for(const value of [NaN,Infinity,{value:'\ud800'},Array(2),{value:undefined}])assert.throws(()=>monitorCanonical(value))
 assert.equal(monitorCanonical({b:1,a:'😀'}),'{"a":"😀","b":1}')
})

test('Worker cannot create cases or omit run_id to enter the employee business-write path',async()=>{
 const f=database({worker:true}),db={async query(sql,p){
  if(sql.includes('monitor_live_case_read_lock('))return{rows:[{value:{id:caseId,title:'Owned case',data_space:'LIVE',questions:[{question_id:id(70),question:'Q'}],created_ms:'1793310000000'}}]}
  return f.db.query(sql,p)
 }},data=new NativeMonitorBusinessData(async()=>{throw Error('no run authority')})
 await assert.rejects(()=>data.caseCreate(db,owner,{title:'Case',data_space:'LIVE',questions:['Q']}),error=>error.code==='monitor_employee_review_required')
 const raw={expected_version:0,schema_id:'research.entity.v1',payload:{canonical_name:'Person',entity_type:'PERSON',aliases:[],identity_status:'CONFIRMED',identity_basis:'employee confirmed'},source_refs:[],idempotency_key:'manual-key'}
 await assert.rejects(()=>data.write(db,owner,caseId,raw),error=>error.code==='monitor_employee_review_required')
 assert(!f.trace.some(q=>/^\s*(INSERT|UPDATE|DELETE)/.test(q.sql)))
 let calls=0;const modelData=new NativeMonitorBusinessData(async(_db,actualOwner,actualCase,actualRun)=>{
  assert.equal(actualOwner,owner);assert.equal(actualCase,caseId);assert.equal(actualRun,run);calls++;throw Error('fenced_run_required')
 })
 await assert.rejects(()=>modelData.write(db,owner,caseId,raw,run),/fenced_run_required/);assert.equal(calls,1)
 assert(!f.trace.some(q=>/^\s*(INSERT|UPDATE|DELETE)/.test(q.sql)))
})
