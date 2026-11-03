import {useEffect,useRef,useState} from 'react'
import {localApi} from '@/lib/localDevices'
type Eligible={tool:string;title:string;adapter_id:string;config_hash:string}
type Grant={grant_id:string;tool:string;state:string;reserved_calls:number;max_calls:number;expires_ms:number;revoked_ms:number;allowed_inputs:unknown[]}
type GrantList={eligible_tools:Eligible[];items:Grant[];pending_request:{tool:string;input:unknown}|null}
const states:Record<string,string>={active:'有效',revoked:'已撤销',expired:'已过期',configuration_changed:'连接已变化',exhausted:'次数已耗尽'}
export function ToolGrantPanel({runId,active}:{runId:string;active:boolean}){
  const [open,setOpen]=useState(false),[data,setData]=useState<GrantList|null>(null),[tool,setTool]=useState(''),[inputs,setInputs]=useState('[]')
  const [calls,setCalls]=useState('5'),[minutes,setMinutes]=useState('10'),[version,setVersion]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const draft=useRef<{signature:string;key:string}|null>(null)
  const route=`/api/agent-runs/${encodeURIComponent(runId)}/tool-grants`
  useEffect(()=>{
    if(!open)return
    const abort=new AbortController();setMessage('')
    void localApi<GrantList>(route,undefined,abort.signal).then(value=>{
      if(abort.signal.aborted)return
      setData(value);setTool(previous=>previous||value.eligible_tools[0]?.tool||'')
      if(!draft.current&&value.pending_request)setInputs(JSON.stringify([value.pending_request.input],null,2))
    }).catch(()=>{if(!abort.signal.aborted){setData(null);setMessage('授权状态读取未完成，请检查员工和来源权限。')}})
    return ()=>abort.abort()
  },[route,open,version])
  async function save(){
    setBusy(true);setMessage('')
    try{
      const entry=data?.eligible_tools.find(item=>item.tool===tool)
      if(!entry)throw Error('没有可授权的可信适配器')
      const body={tool,config_hash:entry.config_hash,allowed_inputs:JSON.parse(inputs) as unknown,max_calls:Number(calls),expires_in_minutes:Number(minutes),amount_limit_minor:0}
      const signature=JSON.stringify(body)
      if(draft.current?.signature!==signature)draft.current={signature,key:crypto.randomUUID()}
      await localApi(route,{...body,idempotency_key:draft.current.key})
      setVersion(v=>v+1);setMessage('范围已保存。请在审批区批准当前待批调用；后续完整匹配的请求可在额度内继续。')
    }catch(error){setMessage(error instanceof SyntaxError?'请求清单必须是有效 JSON 数组。':error instanceof Error?error.message:'授权未保存。')}
    finally{setBusy(false)}
  }
  async function revoke(id:string){
    setBusy(true);setMessage('')
    try{await localApi(route+`/${encodeURIComponent(id)}/revoke`,{});setVersion(v=>v+1)}
    catch{setMessage('撤销未确认完成，请刷新状态。')}
    finally{setBusy(false)}
  }
  return <details className="mt-3 rounded-xl border border-border bg-card p-3" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-medium">本次运行的范围授权</summary>
    <p className="mt-2 text-xs text-muted-foreground">只对服务端已登记的只读适配器开放。授权绑定当前连接、完整请求清单、有效期和次数；不授权金额操作，也不替代来源访问权限。未知插件和写操作仍逐次审批。</p>
    {data&&active&&data.eligible_tools.length>0&&<div className="mt-3 space-y-2 text-xs">
      <label className="block">可信只读工具<select value={tool} onChange={e=>setTool(e.target.value)} className="ml-2 max-w-full rounded border bg-background p-1">{data.eligible_tools.map(entry=><option key={entry.tool} value={entry.tool}>{entry.title} · {entry.adapter_id}</option>)}</select></label>
      <label className="block">允许的完整请求清单<textarea rows={6} maxLength={65536} value={inputs} onChange={e=>setInputs(e.target.value)} className="mt-1 w-full rounded border bg-background p-2 font-mono"/></label>
      <div className="flex flex-wrap gap-3"><label>最多调用次数<input type="number" min={1} max={20} value={calls} onChange={e=>setCalls(e.target.value)} className="ml-2 w-16 rounded border bg-background p-1"/></label><label>有效分钟<input type="number" min={1} max={60} value={minutes} onChange={e=>setMinutes(e.target.value)} className="ml-2 w-16 rounded border bg-background p-1"/></label></div>
      <button type="button" disabled={busy} className="rounded border px-3 py-1 disabled:opacity-50" onClick={()=>void save()}>保存已审阅的范围授权</button>
    </div>}
    {data&&data.eligible_tools.length===0&&<p className="mt-2 text-xs">当前插件没有匹配的可信范围适配器，继续使用单次审批。</p>}
    {data?.items.map(grant=><div key={grant.grant_id} className="mt-2 rounded border p-2 text-xs">
      <p className="break-all">{grant.tool} · {states[grant.state]||grant.state}</p>
      <p>已占用 {grant.reserved_calls}/{grant.max_calls} 次（含预留） · 到期 {new Date(grant.expires_ms).toLocaleString('zh-CN')}</p>
      <details><summary className="cursor-pointer">审阅的请求范围</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(grant.allowed_inputs,null,2)}</pre></details>
      {!grant.revoked_ms&&<button type="button" disabled={busy} className="mt-1 rounded border px-2 py-1" onClick={()=>void revoke(grant.grant_id)}>撤销范围授权</button>}
    </div>)}
    {open&&<button type="button" className="mt-2 rounded border px-2 py-1 text-xs" onClick={()=>setVersion(v=>v+1)}>刷新授权状态</button>}
    {message&&<p role="status" className="mt-2 text-xs">{message}</p>}
  </details>
}
