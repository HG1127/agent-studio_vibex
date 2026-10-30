import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {readOriginalMonitorInbox,markOriginalMonitorRead} from '@/lib/originalHomeInboxData'
type Cursor={after_ms:number;after_id:string}
type Item={item_id:string;monitor_id:string;case_id:string;check_id:string;kind:string;title:string;created_ms:number}
type Page={items:Item[];has_more:boolean;next_cursor:Cursor|null}
const labels:Record<string,string>={needs_review:'待复核',incomplete:'检查未完成',configuration_required:'配置需重新核对',source_unavailable:'来源不可用',additional_role:'新增角色',role_started:'新增任职',role_ended:'明确结束',conflict:'事实冲突',source_invalidated:'依据失效',fact_corrected:'事实更正'}
export function MonitorInbox(){
  const [page,setPage]=useState<Page|null>(null),[cursor,setCursor]=useState<Cursor|null>(null),[version,setVersion]=useState(0),[error,setError]=useState(false)
  const [reading,setReading]=useState(''),[actionError,setActionError]=useState(false)
  const cursorMs=cursor?.after_ms||0,cursorId=cursor?.after_id||''
  useEffect(()=>{const abort=new AbortController();setError(false)
    void readOriginalMonitorInbox(cursorId?{after_ms:cursorMs,after_id:cursorId}:null,abort.signal).then(r=>{if(!abort.signal.aborted)setPage(r)}).catch(()=>{if(!abort.signal.aborted){setPage(null);setError(true)}})
    return ()=>abort.abort()
  },[cursorMs,cursorId,version])
  useEffect(()=>{const timer=window.setInterval(()=>setVersion(v=>v+1),30000);return ()=>window.clearInterval(timer)},[])
  async function read(item:Item){setReading(item.item_id);setActionError(false);try{await markOriginalMonitorRead(item.item_id.slice(6));setVersion(v=>v+1)}catch{setActionError(true)}finally{setReading('')}}
  return <section aria-label="监测待办与变化事件" className="mt-4 rounded-xl border border-border bg-background p-4">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">监测待办与变化事件</h3><button type="button" className="rounded border px-2 py-1 text-xs" onClick={()=>{setCursor(null);setVersion(v=>v+1)}}>刷新监测消息</button></div>
    {error?<p role="alert" className="mt-2 text-xs text-destructive">当前无法核对监测消息，请刷新重试。</p>:!page?<p className="mt-2 text-xs text-muted-foreground">正在核对当前员工的监测…</p>:<>
      {page.items.length===0?<p className="mt-2 text-xs text-muted-foreground">本页暂无当前可处理的监测消息；没有变化时保持安静。</p>:<ul className="mt-2 divide-y divide-border">{page.items.map(item=><li className="flex flex-wrap items-center justify-between gap-2 py-2" key={item.item_id}><div><p className="text-sm">{item.title}</p><p className="text-xs text-muted-foreground">{labels[item.kind]||item.kind} · {new Date(item.created_ms).toLocaleString()}</p></div><div className="flex gap-2"><Link className="rounded border px-2 py-1 text-xs underline" to={'/agent-run?'+new URLSearchParams({case:item.case_id,monitor:item.monitor_id,check:item.check_id,...(item.item_id.startsWith('event:')?{event:item.item_id.slice(6)}:{})})}>查看监测</Link>{item.item_id.startsWith('event:')&&<button type="button" className="rounded border px-2 py-1 text-xs" disabled={Boolean(reading)} onClick={()=>void read(item)}>{reading===item.item_id?'正在更新…':'标为已读'}</button>}</div></li>)}</ul>}
      <div className="mt-2 flex gap-2">{cursor&&<button type="button" className="rounded border px-2 py-1 text-xs" onClick={()=>setCursor(null)}>返回消息首页</button>}{page.has_more&&page.next_cursor&&<button type="button" className="rounded border px-2 py-1 text-xs" onClick={()=>{setPage(null);setCursor(page.next_cursor)}}>下一页监测消息</button>}</div>
    </>}
    {actionError&&<p role="alert" className="mt-2 text-xs text-destructive">消息未确认已读，请重试。</p>}
  </section>
}
