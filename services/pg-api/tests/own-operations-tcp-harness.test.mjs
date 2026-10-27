// Pure regression for the actual two local helper functions in the guarded
// TCP entry. Only those declarations are evaluated; the entry/guard/fixtures,
// pg module, test registrations, sockets and SQL are never imported/executed.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ownCursor,parseOwnCursor,parseOwnTodoQuery,ownCategoryRanks,ownCategories,ownKinds,compareOwnPositions,ownId,ownCountKeys} from '../src/own-operations-contract.ts'
import {OwnOperationsRepository,ownOperationsTodosSql,ownOperationsGuardSql,ownOperationsSchemaSql,ownOperationsNowSql,ownOperationsCountsSql,ownOperationsRecentSql,ownOperationsTables} from '../src/own-operations-repository.ts'
const stamp='2026-10-27T01:02:03.123456Z',id='10000000-0000-4000-8000-000000000001'
function helpers(){
 const source=readFileSync(new URL('./own-operations-tcp.integration.mjs',import.meta.url),'utf8'),begin=source.indexOf('function tracePool('),end=source.indexOf('async function seed(')
 assert.ok(begin>0&&end>begin)
 const declarations=source.slice(begin,end)
 assert.doesNotMatch(declarations,/\bimport\s*(?:\(|['"])/)
 return Function('assert','ownOperationsTodosSql','ownCursor','parseOwnTodoQuery','ownCategoryRanks',declarations+';return {tracePool,fixedQuery}')(assert,ownOperationsTodosSql,ownCursor,parseOwnTodoQuery,ownCategoryRanks)
}
test('actual trace helper preserves single/multiple driver result identity and real pool capabilities',async()=>{
 const single={rows:[{actual:1}]},multi=[{rows:[]},{rows:[]}],driver=[single,multi];let released=0
 const base={knowledgeSharing:false,knowledgeEmbeddingSettings:true,knowledgeEmbeddingConsent:false,knowledgeIndexRuntime:true,knowledgeQueryRuntime:false,knowledgeToolRuntime:true,
  get actualContext(){assert.equal(this,base);return 'original-receiver'},async connect(){assert.equal(this,base);return {release(){released++},async query(){return driver.shift()}}}}
 const traced=helpers().tracePool(base),client=await traced.pool.connect()
 for(const key of ['knowledgeSharing','knowledgeEmbeddingSettings','knowledgeEmbeddingConsent','knowledgeIndexRuntime','knowledgeQueryRuntime','knowledgeToolRuntime','actualContext'])assert.equal(traced.pool[key],base[key])
 assert.equal(await client.query('SELECT actual'),single)
 assert.equal(await client.query("SET LOCAL statement_timeout='8000ms'; SET LOCAL lock_timeout='3000ms'"),multi)
 assert.deepEqual(traced.trace.map(r=>[r.count,r.result_counts,r.multi_result]),[[1,[1],false],[0,[0,0],true]])
 await assert.rejects(client.query('INSERT INTO forbidden VALUES(1)'),assert.AssertionError)
 client.release();assert.equal(released,1)
})
test('actual repository actor completes through the traced combined-SET result without changing queries/results',async()=>{
 const trace=[],multiple=[{rows:[]},{rows:[]}],owner=id,counts=Object.fromEntries(ownCountKeys.map(k=>[k,'0']));let releases=0
 const base={knowledgeSharing:true,knowledgeEmbeddingSettings:false,knowledgeEmbeddingConsent:true,knowledgeIndexRuntime:false,knowledgeQueryRuntime:true,knowledgeToolRuntime:false,async connect(){return {release(){releases++},async query(sql,args=[]){
  trace.push({sql,args})
  if(sql.startsWith('SET LOCAL statement_timeout='))return multiple
  if(sql.includes('identity_user_id('))return {rows:[{id:owner}]}
  if(sql.startsWith("SELECT current_user="))return {rows:[{ok:true}]}
  if(sql===ownOperationsGuardSql)return {rows:[{ok:true}]}
  if(sql==='SELECT agentstudio.agent_memory_outcome_epoch() AS epoch')return {rows:[{epoch:'1'}]}
  if(sql===ownOperationsSchemaSql)return {rows:ownOperationsTables.map(name=>({name,ok:true}))}
  if(sql===ownOperationsNowSql)return {rows:[{as_of:stamp}]}
  if(sql===ownOperationsCountsSql)return {rows:[counts]}
  if(sql===ownOperationsRecentSql)return {rows:[]}
  return {rows:[]}
 }}}}
 const wrapped=helpers().tracePool(base),value=await new OwnOperationsRepository(wrapped.pool).overview({issuer:'urn:agentstudio:local:v1',subject:'synthetic'})
 assert.equal(value.protocol,'native_own_overview_v1');assert.equal(trace.at(-1).sql,'COMMIT');assert.equal(releases,1)
 assert.deepEqual(wrapped.trace[1].result_counts,[0,0]);assert.equal(wrapped.trace[1].multi_result,true)
 const flags=trace.filter(row=>row.sql.includes("SELECT set_config('agentstudio.knowledge_"))
 assert.deepEqual(flags.map(row=>row.args),[['true'],['false'],['true'],['false'],['true'],['false']])
 assert.equal(trace.some(row=>/^\s*(?:INSERT|UPDATE|DELETE|MERGE)\b/i.test(row.sql)),false)
})
test('actual fixed-query helper uses the saved microsecond anchor and legal rank/step for every filter',()=>{
 const {fixedQuery}=helpers()
 for(const category of ownCategories)for(const kind of ownKinds){
  const q=fixedQuery(stamp,id,{category,kind,q:'  literal%_\\  ',limit:1}),cursor=parseOwnCursor(q.before,q)
  assert.equal(cursor.as_of,stamp);assert.equal(cursor.observed_at,stamp);assert.equal(cursor.id,id);assert.equal(q.q,'literal%_\\')
  assert.equal(cursor.category_rank,ownCategoryRanks[category==='all'?'failed':category])
  if(category==='effect_review')assert.ok(cursor.step_key.length>0);else assert.equal(cursor.step_key,null)
  // The newest fixture branch is schedule age59s; all other branch ages are
  // minutes/hours. This real-time boundary is ahead of every seeded tuple.
  assert.ok(compareOwnPositions({...cursor,observed_at:'2026-10-27T01:01:04.123456Z'},cursor)<0)
 }
 const approval=parseOwnTodoQuery({category:'approval'})
 assert.throws(()=>ownCursor(approval,stamp,{observed_at:stamp,id,category_rank:6,step_key:null}),e=>e.code==='invalid_own_todo_cursor')
 assert.equal(ownId('ffffffff-ffff-ffff-ffff-ffffffffffff'),'ffffffff-ffff-ffff-ffff-ffffffffffff','fix does not narrow the existing lower-hex UUID protocol')
})
