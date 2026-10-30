import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown,
  ExternalLink, KeyRound, Loader2, LockKeyhole, PlugZap, RotateCcw,
  Search, Server, ShieldAlert, Wrench, X,
} from "lucide-react"
import type { usePluginMarket, SmitheryItem } from "@/pages/PluginMarket/usePluginMarket"
import {
  SMITHERY_CATEGORIES, connectionForSmithery, smitheryConnectionStatus,
  smitheryStatusLabel, type SmitheryCategory,
} from "@/lib/smitheryMarketplace"

type Props={p:ReturnType<typeof usePluginMarket>}
const keyLink="https://smithery.ai/account/api-keys"
const namespacesLink="https://smithery.ai/docs/use/connect#namespaces"

export function SmitheryConnectCard({p}:Props){
  const [category,setCategory]=useState<SmitheryCategory>("all")
  const [advanced,setAdvanced]=useState(false)
  const [replaceKey,setReplaceKey]=useState(false)
  const [chosenTab,setCurrentTab]=useState<"browse"|"connected"|null>(null)
  const currentTab=chosenTab||(p.smitheryQuery.trim()?'browse':p.connectionRows.some(row=>row.is_smithery===true)?'connected':'browse')
  const [showOnlyVerified,setShowOnlyVerified]=useState(false)
  const dialogRef=useRef<HTMLDivElement|null>(null)
  const results=useMemo(()=>{
    const list:SmitheryItem[]=currentTab==="connected"
      ? p.connectionRows.filter(row=>row.is_smithery===true).map(row=>
          p.smitheryItems.find(item=>item.slug===row.server_name)||{
            slug:row.server_name,title:row.title||row.server_name,
            desc:row.last_probe_msg||"已添加的 Smithery 托管连接",
          })
      : p.smitheryItems
    return showOnlyVerified ? list.filter(it=>it.verified===true) : list
  },[p.smitheryItems,p.connectionRows,currentTab,showOnlyVerified])
  const selected=p.smitherySelected
  const setSelected=p.setSmitherySelected
  const own=selected?connectionForSmithery(selected,p.connectionRows):undefined
  const state=smitheryConnectionStatus(own)
  const outcome=p.smitheryConnectionResult
  const correspondingOutcome=outcome && own?.id===outcome.id?outcome:
    outcome && !own ? outcome:null
  const ready=state==="ready"
  const needsAuth=Boolean(correspondingOutcome && ["auth_required","input_required"].includes(correspondingOutcome.state))
  const setupUrl=correspondingOutcome?.setup_url||""
  const slugItem=(title:string)=>String(title||"?").trim().slice(0,1).toUpperCase()

  useEffect(()=>{
    if(!selected)return
    const before=document.activeElement as HTMLElement|null
    const task=window.setTimeout(()=>dialogRef.current?.focus(),0)
    const onEscape=(event:KeyboardEvent)=>{
      if(event.key==="Escape")setSelected(null)
    }
    window.addEventListener("keydown",onEscape)
    return ()=>{
      window.clearTimeout(task)
      window.removeEventListener("keydown",onEscape)
      if(before?.isConnected)window.setTimeout(()=>before.focus(),0)
    }
  },[selected,setSelected])
  const search=(query:string)=>{
    setCategory("all")
    setCurrentTab("browse")
    void p.loadSmitheryServers(query,1)
  }
  const categorySearch=(id:SmitheryCategory,q:string)=>{
    setCategory(id)
    p.setSmitheryQuery(q)
    setCurrentTab("browse")
    void p.loadSmitheryServers(q,1)
  }

  return <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6" aria-label="Smithery 插件探索和连接">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <PlugZap className="h-5 w-5 text-primary"/>探索插件
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          先复用已有插件，不重复填写密钥。首次连接时才授权账号；验证工具后返回 Agent 明确选用，不会自动扩大角色权限。
        </p>
      </div>
      <a href="https://smithery.ai" target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:bg-secondary">
        Smithery 官网 <ExternalLink className="h-3.5 w-3.5"/>
      </a>
    </div>

    <div className="mt-4 rounded-xl border border-border bg-background p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {p.hasSmitheryKey?<CheckCircle2 className="h-4 w-4 text-primary"/>:
            <LockKeyhole className="h-4 w-4 text-muted-foreground"/>}
          {p.hasSmitheryKey?"Smithery 账号密钥已保存":"第一步 · 连接 Smithery 账号"}
        </div>
        {p.hasSmitheryKey && <span className="text-xs text-muted-foreground">
          已加密保存 · 尾号 ••••{p.smitheryKeyTail}
        </span>}
      </div>
      {(!p.hasSmitheryKey || replaceKey) ? <>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {replaceKey
            ? "更换 Key 后，之前的托管插件会暂时停用；完成新 Key 验证后，可逐个检查授权恢复使用。"
            : "先在 Smithery 后台创建 API Key。密钥只提交给 Agent Studio 服务端进行加密保存，不会通过插件 URL 传输。"}
        </p>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={event=>{
          event.preventDefault()
          void p.saveSmitheryKey()
        }}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Smithery API Key</span>
            <input type="password" autoComplete="off" spellCheck={false}
              value={p.smitheryKeyInput} onChange={event=>p.setSmitheryKeyInput(event.target.value)}
              placeholder="粘贴你的 Smithery API Key"
              className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"/>
          </label>
          <button type="submit" disabled={!p.smitheryKeyInput.trim() || p.smitheryKeyBusy}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {p.smitheryKeyBusy?<Loader2 className="h-4 w-4 animate-spin"/>:<KeyRound className="h-4 w-4"/>}
            验证并保存
          </button>
        </form>
        {replaceKey && <button type="button" onClick={()=>setReplaceKey(false)}
          className="mt-2 min-h-9 text-xs text-muted-foreground hover:text-primary">取消更换</button>}
        <a href={keyLink} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          去 Smithery 创建 API Key <ExternalLink className="h-3.5 w-3.5"/>
        </a>
      </> : <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Server className="h-4 w-4 shrink-0"/>
          <label htmlFor="smithery-namespace">工作空间 Namespace</label>
          <select id="smithery-namespace" value={p.smitheryNamespace}
            onChange={event=>p.setSmitheryNamespace(event.target.value)}
            disabled={p.smitheryNamespacesBusy||p.smitheryNamespaces.length===0}
            className="min-h-10 min-w-32 max-w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground">
            {!p.smitheryNamespaces.length && <option value="">未找到工作空间</option>}
            {p.smitheryNamespaces.map(ns=><option key={ns} value={ns}>{ns}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={()=>void p.loadSmitheryNamespaces()}
            disabled={p.smitheryNamespacesBusy}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-secondary">
            <RotateCcw className="h-3.5 w-3.5"/>刷新
          </button>
          <button type="button" onClick={()=>setReplaceKey(true)}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-secondary">
            <KeyRound className="h-3.5 w-3.5"/>更换 Key
          </button>
          <button type="button" onClick={()=>void p.removeSmitheryKey()}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-secondary">移除 Key</button>
        </div>
      </div>}
      {p.hasSmitheryKey && !p.smitheryNamespacesBusy && !p.smitheryNamespaces.length &&
        <div role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0"/>尚无可用的 Smithery Namespace。请在官网创建工作空间后点击刷新。
          <a target="_blank" rel="noopener noreferrer" href={namespacesLink}
            className="font-semibold text-primary underline-offset-2 hover:underline">查看创建方法</a>
        </div>}
    </div>

    {p.hasSmitheryKey && <>
      <div className="mt-5 flex flex-wrap gap-2 border-b border-border pb-3">
        {([{id:"browse",label:"探索插件"},{id:"connected",label:"已添加"}] as const).map(tab=>
          <button key={tab.id} type="button"
            aria-pressed={currentTab===tab.id} onClick={()=>setCurrentTab(tab.id)}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${currentTab===tab.id?"bg-primary/10 text-primary":"text-muted-foreground hover:bg-secondary"}`}>
            {tab.label}
          </button>)}
        <span className="ml-auto self-center text-xs text-muted-foreground">
          显示 {results.length} 项{p.smitheryNextPage?" · 可加载更多":""}
        </span>
      </div>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={event=>{
        event.preventDefault();search(p.smitheryQuery)
      }}>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <input aria-label="搜索 Smithery 插件名称和功能" type="search"
            value={p.smitheryQuery}
            onChange={event=>p.setSmitheryQuery(event.target.value)}
            placeholder="例如 GitHub、Notion、搜索、数据库、金融研究…"
            className="min-h-12 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"/>
        </div>
        <button type="submit" disabled={p.smitheryLoading}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {p.smitheryLoading?<Loader2 className="h-4 w-4 animate-spin"/>:<Search className="h-4 w-4"/>}
          搜索插件
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="快速探索分类">
        {SMITHERY_CATEGORIES.map(item=><button key={item.id} type="button"
          onClick={()=>categorySearch(item.id,item.query)}
          aria-pressed={category===item.id}
          className={`min-h-9 rounded-full border px-3 text-xs transition ${category===item.id?"border-primary bg-primary/10 font-semibold text-primary":"border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
          {item.label}
        </button>)}
      </div>
      <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={showOnlyVerified}
          onChange={event=>setShowOnlyVerified(event.target.checked)}
          className="accent-primary"/>
        只看明确标记为已验证的发布者
      </label>
      {p.smitheryError && <div role="alert" className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">
        <AlertCircle className="mr-1 inline h-4 w-4"/>{p.smitheryError}
        <button type="button" className="ml-2 underline" onClick={()=>search(p.smitheryActiveQuery)}>重试搜索</button>
      </div>}
      {p.smitheryLoading ? <div role="status" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({length:6},(_,i)=><div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-secondary/50"/>)}
      </div> : results.length===0 ? <div className="mt-5 rounded-xl border border-dashed border-border px-4 py-10 text-center">
        <Search className="mx-auto h-7 w-7 text-muted-foreground"/>
        <p className="mt-2 text-sm font-semibold">{currentTab==="connected"?"当前结果中没有已添加的插件":"没有找到匹配的插件"}</p>
        <p className="mt-1 text-xs text-muted-foreground">试试更短的英文关键词，或切换到其他分类。</p>
      </div> : <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {results.map(item=>{
          const row=connectionForSmithery(item,p.connectionRows)
          const status=smitheryConnectionStatus(row)
          return <li key={item.slug} className="flex min-h-44 flex-col rounded-xl border border-border bg-background p-4 transition hover:border-primary/40 hover:shadow-sm">
            <div className="flex items-start gap-3">
              <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                {slugItem(item.zh_title||item.title||item.slug)}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-foreground">{item.zh_title||item.title||item.slug}</h3>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.slug}</p>
              </div>
              {item.verified===true&&<span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">已验证</span>}
            </div>
            <p className="mt-3 line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">
              {item.zh_desc||item.desc||"插件暂无公开说明，建议先查看发布者页面。"}
            </p>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className={`text-xs ${status==="ready"?"font-semibold text-primary":status==="error"||status==="legacy"?"text-destructive":"text-muted-foreground"}`}>
                {status==="ready"?<CheckCircle2 className="mr-1 inline h-3.5 w-3.5"/>:null}
                {smitheryStatusLabel(status)}{row&&status==="ready"?` · ${row.tool_count} 个工具`:""}
              </span>
              <button type="button" onClick={()=>{
                p.setSmitheryConnectionResult(null)
                p.setSmitherySelected(item)
              }}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary">
                {status==="ready"?"查看工具":"查看并连接"} <ArrowRight className="h-3.5 w-3.5"/>
              </button>
            </div>
          </li>
        })}
      </ul>}
      {p.smitheryNextPage>0 && currentTab==="browse" &&
        <button type="button" disabled={p.smitheryLoadingMore} onClick={()=>
          void p.loadSmitheryServers(p.smitheryActiveQuery,p.smitheryNextPage)}
          className="mx-auto mt-5 flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm text-foreground hover:bg-secondary disabled:opacity-50">
          {p.smitheryLoadingMore?<Loader2 className="h-4 w-4 animate-spin"/>:<ChevronDown className="h-4 w-4"/>}
          {p.smitheryLoadingMore?"加载中…":"加载下一页"}
        </button>}
    </>}

    <div className="mt-5 border-t border-border pt-4">
      <button type="button" aria-expanded={advanced} onClick={()=>setAdvanced(!advanced)}
        className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary">
        <Wrench className="h-4 w-4"/>高级：连接自建 / 企业内部 MCP
        <ChevronDown className={`h-4 w-4 transition ${advanced?"rotate-180":""}`}/>
      </button>
      {advanced && <div className="mt-2 space-y-3 rounded-xl bg-secondary/40 p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          仅在信任服务提供方时使用。外部 MCP 可能读取资料或执行写操作，敏感工具需遵守已有审批与权限控制。
        </p>
        <label className="block text-xs text-muted-foreground">插件名称
          <input value={p.customName} onChange={event=>p.setCustomName(event.target.value)}
            placeholder="例如 内部文档检索"
            className="mt-1 min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"/>
        </label>
        <label className="block text-xs text-muted-foreground">MCP HTTPS 地址
          <input type="url" value={p.customUrl} onChange={event=>p.setCustomUrl(event.target.value)}
            placeholder="https://mcp.example.com/mcp"
            className="mt-1 min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"/>
        </label>
        <label className="block text-xs text-muted-foreground">Bearer Token（可选）
          <input type="password" autoComplete="off" value={p.customToken}
            onChange={event=>p.setCustomToken(event.target.value)} placeholder="仅发送服务端进行加密连接"
            className="mt-1 min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"/>
        </label>
        <button type="button" disabled={!p.customUrl.trim()||p.customBusy}
          onClick={()=>void p.connectCustomPlugin()}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {p.customBusy?<Loader2 className="h-4 w-4 animate-spin"/>:<PlugZap className="h-4 w-4"/>}
          验证并连接
        </button>
      </div>}
    </div>

    {selected && <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-5" role="presentation">
      <button type="button" onClick={()=>p.setSmitherySelected(null)}
        aria-label="关闭插件详情" className="absolute inset-0 bg-black/50"/>
      <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}
        aria-label={`连接插件 ${selected.title}`}
        className="relative flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">Smithery 插件连接</p>
            <h2 className="mt-1 truncate text-xl font-bold">{selected.zh_title||selected.title}</h2>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{selected.slug}</p>
          </div>
          <button type="button" onClick={()=>p.setSmitherySelected(null)}
            aria-label="关闭插件详情" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-secondary">
            <X className="h-5 w-5"/>
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <p className="text-sm leading-relaxed text-foreground">{selected.zh_desc||selected.desc||"暂无完整插件介绍"}</p>
          <a href={selected.homepage||"https://smithery.ai"} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            查看 Smithery 插件页面 <ExternalLink className="h-3.5 w-3.5"/>
          </a>
          <section className="rounded-xl border border-border bg-background p-3">
            <h3 className="text-sm font-semibold">连接前须知</h3>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
              <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-primary"/>Smithery 托管授权：按插件要求完成 OAuth 或 API Key 配置。</li>
              <li className="flex gap-2"><ShieldAlert className="h-4 w-4 shrink-0"/>插件可能读取第三方账户信息或执行写操作。请核对提供者和授权范围。</li>
              <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-primary"/>只有成功读取工具清单后，才会在 Agent Studio 中启用。</li>
            </ul>
          </section>
          {own && <div className="rounded-xl border border-border bg-background p-3 text-sm">
            <p className="font-semibold">当前连接：{smitheryStatusLabel(state)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {ready?`已通过工具发现，可以调用 ${own.tool_count} 个工具。`:
                own.last_probe_msg||"连接尚未准备就绪，请重新核验。"}
            </p>
            {ready&&own.tools?.length>0&&<ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
              {own.tools.slice(0,12).map(tool=><li key={tool.name}
                className="truncate rounded-lg border border-border bg-card px-2 py-1.5 font-mono text-xs">{tool.name}</li>)}
            </ul>}
          </div>}
          {correspondingOutcome && <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm font-semibold">{correspondingOutcome.message||smitheryStatusLabel(state)}</p>
            {!!correspondingOutcome.missing.length&&<p className="mt-1 text-xs text-muted-foreground">
              待填写：{correspondingOutcome.missing.join("、")}
            </p>}
            {needsAuth&&setupUrl&&<a href={setupUrl} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">
              打开 Smithery 官方授权页面 <ExternalLink className="h-4 w-4"/>
            </a>}
            {needsAuth&&!setupUrl&&<p className="mt-2 text-xs text-destructive">
              服务端未返回可信的官方授权链接。请先在 Smithery 官网完成此连接的授权配置。
            </p>}
          </div>}
          {p.smitheryError&&<p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {p.smitheryError}
          </p>}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card p-4">
          <button type="button" onClick={()=>p.setSmitherySelected(null)}
            className="min-h-10 rounded-lg border border-border px-4 text-xs hover:bg-secondary">稍后再说</button>
          <div className="flex flex-wrap gap-2">
            {own && <button type="button" disabled={Boolean(p.smitheryConnectBusy)}
              onClick={()=>void p.refreshSmitheryConnection(own)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-secondary disabled:opacity-40">
              <RotateCcw className="h-4 w-4"/>授权完成，检查工具
            </button>}
            {!own && <button type="button" disabled={Boolean(p.smitheryConnectBusy)||!p.smitheryNamespace}
              onClick={()=>void p.connectSmithery(selected)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40">
              {p.smitheryConnectBusy?<Loader2 className="h-4 w-4 animate-spin"/>:<PlugZap className="h-4 w-4"/>}
              创建托管连接
            </button>}
          </div>
        </footer>
      </div>
    </div>}
  </section>
}
