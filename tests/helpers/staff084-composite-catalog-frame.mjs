// Terminal metadata transport only; never an installed SQL/RLS or LOGIN proof.
import {staff084Catalog} from './original-staff084-catalog-frame.mjs'
export function staff084QualityCatalog(){
 const v=staff084Catalog(),q={oid:'130',name:'agentstudio_quality089',super:false,login:false,inherit:false,bypass:false,createdb:false,createrole:false,replication:false,config:null,limit:-1,valid_until:null}
 v.schema='original-staff084-quality089-catalog.v1';v.roles.push(q);v.namespace.acl.push({grantor:'10',grantee:q.oid,privilege:'USAGE',grantable:false})
 const accounts=v.relations.find(r=>r.name==='accounts')
 v.policies.push({rel:accounts.oid,name:'quality089_accounts_read',command:'r',permissive:true,roles:[Number(q.oid)],using:'user_id = agentstudio.actor_id()',check:null})
 v.quality_column_acl=['user_id','enabled'].map(name=>({rel:accounts.oid,name,grantor:'10',grantee:q.oid,privilege:'SELECT',grantable:false}))
 for(const t of v.relations.filter(r=>r.kind==='r')){const e={rel:t.oid,role:q.oid};for(const k of ['select','insert','update','delete','truncate','references','trigger','maintain','column_select','column_insert','column_update','column_references'])e[k]=k==='column_select'&&t.name==='accounts';v.effective.push(e)}
 for(const f of v.functions)f.effective.push({role:q.oid,execute:false,grantable:false})
 return v
}
