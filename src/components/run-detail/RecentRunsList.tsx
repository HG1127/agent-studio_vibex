import {useState} from 'react'
import {ChevronLeft,ChevronRight,History,Loader2,Plus,RefreshCw,Search} from 'lucide-react'
import {Link} from 'react-router-dom'
import type {RunStateKey} from '@/pages/AgentRun/useAgentRun'
import {formatRunDetailTime} from '@/pages/RunDetail/useRunDetail'
import {ARCHIVE_STATUSES,type ArchiveStatus,type ArchiveDays} from '@/lib/runArchive'
import type {useRunArchive} from '@/lib/useRunArchive'
import {WorkspaceEmptyState} from '@/components/site/WorkspaceEmptyState'
const field='min-h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm'
const secondary='inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-secondary disabled:opacity-40'
type Props={archive:ReturnType<typeof useRunArchive>;stateMeta:Record<RunStateKey,{label:string;badge:string}>;onSelect:(id:string)=>void}
export function RecentRunsList({archive:a,stateMeta,onSelect}:Props){
 const {query,data}=a
 const [draft,setDraft]=useState({forQuery:query.q,value:query.q})
 const text=draft.forQuery===query.q?draft.value:query.q
 const filtered=!!query.q||query.status!=='all'||query.days!=='all'
 const clear=()=>{setDraft({forQuery:'',value:''});a.reset()}
 return <section aria-label="运行记录工作区" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
   <div><h2 className="flex items-center gap-2 text-base font-semibold"><History className="h-4 w-4 text-primary"/>运行记录</h2><p className="mt-1 text-xs text-muted-foreground">按任务、Agent 名称或编号查找；仅显示本人记录。</p></div>
   <div className="flex items-center gap-2"><button type="button" className={secondary} disabled={a.refreshing} onClick={()=>void a.refresh()} aria-label="刷新运行记录"><RefreshCw className={'h-4 w-4 '+(a.refreshing?'animate-spin':'')}/><span className="hidden sm:inline">刷新</span></button><Link to="/agent-run" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4"/>发起运行</Link></div>
  </div>
  <form aria-label="筛选运行记录" onSubmit={e=>{e.preventDefault();a.change({q:text.trim()})}} className="flex min-w-0 flex-wrap items-end gap-2 border-b border-border bg-secondary/15 px-4 py-3 sm:px-5">
   <label className="min-w-0 flex-[1_1_240px]"><span className="sr-only">搜索运行记录</span><span className="flex min-h-10 items-center gap-2 rounded-lg border border-input bg-background px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground"/><input value={text} onChange={e=>setDraft({forQuery:query.q,value:e.target.value})} maxLength={120} placeholder="搜索任务、Agent 名称或运行编号" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"/></span></label>
   <button type="submit" className={secondary}>搜索</button>
   <label><span className="sr-only">运行状态筛选</span><select className={field+' max-w-full'} value={query.status} onChange={e=>a.change({status:e.target.value as ArchiveStatus})}>{ARCHIVE_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
   <label><span className="sr-only">运行时间范围</span><select className={field} value={query.days} onChange={e=>a.change({days:e.target.value as ArchiveDays})}><option value="all">全部时间</option><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="90">近 90 天</option></select></label>
   {filtered&&<button type="button" className="min-h-10 px-2 text-xs font-medium text-primary hover:underline" onClick={clear}>清除筛选</button>}
  </form>
  {data?.legacy&&<p role="status" className="border-b border-border bg-secondary/30 px-4 py-2 text-xs leading-5 text-muted-foreground">当前后端仅提供最近 20 条记录，筛选只针对这些记录；完整历史分页需加载新版后端。未将近期记录冒充全部历史。</p>}
  {a.error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"><p>{a.error}{data?'。下方保留上次读取结果。':''}</p><button type="button" className={secondary} onClick={()=>void a.refresh()} disabled={a.refreshing}>重新加载记录</button></div>}
  {a.loading?<div role="status" className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>正在读取运行记录…</div>:!a.error&&data&&!data.items.length?<div className="p-4"><WorkspaceEmptyState icon={History} title={filtered?'没有符合条件的记录':'还没有运行记录'} description={filtered?'调整搜索、状态或时间范围；不会创建或执行新任务。':'发起第一次运行后，任务状态、结果和详情会显示在这里。'} actions={filtered?<button type="button" className={secondary} onClick={clear}>显示全部记录</button>:undefined}/></div>:data&&data.items.length>0?<table aria-label="运行记录列表" className="w-full table-fixed text-left text-sm">
   <thead className="bg-secondary/20 text-xs text-muted-foreground"><tr><th scope="col" className="px-4 py-2.5 font-medium sm:px-5">任务 / Agent</th><th scope="col" className="w-24 px-2 py-2.5 font-medium sm:w-28">状态</th><th scope="col" className="hidden w-24 px-3 py-2.5 font-medium md:table-cell">步数</th><th scope="col" className="hidden w-44 px-3 py-2.5 font-medium lg:table-cell">模型</th><th scope="col" className="hidden w-44 px-3 py-2.5 font-medium sm:table-cell">开始时间</th><th scope="col" className="w-12 px-2 py-2.5"><span className="sr-only">操作</span></th></tr></thead>
   <tbody className="divide-y divide-border">{data.items.map(row=>{const meta=stateMeta[row.status]||{label:'未知状态',badge:'bg-secondary text-muted-foreground'};return <tr key={row.id} className="align-middle hover:bg-secondary/20">
    <td className="px-4 py-3 sm:px-5"><button type="button" className="block w-full min-w-0 text-left focus-visible:ring-2 focus-visible:ring-primary" onClick={()=>onSelect(row.id)} aria-label={'查看运行：'+(row.instruction||row.spec_name||row.id)}><span title={row.instruction} className="block truncate font-medium text-foreground">{row.instruction||'未记录任务指令'}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{row.spec_name||'历史 Agent'} · {row.id}{row.source==='acceptance_test'?' · 验收测试':''}</span><span className="mt-1 block text-[11px] text-muted-foreground sm:hidden">{formatRunDetailTime(row.created)}</span></button></td>
    <td className="px-2 py-3"><span className={'inline-block max-w-full rounded-md px-2 py-1 text-xs font-medium '+meta.badge}>{meta.label}</span></td>
    <td className="hidden px-3 py-3 text-xs tabular-nums text-muted-foreground md:table-cell">{row.current_step} / {row.max_steps}</td>
    <td className="hidden truncate px-3 py-3 text-xs text-muted-foreground lg:table-cell" title={row.model}>{row.model||'未记录'}</td>
    <td className="hidden px-3 py-3 text-xs tabular-nums text-muted-foreground sm:table-cell">{formatRunDetailTime(row.created)}</td>
    <td className="px-2 py-3"><button type="button" className="inline-flex min-h-10 w-9 items-center justify-center rounded-lg text-primary hover:bg-primary/10" aria-label={'打开运行详情 '+row.id} onClick={()=>onSelect(row.id)}><ChevronRight className="h-4 w-4"/></button></td>
   </tr>})}</tbody>
  </table>:null}
  {data&&<nav aria-label="运行记录分页" className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5"><span>{data.legacy?'近期快照 · 当前显示 '+data.items.length+' 条':'共 '+data.totalItems+' 条 · 每页 20 条'}{a.refreshing?' · 更新中':''}</span><div className="flex items-center gap-2"><button type="button" className={secondary} aria-label="上一页运行记录" disabled={data.legacy||a.refreshing||data.page<=1} onClick={()=>a.change({page:data.page-1})}><ChevronLeft className="h-4 w-4"/></button><span className="tabular-nums">第 {data.page} / {data.totalPages} 页</span><button type="button" className={secondary} aria-label="下一页运行记录" disabled={data.legacy||a.refreshing||data.page>=data.totalPages} onClick={()=>a.change({page:data.page+1})}><ChevronRight className="h-4 w-4"/></button></div></nav>}
 </section>
}
