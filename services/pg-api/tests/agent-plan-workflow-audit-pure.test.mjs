// Decoder/refusal tests over synthetic catalog values only. No SQL execution or
// claim of actual PostgreSQL/catalog/role/concurrency verification.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {verifyAgentPlanWorkflowCore,normalizeAgentPlanWorkflowCheck} from '../src/agent-plan-workflow-audit-core.ts'
const raw=readFileSync(new URL('../src/agent-plan-workflow-audit-core.ts',import.meta.url),'utf8')
const manifest=JSON.parse(raw.match(/const manifest:Manifest=(\{[^\n]+\})\n/)[1])
const tableNames=Object.keys(manifest.tables),routineNames=Object.keys(manifest.routines),tableId=n=>100+tableNames.indexOf(n),functionId=n=>1000+routineNames.indexOf(n)
function catalog(overrides={}){
 const calls=[]
 const inventory=tableNames.flatMap((name,i)=>[{id:tableId(name),schema:'agentstudio',name,kind:'r'},...Array.from({length:1+manifest.tables[name].unique.length+manifest.extraIndexes.filter(x=>x.table===name).length},(_,j)=>({id:20000+i*10+j,schema:'agentstudio',name:name+'_index_'+j,kind:'i'}))])
 const reply=(tag,args)=>{
  if(Object.hasOwn(overrides,tag))return typeof overrides[tag]==='function'?overrides[tag](args):overrides[tag]
  if(tag==='inventory')return inventory
  if(tag==='routines')return routineNames.map(name=>({id:functionId(name),schema:'agentstudio',name,owner:50,...manifest.routines[name],ordinary:true}))
  if(tag==='roles')return [{id:60,name:'agentstudio_plan_workflow_dispatch',safe:true},{id:61,name:'agentstudio_plan_workflow_worker',safe:true}]
  if(tag==='stamp')return [{installed:true,predecessor:true,server_version:180000,types:20,policies:0,events:0,role_count:2,triggers:7,constraints:100,extras:0}]
  if(tag==='session')return [{id:900,role:'agentstudio_api',safe:true}]
  if(['owner','function_acl','table','hardened','closure','final_closure'].includes(tag))return [{safe:true}]
  if(tag==='types')return tableNames.flatMap(table=>[table,'_'+table].map(name=>({name,table,schema:'agentstudio',safe:true})))
  if(tag==='columns')return manifest.tables[tableNames[args[0]-100]].fields.map(([name,type,required,def],i)=>({ordinal:i+1,name,type,required,default:def,safe:true}))
  if(tag==='constraints'){
   const name=tableNames[args[0]-100],t=manifest.tables[name]
   return [
    {kind:'p',columns:t.pk},...t.unique.map(columns=>({kind:'u',columns})),...t.foreign.map(f=>({kind:'f',columns:f.columns,references:f.references,target:tableId(f.target),delete:f.delete,update:f.update})),
    ...t.checks.map(expression=>({kind:'c',expression})),...t.fields.filter(x=>x[2]).map(x=>({kind:'n',columns:[x[0]]}))
   ].map((x,i)=>({id:30000+args[0]*100+i,name:name+'_constraint_'+i,safe:true,...x}))
  }
  if(tag==='indexes'){
   const name=tableNames[args[0]-100],t=manifest.tables[name]
   return [{primary:true,unique:true,columns:t.pk},...t.unique.map(columns=>({primary:false,unique:true,columns})),...manifest.extraIndexes.filter(x=>x.table===name).map(({primary,unique,columns})=>({primary,unique,columns}))].map((x,j)=>({id:20000+(args[0]-100)*10+j,safe:true,...x}))
  }
  if(tag==='mounts')return [{safe:true,n:55,user_triggers:7}]
  if(tag==='members')return []
  if(tag==='sensitive')return [60,61].flatMap(role_id=>[{role_id,name:'pg_authid',kind:'r',effective:false,raw:false},{role_id,name:'pg_shadow',kind:'v',effective:false,raw:false}])
  throw Error('unhandled synthetic catalog tag '+tag)
 }
 return {calls,async query(sql,args=[]){assert.match(sql,/^\/\* plan064:/);assert.match(sql,/\*\/ SELECT|\*\/ WITH/);const tag=sql.match(/plan064:(\w+)/)[1];calls.push({tag,args});return{rows:structuredClone(reply(tag,args))}}}
}
test('064 literal catalog decoder reaches all gates on synthetic values',async()=>{const db=catalog();assert.equal(await verifyAgentPlanWorkflowCore(db),true);assert.ok(db.calls.some(c=>c.tag==='final_closure'));assert.equal(db.calls.filter(c=>c.tag==='function_acl').length,44)})
for(const tag of ['session','owner','function_acl','table','hardened','closure','final_closure'])test('064 refuses false '+tag,async()=>{await assert.rejects(()=>verifyAgentPlanWorkflowCore(catalog({[tag]:[{safe:false}]})),/unsafe_agent_plan_workflow_privileges/)})
test('064 refuses strings where catalog OIDs must be actual numbers',async()=>{await assert.rejects(()=>verifyAgentPlanWorkflowCore(catalog({session:[{id:'900',safe:true}]})),/unsafe_agent_plan_workflow_privileges/)})
test('064 refuses PG name[] text and reordered key columns',async()=>{
 const good=catalog(),base=await good.query('/* plan064:constraints */ SELECT',[100]);
 for(const columns of ['{owner_user_id,request_id}',['request_id','owner_user_id']]){
  const rows=structuredClone(base.rows);rows.find(x=>x.kind==='p').columns=columns
  await assert.rejects(()=>verifyAgentPlanWorkflowCore(catalog({constraints:()=>rows})),/unsafe_agent_plan_workflow_privileges/)
 }
})
test('064 refuses unknown or missing prefix artifacts without migration stamp',async()=>{
 const stamp=[{installed:false,predecessor:true,server_version:180000,types:0,policies:0,events:0,role_count:0,triggers:0,constraints:0,extras:0}]
 const db=catalog({inventory:[],routines:[],roles:[],stamp});assert.equal(await verifyAgentPlanWorkflowCore(db),false)
 await assert.rejects(()=>verifyAgentPlanWorkflowCore(catalog({stamp})),/unsafe_agent_plan_workflow_privileges/)
 await assert.rejects(()=>verifyAgentPlanWorkflowCore(catalog({inventory:[],routines:[],roles:[],stamp:[{...stamp[0],constraints:1}]})),/unsafe_agent_plan_workflow_privileges/)
})
test('064 refuses missing/a second session row and propagated query failures',async()=>{
 for(const session of [[],[{id:900,safe:true},{id:901,safe:true}],null])await assert.rejects(()=>verifyAgentPlanWorkflowCore(catalog({session})),/unsafe_agent_plan_workflow_privileges/)
 const error=new Error('synthetic query fault');await assert.rejects(()=>verifyAgentPlanWorkflowCore({query(){throw error}}),e=>e===error)
})
for(const [name,tag,change]of [
 ['changed function body','routines',rows=>{rows[0].sha='0'.repeat(64)}],
 ['changed function configuration','routines',rows=>{rows[0].config=['search_path=public']}],
 ['overloaded function','routines',rows=>{rows.push({...rows[0],id:4000,args:'text'})}],
 ['same name in foreign schema','inventory',rows=>{rows[0].schema='public'}],
 ['extra family role','roles',rows=>{rows.push({id:62,name:'agentstudio_plan_workflow_extra',safe:true})}],
 ['extra immutable hook','mounts',rows=>{rows[0].n++}],
 ['credential catalog read','sensitive',rows=>{rows[0].effective=true}],
 ['ordinary column reordering','columns',rows=>{[rows[0],rows[1]]=[rows[1],rows[0]]}],
 ['unsafe new index','indexes',rows=>{rows[0].safe=false}]
])test('064 refuses '+name,async()=>{
 const db=catalog(),query=db.query.bind(db)
 db.query=async(sql,args)=>{const out=await query(sql,args);if(sql.includes('plan064:'+tag+' '))change(out.rows);return out}
 await assert.rejects(()=>verifyAgentPlanWorkflowCore(db),/unsafe_agent_plan_workflow_privileges/)
})
test('constraint normalizer preserves grouping, literals and operators',()=>{
 assert.equal(normalizeAgentPlanWorkflowCheck("CHECK ((state = ANY (ARRAY['queued'::text, 'claimed'::text])))"),normalizeAgentPlanWorkflowCheck("state IN('queued','claimed')"))
 assert.notEqual(normalizeAgentPlanWorkflowCheck('(a=1 OR b=2) AND c=3'),normalizeAgentPlanWorkflowCheck('a=1 OR (b=2 AND c=3)'))
 assert.notEqual(normalizeAgentPlanWorkflowCheck("purpose='agent_plan_to_workflow_draft'"),normalizeAgentPlanWorkflowCheck("purpose='generate'"))
 for(const value of ["a=1; SELECT 1","a=1 /*removed*/","a LIKE 'x%'"])assert.throws(()=>normalizeAgentPlanWorkflowCheck(value),/unsafe_agent_plan_workflow_privileges/)
})
