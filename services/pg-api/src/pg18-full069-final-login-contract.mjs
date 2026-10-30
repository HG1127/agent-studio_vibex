// SOURCE/PROFILE DATA ONLY. No Pool, filesystem, SQL, process or authority factory.
// A final runtime must independently verify the signed files and original audits.
import {serviceLogins,serviceLoginKinds} from './pg18-service-login-policy.mjs'
import {liveEntries,liveLimits,cActions,closed,freeze,hex,uuid,target} from './pg18-full069-worker-live-contract.mjs'
const fail=code=>{throw Error('full069_final_login_'+code)}
const old=(key,action)=>({key,login:serviceLogins[action].login,groups:[...serviceLogins[action].groups],connection_limit:-1,phase:'C8',action})
export const finalBusinessLogins=freeze([
 old('api','api'),{key:'native_auth',login:'agentstudio_native_login',groups:['agentstudio_native_auth'],connection_limit:-1,phase:'C8',action:'native-auth'},old('worker','worker'),old('identity','identity'),old('broker','broker'),old('index_worker','index-worker'),old('index_broker','index-broker'),
 {key:'review_worker',login:'agentstudio_review_worker_login',groups:['agentstudio_review_worker'],connection_limit:3,phase:'review_worker'},
 {key:'executor',login:'agentstudio_local_executor_login',groups:['agentstudio_local_executor'],connection_limit:3,phase:'executor'},
 {key:'review_dispatch',login:'agentstudio_review_dispatch_login',groups:['agentstudio_review_dispatch'],connection_limit:-1,phase:'review_stack'},
 {key:'design_worker',login:'agentstudio_design_worker_login',groups:['agentstudio_design_worker'],connection_limit:-1,phase:'review_stack'},
 {key:'design_dispatch',login:'agentstudio_design_dispatch_login',groups:['agentstudio_design_dispatch'],connection_limit:-1,phase:'review_stack'},
 {key:'plan_workflow_worker',login:'agentstudio_plan_workflow_worker_login',groups:['agentstudio_plan_workflow_worker'],connection_limit:3,phase:'plan_workflow'},
 {key:'plan_workflow_dispatch',login:'agentstudio_plan_workflow_dispatch_login',groups:['agentstudio_plan_workflow_dispatch'],connection_limit:3,phase:'plan_workflow'},
])
export const finalCompanions=freeze([
 {id:'bound_broker',entry:'bound-dispatch-server.ts',args:['--serve'],preflight_args:['--preflight'],unit:'agentstudio-pg18-dispatch.service',origin:'https://127.0.0.1:7453',credential_keys:['api','identity','broker'],design_enabled:false},
 {id:'knowledge_broker',entry:'knowledge-index-service.ts',args:['--serve','broker'],preflight_args:['--preflight','broker'],unit:'agentstudio-pg18-knowledge-index-broker.service',origin:'https://127.0.0.1:7455',credential_keys:['index_broker','broker'],design_enabled:false},
 {id:'review_broker',entry:'agent-assessment-service.ts',args:['--serve','broker'],preflight_args:['--preflight','broker'],unit:'agentstudio-pg18-review-broker.service',origin:'https://127.0.0.1:7459',credential_keys:['api','review_dispatch','broker','design_dispatch'],design_enabled:true},
 {id:'plan_workflow_worker',entry:'agent-plan-workflow-service.ts',args:['--serve','worker'],preflight_args:['--preflight','worker'],unit:'agentstudio-pg18-plan-workflow-worker.service',origin:null,credential_keys:['plan_workflow_worker'],design_enabled:false},
 {id:'plan_workflow_broker',entry:'agent-plan-workflow-service.ts',args:['--serve','broker'],preflight_args:['--preflight','broker'],unit:'agentstudio-pg18-plan-workflow-broker.service',origin:null,credential_keys:['api','plan_workflow_dispatch','broker'],design_enabled:false},
])
export const finalPreparationKeys=Object.freeze([...cActions.map(action=>'C8:'+action),'review_worker','executor','review_stack','plan_workflow'])
export const finalNativeAccounts=Object.freeze(['api','native_auth','executor'])
export const finalOriginalWorkerAccounts=freeze(liveEntries.map(e=>({id:e.id,credential_keys:e.id==='knowledge'?['index_worker']:e.id==='assessment'?['review_worker','design_worker']:['worker']})))
const sources=['complete','worker_live','broker_companions','plan_workflow','final_contract','runtime_manifest','node','network_policy']
function absolute(value){if(typeof value!=='string'||!value.startsWith('/')||value.includes('\\')||value.includes('\0')||value.includes('//')||value.split('/').some((v,i)=>i>0&&(!v||v==='.'||v==='..')))fail('file_path');return value}
function ref(raw){const v=closed(raw,['file','sha256']);absolute(v.file);if(!hex(v.sha256))fail('file_pin');return {...v}}
function iso(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('timestamp');return Date.parse(value)}
function origin(value){try{const url=new URL(value),port=Number(url.port);if(url.origin!==value||url.protocol!=='https:'||url.hostname!=='127.0.0.1'||url.username||url.password||!Number.isSafeInteger(port)||port<1024||port>65535||[5333,5432,7402,7403,7453,7455,7459,17403,17443].includes(port))throw Error();return value}catch{fail('plan_workflow_origin')}}
export function parseFull069FinalLoginBindings(raw,expected){
 const v=closed(raw,['format','run_id','profile_sha256','sources','business_target','telemetry_target','minimum_ms','accounts','preparations','telemetry_setup_started_at','native','assessment','companions'])
 if(v.format!=='pg18_full069_final_login_bindings_v1'||!uuid(v.run_id)||v.run_id!==expected.run_id||!hex(v.profile_sha256)||v.profile_sha256!==expected.profile_sha256||!Number.isSafeInteger(v.minimum_ms)||v.minimum_ms<liveLimits.minimumMs)fail('binding')
 const pins=closed(v.sources,sources);for(const name of sources)if(!hex(pins[name])||pins[name]!==expected.sources[name])fail('source_pin')
 const business=target(v.business_target),telemetry=target(v.telemetry_target);if(business.system_identifier!==telemetry.system_identifier||business.database_oid===telemetry.database_oid||JSON.stringify(business)!==JSON.stringify(target(expected.business_target))||JSON.stringify(telemetry)!==JSON.stringify(target(expected.telemetry_target)))fail('target')
 if(!Array.isArray(v.accounts)||v.accounts.length!==14)fail('account_matrix')
 const accounts=v.accounts.map((row,i)=>{const a=closed(row,['key','login','connection_limit','credential']),d=finalBusinessLogins[i];if(a.key!==d.key||a.login!==d.login||a.connection_limit!==d.connection_limit)fail('account_matrix');return {...a,credential:ref(a.credential)}})
 if(new Set(accounts.map(a=>a.credential.file)).size!==14||new Set(accounts.map(a=>a.credential.sha256)).size!==14)fail('credential_alias')
 if(!Array.isArray(v.preparations)||v.preparations.length!==12)fail('preparation_matrix')
 let prior=-Infinity
 const preparations=v.preparations.map((row,i)=>{const r=closed(row,['key','operation_id','source_sha256','extension_source_sha256','intent','result','observation','started_at','completed_at','observation_completed_at']);if(r.key!==finalPreparationKeys[i]||!uuid(r.operation_id)||r.source_sha256!==pins.complete||r.extension_source_sha256!==(r.key==='plan_workflow'?pins.plan_workflow:null))fail('preparation_binding');const start=iso(r.started_at),end=iso(r.completed_at),observationRequired=i>=7;if(start<prior||end<start||observationRequired&&r.observation===null||!observationRequired&&r.observation!==null)fail('preparation_order');let observation=null;if(observationRequired){observation=ref(r.observation);prior=iso(r.observation_completed_at);if(prior<end)fail('preparation_order')}else{if(r.observation_completed_at!==null)fail('preparation_order');prior=end}return {...r,intent:ref(r.intent),result:ref(r.result),observation}})
 if(new Set(preparations.map(r=>r.operation_id)).size!==12||iso(v.telemetry_setup_started_at)<prior)fail('preparation_order')
 const native=closed(v.native,['profile','executor_credential_key','executor_preflight']);if(native.executor_credential_key!=='executor')fail('executor_required')
 const assessment=closed(v.assessment,['profile','design_enabled','design_worker_credential_key','preflight']);if(assessment.design_enabled!==true||assessment.design_worker_credential_key!=='design_worker')fail('design_opt_in_required')
 if(!Array.isArray(v.companions)||v.companions.length!==5)fail('companions_required')
 const companions=v.companions.map((row,i)=>{const p=closed(row,['id','profile','preflight','origin','credential_keys','design_enabled']),d=finalCompanions[i];if(p.id!==d.id||JSON.stringify(p.credential_keys)!==JSON.stringify(d.credential_keys)||p.design_enabled!==d.design_enabled||d.origin!==null&&p.origin!==d.origin)fail('companion_binding');return {...p,origin:d.origin??origin(p.origin),profile:ref(p.profile),preflight:ref(p.preflight),credential_keys:[...p.credential_keys]}})
 if(companions[3].origin!==companions[4].origin)fail('plan_workflow_origin')
 const output={...v,sources:{...pins},business_target:business,telemetry_target:telemetry,accounts,preparations,native:{...native,profile:ref(native.profile),executor_preflight:ref(native.executor_preflight)},assessment:{...assessment,profile:ref(assessment.profile),preflight:ref(assessment.preflight)},companions}
 const references=[...accounts.map(a=>a.credential),...preparations.flatMap(r=>[r.intent,r.result,...(r.observation?[r.observation]:[])]),output.native.profile,output.native.executor_preflight,output.assessment.profile,output.assessment.preflight,...companions.flatMap(c=>[c.profile,c.preflight])]
 if(new Set(references.map(r=>r.file)).size!==references.length)fail('file_alias')
 return freeze({...output,record_only:true,runtime_authorization:false,qualifies_run:false,production_cutover_allowed:false})
}
export function full069FinalLoginSourcePlan(){
 if(serviceLoginKinds.length!==6||liveEntries.length!==7||new Set(liveEntries.flatMap(e=>e.kinds)).size!==8||finalBusinessLogins.length!==14)fail('original_scope_changed')
 return freeze({format:'pg18_full069_final_login_source_plan_v1',accounts:finalBusinessLogins,preparation_order:[...finalPreparationKeys,'Telemetry','final qualification'],companions:finalCompanions,native_credentials:finalNativeAccounts,original_worker_credentials:finalOriginalWorkerAccounts,assessment_design:'same original assessment --serve worker with actual Design opt-in and design-worker.secret; original assessment --serve broker companion also requires Design opt-in and design-dispatch.secret',native_executor:'same original Native --serve; dedicated executor credential and original preflight; no synthetic Executor heartbeat',workers:liveEntries,limits:liveLimits,actual_final_runtime_implemented:false,actual_companion_launcher_implemented:false,record_only:true,runtime_authorization:false,qualifies_run:false,production_cutover_allowed:false})
}
