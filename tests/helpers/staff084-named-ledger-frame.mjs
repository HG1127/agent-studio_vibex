import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {staff084Catalog} from './original-staff084-catalog-frame.mjs';
import {staff084QualityCatalog} from './staff084-composite-catalog-frame.mjs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const declarations=[['032','knowledge_access','knowledge_acl_account_enablement'],['044','schedule_execution','scheduler_native_active'],['045','agent_collaboration','collaboration_accounts'],['046','agent_releases','release_accounts'],['061','company_overview','company_accounts_select'],['078','original_schedule_contract','original_schedules_active_account']]
const parents=declarations.map(([number,suffix,policy])=>{
 const version='pg_v9_'+number,source=read('db/postgres/migrations/'+version+'_'+suffix+'.sql')
 const found=new RegExp('CREATE POLICY '+policy+' ON agentstudio_auth\\.accounts (FOR SELECT )?TO ([a-z0-9_]+) USING\\s*\\(\\s*(true|user_id\\s*=\\s*agentstudio\\.actor_id\\(\\))\\s*\\)').exec(source)
 assert(found,'closed literal parent policy source')
 const role=found[2],grant=[...source.matchAll(/GRANT SELECT\s*\(([^)]+)\)\s+ON agentstudio_auth\.accounts TO ([a-z0-9_]+)/g)].find(x=>x[2]===role)
 assert(grant,'closed exact account column grant source')
 const ledger=new RegExp("\\(\\s*'"+version+"'\\s*,\\s*'((?:''|[^'])*)'\\s*\\)").exec(source)
 assert(ledger,'literal parent migration description')
 return{version,description:ledger[1].replaceAll("''","'"),role,policy,command:found[1]?'r':'*',using:found[3],columns:grant[1].split(',').map(x=>x.trim())}
})
export function frame(quality=false){
 const v=quality?staff084QualityCatalog():staff084Catalog(),owner=v.namespace.owner,account=v.relations.find(r=>r.name==='accounts'),acl=[]
 v.schema=quality?'original-staff084-quality089-complete078-catalog.v1':'original-staff084-complete078-catalog.v1'
 v.complete_profile='complete069-employee078-staff084'+(quality?'-quality089':'')+'.v1'
 v.complete_parent_members=[]
 for(const [i,p]of parents.entries()){
  const r={oid:String(300+i),name:p.role,super:false,login:false,inherit:false,bypass:false,createdb:false,createrole:false,replication:false,config:null,limit:-1,valid_until:null}
  v.roles.push(r);v.migrations.push({version:p.version,description:p.description,applied_at:'2026-11-04T00:00:00+00:00'})
  v.namespace.acl.push({grantor:owner,grantee:r.oid,privilege:'USAGE',grantable:false})
  v.policies.push({rel:account.oid,name:p.policy,command:p.command,permissive:true,roles:[Number(r.oid)],using:p.using,check:null})
  for(const name of p.columns)acl.push({rel:account.oid,name,grantor:owner,grantee:r.oid,privilege:'SELECT',grantable:false})
  for(const t of v.relations.filter(t=>t.kind==='r')){const e={rel:t.oid,role:r.oid};for(const k of ['select','insert','update','delete','truncate','references','trigger','maintain','column_select','column_insert','column_update','column_references'])e[k]=k==='column_select'&&t===account;v.effective.push(e)}
  for(const f of v.functions)f.effective.push({role:r.oid,execute:false,grantable:false})
 }
 v.complete_column_acl=[...acl,...(quality?v.quality_column_acl:[])]
 if(quality)v.quality_column_acl=structuredClone(v.complete_column_acl)
 const columns=v.columns.filter(c=>c.rel===account.oid).map(c=>c.name)
 v.complete_account_columns_effective=[]
 for(const r of v.roles)for(const name of columns){
  const row={rel:account.oid,name,role:r.oid}
  for(const right of ['select','insert','update','references']){
   let allowed=r.super||v.acl.some(a=>a.rel===account.oid&&a.grantee===r.oid&&a.privilege===right.toUpperCase())||v.complete_column_acl.some(a=>a.rel===account.oid&&a.name===name&&a.grantee===r.oid&&a.privilege===right.toUpperCase())
   if(r.name==='pg_read_all_data'&&right==='select'||r.name==='pg_write_all_data'&&['insert','update'].includes(right))allowed=true
   row[right]=allowed;row[right+'_grantable']=r.super
  }
  v.complete_account_columns_effective.push(row)
 }
 return v
}
