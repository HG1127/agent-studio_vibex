import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle, ArrowRight, CheckCircle2, ClipboardCopy, KeyRound,
  Loader2, RefreshCw, ShieldCheck, Trash2, UsersRound,
} from "lucide-react"
import { SiteShell } from "@/components/site/SiteShell"
import { getPocketBaseUrl } from "@/lib/pb"
import { redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"

type OwnSpec = { id: string; name: string }
type Invite = {
  id: string; name: string; spec_id: string
  created_ms: number; expires_ms: number; used_ms: number; revoked: boolean
}
type SafeSpec = {
  goal: string; task_scope: string; deliverables: string[]
  tools: string[]; task_plan: string[]; done_criteria: string[]
  knowledge_base_ids: []; require_approval: true
}
type Preview = { ok: true; name: string; preview_hash: string; preview_spec: SafeSpec; warning: string }
type OwnResponse = { specs: OwnSpec[]; invites: Invite[]; scope: string }
type Created = { ok: true; share_code: string; expires_ms: number; id: string; name: string }
type Redeemed = { ok: true; spec_id: string; message: string }

const inputClass = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
const btnPrimary = "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"

function explainError(code: string): string {
  const known: Record<string, string> = {
    rh_login_required: "请先登录，再使用内部协作功能",
    internal_sharing_not_configured: "旧版共享白名单未配置。独立模式请联系管理员检查账号权限。",
    internal_member_required: "当前账号的 Agent 共享权限未开启。请联系管理员在「员工与权限」中开启。",
    spec_not_found: "此 Agent 不属于你，或已经被删除。",
    share_invite_limit: "待领取分享码已达到上限，请撤销不需要的分享。",
    template_review_required: "方案内容已变化，或尚未完成审核。请重新预览并确认。",
    share_code_unavailable: "分享码无效、已使用、已过期，或已经撤销。",
    source_spec_invalid: "源 Agent 方案格式无效，请返回工作台检查并保存。",
    internal_templates_list_failed: "内部分享列表获取失败。",
    internal_template_action_failed: "分享操作暂时失败，请稍后重试。",
  }
  return known[code] || "请求失败，请检查网络或联系管理员。"
}

async function requestInternal<T>(method: "GET" | "POST", body?: unknown): Promise<T> {
  const response = await fetch(getPocketBaseUrl() + "/api/internal/templates", {
    method,
    headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const error = new Error(explainError(String(result.error || "")))
    if (response.status === 401) error.name = "LoginRequired"
    throw error
  }
  return result as T
}

function dateLabel(value: number): string {
  return Number.isFinite(value) && value > 0
    ? new Date(value).toLocaleString("zh-CN", {month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})
    : "—"
}

function statusLabel(item: Invite, now: number): string {
  if (item.revoked) return "已撤销"
  if (item.used_ms) return "已领取"
  if (item.expires_ms <= now) return "已过期"
  return "等待领取"
}

function FieldPreview({name, value}: {name: string; value: string | string[]}) {
  const rows = Array.isArray(value) ? value : [value]
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{name}</p>
      {rows.length ? (
        <div className="space-y-1 rounded-lg border border-border bg-background p-3 text-sm leading-relaxed">
          {rows.map((entry, i) => <p className="break-words whitespace-pre-wrap" key={i}>{entry}</p>)}
        </div>
      ) : <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">此字段不包含可分享内容</p>}
    </div>
  )
}

export default function InternalTemplatesPage() {
  const [ownSpecs, setOwnSpecs] = useState<OwnSpec[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const [code, setCode] = useState("")
  const [redeemed, setRedeemed] = useState<Redeemed | null>(null)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loginRequired, setLoginRequired] = useState(false)
  const [checkedAt, setCheckedAt] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    const response = await requestInternal<OwnResponse>("GET")
    setOwnSpecs(response.specs || [])
    setInvites(response.invites || [])
    setCheckedAt(Date.now())
    setSelectedId(current => response.specs?.some(spec => spec.id === current)
      ? current : response.specs?.[0]?.id || "")
  }, [])

  useEffect(() => {
    let active = true
    requestInternal<OwnResponse>("GET").then(value => {
      if (!active) return
      setOwnSpecs(value.specs || [])
      setInvites(value.invites || [])
      setCheckedAt(Date.now())
      setSelectedId(value.specs?.[0]?.id || "")
    }).catch(err => {
      if (!active) return
      setError((err as Error).message)
      setLoginRequired((err as Error).name === "LoginRequired")
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const handleRefresh = async () => {
    if (busy) return
    setBusy(true); setError(""); setNotice("")
    try { await refresh() }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const handlePreview = async () => {
    if (!selectedId || busy) return
    setBusy(true); setError(""); setNotice(""); setCreated(null); setReviewed(false); setPreview(null)
    try {
      const result=await requestInternal<Preview>("POST",{action:"preview",spec_id:selectedId})
      setPreview(result)
    } catch(err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const handleCreate = async () => {
    if (!preview || !reviewed || busy) return
    setBusy(true); setError(""); setNotice("")
    try {
      const result=await requestInternal<Created>("POST",{
        action:"create",spec_id:selectedId,
        preview_hash:preview.preview_hash,confirm_safe:true,
      })
      setCreated(result); setPreview(null); setReviewed(false)
      await refresh()
      setNotice("分享码已生成，仅在此处显示。发送给已获授权的同事即可。")
    } catch(err) {
      setReviewed(false)
      setError((err as Error).message)
    } finally { setBusy(false) }
  }
  const handleRedeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true); setRedeemed(null); setError(""); setNotice("")
    try {
      const result=await requestInternal<Redeemed>("POST",{
        action:"redeem",share_code:code.trim(),
      })
      setRedeemed(result)
      setCode("")
      await refresh()
      setNotice("Agent 已复制到你的工作台，请使用自己的模型与知识库连接并试运行。")
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const handleRevoke = async (id: string) => {
    if (busy) return
    setBusy(true); setError(""); setNotice("")
    try {
      await requestInternal("POST",{action:"revoke",id})
      if (created?.id === id) setCreated(null)
      await refresh()
      setNotice("分享码已撤销，未领取的同事将无法再使用。")
    } catch(err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const handleCopy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.share_code)
      setNotice("分享码已复制。请通过公司的授权沟通渠道发送，不要发到公开群组。")
    } catch { setError("剪贴板复制失败，请手动复制显示的分享码。") }
  }

  return (
    <SiteShell>
      <div className="min-h-screen flex-1 bg-background text-foreground">
        <header className="border-b border-border bg-card px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-primary/10 p-3 text-primary"><UsersRound className="h-6 w-6"/></span>
              <div>
                <h1 className="text-xl font-semibold">内部 Agent 共享</h1>
                <p className="mt-1 text-xs text-muted-foreground">员工间复制已审核的 Agent 模板，不共享账号凭据与知识库资料</p>
              </div>
            </div>
            <button onClick={() => void handleRefresh()} disabled={busy || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">
              <RefreshCw className="h-4 w-4"/>刷新
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
          {loading && <p role="status" className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>正在获取内部分享权限…
          </p>}
          {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0"/>{error}</span>
            {loginRequired && <button className="underline" onClick={redirectToRhLogin}>去登录</button>}
          </div>}
          {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0"/>{notice}
          </div>}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
            <div className="space-y-5">
              <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="text-base font-semibold">创建一次性内部分享码</h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  仅分享你主动确认的目标、任务步骤和内置工具。不会把外部工具连接、模型密钥、
                  知识库 ID 或写入授权转交给同事。
                </p>
                <label className="mt-4 block text-xs font-medium text-muted-foreground">
                  选择我的 Agent
                  <select aria-label="选择需要分享的 Agent" className={"mt-2 "+inputClass}
                    value={selectedId} disabled={busy || ownSpecs.length===0}
                    onChange={event => {
                      setSelectedId(event.target.value)
                      setPreview(null);setReviewed(false);setCreated(null);setError("")
                    }}>
                    {ownSpecs.length===0 && <option value="">暂无可分享的 Agent</option>}
                    {ownSpecs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btnPrimary} onClick={() => void handlePreview()}
                    disabled={!selectedId || busy}>预览实际分享内容</button>
                  <Link className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs hover:bg-secondary"
                    to="/">管理我的 Agent <ArrowRight className="h-3.5 w-3.5"/></Link>
                </div>
                {preview && <div className="mt-5 space-y-3 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold">请审核：{preview.name}</h3>
                  <p className="text-xs text-amber-800">{preview.warning}</p>
                  <FieldPreview name="任务目标" value={preview.preview_spec.goal}/>
                  <FieldPreview name="范围与限制" value={preview.preview_spec.task_scope}/>
                  <FieldPreview name="交付成果" value={preview.preview_spec.deliverables}/>
                  <FieldPreview name="执行步骤" value={preview.preview_spec.task_plan}/>
                  <FieldPreview name="内置工具" value={preview.preview_spec.tools}/>
                  <FieldPreview name="完成标准" value={preview.preview_spec.done_criteria}/>
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-relaxed">
                    <ShieldCheck className="mr-1 inline h-4 w-4 text-primary"/>
                    接收方的知识库关联将清空，外部写操作需重新授权；接收方不会自动执行此 Agent。
                  </div>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3 text-xs leading-relaxed">
                    <input type="checkbox" aria-label="确认分享内容已审核" checked={reviewed}
                      onChange={e => setReviewed(e.target.checked)} className="mt-0.5 accent-primary"/>
                    我已逐项检查上述文本，确认不含不应向同事分享的内部机密、个人信息或访问凭据。
                  </label>
                  <button className={btnPrimary} disabled={!reviewed || busy} onClick={() => void handleCreate()}>
                    {busy ? "正在生成…" : "确认并生成分享码"}
                  </button>
                </div>}
                {created && <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-semibold">分享码已生成 · 七天内有效 · 仅可领取一次</p>
                  <p className="mt-1 text-xs text-muted-foreground">关闭页面后不会重新显示。请现在复制，通过授权渠道发给同事。</p>
                  <p className="mt-3 select-all break-all rounded-lg border border-border bg-background p-3 font-mono text-sm">{created.share_code}</p>
                  <p className="mt-1 text-xs text-muted-foreground">截止 {dateLabel(created.expires_ms)}</p>
                  <button type="button" onClick={() => void handleCopy()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-background">
                    <ClipboardCopy className="h-4 w-4"/>复制分享码
                  </button>
                </div>}
              </section>
              <section className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">我的分享记录</h2>
                  <span className="text-xs text-muted-foreground">最近 {invites.length} 条</span>
                </div>
                <div className="mt-3 space-y-2">
                  {invites.length===0 ? <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">还没有分享过 Agent</p> :
                  invites.map(item=><div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3" key={item.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{statusLabel(item,checkedAt)} · 创建于 {dateLabel(item.created_ms)}</p>
                    </div>
                    {!item.revoked && !item.used_ms && item.expires_ms>checkedAt &&
                      <button type="button" disabled={busy} onClick={() => void handleRevoke(item.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">
                        <Trash2 className="h-3.5 w-3.5"/>撤销
                      </button>}
                  </div>)}
                </div>
              </section>
            </div>
            <section className="self-start rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold"><KeyRound className="h-4 w-4 text-primary"/>领取同事分享的 Agent</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                输入同事通过授权渠道发送的一次性分享码。领取后 Agent 会复制到你的账号，
                使用你自己的模型和知识库连接，分享人无权操作你的副本。
              </p>
              <form onSubmit={event => void handleRedeem(event)} className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-muted-foreground">
                  一次性分享码
                  <input className={"mt-1.5 "+inputClass} value={code} maxLength={48}
                    onChange={e => {setCode(e.target.value.trim());setRedeemed(null)}}
                    placeholder="粘贴 48 位分享码" autoComplete="off" aria-label="一次性分享码"/>
                </label>
                <button type="submit" className={btnPrimary} disabled={busy || code.length!==48}>领取并复制到我的助手</button>
              </form>
              {redeemed && <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-primary"/>领取成功</p>
                <p className="mt-2 text-xs leading-relaxed">{redeemed.message}</p>
                <Link to="/" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  打开我的 Agent 工作台 <ArrowRight className="h-4 w-4"/>
                </Link>
              </div>}
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">内部使用规则</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  仅已授权员工可分享或领取。分享的是审核后的配置副本，不含源作者的知识库、
                  外部工具与密钥。未经授权的资料不应放进分享文本。
                </p>
              </div>
            </section>
          </div>
        </main>
      </div>
    </SiteShell>
  )
}
