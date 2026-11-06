// Actual React SSR only. No Native authority, browser, listener, SQL or write.
import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),id='00000000-0000-4000-8000-000000000001',foreign='00000000-0000-4000-8000-000000000002'
const agent={id,name:'Copied <script>role</script>',revision:1,spec:{goal:'Complete copied goal',task_scope:'Scope',deliverables:['Delivery'],task_plan:['Plan'],done_criteria:['Done'],tools:[],knowledge_base_ids:[],require_approval:true}}
const api=new Proxy({},{get(){throw Error('SSR must not call API')}})
const callbacks={onSaved:async()=>{},onExpired(){},onClose(){}}
let server,Setup,panels
before(async()=>{
 server=await createServer({configFile:false,envFile:false,root:repo,mode:'test',plugins:[react()],resolve:{alias:{'@':path.join(repo,'src')}},cacheDir:path.join(repo,'.tmp/F07-setup-ssr-cache'),
  optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,host:'127.0.0.1',hmr:false,ws:false,watch:null}})
 Setup=(await server.ssrLoadModule('/src/pages/PgNativePilot/PgNativeTemplateMarketAgentSetup.tsx')).default
 panels=[]
 for(const name of ['PgNativeAgentModelBindingPanel','PgNativeAgentHttpToolsPanel','PgNativeAgentMcpToolsPanel','PgNativeAgentKnowledgePanel'])panels.push((await server.ssrLoadModule('/src/pages/PgNativePilot/'+name+'.tsx')).default)
})
after(async()=>{await server?.close()})
const render=props=>renderToStaticMarkup(createElement(Setup,{api,agent,active:true,enabled:true,connections:[],tools:[],bases:[],...callbacks,...props}))
const selectedCount=(html,key)=>(html.match(new RegExp('<option value="'+key+'" selected="">','g'))??[]).length
const selectionLabels=['选择 Agent','工具绑定 Agent','MCP 工具绑定 Agent','知识库绑定 Agent']
const agentSelect=(html,index)=>{const select=html.match(new RegExp('<select[^>]*aria-label="'+selectionLabels[index]+'"[^>]*>[\\s\\S]*?</select>'));assert.ok(select,selectionLabels[index]);return select[0]}

test('inactive setup touches no API and reveals no copied content',()=>{assert.equal(render({active:false}),'')})
test('all four existing resource panels select the exact independently read copy without any mutation',()=>{
 const html=render({});assert.equal(selectedCount(html,id),4)
 for(const label of ['Agent 模型绑定','Agent 自定义 HTTP 工具','Agent MCP 工具','Agent 知识库绑定','返回全部助手配置'])assert.ok(html.includes(label),label)
 assert.ok(html.includes('Copied &lt;script&gt;role&lt;/script&gt;'));assert.doesNotMatch(html,/<script>|来源模型已配置|自动运行成功/)
 assert.ok(html.includes('模板来源的资源权限不会转移'))
})
test('initial selection cannot introduce an Agent absent from the actual owner inventory',()=>{
 for(const [index,Panel] of panels.entries()){const html=agentSelect(renderToStaticMarkup(createElement(Panel,{api,agents:[agent],initialAgentId:foreign,active:true,enabled:true,connections:[],bases:[],onUpdated:callbacks.onSaved,...callbacks})),index);assert.equal(selectedCount(html,foreign),0);assert.equal(selectedCount(html,''),1)}
})
test('existing callers keep their unselected default and remain read-only while configuration is closed',()=>{
 for(const [index,Panel] of panels.entries()){const html=agentSelect(renderToStaticMarkup(createElement(Panel,{api,agents:[agent],active:true,enabled:false,connections:[],bases:[],onUpdated:callbacks.onSaved,...callbacks})),index);assert.equal(selectedCount(html,id),0);assert.equal(selectedCount(html,''),1)}
 const locked=render({enabled:false});assert.match(locked,/<fieldset disabled=""/);assert.ok(locked.includes('当前不能保存资源配置'))
})
