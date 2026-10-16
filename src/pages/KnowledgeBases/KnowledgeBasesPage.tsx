import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle, BookOpen, CheckCircle2, ChevronRight, FilePlus2, FileText,
  FolderOpen, Loader2, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2,
  UploadCloud, BrainCircuit, DatabaseZap, RotateCcw, Zap,
} from "lucide-react"
import { SiteShell } from "@/components/site/SiteShell"
import { KnowledgeSharePanel } from "@/components/knowledge/KnowledgeSharePanel"
import { SharedSemanticStatusPanel } from "@/components/knowledge/SharedSemanticStatusPanel"
import { redirectToRhLogin } from "@/lib/studioAuth"
import { DOCUMENT_EXTENSIONS, readKnowledgeDocument } from "@/lib/knowledgeDocumentText"
import {
  getKnowledgeBases, knowledgeApi,
  type KnowledgeBase, type KnowledgeDocument, type KnowledgeHit,
  type EmbeddingSettings, type EmbeddingStatus, type ModelConnectionForEmbedding,
  type KnowledgeSearchResponse,
} from "@/lib/knowledgeBases"

type DocList = { items: KnowledgeDocument[] }
type RetrievalMode = "auto" | "lexical" | "hybrid" | "semantic"

const FIELD = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
const allowed = /\.(txt|md|markdown|csv|tsv|json|html?)$/i
const prettyDate = (ms: number) => new Date(ms).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })


export default function KnowledgeBasesPage() {
  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [baseName, setBaseName] = useState("")
  const [baseDescription, setBaseDescription] = useState("")
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<KnowledgeHit[]>([])
  const [searchCoverage, setSearchCoverage] = useState<{ limited: boolean; scanned: number } | null>(null)
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>("auto")
  const [retrievalReport, setRetrievalReport] = useState<KnowledgeSearchResponse | null>(null)
  const [embeddingSettings, setEmbeddingSettings] = useState<EmbeddingSettings | null>(null)
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null)
  const [embeddingOptions, setEmbeddingOptions] = useState<ModelConnectionForEmbedding[]>([])
  const [embeddingConnectionId, setEmbeddingConnectionId] = useState("")
  const [embeddingModelName, setEmbeddingModelName] = useState("")
  const [embeddingBusy, setEmbeddingBusy] = useState(false)
  const [embeddingSettingsLoading, setEmbeddingSettingsLoading] = useState(true)
  const [pasteName, setPasteName] = useState("我的笔记.txt")
  const [pasteContent, setPasteContent] = useState("")
  const uploadRef = useRef<HTMLInputElement>(null)
  const selectedBase = bases.find(item => item.id === selectedId)
  const selectedRole = selectedBase?.access_role || "owner"
  const isOwner = selectedRole === "owner"
  const canEditDocs = selectedRole === "owner" || selectedRole === "editor"
  const currentIndex = isOwner && embeddingStatus?.base_id === selectedId ? embeddingStatus : null
  const availableEmbeddingOptions = embeddingOptions.filter(item => item.enabled && item.provider === "openai")
  const indexedPercent = currentIndex?.total_chunks
    ? Math.round(currentIndex.indexed_chunks / currentIndex.total_chunks * 100)
    : 0

  const reloadBases = useCallback(async () => {
    const items = await getKnowledgeBases()
    setBases(items)
    setSelectedId(prev => items.some(item => item.id === prev) ? prev : (items[0]?.id || ""))
  }, [])

  const reloadDocuments = useCallback(async (baseId: string) => {
    if (!baseId) { setDocuments([]); return }
    const data = await knowledgeApi<DocList>("/api/knowledge-bases/documents?base_id=" + encodeURIComponent(baseId))
    setDocuments(data.items || [])
  }, [])

  useEffect(() => {
    let active = true
    getKnowledgeBases().then(items => {
      if (!active) return
      setBases(items)
      setSelectedId(items[0]?.id || "")
    }).catch(err => { if (active) setError(String(err.message || err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (!selectedId) return
    knowledgeApi<DocList>("/api/knowledge-bases/documents?base_id=" + encodeURIComponent(selectedId))
      .then(data => { if (active) setDocuments(data.items || []) })
      .catch(err => { if (active) setError(String(err.message || err)) })
    return () => { active = false }
  }, [selectedId])

  // One employee-level Embedding provider is shared by the employee's own bases.
  // Credentials stay on the server in their existing model connection.
  useEffect(() => {
    let active = true
    void Promise.all([
      knowledgeApi<EmbeddingSettings>("/api/knowledge-bases/semantic/settings"),
      knowledgeApi<{ items: ModelConnectionForEmbedding[] }>("/api/model-connections"),
    ]).then(([settings, connections]) => {
      if (!active) return
      setEmbeddingSettings(settings)
      setEmbeddingConnectionId(settings.connection_id || "")
      setEmbeddingModelName(settings.model_name || "")
      setEmbeddingOptions(connections.items || [])
    }).catch(err => { if (active) setError("语义模型配置加载失败：" + String((err as Error).message || err)) })
      .finally(() => { if (active) setEmbeddingSettingsLoading(false) })
    return () => { active = false }
  }, [])

  const reloadSemanticStatus = useCallback(async (baseId: string) => {
    if (!baseId || bases.find(base => base.id === baseId)?.access_role !== "owner") {
      setEmbeddingStatus(null)
      return
    }
    const status = await knowledgeApi<EmbeddingStatus>(
      "/api/knowledge-bases/semantic/status?base_id=" + encodeURIComponent(baseId))
    setEmbeddingStatus(status)
  }, [bases])

  // Poll only while indexing is queued. Reload once when the selected base
  // changes. UI always filters the status by base_id to avoid stale results.
  useEffect(() => {
    if (!selectedId || !isOwner) return
    let active = true
    void knowledgeApi<EmbeddingStatus>(
      "/api/knowledge-bases/semantic/status?base_id=" + encodeURIComponent(selectedId)
    ).then(status => { if (active) setEmbeddingStatus(status) })
      .catch(err => { if (active) setError("索引状态读取失败：" + String((err as Error).message || err)) })
    return () => { active = false }
  }, [selectedId, isOwner])

  useEffect(() => {
    if (!selectedId || !isOwner || !currentIndex?.queued) return
    const interval = window.setInterval(() => {
      void reloadSemanticStatus(selectedId).catch(() => undefined)
    }, 8000)
    return () => window.clearInterval(interval)
  }, [selectedId, isOwner, currentIndex?.queued, reloadSemanticStatus])

  const saveEmbedding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (embeddingBusy || !embeddingConnectionId || !embeddingModelName.trim()) return
    // This is an account-wide destructive re-index of ALL owned libraries.
    // Make potential paid model usage an explicit, informed decision.
    const replacing = embeddingSettings?.configured && (
      embeddingSettings.connection_id !== embeddingConnectionId ||
      embeddingSettings.model_name !== embeddingModelName.trim()
    )
    if (replacing && !window.confirm(
      "切换 Embedding 模型将清除并重建你所有知识库的语义向量，" +
      "可能产生新的模型费用。原文及关键词索引不变。确认继续？"
    )) return
    setEmbeddingBusy(true); setError(""); setNotice("")
    try {
      const result = await knowledgeApi<{ settings: { connection_id: string; model_name: string }; changed: boolean }>(
        "/api/knowledge-bases/semantic/settings", "POST", {
          action: "save", connection_id: embeddingConnectionId,
          model_name: embeddingModelName.trim(),
        })
      setEmbeddingSettings({
        configured: true, connection_id: result.settings.connection_id,
        model_name: result.settings.model_name, updated_ms: Date.now(),
      })
      if (selectedId) await reloadSemanticStatus(selectedId)
      setNotice(result.changed
        ? "语义模型已更新，原有资料已加入后台向量索引队列；切换模型会重建所有个人知识库的向量。"
        : "语义模型配置无变化。")
    } catch (err) { setError(String((err as Error).message || err)) }
    finally { setEmbeddingBusy(false) }
  }

  const disableEmbedding = async () => {
    if (embeddingBusy || !window.confirm("确认关闭语义检索？你的个人知识库向量将被清除，原文和关键词索引保留。")) return
    setEmbeddingBusy(true); setError(""); setNotice("")
    try {
      await knowledgeApi("/api/knowledge-bases/semantic/settings", "POST", { action: "disable" })
      setEmbeddingSettings({ configured: false, connection_id: "", model_name: "", updated_ms: Date.now() })
      setEmbeddingConnectionId(""); setEmbeddingModelName("")
      if (selectedId) await reloadSemanticStatus(selectedId)
      setNotice("已关闭语义索引，知识库原文仍可进行关键词检索。")
    } catch (err) { setError(String((err as Error).message || err)) }
    finally { setEmbeddingBusy(false) }
  }

  const rebuildEmbedding = async () => {
    if (!selectedId || embeddingBusy || !window.confirm(
      "重新建立此知识库的全部向量？这将产生新的 Embedding 模型调用和可能的费用。")) return
    setEmbeddingBusy(true); setError(""); setNotice("")
    try {
      const result = await knowledgeApi<{ progress: EmbeddingStatus }>(
        "/api/knowledge-bases/semantic/rebuild", "POST", { base_id: selectedId })
      setEmbeddingStatus(result.progress)
      setNotice("已加入重建队列。后台 Worker 会逐批完成，不需保持此页面打开。")
    } catch (err) { setError(String((err as Error).message || err)) }
    finally { setEmbeddingBusy(false) }
  }

  const indexNow = async () => {
    if (!selectedId || embeddingBusy) return
    setEmbeddingBusy(true); setError(""); setNotice("")
    try {
      const result = await knowledgeApi<{ indexed_batch: number; progress: EmbeddingStatus }>(
        "/api/knowledge-bases/semantic/index", "POST", { base_id: selectedId, batch_size: 8 })
      setEmbeddingStatus(result.progress)
      setNotice("本次已索引 " + result.indexed_batch + " 个片段；剩余任务由后台自动完成。")
    } catch (err) { setError(String((err as Error).message || err)) }
    finally { setEmbeddingBusy(false) }
  }

  const submitBase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!baseName.trim() || busy) return
    setBusy(true); setError(""); setNotice("")
    try {
      const result = await knowledgeApi<{ id: string }>("/api/knowledge-bases/manage", "POST", {
        action: editing ? "update" : "create",
        ...(editing ? { id: selectedId } : {}),
        name: baseName.trim(), description: baseDescription.trim(),
      })
      await reloadBases()
      if (!editing) { setDocuments([]); setHits([]); setSearched(false); setSelectedId(result.id) }
      setEditing(false); setBaseName(""); setBaseDescription("")
      setNotice(editing ? "知识库信息已更新" : "知识库已创建，可导入资料")
    } catch (err) { setError(String((err as Error).message || err)) }
    finally { setBusy(false) }
  }

  const startEdit = () => {
    if (!selectedBase) return
    setEditing(true); setBaseName(selectedBase.name); setBaseDescription(selectedBase.description)
    document.getElementById("kb-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const deleteBase = async () => {
    if (!selectedBase || busy || !window.confirm("确认删除知识库「" + selectedBase.name + "」及其中所有已索引内容？此操作不可撤销。")) return
    setBusy(true); setError(""); setNotice("")
    try {
      await knowledgeApi("/api/knowledge-bases/manage", "POST", { action: "delete", id: selectedBase.id })
      setSelectedId(""); setDocuments([]); setHits([]); setSearched(false)
      await reloadBases()
      setEditing(false); setBaseName(""); setBaseDescription("")
      setNotice("知识库已删除")
    } catch (err) { setError(String((err as Error).message || err)) }
    finally { setBusy(false) }
  }

  const ingest = async (filename: string, content: string) => {
    if (!selectedId) return
    await knowledgeApi("/api/knowledge-bases/documents", "POST", {
      action: "upload", base_id: selectedId, filename, content,
    })
  }
  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ""
    if (!files.length || !selectedId || uploading) return
    if (files.length > 10) { setError("每次最多导入 10 份文件"); return }
    setUploading(true); setError(""); setNotice("")
    let complete = 0
    try {
      for (const file of files) {
        const text = await readKnowledgeDocument(file)
        await ingest(file.name, text)
        complete++
      }
      await Promise.all([reloadBases(), reloadDocuments(selectedId)])
      void reloadSemanticStatus(selectedId).catch(() => undefined)
      setNotice("已导入 " + complete + " 份资料。原文可立即检索；" +
        (embeddingSettings?.configured ? "语义向量将由后台自动分批建立。" : "配置 Embedding 模型后可启用语义检索。"))
    } catch (err) {
      setError("已导入 " + complete + " 份，下一份失败：" + String((err as Error).message || err))
      await Promise.all([reloadBases(), reloadDocuments(selectedId)])
    } finally { setUploading(false) }
  }

  const importText = async () => {
    if (!selectedId || uploading) return
    if (!allowed.test(pasteName)) { setError("请输入 .txt、.md、.csv、.json 或 .html 文件名"); return }
    setUploading(true); setError(""); setNotice("")
    try {
      await ingest(pasteName, pasteContent.trim())
      await Promise.all([reloadBases(), reloadDocuments(selectedId)])
      setPasteContent(""); void reloadSemanticStatus(selectedId).catch(() => undefined)
      setNotice("已建立关键词索引。" + (embeddingSettings?.configured ? " 语义向量已排入后台队列。" : ""))
    } catch (err) { setError(String((err as Error).message || err)) }
    finally { setUploading(false) }
  }

  const removeDocument = async (doc: KnowledgeDocument) => {
    if (!selectedId || busy || !window.confirm("确认删除「" + doc.filename + "」的所有索引片段？")) return
    setBusy(true); setError(""); setNotice("")
    try {
      await knowledgeApi("/api/knowledge-bases/documents", "POST", {
        action: "delete", base_id: selectedId, document_id: doc.id,
      })
      await Promise.all([reloadBases(), reloadDocuments(selectedId)])
      setHits([]); setSearched(false)
      void reloadSemanticStatus(selectedId).catch(() => undefined)
      setNotice("已删除文档及关联的关键词、语义向量索引。")
    } catch (err) { setError(String((err as Error).message || err)) }
    finally { setBusy(false) }
  }

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedId || !query.trim() || searching) return
    setSearching(true); setError(""); setSearched(false); setSearchCoverage(null)
    try {
      const result = await knowledgeApi<KnowledgeSearchResponse>("/api/knowledge-bases/search", "POST", {
        base_ids: [selectedId], query: query.trim(), limit: 6, mode: retrievalMode,
      })
      setHits(result.items || [])
      setRetrievalReport(result)
      setSearchCoverage({ limited: Boolean(result.candidate_limit_reached), scanned: Number(result.scanned_candidates || 0) })
      setSearched(true)
    } catch (err) { setError(String((err as Error).message || err)) }
    finally { setSearching(false) }
  }

  return (
    <SiteShell>
      <div className="min-h-screen flex-1 bg-background text-foreground">
        <header className="border-b border-border bg-card px-4 py-5 sm:px-6">
          <div className="flex w-full min-w-0 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-primary/10 p-3 text-primary"><BookOpen className="h-6 w-6" /></span>
              <div>
                <h1 className="text-xl font-semibold">知识库</h1>
                <p className="mt-1 text-xs text-muted-foreground">上传资料 · 自动分段 · 可溯源检索 · 绑定 Agent</p>
              </div>
            </div>
            <button type="button" onClick={() => void Promise.all([reloadBases(), reloadDocuments(selectedId)]).catch(err => setError(String(err)))}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary">
              <RefreshCw className="h-4 w-4" />刷新
            </button>
          </div>
        </header>
        <main className="w-full min-w-0 space-y-5 p-3 sm:p-5 lg:p-7 2xl:p-10" data-studio-fluid-page="knowledge">
          <details className="rounded-xl border border-border bg-card p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
              查看知识库用量（{bases.length} 个库）
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {[
                { name: "可访问知识库", value: bases.length, icon: FolderOpen },
                { name: "已导入文档", value: bases.reduce((n, b) => n + b.document_count, 0), icon: FileText },
                { name: "已建立的文本片段", value: bases.reduce((n, b) => n + b.chunk_count, 0), icon: BookOpen },
              ].map(item => <div key={item.name} className="rounded-xl bg-secondary/30 p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{item.name}</span><item.icon className="h-4 w-4"/>
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums">{item.value}</div>
              </div>)}
            </div>
          </details>
          {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</span>
            {error.includes("登录") && <button type="button" onClick={redirectToRhLogin} className="shrink-0 underline">去登录</button>}
          </div>}
          {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />{notice}</p>}
          <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            <aside className="space-y-4">
              <section id="kb-form" className="rounded-2xl border border-border bg-card p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4 text-primary" />{editing ? "编辑知识库" : "新建知识库"}</h2>
                <form onSubmit={submitBase} className="space-y-3">
                  <label className="block text-xs text-muted-foreground">知识库名称
                    <input className={"mt-1.5 " + FIELD} maxLength={100} required value={baseName}
                      onChange={e => setBaseName(e.target.value)} placeholder="例如：公司产品文档" />
                  </label>
                  <label className="block text-xs text-muted-foreground">简介
                    <textarea className={"mt-1.5 " + FIELD} rows={2} maxLength={1000} value={baseDescription}
                      onChange={e => setBaseDescription(e.target.value)} placeholder="描述资料用途和覆盖范围" />
                  </label>
                  <div className="flex gap-2">
                    <button disabled={busy || !baseName.trim()} className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                      {busy ? "保存中…" : editing ? "保存修改" : "创建知识库"}
                    </button>
                    {editing && <button type="button" onClick={() => { setEditing(false); setBaseName(""); setBaseDescription("") }}
                      className="rounded-xl border border-border px-3 text-xs">取消</button>}
                  </div>
                </form>
              </section>
              <section className="rounded-2xl border border-border bg-card p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-primary" />我的及团队知识库</h2>
                <div className="space-y-2">
                  {loading ? <p className="py-4 text-center text-xs text-muted-foreground">正在加载…</p> :
                    bases.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">还没有知识库，先创建一个。</p> :
                      bases.map(item => <button key={item.id} type="button" onClick={() => { setDocuments([]); setHits([]); setSearchCoverage(null); setSearched(false); setSelectedId(item.id); setRetrievalMode("auto"); setError(""); setNotice("") }}
                        className={"flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left transition " +
                          (item.id === selectedId ? "border-primary/40 bg-primary/5" : "border-border hover:bg-secondary")}>
                        <span className="min-w-0"><strong className="block truncate text-sm">{item.name}</strong>
                          <span className="mt-1 block text-[11px] text-muted-foreground">{item.document_count} 份文档 · {item.chunk_count} 片段
                            {item.access_role && item.access_role !== "owner" ? " · "+(item.access_role==="editor"?"可编辑":"仅检索")+" · "+(item.owner_name||"同事共享") : ""}</span></span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>)}
                </div>
              </section>
            </aside>
            <div className="min-w-0 space-y-5">
              {!selectedBase ?
                <section className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center">
                  <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h2 className="mt-4 text-base font-semibold">开始构建专属知识库</h2>
                  <p className="mt-2 text-sm text-muted-foreground">建立资料库后，可以直接绑定到 AI Agent 并在运行时检索。</p>
                </section> :
                <>
                  <section className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h2 className="text-lg font-semibold">{selectedBase.name}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">{selectedBase.description || "未填写知识库简介"}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">最近更新：{prettyDate(selectedBase.updated_ms)}
                          {isOwner?" · 我的私人知识库": " · "+(selectedBase.owner_name||"同事")+" 共享 · "+(selectedRole==="editor"?"可维护文档":"只读检索")}</p>
                      </div>
                      {isOwner && <div className="flex gap-2">
                        <button type="button" onClick={startEdit} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary"><Pencil className="h-3.5 w-3.5" />编辑</button>
                        <button type="button" onClick={() => void deleteBase()} disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 px-3 py-2 text-xs text-destructive hover:bg-destructive/5"><Trash2 className="h-3.5 w-3.5" />删除</button>
                      </div>}
                    </div>
                    <div className="mt-4 grid gap-3">
                      <button type="button" disabled={uploading || !canEditDocs} onClick={() => uploadRef.current?.click()}
                        className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-primary/35 bg-primary/5 px-3 py-4 text-center hover:bg-primary/10 disabled:opacity-50">
                        {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <UploadCloud className="h-6 w-6 text-primary" />}
                        <span className="text-sm font-medium">{uploading ? "正在建立文档索引…" : "选择文件导入"}</span>
                        <span className="text-[11px] text-muted-foreground">PDF · DOCX · TXT · MD · CSV · JSON</span>
                      </button>
                      <details className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer font-medium text-foreground">支持的文件格式与导入限制</summary>
                        <p className="mt-2 leading-relaxed">支持 PDF 文本层、DOCX 和常见文本格式；每份最多 16 万字符、每库 80 份。扫描版 PDF 需要 OCR。关键词可立即检索；语义向量由已授权模型生成。</p>
                      </details>
                      <input ref={uploadRef} type="file" multiple accept={DOCUMENT_EXTENSIONS}
                        aria-label="上传知识库文件" className="hidden" disabled={!canEditDocs} onChange={event => void importFiles(event)} />
                    </div>
                    {canEditDocs && <details className="mt-4 rounded-xl border border-border bg-background px-4 py-3">
                      <summary className="cursor-pointer text-xs font-medium">或者直接粘贴一段文本资料</summary>
                      <div className="mt-3 space-y-2">
                        <input aria-label="粘贴文本资料文件名" className={FIELD} value={pasteName} onChange={e => setPasteName(e.target.value)} placeholder="资料名称.txt" />
                        <textarea aria-label="资料正文" className={FIELD} rows={5} value={pasteContent} onChange={e => setPasteContent(e.target.value)} placeholder="把制度、说明文档、访谈记录等粘贴在这里…" />
                        <button type="button" onClick={() => void importText()} disabled={!pasteContent.trim() || uploading} className="rounded-lg bg-primary px-4 py-2 text-xs text-primary-foreground disabled:opacity-50"><FilePlus2 className="mr-1 inline h-3.5 w-3.5" />保存并索引</button>
                      </div>
                    </details>}
                  </section>
                  {isOwner && <KnowledgeSharePanel key={selectedId} baseId={selectedId} />}
                  {!isOwner && <SharedSemanticStatusPanel key={selectedId} baseId={selectedId} />}
                  {isOwner && <section className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                          <BrainCircuit className="h-4 w-4 text-primary" />语义检索与向量索引
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          配置作用于当前账号的所有知识库，Agent 与 Workflow 自动使用同一检索能力。
                        </p>
                      </div>
                      <span className={"rounded-full px-2.5 py-1 text-[11px] font-medium " +
                        (embeddingSettings?.configured
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground")}>
                        {embeddingSettingsLoading ? "加载配置…" : embeddingSettings?.configured ? "语义能力已启用" : "仅关键词检索"}
                      </span>
                    </div>
                    <form onSubmit={event => void saveEmbedding(event)} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                      <label className="block min-w-0 text-xs font-medium text-muted-foreground">
                        Embedding 模型连接
                        <select aria-label="选择 Embedding 模型连接"
                          className={"mt-1.5 " + FIELD} value={embeddingConnectionId}
                          onChange={event => setEmbeddingConnectionId(event.target.value)}>
                          <option value="">选择本人已启用的 OpenAI 兼容连接</option>
                          {availableEmbeddingOptions.map(conn =>
                            <option key={conn.id} value={conn.id}>{conn.name}</option>)}
                        </select>
                      </label>
                      <label className="block min-w-0 text-xs font-medium text-muted-foreground">
                        Embedding 模型名称
                        <input aria-label="Embedding 模型名称" className={"mt-1.5 " + FIELD}
                          value={embeddingModelName} maxLength={128} autoComplete="off"
                          onChange={event => setEmbeddingModelName(event.target.value)}
                          placeholder="例如 text-embedding-3-small" />
                      </label>
                      <button type="submit" disabled={embeddingBusy || embeddingSettingsLoading ||
                        !embeddingConnectionId || !embeddingModelName.trim()}
                        className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                        {embeddingBusy ? "处理中…" : "保存语义配置"}
                      </button>
                    </form>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      文本向量化由服务端调用已授权模型，密钥不会发送到浏览器。请选用真实的 Embedding 模型；
                      切换模型会重新为个人知识库生成向量并可能产生费用。非官方服务地址需管理员在后端允许清单内授权。
                      {availableEmbeddingOptions.length === 0 &&
                        <> 还没有合适的模型连接，<Link className="text-primary underline" to="/model-connections">前往配置</Link>。</>}
                    </p>
                    <div className="mt-4 rounded-xl border border-border bg-secondary/25 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-2 font-medium">
                          <DatabaseZap className="h-4 w-4 text-primary" />当前知识库向量索引
                        </span>
                        <button type="button" onClick={() => void reloadSemanticStatus(selectedId).catch(
                          err => setError(String((err as Error).message || err)))}
                          className="flex items-center gap-1 text-primary hover:underline">
                          <RefreshCw className="h-3.5 w-3.5" />刷新状态
                        </button>
                      </div>
                      {currentIndex ? (
                        <>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-medium">
                              {currentIndex.configured
                                ? currentIndex.total_chunks === 0 ? "尚无可索引片段"
                                  : currentIndex.ready ? "已完成向量索引"
                                    : currentIndex.indexing ? "后台正在索引"
                                      : currentIndex.queued ? "已加入后台索引队列" : "有尚未索引的片段"
                                : "尚未配置语义模型"}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {currentIndex.indexed_chunks} / {currentIndex.total_chunks} 片段 · {indexedPercent}%
                            </span>
                          </div>
                          <div role="progressbar" aria-label="语义向量索引进度"
                            aria-valuemin={0} aria-valuemax={100} aria-valuenow={indexedPercent}
                            className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                            <div className="h-full rounded-full bg-primary transition-[width] duration-300"
                              style={{ width: indexedPercent + "%" }} />
                          </div>
                          {currentIndex.last_error &&
                            <p className="mt-2 text-xs text-amber-700" role="status">
                              上次索引遇到问题（{currentIndex.last_error}），系统将按退避策略重试。
                              {currentIndex.retry_at_ms > 0 &&
                                " 计划重试时间：" + prettyDate(currentIndex.retry_at_ms)}
                            </p>}
                          {currentIndex.configured &&
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" disabled={embeddingBusy || !currentIndex.pending_chunks}
                                onClick={() => void indexNow()}
                                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-secondary disabled:opacity-40">
                                <Zap className="h-3.5 w-3.5" />立即索引下一批
                              </button>
                              <button type="button" disabled={embeddingBusy}
                                onClick={() => void rebuildEmbedding()}
                                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-secondary disabled:opacity-40">
                                <RotateCcw className="h-3.5 w-3.5" />重建此库向量
                              </button>
                              <button type="button" disabled={embeddingBusy}
                                onClick={() => void disableEmbedding()}
                                className="ml-auto text-xs text-muted-foreground underline hover:text-destructive disabled:opacity-40">
                                关闭语义检索
                              </button>
                            </div>}
                        </>
                      ) : <p className="mt-3 text-xs text-muted-foreground">正在获取当前知识库的索引状态…</p>}
                    </div>
                  </section>}
                  <section className="rounded-2xl border border-border bg-card p-5">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" />已导入资料 <span className="text-xs font-normal text-muted-foreground">({documents.length})</span></h3>
                    {!documents.length ? <p className="rounded-xl border border-dashed border-border py-9 text-center text-xs text-muted-foreground">暂无文档，上传或粘贴资料以建立检索索引</p> :
                      <div className="space-y-2">{documents.map(doc => <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{doc.filename}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{doc.chunk_count} 片段 · {doc.size_chars.toLocaleString()} 字符 · {prettyDate(doc.created_ms)}</p>
                        </div>
                        {canEditDocs && <button type="button" aria-label={"删除 " + doc.filename} disabled={busy} onClick={() => void removeDocument(doc)}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
                      </div>)}</div>}
                  </section>
                  <section className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold"><Search className="h-4 w-4 text-primary" />检索调试</h3>
                      <span className="text-[11px] text-muted-foreground">关键词匹配 · Embedding 语义召回 · 来源引用</span>
                    </div>
                    <form onSubmit={event => void search(event)} className="mt-3 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input aria-label="知识库检索问题" className={FIELD}
                          value={query} onChange={e => setQuery(e.target.value)}
                          maxLength={300} placeholder="输入问题，例如：哪些公司的盈利能力持续改善？" />
                        <button disabled={searching || !query.trim() || !documents.length}
                          className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "检索"}
                        </button>
                      </div>
                      <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        检索策略
                        <select aria-label="知识库检索策略"
                          className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                          value={retrievalMode}
                          onChange={event => { setRetrievalMode(event.target.value as RetrievalMode); setSearched(false) }}>
                          <option value="auto">自动（优先混合，异常时回退关键词）</option>
                          <option value="hybrid" disabled={!isOwner && !selectedBase.semantic_allowed}>混合检索（需共享语义授权及兼容模型）</option>
                          <option value="semantic" disabled={!isOwner && !selectedBase.semantic_allowed}>仅语义检索（需兼容模型）</option>
                          <option value="lexical">关键词检索</option>
                        </select>
                      </label>
                    </form>
                    {searched && searchCoverage && (
                      <p className={searchCoverage.limited
                        ? "mt-3 rounded-lg border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-900"
                        : "mt-3 text-xs text-muted-foreground"}>
                        {retrievalReport?.retrieval === "hybrid" ? "混合检索（语义 + 关键词）"
                          : retrievalReport?.retrieval === "semantic" ? "语义向量检索"
                            : "关键词检索"}。已扫描 {searchCoverage.scanned} 个关键词候选片段。
                        {retrievalReport?.semantic_total ? " 语义已索引 " + retrievalReport.semantic_indexed +
                          "/" + retrievalReport.semantic_total + " 片段。" : ""}
                        {retrievalReport?.semantic_status === "provider_error"
                          ? " 语义服务暂不可用，自动回退至关键词检索。" : ""}
                        {retrievalReport?.semantic_status === "partial"
                          ? " 向量索引尚未覆盖全部内容，语义结果可能不完整。" : ""}
                        {retrievalReport?.semantic_status === "not_configured"
                          ? " 尚未配置 Embedding 模型，当前仅支持关键词检索。" : ""}
                        {retrievalReport?.semantic_status === "not_indexed"
                          ? " 向量索引尚未建立，当前仅返回关键词结果。" : ""}
                        {retrievalReport?.shared_semantic_used
                          ? " 团队共享语义已生效：查询费用由当前员工模型承担，不使用所有者密钥。" : ""}
                        {retrievalReport?.shared_lexical_only
                          ? " 部分共享库未开启语义或模型不兼容，已对该部分使用关键词。" : ""}
                        {searchCoverage.limited ? " 已达到检索候选上限，部分旧资料可能未被扫描。" : ""}
                      </p>
                    )}
                    <div className="mt-4 space-y-3">
                      {searched && !hits.length && <p className="rounded-xl bg-secondary px-4 py-5 text-center text-sm text-muted-foreground">没有匹配片段，请尝试调整关键词</p>}
                      {hits.map(hit => <article key={hit.chunk_id} className="rounded-xl border border-border bg-background p-4">
                        <p className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-primary">{hit.citation}</span>
                          <span className="text-muted-foreground">
                            {hit.semantic_score !== undefined
                              ? "语义相似度 " + Math.round(hit.semantic_score * 100) + "%"
                              : "相关性分数 " + hit.score}
                          </span>
                        </p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{hit.text}</p>
                      </article>)}
                    </div>
                    <p className="mt-3 flex gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />Agent 和工作流检索仅使用当前账号已授权的知识库片段。回答应提供文件名与片段编号；上传内容是待核实资料，不可作为系统指令。</p>
                  </section>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-4 text-xs text-muted-foreground">
                    <span>下一步：在「助手方案」里选择知识库并启用知识检索工具，让 Agent 运行时检索引用这些资料。</span>
                    <Link to="/" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">前往助手设计 <ChevronRight className="h-3.5 w-3.5" /></Link>
                  </div>
                </>}
            </div>
          </div>
        </main>
      </div>
    </SiteShell>
  )
}
