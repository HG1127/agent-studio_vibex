
import {createHash} from 'node:crypto'
import {types} from 'node:util'
import {originalQuality089Static} from './original-quality089-static.mjs'
import {employeeUi078Canonical as canonical} from './pg18-employee-ui078-catalog.mjs'
export const employeeQuality089Profile='complete069-employee-ui-quality089'
export const employeeQuality089Receipt='pg18_employee_ui_quality089_001'
export const employeeQuality089Migration={path:'db/postgres/migrations/pg_v9_089_original_agent_quality_revisions.sql',sha256:'81d574036966025cb0e06f8ac1dc9972a529d8f45d62698cfea60396d05e7681',version:'pg_v9_089',description:'original employee quality revision v1; fresh isolated only'}
export const quality089Sha=value=>createHash('sha256').update(value).digest('hex')
const fail=()=>{throw Error('employee_quality089_contract_refused')}
export function quality089Plain(v,keys){if(!v||typeof v!=='object'||types.isProxy(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();const d=Object.getOwnPropertyDescriptors(v);if(Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))fail();return v}
export function quality089Target(v){quality089Plain(v,['system_identifier','database_oid']);if(!/^[1-9][0-9]{0,19}$/.test(v.system_identifier)||BigInt(v.system_identifier)>18446744073709551615n||!/^[1-9][0-9]{0,9}$/.test(v.database_oid)||BigInt(v.database_oid)>4294967295n)fail();return Object.freeze({...v})}

export function quality089InstallSql(raw){
 if(typeof raw!=='string'||quality089Sha(raw)!==employeeQuality089Migration.sha256||raw.includes('\0'))fail()
 const commands=raw.match(/^\s*\\[^\r\n]*/gm)??[];if(commands.length!==1||commands[0].trim()!=='\\set ON_ERROR_STOP on')fail()
 const text=raw.replace(/^\\set ON_ERROR_STOP on\r?\n/m,''),b=[...text.matchAll(/^BEGIN;\r?\n/gm)],e=[...text.matchAll(/^COMMIT;(?:\r?\n|$)/gm)]
 if(b.length!==1||e.length!==1||b[0].index>=e[0].index||text.slice(e[0].index+e[0][0].length).trim()||/^\s*\\/m.test(text))fail()
 return text.slice(0,b[0].index)+text.slice(b[0].index+b[0][0].length,e[0].index)
}

export function quality089ReceiptBody(snapshot,target,parentCatalog,catalog){quality089Target(target);if(![parentCatalog,catalog,snapshot.source_sha256,snapshot.parent.source_sha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))fail();return canonical({profile:employeeQuality089Profile,source_sha256:snapshot.source_sha256,parent_profile:'complete069-employee-ui078',parent_source_sha256:snapshot.parent.source_sha256,target,parent_catalog_sha256:parentCatalog,catalog_sha256:catalog,original046_actual_preinstall_audited:true,migration:employeeQuality089Migration,legacy_rows_copied:0})}
/** Compare genuine before/after catalog DATA. Never supplies projected rows to an old auditor. */

export function assertQuality089CatalogDelta(before,after){
 quality089Plain(before,Object.keys(after));const eq=(a,b)=>canonical(a)===canonical(b),rows=v=>v??[],oid=v=>String(v.oid),newRoles=rows(after.roles).filter(v=>!rows(before.roles).some(b=>oid(b)===oid(v)))
 if(newRoles.length!==1||newRoles[0].name!=='agentstudio_quality089')fail()
 const grantRole=newRoles[0].name,triggerTables=new Set(['agent_specs','agent_release_versions','agent_release_acceptance_runs','agent_release_receipts']),ns=new Map(rows(before.schemas).map(v=>[String(v.oid),v.nspname])),classes=new Map(rows(before.classes).map(v=>[String(v.oid),v]))
 const addAcl=(old,now,letters)=>{const a=old??[],b=now??[];if(!Array.isArray(a)||!Array.isArray(b)||b.length!==a.length+1||!a.every(v=>b.includes(v))||!b.includes(grantRole+'='+letters+'/postgres'))fail()}
 const permission=(kind,schema,name,column)=>originalQuality089Static.permissions.filter(v=>v.kind===kind&&v.schema===schema&&v.name===name&&v.column===column)
 const letters=entries=>'arwXU'.split('').filter(c=>entries.some(v=>({a:'INSERT',r:'SELECT',w:'UPDATE',X:'EXECUTE',U:'USAGE'})[c]===v.privilege)).join('')
 for(const key of ['extensions','memberships','role_settings','database_acl','event_triggers','default_acls','rewrites'])if(!eq(before[key],after[key]))fail()
 for(const key of ['schemas','classes','columns','defaults','functions','types','constraints','policies','triggers','indexes','roles']){
  const a=rows(after[key]),identity=key==='columns'?v=>v.attrelid+':'+v.attnum:key==='indexes'?v=>String(v.indexrelid):oid
  if(new Set(a.map(identity)).size!==a.length)fail()
  for(const old of rows(before[key])){
   const now=a.find(v=>identity(v)===identity(old));if(!now)fail();if(eq(old,now))continue
   const prior={...old},actual={...now};let aclField,allowed=''
   if(key==='schemas'){aclField='nspacl';allowed=letters(permission('schema',old.nspname,old.nspname,null))}
   else if(key==='columns'){const table=classes.get(String(old.attrelid));if(!table)fail();aclField='attacl';allowed=letters(permission('column',ns.get(String(table.namespace)),table.name,old.attname))}
   else if(key==='classes'){
    if(prior.has_triggers!==actual.has_triggers){if(!triggerTables.has(old.name)||actual.has_triggers!==true)fail();delete prior.has_triggers;delete actual.has_triggers}
    if(!eq(prior.acl,actual.acl)){aclField='acl';allowed=letters(permission('table',ns.get(String(old.namespace)),old.name,null))}
   }else if(key==='functions'&&old.proname==='actor_id'){aclField='proacl';allowed='X'}
   if(aclField){if(!allowed)fail();addAcl(prior[aclField],actual[aclField],allowed);delete prior[aclField];delete actual[aclField]}
   if(!eq(prior,actual))fail()
  }
 }
 const deps=rows(after.dependencies);for(const old of rows(before.dependencies))if(!deps.some(v=>eq(v,old)))fail()
 return true
}
