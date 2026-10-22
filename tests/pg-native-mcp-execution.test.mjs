import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativePilotApi} from "../src/lib/pgNativePilotApi.ts"
import {readyMcpBinding,readyAgentMcpTools,mcpChoices} from "../src/lib/pgNativeMcpConnection.ts"
import {autonomousApprovalReady,autonomousReview} from "../src/lib/pgNativeAutonomousAgentSession.ts"
import {workflowApprovalReady} from "../src/lib/pgNativeWorkflowRunSession.ts"
import {parseWorkflowGraphV2} from "../services/pg-api/src/workflow-graph-v2.ts"
import {exportPgWorkflowJson,importPgWorkflowJson,selectedPgWorkflowFragment,pastePgWorkflowFragment} from "../src/lib/pgNativeWorkflowTransfer.ts"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const agentId="11111111-1111-4111-8111-111111111111",mcpId="22222222-2222-4222-8222-222222222222",modelId="33333333-3333-4333-8333-333333333333"
const ref={connection_id:mcpId,connection_revision:2,tool_name:"lookup",catalog_sha256:"b".repeat(64)},mcp={name:"mcp_lookup",...ref}
const http={name:"http_lookup",description:"Own lookup",connection_id:"66666666-6666-4666-8666-666666666666",connection_revision:1}
const modelBinding={connection_id:modelId,connection_revision:1,model_id:"synthetic"}
const role={id:agentId,revision:3,name:"Own role",spec:{goal:"Own goal",task_scope:"Own scope",tools:["calculate",http.name,mcp.name],http_tools:[http],mcp_tools:[mcp],
  knowledge_base_ids:[],deliverables:["Report"],task_plan:["Verify"],done_criteria:["Cited"],model_binding:modelBinding}}
const model={id:modelId,revision:1,name:"Own model",provider:"openai",base_url:"https://api.openai.com/v1",enabled:true,status:"ok",models:["synthetic"]}
const connection={id:mcpId,revision:2,name:"Own MCP",description:"Own purpose",enabled:true,url:"https://mcp.example.com/rpc",status:"ok",headers:[],last_error:"",last_checked_at:null,
  catalog_sha256:ref.catalog_sha256,catalog:{version:"2026-07-28",tools:[{name:"lookup",description:"Lookup",input_schema:{type:"object"},read_only:true,destructive:false,requires_tasks:false}]}}
const pending={step_key:"wf2_00002_agent_a01t",input_sha256:"a".repeat(64),node_id:"agent",kind:"tool",input:'{"query":"Own task"}',
  configuration:{title:mcp.name,mcp_binding:ref,params_template:'{"query":"Own task"}'},missing:[],agent_context:{parent_step_key:"wf2_00002_agent",round:1,phase:"tool"}}
const detail={run:{id:"44444444-4444-4444-8444-444444444444",kind:"agent",agent_spec_id:agentId,status:"awaiting_approval",instruction:"Own task",
  checkpoint:{spec_revision:3,max_steps:3},result_text:""},pending_effect:pending,steps:[],approvals:[],execution_mode:"agent_native_v2",replayed:false}
const node=(id,type,data={})=>({id,type,data:{title:id,...data},position:{x:0,y:0}})
const graph={version:2,nodes:[node("start","start"),node("tool","tool",{mcp_binding:ref,params_template:"{}"}),node("end","end")],
  edges:[{id:"a",source:"start",target:"tool"},{id:"b",source:"tool",target:"end"}]}

test("MCP edits preserve HTTP/model/knowledge/goal fields and validate exact references before HTTP",async()=>{
  const calls=[],api=createPgNativePilotApi(async(url,options)=>{calls.push({url,options});return Response.json({item:options.method==="GET"?role:{...role,revision:4,spec:JSON.parse(options.body).spec}})},"")
  const replacement={...mcp,name:"mcp_new",connection_revision:3},result=await api.updateAgentMcpTools(agentId,3,[replacement])
  assert.deepEqual(result.spec.tools,["calculate",http.name,replacement.name]);assert.deepEqual(result.spec.mcp_tools,[replacement])
  for(const key of ["goal","task_scope","knowledge_base_ids","http_tools","deliverables","task_plan","done_criteria","model_binding"])assert.deepEqual(result.spec[key],role.spec[key])
  assert.equal(calls.at(-1).options.credentials,"same-origin");assert.equal(JSON.parse(calls.at(-1).options.body).expected_revision,3)
  for(const action of [()=>api.updateAgent(agentId,3,"Name","Goal"),()=>api.bindAgentModel(agentId,3,null),()=>api.updateAgentKnowledgeBases(agentId,3,[]),()=>api.updateAgentHttpTools(agentId,3,[])])
    assert.deepEqual((await action()).spec.mcp_tools,[mcp])
  const before=calls.length
  for(const invalid of [[{...mcp,url:"https://override.example"}],[{...mcp,catalog_sha256:"bad"}],[mcp,mcp]])await assert.rejects(api.updateAgentMcpTools(agentId,3,invalid),error=>error.status===400)
  assert.equal(calls.length,before)
  await assert.rejects(api.updateAgentMcpTools(agentId,2,[mcp]),error=>error.status===409)
  const removed=await api.updateAgentMcpTools(agentId,3,[]);assert.equal(removed.spec.mcp_tools,undefined);assert.deepEqual(removed.spec.tools,["calculate",http.name])
})

test("direct and Agent MCP approvals pin grant, catalog hash, owner metadata and declared tool",()=>{
  const ownRole={...role,spec:{...role.spec,tools:[mcp.name],http_tools:undefined}}
  assert.equal(readyMcpBinding(ref,connection),true);assert.equal(readyAgentMcpTools(ownRole,[connection]),true)
  assert.equal(autonomousApprovalReady(detail,[ownRole],[model],[],[connection],true),true)
  for(const rows of [[],[{...connection,enabled:false}],[{...connection,revision:3}],[{...connection,catalog_sha256:"c".repeat(64)}]])
    assert.equal(autonomousApprovalReady(detail,[ownRole],[model],[],rows,true),false)
  assert.equal(autonomousApprovalReady(detail,[ownRole],[model],[],[connection],false),false)
  assert.equal(autonomousApprovalReady({...detail,pending_effect:{...pending,configuration:{...pending.configuration,tool:"calculate"}}},[ownRole],[model],[],[connection],true),false)
  assert.equal(mcpChoices([connection]).length,1);assert.equal(mcpChoices([{...connection,catalog:{...connection.catalog,tools:[{...connection.catalog.tools[0],requires_tasks:true}]}}]).length,0)
  const flow={id:"55555555-5555-4555-8555-555555555555",revision:1,graph}
  const direct={...detail,run:{...detail.run,kind:"workflow",workflow_id:flow.id,checkpoint:{workflow_revision:1}},pending_effect:{...pending,node_id:"tool",agent_context:undefined},
    review:{workflow:flow,mcp:connection,mcpEnabled:true,unavailable:false}}
  assert.equal(workflowApprovalReady(direct),true)
  assert.equal(workflowApprovalReady({...direct,review:{...direct.review,mcpEnabled:false}}),false)
  const agentFlow={...flow,graph:{...graph,nodes:[node("start","start"),node("agent","agent",{agent_binding:{spec_id:agentId,spec_revision:3},max_steps:3}),node("end","end")],
    edges:[{id:"a",source:"start",target:"agent"},{id:"b",source:"agent",target:"end"}]}}
  const agentDetail={...direct,pending_effect:pending,review:{...direct.review,workflow:agentFlow,agent:ownRole,mcpConnections:[connection]}}
  assert.equal(workflowApprovalReady(agentDetail),true)
  assert.equal(workflowApprovalReady({...agentDetail,review:{...agentDetail.review,mcpConnections:[]}}),false)
  assert.match(autonomousReview(pending).text,/lookup/);assert.equal(autonomousReview(pending).charged,false)
})

test("MCP workflow transfer removes employee bindings; same-owner local copy retains the frozen reference",()=>{
  assert.deepEqual(parseWorkflowGraphV2(graph).nodes[1].data.mcp_binding,ref)
  const exported=exportPgWorkflowJson("Own",graph)
  assert.equal(exported.includes(mcpId),false);assert.equal(exported.includes(ref.catalog_sha256),false)
  let serial=0;const imported=importPgWorkflowJson(exported,()=>String(++serial))
  assert.equal(imported.graph.nodes[1].data.mcp_binding,undefined);assert.equal(imported.graph.nodes[1].data.tool_binding_required,true)
  const pasted=pastePgWorkflowFragment(graph,selectedPgWorkflowFragment(graph,["tool"]),()=>String(++serial))
  assert.deepEqual(pasted.graph.nodes.at(-1).data.mcp_binding,ref)
})

test("MCP choice and approval rendering escapes metadata and keeps consent disabled for stale or closed grants",async()=>{
  const server=await createServer({configFile:false,envFile:false,root,mode:"test",plugins:[react()],cacheDir:path.join(root,".tmp/pg-migration-completion/mcp-execution-ssr-cache"),
    resolve:{alias:{"@":path.join(root,"src")}},optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,hmr:false,watch:null}})
  try{
    const [{AgentMcpForm},{default:Detail},{default:NodeForm}]=await Promise.all([server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeAgentMcpToolsPanel.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx"),server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowNodeForm.tsx")])
    const malicious={...connection,name:"<script>untrusted</script>"},noop=()=>{}
    const form=renderToStaticMarkup(createElement(AgentMcpForm,{api:{},role,connections:[malicious],enabled:false,onSaved:async()=>{},onExpired:noop,onBusy:noop,onReset:noop}))
    assert.match(form,/<fieldset disabled=""/);assert.match(form,/&lt;script&gt;untrusted&lt;\/script&gt;/);assert.equal(form.includes("<script>"),false)
    const editor=renderToStaticMarkup(createElement(NodeForm,{node:graph.nodes[1],nodes:graph.nodes,agents:[],models:[],tools:[],bases:[],mcps:[malicious],enabled:false,onApply:noop,onDirty:noop}))
    assert.match(editor,/&lt;script&gt;untrusted&lt;\/script&gt;/);assert.equal(editor.includes("<script>"),false)
    const markup=renderToStaticMarkup(createElement(Detail,{agents:[role],connections:[model],mcpConnections:[malicious],mcpEnabled:false,enabled:true,
      view:{detail,busy:false,loading:false,pendingSubmit:null,pendingMutation:null},onDecision:noop,onRetry:noop,onCancel:noop}))
    assert.match(markup,/MCP 连接/);assert.match(markup,/mcp.example.com/);assert.match(markup,/<button[^>]*disabled=""[^>]*>批准当前步骤<\/button>/);assert.equal(markup.includes("<script>"),false)
  }finally{await server.close()}
})
