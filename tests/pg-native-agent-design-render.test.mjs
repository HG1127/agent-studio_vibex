// Actual React SSR, no browser/listener/DB/network/production mount.
import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {emptyAgentDesignView} from '../src/lib/pgNativeAgentDesignSession.ts'
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=process.env.AGENT_STUDIO_F01_REVIEW_ROOT||repo,id='00000000-0000-4000-8000-000000000001',sha='a'.repeat(64)
let server,Panel,Presentation
before(async()=>{server=await createServer({configFile:false,envFile:false,root,mode:'test',plugins:[react()],cacheDir:path.join(repo,'.tmp/pg-migration-completion/F01-ssr-cache'),optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,host:'127.0.0.1',hmr:false,ws:false,watch:null}});const m=await server.ssrLoadModule('/src/pages/PgNativePilot/PgNativeAgentDesignPanel.tsx');Panel=m.default;Presentation=m.PgNativeAgentDesignPresentation})
after(async()=>{await server?.close()})
const base=()=>({...emptyAgentDesignView(id),active:true,available:true,submissions:true,saves:true})
const render=(view=base(),props={})=>renderToStaticMarkup(createElement(Presentation,{employeeId:id,active:true,available:true,submissions:true,saves:true,models:[],view,bound:true,...props}))
test('default mount is off and SSR reads no API or starts paid/save effects',()=>{const api=new Proxy({},{get(){throw Error('SSR accessed API')}}),html=renderToStaticMarkup(createElement(Panel,{api,employeeId:id,active:true,available:true,models:[],onExpired(){}}));assert.match(html,/当前未开放助手设计/);assert.doesNotMatch(html,/确认本次模型费用|确认仅保存/);assert.equal(render(base(),{active:false}),'')})
test('employee/API/capability mismatch hides all retained descriptions before effects',()=>{const v={...base(),preview:{private:'SENSITIVE'}};for(const props of [{employeeId:'00000000-0000-4000-8000-000000000002'},{bound:false},{available:false}]){const html=render(v,props);assert.doesNotMatch(html,/SENSITIVE|助手需求或修改要求/);assert.match(html,/未开放/)}})
test('result editing exposes all six fields and tools remain advisory, with distinct save consent',()=>{const fields={name:'Complete role',goal:'FULL GOAL',task_scope:'FULL SCOPE',deliverables:['FULL DELIVERY'],task_plan:['FULL PLAN'],done_criteria:['FULL DONE']},v={...base(),fields,result:{protocol:'agent_design_view_v1',receipt:{request_id:id},result_status:'available',result:{result_sha256:sha,result:{...fields,tools:['ADVICE ONLY']}}},savePreview:{purpose:'generate',candidate:{name:fields.name}}},html=render(v);for(const label of ['助手名称','目标','任务范围','交付物（每行一项）','任务计划（每行一步）','完成标准（每行一项）','FULL GOAL','FULL SCOPE','FULL DELIVERY','FULL PLAN','FULL DONE','ADVICE ONLY','确认仅保存方案'])assert.ok(html.includes(label),label);assert.doesNotMatch(html,/确认本次模型费用并|自动启动|api_key|owner_user_id/);assert.match(html,/新方案从空资源开始/)} )
test('unknown operation presents only original receipt lookup and no success claim',()=>{const html=render({...base(),pending:{kind:'submit',body:{request_id:id}},error:'操作结果尚未核对'});assert.match(html,/查询原始回执/);assert.doesNotMatch(html,/已保存方案|已完成|重新发起模型/);assert.match(html,/disabled=""/)})
