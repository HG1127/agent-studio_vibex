import test from 'node:test'
import assert from 'node:assert/strict'
import {readOrdinaryCaseReceipt,readOrdinaryCaseEvidence,assertOrdinaryCaseRunSources} from '../src/native-ordinary-case-source-access.ts'
import {monitorHash} from '../src/native-monitor-source-contract.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(1),caseId=id(2),run=id(3),source=id(4),result=id(5),base=id(6),doc=id(7)
const denied=work=>assert.rejects(work,error=>Number.isInteger(error?.status)&&[400,403,404,409,422,503].includes(error.status)&&typeof error.code==='string')
const scope=extra=>({knowledge_base_ids:[],documents:[],semantic_used:false,dependency_runs:[],...extra})
function fixture(options={}){
 const trace=[],payload={text:'x'.repeat(5000)+'ACTUAL_TAIL',structuredContent:null,coverage:{stored_complete:true},redacted:false,usable_as_evidence:true,http_response:{status:200,complete:true,empty:false,media_type:'text/plain'},data_space:'LIVE',...options.payload}
 const row={id:result,owner_user_id:owner,case_id:caseId,run_id:run,step_key:'wf2_00002_agent_a01t',payload,source_scope:scope(),content_hash:monitorHash(payload),created_ms:'1793310000000',input_sha256:'b'.repeat(64),...options.row}
 const db={async query(sql,p=[]){trace.push({sql,p})
  if(sql.includes("current_user='agentstudio_api'"))return{rows:[{ok:p[0]===owner}]}
  if(sql.includes(' AS ready'))return{rows:[{ready:!options.missingRuntime}]}
  if(sql.includes(' AS installed'))return{rows:[{installed:true,human_installed:false}]}
  if(sql.includes('knowledge_query_execution_validate_run($1'))return{rows:[{ok:options.revokedRun!==p[0]}]}
  if(sql.startsWith('SELECT id,owner_user_id FROM agentstudio.runs'))return{rows:options.missingRun===p[0]?[]:[{id:p[0],owner_user_id:options.crossOwner?id(99):owner}]}
  if(sql.startsWith('SELECT id FROM agentstudio.ordinary_case_receipts'))return{rows:[{id:result}]}
  if(sql.startsWith('SELECT source_scope FROM agentstudio.monitor_live_receipts'))return{rows:(options.monitorScopes?.[p[1]]??[]).map(source_scope=>({source_scope}))}
  if(sql.startsWith('SELECT source_scope,true AS ordinary'))return{rows:options.scopes??[]}
  if(sql.startsWith('SELECT DISTINCT source_run_id'))return{rows:options.chain?[{source_run_id:id(Number(p[1].slice(-12))+1)}]:(options.edges?.[p[1]]??[]).map(source_run_id=>({source_run_id}))}
  if(sql.includes('ordinary_case_lookup('))return{rows:[{value:options.binding===false?null:{protocol:'ordinary_case_run_v1',owner_user_id:options.bindingOwner??owner,run_id:p[0],job_id:id(20),case_id:caseId,question_id:null,spec_id:id(21),spec_revision:1,binding_sha256:'a'.repeat(64)}}]}
  if(sql.startsWith('SELECT r.id,r.owner_user_id'))return{rows:[row]}
  if(sql.includes('ordinary_case_receipt_current('))return{rows:[{value:options.metadataCurrent!==false}]}
  if(sql.includes('knowledge_sharing_enabled'))return{rows:[{enabled:true}]}
  if(sql.includes('AS matches'))return{rows:[{matches:true}]}
  if(sql.includes('knowledge_runtime_scope'))return{rows:options.revokedBase?[]:p[0].map(base_id=>({base_id,owner_user_id:id(99),access_role:'viewer'}))}
  if(sql.includes('knowledge_query_scope('))return{rows:[{value:{fence:p[1].map(base_id=>({base_id,semantic_allowed:options.semantic!==false}))}}]}
  if(sql.includes('FROM agentstudio.knowledge_documents'))return{rows:options.missingDocument?[]:[{id:p[0]}]}
  throw Error('unexpected source DATA query '+sql)
 }}
 return{db,trace,row}
}
test('ordinary receipt returns actual stored tail after owner, run, current binding and metadata checks',async()=>{const f=fixture(),r=await readOrdinaryCaseEvidence(f.db,owner,caseId,run,result);assert.equal(r.payload.text.slice(5000),'ACTUAL_TAIL');assert.equal(r.monitor_check_id,null);assert.equal(r.source_id,null);assert(f.trace.findIndex(q=>q.sql.includes('knowledge_query_execution_validate_run($1'))<f.trace.findIndex(q=>q.sql.startsWith('SELECT r.id,r.owner_user_id')));assert(f.trace.every(q=>!/^INSERT|UPDATE|DELETE/.test(q.sql)))})
for(const [name,options] of Object.entries({foreign_owner:{crossOwner:true},foreign_case:{row:{case_id:id(99)}},wrong_run:{row:{run_id:id(99)}},hash_tamper:{row:{content_hash:'f'.repeat(64)}},metadata_change:{metadataCurrent:false},case_binding_owner_change:{bindingOwner:id(99)},missing_run:{missingRun:run},missing_runtime:{missingRuntime:true}}))test('ordinary receipt rejects '+name,async()=>denied(readOrdinaryCaseReceipt(fixture(options).db,owner,caseId,run,result)))
test('a later source revoke invalidates a prior same-case ordinary run transitively',async()=>{const f=fixture({edges:{[run]:[source]},revokedRun:source});await denied(readOrdinaryCaseReceipt(f.db,owner,caseId,run,result));assert(f.trace.some(q=>q.sql.includes('knowledge_query_execution_validate_run($1')&&q.p[0]===source))})
for(const [name,options] of Object.entries({team_grant:{revokedBase:true},semantic_permission:{semantic:false},document_removed:{missingDocument:true}}))test('ordinary dependencies reject current '+name+' revoke',async()=>{const scopes={[source]:[scope({knowledge_base_ids:[base],semantic_used:true,documents:[{base_id:base,document_id:doc}]})]};await denied(readOrdinaryCaseReceipt(fixture({...options,monitorScopes:scopes,edges:{[run]:[source]}}).db,owner,caseId,run,result))})
test('source graph has a hard distinct depth bound',async()=>denied(assertOrdinaryCaseRunSources(fixture({chain:true}).db,owner,run)))
test('ordinary receipts cannot invent KB scopes in place of actual Root observations',async()=>denied(readOrdinaryCaseReceipt(fixture({scopes:[{ordinary:true,source_scope:scope({knowledge_base_ids:[base]})}]}).db,owner,caseId,run,result)))
test('unusable response remains inspectable but cannot support a record',async()=>{for(const payload of [{redacted:true,usable_as_evidence:false},{coverage:{stored_complete:false}},{text:''}]){const f=fixture({payload});assert.equal((await readOrdinaryCaseReceipt(f.db,owner,caseId,run,result)).id,result);await assert.rejects(readOrdinaryCaseEvidence(f.db,owner,caseId,run,result),/complete_usable_evidence_required/)}})
