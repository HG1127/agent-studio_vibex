import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = fs.readFileSync(path.join(root,"pocketbase/pb_hooks/modules/internal_template_copy.js"),"utf8")
const sandbox={module:{exports:{}}}
vm.runInNewContext(source,sandbox,{timeout:1000})
const {makeCopy,fromRecord}=sandbox.module.exports
const plain=o=>JSON.parse(JSON.stringify(o))

test("internal template copy only includes safe allowlisted fields and built-in tools",()=>{
  const safe=plain(makeCopy({
    goal:"Research trends",
    task_scope:"Public sources only",
    deliverables:["Report"],tools:["calculate","knowledge_search","external_post","calculate"],
    task_plan:["Gather","Compare"],done_criteria:["Cite"],
    require_approval:false,
    knowledge_base_ids:["privileged-kb"],
    model_connection_id:"PERSONAL_KEY",
    api_key:"PRIVATE_TOKEN",
    context:{confidential:"SECRET"},
  }))
  assert.equal(safe.goal,"Research trends")
  assert.deepEqual(safe.tools,["calculate","knowledge_search"])
  assert.deepEqual(safe.knowledge_base_ids,[])
  assert.equal(safe.require_approval,true)
  assert.equal(Object.hasOwn(safe,"api_key"),false)
  assert.equal(Object.hasOwn(safe,"model_connection_id"),false)
  assert.equal(Object.hasOwn(safe,"context"),false)
  assert.doesNotMatch(JSON.stringify(safe),/PERSONAL_KEY|PRIVATE_TOKEN|privileged-kb|SECRET/)
})

test("internal template record fallback survives PocketBase Go-style JSON string failures",()=>{
  const record={
    get(){return null},
    publicExport(){return {spec:{
      goal:"Be precise",tools:["summarize","dangerous_external"],deliverables:["Summary"],
    }}},
    getString(){return "map[goal:GoMap]"},
  }
  const safe=plain(fromRecord(record))
  assert.equal(safe.goal,"Be precise")
  assert.deepEqual(safe.tools,["summarize"])
  assert.throws(()=>fromRecord({get(){return null},publicExport(){return {}},getString(){return "invalid"}}),
    /source_spec_invalid/)
})


test("multi-role sharing keeps planning DAG and tests, but never copies grants or owner resources",()=>{
  const role=(id,depends_on,tools,skill_refs)=>({
    id,name:id,responsibility:"Review a public source",
    tasks:["Analyze evidence"],inputs:["Public request"],deliverables:["Evidence note"],
    depends_on,tools,done_criteria:["Show traceable result"],skill_refs
  })
  const personalSkill={id:"ownerOnlySkill01",version:1,hash:"f".repeat(64)}
  const input={
    goal:"Analyze the market",task_scope:"Public only",deliverables:["Report"],
    tools:["calculate","web_search","private-mcp"],task_plan:["Read","Review"],
    done_criteria:["Validated"],knowledge_base_ids:["Private-KB-987"],
    roles:[
      role("research",[],["owner_private_tool"],[personalSkill]),
      role("review",["research"],["calculate"],[]),
    ],
    capability_requirements:[
      {id:"research_cap",title:"Market research",purpose:"Find public resources",
        kind:"web_search",access:"read",required:true,role_ids:["research"],
        search_terms:["market research"],suggested_tool_ids:["owner_only_search"]},
      {id:"delivery_cap",title:"External delivery",purpose:"User must approve",
        kind:"integration",access:"write",required:true,role_ids:["review"],
        search_terms:["email"],suggested_tool_ids:["owner_private_email"]},
    ],
    quality_checks:[{type:"contains",expected:"Validated"}],
    api_key:"DO_NOT_SHARE_SECRET",custom_model:{connection_id:"owner_model_secret"},
  }
  const safe=plain(makeCopy(input))
  assert.equal(safe.roles.length,2)
  assert.deepEqual(safe.roles.map(r=>r.id),["research","review"])
  assert.deepEqual(safe.roles[1].depends_on,["research"])
  assert.deepEqual(safe.roles.map(r=>r.tools),[[],[]])
  assert.ok(safe.roles.every(r=>!Object.hasOwn(r,"skill_refs")))
  assert.deepEqual(safe.capability_requirements.map(r=>r.role_ids),[["research"],["review"]])
  assert.ok(safe.capability_requirements.every(r=>r.suggested_tool_ids.length===0))
  assert.ok(safe.capability_requirements.every(r=>r.search_terms.length===0))
  assert.deepEqual(safe.quality_checks,[{type:"contains",expected:"Validated"}])
  assert.deepEqual(safe.tools,["calculate","web_search"])
  assert.equal(safe.require_approval,true)
  assert.equal(safe.require_plan_review,true)
  assert.deepEqual(safe.knowledge_base_ids,[])
  assert.doesNotMatch(JSON.stringify(safe),/DO_NOT_SHARE_SECRET|ownerOnlySkill|owner_private|owner_model_secret|Private-KB/)
  assert.deepEqual(input.roles[0].tools,["owner_private_tool"],"source spec remains unchanged")
})
test("invalid complex role graph fails closed rather than silently dropping roles",()=>{
  const base={goal:"analysis",tools:[],roles:[
    {id:"r1",name:"One",responsibility:"Reason",tasks:["Read"],inputs:[],deliverables:["Memo"],
      depends_on:["r2"],tools:[],done_criteria:["Complete"]},
    {id:"r2",name:"Two",responsibility:"Review",tasks:["Review"],inputs:[],deliverables:["Report"],
      depends_on:["r1"],tools:[],done_criteria:["Complete"]},
  ]}
  assert.throws(()=>makeCopy(base),/shared_roles_invalid/)
  assert.throws(()=>makeCopy({...base,roles:[{...base.roles[0],depends_on:["non-existent"]}]}),/shared_roles_invalid/)
  assert.throws(()=>makeCopy({...base,roles:[
    {...base.roles[0],depends_on:[]},{...base.roles[0],depends_on:[]}
  ]}),/shared_roles_invalid/)
})
test("shared free-form instructions require human review outside automatic filtering",()=>{
  const safe=plain(makeCopy({goal:"Please contact vendor after approval",tools:[]}))
  assert.equal(safe.goal,"Please contact vendor after approval")
  // Parser makes no claim to classify all possible confidential text.
  assert.equal(safe.require_approval,true)
})
