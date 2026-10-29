import {useEffect,useRef,useState} from 'react'
import {createNativeLocalDeviceIntentState,nativeOfficeRoots,nativeDeviceOnline,type createPgNativeLocalDeviceApi,type LocalIntent} from '@/lib/pgNativeLocalDevice'
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeAgent} from '@/lib/pgNativePilotApi'
import {officeSampleCsv,officeTaskDefaults,buildOfficeInstruction,type OfficeTask} from '@/lib/pgNativeOfficeWorkflow'
import {useNativeLocalDevices} from './useNativeLocalDevices'
export type NativeOfficeRunRequest={agentId:string;deviceId:string;instruction:string;selection:number}
const field='mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm',button='rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50'
export default function PgNativeOfficeWorkflowPanel({api,devicesApi,active,available,writes,onExpired,onChanged,onConfigureAgent,onPrepareRun}:{api:ReturnType<typeof createPgNativePilotApi>;devicesApi:ReturnType<typeof createPgNativeLocalDeviceApi>;active:boolean;available:boolean;writes:boolean;onExpired:()=>void;onChanged:()=>void;onConfigureAgent:(id:string)=>void;onPrepareRun:(r:Omit<NativeOfficeRunRequest,'selection'>)=>void}){
 const inventory=useNativeLocalDevices(devicesApi,active,available,onExpired),life=useRef(0),state=useRef(createNativeLocalDeviceIntentState())
 const [task,setTask]=useState<OfficeTask>(officeTaskDefaults),[deviceId,setDeviceId]=useState(''),[name,setName]=useState('本地办公助手'),[agentId,setAgentId]=useState(''),[agent,setAgent]=useState<PgNativeAgent|null>(null),[pending,setPending]=useState<LocalIntent|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const eligible=inventory.devices.filter(d=>nativeOfficeRoots(d).length),device=eligible.find(d=>d.id===deviceId),roots=device?nativeOfficeRoots(device):[],locked=busy||Boolean(pending)||!active||!available
 useEffect(()=>{++life.current;state.current=createNativeLocalDeviceIntentState();setPending(null);setBusy(false);setError('');setNotice('');setAgentId('');setAgent(null);setDeviceId('');setTask(officeTaskDefaults);return()=>{++life.current;state.current.clear()}},[api,devicesApi])
 const change=(key:keyof OfficeTask,value:string)=>setTask(old=>({...old,[key]:value}))
 async function readAgent(id=agentId){const current=life.current;try{const row=await api.getAgent(id);if(current!==life.current)return null;if(row.id!==id||!row.spec.tools?.includes('local_computer'))throw Error('not_office_agent');setAgent(row);return row}catch(e){if(current===life.current){setAgent(null);setError('尚未读到本人办公助手。保留原 ID，可再次读取；不要重复创建。');if(e instanceof PgNativePilotError&&e.status===401)onExpired()}return null}}
 async function create(confirmOnly=false){if(busy||!active||!available)return;const intent=confirmOnly?state.current.snapshot().pending:state.current.begin({action:'create_office',request_id:crypto.randomUUID(),name:name.trim()});if(!intent)return
  const current=life.current;setPending(intent);setBusy(true);setError('')
  try{const result=confirmOnly?await devicesApi.confirm(intent):await devicesApi.record(intent);if(current!==life.current)return;state.current.accept(result);setPending(null);setAgentId(result.receipt.id);await readAgent(result.receipt.id);if(current!==life.current)return;onChanged();setNotice('办公助手已保存。先在资源配置中选择本人模型，再带入办公任务。')}
  catch(e){if(current===life.current){setError('创建结果尚未确认，保留原 UUID；仅查询原请求。');if(e instanceof PgNativePilotError&&e.status===401)onExpired()}}
  finally{if(current===life.current)setBusy(false)}
 }
 async function prepare(){if(locked||!writes||!device||!agentId)return;const current=life.current;setBusy(true);setError('')
  try{const actual=await readAgent();if(!actual||!actual.spec.model_binding)throw Error('configure_model_first');const latest=(await devicesApi.list()).find(d=>d.id===deviceId);if(!latest||!nativeDeviceOnline(latest)||!nativeOfficeRoots(latest).includes(task.root))throw Error('device_changed')
   if(task.formUrl&&!latest.catalog.some(t=>t.name==='browser.browser_navigate'))throw Error('browser_not_available')
   const instruction=buildOfficeInstruction(task);if(current!==life.current)return;onPrepareRun({agentId:actual.id,deviceId:latest.id,instruction});setNotice('已带入多轮任务表单，请核对后手动提交。')
  }catch(e){if(current===life.current){setError(e instanceof Error&&e.message==='configure_model_first'?'请先读取办公助手并配置本人可用模型。':'请核对在线设备、目录、字段、源文件格式及网址；任务未提交。');if(e instanceof PgNativePilotError&&e.status===401)onExpired()}}
  finally{if(current===life.current)setBusy(false)}
 }
 return <section aria-label="本地办公流程" className="space-y-5"><h2 className="text-lg font-semibold">表格汇总与办公报告</h2><p className="text-sm leading-6 text-slate-600">读取本机 XLSX 或 UTF-8 CSV，以实际源文件摘要生成新的 Excel 汇总表、Word 报告和 JSON 清单。可选网页录入与提交分别审批，完成后须核对实际回执。</p>
  {(error||inventory.error)&&<p role="alert" className="rounded-lg bg-rose-50 p-3">{error||inventory.error}</p>}{notice&&<p role="status">{notice}</p>}
  <button className={button} disabled={locked} onClick={()=>{const url=URL.createObjectURL(new Blob([officeSampleCsv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='sample-ledger.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}>下载示例 CSV</button><p className="text-sm text-slate-500">请把示例或自有文件放入本地配置允许的目录。单个源文件上限 2 MiB、5000 条记录、50 个分组；源公式不执行，已有输出不覆盖。</p>
  <div className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-medium">1. 准备办公助手</h3><p className="text-sm text-slate-600">保存后，在此助手的原有资源配置中选择本人模型；工具权限和审批要求会保留。</p><label className="block text-sm">助手名称<input className={field} value={name} maxLength={120} disabled={locked||Boolean(agentId)} onChange={e=>setName(e.target.value)}/></label><button className={button} disabled={locked||!writes||!name.trim()||Boolean(agentId)} onClick={()=>void create()}>保存办公助手</button>
   {!available&&<p role="status">入口暂不可用，原创建请求与助手 ID 已保留；恢复后可继续读取。</p>}{pending&&<div className="rounded-lg bg-amber-50 p-3"><p>原请求 UUID：<code>{pending.request_id}</code></p><button className={button} disabled={busy||!active||!available} onClick={()=>void create(true)}>查询原创建回执</button></div>}
   {agentId&&<div className="space-y-2"><p>已保存助手：<code>{agentId}</code></p><button className={button} disabled={busy||!active} onClick={()=>void readAgent()}>读取原助手</button><button className={button} disabled={locked||!agent} onClick={()=>onConfigureAgent(agentId)}>配置此助手的模型</button><p className="text-sm">{agent?.spec.model_binding?'已配置模型；提交前会再次读取当前版本。':'需在资源配置中选择本人模型。'}</p></div>}
  </div>
  <div className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-medium">2. 选择设备和任务</h3><button className={button} disabled={locked||inventory.loading} onClick={()=>void inventory.load()}>读取办公设备</button><label className="block text-sm">在线办公设备<select className={field} value={deviceId} disabled={locked} onChange={e=>{setDeviceId(e.target.value);change('root','')}}><option value="">选择已启用 Office 的本机</option>{eligible.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
   <label className="block text-sm">允许的根目录<select className={field} value={task.root} disabled={locked} onChange={e=>change('root',e.target.value)}><option value="">选择本机实际配置中的目录</option>{roots.map(root=><option key={root} value={root}>{root}</option>)}</select></label>
   {([['sourcePath','源文件相对路径'],['sheet','工作表名称（CSV 留空）'],['groupBy','分组列名'],['amountColumn','金额列名'],['outputDirectory','新的输出目录'],['title','报告标题'],['period','统计标签'],['formUrl','可选表单网址']] as const).map(([key,label])=><label key={key} className="block text-sm">{label}<input className={field} value={task[key]} disabled={locked} maxLength={key==='sourcePath'||key==='outputDirectory'?400:key==='formUrl'?500:100} onChange={e=>change(key,e.target.value)}/></label>)}
   <p className="text-sm text-slate-500">网址须在本地浏览器允许列表中。统计标签只是报告文字，不会按日期过滤。登录由你在本机完成。</p><button className={button} disabled={locked||!writes||!agentId||!device||!roots.includes(task.root)} onClick={()=>void prepare()}>带入多轮任务，继续核对</button>
  </div>
 </section>
}
