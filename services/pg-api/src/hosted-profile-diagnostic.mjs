// Observations only. No metadata value, returned result or emitted line grants a
// profile capability. Disabled outside an explicitly selected async diagnostic scope. Hosted
// callers select it only after their existing purpose guard succeeds.
import {AsyncLocalStorage} from 'node:async_hooks'
import {isProxy} from 'node:util/types'
const scope=new AsyncLocalStorage()
const profiles=new Set(['quality089','staff084'])
const phases=new Set(['source_capture','owned_target','complete069_install','service_api','complete069_verify','service_native_auth','initial_admin','service_worker','service_identity','service_broker','service_index_worker','service_index_broker','employee_ui078_install','composite_install','runtime_profile','tls_story','story','cleanup_profile'])
const auditors=new Set(['staff084_original','staff084_quality089'])
const limits={staff084_original:136,staff084_quality089:145}
function emit(record){try{process.stderr.write(JSON.stringify(record)+'\n')}catch{}}
export async function withHostedProfileDiagnostics(profile,body){
 if(!profiles.has(profile))return await body()
 return await scope.run({profile},body)
}
export async function hostedProfilePhase(phase,body){
 const selected=scope.getStore(),enabled=selected&&phases.has(phase)
 if(enabled)emit({event:'hosted_profile_phase',profile:selected.profile,phase,state:'enter'})
 try{const result=await body();if(enabled)emit({event:'hosted_profile_phase',profile:selected.profile,phase,state:'passed'});return result}
 catch(error){if(enabled)emit({event:'hosted_profile_phase',profile:selected.profile,phase,state:'refused'});throw error}
}
export function hostedProfileCatalogRefusal(auditor,check){
 const selected=scope.getStore();if(!selected||!auditors.has(auditor)||!Number.isSafeInteger(check)||check<0||check>limits[auditor])return
 emit({event:'hosted_profile_catalog_refusal',profile:selected.profile,auditor,check_id:check})
}

// Diagnostic scope is supplied only by the hosted permit-controlled fixture.
const quality089Steps=new Set(["audit_body","audit_01","audit_02","audit_03","audit_04","audit_05","audit_06","audit_07","audit_08","audit_09","audit_10","audit_11","audit_release","inspect_body","inspect_01","inspect_02","inspect_release","inspect_03","verify_body","verify_01","verify_02","verify_03","verify_04","verify_05","install_body","install_01","install_02","install_03","install_04","install_05","install_06","install_07","install_08","install_09","install_10","install_11","install_12","install_13","install_14","install_15","install_16","install_17","install_18","install_19","install_20","install_release","install_21","inspect_rollback"])
const quality089Codes=Object.freeze({'57014':'statement_cancelled','55P03':'lock_not_available','57P01':'admin_shutdown','57P02':'crash_shutdown','57P03':'cannot_connect_now','08000':'connection_exception','08003':'connection_missing','08006':'connection_failure','08001':'connection_unavailable','08004':'connection_rejected','08007':'transaction_resolution_unknown','08P01':'protocol_violation','42501':'insufficient_privilege','42P01':'undefined_relation','42704':'undefined_object','23505':'unique_violation','23503':'foreign_key_violation','23514':'check_violation','25P02':'transaction_aborted','40001':'serialization_failure','40P01':'deadlock','53300':'connection_limit','53400':'configuration_limit',ECONNRESET:'connection_reset',ECONNREFUSED:'connection_refused',ETIMEDOUT:'connection_timeout',ERR_ASSERTION:'assertion'})
function quality089ErrorKind(error){
 try{if(error===null||(typeof error!=='object'&&typeof error!=='function')||isProxy(error))return 'unclassified';const descriptor=Object.getOwnPropertyDescriptor(error,'code');if(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'&&Object.hasOwn(quality089Codes,descriptor.value))return quality089Codes[descriptor.value]}catch{}
 return 'unclassified'
}
function quality089Record(selected,step,state,error){
 if(!selected||selected.profile!=='quality089'||!quality089Steps.has(step))return
 const record={event:'hosted_quality089_step',profile:'quality089',step,state};if(state==='refused')record.error_kind=quality089ErrorKind(error);emit(record)
}
export async function hostedQuality089Phase(step,body){
 const selected=scope.getStore();quality089Record(selected,step,'enter')
 try{const result=await body();quality089Record(selected,step,'passed');return result}catch(error){quality089Record(selected,step,'refused',error);throw error}
}
export function hostedQuality089Sync(step,body){
 const selected=scope.getStore();quality089Record(selected,step,'enter')
 try{const result=body();quality089Record(selected,step,'passed');return result}catch(error){quality089Record(selected,step,'refused',error);throw error}
}

// Failure-only, permit-scoped observation of the ORIGINAL strict ACL operands.
import {createHash as staffAclHash} from 'node:crypto'
const staffAclApiRole="agentstudio_native_login",staffAclQualityRole="agentstudio_quality089"
const staffAclMaxBytes=131072,staffAclMaxRows=256,staffAclMaxDisplay=8,staffAclMaxLine=2048
function staffAclJson(value){if(typeof value!=='string'||value.length>staffAclMaxBytes||Buffer.byteLength(value,'utf8')>staffAclMaxBytes)return null;try{return JSON.parse(value)}catch{return null}}
function staffAclRows(value){
 const rows=staffAclJson(value);if(!Array.isArray(rows)||rows.length>staffAclMaxRows)return null
 const decoded=[];for(const row of rows){if(typeof row!=='string'||row.length>4096||Buffer.byteLength(row,'utf8')>4096)return null;let tuple;try{tuple=JSON.parse(row)}catch{return null};if(!Array.isArray(tuple)||tuple.length!==4||typeof tuple[0]!=='string'||typeof tuple[1]!=='string'||! /^(?:0|[1-9][0-9]{0,9})$/.test(tuple[0])||! /^(?:0|[1-9][0-9]{0,9})$/.test(tuple[1])||typeof tuple[2]!=='string'||typeof tuple[3]!=='boolean')return null;decoded.push(tuple)}
 return {rows,decoded}
}
function staffAclObservedDifference(actualJson,expectedJson,rolesJson){
 const actual=staffAclRows(actualJson),expected=staffAclRows(expectedJson),roles=staffAclJson(rolesJson);if(!actual||!expected||expected.rows.length!==3||!Array.isArray(roles)||roles.length>staffAclMaxRows)return null
 const owner=expected.decoded[0][0];if(owner==='0'||expected.decoded.some(t=>t[0]!==owner||t[3]!==false))return null
 const self=expected.decoded.filter(t=>t[1]===owner),delegated=expected.decoded.filter(t=>t[1]!==owner);if(self.length!==2||self.map(t=>t[2]).sort().join(',')!=='CREATE,USAGE'||delegated.length!==1||delegated[0][1]==='0'||delegated[0][2]!=='USAGE')return null
 const native=delegated[0][1],roleById=new Map(),roleNames=new Set();for(const r of roles){if(!Array.isArray(r)||r.length!==2||typeof r[0]!=='string'||! /^[1-9][0-9]{0,9}$/.test(r[0])||typeof r[1]!=='string'||r[1].length>128||roleById.has(r[0])||roleNames.has(r[1]))return null;roleById.set(r[0],r[1]);roleNames.add(r[1])}
 const category=id=>id===owner?'owner':id===native?'native_auth':id==='0'?'PUBLIC':roleById.get(id)===staffAclApiRole?'api':roleById.get(id)===staffAclQualityRole?'quality':'other'
 const counts=rows=>{const map=new Map();for(const row of rows)map.set(row,(map.get(row)??0)+1);return map},a=counts(actual.rows),e=counts(expected.rows),extra=[],missing=[]
 for(const key of [...new Set([...a.keys(),...e.keys()])].sort()){const delta=(a.get(key)??0)-(e.get(key)??0);for(let i=0;i<Math.abs(delta);i++)(delta>0?extra:missing).push(key)}
 if(!extra.length&&!missing.length)return null
 const group=rows=>{const grouped=new Map();for(const row of rows){const t=JSON.parse(row),key=JSON.stringify([category(t[0]),category(t[1]),t[2]==='USAGE'?'USAGE':t[2]==='CREATE'?'CREATE':'other',t[3]]);grouped.set(key,(grouped.get(key)??0)+1)}return [...grouped].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,count])=>{const [grantor,grantee,privilege,grantable]=JSON.parse(key);return {grantor,grantee,privilege,grantable,count}})}
 const extraGroups=group(extra),missingGroups=group(missing),shownExtra=extraGroups.slice(0,staffAclMaxDisplay),shownMissing=missingGroups.slice(0,staffAclMaxDisplay-shownExtra.length),displayed=shownExtra.concat(shownMissing).reduce((n,r)=>n+r.count,0)
 return {event:'hosted_staff_namespace_acl_difference',profile:'staff084',actual_count:actual.rows.length,expected_count:expected.rows.length,extra_count:extra.length,missing_count:missing.length,omitted_count:extra.length+missing.length-displayed,difference_sha256:staffAclHash('sha256').update(JSON.stringify([extra,missing])).digest('hex'),extra:shownExtra,missing:shownMissing}
}
// Adds source-matchable hashes for unknown ACL identities; never emits an OID or name.
function staffAclIdentityDifference(actualJson,expectedJson,rolesJson,difference){
 const actual=staffAclRows(actualJson),expected=staffAclRows(expectedJson),roles=staffAclJson(rolesJson);if(!actual||!expected||!Array.isArray(roles))return null
 const owner=expected.decoded[0][0],native=expected.decoded.find(t=>t[1]!==owner)[1],byId=new Map(roles.map(r=>[r[0],r[1]]))
 const category=id=>id===owner?'owner':id===native?'native_auth':id==='0'?'PUBLIC':byId.get(id)===staffAclApiRole?'api':byId.get(id)===staffAclQualityRole?'quality':'other'
 const counts=values=>{const map=new Map();for(const value of values)map.set(value,(map.get(value)??0)+1);return map},a=counts(actual.rows),e=counts(expected.rows),groups=new Map();let total=0,unresolved=0
 for(const key of [...new Set([...a.keys(),...e.keys()])].sort()){const delta=(a.get(key)??0)-(e.get(key)??0);if(!delta)continue;const t=JSON.parse(key),side=delta>0?'extra':'missing',count=Math.abs(delta),privilege=t[2]==='USAGE'?'USAGE':t[2]==='CREATE'?'CREATE':'other';for(const [index,endpoint] of [[0,'grantor'],[1,'grantee']]){if(category(t[index])!=='other')continue;const name=byId.get(t[index]),role_sha256=typeof name==='string'?staffAclHash('sha256').update(name,'utf8').digest('hex'):null;total+=count;if(role_sha256===null)unresolved+=count;const grouped=JSON.stringify([side,endpoint,role_sha256,privilege,t[3]]);groups.set(grouped,(groups.get(grouped)??0)+count)}}
 if(!total)return null
 const identities=[...groups].sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,staffAclMaxDisplay).map(([key,count])=>{const [side,endpoint,role_sha256,privilege,grantable]=JSON.parse(key);return{side,endpoint,role_sha256,privilege,grantable,count}}),shown=identities.reduce((n,r)=>n+r.count,0)
 return {event:'hosted_staff_namespace_acl_identity_difference',profile:'staff084',difference_sha256:difference.difference_sha256,total_identity_count:total,omitted_identity_count:total-shown,unresolved_identity_count:unresolved,identities}
}
export function emitHostedStaffNamespaceAclDifference(actualJson,expectedJson,rolesJson){
 const selected=scope.getStore();if(!selected||selected.profile!=='staff084')return
 try{if(typeof actualJson==='function'){const observed=actualJson();if(!Array.isArray(observed)||observed.length!==3)return;[actualJson,expectedJson,rolesJson]=observed}const value=staffAclObservedDifference(actualJson,expectedJson,rolesJson);if(!value)return;const line=JSON.stringify(value)+'\n';if(line.length<=staffAclMaxLine)process.stderr.write(line);const identity=staffAclIdentityDifference(actualJson,expectedJson,rolesJson,value);if(identity){const identityLine=JSON.stringify(identity)+'\n';if(identityLine.length<=staffAclMaxLine)process.stderr.write(identityLine)}}catch{}
}

// Fixed source failure sites only; never inspect or emit an error object.
const quality089InventoryChecks=new Set(['whole_table_inventory','function_resolution','whole_function_inventory','whole_role_inventory','foreign_shadow','global_inventory','catalog_context'])
export function hostedQuality089InventoryRefusal(check){
 const selected=scope.getStore();if(!selected||selected.profile!=='quality089'||!quality089InventoryChecks.has(check))return
 emit({event:'hosted_quality089_inventory_refusal',profile:'quality089',check})
}

// Failure-only lower-verifier observation; no capability or comparison is changed.
const quality089SchemaStages=new Set(['schema_query_01','schema_query_02','catalog_rows','catalog_assert'])
const quality089SchemaCodes=Object.freeze({'42601':'syntax_error','42703':'undefined_column','42883':'undefined_function','42804':'datatype_mismatch','42846':'cannot_coerce','22P02':'invalid_text_representation','22023':'invalid_parameter_value','22003':'numeric_out_of_range','22021':'character_not_in_repertoire'})
function quality089SchemaErrorKind(error){
 const known=quality089ErrorKind(error);if(known!=='unclassified')return known
 try{if(error===null||(typeof error!=='object'&&typeof error!=='function')||isProxy(error))return 'unclassified';const descriptor=Object.getOwnPropertyDescriptor(error,'code');if(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'&&Object.hasOwn(quality089SchemaCodes,descriptor.value))return quality089SchemaCodes[descriptor.value]}catch{}
 return 'unclassified'
}
export function hostedQuality089SchemaRefusal(stage,error,check){
 const selected=scope.getStore();if(!selected||selected.profile!=='quality089'||!quality089SchemaStages.has(stage))return
 if(stage==='catalog_assert'&&(!Number.isSafeInteger(check)||check<1||check>33)||stage!=='catalog_assert'&&check!==undefined)return
 const record={event:'hosted_quality089_schema_refusal',profile:'quality089',stage,error_kind:quality089SchemaErrorKind(error)};if(stage==='catalog_assert')record.check_id=check;emit(record)
}
