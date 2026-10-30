// Independent optional072 review contract. No target/SQL executor is provided.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {captureOriginalHome071ReviewPlan} from './pg18-original-home071-review-plan.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=raw=>createHash('sha256').update(raw).digest('hex')
const sql={path:'db/postgres/migrations/pg_v9_072_home_knowledge_statistics.sql',sha256:'bba0d5264ea95bc783d6df35741a97a32a7deb8d51c613f70864ff7e88f23abd'}
const entries=['services/pg-api/src/native-home-knowledge-stats-pins.ts','services/pg-api/src/native-home-knowledge-stats-audit.ts','services/pg-api/src/native-home-knowledge-stats-runtime.ts','services/pg-api/src/native-home-resources-repository.ts','services/pg-api/src/native-home-agent-specs-runtime.ts','services/pg-api/src/native-server.ts','ops/pg18-original-home072-review-plan.mjs']
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
function bytes(relative){let at=root;for(const part of relative.split('/')){if(fs.lstatSync(at).isSymbolicLink())throw Error('original_home072_review_source_refused');at=path.join(at,part)}const stat=fs.lstatSync(at);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>16*1024*1024)throw Error('original_home072_review_source_refused');return fs.readFileSync(at)}
export function originalHome072InitializationContract(){return freeze({profile:'original-home-knowledge-statistics072',predecessor_profile:'original-agent-catalog071',base_profile:'complete069',default_profile:'default050',sql_step:{...sql,preserve_original_transaction:true},expected_additions:{tables:[],roles:[],logins:[],functions:['agentstudio.original_home_knowledge_stats(uuid)']},activation:{flag:'AGENT_STUDIO_PG18_ORIGINAL_HOME_SHARED_STATISTICS_ENABLED',default:'off',requires:'actual installed072 + existing knowledge sharing capability + original Home admission',SQL_context:'trusted transaction-local072 capability AND original sharing capability AND original active employee ACL'},required_order:['independent072 purpose and own fresh service','actual069 predecessor audit with original sources','actual070 original SQL and strict C catalog audit','actual071 original SQL and full A catalog audit','072 absent/off, enabled-absent and partial/off refusals','exact pinned072 original transaction, no repair or retry','independent actual API full072/071/070 + original runtime/helper audits','actual Native HTTPS shared statistics, ACL/revoke/disabled/tamper negatives and owned cleanup'],old069_or070_or071_receipts_reusable_as072:false,ledger_filtering:false,Native_server_process_preflight_verified:false,production_GO:false})}
export async function captureOriginalHome072ReviewPlan(){
 const base=await captureOriginalHome071ReviewPlan();if(sha(bytes(sql.path))!==sql.sha256)throw Error('original_home072_review_source_refused')
 const sources=entries.map(relative=>({path:relative,sha256:sha(bytes(relative))}))
 const manifest={profile:'original-home-knowledge-statistics072',predecessor_profile:'original-agent-catalog071',predecessor_source_sha256:base.source_sha256,predecessor_manifest:base.manifest,optional_sql_sources:[sql],statistics_entry_sources:sources,initialization_contract:originalHome072InitializationContract()}
 for(const pin of [...sources,sql])if(sha(bytes(pin.path))!==pin.sha256)throw Error('original_home072_review_source_refused')
 return freeze({manifest,source_sha256:sha(JSON.stringify(manifest)),installed_profile_verified:false,data_only_review:true,production_GO:false})
}
