// Observations only. No metadata value, returned result or emitted line grants a
// profile capability. Disabled outside an explicitly selected async diagnostic scope. Hosted
// callers select it only after their existing purpose guard succeeds.
import {AsyncLocalStorage} from 'node:async_hooks'
import {isProxy} from 'node:util/types'
const scope=new AsyncLocalStorage()
const profiles=new Set(['quality089','staff084'])
const phases=new Set(['source_capture','owned_target','complete069_install','service_api','complete069_verify','service_native_auth','initial_admin','service_worker','service_identity','service_broker','service_index_worker','service_index_broker','employee_ui078_install','composite_install','runtime_profile','tls_story','story','cleanup_profile',"tls_native_handler","tls_http_handler","tls_home_runtime","tls_quality_runtime","tls_staff_runtime","tls_upstream_listen","tls_alice_login","tls_bob_provision","tls_bob_login","tls_owned_spec","tls_foreign_spec","tls_front_listen"])
const auditors=new Set(['staff084_original','staff084_quality089'])
const limits={staff084_original:136,staff084_quality089:145}
function emit(record){try{process.stderr.write(JSON.stringify(record)+'\n')}catch{}}
export async function withHostedProfileDiagnostics(profile,body){
 if(!profiles.has(profile))return await body()
 return await scope.run({profile},body)
}
// Known code DATA only. Unknown errors remain private; no message/stack/cause is read.
const hostedProfileHttpCodes=Object.freeze({original_home_knowledge_statistics_unavailable:'original_home_knowledge_statistics_unavailable',original_quality_schema_unavailable:'original_quality_schema_unavailable'})
function hostedProfileKnownFailure(selected,phase,error){
 try{
  let error_kind=quality089SchemaErrorKind(error)
  if(error_kind==='unclassified'&&error!==null&&(typeof error==='object'||typeof error==='function')&&!isProxy(error)){
   const descriptor=Object.getOwnPropertyDescriptor(error,'code')
   if(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'&&Object.hasOwn(hostedProfileHttpCodes,descriptor.value))error_kind=hostedProfileHttpCodes[descriptor.value]
  }
  if(error_kind!=='unclassified')emit({event:'hosted_profile_known_failure',profile:selected.profile,phase,error_kind})
 }catch{}
}
export async function hostedProfilePhase(phase,body){
 const selected=scope.getStore(),enabled=selected&&phases.has(phase)
 if(enabled)emit({event:'hosted_profile_phase',profile:selected.profile,phase,state:'enter'})
 try{const result=await body();if(enabled)emit({event:'hosted_profile_phase',profile:selected.profile,phase,state:'passed'});return result}
 catch(error){if(enabled){emit({event:'hosted_profile_phase',profile:selected.profile,phase,state:'refused'});hostedProfileKnownFailure(selected,phase,error)}throw error}
}
export function hostedProfileCatalogRefusal(auditor,check){
 const selected=scope.getStore();if(!selected||!auditors.has(auditor)||!Number.isSafeInteger(check)||check<0||check>limits[auditor])return
 emit({event:'hosted_profile_catalog_refusal',profile:selected.profile,auditor,check_id:check})
}

// Diagnostic scope is supplied only by the hosted permit-controlled fixture.
const quality089Steps=new Set(["receipt075_body","receipt075_role","receipt075_connect","receipt075_begin","receipt075_session_query","receipt075_session_check","receipt075_set_role","receipt075_search_path","receipt075_lock_timeout","receipt075_statement_timeout","receipt075_approval","receipt075_devices","receipt075_callers","receipt075_trials","receipt075_schema","receipt075_rollback","receipt075_release","audit_body","audit_01","audit_02","audit_03","audit_04","audit_05","audit_06","audit_07","audit_08","audit_09","audit_10","audit_11","audit_release","inspect_body","inspect_01","inspect_02","inspect_release","inspect_03","verify_body","verify_01","verify_02","verify_03","verify_04","verify_05","install_body","install_01","install_02","install_03","install_04","install_05","install_06","install_07","install_08","install_09","install_10","install_11","install_12","install_13","install_14","install_15","install_16","install_17","install_18","install_19","install_20","install_release","install_21","inspect_rollback","inspect_home070","inspect_catalog071","inspect_stats072","inspect_monitor073","inspect_stats_knowledge","inspect_knowledge_human_input","inspect_knowledge_governance","inspect_knowledge_release","inspect_knowledge_collaboration","inspect_knowledge_schedule","inspect_knowledge_embedding"])
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
const staffAclPredecessorNames=new Set(["agentstudio_knowledge_acl","agentstudio_scheduler","agentstudio_collaboration","agentstudio_releases","agentstudio_company_metadata_reader","agentstudio_original_schedules"])
function staffAclObservedDifference(actualJson,expectedJson,rolesJson){
 const actual=staffAclRows(actualJson),expected=staffAclRows(expectedJson),roles=staffAclJson(rolesJson);if(!actual||!expected||expected.rows.length<3||expected.rows.length>9||!Array.isArray(roles)||roles.length>staffAclMaxRows)return null
 const owner=expected.decoded[0][0];if(owner==='0'||expected.decoded.some(t=>t[0]!==owner||t[3]!==false))return null
 const self=expected.decoded.filter(t=>t[1]===owner),delegated=expected.decoded.filter(t=>t[1]!==owner);if(self.length!==2||self.map(t=>t[2]).sort().join(',')!=='CREATE,USAGE'||delegated.length<1||delegated.some(t=>t[1]==='0'||t[2]!=='USAGE'))return null
 let native=delegated[0][1];const roleById=new Map(),roleNames=new Set();for(const r of roles){if(!Array.isArray(r)||r.length!==2||typeof r[0]!=='string'||! /^[1-9][0-9]{0,9}$/.test(r[0])||typeof r[1]!=='string'||r[1].length>128||roleById.has(r[0])||roleNames.has(r[1]))return null;roleById.set(r[0],r[1]);roleNames.add(r[1])}
 if(expected.rows.length>3){const auth=delegated.filter(t=>roleById.get(t[1])==='agentstudio_native_auth');if(auth.length!==1||new Set(delegated.map(t=>t[1])).size!==delegated.length||delegated.some(t=>t[1]!==auth[0][1]&&!staffAclPredecessorNames.has(roleById.get(t[1]))))return null;native=auth[0][1]}
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
 const owner=expected.decoded[0][0],byId=new Map(roles.map(r=>[r[0],r[1]])),native=expected.rows.length===3?expected.decoded.find(t=>t[1]!==owner)[1]:[...byId].find(([,name])=>name==='agentstudio_native_auth')[0]
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
const quality089SchemaStages=new Set(['schema_query_01','ledger_rpc_audit','ledger_rpc_identity','schema_query_02','catalog_rows','catalog_assert'])
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

// Shared failure-detail budget; no catalog result can grant acceptance here.
function hostedCatalogDetail(profile,event,check,producer,validate){
 const selected=scope.getStore();if(!selected||selected.profile!==profile||typeof producer!=='function'||(selected.catalogDetailCount??0)>=8)return
 try{const value=validate(producer());if(!value)return;const record={event,profile,check_id:check,...value};if(Buffer.byteLength(JSON.stringify(record),'utf8')>2048)return;selected.catalogDetailCount=(selected.catalogDetailCount??0)+1;emit(record)}catch{}
}
export function emitHostedStaff031InventoryDifference(producer){hostedCatalogDetail('staff084','hosted_staff031_inventory_refusal',31,producer,validateStaff031Observation)}
export function emitHostedQuality015ConstraintDifference(producer){hostedCatalogDetail('quality089','hosted_quality015_constraint_refusal',15,producer,validateQuality015Observation)}

const countKeys=['relations','columns','constraints','indexes','policies','types','functions']
const constraintKeys=['oid','name','table','type','index_oid','keys','target','target_keys','expression','update','delete','match','safe','deferrable','deferred']
const differenceKinds=new Set(['lookup','shape','type','safe','deferrable','deferred','keys','expression','target','target_keys','update','delete','match','index_oid','unclassified'])
const states=new Set(['value','missing','unsafe','oversized','normalization_refused'])
const sha=value=>staffAclHash('sha256').update(value).digest('hex')
const own=(value,key)=>Object.getOwnPropertyDescriptor(value,key)
function object(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||isProxy(value))return null;const actual=Reflect.ownKeys(value);if(actual.length!==keys.length||actual.some(k=>typeof k!=='string'||!keys.includes(k)))return null;const out={};for(const key of keys){const d=own(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))return null;out[key]=d.value}return out}
function counts(value){const row=object(value,countKeys);if(!row||countKeys.some(k=>!Number.isSafeInteger(row[k])||row[k]<0||row[k]>1000000))return null;return row}
function fingerprint(value){if(value===undefined)return {state:'missing',sha256:null,bytes:0};let nodes=0,size=0;const stack=new Set();try{const walk=(v,depth)=>{if(++nodes>512||depth>12)throw 'oversized';if(v===null)return ['null'];switch(typeof v){case 'boolean':return ['boolean',v];case 'number':if(!Number.isFinite(v))throw 'unsafe';return ['number',v];case 'string':if(v.length>32768)throw 'oversized';size+=Buffer.byteLength(v,'utf8');if(size>65536)throw 'oversized';return ['string',v];case 'object':{if(isProxy(v)||stack.has(v))throw 'unsafe';stack.add(v);let result;if(Array.isArray(v)){const length=own(v,'length');if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value>128)throw 'oversized';const keys=Reflect.ownKeys(v);if(keys.length!==length.value+1)throw 'unsafe';result=['array',Array.from({length:length.value},(_,i)=>{const d=own(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))throw 'unsafe';return walk(d.value,depth+1)})]}else{const keys=Reflect.ownKeys(v);if(keys.length>64||keys.some(k=>typeof k!=='string'||k.length>120))throw 'oversized';result=['object',keys.sort().map(k=>{const d=own(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw 'unsafe';return [k,walk(d.value,depth+1)]})]}stack.delete(v);return result}default:throw 'unsafe'}};const text=JSON.stringify(walk(value,0)),bytes=Buffer.byteLength(text,'utf8');if(bytes>65536)throw 'oversized';return {state:'value',sha256:sha(text),bytes}}catch(reason){return {state:reason==='oversized'?'oversized':'unsafe',sha256:null,bytes:0}}}
const equal=(a,b)=>{const x=fingerprint(a),y=fingerprint(b);return x.state==='value'&&y.state==='value'&&x.sha256===y.sha256}
export function staff031InventoryObservation(actual,expected){const a=counts(actual),e=counts(expected);if(!a||!e)return null;const first=countKeys.find(k=>a[k]!==e[k]);return first?{kind:'staff_inventory',first_difference:first,actual_counts:a,expected_counts:e}:null}
export function validateStaff031Observation(value){const v=object(value,['kind','first_difference','actual_counts','expected_counts']);if(!v||v.kind!=='staff_inventory'||!countKeys.includes(v.first_difference))return null;const result=staff031InventoryObservation(v.actual_counts,v.expected_counts);return result?.first_difference===v.first_difference?result:null}
function summary(value){const v=object(value,['state','sha256','bytes']);if(!v||!states.has(v.state)||!Number.isSafeInteger(v.bytes)||v.bytes<0||v.bytes>65536)return null;if(v.state==='value'){if(typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256))return null}else if(v.sha256!==null||v.bytes!==0)return null;return v}
export function validateQuality015Observation(value){const v=object(value,['kind','first_difference','table_ordinal','constraint_ordinal','table_sha256','constraint_sha256','actual','expected']);if(!v||v.kind!=='quality_constraint'||!differenceKinds.has(v.first_difference)||!Number.isSafeInteger(v.table_ordinal)||v.table_ordinal<1||v.table_ordinal>64||!Number.isSafeInteger(v.constraint_ordinal)||v.constraint_ordinal<1||v.constraint_ordinal>256||typeof v.table_sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.table_sha256)||typeof v.constraint_sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.constraint_sha256))return null;const a=summary(v.actual),e=summary(v.expected);return a&&e?{kind:v.kind,first_difference:v.first_difference,table_ordinal:v.table_ordinal,constraint_ordinal:v.constraint_ordinal,table_sha256:v.table_sha256,constraint_sha256:v.constraint_sha256,actual:a,expected:e}:null}
const validOid=v=>typeof v==='string'&&/^[1-9][0-9]{0,9}$/.test(v)&&Number(v)<=4294967295
/** Failure observation only. Values/expressions/OIDs and identifiers are never returned. */
export function quality015ConstraintObservation(table,constraint,actual,normalize,tableOrdinal,constraintOrdinal){
 const td=table&&typeof table==='object'&&!isProxy(table)?own(table,'name'):null,kd=constraint&&typeof constraint==='object'&&!isProxy(constraint)?own(constraint,'name'):null
 if(!td||!kd||!Object.hasOwn(td,'value')||!Object.hasOwn(kd,'value')||typeof td.value!=='string'||td.value.length>120||typeof kd.value!=='string'||kd.value.length>120)return null
 const base={kind:'quality_constraint',table_ordinal:tableOrdinal,constraint_ordinal:constraintOrdinal,table_sha256:sha(td.value),constraint_sha256:sha(kd.value)}
 const difference=(kind,a,e)=>validateQuality015Observation({...base,first_difference:kind,actual:fingerprint(a),expected:fingerprint(e)})
 if(actual===undefined)return difference('lookup',undefined,'present')
 const a=object(actual,constraintKeys);if(!a){const keys=actual&&typeof actual==='object'&&!isProxy(actual)?Reflect.ownKeys(actual):undefined;return difference('shape',keys,constraintKeys)}
 const k={};for(const key of ['type','keys','expression','target','target_keys']){const d=own(constraint,key);if(d&&!Object.hasOwn(d,'value'))return null;k[key]=d?.value}
 for(const [key,e]of [['type',k.type],['safe',true],['deferrable',k.type==='t'],['deferred',k.type==='t'],['keys',k.keys??null]])if(!equal(a[key],e))return difference(key,a[key],e)
 if(k.type==='c'){
  let av,ev,ar=false,er=false;try{av=normalize(a.expression)}catch{ar=true}try{ev=normalize(k.expression)}catch{er=true}
  if(ar||er||!equal(av,ev)){const record={...base,first_difference:'expression',actual:ar?{state:'normalization_refused',sha256:null,bytes:0}:fingerprint(av),expected:er?{state:'normalization_refused',sha256:null,bytes:0}:fingerprint(ev)};return validateQuality015Observation(record)}
 }else if(a.expression!==null)return difference('expression',a.expression,null)
 if(k.type==='f'){
  for(const [key,e]of [['target',k.target],['target_keys',k.target_keys],['update','a'],['delete','a'],['match','s']])if(!equal(a[key],e))return difference(key,a[key],e)
  if(!validOid(a.index_oid))return difference('index_oid',a.index_oid,'nonzero_oid')
 }else{
  for(const key of ['target','target_keys'])if(a[key]!==null)return difference(key,a[key],null)
  if(k.type==='p'){if(!validOid(a.index_oid))return difference('index_oid',a.index_oid,'nonzero_oid')}
  else if(a.index_oid!=='0')return difference('index_oid',a.index_oid,'0')
 }
 return difference('unclassified',a,k)
}

// Failure-only fixed contract tags; the original catalog decision is unchanged.
const complete078ContractFields=new Set(["accounts","auth","check","column_acl","column_acl_shape","command","effective_duplicates","effective_inventory","effective_missing","effective_privilege","effective_relation","effective_shape","inventory","migration","mode","owner","owner_role","parent_members","permissive","policy_name","policy_roles","policy_shape","profile","quality_role","role","using"])
export function emitHostedStaffComplete078ContractRefusal(auditor,check,error){
 if(!((auditor==='staff084_original'&&check===54)||(auditor==='staff084_quality089'&&check===55)))return
 hostedCatalogDetail('staff084','hosted_staff084_complete078_refusal',check,()=>{
  if(error===null||(typeof error!=='object'&&typeof error!=='function')||isProxy(error))return null
  const code=Object.getOwnPropertyDescriptor(error,'code'),index=Object.getOwnPropertyDescriptor(error,'case_index'),field=Object.getOwnPropertyDescriptor(error,'field')
  if(!code||!index||!field||!Object.hasOwn(code,'value')||!Object.hasOwn(index,'value')||!Object.hasOwn(field,'value')||code.value!=='COMPLETE078_STAFF084_CONTRACT'||!Number.isSafeInteger(index.value)||index.value<0||index.value>6||!complete078ContractFields.has(field.value))return null
  return {auditor,case_index:index.value,field:field.value}
 },value=>value)
}

// Fixed Staff-only stages. No query/role/parameter/error message is observed.
const staff084Steps=new Set(["home_prepare_01","home_prepare_02","home_prepare_03","home_prepare_04","stats_principal_01","stats_functions_01","stats_acl_01","stats_acl_02","stats_acl_03","stats_metadata_01","stats_metadata_02","stats_metadata_03","stats_predecessor_01","stats_predecessor_02","stats_predecessor_03","stats_predecessor_04","stats_predecessor_05","stats_predecessor_06","stats_predecessor_07","stats_inspect_01","stats_inspect_02","stats_inspect_03","stats_inspect_04","stats_inspect_05","stats_inspect_06","stats_inspect_07","stats_inspect_08","stats_inspect_09","knowledge_parent_01","knowledge_parent_02","knowledge_parent_03","knowledge_parent_04","knowledge_parent_05","knowledge_parent_06","knowledge_parent_07","knowledge_parent_08","knowledge_parent_09","knowledge_parent_10","knowledge_parent_11","staff_inventory_01","staff_inventory_02","staff_inventory_03","staff_inventory_04","staff_inventory_05","staff_inventory_06","staff_inventory_07","staff_inventory_08","staff_inventory_09","staff_inventory_10","staff_inventory_11","staff_audit_01","staff_audit_02","staff_audit_03","staff_audit_04","staff_audit_05","staff_auth_client_01","staff_auth_client_02","staff_auth_client_03","staff_auth_client_04","staff_auth_client_05","staff_api_client_01","staff_api_client_02","staff_api_client_03","staff_api_client_04","staff_api_client_05","staff_api_client_06","staff_pool_01","staff_pool_02","staff_pool_03","staff_pool_04","staff_pool_05","staff_pool_06","staff_pool_07","staff_install_01","staff_install_02","staff_install_03","staff_install_04","staff_install_05","staff_install_06","staff_install_07","staff_install_08","staff_install_09","staff_install_10","staff_install_11","staff_install_12","staff_install_13","staff_install_14","staff_install_15","staff_install_16","staff_install_17","staff_install_18","staff_install_19","staff_install_20","staff_install_21","staff_install_22","staff_install_23","staff_install_24","staff_install_25","staff_install_26"])
function staff084Record(selected,step,state,error){
 if(!selected||selected.profile!=='staff084'||!staff084Steps.has(step))return
 const record={event:'hosted_staff084_step',profile:'staff084',step,state};if(state==='refused')record.error_kind=quality089SchemaErrorKind(error);emit(record)
}
export async function hostedStaff084Phase(step,body){
 const selected=scope.getStore();staff084Record(selected,step,'enter')
 try{const result=await body();staff084Record(selected,step,'passed');return result}catch(error){staff084Record(selected,step,'refused',error);throw error}
}
