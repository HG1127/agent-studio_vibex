#!/usr/bin/env node
// Source/initialization REVIEW contract only. No SQL executor, credentials,
// target URL, paid transport, service startup or deployment mode exists here.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const sqlPath='db/postgres/migrations/pg_v9_070_home_authoring.sql'
const sqlPin='f4b37261c7164aaa58257b7b357eef0047cb3f82fb11364ae14aea7d9874cd69'
const parserPin='78356c473b3dcf190ff65fff25265b0321d31a0bc9db67a159ee66b599f881b2'
const entryPoints=Object.freeze([
 'services/pg-api/src/native-server.ts',
 'services/pg-api/src/native-home-agent-specs-runtime.ts',
 'services/pg-api/src/native-home-authoring-audit.ts',
 'services/pg-api/src/native-home-agent-specs-http.ts',
 'services/pg-api/src/native-home-agent-specs-repository.ts',
 'services/pg-api/src/native-original-ui-preconditions.ts',
  'services/pg-api/src/native-home-resources-contract.ts',
  'services/pg-api/src/native-home-resources-repository.ts',
  'services/pg-api/src/native-home-resources-http.ts',
  'services/pg-api/src/native-home-knowledge-stats-audit.ts',
 'shared/original-home-authoring.ts',
 'ops/pg18-original-home070-review-plan.mjs',
])
const sha=raw=>createHash('sha256').update(raw).digest('hex')
const fail=()=>{throw Error('original_home070_review_source_refused')}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
export function originalHome070InitializationContract(){
 return freeze({
  profile:'original-home070',mode:'review-only',default_profile:'default050',predecessor_profile:'complete069',latest_migration:'pg_v9_070',
  initialization_scope:'separate fresh disposable synthetic PostgreSQL18 verification only; no existing company or production target',
  sql_step:{path:sqlPath,sha256:sqlPin,preserve_original_transaction:true},
  expected_additions:{tables:['agentstudio.agent_spec_authoring'],pure_invoker_functions:['agentstudio.home_authoring_utf16_length(text)','agentstudio.home_authoring_valid(jsonb)'],roles:[],logins:[],worker_authority:false},
  required_order:[
   'Genuine independently gated isolated CI admission and new disposable clusters, never forged environment/DTO claims',
   'Run original complete069 preparation and independent actual API LOGIN audit while the database is still exactly complete069',
   'Apply the exact pinned070 source as a separately selected profile step on that same owned synthetic verification target',
   'Check new070 ledger plus full inventory/ACL/RLS/FK/helper bodies using a real independent Native/API login',
   'Start the real Native HTTP entry with existing non-root HTTPS/credential checks; flag off rejects partial/unsafe070',
   'Explicitly enable original Home facade, then exercise genuine employee Cookie/CSRF and full original Home save/read/CAS paths',
  ],
  startup:{flag:'AGENT_STUDIO_PG18_ORIGINAL_HOME_ENABLED',default:'off',absent_and_off:'no facade',installed_and_off:'strict read-only schema audit, no facade',partial_or_unsafe_even_off:'reject startup',enabled_without_schema:'reject startup',writes:'existing configurationWrites gate only'},
  boundaries:{default050_unchanged:true,frozen059_060_unchanged:true,complete069_unchanged:true,old133_table_evidence_reusable_as070:false,filtering070_out_of_old_ledger:false,executor_provided:false,network_used:false,SQL_executed:false,secrets_read:false,writes_performed:false,services_started:false,actual_login_verified:false,original_page_accepted:false,production_cutover_allowed:false},
 })
}
function bytes(relative){
 if(!entryPoints.includes(relative)&&relative!==sqlPath)fail()
 let current=root
 for(const part of relative.split('/')){if(fs.lstatSync(current).isSymbolicLink())fail();current=path.join(current,part)}
 const stat=fs.lstatSync(current)
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>16*1024*1024||fs.realpathSync(current)!==current)fail()
 const raw=fs.readFileSync(current),text=raw.toString('utf8')
 if(!Buffer.from(text).equals(raw)||text.includes('\0')||text.startsWith('\uFEFF'))fail()
 return raw
}
export async function captureOriginalHome070ReviewPlan(){
 // Original source capture remains the genuine frozen predecessor. Its
 // captured source manifest is not relabeled as a070 installation/audit.
 const {captureCompleteProfileSources,assertCompleteProfileSnapshot}=await import('../services/pg-api/src/pg18-complete-profile-source.mjs')
 const base=await captureCompleteProfileSources();assertCompleteProfileSnapshot(base,base.source_sha256)
 const selectedSql=bytes(sqlPath);if(sha(selectedSql)!==sqlPin)fail()
 const additions=entryPoints.map(relative=>({path:relative,sha256:sha(bytes(relative))}))
 if(additions.find(v=>v.path==='shared/original-home-authoring.ts')?.sha256!==parserPin)fail()
 const manifest={profile:'original-home070',base_profile:'complete069',base_source_sha256:base.source_sha256,base_manifest:base.manifest,optional_sql_sources:[{path:sqlPath,sha256:sqlPin}],review_and_native_entry_sources:additions,initialization_contract:originalHome070InitializationContract()}
 assertCompleteProfileSnapshot(base,base.source_sha256)
 for(const item of additions)if(sha(bytes(item.path))!==item.sha256)fail()
 if(sha(bytes(sqlPath))!==sqlPin)fail()
 return freeze({manifest,source_sha256:sha(JSON.stringify(manifest)),data_only_review:true,installed_profile_verified:false,production_cutover_allowed:false})
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--plan'){process.stderr.write('ORIGINAL_HOME070_REVIEW_PLAN_ONLY\n');process.exitCode=1}
 else void captureOriginalHome070ReviewPlan().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(()=>{process.stderr.write('ORIGINAL_HOME070_REVIEW_SOURCE_REFUSED\n');process.exitCode=1})
}
