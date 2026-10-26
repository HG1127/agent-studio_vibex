import {useCallback,useEffect,useMemo,useState} from "react"
import {BookOpen,ExternalLink,FileUp,Link2,RefreshCw,ShieldAlert,ShieldCheck,Search,Upload} from "lucide-react"
import {Link} from "react-router-dom"
import {SiteShell} from "@/components/site/SiteShell"
import {loadSkillSummaries,skillApi,type SkillDetail,type SkillSummary} from "@/lib/skillLibrary"

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
  const refresh=useCallback(async()=>{
    try{const rows=await loadSkillSummaries();setItems(rows);setError("")}
    catch(e){setError(String((e as Error).message||"Skill 加载失败"))}
  },[])
  useEffect(()=>{
    let active=true
    void loadSkillSummaries().then(rows=>{
      if(active){setItems(rows);setError("")}
    }).catch(e=>{if(active)setError(String((e as Error).message||"Skill 加载失败"))})
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
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 pb-16 lg:p-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-primary">工具与连接 / Skills</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold"><BookOpen className="h-6 w-6"/>Skill 能力中心</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">管理可复用的分析方法，审核后按角色加载。不执行外部脚本、不自动授权工具。</p>
        </div>
        <Link to="/agent-create" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary">返回 Agent 创建</Link>
      </header>
      {error&&<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {notice&&<div role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{notice}</div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(290px,0.9fr)_minmax(0,1.4fr)]">
        <section aria-label="我的 Skills" className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">我的 Skills <span className="ml-1 text-xs font-normal text-muted-foreground">{items.length}/50</span></h2>
            <button type="button" onClick={()=>void refresh()} title="刷新 Skills" aria-label="刷新 Skills" className="rounded-lg p-2 hover:bg-secondary"><RefreshCw className="h-4 w-4"/></button>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3">
            <Search className="h-4 w-4 text-muted-foreground"/>
            <input aria-label="搜索 Skills" className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索方法名称或适用任务"/>
          </label>
          <div className="max-h-[460px] space-y-2 overflow-y-auto">
            {filtered.map(item=><button key={item.id} type="button" onClick={()=>{
              setSelectedId(item.id);setViewVersion(0);setReviewed(false);setDetail(null)
            }}
              aria-pressed={selectedId===item.id}
              className={"w-full rounded-lg border p-3 text-left hover:border-primary/40 "+(selectedId===item.id?"border-primary/60 bg-primary/5":"border-border")}>
              <div className="flex items-center justify-between gap-2">
                <span className="break-all text-sm font-semibold">{item.name}</span>
                <span className={"shrink-0 text-xs "+(item.active&&item.approved_version?"text-primary":"text-muted-foreground")}>
                  {!item.active?"已停用":item.approved_version?"已审核":"待审核"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">最新 v{item.latest_version} · 可用 v{item.approved_version||"—"}</p>
            </button>)}
            {!filtered.length&&<p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">暂无匹配的 Skill，先从下方导入。</p>}
          </div>
        </section>
        <div className="space-y-5">
          <section aria-label="导入 Skill" className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-2">
              <Upload className="mt-0.5 h-5 w-5 text-primary"/>
              <div><h2 className="font-semibold">导入 Skill</h2><p className="mt-1 text-xs text-muted-foreground">兼容 SKILL.md 标准；只处理文本。GitHub 链接仅支持公开仓库中的 SKILL.md。</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="导入方式">
              {([{key:"github",label:"GitHub 链接"},{key:"file",label:"上传 SKILL.md"},{key:"paste",label:"粘贴正文"}] as const).map(v=>
                <button type="button" key={v.key} aria-pressed={mode===v.key}
                  onClick={()=>{setMode(v.key);setSource("")}}
                  className={"min-h-9 rounded-lg px-3 text-xs font-medium "+(mode===v.key?"bg-primary text-primary-foreground":"border border-border hover:bg-secondary")}>{v.label}</button>)}
            </div>
            {mode==="github"?<label className="mt-3 block text-xs font-semibold">GitHub SKILL.md 链接
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-input px-3">
                <Link2 className="h-4 w-4 text-muted-foreground"/>
                <input className="h-11 min-w-0 flex-1 bg-transparent text-sm font-normal outline-none" value={source}
                  onChange={e=>setSource(e.target.value)} placeholder="https://github.com/owner/repo/blob/main/skills/foo/SKILL.md"/>
              </div>
            </label>:mode==="file"?<label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm">
              <FileUp className="h-5 w-5 text-primary"/>
              {source?"文件内容已读取，可以导入":"点击选择 SKILL.md 文件（≤16KB）"}
              <input aria-label="上传 SKILL.md 文件" type="file" accept=".md,text/markdown" className="sr-only" onChange={async e=>{
                const file=e.target.files?.[0]
                if(!file)return
                if(file.size>16000){setError("文件超过 16KB，仅支持文本型 Skill");return}
                setSource(await file.text())
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
          </section>
          <section aria-label="Skill 版本审核" className="rounded-xl border border-border bg-card p-4">
            {!selected?<p className="text-sm text-muted-foreground">从左侧选择一个 Skill，查看原文、版本和审批状态。</p>:<>
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
              <pre aria-label="SKILL.md 原文" className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-secondary/30 p-3 text-xs leading-relaxed">{selectedDetail?.content||"加载中..."}</pre>
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
        </div>
      </div>
    </main>
  </SiteShell>
}
