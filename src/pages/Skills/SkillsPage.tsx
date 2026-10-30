import {useCallback,useEffect,useMemo,useState} from "react"
import {BookOpen,ExternalLink,FileUp,Link2,RefreshCw,ShieldAlert,ShieldCheck,Search,Upload} from "lucide-react"

import {SiteShell} from "@/components/site/SiteShell"
import {ReturnToAgentResources} from "@/components/site/ReturnToAgentResources"
import {loadSkillSummaries,skillApi,type SkillDetail,type SkillSummary} from "@/lib/skillLibrary"
import {SkillABReview} from "@/components/skills/SkillABReview"
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog"
import {confirmInStudio} from "@/lib/studioDialogs"

type ImportMode="github"|"file"|"paste"
export default function SkillsPage() {
  const [items,setItems]=useState<SkillSummary[]>([])
  const [selectedId,setSelectedId]=useState("")
  const [viewVersion,setViewVersion]=useState(0)
  const [detail,setDetail]=useState<SkillDetail|null>(null)
  const [mode,setMode]=useState<ImportMode>("github")
  const [source,setSource]=useState("")
  const [query,setQuery]=useState("")
  const [reviewed,setReviewed]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [importOpen,setImportOpen]=useState(false)
  const [loading,setLoading]=useState(true)
  const closeImport=async()=>{
    if(busy)return
    if(source.trim()&&!await confirmInStudio("导入内容尚未提交，确认清空并关闭？"))return
    setSource("");setImportOpen(false)
  }
  const refresh=useCallback(async()=>{
    try{const rows=await loadSkillSummaries();setItems(rows);setSelectedId(id=>rows.some(item=>item.id===id)?id:(rows[0]?.id||""));setError("")}
    catch(e){setError(String((e as Error).message||"Skill 加载失败"))}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{
    let active=true
    void loadSkillSummaries().then(rows=>{
      if(active){setItems(rows);setSelectedId(id=>rows.some(item=>item.id===id)?id:(rows[0]?.id||""));setError("")}
    }).catch(e=>{if(active)setError(String((e as Error).message||"Skill 加载失败"))})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[])
  const selected=items.find(x=>x.id===selectedId)
  const requestedVersion=viewVersion||selected?.latest_version||0
  const selectedDetail=detail?.id===selectedId&&detail.version===requestedVersion?detail:null
  useEffect(()=>{
    let live=true
    if(!selectedId||!selected?.latest_version)return
    const version=viewVersion>0?viewVersion:selected.latest_version
    if(version>selected.latest_version)return
    void skillApi<SkillDetail>("/detail?id="+encodeURIComponent(selectedId)+
      "&version="+version).then(data=>{if(live)setDetail(data)})
      .catch(e=>{if(live)setError(String(e.message||"无法读取 Skill 版本"))})
    return()=>{live=false}
  },[selectedId,viewVersion,selected?.latest_version,selected?.approved_version,selected?.updated_ms])
  const filtered=useMemo(()=>items.filter(x=>(x.name+" "+x.description).toLowerCase().includes(query.toLowerCase())),[items,query])
  const importSkill=async()=>{
    setBusy(true);setError("");setNotice("")
    try{
      const payload=mode==="github"?{github_url:source.trim()}:{source}
      const response=await skillApi<{item:{id:string;name:string;version:number;warnings:string[]}}>("/import",payload)
      await refresh()
      setSelectedId(response.item.id)
      setViewVersion(0)
      setSource("")
      setReviewed(false)
      setImportOpen(false)
      setDetail(null)
      setNotice("已导入 "+response.item.name+" v"+response.item.version+"；请检查原始内容，再明确审核启用。"+
        (response.item.warnings.length?" "+response.item.warnings.join("；"):""))
    }catch(e){setError(String((e as Error).message))}
    finally{setBusy(false)}
  }
  const approve=async()=>{
    if(!selectedDetail||!reviewed)return
    setBusy(true);setError("")
    try{
      await skillApi("/approve",{id:selectedDetail.id,version:selectedDetail.version,confirm_review:true})
      setNotice(selectedDetail.name+" v"+selectedDetail.version+" 已通过当前员工审核，可以绑定到 Agent 角色。")
      await refresh()
      setReviewed(false)
    }catch(e){setError(String((e as Error).message))}
    finally{setBusy(false)}
  }
  const setActive=async(active:boolean)=>{
    if(!selected)return
    setBusy(true);setError("")
    try{
      await skillApi("/active",{id:selected.id,active})
      await refresh()
      setNotice(active?"Skill 已重新启用":"Skill 已停用，新 Agent 运行不能再加载它；历史快照保持原样。")
    }catch(e){setError(String((e as Error).message))}
    finally{setBusy(false)}
  }
  return <SiteShell>
    <main data-studio-fluid-page="skills" className="w-full min-w-0 space-y-5 px-4 pb-16 pt-6 lg:px-8 2xl:px-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-primary">工具与连接 / Skills</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold"><BookOpen className="h-6 w-6"/>Skill 能力中心</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">管理可复用的分析方法，审核后按角色加载。不执行外部脚本、不自动授权工具。</p>
          <nav aria-label="Skill 使用流程" className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <button type="button" onClick={()=>setImportOpen(true)} className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-primary">导入方法</button><span aria-hidden>→</span>
            <span className="rounded-lg border border-border bg-card px-3 py-1.5">{selectedDetail?.approved?"当前版本已审核":"审查版本原文"}</span><span aria-hidden>→</span>
            <span className="rounded-lg border border-border bg-card px-3 py-1.5">在 Agent 角色中选用</span>
          </nav>
        </div>
        <button type="button" onClick={()=>setImportOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Upload className="h-4 w-4"/>导入 Skill</button>
      </header>
      <ReturnToAgentResources what="Skill 方法"/>
      {error&&<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {notice&&<div role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{notice}</div>}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(265px,320px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(280px,350px)_minmax(0,1fr)]">
        <section aria-label="我的 Skills" className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm xl:sticky xl:top-16">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">我的 Skills <span className="ml-1 text-xs font-normal text-muted-foreground">{items.length}/50</span></h2>
            <button type="button" onClick={()=>void refresh()} title="刷新 Skills" aria-label="刷新 Skills" className="rounded-lg p-2 hover:bg-secondary"><RefreshCw className="h-4 w-4"/></button>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3">
            <Search className="h-4 w-4 text-muted-foreground"/>
            <input aria-label="搜索 Skills" className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索方法名称或适用任务"/>
          </label>
          <div className="max-h-[min(62dvh,700px)] space-y-2 overflow-y-auto pr-1">
            {filtered.map(item=><button key={item.id} type="button" onClick={()=>{
              setSelectedId(item.id);setViewVersion(0);setReviewed(false);setDetail(null)
            }}
              aria-pressed={selectedId===item.id}
              className={"w-full rounded-lg border p-3 text-left hover:border-primary/40 "+(selectedId===item.id?"border-primary/60 bg-primary/5":"border-border")}>
              <div className="flex items-center justify-between gap-2">
                <span className="break-all text-sm font-semibold">{item.name}</span>
                <span className={"shrink-0 text-xs "+(item.active&&item.approved_version?"text-primary":"text-muted-foreground")}>
                  {!item.active?"已停用":item.approved_version===item.latest_version?"最新已审核":item.approved_version?"新版本待审核":"待审核"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">最新 v{item.latest_version} · 可用 v{item.approved_version||"—"}</p>
            </button>)}
            {!filtered.length&&<div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground"><p>{loading?"正在读取 Skills…":error?"暂时无法核实列表，请刷新重试":query?"没有匹配的 Skill":"还没有可复用的方法"}</p>{!loading&&!error&&<button type="button" onClick={()=>query?setQuery(""):setImportOpen(true)} className="mt-3 min-h-9 font-semibold text-primary">{query?"清除搜索":"导入第一个 Skill"}</button>}</div>}
          </div>
        </section>
        <div className="min-w-0 space-y-5">
          <Dialog open={importOpen} onOpenChange={open=>{if(!open)void closeImport()}}><DialogContent aria-label="导入 Skill" className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl">
            <DialogHeader><DialogTitle>导入可复用方法</DialogTitle><DialogDescription>仅导入文本；原文经你审核后才能用于角色，不授予执行权限。</DialogDescription></DialogHeader>
          <section aria-label="导入 Skill 内容" className="min-w-0">
            <div className="flex items-start gap-2">
              <Upload className="mt-0.5 h-5 w-5 text-primary"/>
              <div><h2 className="font-semibold">导入 Skill</h2><p className="mt-1 text-xs text-muted-foreground">支持公开 GitHub 仓库首页、SKILL.md 文件页或文件夹地址；仓库首页将自动定位根目录 SKILL.md。仅导入文本，不执行脚本。</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="导入方式">
              {([{key:"github",label:"GitHub 链接"},{key:"file",label:"上传 SKILL.md"},{key:"paste",label:"粘贴正文"}] as const).map(v=>
                <button type="button" key={v.key} aria-pressed={mode===v.key}
                  onClick={async()=>{if(mode===v.key)return;if(source.trim()&&!await confirmInStudio("切换导入方式会清空当前内容，确认继续？"))return;setMode(v.key);setSource("")}}
                  className={"min-h-9 rounded-lg px-3 text-xs font-medium "+(mode===v.key?"bg-primary text-primary-foreground":"border border-border hover:bg-secondary")}>{v.label}</button>)}
            </div>
            {mode==="github"?<label className="mt-3 block text-xs font-semibold">GitHub 仓库或 SKILL.md 链接
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-input px-3">
                <Link2 className="h-4 w-4 text-muted-foreground"/>
                <input className="h-11 min-w-0 flex-1 bg-transparent text-sm font-normal outline-none" value={source}
                  onChange={e=>setSource(e.target.value)} placeholder="https://github.com/owner/repo"/>
              </div>
            </label>:mode==="file"?<label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm">
              <FileUp className="h-5 w-5 text-primary"/>
              {source?"文件内容已读取，可以导入":"点击选择 SKILL.md 文件（按字符数判断，最多约 16,100 字符）"}
              <input aria-label="上传 SKILL.md 文件" type="file" accept=".md,text/markdown" className="sr-only" onChange={async e=>{
                const file=e.target.files?.[0]
                if(!file)return
                if(file.size>65536){setError("文件数据超过 64 KiB 的安全读取上限");return}
                const text=await file.text()
                if(text.length>16100){setError("Skill 文本超过 16,100 字符，请检查内容长度");return}
                setError("");setSource(text)
              }}/>
            </label>:<label className="mt-3 block text-xs font-semibold">SKILL.md 原始内容
              <textarea aria-label="SKILL.md 正文" className="mt-1 min-h-32 w-full rounded-lg border border-input bg-background p-3 text-sm font-normal"
                value={source} onChange={e=>setSource(e.target.value)}
                placeholder={"---\nname: first-principles-analysis\ndescription: Use when breaking down assumptions and constraints.\n---\n# Method\n..."} />
            </label>}
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">导入不会自动激活，旧版本不可变。</p>
              <button type="button" disabled={busy||!source.trim()} onClick={()=>void importSkill()}
                className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">导入并待审核</button>
            </div>
            {error&&<p role="alert" className="mt-3 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          </section></DialogContent></Dialog>
          <div className="min-w-0 space-y-5">
          <section aria-label="Skill 版本审核" className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm">
            {!selected?<div className="py-12 text-center"><BookOpen className="mx-auto h-9 w-9 text-primary/60"/><h2 className="mt-4 text-base font-semibold">把有效方法沉淀为角色能力</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">选择已有方法查看适用场景和版本；导入新方法后，先审核原文，再在 Agent 的角色分工中明确选用。</p></div>:<>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h2 className="break-all font-semibold">{selected.name} <span className="text-sm font-normal text-muted-foreground">v{selected.latest_version}</span></h2>
                  <p className="mt-1 text-xs text-muted-foreground">{selected.description}</p>
                </div>
                <button type="button" disabled={busy} onClick={()=>void setActive(!selected.active)}
                  className="rounded-lg border border-border px-3 py-2 text-xs">{selected.active?"停用 Skill":"重新启用"}</button>
              </div>
              {selected.latest_version>1&&<label className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">查看历史版本
                <select aria-label="查看历史版本" className="h-10 rounded-lg border border-input bg-background px-3 text-xs font-normal"
                  value={viewVersion||selected.latest_version} onChange={e=>{
                    setViewVersion(Number(e.target.value));setReviewed(false);setDetail(null)
                  }}>
                  {Array.from({length:selected.latest_version},(_,i)=>selected.latest_version-i).map(v=><option key={v} value={v}>v{v}{v===selected.latest_version?"（最新）":""}</option>)}
                </select>
              </label>}
              {selectedDetail?.source_url&&<p className="mt-3 text-xs text-muted-foreground">来源：<a className="inline-flex items-center gap-1 break-all text-primary underline" href={selectedDetail.source_url} target="_blank" rel="noreferrer">GitHub <ExternalLink className="h-3 w-3"/></a></p>}
              <div className="mt-3 flex items-center gap-2 text-xs">
                {!selectedDetail?null:selectedDetail.approved?<ShieldCheck className="h-4 w-4 text-primary"/>:<ShieldAlert className="h-4 w-4 text-amber-600"/>}
                {!selectedDetail?"正在读取版本…":selectedDetail.approved?"此版本已经完成审核":"当前版本尚未审核，不可绑定到角色"}
              </div>
              <pre aria-label="SKILL.md 原文" className="mt-3 max-h-[min(50dvh,680px)] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-secondary/30 p-4 text-xs leading-6">{selectedDetail?.content||"加载中..."}</pre>
              {selectedDetail&&!selectedDetail.approved&&<>
                <label className="mt-3 flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>
                  <span>我已审阅 Skill 原文及来源，确认它仅用于方法参考，不授予工具权限、不运行脚本，也不会覆盖系统的安全规则。</span>
                </label>
                <button type="button" disabled={!reviewed||busy} onClick={()=>void approve()}
                  className="mt-3 min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">审核并启用 v{selectedDetail.version}</button>
              </>}
            </>}
          </section>
          {selectedDetail?.approved && selectedDetail.active &&
            <details className="rounded-xl border border-border bg-card" aria-label="Skill 真实模型效果验证">
              <summary className="cursor-pointer p-4 text-sm font-semibold text-primary">
                实际效果验证 · Skill / 无 Skill A/B 对照（可选）
              </summary>
              <div className="border-t border-border p-3">
                <SkillABReview key={selectedDetail.id+":"+selectedDetail.version} skill={selectedDetail}/>
              </div>
            </details>}
          </div>
        </div>
      </div>
    </main>
  </SiteShell>
}
