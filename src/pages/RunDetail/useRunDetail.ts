import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
import {
  RUN_STATE_META,
  formatHarnessStats,
  type RunEvaluation,
  type RunEventRow,
  type RunFeedback,
  type RunStateKey,
} from "@/pages/AgentRun/useAgentRun"
import type { AgentSpec } from "@/pages/Home/presets"

// 字段名与 GET /api/agent-runs/{id}/detail 返回的 run 1:1（snake_case，禁止转换层）
export type RunDetailRow = {
  id: string
  spec_id: string
  spec_name: string
  instruction: string
  status: RunStateKey
  current_step: number
  max_steps: number
  model: string
  config: Record<string, unknown> | null
  checkpoint: Record<string, unknown> | null
  result: string
  error: string
  evaluation: RunEvaluation | null
  feedback: RunFeedback | null
  created: string
  updated: string
}

// GET /api/agent-runs/recent 精简行
export type RecentRunRow = {
  id: string
  spec_id: string
  spec_name: string
  instruction: string
  status: RunStateKey
  current_step: number
  max_steps: number
  model: string
  source: string
  created: string
}

export type RunSnapshot = (AgentSpec & { name?: string }) | null

export type RunDetailLoadState = "idle" | "loading" | "ready" | "not_found" | "error"

export type StepGroup = { stepIndex: number; events: RunEventRow[] }

const LIVE_STATES: RunStateKey[] = ["queued", "running", "paused", "awaiting_approval"]
const POLL_INTERVAL_MS = 3000

export function formatRunDetailTime(raw: string): string {
  if (!raw) return ""
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T")
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

// 时间线按 step_index 分组（后端已按 step_index,seq,created 排序，这里只做连续分段）
export function groupEventsByStep(events: RunEventRow[]): StepGroup[] {
  const groups: StepGroup[] = []
  for (const evItem of events) {
    const idx = Number(evItem.step_index) || 0
    const last = groups[groups.length - 1]
    if (last && last.stepIndex === idx) {
      last.events.push(evItem)
    } else {
      groups.push({ stepIndex: idx, events: [evItem] })
    }
  }
  return groups
}

export function useRunDetail() {
  const base = getPocketBaseUrl()
  const [searchParams, setSearchParams] = useSearchParams()
  const runIdParam = searchParams.get("run") || ""

  const [rhUserId, setRhUserId] = useState("")
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const [runDetail, setRunDetail] = useState<RunDetailRow | null>(null)
  const [runEvents, setRunEvents] = useState<RunEventRow[]>([])
  const [specSnapshot, setSpecSnapshot] = useState<RunSnapshot>(null)
  const [loadState, setLoadState] = useState<RunDetailLoadState>("idle")

  const [recentRuns, setRecentRuns] = useState<RecentRunRow[]>([])
  const [liveEnabled, setLiveEnabled] = useState(true)
  const [controlBusy, setControlBusy] = useState<"" | "pause" | "resume" | "cancel">("")
  const [copiedFlag, setCopiedFlag] = useState(false)

  const pollBusyRef = useRef(false)

  useEffect(() => {
    const payload = decodeRhToken()
    setRhUserId(payload?.sub ? String(payload.sub) : LOCAL_ANON_UID)
  }, [])

  const fetchDetail = useCallback(
    async (runId: string, isPoll: boolean) => {
      const res = await fetch(`${base}/api/agent-runs/${encodeURIComponent(runId)}/detail`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return
      }
      if (res.status === 404) {
        if (!isPoll) {
          setRunDetail(null)
          setRunEvents([])
          setSpecSnapshot(null)
          setLoadState("not_found")
        }
        return
      }
      if (!res.ok) {
        if (!isPoll) {
          setErrorMsg("加载运行详情失败，请稍后重试")
          setLoadState("error")
        }
        return
      }
      const data = await res.json()
      const run = data?.run as RunDetailRow | undefined
      if (run?.id) {
        setRunDetail(run)
        setLoadState("ready")
      }
      setRunEvents(Array.isArray(data?.events) ? (data.events as RunEventRow[]) : [])
      setSpecSnapshot((data?.spec_snapshot as RunSnapshot) || null)
    },
    [base],
  )

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/agent-runs/recent?limit=5`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return
      }
      if (!res.ok) return
      const data = await res.json()
      setRecentRuns(Array.isArray(data?.items) ? (data.items as RecentRunRow[]) : [])
    } catch {
      // 最近运行加载失败不阻塞详情主流程
    }
  }, [base])

  useEffect(() => {
    if (!rhUserId) return
    void loadRecent()
    if (!runIdParam) {
      setRunDetail(null)
      setRunEvents([])
      setSpecSnapshot(null)
      setLoadState("idle")
      return
    }
    setLoadState("loading")
    void fetchDetail(runIdParam, false)
  }, [rhUserId, runIdParam, fetchDetail, loadRecent])

  const pollDetailOnce = useCallback(
    async (runId: string) => {
      if (pollBusyRef.current) return
      pollBusyRef.current = true
      try {
        await fetchDetail(runId, true)
      } catch {
        // 单次轮询失败静默，下一轮重试
      } finally {
        pollBusyRef.current = false
      }
    },
    [fetchDetail],
  )

  const isLive = Boolean(runDetail && LIVE_STATES.includes(runDetail.status))

  // 实时刷新：仅观察（不驱动引擎 tick），3s 轮询，终态自动停，可手动关
  useEffect(() => {
    if (!runDetail || !isLive || !liveEnabled) return
    const runId = runDetail.id
    const timer = window.setInterval(() => {
      void pollDetailOnce(runId)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runDetail?.id, isLive, liveEnabled, pollDetailOnce])

  const handleToggleLive = useCallback(() => setLiveEnabled((prev) => !prev), [])

  const handleControl = useCallback(
    async (action: "pause" | "resume" | "cancel") => {
      if (!runDetail || controlBusy) return
      setControlBusy(action)
      setErrorMsg("")
      try {
        const res = await fetch(
          `${base}/api/agent-runs/${encodeURIComponent(runDetail.id)}/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
            body: "{}",
          },
        )
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          setErrorMsg("登录态已过期，请重新登录后再操作")
          return
        }
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "操作失败，请稍后重试")
          return
        }
        await fetchDetail(runDetail.id, true)
        if (action === "cancel") void loadRecent()
      } catch {
        setErrorMsg("网络异常，操作失败，请重试")
      } finally {
        setControlBusy("")
      }
    },
    [runDetail, controlBusy, base, fetchDetail, loadRecent],
  )

  const handleSelectRecent = useCallback(
    (runId: string) => {
      setErrorMsg("")
      setLiveEnabled(true)
      setSearchParams({ run: runId })
    },
    [setSearchParams],
  )

  const handleBackToRecent = useCallback(() => {
    setErrorMsg("")
    setSearchParams({})
  }, [setSearchParams])

  const dismissError = useCallback(() => setErrorMsg(""), [])

  const handleCopyResult = useCallback(() => {
    const text = runDetail?.result || ""
    if (!text) return
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedFlag(true)
        window.setTimeout(() => setCopiedFlag(false), 2000)
      })
      .catch(() => setErrorMsg("复制失败，请手动选择文本复制"))
  }, [runDetail])

  // 模型显示名：自定义连接 → 「自定义 · <model_id>」；平台模型 → 目录 label，兜底原始 id
  const customModelCfg = (runDetail?.config?.custom_model || null) as
    | { connection_id?: string; model_id?: string }
    | null
  const modelLabel = customModelCfg?.model_id
    ? `自定义 · ${customModelCfg.model_id}`
    : runDetail?.model || ""
  const isAcceptanceTest = String(runDetail?.config?.source || "") === "acceptance_test"
  const isCustomModel = customModelCfg?.model_id !== undefined && customModelCfg?.model_id !== null

  // harness 核算行：checkpoint.harness_stats 缺失时为 null（旧 run 不展示，不编造）
  const harnessLine = formatHarnessStats(runDetail?.checkpoint)

  // 导出运行报告：概览 + 配置快照 + 逐步时间线 + 最终成果，组装 markdown 下载
  const handleExportReport = useCallback(() => {
    if (!runDetail) return
    const lines: string[] = []
    lines.push("# 助手运行报告")
    lines.push("")
    lines.push(`- 运行编号：${runDetail.id}`)
    lines.push(`- 助手方案：${runDetail.spec_name || "未知"}`)
    lines.push(`- 任务指令：${runDetail.instruction || "（空）"}`)
    lines.push(`- 状态：${RUN_STATE_META[runDetail.status]?.label || runDetail.status}`)
    lines.push(`- 模型：${modelLabel || runDetail.model || "未知"}`)
    lines.push(`- 步数：${runDetail.current_step} / ${runDetail.max_steps}`)
    lines.push(`- 开始时间：${formatRunDetailTime(runDetail.created) || "未知"}`)
    lines.push(`- 更新时间：${formatRunDetailTime(runDetail.updated) || "—"}`)
    lines.push("")
    lines.push("## 配置快照")
    if (specSnapshot) {
      lines.push(`- 目标：${specSnapshot.goal || "（空）"}`)
      lines.push(`- 任务范围：${specSnapshot.task_scope || "（空）"}`)
      lines.push(`- 任务步骤：${(specSnapshot.task_plan || []).join(" → ") || "（空）"}`)
      lines.push(`- 交付物：${(specSnapshot.deliverables || []).join("、") || "（空）"}`)
      lines.push(`- 工具：${(specSnapshot.tools || []).join("、") || "（空）"}`)
      lines.push(`- 完成标准：${(specSnapshot.done_criteria || []).join("；") || "（空）"}`)
    } else {
      lines.push("（无配置快照）")
    }
    lines.push("")
    lines.push("## 运行时间线")
    for (const group of groupEventsByStep(runEvents)) {
      lines.push("")
      lines.push(`### 第 ${group.stepIndex + 1} 步`)
      for (const ev of group.events) {
        const contentText =
          typeof ev.content === "string" ? ev.content : JSON.stringify(ev.content, null, 2)
        lines.push(`- [${ev.event_type}] ${contentText}`)
      }
    }
    lines.push("")
    lines.push("## 最终成果")
    lines.push(runDetail.result || "（无）")
    if (runDetail.error) {
      lines.push("")
      lines.push("## 失败原因")
      lines.push(runDetail.error)
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `run-report-${runDetail.id}.md`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }, [modelLabel, runDetail, runEvents, specSnapshot])

  return {
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    errorMsg,
    dismissError,
    runIdParam,
    runDetail,
    runEvents,
    specSnapshot,
    loadState,
    recentRuns,
    isLive,
    liveEnabled,
    handleToggleLive,
    controlBusy,
    handleControl,
    handleSelectRecent,
    handleBackToRecent,
    handleCopyResult,
    copiedFlag,
    handleExportReport,
    modelLabel,
    isAcceptanceTest,
    isCustomModel,
    harnessLine,
    runStateMeta: RUN_STATE_META,
    stepGroups: groupEventsByStep(runEvents),
    formatRunDetailTime,
  }
}
