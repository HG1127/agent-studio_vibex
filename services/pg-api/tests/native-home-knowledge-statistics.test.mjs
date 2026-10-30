import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import {originalHomeStatisticsFunctionPins} from '../src/native-home-knowledge-stats-pins.ts'
import {selectOriginalHomeKnowledgeStatistics,inspectOriginalHomeKnowledgeStatisticsStartup} from '../src/native-home-knowledge-stats-runtime.ts'
import {originalHomeStatisticsPresenceSql,inspectOptionalOriginalHomeKnowledgeStatisticsSchema} from '../src/native-home-knowledge-stats-audit.ts'
// Pure negative/control-flow fixtures, never catalog/ACL/installation evidence.
function absent({rows=[],principal=true,rollbackFailure=false}={}){const state={queries:[],released:[],rows,principal,rollbackFailure},pool={knowledgeSharing:true,connect:async()=>({release(discard){state.released.push(discard)},async query(sql){state.queries.push(sql);if(sql==='ROLLBACK'&&state.rollbackFailure)throw Error('rollback lost');if(sql===originalHomeStatisticsPresenceSql)return{rows:state.rows};if(sql.includes("current_user='agentstudio_api' AND session_user"))return{rows:[{ok:state.principal}]};if(sql.startsWith('BEGIN ')||sql.startsWith('SET LOCAL ')||sql==='ROLLBACK')return{rows:[]};throw Error('pure fixture cannot attest installed072')}})};return{state,pool}}
test('072 defaults off; independent flag requires HTTPS and original sharing capability',()=>{assert.equal(selectOriginalHomeKnowledgeStatistics({},'https://studio.example',false),false);assert.equal(selectOriginalHomeKnowledgeStatistics({AGENT_STUDIO_PG18_ORIGINAL_HOME_SHARED_STATISTICS_ENABLED:'true'},'https://studio.example',true),true);for(const [marker,origin,sharing]of [['false','https://studio.example',true],['true','http://localhost',true],['true','https://studio.example',false]])assert.throws(()=>selectOriginalHomeKnowledgeStatistics({AGENT_STUDIO_PG18_ORIGINAL_HOME_SHARED_STATISTICS_ENABLED:marker},origin,sharing),/unsafe_original_home_statistics_config/)})
test('absent/off still performs actual-query-shaped inventory preflight and mounts no capability',async()=>{const f=absent(),value=await inspectOriginalHomeKnowledgeStatisticsStartup({pool:f.pool,env:{},allowedOrigin:'https://studio.example'});assert.deepEqual(value,{available:false});assert(f.state.queries.includes(originalHomeStatisticsPresenceSql));assert.equal(f.state.queries.at(-1),'ROLLBACK')})
test('enabled plus absent schema rejects and cannot substitute a supplied status',async()=>{const f=absent();await assert.rejects(inspectOriginalHomeKnowledgeStatisticsStartup({pool:f.pool,env:{AGENT_STUDIO_PG18_ORIGINAL_HOME_SHARED_STATISTICS_ENABLED:'true'},allowedOrigin:'https://studio.example',schemaStatus:'installed'}),/original_home_statistics_schema_required/)})
for(const row of [{kind:'migration',name:'pg_v9_072'},{kind:'function',name:'original_home_knowledge_stats'},{kind:'relation',name:'original_home_knowledge_stats_extra'}])test('partial inventory stays refused even while flag off: '+row.kind,async()=>{const f=absent({rows:[row]});await assert.rejects(inspectOriginalHomeKnowledgeStatisticsStartup({pool:f.pool,env:{},allowedOrigin:'https://studio.example'}),error=>error.code==='original_home_knowledge_statistics_unavailable')})
test('unsafe actual login shape never becomes absent readiness',async()=>{const f=absent({principal:false});await assert.rejects(inspectOptionalOriginalHomeKnowledgeStatisticsSchema(f.pool),error=>error.code==='original_home_knowledge_statistics_unavailable')})
test('rollback failure on a successful absent audit discards and refuses readiness',async()=>{const f=absent({rollbackFailure:true});await assert.rejects(inspectOptionalOriginalHomeKnowledgeStatisticsSchema(f.pool),/original_home_statistics_schema_rollback_required/);assert.deepEqual(f.state.released,[true])})
test('rollback failure after primary refusal retains primary and still discards',async()=>{const f=absent({principal:false,rollbackFailure:true});await assert.rejects(inspectOptionalOriginalHomeKnowledgeStatisticsSchema(f.pool),error=>error.code==='original_home_knowledge_statistics_unavailable');assert.deepEqual(f.state.released,[true])})
test('old ACL function grants include all unchanged001-069 migrations, rather than only their032 definitions',()=>{
 const root=new URL('../../../db/postgres/migrations/',import.meta.url),files=fs.readdirSync(root).filter(name=>/^pg_v9_\d{3}_.*\.sql$/.test(name)&&Number(name.slice(6,9))<=69).sort()
 for(const pin of originalHomeStatisticsFunctionPins.filter(value=>value.signature!=='original_home_knowledge_stats(uuid)')){
  const roles=new Set(['PUBLIC']),needle='agentstudio.'+pin.signature
  for(const file of files){const sql=fs.readFileSync(new URL(file,root),'utf8');for(const event of sql.matchAll(/\b(GRANT EXECUTE|REVOKE (?:ALL|EXECUTE)) ON FUNCTION ([^;]+?) (TO|FROM) ([^;]+);/g)){
   if(!event[2].replace(/\s+/g,'').split(/,(?=agentstudio\.)/).includes(needle))continue
   for(const role of event[4].split(',').map(value=>value.trim())){assert.match(role,/^[a-z_]+$|^PUBLIC$/);if(event[1]==='GRANT EXECUTE')roles.add(role);else roles.delete(role)}
  }}
  assert.deepEqual([...pin.roles].sort(),[...roles].sort(),pin.signature+' exact final source grants')
 }
})
