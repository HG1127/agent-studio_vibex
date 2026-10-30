// Real React SSR through Vite middleware, without listener, SQL or execution.
import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {createElement as el} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
let vite,Devices,Office,Autonomous
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),api=new Proxy({}, {get(){throw Error('Unexpected API call during SSR')}})
before(async()=>{vite=await createServer({configFile:false,envFile:false,root,mode:'test',plugins:[react()],resolve:{alias:{'@':path.join(root,'src')}},cacheDir:path.join(root,'.tmp/F20-F21-ssr-cache'),optimizeDeps:{noDiscovery:true,include:[],entries:[]},ssr:{optimizeDeps:{noDiscovery:true,include:[],entries:[]}},server:{middlewareMode:true,host:'127.0.0.1',hmr:false,ws:false,watch:null}});Devices=(await vite.ssrLoadModule('/src/pages/PgNativePilot/PgNativeLocalDevicesPanel.tsx')).default;Office=(await vite.ssrLoadModule('/src/pages/PgNativePilot/PgNativeOfficeWorkflowPanel.tsx')).default;Autonomous=(await vite.ssrLoadModule('/src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx')).default})
after(async()=>{await vite?.close()})
test('device entry exposes real pairing/manual/original-task controls with no API during render',()=>{const html=renderToStaticMarkup(el(Devices,{api,active:true,available:true,writes:true,onExpired(){}}));for(const text of ['本机设备','生成配对短码','人工试调','批准并创建一次任务','原任务状态','读取原任务'])assert.ok(html.includes(text),text);assert.doesNotMatch(html,/X-Rh-User-Id|Bearer |device_token|localStorage/);assert.match(html,/disabled=""[^>]*>批准并创建一次任务/)})
test('Office entry includes original source columns/artifacts/site semantics and no fabricated completion',()=>{const html=renderToStaticMarkup(el(Office,{api,devicesApi:api,active:true,available:true,writes:true,onExpired(){},onChanged(){},onConfigureAgent(){},onPrepareRun(){}}));for(const text of ['示例 CSV','源文件相对路径','分组列名','金额列名','新的输出目录','可选表单网址','5000 条记录','50 个分组','模型','带入多轮任务'])assert.ok(html.includes(text),text);assert.match(html,/disabled=""[^>]*>带入多轮任务/);assert.doesNotMatch(html,/报告已完成|提交成功|原 UUID 已恢复/)})
test('existing autonomous controller remains single and receives a bounded device selector',()=>{const html=renderToStaticMarkup(el(Autonomous,{api,agents:[],connections:[],ownerId:'10000000-0000-4000-8000-000000000001',active:true,enabled:false,onExpired(){},localDeviceApi:api,localDevicesAvailable:true}));for(const text of ['新建多轮任务','本次本机设备','读取本人设备','本次不使用本机'])assert.ok(html.includes(text),text);assert.equal((html.match(/<h2\b[^>]*>[\s\S]*?新建多轮任务<\/h2>/g)??[]).length,1)})
