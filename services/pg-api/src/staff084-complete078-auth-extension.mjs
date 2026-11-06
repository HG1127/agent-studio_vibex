import {originalStaffExpression as expression} from './staff084-quality089-auth-expression.mjs'
import {originalStaff084Tables as tables} from './original-staff-schema084.mjs'
// These exact source-authored predecessor contracts are not current-tree pins.
const parents=Object.freeze([
  {
    "version": "pg_v9_032",
    "description": "Proposed owner knowledge grants, active-employee metadata functions and retry receipts; content remains private",
    "role": "agentstudio_knowledge_acl",
    "policy": "knowledge_acl_account_enablement",
    "command": "r",
    "using": "true",
    "check": null,
    "columns": [
      "user_id",
      "enabled"
    ]
  },
  {
    "version": "pg_v9_044",
    "description": "Explicit native schedule authority,atomic occurrences and original run-source fencing",
    "role": "agentstudio_scheduler",
    "policy": "scheduler_native_active",
    "command": "*",
    "using": "true",
    "check": null,
    "columns": [
      "user_id",
      "enabled"
    ]
  },
  {
    "version": "pg_v9_045",
    "description": "Native Agent collaboration safe-text foundation; no execution delegation",
    "role": "agentstudio_collaboration",
    "policy": "collaboration_accounts",
    "command": "*",
    "using": "true",
    "check": null,
    "columns": [
      "user_id",
      "enabled"
    ]
  },
  {
    "version": "pg_v9_046",
    "description": "Native owner-only full configuration versions, current-source acceptance and atomic restoration; no service activation",
    "role": "agentstudio_releases",
    "policy": "release_accounts",
    "command": "*",
    "using": "true",
    "check": null,
    "columns": [
      "user_id",
      "enabled"
    ]
  },
  {
    "version": "pg_v9_061",
    "description": "Optional current Native admin metadata counts; no queue, raw API grants, Worker telemetry or activation",
    "role": "agentstudio_company_metadata_reader",
    "policy": "company_accounts_select",
    "command": "r",
    "using": "true",
    "check": null,
    "columns": [
      "user_id",
      "enabled",
      "is_admin"
    ]
  },
  {
    "version": "pg_v9_078",
    "description": "Original employee schedule full forms,atomic exact receipts and paged retained history; existing044 execution authority reused",
    "role": "agentstudio_original_schedules",
    "policy": "original_schedules_active_account",
    "command": "*",
    "using": "user_id = agentstudio.actor_id()",
    "check": null,
    "columns": [
      "user_id",
      "enabled"
    ]
  }
].map(p=>Object.freeze({...p,columns:Object.freeze(p.columns)})))
const rights=['select','insert','update','references']
const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v)
function fail(caseIndex,field){const error=Error('complete078_staff084_contract_unconfirmed_'+caseIndex+'_'+field);Object.defineProperties(error,{code:{value:'COMPLETE078_STAFF084_CONTRACT'},case_index:{value:caseIndex},field:{value:field}});throw error}
function exact(v,keys,index,field){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==keys.slice().sort().join(','))fail(index,field)}
function eq(a,b,index,field){if(canonical(a)!==canonical(b))fail(index,field)}
function one(rows,test,index,field){if(!Array.isArray(rows))fail(index,field);const found=rows.filter(test);if(found.length!==1)fail(index,field);return found[0]}
function validOid(v,index,field){if(typeof v!=='string'||! /^[1-9][0-9]{0,9}$/.test(v)||BigInt(v)>4294967295n)fail(index,field);return v}
/** Called only after the core has closed/copied the catalog. No rows are filtered
 * out of the core audit. Every policy and raw ACL remains in its original array. */
export function inspectComplete078StaffExtensions(v,quality){
 if(typeof quality!=='boolean')fail(0,'mode')
 eq(v.complete_profile,'complete069-employee078-staff084'+(quality?'-quality089':'')+'.v1',0,'profile')
 if(!Array.isArray(v.complete_column_acl)||!Array.isArray(v.complete_parent_members)||!Array.isArray(v.complete_account_columns_effective))fail(0,'inventory')
 const owner=validOid(v.namespace.owner,0,'owner'),account=one(v.relations,r=>r.name==='accounts',0,'accounts'),auth=one(v.roles,r=>r.name==='agentstudio_native_auth',0,'auth')
 const ownerRole=one(v.roles,r=>r.oid===owner,0,'owner_role');if(account.owner!==owner||ownerRole.name!=='postgres'||ownerRole.super!==true)fail(0,'owner')
 const policyRoleOids=[],columnAcl=[],namespaceAcl=[]
 for(const [offset,p]of parents.entries()){
  const index=offset+1,ledger=one(v.migrations,m=>m.version===p.version,index,'migration')
  exact(ledger,['version','description','applied_at'],index,'migration');eq(ledger.description,p.description,index,'migration')
  const role=one(v.roles,r=>r.name===p.role,index,'role')
  exact(role,['oid','name','super','login','inherit','bypass','createdb','createrole','replication','config','limit','valid_until'],index,'role')
  const id=validOid(role.oid,index,'role');if(id===owner||id===auth.oid||role.super!==false||role.login!==false||role.inherit!==false||role.bypass!==false||role.createdb!==false||role.createrole!==false||role.replication!==false||role.config!==null||role.limit!==-1||role.valid_until!==null)fail(index,'role')
  if(policyRoleOids.includes(id))fail(index,'role')
  policyRoleOids.push(id);namespaceAcl.push([owner,id,'USAGE',false])
  const policy=one(v.policies,a=>a.rel===account.oid&&a.name===p.policy,index,'policy_name')
  exact(policy,['rel','name','command','permissive','roles','using','check'],index,'policy_shape')
  if(policy.command!==p.command)fail(index,'command');if(policy.permissive!==true)fail(index,'permissive');eq(policy.roles,[Number(id)],index,'policy_roles')
  try{eq(expression(policy.using),expression(p.using),index,'using')}catch{fail(index,'using')}
  if(policy.check!==null)fail(index,'check')
  for(const name of p.columns)columnAcl.push({rel:account.oid,name,grantor:owner,grantee:id,privilege:'SELECT',grantable:false})
 }
 if(v.complete_parent_members.length!==0)fail(0,'parent_members')
 const expectedAcl=[...columnAcl]
 if(quality){const q=one(v.roles,r=>r.name==='agentstudio_quality089',0,'quality_role');for(const name of ['user_id','enabled'])expectedAcl.push({rel:account.oid,name,grantor:owner,grantee:q.oid,privilege:'SELECT',grantable:false})}
 for(const edge of v.complete_column_acl)exact(edge,['rel','name','grantor','grantee','privilege','grantable'],0,'column_acl_shape')
 eq(v.complete_column_acl.map(canonical).sort(),expectedAcl.map(canonical).sort(),0,'column_acl')
 const accountDefinition=tables.find(t=>t.name==='accounts'),columns=accountDefinition.columns.map(c=>c.name),observed=v.complete_account_columns_effective
 if(observed.length!==columns.length*v.roles.length)fail(0,'effective_inventory')
 if(new Set(observed.map(r=>r.role+':'+r.name)).size!==observed.length)fail(0,'effective_duplicates')
 for(const role of v.roles)for(const name of columns){
  const row=one(observed,r=>r.role===role.oid&&r.name===name,0,'effective_missing')
  exact(row,['rel','name','role',...rights,...rights.map(r=>r+'_grantable')],0,'effective_shape')
  if(row.rel!==account.oid)fail(0,'effective_relation')
  for(const right of rights){let expected=role.super===true||role.oid===auth.oid&&accountDefinition.privileges.includes(right.toUpperCase())
   if(role.name==='pg_read_all_data'&&right==='select'||role.name==='pg_write_all_data'&&['insert','update'].includes(right))expected=true
   if(right==='select'&&parents.some((p,i)=>policyRoleOids[i]===role.oid&&p.columns.includes(name)))expected=true
   if(quality&&role.name==='agentstudio_quality089'&&right==='select'&&['user_id','enabled'].includes(name))expected=true
   if(row[right]!==expected||row[right+'_grantable']!==(role.super===true))fail(0,'effective_privilege')
  }
 }
 return Object.freeze({policyRoleOids:Object.freeze(policyRoleOids),columnAcl:Object.freeze(columnAcl),namespaceAcl:Object.freeze(namespaceAcl),receipt:Object.freeze({profile:'complete069-employee078-staff084'+(quality?'-quality089':'')+'.v1',policy_count:quality?12:11,parent_policy_count:6,parent_column_acl_edges:13,all_account_columns_effective_verified:true,owner_and_role_oids_bound:true,raw_column_acl_preserved:true})})
}
