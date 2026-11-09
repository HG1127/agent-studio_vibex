// Actual React server rendering of candidate UI and actual source-scoped form.
// No browser, network listener, DB, employee session or paid call.
import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {emptyAgentPlanWorkflowView} from '../src/lib/pgNativeAgentPlanWorkflowSession.ts'
import {browserValues,id} from './helpers/agent-plan-workflow-browser-values.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),scope='api-one:login-one'
let server,Panel,Presentation,NodeForm
before(async()=>{
  server=await createServer({configFile:false,envFile:false,root,mode:'test',plugins:[react()],cacheDir:path.join(root,'.tmp/F05-SSR-cache'),resolve:{alias:{'@':path.join(root,'src')}},
    optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,host:'127.0.0.1',hmr:false,ws:false,watch:null}})
  const m=await server.ssrLoadModule('/src/pages/PgNativePilot/PgNativeAgentPlanWorkflowPanel.tsx');Panel=m.default;Presentation=m.PgNativeAgentPlanWorkflowPresentation
  NodeForm=(await server.ssrLoadModule('/src/pages/PgNativePilot/PgNativeWorkflowNodeForm.tsx')).default
})
after(async()=>{await server?.close()})
const unavailable=new Proxy({},{get(){throw Error('SSR must not call API')}})
const base=()=>({...emptyAgentPlanWorkflowView(id(1),scope),active:true,available:true,submissions:true,saves:true})
const props=()=>({employeeId:id(1),scopeKey:scope,active:true,available:true,submissions:true,saves:true,configurationWrites:true,agents:[],models:[],tools:[],bases:[],workflowApi:unavailable,onExpired(){},onSaved(){}})
const render=(view=base(),extra={})=>renderToStaticMarkup(createElement(Presentation,{...props(),view,bound:true,...extra}))
test('default mount is off, performs no API access and renders no paid/save control',()=>{
  const html=renderToStaticMarkup(createElement(Panel,{...props(),api:unavailable}));assert.match(html,/暂未开放/);assert.doesNotMatch(html,/确认费用并生成草图|独立确认保存工作流/);assert.equal(render(base(),{active:false}),'')
})
test('API/employee/login epoch mismatch immediately hides every retained source and result',async()=>{
  const f=await browserValues(),view={...base(),preview:f.preview,result:await f.view(),receipt:await f.receipt()}
  for(const extra of [{employeeId:id(2)},{scopeKey:'new-login-epoch'},{bound:false},{available:false}]){const html=render(view,extra);assert.match(html,/暂未开放/);assert.doesNotMatch(html,/完整目标|完整范围|确认费用|原始模型设计/)}
})
test('generation fee review is a separate unchecked control and source text remains fully escaped',async()=>{
  const f=await browserValues(),preview=structuredClone(f.preview);preview.source_values.spec.goal='<img src=x onerror=alert(1)>'
  const html=render({...base(),preview,feeReviewed:false});assert.match(html,/工作流生成输入预览/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<img src=x/)
  assert.match(html,/disabled=""[^>]*>确认费用并生成草图/);assert.doesNotMatch(html,/独立确认保存工作流/)
})
test('independent save review cannot inherit the generation fee checkbox',async()=>{
  const f=await browserValues(),html=render({...base(),savePreview:f.save_preview,feeReviewed:true,saveReviewed:false})
  assert.match(html,/工作流独立保存确认/);assert.match(html,/disabled=""[^>]*>独立确认保存工作流/);assert.doesNotMatch(html,/确认费用并生成草图/)
})
test('unknown request shows only original-confirm action while new submission/save controls are unavailable',async()=>{
  const f=await browserValues(),html=render({...base(),submissions:false,saves:false,pending:{kind:'save',body:f.save}})
  assert.match(html,/查询原请求结果/);assert.match(html,/避免重复提交/);assert.doesNotMatch(html,/独立确认保存工作流|确认费用并生成草图/)
})
test('stale/erased/unavailable/unknown views have no load-canvas or save action; available result has an explicit load action',async()=>{
  const f=await browserValues()
  for(const status of ['stale','erased','unavailable','unknown','pending']){const result=await f.view(f.submit,status),html=render({...base(),result,receipt:result.receipt});assert.doesNotMatch(html,/在现有画布中编辑草图|独立确认保存工作流/);if(status==='stale')assert.match(html,/历史草图已保留/)}
  const result=await f.view();assert.match(render({...base(),result,receipt:result.receipt}),/在现有画布中编辑草图/)
})
test('actual existing node form keeps ordinary choices while optional F05 policy restricts source builtins',()=>{
  const node={id:'tool',type:'tool',position:{x:0,y:0},data:{title:'工具',tool:'web_search',params_template:'{}'}},p={node,nodes:[node],agents:[],models:[],tools:[],bases:[],enabled:true,onApply(){},onDirty(){}}
  const ordinary=renderToStaticMarkup(createElement(NodeForm,p));assert.match(ordinary,/<option value="calculate">/)
  const scoped=renderToStaticMarkup(createElement(NodeForm,{...p,resourcePolicy:{builtinTools:['web_search'],requirePlanReview:true,lockKnowledgeRetrieval:true,mcpBindings:[]}}));assert.doesNotMatch(scoped,/<option value="calculate">/);assert.match(scoped,/<option value="web_search"/)
})
test('actual existing Agent node form cannot lower a source-required review in F05 mode',()=>{
  const node={id:'agent',type:'agent',position:{x:0,y:0},data:{title:'角色',require_plan_review:true}},html=renderToStaticMarkup(createElement(NodeForm,{node,nodes:[node],agents:[],models:[],tools:[],bases:[],enabled:true,onApply(){},onDirty(){},resourcePolicy:{builtinTools:[],requirePlanReview:true,lockKnowledgeRetrieval:true,mcpBindings:[]}}))
  assert.match(html,/<option value="inherit" disabled="">/);assert.match(html,/<option value="off" disabled="">/)
})
