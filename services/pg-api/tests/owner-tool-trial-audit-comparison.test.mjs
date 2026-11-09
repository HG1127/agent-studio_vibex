// Catalog-result comparisons only. These do not install SQL or prove PostgreSQL
// deparser, ACL, RLS, trigger or foreign-key enforcement. Real CI is mandatory.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {verifyOwnerToolTrialCore} from '../src/owner-tool-trial-audit-core.ts'
const source=fs.readFileSync(new URL('../src/owner-tool-trial-audit-core.ts',import.meta.url),'utf8'),line=source.split('\n').find(s=>s.startsWith('const manifest:Manifest=')),manifest=JSON.parse(line.slice(line.indexOf('=')+1)),table=manifest.tables.toolhub_trials
function catalog(options={}){
 const owner=99,referenceIds={users:10,workflows:11,runs:12},indexes=[{primary:true,unique:true,columns:table.pk},...table.unique.map(columns=>({primary:false,unique:true,columns})),...manifest.extraIndexes.map(({primary,unique,columns})=>({primary,unique,columns}))].map((row,i)=>({...row,id:101+i,safe:true})),inventory=[{id:1,name:'toolhub_trials',kind:'r',schema:'agentstudio'},...indexes.map(row=>({id:row.id,name:'toolhub_trials_index_'+row.id,kind:'i',schema:'agentstudio'}))],constraints=[],name=()=> 'toolhub_trials_constraint_'+constraints.length
 for(const columns of table.fields.filter(f=>f[2]).map(f=>[f[0]]))constraints.push({name:name(),kind:'n',columns,safe:true})
 constraints.push({name:name(),kind:'p',columns:table.pk,safe:true});for(const columns of table.unique)constraints.push({name:name(),kind:'u',columns,safe:true})
 for(const f of table.foreign)constraints.push({name:name(),kind:'f',columns:f.columns,target:referenceIds[f.target],references:f.references,delete:f.delete,update:f.update,safe:true})
 for(const expression of table.checks)constraints.push({name:name(),kind:'c',expression:'CHECK ('+expression+')',safe:true})
 const rows={inventory,routines:Object.entries(manifest.routines).map(([name,r],i)=>({name,...r,id:20+i,owner,schema:'agentstudio',ordinary:true})),stamp:[{installed:true,predecessor:true,server_version:180001,types:2,policies:2,events:0,roles:0,triggers:3,constraints:constraints.length,extras:0}],session:[{id:90,safe:true}],references:Object.entries(referenceIds).map(([name,id])=>({name,id})),owner:[{safe:true}],function_acl:[{safe:true}],types:[{name:'toolhub_trials',table:'toolhub_trials',schema:'agentstudio',safe:true},{name:'_toolhub_trials',table:'toolhub_trials',schema:'agentstudio',safe:true}],table:[{safe:true}],columns:table.fields.map(([name,type,required,defaultValue],i)=>({ordinal:i+1,name,type,required,default:defaultValue,safe:true})),constraints,indexes,mounts:[{n:15,user_triggers:3,safe:true}],policies:[{name:'toolhub_trial_owner_read',command:'r',safe:true,qual:'owner_user_id=agentstudio.actor_id()',check:null},{name:'toolhub_trial_owner_insert',command:'a',safe:true,qual:null,check:'owner_user_id=agentstudio.actor_id()'}],closure:[{safe:true}]}
 options.mutate?.(rows);const calls=[];return {rows,calls,db:{async query(sql,args){const kind=/\/\* toolhub069:([a-z_]+) \*\//.exec(sql)?.[1];assert.ok(Object.hasOwn(rows,kind),'unexpected original catalog read');calls.push({kind,sql,args});return {rows:structuredClone(rows[kind])}}}}
}
test('actual069 verifier accepts its exact synthetic manifest profile and reads original catalog, RLS, ACL and trigger projections',async()=>{
 const c=catalog();assert.equal(await verifyOwnerToolTrialCore(c.db),true)
 for(const kind of ['inventory','routines','stamp','session','references','owner','function_acl','types','table','columns','constraints','indexes','mounts','policies','closure'])assert.ok(c.calls.some(v=>v.kind===kind),kind)
 assert.match(c.calls.find(v=>v.kind==='table').sql,/NOT has_table_privilege\('agentstudio_api',c.oid,'UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN'\)/)
 assert.match(c.calls.find(v=>v.kind==='mounts').sql,/RI_FKey_noaction_del/);assert.match(c.calls.find(v=>v.kind==='session').sql,/NOT m.inherit_option AND m.set_option/)
})
test('missing schema returns false only when the complete new namespace is absent; partial install or wrong predecessor/server is refused',async()=>{
 const absent=catalog({mutate:r=>{r.inventory=[];r.routines=[];Object.assign(r.stamp[0],{installed:false,types:0,policies:0,events:0,roles:0,triggers:0,constraints:0,extras:0})}});assert.equal(await verifyOwnerToolTrialCore(absent.db),false)
 for(const mutate of [r=>{r.stamp[0].installed=false},r=>{r.stamp[0].predecessor=false},r=>{r.stamp[0].server_version=170009},r=>{r.stamp[0].extras=1}])await assert.rejects(verifyOwnerToolTrialCore(catalog({mutate}).db),/unsafe_toolhub_privileges/)
})
test('unsafe Native login membership, routine source/owner/ACL, table grants and RLS conditions remain fail closed',async()=>{
 for(const mutate of [r=>{r.session[0].safe=false},r=>{r.owner[0].safe=false},r=>{r.routines[0].sha='0'.repeat(64)},r=>{r.routines[1].owner=98},r=>{r.function_acl[0].safe=false},r=>{r.table[0].safe=false},r=>{r.policies[0].qual='true'},r=>{r.policies[1].check='owner_user_id=agentstudio.actor_id() OR true'},r=>{r.policies[0].safe=false}])await assert.rejects(verifyOwnerToolTrialCore(catalog({mutate}).db),/unsafe_toolhub_privileges/)
})
test('missing/changed fields, NULL-sensitive CHECK grouping, references, indexes and trigger closure cannot be blessed by the new verifier',async()=>{
 for(const mutate of [r=>{r.columns.pop()},r=>{r.columns[0].required=false},r=>{r.constraints.find(c=>c.kind==='c'&&c.expression.includes("target->>'kind'")).expression="CHECK(target->>'kind'=source_kind)"},r=>{r.constraints.find(c=>c.kind==='f').target=999},r=>{r.constraints.find(c=>c.kind==='n').columns=['wrong']},r=>{r.indexes[0].safe=false},r=>{r.mounts[0].n=13},r=>{r.mounts[0].safe=false},r=>{r.closure[0].safe=false}])await assert.rejects(verifyOwnerToolTrialCore(catalog({mutate}).db),/unsafe_toolhub_privileges/)
})
