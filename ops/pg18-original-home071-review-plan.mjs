// Source/install review contract only. This module never installs a database.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {captureOriginalHome070ReviewPlan} from './pg18-original-home070-review-plan.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=raw=>createHash('sha256').update(raw).digest('hex')
const sql={path:'db/postgres/migrations/pg_v9_071_agent_catalog.sql',sha256:'5ede3c83171fe277935398f09a87a6f27744ec6d4269a2a5494929c24548bad1'}
const reviewed=[
 {path:'services/pg-api/src/native-agent-catalog-audit.ts',sha256:'caec22bc44c27de3ed6ebc9b600832faf00975cc21978ded26e8a7d94dcc0d3a'},
 {path:'services/pg-api/src/native-agent-catalog-http.ts',sha256:'6f14cb0b944081b064853f99fa605dd2af195ac3fcbbad715007581620e1ddf4'},
 {path:'services/pg-api/src/native-agent-catalog-repository.ts',sha256:'a2c8feb26dabcf8aebbad02f8e9c936ce213bbe37776ff849fc5227deaaae470'},
 {path:'services/pg-api/src/native-agent-catalog-runtime.ts',sha256:'0a4897b6f1f7d47a7aef9feb9f0783ccaed94300fceb88d337b85f65a10879a7'},
 {path:'shared/original-agent-catalog.ts',sha256:'2aac1f4f3c3d7f7e32953066bad4cfeba52da4cf9099fd8132e8d6a62a54f871'},
 {path:'services/pg-api/tests/helpers/native-agent-catalog-cookie-switch-case.mjs',sha256:'8325c29558d3917e6cc9ae41690db57961ed1c0c5c2d5aacf5b97077628e7de5'},
 {path:'services/pg-api/src/native-home-authoring-audit.ts',sha256:'1eaae9ef17eb2ec434b861e0325ec38daab289fa37ee043d9dc0164107c9c56e'},
 {path:'services/pg-api/src/native-home-agent-specs-http.ts',sha256:'9410b58364d167b83017228ae1260fb2757bb59b584650ae0ce6a0702eab9140'},
 {path:'services/pg-api/src/native-home-agent-specs-repository.ts',sha256:'3b2c8f3b523629756092244d75a03959305dbbf1ee16c6d15c9a3a11a86187ba'},
]
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
function checked(pin){let at=root;for(const segment of pin.path.split('/')){if(fs.lstatSync(at).isSymbolicLink())throw Error('original_home071_review_source_refused');at=path.join(at,segment)}const st=fs.lstatSync(at);if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>16*1024*1024||sha(fs.readFileSync(at))!==pin.sha256)throw Error('original_home071_review_source_refused')}
export function originalHome071InitializationContract(){return freeze({profile:'original-agent-catalog071',predecessor_profile:'original-home070',base_profile:'complete069',default_profile:'default050',sql_step:{...sql,preserve_original_transaction:true},expected_additions:{tables:['agentstudio.agent_spec_favorites'],functions:[],roles:[],logins:[]},required_order:['new independent071 hosted purpose, exact checkout and own fresh service','unmodified069 source plus exact predecessor inventory and independent API audit','exact070 original SQL and C corrected real catalog audit','assert071 absent/off and partial/off refusal','exact071 original transaction then independent actual071+070 same-snapshot ledger/catalog audits','actual Native HTTPS sessions and catalog/favorite/resource cases'],old069_or070_receipts_reusable_as071:false,ledger_filtering:false,Native_server_process_preflight_verified:false,production_GO:false})}
export async function captureOriginalHome071ReviewPlan(){
 const base=await captureOriginalHome070ReviewPlan();for(const pin of [sql,...reviewed])checked(pin)
 const self={path:'ops/pg18-original-home071-review-plan.mjs',sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))}
 const manifest={profile:'original-agent-catalog071',predecessor_profile:'original-home070',predecessor_source_sha256:base.source_sha256,predecessor_manifest:base.manifest,optional_sql_sources:[sql],catalog_entry_sources:[...reviewed,self],initialization_contract:originalHome071InitializationContract()}
 for(const pin of [sql,...reviewed,self])checked(pin)
 return freeze({manifest,source_sha256:sha(JSON.stringify(manifest)),installed_profile_verified:false,data_only_review:true,production_GO:false})
}
