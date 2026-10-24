import test from "node:test"
import assert from "node:assert/strict"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createPgNativePilotApi} from "../src/lib/pgNativePilotApi.ts"
const id="11111111-1111-4111-8111-111111111111",base="22222222-2222-4222-8222-222222222222",missing="33333333-3333-4333-8333-333333333333"
const agent=()=>({id,name:"Reader",revision:4,spec:{goal:"Synthetic goal",task_scope:"Scoped",deliverables:[],done_criteria:[],task_plan:[],tools:["knowledge_search","http_demo","mcp_demo"],knowledge_base_ids:[base],model_binding:{connection_id:missing,connection_revision:1,model_id:"synthetic"},http_tools:[{name:"http_demo",connection_id:missing,connection_revision:1,description:"Own HTTP"}],mcp_tools:[{name:"mcp_demo",connection_id:missing,connection_revision:1,tool_name:"read",description:"Own MCP",catalog_sha256:"a".repeat(64),schema_sha256:"b".repeat(64)}],require_approval:true}})
test("knowledge binding keeps the reader's model and tools, and a stale configuration cannot issue PATCH",async()=>{
  const saved=agent();let payload,patches=0
  const api=createPgNativePilotApi(async(_url,options)=>{
    if(options.method==="PATCH"){patches++;payload=JSON.parse(options.body);return Response.json({item:{...saved,revision:5,spec:payload.spec}})}
    return Response.json({item:saved})
  },"")
  await api.updateAgentKnowledgeBases(id,4,[missing])
  assert.deepEqual(payload.spec.model_binding,saved.spec.model_binding)
  assert.deepEqual(payload.spec.http_tools,saved.spec.http_tools);assert.deepEqual(payload.spec.mcp_tools,saved.spec.mcp_tools)
  assert.equal(Object.hasOwn(payload.spec,"require_approval"),false)
  assert.deepEqual(payload.spec.knowledge_base_ids,[missing])
  await assert.rejects(api.updateAgentKnowledgeBases(id,3,[base]),error=>error.status===409)
  assert.equal(patches,1)
})
test("employee binding forms show escaped shared labels, removable unavailable refs and disabled writes while inactive",async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
  const server=await createServer({configFile:false,envFile:false,root,mode:"test",plugins:[react()],cacheDir:path.join(root,".tmp/pg-migration-completion/knowledge-runtime-ssr-cache"),resolve:{alias:{"@":path.join(root,"src")}},optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,host:"127.0.0.1",hmr:{host:"127.0.0.1",port:0},watch:null}})
  try{
    const [{AgentKnowledgeForm:Form},{default:NodeForm}]=await Promise.all([server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeAgentKnowledgePanel.tsx"),server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeWorkflowNodeForm.tsx")])
    const row=agent();row.spec.knowledge_base_ids=[base,missing]
    const bases=[{id:base,name:"<script>foreign()</script> · Owner共享 · 可查看",revision:1,description:""}],noop=()=>{}
    const markup=renderToStaticMarkup(createElement(Form,{api:{},agent:row,bases,active:false,enabled:true,onSaved:async()=>{},onExpired:noop,onBusy:noop}))
    assert.match(markup,/&lt;script&gt;foreign\(\)&lt;\/script&gt;/);assert.doesNotMatch(markup,/<script>/)
    assert.match(markup,/不可用知识库/);assert.match(markup,/<fieldset disabled=""/)
    assert.match(markup,/<button[^>]*disabled=""[^>]*>保存知识库绑定/)
    const node={id:"kb",type:"tool",position:{x:0,y:0},data:{title:"KB",tool:"knowledge_search",knowledge_base_ids:[missing],params_template:'{"query":"cedar"}'}}
    const workflow=renderToStaticMarkup(createElement(NodeForm,{node,nodes:[node],agents:[],models:[],tools:[],bases,enabled:true,onApply:noop,onDirty:noop}))
    assert.match(workflow,/不可用知识库/);assert.match(workflow,/aria-label="不可用知识库 /)
  }finally{await server.close()}
})
