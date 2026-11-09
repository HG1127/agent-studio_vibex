import assert from 'node:assert/strict'
const collections=Object.freeze({agent_single:'runs',workflow_safe:'workflow-runs',workflow_v2:'workflow-v2-runs',agent_autonomous:'agent-autonomous-runs'})
export function originalQueuedNegativeReads(knownIds){
 assert(Array.isArray(knownIds)&&knownIds.length===8&&new Set(knownIds).size===8&&knownIds.every(v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)))
 const known=new Set(knownIds),pending=new Map()
 return{
  expect(id,kinds,reason){assert(known.has(id)&&['legacy_kind_resolution','wrong_explicit_kind','foreign_owner'].includes(reason)&&Array.isArray(kinds)&&kinds.length>0&&kinds.length<=4&&new Set(kinds).size===kinds.length);const targets=[];for(const kind of kinds){assert(Object.hasOwn(collections,kind));const path='/api/v2/'+collections[kind]+'/'+id;assert(!pending.has(path));targets.push(path)}for(const path of targets)pending.set(path,{id,reason});return{assertConsumed(){assert(targets.every(path=>!pending.has(path)),'the exact target negative reads were not consumed')}}},
  consume(method,path,status,body){if(method!=='GET'||status!==404||!body||!['run_not_found','workflow_run_not_found','agent_run_not_found'].includes(body.error))return null;const match=pending.get(path);if(!match)return null;pending.delete(path);return{path,status,target_id:match.id,reason:match.reason}},
  assertEmpty(){assert.equal(pending.size,0,'unconsumed exact target404 reads')},
 }
}
