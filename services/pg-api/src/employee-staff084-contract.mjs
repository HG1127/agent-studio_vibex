
import {types} from 'node:util'
import {createHash} from 'node:crypto'
import {employeeUi078Canonical as canonical} from './pg18-employee-ui078-catalog.mjs'
import {finalBusinessLogins} from './pg18-full069-final-login-contract.mjs'
export const staffCompositeProfiles=Object.freeze(['complete069-employee-ui-staff084','complete069-employee-ui-staff084-quality089'])
export const staffCompositeReceipt='pg18_employee_staff084_composite_001',staffCompositeMetadataVersion='pg18_staff084_composite_catalog_001'
export const staffCompositeLogins=finalBusinessLogins
export const staffCompositeSha=v=>createHash('sha256').update(v).digest('hex')
const bad=()=>{throw Error('staff_composite_contract_refused')}
export const staffCompositePins=Object.freeze({
 staff:Object.freeze({path:'db/postgres/migrations/pg_v9_084_original_staff.sql',version:'pg_v9_084',sha256:'605c5ef8865c1afd6c43ce7690163df73dede844886593280ed6554a17920b45'}),
 quality:Object.freeze({path:'db/postgres/migrations/pg_v9_089_original_agent_quality_revisions.sql',version:'pg_v9_089',sha256:'81d574036966025cb0e06f8ac1dc9972a529d8f45d62698cfea60396d05e7681'}),
 metadata:Object.freeze({path:'db/postgres/profiles/employee_staff084_composite_ledger.sql',version:staffCompositeMetadataVersion,sha256:'c28797a2ba13dadb5cd821920ec4dd59ef70222fd2998ece86a475c4363d7a6c'})
})
export function staffCompositeMode(profile){if(!staffCompositeProfiles.includes(profile))bad();return Object.freeze({profile,quality:profile===staffCompositeProfiles[1]})}
export function staffCompositeObject(v,keys){if(!v||typeof v!=='object'||types.isProxy(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))bad();const d=Object.getOwnPropertyDescriptors(v);if(Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))bad();return v}
export function staffCompositeTarget(v){staffCompositeObject(v,['system_identifier','database_oid']);for(const [k,max]of [['system_identifier',18446744073709551615n],['database_oid',4294967295n]])if(typeof v[k]!=='string'||!/^[1-9][0-9]{0,19}$/.test(v[k])||BigInt(v[k])>max)bad();return Object.freeze({...v})}
export function staffCompositeSql(raw,pin){
 if(!Object.values(staffCompositePins).includes(pin)||typeof raw!=='string'||staffCompositeSha(raw)!==pin.sha256||raw.includes('\0'))bad()
 let text=raw;const commands=raw.match(/^\s*\\[^\r\n]*/gm)??[]
 if(pin===staffCompositePins.quality){if(commands.length!==1||commands[0].trim()!=='\\set ON_ERROR_STOP on')bad();text=raw.replace(/^\\set ON_ERROR_STOP on\r?\n/m,'')}else if(commands.length)bad()
 const b=[...text.matchAll(/^BEGIN;\r?\n/gm)],e=[...text.matchAll(/^COMMIT;(?:\r?\n|$)/gm)]
 if(b.length!==1||e.length!==1||b[0].index>=e[0].index||text.slice(e[0].index+e[0][0].length).trim()||/^\s*\\/m.test(text))bad()
 return text.slice(0,b[0].index)+text.slice(b[0].index+b[0][0].length,e[0].index)
}
export function staffCompositeReceiptBody(snapshot,target,parentCatalog,catalog){
 staffCompositeTarget(target);if(![snapshot.source_sha256,snapshot.parent.source_sha256,parentCatalog,catalog].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))bad()
 return canonical({profile:snapshot.mode.profile,source_sha256:snapshot.source_sha256,parent_source_sha256:snapshot.parent.source_sha256,target,parent_catalog_sha256:parentCatalog,catalog_sha256:catalog,preinstall_actual047_and046_and078_verified:true,original_14_LOGINs:staffCompositeLogins.map(v=>({login:v.login,groups:v.groups,connection_limit:v.connection_limit})),legacy_rows_copied:0})
}
export function assertStaffComposite14Logins(rows,memberships){
 if(!Array.isArray(rows)||!Array.isArray(memberships)||rows.length!==14)bad()
 for(const d of staffCompositeLogins){const r=rows.filter(v=>v.name===d.login);if(r.length!==1)bad();const v=r[0];if(v.login!==true||v.super||v.inherit||v.bypass||v.createdb||v.createrole||v.replication||v.config!==null||v.limit!==d.connection_limit||v.valid_until!==null||v.direct_privileges!==false)bad();const grants=memberships.filter(g=>g.member===d.login);if(grants.length!==d.groups.length||d.groups.some(group=>grants.filter(g=>g.group===group&&g.admin===false&&g.inherit===false&&g.set===true).length!==1))bad()}
 if(memberships.some(g=>!staffCompositeLogins.some(d=>d.login===g.member)))bad()
}

/** Exact metadata DATA comparison after the genuine parent audit; never feeds projected rows to an old gate. */
export function assertStaffCompositeDelta(before,after,quality){
 const eq=(a,b)=>canonical(a)===canonical(b),rows=x=>x??[],ns=new Map(rows(before.schemas).map(x=>[String(x.oid),x.nspname])),classes=new Map(rows(before.classes).map(x=>[String(x.oid),x]))
 const newNames=[...staffCompositeLogins.map(x=>x.login).filter(n=>!rows(before.roles).some(r=>r.name===n)),...(quality?['agentstudio_quality089']:[])].sort(),addedRoles=rows(after.roles).filter(r=>!rows(before.roles).some(b=>String(b.oid)===String(r.oid)))
 if(!eq(addedRoles.map(r=>r.name).sort(),newNames))bad()
 const aclAdd=(prior,actual,entries)=>{const a=prior??[],b=actual??[];if(!Array.isArray(a)||!Array.isArray(b)||b.length!==a.length+entries.length||!a.every(v=>b.includes(v))||!entries.every(v=>b.includes(v)))bad()}
 const qPermissions=[{"kind":"column","schema":"agentstudio","name":"agent_specs","column":"id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"agent_specs","column":"owner_user_id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"agent_specs","column":"name","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"agent_specs","column":"spec","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"agent_specs","column":"revision","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"agent_specs","column":"updated_at","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"agent_specs","column":"revision","privilege":"UPDATE","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"agent_specs","column":"updated_at","privilege":"UPDATE","grantor":"postgres","grantable":false},{"kind":"table","schema":"agentstudio","name":"agent_release_versions","column":null,"privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"table","schema":"agentstudio","name":"agent_release_acceptance_runs","column":null,"privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"runs","column":"id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"runs","column":"owner_user_id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"runs","column":"workflow_id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"runs","column":"agent_spec_id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"runs","column":"kind","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"runs","column":"status","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"runs","column":"checkpoint","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"runs","column":"result_text","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"run_steps","column":"run_id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"run_steps","column":"owner_user_id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"run_steps","column":"step_key","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"run_steps","column":"status","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"run_steps","column":"metadata","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"users","column":"id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"users","column":"status","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"users","column":"external_issuer","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio_auth","name":"accounts","column":"user_id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio_auth","name":"accounts","column":"enabled","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"owner_user_id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"actor_user_id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"action","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"target_kind","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"target_id","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"result","privilege":"SELECT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"owner_user_id","privilege":"INSERT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"actor_user_id","privilege":"INSERT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"action","privilege":"INSERT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"target_kind","privilege":"INSERT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"target_id","privilege":"INSERT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"result","privilege":"INSERT","grantor":"postgres","grantable":false},{"kind":"column","schema":"agentstudio","name":"audit_events","column":"metadata","privilege":"INSERT","grantor":"postgres","grantable":false},{"kind":"schema","schema":"agentstudio","name":"agentstudio","column":null,"privilege":"USAGE","grantor":"postgres","grantable":false},{"kind":"schema","schema":"agentstudio_auth","name":"agentstudio_auth","column":null,"privilege":"USAGE","grantor":"postgres","grantable":false},{"kind":"function","schema":"agentstudio","name":"actor_id()","column":null,"privilege":"EXECUTE","grantor":"postgres","grantable":false}]
 const aclLetters=entries=>'arwXU'.split('').filter(c=>entries.some(v=>({a:'INSERT',r:'SELECT',w:'UPDATE',X:'EXECUTE',U:'USAGE'})[c]===v.privilege)).join('')
 for(const key of ['extensions','memberships','role_settings','event_triggers','default_acls','rewrites']){
  if(key==='memberships'){
   const old=rows(before[key]),now=rows(after[key]);if(old.some(v=>!now.some(r=>eq(v,r))))bad()
   // Exact new role grants are checked independently against the original14 matrix.
  }else if(!eq(before[key],after[key]))bad()
 }
 const oldDB={...before.database_acl},newDB={...after.database_acl};aclAdd(oldDB.acl,newDB.acl,newNames.filter(n=>n!=='agentstudio_quality089').map(n=>n+'=c/postgres'));delete oldDB.acl;delete newDB.acl;if(!eq(oldDB,newDB))bad()
 for(const key of ['schemas','classes','columns','functions','types','constraints','policies','triggers','indexes','roles','defaults']){
  const identity=key==='columns'?v=>v.attrelid+':'+v.attnum:key==='indexes'?v=>String(v.indexrelid):v=>String(v.oid),now=rows(after[key])
  if(new Set(now.map(identity)).size!==now.length)bad()
  for(const old of rows(before[key])){
   const found=now.find(v=>identity(v)===identity(old));if(!found)bad();if(eq(old,found))continue
   const a={...old},b={...found};let field,entries=[]
   if(key==='schemas'){field='nspacl';if(quality&&['agentstudio','agentstudio_auth'].includes(old.nspname))entries=['agentstudio_quality089=U/postgres']}
   if(key==='functions'&&old.proname==='actor_id'&&quality){field='proacl';entries=['agentstudio_quality089=X/postgres']}
   if(key==='classes'){
    const schema=ns.get(String(old.namespace))
    if(schema==='agentstudio_auth'&&old.name==='accounts'){if(b.natts!==a.natts+1||b.checks!==a.checks+1||b.has_triggers!==true)bad();delete a.natts;delete b.natts;delete a.checks;delete b.checks;delete a.has_triggers;delete b.has_triggers}
    if(a.has_triggers!==b.has_triggers){if(!quality||!['agent_specs','agent_release_versions','agent_release_acceptance_runs','agent_release_receipts','users','audit_events'].includes(old.name)||b.has_triggers!==true)bad();delete a.has_triggers;delete b.has_triggers}
    if(!eq(a.acl,b.acl)){field='acl';if(old.name==='schema_migrations')entries.push('agentstudio_native_auth=r/postgres');const p=quality?qPermissions.filter(p=>p.kind==='table'&&p.schema===schema&&p.name===old.name):[];if(p.length)entries.push('agentstudio_quality089='+aclLetters(p)+'/postgres')}
   }
   if(key==='columns'){
    field='attacl';const table=classes.get(String(old.attrelid));if(!table)bad();const schema=ns.get(String(table.namespace))
    if(schema==='agentstudio'&&table.name==='users'&&old.attname==='display_name'){
     // GRANT UPDATE merges the existing auth entry; all other principal ACLs stay exact.
     const base=a.attacl??[],actual=b.attacl??[],oldAuth=base.find(x=>x.startsWith('agentstudio_native_auth='));if(!oldAuth||!actual.includes(oldAuth.replace('=ar/','=arw/')))bad()
     const remainingA=base.filter(x=>x!==oldAuth),remainingB=actual.filter(x=>!x.startsWith('agentstudio_native_auth='));a.attacl=remainingA;b.attacl=remainingB
    }
    const p=quality?qPermissions.filter(p=>p.kind==='column'&&p.schema===schema&&p.name===table.name&&p.column===old.attname):[];if(p.length)entries.push('agentstudio_quality089='+aclLetters(p)+'/postgres')
   }
   if(field){if(!eq(a[field],b[field])){if(!entries.length)bad();aclAdd(a[field],b[field],entries)}else if(entries.length)bad();delete a[field];delete b[field]}
   if(!eq(a,b))bad()
  }
 }
 for(const old of rows(before.dependencies))if(!rows(after.dependencies).some(v=>eq(v,old)))bad()
 return true
}
