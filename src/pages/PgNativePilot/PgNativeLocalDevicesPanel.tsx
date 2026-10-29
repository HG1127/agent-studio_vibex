import {useEffect,useRef,useState} from 'react'
import {createNativeLocalDeviceIntentState,nativeDeviceOnline,type createPgNativeLocalDeviceApi,type LocalIntent,type LocalJob} from '@/lib/pgNativeLocalDevice'
import {parseLocalInput,parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import {PgNativePilotError} from '@/lib/pgNativePilotApi'
import {useNativeLocalDevices} from './useNativeLocalDevices'
const field='mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const button='rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50'
export default function PgNativeLocalDevicesPanel({api,active,available,writes,onExpired}:{api:ReturnType<typeof createPgNativeLocalDeviceApi>;active:boolean;available:boolean;writes:boolean;onExpired:()=>void}){
 const inventory=useNativeLocalDevices(api,active,available,onExpired),intent=useRef(createNativeLocalDeviceIntentState()),life=useRef(0)
 const [pending,setPending]=useState<LocalIntent|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[code,setCode]=useState('')
 const [name,setName]=useState('我的工作电脑'),[deviceId,setDeviceId]=useState(''),[tool,setTool]=useState(''),[args,setArgs]=useState('{}'),[confirm,setConfirm]=useState(false),[job,setJob]=useState<LocalJob|null>(null),[jobId,setJobId]=useState('')
 const device=inventory.devices.find(d=>d.id===deviceId),tools=device?.catalog??[],locked=busy||Boolean(pending)||!active||!available
 useEffect(()=>{++life.current;intent.current=createNativeLocalDeviceIntentState();setPending(null);setBusy(false);setError('');setNotice('');setCode('');setJob(null);setJobId('');setDeviceId('');setTool('');setArgs('{}');setConfirm(false);return()=>{++life.current;intent.current.clear()}},[api])
 useEffect(()=>{if(!active||!available){setCode('');setConfirm(false)}},[active,available])
 useEffect(()=>{setConfirm(false)},[deviceId,tool,args])
 async function readJob(id:string){const current=life.current;try{const value=await api.getJob(id);if(current===life.current){setJob(value);setJobId(value.id)}}catch(e){if(current===life.current){setJob(null);setError('无法读取本人原任务；请核对 UUID 或当前设备授权。');if(e instanceof PgNativePilotError&&e.status===401)onExpired()}}}
 async function send(value?:LocalIntent){if(busy||!active||!available)return;const original=value?intent.current.begin(value):intent.current.snapshot().pending;if(!original)return
  const current=life.current;setPending(original);setBusy(true);setError('');setNotice('')
  try{const result=value?await api.record(original):await api.confirm(original);if(current!==life.current)return;intent.current.accept(result);setPending(null);setCode(result.pairing_code??'');setNotice(result.replayed?'已确认原请求，未创建重复操作。':original.action==='create'?'配对短码仅本次显示，有效期五分钟。':'操作已记录。')
   if(original.action==='enqueue'){setJobId(result.receipt.id);await readJob(result.receipt.id)}await inventory.load()
  }catch(e){if(current===life.current){setError('结果尚未确认。保留原 UUID，只查询原请求；请勿创建相同动作。');if(e instanceof PgNativePilotError&&e.status===401)onExpired()}}
  finally{if(current===life.current)setBusy(false)}
 }
 return <section aria-label="本机设备" className="space-y-5">
  <h2 className="text-lg font-semibold">本机设备</h2><p className="text-sm text-slate-600">配对后，本机仅执行你逐次批准、且本地配置允许的动作。撤销或取消会请求停止；已发生的修改需按实际结果核查。</p>
  {(error||inventory.error)&&<p role="alert" className="rounded-lg bg-rose-50 p-3">{error||inventory.error}</p>}{notice&&<p role="status">{notice}</p>}
  {!available&&<p role="status">入口暂不可用，原请求已保留；恢复后可继续查询回执。</p>}{pending&&<div className="rounded-lg border border-amber-300 bg-amber-50 p-3"><p>原请求 UUID：<code>{pending.request_id}</code></p><button className={button} disabled={busy||!active||!available} onClick={()=>void send()}>查询原请求回执</button></div>}
  <div className="rounded-xl border bg-white p-4"><label className="block text-sm">设备名称<input className={field} value={name} maxLength={120} disabled={locked} onChange={e=>setName(e.target.value)}/></label><button className={button+' mt-3'} disabled={locked||!writes||!name.trim()} onClick={()=>void send({action:'create',request_id:crypto.randomUUID(),name:name.trim()})}>生成配对短码</button>
   {code&&active&&<div role="status" className="mt-3 rounded-lg bg-indigo-50 p-3"><p>在已核对配置的本地 CLI 中输入短码：</p><code className="break-all select-all">{code}</code><p className="mt-2 text-sm">长期设备令牌只保存在本地凭据文件。短码丢失后请撤销本设备，再手动创建新的配对。</p></div>}
  </div>
  <button className={button} disabled={!active||inventory.loading||busy} onClick={()=>void inventory.load()}>刷新本人设备</button>
  <ul className="space-y-2">{inventory.devices.map(d=><li key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3"><span>{d.name} · {d.revoked?'已撤销':nativeDeviceOnline(d)?'在线':'离线'} · {d.catalog.length} 个工具</span><code className="break-all text-xs">{d.id}</code><button className={button} disabled={locked||!writes||d.revoked} onClick={()=>{if(window.confirm('撤销这台电脑并取消其未完成任务？'))void send({action:'revoke',request_id:crypto.randomUUID(),id:d.id,confirm:true})}}>撤销</button></li>)}</ul>
  <div className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-medium">人工试调</h3>
   <label className="block text-sm">在线设备<select className={field} value={deviceId} disabled={locked} onChange={e=>{setDeviceId(e.target.value);setTool('')}}><option value="">选择设备</option>{inventory.devices.filter(d=>nativeDeviceOnline(d)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
   <label className="block text-sm">本机工具<select className={field} value={tool} disabled={locked} onChange={e=>setTool(e.target.value)}><option value="">选择实际目录中的工具</option>{tools.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}</select></label>
   {tools.find(t=>t.name===tool)&&<details><summary>工具说明和参数格式</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(tools.find(t=>t.name===tool),null,2)}</pre></details>}
   <label className="block text-sm">参数 JSON<textarea className={field+' font-mono'} rows={5} maxLength={12000} value={args} disabled={locked} onChange={e=>setArgs(e.target.value)}/></label>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirm} disabled={locked} onChange={e=>setConfirm(e.target.checked)}/>我已核对这个具体动作及其参数，批准在此设备执行一次。</label>
   <button className={button} disabled={locked||!writes||!confirm||!device||!nativeDeviceOnline(device)||!tool} onClick={()=>{try{const input=parseLocalInput({tool,arguments:parseLocalTransportJson(args,12000)});void send({action:'enqueue',request_id:crypto.randomUUID(),id:deviceId,input,confirm:true});setConfirm(false)}catch{setError('请按实际工具格式填写 JSON 参数。')}}}>批准并创建一次任务</button>
  </div>
  <div className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-medium">原任务状态</h3><label className="block text-sm">任务 UUID<input className={field} value={jobId} onChange={e=>{setJobId(e.target.value);setJob(null)}}/></label><button className={button} disabled={busy||!active||!jobId} onClick={()=>void readJob(jobId)}>读取原任务</button>
   {job&&<><p role="status">{job.status} {job.error}</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-sm">{job.result?.text}</pre>{job.result?.images.map((image,i)=><img key={i} alt="本次已批准动作的实际本机截图" src={'data:'+image.mimeType+';base64,'+image.data} className="max-h-96 max-w-full object-contain"/>)}<button className={button} disabled={locked||!writes||!['queued','running'].includes(job.status)} onClick={()=>void send({action:'cancel',request_id:crypto.randomUUID(),id:job.id,confirm:true})}>取消原任务</button></>}
  </div>
 </section>
}
