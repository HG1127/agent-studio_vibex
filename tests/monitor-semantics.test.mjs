import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const m={exports:{}};vm.runInNewContext(fs.readFileSync('pocketbase/pb_hooks/modules/monitor_semantics.js','utf8'),{module:m});const adapter=m.exports
const def={target_entity_ids:['person'],relation_types:['EMPLOYMENT','BOARD','CO_WORK']},baseline=Date.parse('2026-10-20T12:00:00Z'),now=Date.parse('2026-10-29T12:00:00Z')
const entity=(id,type)=>({record_id:id,version:1,schema_id:'research.entity.v1',payload:{canonical_name:id,entity_type:type,identity_status:'CONFIRMED'}})
const relation=(id,to,from='2024',end=null,status='SOURCE_SUPPORTED')=>({record_id:id,version:1,schema_id:'research.relation.v1',payload:{from_id:'person',to_id:to,relation_type:'EMPLOYMENT',description:'Synthetic source text',valid_from:from,valid_to:end,status,missing:[]},source_refs:[{result_id:'result'}],relation_versions:[{record_id:'person',version:1},{record_id:to,version:1}]})
const snapshot=roles=>({payload:{records:[entity('person','PERSON'),entity('orgA','ORGANIZATION'),entity('orgB','ORGANIZATION'),...roles],reference_records:[]}})
const compare=(a,b)=>adapter.compare(a?snapshot(a):null,snapshot(b),def,baseline,now)
test('same facts, changed prose/source metadata and first baseline never emit role changes',()=>{
  const r=relation('r','orgA'),changed=structuredClone(r);changed.version=2;changed.payload.description='New report wording';changed.source_refs=[{result_id:'new-result'}]
  assert.equal(compare([r],[changed]).events.length,0);assert.equal(compare(null,[r]).events.length,0)
})
test('new old reporting is historical evidence; duplicate claims are not independent confirmations',()=>{
  const r=relation('r','orgA'),old=relation('old','orgB','2020')
  const result=compare([r],[r,old]);assert.equal(result.events[0].kind,'historical_information');assert.equal(result.events[0].notify,false)
  const duplicate=compare([r],[r,{...r,record_id:'duplicate'}]);assert.ok(duplicate.issues.some(i=>i.code==='ambiguous_relation_records'));assert.equal(duplicate.events.filter(e=>e.notify).length,0)
})
test('new additional role never implies leaving the old role',()=>{
  const r=relation('r','orgA'),newRole=relation('new','orgB','2026-10-25')
  const result=compare([r],[r,newRole]);assert.equal(result.events[0].kind,'additional_role');assert.equal(result.events[0].notify,true);assert.equal(result.events.some(e=>e.kind==='role_ended'),false)
})
test('only explicit supported recent end dates produce role-ended events',()=>{
  const r=relation('r','orgA'),ended=structuredClone(r);ended.payload.valid_to='2026-10-25';ended.version++
  assert.equal(compare([r],[ended]).events[0].kind,'role_ended')
  assert.ok(compare([r],[]).issues.some(i=>i.code==='prior_fact_not_observed'));assert.equal(compare([r],[]).events.some(e=>e.kind==='role_ended'),false)
})
test('date corrections, future/unknown starts and dates overlapping a baseline are explicit non-role events',()=>{
  const r=relation('r','orgA'),corrected=structuredClone(r);corrected.payload.valid_from='2023';assert.equal(compare([r],[corrected]).events[0].kind,'fact_corrected')
  for(const [date,kind] of [[null,'undated_information'],['2027','future_information'],['2026','time_overlap_information']]){const result=compare([r],[r,relation('new','orgB',date)]);assert.equal(result.events[0].kind,kind);assert.equal(result.events[0].notify,false)}
})
test('conflicts and source invalidation are actionable but cannot masquerade as employment ends',()=>{
  const r=relation('r','orgA'),conflict=relation('r','orgA','2024',null,'CONFLICT'),invalid=relation('r','orgA','2024',null,'INVALIDATED')
  assert.equal(compare([r],[conflict]).events[0].kind,'conflict');assert.equal(compare([r],[conflict]).can_advance,false)
  assert.equal(compare([r],[invalid]).events[0].kind,'source_invalidated');assert.equal(compare([r],[invalid]).events.some(e=>e.kind==='role_ended'),false)
})
test('unresolved identities, stale endpoint versions and missing source evidence block admission',()=>{
  for(const modify of [r=>{r.relation_versions[0].version=2},r=>{r.source_refs=[]}]){const r=relation('r','orgA');modify(r);const result=compare(null,[r]);assert.equal(result.can_advance,false);assert.equal(result.events.some(e=>e.notify),false)}
})
