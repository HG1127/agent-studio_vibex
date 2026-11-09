// Actual React SSR and H-based candidate mount checks; no browser/network/DB.
import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {workerHeartbeatKinds} from '../services/pg-api/src/worker-heartbeat-contract.ts'
import {parsePgNativeCompanyWorkerHeartbeats} from '../src/lib/pgNativeCompanyWorkerHeartbeats.ts'
import {emptyCompanyWorkerHeartbeatsView} from '../src/lib/pgNativeCompanyWorkerHeartbeatsSession.ts'

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=process.env.AGENT_STUDIO_NATIVE01_UI_REVIEW_ROOT||repo
const id='00000000-0000-4000-8000-000000000001',at='2026-10-29T01:02:03.000Z',noop=()=>{}
const data=parsePgNativeCompanyWorkerHeartbeats({protocol:'native_company_worker_heartbeats_v1',scope:'company_worker_metadata_only',as_of:at,stale_after_ms:90000,
  workers:workerHeartbeatKinds.map((kind,index)=>index===0?{kind,state:'ready',last_seen_at:at,reason:'fresh_ready_report'}:index===1?{kind,state:'draining',last_seen_at:at,reason:'fresh_draining_report'}:index===2?{kind,state:'stale',last_seen_at:'2026-10-29T01:00:33.000Z',reason:'heartbeat_expired'}:{kind,state:'unknown',last_seen_at:null,reason:'not_observed'})})
const ready=()=>({...emptyCompanyWorkerHeartbeatsView(id),active:true,currentAdmin:true,available:true,status:'snapshot',data})
let server,Panel,Presentation,Company
before(async()=>{
  server=await createServer({configFile:false,envFile:false,root,mode:'test',plugins:[react()],
    cacheDir:path.join(repo,'.tmp/pg-migration-completion/native01-ui-ssr-cache'),resolve:{alias:{'@':path.join(root,'src')}},
    optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},
    server:{middlewareMode:true,host:'127.0.0.1',hmr:false,ws:false,watch:null}})
  const m=await server.ssrLoadModule('/src/pages/PgNativePilot/CompanyWorkerHeartbeatsPanel.tsx');Panel=m.default;Presentation=m.CompanyWorkerHeartbeatsPresentation
  Company=(await server.ssrLoadModule('/src/pages/PgNativePilot/CompanyOverviewPanel.tsx')).default
})
after(async()=>{await server?.close()})
const render=(view=ready(),props={})=>renderToStaticMarkup(createElement(Presentation,{employeeId:id,view,bound:true,currentAdmin:true,available:true,active:true,onRefresh:noop,...props}))
test('eight fixed rows preserve distinct server states/time without inferring from counts or leaking private fields',()=>{
  const html=render();assert.equal((html.match(/<tr\b/g)||[]).length,9)
  for(const label of ['就绪（快照时点）','停止接收新任务（报告状态）','心跳已过期','尚无本代报告'])assert.ok(html.includes(label))
  assert.ok(html.includes('dateTime="'+at+'"'));assert.match(html,/90 秒/)
  assert.doesNotMatch(html,/<a\b|href=|token|lease|owner_user_id|password|SQL|排空完成/)
})
test('unbound, changed employee, demotion, capability closure and forbidden snapshots suppress every prior ready row before effects',()=>{
  for(const props of [{bound:false},{employeeId:'00000000-0000-4000-8000-000000000002'},{currentAdmin:false},{available:false}]){
    const html=render(ready(),props);assert.doesNotMatch(html,/dateTime=|>就绪（快照时点）</);assert.match(html,/disabled=""/)
  }
  const html=render({...ready(),forbidden:true});assert.match(html,/心跳快照已清空/);assert.doesNotMatch(html,/dateTime=|重新登录/)
  assert.equal(render(ready(),{active:false}),'')
})
test('loading, unknown and unavailable cannot render retained successful data or fake successful zeros',()=>{
  for(const status of ['loading','unknown','unavailable']){
    const html=render({...ready(),status});assert.doesNotMatch(html,/dateTime=|>就绪（快照时点）</);assert.match(html,/当前状态未知/)
    assert.equal((html.match(/<td[^>]*>未知<\/td>/g)||[]).length,8)
  }
})
test('default SSR issues no request even if reading API methods would throw',()=>{
  const api=new Proxy({},{get(){throw Error('SSR accessed API')}})
  const html=renderToStaticMarkup(createElement(Panel,{api,employeeId:id,currentAdmin:true,available:true,active:true,onExpired:noop}))
  assert.doesNotMatch(html,/dateTime=|>就绪（快照时点）</);assert.match(html,/当前状态未知/)
})
test('actual company mounting stays default-off, adds no false ready and retains old company contract',()=>{
  const api=new Proxy({},{get(){throw Error('SSR accessed API')}}),props={api,employeeId:id,currentAdmin:true,available:true,active:true,onExpired:noop}
  const closed=renderToStaticMarkup(createElement(Company,props));assert.match(closed,/Worker 心跳暂不可用（尚未接入真实遥测）/)
  const enabled=renderToStaticMarkup(createElement(Company,{...props,workerHeartbeatsApi:api,workerHeartbeatsAvailable:true}))
  assert.doesNotMatch(enabled,/尚未接入真实遥测|>就绪（快照时点）</);assert.match(enabled,/公司运行统计/)
  const company=readFileSync(path.join(root,'src/pages/PgNativePilot/CompanyOverviewPanel.tsx'),'utf8')
  assert.match(company,/workerHeartbeatsAvailable && <CompanyWorkerHeartbeatsPanel/)
  assert.match(company,/currentAdmin=\{currentAdmin&&!view\.forbidden\}/)
})
test('actual page/parser mount capability is optional boolean, cleared on refresh/expiry and never sets readiness',async()=>{
  const sdk=readFileSync(path.join(root,'src/lib/pgNativePilotApi.ts'),'utf8'),page=readFileSync(path.join(root,'src/pages/PgNativePilot/PgNativePilotPage.tsx'),'utf8')
  assert.match(sdk,/company_worker_heartbeats_available\?:boolean/)
  assert.match(sdk,/typeof value\.company_worker_heartbeats_available!=="boolean"/)
  assert.ok((page.match(/setCompanyWorkerHeartbeatsAvailable\(false\)/g)||[]).length>=3)
  assert.match(page,/setCompanyWorkerHeartbeatsAvailable\(value\.company_worker_heartbeats_available===true\)/)
  assert.match(page,/workerHeartbeatsApi=\{companyWorkerApi\}/)
  assert.match(page,/companyOverviewAvailable\|\|companyWorkerHeartbeatsAvailable/)
  const parser=await server.ssrLoadModule('/src/lib/pgNativePilotApi.ts')
  const response=value=>new Response(JSON.stringify({mode:'native_pg18',config_writes_enabled:false,run_execution_enabled:false,model_probe_enabled:false,...value}),{headers:{'Content-Type':'application/json'}})
  for(const hint of [undefined,false,true]){
    const api=parser.createPgNativePilotApi(async()=>response(hint===undefined?{}:{company_worker_heartbeats_available:hint}), '')
    assert.equal((await api.getConfigCapabilities()).company_worker_heartbeats_available,hint)
  }
  for(const hint of ['true',1,null,{}]){
    const api=parser.createPgNativePilotApi(async()=>response({company_worker_heartbeats_available:hint}), '')
    await assert.rejects(()=>api.getConfigCapabilities(),value=>value.status===503&&value.code==='invalid_native_capabilities')
  }
})
