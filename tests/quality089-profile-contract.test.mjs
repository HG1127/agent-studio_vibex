
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {quality089InstallSql,quality089Target,quality089ReceiptBody,assertQuality089CatalogDelta,employeeQuality089Migration} from '../services/pg-api/src/employee-quality089-contract.mjs'
import {selectNativeEmployeeQuality089Profile} from '../services/pg-api/src/native-employee-quality089-profile.mjs'
import {originalQuality089Static} from '../services/pg-api/src/original-quality089-static.mjs'
function baseline(){
 const schemas=[{oid:1,nspname:'agentstudio',nspacl:['postgres=UC/postgres']},{oid:2,nspname:'agentstudio_auth',nspacl:['postgres=UC/postgres']}],names=[...new Set(originalQuality089Static.permissions.filter(p=>p.kind==='table'||p.kind==='column').map(p=>p.schema+'.'+p.name))],classes=names.map((n,i)=>({oid:i+10,namespace:n.startsWith('agentstudio_auth.')?2:1,name:n.split('.')[1],has_triggers:false,acl:['postgres=arwdDxtm/postgres'],rls:true})),columns=[]
 for(const p of originalQuality089Static.permissions.filter(v=>v.kind==='column')){const c=classes.find(v=>v.name===p.name&&v.namespace===(p.schema==='agentstudio_auth'?2:1));if(!columns.some(v=>v.attrelid===c.oid&&v.attname===p.column))columns.push({attrelid:c.oid,attnum:columns.filter(v=>v.attrelid===c.oid).length+1,attname:p.column,attacl:null,attnotnull:true})}
 return {schemas,classes,columns,functions:[{oid:40,proname:'actor_id',prosrc:'original exact actor source',proacl:['postgres=X/postgres']}],roles:[{oid:50,name:'agentstudio_api'}],dependencies:[{classid:1,objid:10,refobjid:1}],extensions:[],memberships:[],role_settings:[],database_acl:{oid:100,acl:null},event_triggers:[],default_acls:[],rewrites:[],types:[],constraints:[],policies:[],triggers:[],indexes:[],defaults:[]}
}
function permitted(){
 const before=baseline(),after=structuredClone(before),chars=p=>'arwXU'.split('').filter(c=>p.some(v=>({a:'INSERT',r:'SELECT',w:'UPDATE',X:'EXECUTE',U:'USAGE'})[c]===v.privilege)).join('')
 after.roles.push({oid:51,name:'agentstudio_quality089'})
 for(const s of after.schemas)s.nspacl.push('agentstudio_quality089=U/postgres')
 for(const c of after.classes){const p=originalQuality089Static.permissions.filter(p=>p.kind==='table'&&p.name===c.name);if(p.length)c.acl.push('agentstudio_quality089='+chars(p)+'/postgres');if(['agent_specs','agent_release_versions','agent_release_acceptance_runs','agent_release_receipts'].includes(c.name))c.has_triggers=true}
 for(const c of after.columns){const t=after.classes.find(t=>t.oid===c.attrelid),p=originalQuality089Static.permissions.filter(p=>p.kind==='column'&&p.name===t.name&&p.column===c.attname);c.attacl=['agentstudio_quality089='+chars(p)+'/postgres']}
 after.functions[0].proacl.push('agentstudio_quality089=X/postgres');return {before,after}
}
test('pure delta permits only declared new principal ACLs while preserving parent rows',()=>{const x=permitted();assert.equal(assertQuality089CatalogDelta(x.before,x.after),true)})
for(const [name,mutate]of [
 ['old function body',x=>x.after.functions[0].prosrc='changed'],
 ['old function ACL',x=>x.after.functions[0].proacl.push('other=X/postgres')],
 ['old column',x=>x.after.columns[0].attnotnull=false],
 ['old constraint removal',x=>{x.before.constraints.push({oid:90,name:'original'});x.after.constraints=[]}],
 ['schema create privilege',x=>x.after.schemas[0].nspacl[1]='agentstudio_quality089=UC/postgres'],
 ['wrong column privilege',x=>x.after.columns[0].attacl[0]='agentstudio_quality089=arwd/postgres'],
 ['unrecognized parent table ACL',x=>x.after.classes[0].acl.push('other=r/postgres')],
 ['old dependency removal',x=>x.after.dependencies=[]],
 ['extra new role',x=>x.after.roles.push({oid:52,name:'agentstudio_unknown'})],
 ['role settings',x=>x.after.role_settings.push({setrole:50,setconfig:['search_path=public']})],
])test('pure delta refuses '+name,()=>{const x=permitted();mutate(x);assert.throws(()=>assertQuality089CatalogDelta(x.before,x.after))})
test('target and native selector keep actual original identity and quality opt-in',()=>{const e={AGENT_STUDIO_PG18_EMPLOYEE_UI_PROFILE:'complete069-employee-ui-quality089',AGENT_STUDIO_PG18_EMPLOYEE_UI_SOURCE_SHA256:'a'.repeat(64),AGENT_STUDIO_PG18_EMPLOYEE_UI_SYSTEM_IDENTIFIER:'123456789',AGENT_STUDIO_PG18_EMPLOYEE_UI_DATABASE_OID:'16384',AGENT_STUDIO_PG18_ORIGINAL_QUALITY_ENABLED:'true'};assert.equal(selectNativeEmployeeQuality089Profile(e).profile,'complete069-employee-ui-quality089');for(const k of Object.keys(e)){const c={...e};delete c[k];assert.throws(()=>selectNativeEmployeeQuality089Profile(c),k)}assert.throws(()=>selectNativeEmployeeQuality089Profile({...e,AGENT_STUDIO_PG18_EMPLOYEE_UI_UNKNOWN:'true'}));assert.throws(()=>quality089Target({system_identifier:'1',database_oid:'4294967296'}))})
test('migration is raw-hash pinned and only outer transaction is removed',()=>{const sql=readFileSync(new URL('../db/postgres/migrations/pg_v9_089_original_agent_quality_revisions.sql',import.meta.url),'utf8'),body=quality089InstallSql(sql);assert(!/^BEGIN;$/m.test(body));assert(!/^COMMIT;$/m.test(body));assert(body.includes('CREATE FUNCTION agentstudio.quality089_save'));assert.throws(()=>quality089InstallSql(sql.replace('5333','5432')+' '));assert.equal(employeeQuality089Migration.version,'pg_v9_089')})
test('new receipt names the independent profile and genuine prior046 audit',()=>{const raw=quality089ReceiptBody({source_sha256:'a'.repeat(64),parent:{source_sha256:'b'.repeat(64)}},{system_identifier:'1',database_oid:'2'},'c'.repeat(64),'d'.repeat(64)),v=JSON.parse(raw);assert.equal(v.profile,'complete069-employee-ui-quality089');assert.equal(v.original046_actual_preinstall_audited,true);assert.equal(v.parent_profile,'complete069-employee-ui078');assert.equal(v.legacy_rows_copied,0)})
