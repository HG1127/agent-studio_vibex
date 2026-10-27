import {randomUUID} from "node:crypto"
import {agentFixture,alice,bob} from "./workflow-v2-agent-fixture.mjs"
import {KnowledgeAccessRepository} from "../../src/knowledge-access-repository.ts"
import {AutonomousAgentRunRepository} from "../../src/autonomous-agent-run-repository.ts"
import {safeAgentSpec} from "../../src/contracts.ts"
export async function knowledgeKeywordFixture({applyKeyword=true}={}){
  const f=await agentFixture({mcp:true,smithery:true,sharing:true})
  try{
    for(const version of ["035_knowledge_embedding_state","036_knowledge_embedding_consent","037_knowledge_index_runtime","038_knowledge_query_runtime","039_knowledge_execution_source","040_approved_semantic_tools",...(applyKeyword?["041_keyword_observations"]:[])])
      await f.db.exec(f.sql("migrations/pg_v9_"+version+".sql"))
    const base=f.resources.alice.kb.id,access=new KnowledgeAccessRepository(f.pool,async()=>({id:f.users.bob,display_name:"Bob"}))
    await access.change(alice,base,{action:"grant",recipient_email:"bob@example.test",role:"viewer",semantic_allowed:false,expected_revision:0,request_id:randomUUID()})
    return {...f,base,access}
  }catch(error){await f.close();throw error}
}
export async function createKeywordRun(f,kind="tool",{query="OWN_CITATION"}={}){
  let data={title:"Search",tool:"knowledge_search",knowledge_base_ids:[f.base],params_template:JSON.stringify({query})},spec
  if(kind!=="tool"){
    spec=await f.agents.create(bob,"Keyword role",safeAgentSpec({goal:"Use explicit free keyword evidence",tools:["knowledge_search"],knowledge_base_ids:[f.base],model_binding:f.resources.bob.binding}))
    data={title:"Search",agent_binding:{spec_id:spec.id,spec_revision:spec.revision},max_steps:2}
  }
  const runs=kind==="autonomous"?new AutonomousAgentRunRepository(f.pool):f.runs
  if(kind==="autonomous")return {runs,queued:await runs.submit(bob,spec.id,{expected_revision:spec.revision,max_steps:2,idempotency_key:randomUUID(),instruction:"Synthetic keyword task"})}
  const graph={version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
    {id:"search",type:kind==="tool"?"tool":"agent",data,position:{x:100,y:0}},
    ...(kind==="tool"?[{id:"model",type:"model",data:{title:"Answer",model_binding:f.resources.bob.binding,prompt:"Use approved observations: {{Search.output}}"},position:{x:200,y:0}}]:[]),
    {id:"end",type:"end",data:{title:"End",output_template:kind==="tool"?"{{Answer.output}}":"{{Search.output}}"},position:{x:300,y:0}}],
    edges:kind==="tool"?[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"model"},{id:"c",source:"model",target:"end"}]:[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"end"}]}
  const flow=await f.flows.create(bob,"Keyword source fence",graph)
  return {runs,queued:await runs.submit(bob,flow.id,{expected_revision:flow.revision,idempotency_key:randomUUID(),instruction:"Synthetic keyword task"})}
}
export async function approveKeywordStep(runs,id){
  const pending=(await runs.get(bob,id)).pending_effect
  if(!pending)throw Error("synthetic_pending_effect_missing")
  await runs.decide(bob,id,{decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256})
  return pending
}
