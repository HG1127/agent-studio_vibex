// Synthetic in-memory SQL and temporary private mTLS; no external provider.
import {readFileSync} from "node:fs"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {AgentSpecRepository} from "../../src/repository.ts"
import {safeAgentSpec} from "../../src/contracts.ts"
import {WorkflowRepository} from "../../src/workflow-repository.ts"
import {KnowledgeBaseRepository} from "../../src/knowledge-repository.ts"
import {ModelConnectionRepository} from "../../src/model-connection-repository.ts"
import {AutonomousAgentRunRepository} from "../../src/autonomous-agent-run-repository.ts"
import {WorkflowV2RunRepository} from "../../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../../src/workflow-v2-worker.ts"
import {WorkflowV2ModelDispatch,WorkflowV2ModelLeaseIdentity,verifiedWorkflowV2ModelDispatch} from "../../src/workflow-v2-model-dispatch.ts"
import {WorkflowV2ToolDispatch,WorkflowV2ToolLeaseIdentity,verifiedWorkflowV2ToolDispatch} from "../../src/workflow-v2-tool-dispatch.ts"
import {createWorkflowV2ModelInternalHandler} from "../../src/workflow-v2-model-handler.ts"
import {createWorkflowV2ToolInternalHandler} from "../../src/workflow-v2-tool-handler.ts"
import {workflowV2ModelEffectExecutor} from "../../src/workflow-v2-model-client.ts"
import {workflowV2ToolEffectExecutor} from "../../src/workflow-v2-tool-client.ts"
import {withDisposableBoundModelTls} from "./bound-model-loopback-tls.mjs"
export const issuer="https://synthetic-workflow-agent.invalid",alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
const sql=file=>readFileSync(new URL("../../../../db/postgres/"+file,import.meta.url),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
export async function agentFixture({autonomous=false,mcp=false,smithery=false}={}){
  const db=await PGlite.create({extensions:{vector}});await db.exec(sql("001_stage_schema.sql"))
  await db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_023','synthetic predecessor')")
  for(const migration of ["pg_v9_024_bound_dispatch_identity.sql","pg_v9_025_workflow_model_identity.sql","pg_v9_026_workflow_tool_identity.sql","pg_v9_027_workflow_agent_identity.sql",...(autonomous||mcp?["pg_v9_028_autonomous_agent_identity.sql"]:[]),...(mcp?["pg_v9_029_mcp_connections.sql","pg_v9_030_mcp_tool_identity.sql"]:[])])
    await db.exec(sql("migrations/"+migration))
  if(smithery){if(!mcp)throw Error("smithery_requires_mcp_fixture");await db.exec(sql("migrations/pg_v9_031_smithery_managed.sql"))}
  const users={};for(const subject of ["alice","bob"])users[subject]=(await db.query("INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES($1,$2) RETURNING id",[issuer,subject])).rows[0].id
  let tail=Promise.resolve(),fault,beforeDispatch
  const pool={async connect(){const before=tail;let release;tail=new Promise(resolve=>{release=resolve});await before
    return {async query(text,values=[]){fault?.(text,values);return db.query(text,values)},release}}}
  const key=Buffer.from("0123456789abcdef".repeat(4),"hex"),models=new ModelConnectionRepository(pool,key),agents=new AgentSpecRepository(pool)
  const bases=new KnowledgeBaseRepository(pool),resources={}
  for(const [who,identity] of [["alice",alice],["bob",bob]]){
    const saved=await models.create(identity,{name:who,provider:"openai",base_url:"https://api.openai.com/v1",api_key:"synthetic-"+who+"-model-key-never-network",models:["synthetic"],enabled:true})
    const model=await models.testConnection(identity,saved.id,saved.revision,async()=>({status:"ok",latency_ms:1,error_code:""}))
    const binding={connection_id:model.id,connection_revision:model.revision,model_id:"synthetic"}
    const kb=await bases.create(identity,who,"Synthetic private KB")
    await bases.createTextDocument(identity,kb.id,{filename:who+".txt",text:"synthetic evidence "+(who==="alice"?"OWN_CITATION":"FOREIGN_SECRET")})
    const spec=await agents.create(identity,who,safeAgentSpec({goal:"ROLE_PRIVATE_"+who,task_scope:"Synthetic only",deliverables:["Report"],done_criteria:["Evidence"],
      task_plan:[],tools:["calculate","summarize","knowledge_search","web_fetch","web_search"],knowledge_base_ids:[kb.id],model_binding:binding}))
    resources[who]={model,binding,kb,spec}
  }
  const flows=new WorkflowRepository(pool),runs=autonomous?new AutonomousAgentRunRepository(pool,{allowMcpExecution:mcp}):new WorkflowV2RunRepository(pool,"workflow_native_v2",{allowMcpExecution:mcp});let sequence=0
  async function make({nodeId="agent",maxSteps=3,input="synthetic Agent task",spec=resources.alice.spec,override}={}){
    if(autonomous)return runs.submit(alice,spec.id,{expected_revision:spec.revision,max_steps:maxSteps,idempotency_key:"synthetic-native-agent-"+(++sequence),instruction:input})
    const graph={version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
      {id:nodeId,type:"agent",data:{title:"AgentRole",agent_binding:{spec_id:spec.id,spec_revision:spec.revision},max_steps:maxSteps,
        ...(override?{model_binding:override}:{})},position:{x:100,y:0}},
      {id:"end",type:"end",data:{title:"End",output_template:"{{AgentRole.output}}"},position:{x:200,y:0}}],
      edges:[{id:"a",source:"start",target:nodeId},{id:"b",source:nodeId,target:"end"}]}
    const flow=await flows.create(alice,"synthetic Agent "+(++sequence),graph)
    return runs.submit(alice,flow.id,{expected_revision:flow.revision,idempotency_key:"synthetic-agent-"+sequence,instruction:input})
  }
  async function approve(id,decision="approved"){
    const pending=(await runs.get(alice,id)).pending_effect
    return runs.decide(alice,id,{decision,step_key:pending.step_key,input_sha256:pending.input_sha256})
  }
  async function privateTls(planning,run,{allowAgent=true,toolExecutor={}}={}){
    const model=new WorkflowV2ModelDispatch(pool,key,async()=>{throw Error("direct model fallback forbidden")},pool,
      {allowAgentExecution:!autonomous&&allowAgent,allowAutonomousExecution:autonomous&&allowAgent,agentExecutor:planning})
    const tool=new WorkflowV2ToolDispatch(pool,key,toolExecutor,pool,{allowAgentExecution:!autonomous&&allowAgent,allowAutonomousExecution:autonomous&&allowAgent})
    const modelIdentity=new WorkflowV2ModelLeaseIdentity(pool),toolIdentity=new WorkflowV2ToolLeaseIdentity(pool)
    const dispatch={model:verifiedWorkflowV2ModelDispatch(modelIdentity,model),tool:verifiedWorkflowV2ToolDispatch(toolIdentity,tool)}
    const factories=raw=>{
      const config={...raw,executionMode:autonomous?"agent_native_v2":"workflow_native_v2"}
      const m=createWorkflowV2ModelInternalHandler({...config,dispatch:async request=>{await beforeDispatch?.(request,"model");return dispatch.model(request)}})
      const t=createWorkflowV2ToolInternalHandler({...config,dispatch:async request=>{await beforeDispatch?.(request,"tool");return dispatch.tool(request)}})
      return (req,res)=>(req.url==="/__internal/v2/workflow-tool/dispatch"?t:m)(req,res)
    }
    return withDisposableBoundModelTls(dispatch,async config=>{
      let workers=0
      const makeWorker=(options={})=>{
        const adapters=[workflowV2ModelEffectExecutor(config),workflowV2ToolEffectExecutor(config)]
        return new WorkflowV2Worker(pool,"synthetic-agent-"+(++workers),{executionMode:autonomous?"agent_native_v2":"workflow_native_v2",agentExecutionApproved:true,executor:{supports:req=>adapters.some(adapter=>adapter.supports(req)),
          execute(request,lease){return adapters.find(adapter=>adapter.supports(request)).execute(request,lease)}},...options})
      }
      return run(makeWorker,{model,tool,modelIdentity,toolIdentity,config})
    },{handlerFactory:factories})
  }
  async function drive(makeWorker,id,choose=()=>"approved"){
    for(let i=0;i<60;i++){
      await makeWorker().tick();const detail=await runs.get(alice,id)
      if(detail.run.status==="awaiting_approval")await approve(id,await choose(detail.pending_effect,detail))
      else if(["succeeded","failed","paused","cancelled"].includes(detail.run.status))return detail
    }throw Error("synthetic Agent did not settle")
  }
  return {db,pool,resources,users,models,agents,flows,runs,make,approve,privateTls,drive,
    setFault:fn=>{fault=fn},setBeforeDispatch:fn=>{beforeDispatch=fn},sql,async close(){await db.close();key.fill(0)}}
}
