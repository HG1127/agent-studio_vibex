import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, ArrowRight, FolderOpen, Loader2, Lock, Play, RefreshCw, Search, Star, Trash2, X } from "lucide-react"
import { getPocketBaseUrl } from "@/lib/pb"
import { getStudioAccountInfo,vibexAuthHeaders } from "@/lib/studioAuth"
import {ORIGINAL_PG_UI_ENABLED} from '@/lib/studioBackend'
import {createOriginalHomeAgentApi,type OriginalHomeCatalogQuery} from '@/lib/originalHomeAgentApi'
import {originalHomeAgentForEditor} from '@/lib/originalHomeAgentEditor'
import type { SavedSpecRow } from "@/pages/Home/useHome"

type CatalogRow = SavedSpecRow & { favorite?:boolean }
type CatalogData = {items:CatalogRow[];totalItems:number;page:number;totalPages:number}
type Props = {
  savedList:SavedSpecRow[]
  isLoggedIn:boolean
  onOpenSaved:(row:SavedSpecRow)=>void
  onDeleteSaved:(id:string)=>void
}
const LIMIT=18
const createNativeHomeApi=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?createOriginalHomeAgentApi:null
const SORTS=[
  {value:"updated_desc",label:"最近修改"},
  {value:"created_desc",label:"最新创建"},
  {value:"name_asc",label:"名称 A–Z"},
  {value:"name_desc",label:"名称 Z–A"},
  {value:"favorite_desc",label:"收藏优先"},
]
export function AgentCatalog({savedList,isLoggedIn,onOpenSaved,onDeleteSaved}:Props){
  const nativeApi=useMemo(()=>{if(!createNativeHomeApi)return null;const employee=getStudioAccountInfo();return employee?createNativeHomeApi({employeeId:employee.id}):null},[])
  const [search,setSearch]=useState("")
  const [q,setQ]=useState("")
  const [source,setSource]=useState("all")
  const [favoriteOnly,setFavoriteOnly]=useState(false)
  const [sort,setSort]=useState("updated_desc")
  const [page,setPage]=useState(1)
  const [rows,setRows]=useState<CatalogRow[]>([])
  const [total,setTotal]=useState(0)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState("")
  const [actionError,setActionError]=useState("")
  const [busyFavorite,setBusyFavorite]=useState("")
  const [deleteId,setDeleteId]=useState("")
  const [refreshN,setRefreshN]=useState(0)
  const seq=useRef(0)
  const refresh=useCallback(()=>setRefreshN(n=>n+1),[])
  useEffect(()=>{
    const timer=window.setTimeout(()=>setQ(search.trim().slice(0,100)),260)
    return()=>window.clearTimeout(timer)
  },[search])
  useEffect(()=>{setPage(1)},[q,source,favoriteOnly,sort])
  useEffect(()=>{
    if(!isLoggedIn){setLoading(false);return}
    const controller=new AbortController(),sequence=++seq.current
    setLoading(true);setError("")
    const params=new URLSearchParams({
      page:String(page),perPage:String(LIMIT),sort,
      ...(q?{q}:{}),...(source!=="all"?{source}:{}),
      ...(favoriteOnly?{favorite:"1"}:{}),
    })
    void(async()=>{
      try{
        let data:CatalogData
        if(ORIGINAL_PG_UI_ENABLED){
          if(!nativeApi)throw Error('verified_employee_required')
          const result=await nativeApi.catalog({page,perPage:LIMIT,q,source:source as OriginalHomeCatalogQuery['source'],favorite:favoriteOnly,sort:sort as OriginalHomeCatalogQuery['sort']},controller.signal)
          data={...result,items:result.items.map(item=>({...originalHomeAgentForEditor(item),favorite:item.favorite}))}
        }else{
        const result=await fetch(getPocketBaseUrl()+"/api/agent_specs?"+params.toString(),{
          headers:{...vibexAuthHeaders()},signal:controller.signal,
        })
        if(!result.ok)throw new Error("not_available")
        data=await result.json() as CatalogData
        }
        if(!Array.isArray(data.items)||!Number.isFinite(data.totalItems))
          throw new Error("invalid_data")
        if(controller.signal.aborted||seq.current!==sequence)return
        const lastPage=Math.max(1,Math.ceil(data.totalItems/LIMIT))
        setTotal(data.totalItems)
        // Unstarring the last favorite or deleting the last item on a page
        // shrinks the server result set. Never strand the user on an empty
        // page that looks like their remaining Agents vanished.
        if(page>lastPage){
          setPage(lastPage)
          return
        }
        setRows(data.items)
      }catch{
        if(!controller.signal.aborted&&seq.current===sequence)
          setError("无法核验 Agent 列表，请检查网络或重新登录后重试。")
      }finally{
        if(!controller.signal.aborted&&seq.current===sequence)setLoading(false)
      }
    })()
    return()=>{controller.abort();seq.current++}
  },[isLoggedIn,page,q,source,favoriteOnly,sort,refreshN,savedList,nativeApi])
  useEffect(()=>{
    const onSaved=()=>refresh()
    const onFocus=()=>{if(document.visibilityState==="visible")refresh()}
    window.addEventListener("studio:agent-spec-saved",onSaved)
    window.addEventListener("focus",onFocus)
    return()=>{window.removeEventListener("studio:agent-spec-saved",onSaved)
      window.removeEventListener("focus",onFocus)}
  },[refresh])
  const pages=Math.max(1,Math.ceil(total/LIMIT))
  const pageNumbers=useMemo(()=>{
    const first=Math.max(1,Math.min(page-2,pages-4))
    return Array.from({length:Math.min(5,pages-first+1)},(_,i)=>first+i)
  },[page,pages])
  const toggleFavorite=async(row:CatalogRow)=>{
    if(busyFavorite)return
    setBusyFavorite(row.id);setActionError("")
    try{
      if(ORIGINAL_PG_UI_ENABLED){
        if(!nativeApi||!row.native_pg)throw Error('verified_agent_revision_required')
        await nativeApi.favorite(row.id,row.native_pg.revision,!row.favorite)
        refresh()
        return
      }
      const response=await fetch(getPocketBaseUrl()+"/api/agent_specs/"+encodeURIComponent(row.id)+"/favorite",{
        method:"POST",headers:{"Content-Type":"application/json",...vibexAuthHeaders()},
        body:JSON.stringify({favorite:!row.favorite}),
      })
      const data=await response.json().catch(()=>null)
      if(!response.ok||data?.favorite!==!row.favorite)throw new Error("unsaved")
      refresh()
    }catch{
      setActionError(ORIGINAL_PG_UI_ENABLED?'无法确认收藏操作是否完成，请刷新列表后核对，当前状态以服务器为准。':"收藏操作未保存，原状态仍以服务器为准，请重试。")
    }finally{setBusyFavorite("")}
  }
  if(!isLoggedIn)return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
    <Lock className="mr-2 inline h-4 w-4 text-primary"/>登录员工账号后可搜索并收藏你的 Agent。
  </div>
  return <section aria-label="我的 Agent 搜索、筛选与收藏" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
      <label className="relative min-w-64 flex-1 lg:max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
        <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
          aria-label="搜索 Agent 名称和方案内容" placeholder="搜索名称、目标、范围、步骤…"
          className="min-h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"/>
      </label>
      <select aria-label="按 Agent 来源筛选" value={source} onChange={e=>setSource(e.target.value)}
        className="min-h-10 rounded-lg border border-border bg-background px-3 text-xs">
        <option value="all">全部来源</option><option value="create">自主创建</option><option value="template">模板生成</option>
      </select>
      <button type="button" aria-pressed={favoriteOnly} onClick={()=>setFavoriteOnly(v=>!v)}
        className={"inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold "+(favoriteOnly?"border-primary bg-primary/10 text-primary":"border-border hover:bg-secondary")}>
        <Star className="h-4 w-4"/>仅看收藏
      </button>
      <select aria-label="Agent 排序" value={sort} onChange={e=>setSort(e.target.value)}
        className="min-h-10 rounded-lg border border-border bg-background px-3 text-xs">
        {SORTS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <span role="status" className="ml-auto text-xs text-muted-foreground">
        {loading?"加载中…":error?"暂不可用":"共 "+total+" 个 · 第 "+page+"/"+pages+" 页"}
      </span>
      <button type="button" onClick={refresh} disabled={loading} aria-label="刷新 Agent 列表"
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:bg-secondary disabled:opacity-40">
        <RefreshCw className="h-3.5 w-3.5"/>刷新
      </button>
    </div>
    {actionError&&<p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{actionError}</p>}
    {error&&<p role="alert" className="rounded-lg border border-destructive/30 bg-card p-3 text-xs text-destructive">
      {error}<button type="button" onClick={refresh} className="ml-2 font-semibold underline">重新加载</button>
    </p>}
    {!error&&loading&&<p role="status" className="flex items-center gap-2 rounded-lg bg-secondary/40 p-5 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin"/>正在读取服务器中的 Agent…
    </p>}
    {!error&&!loading&&rows.length===0&&<div className="rounded-xl border border-dashed border-border bg-card px-4 py-7 text-center text-sm text-muted-foreground">
      <FolderOpen className="mx-auto mb-2 h-5 w-5 text-primary"/>
      {q||source!=="all"||favoriteOnly?"没有符合条件的 Agent。":"还没有保存的 Agent。"}
      {(q||source!=="all"||favoriteOnly)&&<button type="button"
        onClick={()=>{setSearch("");setSource("all");setFavoriteOnly(false);setSort("updated_desc")}}
        className="ml-2 font-semibold text-primary underline">清除筛选</button>}
    </div>}
    {!error&&!loading&&rows.length>0&&<ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {rows.map(row=><li key={row.id}
        className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 transition hover:border-primary/35">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold" title={row.name}>{row.name||"未命名 Agent"}</h3>
            <p className="mt-1 line-clamp-2 min-h-9 text-xs leading-relaxed text-muted-foreground">{row.spec?.goal||"未设置目标"}</p>
          </div>
          <button type="button" disabled={Boolean(busyFavorite)} onClick={()=>void toggleFavorite(row)}
            aria-pressed={Boolean(row.favorite)}
            aria-label={(row.favorite?"取消收藏：":"收藏：")+(row.name||"Agent")}
            title={row.favorite?"取消收藏":"收藏"}
            className={"grid h-9 w-9 shrink-0 place-items-center rounded-lg border disabled:opacity-40 "+(row.favorite?"border-primary/40 bg-primary/10 text-primary":"border-border text-muted-foreground hover:text-primary")}>
            <Star className="h-4 w-4" fill={row.favorite?"currentColor":"none"}/>
          </button>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
          <span className="text-[11px] text-muted-foreground">
            {row.source==="template"?"模板创建":row.source==="create"?"自主创建":"来源未记录"} · {row.updated?new Date(row.updated).toLocaleDateString("zh-CN"):"时间未知"}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={()=>onOpenSaved(row)}
              aria-label={"编辑方案："+(row.name||"未命名 Agent")}
              className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-secondary">编辑方案</button>
            <Link to={"/agent-run?spec="+encodeURIComponent(row.id)}
              aria-label={"试跑 Agent："+(row.name||"未命名 Agent")}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              <Play className="h-3.5 w-3.5"/>试跑
            </Link>
          </div>
        </div>
        <div className="mt-3 flex justify-end border-t border-border pt-2">
          {deleteId===row.id?<div role="group" aria-label={"确认删除 "+(row.name||"Agent")}
            className="flex items-center gap-2">
            <span className="text-xs text-destructive">确定删除？</span>
            <button type="button" onClick={()=>{setDeleteId("");onDeleteSaved(row.id)}}
              className="min-h-9 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground">确认删除</button>
            <button type="button" onClick={()=>setDeleteId("")}
              className="inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground"><X className="h-3 w-3"/>取消</button>
          </div>:<button type="button" onClick={()=>setDeleteId(row.id)}
            aria-label={"删除 "+(row.name||"Agent")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5"/>删除
          </button>}
        </div>
      </li>)}
    </ul>}
    {!error&&!loading&&pages>1&&<nav aria-label="Agent 列表分页"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">显示 {(page-1)*LIMIT+1}–{Math.min(total,page*LIMIT)}，共 {total} 个</p>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={page<=1} onClick={()=>setPage(v=>Math.max(1,v-1))}
          aria-label="Agent 上一页" className="grid h-9 w-9 place-items-center rounded-lg border border-border disabled:opacity-35">
          <ArrowLeft className="h-4 w-4"/>
        </button>
        {pageNumbers.map(n=><button key={n} type="button"
          aria-current={n===page?"page":undefined} onClick={()=>setPage(n)}
          className={"min-h-9 min-w-9 rounded-lg border px-2 text-xs "+(n===page?"border-primary bg-primary/10 font-semibold text-primary":"border-border hover:bg-secondary")}>{n}</button>)}
        <button type="button" disabled={page>=pages} onClick={()=>setPage(v=>Math.min(pages,v+1))}
          aria-label="Agent 下一页" className="grid h-9 w-9 place-items-center rounded-lg border border-border disabled:opacity-35">
          <ArrowRight className="h-4 w-4"/>
        </button>
      </div>
    </nav>}
  </section>
}
