// Pure synthetic setup DATA. Expected report bytes never count as a preflight.
import {createHash} from 'node:crypto'
import {finalCompanionDefinitions,finalCompanionFreeze as freeze} from '../../src/pg18-full069-final-companion-contract.mjs'
export const companionCiFail=c=>{throw Error('complete_companion_ci_'+c)}
export const companionCiPurpose='YES_DISPOSABLE_FULL069_FIVE_COMPANIONS_ONLY'
export const companionCiF05Purpose='YES_DISPOSABLE_FULL069_FIXED_F05_PAIR_ONLY'
export const companionCiFinalPathPurpose='YES_DISPOSABLE_FULL069_FINAL14_ALL13_PATHS_ONLY'
export const companionCiFinalPathHarness=Object.freeze([...['contract','guard','run','setup','setup-base','profiles','sidecars','bootstrap-child','bridge','sources'].map(n=>'services/pg-api/tests/helpers/pg18-full069-final-path-ci-'+n+'.mjs'),'services/pg-api/tests/helpers/pg18-full069-final14-database-acl-ci.mjs'])
export const companionCiPackageBindings=freeze([{path:'services/pg-api/package.json',sha256:'90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'},{path:'services/pg-api/pnpm-lock.yaml',sha256:'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'}])
export function companionCiFinalPathEnabled(value){if(value===undefined)return false;if(value!==companionCiFinalPathPurpose)companionCiFail('final13_purpose');return true}
// Source records only. This cannot mint a stage/permit/deployment or run code.
export function mergeCompanionCiSourceRecords(application,harness,overlay=null){
 const apps=new Map(),tools=new Map(),all=new Map(),safe=p=>typeof p==='string'&&/^(?:services\/pg-api\/(?:src|tests\/helpers)|shared|db\/postgres|ops|docs)\/[A-Za-z0-9_./-]+$/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..')
 const add=(map,r)=>{if(!r||Object.keys(r).sort().join(',')!=='path,sha256'||!safe(r.path)||!/^[a-f0-9]{64}$/.test(r.sha256))companionCiFail('overlay_record');if(all.has(r.path)&&all.get(r.path)!==r.sha256)companionCiFail('overlay_overlap');all.set(r.path,r.sha256);map.set(r.path,{path:r.path,sha256:r.sha256})}
 if(!Array.isArray(application)||!Array.isArray(harness))companionCiFail('overlay_record');for(const r of application)add(apps,r)
 for(const r of harness)add(overlay&&!r.path?.endsWith('.mjs')?apps:tools,r)
 let binding=null
 if(overlay){
  const m=overlay.manifest;if(!m||m.format!=='full069_final13_path_ci_source_overlay_v1'||m.purpose!==companionCiFinalPathPurpose||!['complete_source_sha256','final_source_sha256','control_source_sha256'].every(k=>/^[a-f0-9]{64}$/.test(m[k]))||!/^[a-f0-9]{64}$/.test(overlay.source_sha256)||createHash('sha256').update(JSON.stringify(m)).digest('hex')!==overlay.source_sha256||!Array.isArray(m.application_additions)||!Array.isArray(m.harness_files)||!Array.isArray(m.control_package_bindings))companionCiFail('overlay_binding')
  if(JSON.stringify(m.control_package_bindings)!==JSON.stringify(companionCiPackageBindings))companionCiFail('overlay_package_binding')
  if(m.harness_files.length!==companionCiFinalPathHarness.length||new Set(m.harness_files.map(r=>r.path)).size!==m.harness_files.length||m.harness_files.some(r=>!companionCiFinalPathHarness.includes(r.path)))companionCiFail('overlay_harness')
  for(const r of m.application_additions){if(!/^(?:services\/pg-api\/src|shared|db\/postgres)\//.test(r.path))companionCiFail('overlay_application');add(apps,r)}for(const r of m.harness_files)add(tools,r)
  binding={format:'full069_final13_path_ci_source_binding_v1',purpose:companionCiFinalPathPurpose,source_sha256:overlay.source_sha256,control_source_sha256:m.control_source_sha256}
 }
 const order=(a,b)=>a.path.localeCompare(b.path,'en');return freeze({application_files:[...apps.values()].sort(order),harness_files:overlay?[...tools.values()].sort(order):[...tools.values()],final_path_overlay:binding})
}
export const companionCiF05Origin='https://127.0.0.1:17461'
export const companionCiAccountLeaves=Object.freeze({api:'prepare-api.secret',native_auth:'prepare-native-auth.secret',worker:'prepare-worker.secret',identity:'prepare-identity.secret',broker:'prepare-broker.secret',index_worker:'prepare-index-worker.secret',index_broker:'prepare-index-broker.secret',review_worker:'review-worker.secret',executor:'executor.secret',review_dispatch:'review-stack-review_dispatch.secret',design_worker:'review-stack-design_worker.secret',design_dispatch:'review-stack-design_dispatch.secret',plan_workflow_worker:'plan-workflow-worker.secret',plan_workflow_dispatch:'plan-workflow-dispatch.secret'})
export const companionCiSpecs=Object.freeze(finalCompanionDefinitions.map((d,i)=>Object.freeze({id:d.id,entry:d.entry,args:d.args,preflight_args:d.preflight_args,unit:d.unit,origin:d.origin??companionCiF05Origin,uid:61021+i,gid:61021+i,groups:Object.freeze([]),credential_keys:d.credential_keys,design_enabled:d.design_enabled})))
export function companionCiExpectedRawPreflight(id){const d=finalCompanionDefinitions.find(d=>d.id===id)??companionCiFail('entry');return Buffer.from(JSON.stringify(d.preflight)+'\n')}
export function parseFinalCompanionCiArgs(argv){
 const keys=['--expected-complete-source-sha256','--expected-final-source-sha256','--expected-system-identifier','--expected-database-oid']
 if(!Array.isArray(argv)||argv.length!==9||argv[0]!=='--run'||argv.some(v=>typeof v!=='string')||keys.some((k,i)=>argv[1+2*i]!==k)||![argv[2],argv[4]].every(s=>/^[a-f0-9]{64}$/.test(s))||!/^[1-9][0-9]{0,19}$/.test(argv[6])||BigInt(argv[6])>18446744073709551615n||!/^[1-9][0-9]{0,9}$/.test(argv[8])||BigInt(argv[8])>4294967295n)companionCiFail('arguments')
 return Object.freeze({completeSha:argv[2],finalSha:argv[4],target:Object.freeze({system_identifier:argv[6],database_oid:argv[8]})})
}
export function companionCiReportShape(report){
 if(!report||report.format!=='complete069_five_companion_actual_v1'||report.actual_preflights!==5||report.actual_original_processes!==5||report.fresh_TLS_brokers!==4||report.actual_F05_worker!==true||report.all_graceful!==true||report.no_forced_stop!==true||report.all_owned_processes_absent!==true||!Array.isArray(report.preflights)||report.preflights.length!==5||!Array.isArray(report.startup)||report.startup.length!==5||!Array.isArray(report.stops)||report.stops.length!==5||report.qualification_started!==false||report.minimum_duration_observed!==false||report.qualifies_run!==false||report.production_GO!==false)companionCiFail('actual_report')
 for(const d of finalCompanionDefinitions){const p=report.preflights.find(r=>r.id===d.id),a=report.startup.find(r=>r.id===d.id),s=report.stops.find(r=>r.id===d.id);if(!p?.actual_original_cli||!p.actual_nonroot_namespace||p.exit_code!==0||p.current_readiness!==false||!/^[a-f0-9]{64}$/.test(p.raw_stdout_sha256)||p.raw_stdout_sha256!==p.protected_preflight_sha256||!a?.current_readiness||!Number.isSafeInteger(a.pid)||a.pid<1||!s?.graceful||s.forced!==false||s.identity_verified!==true||s.absent!==true||s.supervisor_absent!==true)companionCiFail('actual_report')}
 return true
}
