import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativePilotApi,PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
import {createPgNativeMcpSession} from "../src/lib/pgNativeMcpSession.ts"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),id="11111111-1111-4111-8111-111111111111"
const input={name:"Own MCP",description:"Synthetic tools",url:"https://mcp.example.com/server",enabled:true,headers:[{key:"Authorization",value:"synthetic-private-header"}]}
const row={...input,id,revision:1,status:"untested",catalog:null,headers:[{key:"authorization",value:"••••"}],last_error:"",last_checked_at:null}
test("MCP client uses fixed owner routes, request UUID, revision/CSRF and rejects unsafe public DTOs",async()=>{
  const calls=[]
  const api=createPgNativePilotApi(async(url,options)=>{
    calls.push({url,options})
    return Response.json(url.endsWith("mcp-connections")&&options.method==="GET"?{items:[row]}:{item:row,ok:true})
  },"")
  assert.deepEqual(await api.listMcpConnections(),[row]);assert.deepEqual(await api.createMcpConnection(input,id),row)
  assert.equal(JSON.parse(calls.at(-1).options.body).request_id,id)
  await api.updateMcpConnection(id,1,input);await api.discoverMcpConnection(id,1);await api.deleteMcpConnection(id,1)
  for(const call of calls){assert.equal(call.options.credentials,"same-origin");assert.equal(call.options.redirect,"error")
    if(call.options.method!=="GET")assert.equal(call.options.headers["X-AgentStudio-Request"],"1")}
  assert.equal(JSON.parse(calls.at(-1).options.body).expected_revision,1)
  const count=calls.length
  await assert.rejects(api.getMcpConnection("../other"),error=>error.status===400)
  await assert.rejects(api.createMcpConnection(input,"bad"),error=>error.status===400)
  await assert.rejects(api.discoverMcpConnection(id,0),error=>error.status===400);assert.equal(calls.length,count)
  const bad=createPgNativePilotApi(async()=>Response.json({item:{...row,headers:[{key:"authorization",value:"plaintext"}]}}),"")
  await assert.rejects(bad.getMcpConnection(id),error=>error.status===503)
})
test("uncertain MCP create retains a frozen UUID/body, cannot duplicate writes and never exposes pending headers in view state",async()=>{
  const calls=[];let attempts=0
  const api={async createMcpConnection(body,uuid){calls.push(structuredClone({body,uuid}));if(!attempts++)throw new PgNativePilotError(0,"lost");return row},
    async getMcpConnection(){throw new PgNativePilotError(404,"absent")},async listMcpConnections(){return [row]}}
  const model=createPgNativeMcpSession(api,{uuid:()=>id}),draft=structuredClone(input)
  await model.save(null,draft);draft.headers[0].value="Changed after submission"
  assert.equal(model.snapshot().pending.kind,"create");assert.equal(JSON.stringify(model.snapshot()).includes(input.headers[0].value),false)
  await model.save(null,{...input,name:"Different"});assert.equal(calls.length,1)
  await model.reconcile();assert.equal(model.snapshot().canRetryCreate,true)
  await model.retryCreate();assert.deepEqual(calls[0],calls[1]);assert.equal(model.snapshot().pending,null)
  assert.equal(model.snapshot().items.length,1);model.dispose();assert.equal(model.snapshot().items.length,0)
})
test("MCP read recovery, known denials, disposal and session expiry fence private state",async()=>{
  let expired=0,finish
  const api={async updateMcpConnection(){throw new PgNativePilotError(0,"lost")},async getMcpConnection(){return {...row,revision:2}},
    async discoverMcpConnection(){throw new PgNativePilotError(429,"slow")},async listMcpConnections(){throw new PgNativePilotError(401,"expired")}}
  const model=createPgNativeMcpSession(api,{onExpired:()=>expired++})
  await model.save(row,input);assert.ok(model.snapshot().pending)
  await model.reconcile();assert.equal(model.snapshot().pending,null);assert.equal(model.snapshot().items[0].revision,2)
  await model.discover(row);assert.equal(model.snapshot().pending,null)
  await model.refresh();assert.equal(expired,1);assert.deepEqual(model.snapshot().items,[])
  const second=createPgNativeMcpSession({listMcpConnections:()=>new Promise(resolve=>{finish=resolve})})
  const read=second.refresh();second.dispose();finish([row]);await read;assert.deepEqual(second.snapshot().items,[])
})
test("static MCP forms and catalog escape remote metadata, mask headers and keep discovery separate",async()=>{
  const server=await createServer({configFile:false,envFile:false,root,mode:"test",plugins:[react()],
    cacheDir:path.join(root,".tmp/pg-migration-completion/mcp-ssr-cache"),resolve:{alias:{"@":path.join(root,"src")}},
    optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,hmr:false,watch:null}})
  try{
    const {default:Panel,McpConnectionForm:Form,McpToolCatalog:Catalog}=await server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeMcpConnectionsPanel.tsx")
    const blocked=renderToStaticMarkup(createElement(Panel,{api:{},enabled:false,discoveryEnabled:false,onExpired:()=>{}}))
    assert.match(blocked,/当前环境未开放 MCP 配置保存/);assert.match(blocked,/<fieldset disabled=""/)
    assert.match(blocked,/Agent 中的 MCP 调用尚未开放/)
    const markup=renderToStaticMarkup(createElement(Form,{row,enabled:true,onSave:()=>{}}))
    assert.match(markup,/留空保留原值/);assert.equal(markup.includes(input.headers[0].value),false)
    assert.match(markup,/type="password"/)
    const catalog=renderToStaticMarkup(createElement(Catalog,{row:{...row,status:"ok",catalog:{version:"2026-07-28",tools:[{
      name:"<script>remote</script>",description:"Remote description",input_schema:{type:"object"},read_only:true,destructive:false,requires_tasks:false}]}}}))
    assert.match(catalog,/&lt;script&gt;remote&lt;\/script&gt;/);assert.equal(catalog.includes("<script>"),false)
  }finally{await server.close()}
})
