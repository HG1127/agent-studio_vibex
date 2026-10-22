import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativePilotApi} from "../src/lib/pgNativePilotApi.ts"
import {autonomousApprovalReady,autonomousReview} from "../src/lib/pgNativeAutonomousAgentSession.ts"
import {workflowApprovalReady} from "../src/lib/pgNativeWorkflowRunSession.ts"
import {declaredAgentHttpTool,readyAgentHttpTools} from "../src/lib/pgNativeAgentHttpTools.ts"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const agentId="11111111-1111-4111-8111-111111111111",toolId="22222222-2222-4222-8222-222222222222",modelId="33333333-3333-4333-8333-333333333333"
const http={name:"http_lookup",description:"Lookup; params: query",connection_id:toolId,connection_revision:2}
const binding={connection_id:modelId,connection_revision:1,model_id:"synthetic"}
const role={id:agentId,revision:3,name:"Own role",spec:{goal:"Own goal",task_scope:"Own scope",tools:["calculate",http.name],http_tools:[http],
  knowledge_base_ids:[],deliverables:["Report"],task_plan:["Verify"],done_criteria:["Cited"],model_binding:binding}}
const model={id:modelId,revision:1,name:"Own model",provider:"openai",base_url:"https://api.openai.com/v1",enabled:true,status:"ok",models:["synthetic"]}
const tool={id:toolId,revision:2,name:"Own HTTP",description:"Own purpose",enabled:true,url:"https://tools.example.com/lookup",method:"POST"}
const ref={connection_id:toolId,connection_revision:2}
const pending={step_key:"wf2_00002_agent_a01t",input_sha256:"a".repeat(64),node_id:"agent",kind:"tool",input:'{"query":"Own task"}',
  configuration:{title:http.name,tool_binding:ref,params_template:'{"query":"Own task"}'},missing:[],agent_context:{parent_step_key:"wf2_00002_agent",round:1,phase:"tool"}}
const detail={run:{id:"44444444-4444-4444-8444-444444444444",kind:"agent",agent_spec_id:agentId,status:"awaiting_approval",instruction:"Own task",
  checkpoint:{spec_revision:3,max_steps:3},result_text:""},pending_effect:pending,steps:[],approvals:[],execution_mode:"agent_native_v2",replayed:false}
test("HTTP tool edits and other Agent edits preserve independent fields, validate before network and refuse stale revisions",async()=>{
  const calls=[]
  const api=createPgNativePilotApi(async(url,options)=>{
    calls.push({url,options})
    return Response.json({item:options.method==="GET"?role:{...role,revision:4,spec:JSON.parse(options.body).spec}})
  },"")
  const replace={...http,name:"http_new",connection_revision:3}
  const result=await api.updateAgentHttpTools(agentId,3,[replace])
  assert.deepEqual(result.spec.tools,["calculate","http_new"]);assert.deepEqual(result.spec.http_tools,[replace])
  for(const key of ["goal","task_scope","knowledge_base_ids","deliverables","task_plan","done_criteria","model_binding"])assert.deepEqual(result.spec[key],role.spec[key])
  const patch=calls.at(-1).options
  assert.equal(patch.credentials,"same-origin");assert.equal(patch.headers["X-AgentStudio-Request"],"1");assert.equal(JSON.parse(patch.body).expected_revision,3)
  const removed=await api.updateAgentHttpTools(agentId,3,[])
  assert.equal(removed.spec.http_tools,undefined);assert.deepEqual(removed.spec.tools,["calculate"])
  for(const action of [()=>api.updateAgent(agentId,3,"New name","New goal"),()=>api.bindAgentModel(agentId,3,null),()=>api.updateAgentKnowledgeBases(agentId,3,[])]){
    const updated=await action();assert.deepEqual(updated.spec.http_tools,[http]);assert.equal(updated.spec.tools.includes(http.name),true)
  }
  const before=calls.length
  for(const selection of [[{...http,headers:[]}],[{...http,connection_revision:0}],[http,http]])
    await assert.rejects(api.updateAgentHttpTools(agentId,3,selection),error=>error.status===400)
  assert.equal(calls.length,before)
  await assert.rejects(api.updateAgentHttpTools(agentId,2,[http]),error=>error.status===409)
  assert.equal(calls.at(-1).options.method,"GET")
})
test("both Agent review paths require exact declared HTTP reference and current owner connection metadata",()=>{
  assert.equal(declaredAgentHttpTool(role,ref)?.name,http.name)
  assert.equal(readyAgentHttpTools(role,[tool]),true)
  assert.equal(autonomousApprovalReady(detail,[role],[model],[tool]),true)
  for(const tools of [[],[{...tool,enabled:false}],[{...tool,revision:3}]])assert.equal(autonomousApprovalReady(detail,[role],[model],tools),false)
  for(const configuration of [{...pending.configuration,tool:"calculate"},{...pending.configuration,tool_binding:{...ref,connection_revision:3}}])
    assert.equal(autonomousApprovalReady({...detail,pending_effect:{...pending,configuration}},[role],[model],[tool]),false)
  assert.equal(autonomousApprovalReady(detail,[{...role,spec:{...role.spec,tools:[]}}],[model],[tool]),false)
  const node=(id,type,data)=>({id,type,data:{title:id,...data},position:{x:0,y:0}})
  const flow={id:"55555555-5555-4555-8555-555555555555",revision:1,graph:{version:2,
    nodes:[node("start","start"),node("agent","agent",{agent_binding:{spec_id:agentId,spec_revision:3},max_steps:3}),node("end","end")],
    edges:[{id:"a",source:"start",target:"agent"},{id:"b",source:"agent",target:"end"}]}}
  const workflow={...detail,run:{...detail.run,workflow_id:flow.id,checkpoint:{workflow_revision:1}},review:{workflow:flow,agent:role,tool,unavailable:false}}
  assert.equal(workflowApprovalReady(workflow),true)
  assert.equal(workflowApprovalReady({...workflow,review:{...workflow.review,tool:{...tool,revision:3}}}),false)
  assert.equal(workflowApprovalReady({...workflow,review:{...workflow.review,agent:{...role,spec:{...role.spec,http_tools:[]}}}}),false)
  assert.match(autonomousReview(pending).text,/http_lookup/)
})
test("static Tool editor and HTTP approval escape metadata and keep consent explicit",async()=>{
  const server=await createServer({configFile:false,envFile:false,root,mode:"test",plugins:[react()],
    cacheDir:path.join(root,".tmp/pg-migration-completion/agent-http-ssr-cache"),resolve:{alias:{"@":path.join(root,"src")}},
    optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,hmr:false,watch:null}})
  try{
    const [{AgentToolsForm},{default:Detail}]=await Promise.all([
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeAgentHttpToolsPanel.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx")])
    const malicious={...tool,name:"<script>untrusted</script>"},noop=()=>{}
    const form=renderToStaticMarkup(createElement(AgentToolsForm,{api:{},agent:role,connections:[malicious],enabled:false,onSaved:async()=>{},onExpired:noop,onBusy:noop,onReset:noop}))
    assert.match(form,/<fieldset disabled=""/);assert.match(form,/&lt;script&gt;untrusted&lt;\/script&gt;/);assert.equal(form.includes("<script>"),false)
    assert.match(form,/用途与参数/);assert.match(form,/保存 HTTP 工具绑定/)
    const markup=renderToStaticMarkup(createElement(Detail,{agents:[role],connections:[model],toolConnections:[malicious],enabled:true,
      view:{detail,busy:false,loading:false,pendingSubmit:null,pendingMutation:null},onDecision:noop,onRetry:noop,onCancel:noop}))
    assert.match(markup,/HTTP 连接/);assert.match(markup,/POST/);assert.match(markup,/tools.example.com/)
    assert.match(markup,/<button[^>]*disabled=""[^>]*>批准当前步骤<\/button>/);assert.equal(markup.includes("<script>"),false)
  }finally{await server.close()}
})
