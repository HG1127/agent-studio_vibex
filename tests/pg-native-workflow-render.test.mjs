// Static SSR contract checks; these do not claim browser acceptance.
import test from "node:test"
import assert from "node:assert/strict"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {newPgWorkflowGraph,addPgWorkflowNode} from "../src/lib/pgNativeWorkflowGraph.ts"
import {emptyWorkflowRunView} from "../src/lib/pgNativeWorkflowRunSession.ts"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const flow="11111111-1111-4111-8111-111111111111",connection="22222222-2222-4222-8222-222222222222",run="33333333-3333-4333-8333-333333333333"

test("static Workflow forms cover seven native types and retain fail-closed review and escaped external text",async()=>{
  const server=await createServer({configFile:false,envFile:false,root,mode:"test",plugins:[react()],
    cacheDir:path.join(root,".tmp/pg-migration-completion/workflow-ssr-cache"),resolve:{alias:{"@":path.join(root,"src")}},
    optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},
    server:{middlewareMode:true,host:"127.0.0.1",hmr:{host:"127.0.0.1",port:0},watch:null}})
  try{
    const [{default:Form},{default:Workspace},{default:Detail},{default:Preview},{default:Tools},{default:Debug},{WorkflowOutputSnapshot:Output},{default:Source}]=await Promise.all([
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowNodeForm.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowWorkspace.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowRunDetail.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowNodePreview.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowAuthoringTools.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowModelDebugPanel.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowRunOutputs.tsx"),
      server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowSampleSource.tsx"),
    ])
    let graph=newPgWorkflowGraph();const noop=()=>{}
    const resources={agents:[],models:[],tools:[],bases:[]}
    const expected={start:"输入提示",end:"结果模板",model:"绑定模型",agent:"Agent 方案",tool:"工具参数模板",condition:"条件规则",loop:"循环方式"}
    for(const [type,label] of Object.entries(expected)){
      const node=type==="start"?graph.nodes[0]:addPgWorkflowNode(graph,type).nodes.findLast(node=>node.type===type)
      const markup=renderToStaticMarkup(createElement(Form,{node,nodes:[node],...resources,enabled:false,onApply:noop,onDirty:noop}))
      assert.ok(markup.includes(label),type+" should expose "+label)
      assert.match(markup,/<fieldset disabled=""/)
    }
    const blocked=renderToStaticMarkup(createElement(Workspace,{...resources,api:{},workflows:[],active:true,writeEnabled:false,executionEnabled:false,onExpired:noop,onSaved:async()=>{},onRun:noop}))
    assert.match(blocked,/当前环境只允许查看工作流/)
    assert.match(blocked,/<input[^>]*aria-label="新工作流名称"[^>]*disabled=""/)
    assert.match(blocked,/<input[^>]*aria-label="导入 Workflow JSON"[^>]*disabled=""/)
    const tools=renderToStaticMarkup(createElement(Tools,{graph,name:"Synthetic",selected:0,clipboard:0,readEnabled:false,editEnabled:false}))
    assert.match(tools,/手写在文本中的凭据不会被自动识别/)
    assert.match(tools,/<button[^>]*disabled=""[^>]*>导出可移植 Workflow JSON<\/button>/)
    const debug=renderToStaticMarkup(createElement(Debug,{api:{},draft:{workflowId:flow,revision:1,nodeId:"node",samples:{input:"Own task",outputs:{}}},active:true,enabled:false,onExpired:noop}))
    assert.match(debug,/当前环境未开放单模型节点测试及审批/)
    assert.match(debug,/<button[^>]*disabled=""[^>]*>提交单模型节点测试<\/button>/)
    const model={id:connection,revision:1,name:"Own model",provider:"openai",base_url:"https://api.openai.com/v1",enabled:true,status:"ok",models:["synthetic"]}
    const binding={connection_id:connection,connection_revision:1,model_id:"synthetic"}
    graph=addPgWorkflowNode(graph,"model",graph.edges[0].id)
    const modelNode=graph.nodes.find(node=>node.type==="model");modelNode.data={title:"Model",prompt:"Own task",model_binding:binding}
    const untrustedNode={...modelNode,data:{...modelNode.data,prompt:'<script>untrusted</script> {{Missing.output}}'}}
    const preview=renderToStaticMarkup(createElement(Preview,{node:untrustedNode,graph:{...graph,nodes:graph.nodes.map(node=>node.id===modelNode.id?untrustedNode:node)},workflowId:flow,revision:1,canDebug:true,onPrepare:noop}))
    assert.match(preview,/&lt;script&gt;untrusted&lt;\/script&gt;/);assert.equal(preview.includes("<script>"),false)
    assert.match(preview,/<button[^>]*disabled=""[^>]*>准备单模型测试<\/button>/)
    const snapshot={format:"workflow_v2_outputs_v1",kind:"latest",run:{run_id:run,workflow_id:flow,workflow_revision:1,graph_sha256:"a".repeat(64),output_version:"b".repeat(64),status:"succeeded",instruction:"HISTORICAL_TASK_NOT_AUTOMATIC",updated_at:"2026-10-23",max_output_chars:4000},
      nodes:graph.nodes.map(node=>({node_id:node.id,title:node.data.title,node_type:node.type,node_status:"done",output_text:'<script>business output</script>',private_planner:"PRIVATE_INTERNAL_PLAN"}))}
    const output=renderToStaticMarkup(createElement(Output,{latest:snapshot,history:[],historyLoaded:false,total:0,nextAfter:null,historyBusy:false,active:true,onHistory:noop}))
    assert.match(output,/&lt;script&gt;business output&lt;\/script&gt;/);assert.equal(output.includes("<script>"),false);assert.equal(output.includes("PRIVATE_INTERNAL_PLAN"),false)
    const clean={...snapshot,nodes:snapshot.nodes.map(({private_planner,...node})=>node)}
    const sampleNode={...modelNode,data:{...modelNode.data,prompt:"{{input}}"}},sampleGraph={...graph,nodes:graph.nodes.map(node=>node.id===modelNode.id?sampleNode:node)}
    const optIn=renderToStaticMarkup(createElement(Preview,{node:sampleNode,graph:sampleGraph,workflowId:flow,revision:1,canDebug:true,history:clean,onPrepare:noop}))
    assert.match(optIn,/使用所选历史运行样本/);assert.equal(optIn.includes("HISTORICAL_TASK_NOT_AUTOMATIC"),false)
    assert.match(optIn,/<button[^>]*disabled=""[^>]*>准备单模型测试<\/button>/)
    const inactiveSource=renderToStaticMarkup(createElement(Source,{api:{},workflowId:flow,active:false,onExpired:noop,onSnapshot:noop}))
    assert.match(inactiveSource,/<button[^>]*disabled=""[^>]*>读取本人近期运行（最多30条）<\/button>/)
    const pending={step_key:"wf2_00001_model",node_id:modelNode.id,input_sha256:"a".repeat(64),kind:"model",input:"Own <script>task</script>",configuration:{title:"Model",model_binding:binding},missing:[]}
    const detail={run:{id:run,kind:"workflow",workflow_id:flow,status:"awaiting_approval",instruction:"Own task",checkpoint:{workflow_revision:1},step_count:0,updated_at:"synthetic",result_text:""},pending_effect:pending,approvals:[],steps:[],execution_mode:"workflow_native_v2",replayed:false,
      review:{workflow:{id:flow,revision:1,name:"Own flow",graph},model,unavailable:false}}
    const render=(value,enabled=true,change={})=>renderToStaticMarkup(createElement(Detail,{api:{},active:true,enabled,onDecision:noop,onRetry:noop,onCancel:noop,onExpired:noop,view:{...emptyWorkflowRunView,detail:value,...change}}))
    const review=render(detail)
    assert.match(review,/确认可能产生费用/);assert.match(review,/&lt;script&gt;task&lt;\/script&gt;/);assert.equal(review.includes("<script>"),false)
    assert.match(review,/<button[^>]*disabled=""[^>]*>批准工作流当前步骤<\/button>/)
    assert.match(render(detail,false),/当前环境未开放工作流审批/)
    const tool={...detail,pending_effect:{...pending,kind:"tool",input:JSON.stringify({value:"<img src=x onerror=alert(1)>"}),configuration:{tool_binding:{connection_id:connection,connection_revision:1}}}}
    assert.match(render(tool),/&lt;img/);assert.equal(render(tool).includes("<img"),false)
    const agent={...detail,pending_effect:{...pending,agent_context:{round:1,phase:"model"},input:JSON.stringify({task:"Visible task",think:"PRIVATE_REASONING",note:"PRIVATE_NOTE"})}}
    const agentHtml=render(agent);assert.match(agentHtml,/Visible task/);assert.equal(agentHtml.includes("PRIVATE_REASONING"),false);assert.equal(agentHtml.includes("PRIVATE_NOTE"),false)
    const recovery=render(detail,true,{pendingMutation:{kind:"decision",id:run,decision:"approved",step:pending.step_key,hash:pending.input_sha256}})
    assert.match(recovery,/确认上次批准/);assert.equal(recovery.includes("批准工作流当前步骤"),false)
  }finally{await server.close()}
})
