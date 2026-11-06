// Terminal catalog metadata only; the database and its SQL are never executed.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {originalQuality089Static as schema} from '../services/pg-api/src/original-quality089-static.mjs'
import {assertOriginalQuality089Catalog} from '../services/pg-api/src/original-quality089-catalog.mjs'
import {originalQuality089CatalogFixture} from './helpers/original-quality089-catalog-fixture.mjs'

// PG18 StoreRelCheck collects Vars in expression traversal order and removes
// later duplicates, rather than sorting by table-column position:
// https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/catalog/heap.c#L2050-L2069
const cases=[
 ['agent_quality089_revisions','quality089_revision_rules',['state','checks_sha256','checks'],['state','checks','checks_sha256']],
 ['agent_quality089_receipts','q089_receipts_after_revision_ck',['after_revision','before_revision'],['before_revision','after_revision']],
 ['agent_quality089_intents','q089_intents_ck1',['kind','version_id','expected_new_source'],['kind','expected_new_source','version_id']],
 ['agent_quality089_intents','q089_intents_ck2',['consumed_revision','before_revision'],['before_revision','consumed_revision']],
 ['agent_quality089_intents','quality089_intent_rules',['checks_sha256','checks'],['checks','checks_sha256']],
]
const sql=readFileSync(new URL('../db/postgres/migrations/pg_v9_089_original_agent_quality_revisions.sql',import.meta.url),'utf8')
const fingerprint=keys=>{const raw=JSON.stringify(['array',keys.map(key=>['string',key])]);return{state:'value',sha256:createHash('sha256').update(raw).digest('hex'),bytes:Buffer.byteLength(raw)}}
const constraint=(frame,table,name)=>{const rows=frame.constraints.filter(row=>row.table===table&&row.name===name);assert.equal(rows.length,1);return rows[0]}
function fixture(){const frame=structuredClone(originalQuality089CatalogFixture(sql));for(const[table,name,keys]of cases)constraint(frame,table,name).keys=[...keys];return frame}

test('the observed real PG18 check15 digest matches the independent exact column-order DATA',()=>{
 assert.deepEqual(fingerprint(cases[0][2]),{state:'value',sha256:'be19223c03d46882027604a9cf4531e975311e9c2b42b8077d6798c490ab5f9d',bytes:77})
 assert.deepEqual(fingerprint(cases[0][3]),{state:'value',sha256:'78539bb7a1d2a2f30fe28908c9541a584a3171cc857aea5d80d6c9219cdd8afc',bytes:77})
})
for(const[table,name,keys,old]of cases){
 test(name+' retains the exact SQL expression and its column-reference order',()=>{
  const spec=schema.tables.find(row=>row.name===table)?.constraints.find(row=>row.name===name);assert(spec);assert.equal(spec.type,'c');assert.deepEqual(spec.keys,keys);assert(sql.includes('CHECK('+spec.expression+')'));const positions=keys.map(key=>spec.expression.search(new RegExp('\\b'+key+'\\b')));assert(positions.every(at=>at>=0));assert(positions.every((at,i)=>i===0||positions[i-1]<at))
 })
 test(name+' refuses the old table-column ordering instead of accepting permutations',()=>{const frame=fixture();constraint(frame,table,name).keys=[...old];assert.throws(()=>assertOriginalQuality089Catalog(frame),/original_quality089_catalog_unconfirmed/)})
 for(const mode of['missing','extra','duplicate'])test(name+' still refuses '+mode+' referenced columns',()=>{const frame=fixture(),row=constraint(frame,table,name);row.keys=mode==='missing'?keys.slice(1):mode==='extra'?[...keys,'owner_user_id']:[...keys,keys[0]];assert.throws(()=>assertOriginalQuality089Catalog(frame),/original_quality089_catalog_unconfirmed/)})
}
test('the unchanged strict catalog validator accepts complete independently specified CHECK-order metadata',()=>assert.equal(assertOriginalQuality089Catalog(fixture()).verified,true))
for(const type of['p','f'])test('the original '+type+' column order remains exact',()=>{const frame=fixture(),row=frame.constraints.find(row=>row.type===type&&row.keys.length>1);assert(row);row.keys.reverse();assert.throws(()=>assertOriginalQuality089Catalog(frame),/original_quality089_catalog_unconfirmed/)})
test('CHECK expressions and safety cannot be changed while retaining the expected column order',()=>{for(const mutate of[row=>row.expression='true',row=>row.safe=false,row=>row.deferrable=true]){const frame=fixture();mutate(constraint(frame,cases[0][0],cases[0][1]));assert.throws(()=>assertOriginalQuality089Catalog(frame),/original_quality089_catalog_unconfirmed/)}})
