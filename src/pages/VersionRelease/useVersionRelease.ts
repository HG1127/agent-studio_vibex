import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
import { tickAgentRun } from "@/lib/agentEngine"
import type { AgentSpec, SavedSpecRow } from "@/pages/Home/useHome"
import type { AgentRunRow } from "@/pages/AgentRun/useAgentRun"

export type { AgentSpec, SavedSpecRow }

// 字段名与 spec_versions collection 1:1（snake_case，禁止转换层）
export type SpecVersionRow = {
  id: string
  rh_user_id: string
  spec_id: string
  version_no: number
  spec_snapshot: AgentSpec | null
  config_snapshot: { name: string; source: string; template_key: string; saved_at?: string } | null
  note: string
  test_run_id: string
  test_passed: boolean
  status: "draft" | "published" | "archived"
  published_at: string
  created: string
  updated: string
}

export type VersionStatusKey = "draft" | "published" | "archived"

export const VERSION_STATUS_META: Record<VersionStatusKey, { label: string; badge: string }> = {
  draft: { label: "草稿", badge: "bg-muted text-muted-foreground" },
  published: { label: "已发布", badge: "bg-primary/10 text-primary" },
  archived: { label: "已归档", badge: "bg-secondary text-secondary-foreground" },
}

export type ConfirmAction = {
  kind: "publish" | "restore" | "delete"
  row: SpecVersionRow
}

const TEST_MAX_STEPS = 8
const LIVE_STATES = ["queued", "running", "paused"]
const CUSTOM_MODEL_PREFIX = "custom:"

function parseCustomModelValue(value: string): { connectionId: string; modelId: string } | null {
  if (!value.startsWith(CUSTOM_MODEL_PREFIX)) return null
  const rest = value.slice(CUSTOM_MODEL_PREFIX.length)
  const sepIndex = rest.indexOf(":")
  if (sepIndex <= 0) return null
  return { connectionId: rest.slice(0, sepIndex), modelId: rest.slice(sepIndex + 1) }
}

export type CustomModelOption = { value: string; label: string; hint: string }

export function formatVersionTime(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function useVersionRelease() {
  const base = getPocketBaseUrl()
  const [searchParams] = useSearchParams()

  const [rhUserId, setRhUserId] = useState("")
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [noticeMsg, setNoticeMsg] = useState("")

  const [specList, setSpecList] = useState<SavedSpecRow[]>([])
  const [isLoadingSpecs, setIsLoadingSpecs] = useState(false)
  const [selectedSpecId, setSelectedSpecId] = useState("")

  const [versionList, setVersionList] = useState<SpecVersionRow[]>([])
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [expandedVersionId, setExpandedVersionId] = useState("")

  const [testInstruction, setTestInstruction] = useState("")
  const [testModel, setTestModel] = useState("")
  const [customModels, setCustomModels] = useState<CustomModelOption[]>([])
  const [isStartingTest, setIsStartingTest] = useState(false)
  const [testRun, setTestRun] = useState<AgentRunRow | null>(null)

  const [versionNote, setVersionNote] = useState("")
  const [isSavingVersion, setIsSavingVersion] = useState(false)

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [isConfirmBusy, setIsConfirmBusy] = useState(false)

  const [publishPickId, setPublishPickId] = useState("")

  const tickInFlightRef = useRef(false)
  const pollBusyRef = useRef(false)
  const specParamAppliedRef = useRef(false)

  useEffect(() => {
    const payload = decodeRhToken()
    setRhUserId(payload?.sub ? String(payload.sub) : LOCAL_ANON_UID)
  }, [])

  const selectedSpec = specList.find((row) => row.id === selectedSpecId) || null
  const publishedVersion = versionList.find((row) => row.status === "published") || null
  const publishRecords = versionList.filter((row) => row.published_at !== "")
  const nextVersionNo = versionList.reduce((maxNo, row) => Math.max(maxNo, row.version_no), 0) + 1
  const isTestLive = Boolean(testRun && LIVE_STATES.includes(testRun.status))
  const testPassed = Boolean(testRun && testRun.status === "succeeded")
  const testFailed = Boolean(testRun && (testRun.status === "failed" || testRun.status === "cancelled"))
  const isCustomTestModel = parseCustomModelValue(testModel) !== null

  const loadVersionList = useCallback(
    async (specId: string) => {
      if (!specId) {
        setVersionList([])
        return
      }
      setIsLoadingVersions(true)
      try {
        const res = await fetch(`${base}/api/spec-versions?spec_id=${encodeURIComponent(specId)}`, {
          headers: { ...vibexAuthHeaders() },
        })
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          return
        }
        if (res.ok) {
          const data = await res.json()
          const items = Array.isArray(data?.items) ? (data.items as SpecVersionRow[]) : []
          setVersionList(items)
        }
      } catch {
        // 版本列表加载失败不阻塞页面
      } finally {
        setIsLoadingVersions(false)
      }
    },
    [base],
  )

  const loadSpecList = useCallback(async (uid: string) => {
    if (!uid) return
    setIsLoadingSpecs(true)
    try {
      const res = await fetch(`${base}/api/agent_specs?rh_user_id=${encodeURIComponent(uid)}`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return
      }
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data?.items) ? (data.items as SavedSpecRow[]) : []
        setSpecList(items)
      }
    } catch {
      // 方案列表加载失败不阻塞页面
    } finally {
      setIsLoadingSpecs(false)
    }
  }, [base])

  const loadCustomModels = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/model-connections`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (!res.ok) return
      const data = await res.json()
      const items = Array.isArray(data?.items)
        ? (data.items as { id: string; name: string; enabled: boolean; models: string[] }[])
        : []
      const options: CustomModelOption[] = []
      for (const conn of items) {
        if (!conn.enabled) continue
        for (const modelId of conn.models || []) {
          options.push({
            value: `${CUSTOM_MODEL_PREFIX}${conn.id}:${modelId}`,
            label: modelId,
            hint: `自定义 · ${conn.name}`,
          })
        }
      }
      setCustomModels(options)
    } catch {
      // 自定义模型加载失败不阻塞平台模型测试
    }
  }, [base])

  useEffect(() => {
    if (!rhUserId) return
    void loadSpecList(rhUserId)
    void loadCustomModels()
  }, [rhUserId, loadSpecList, loadCustomModels])

  // 支持 ?spec=<id> 预选助手（agent-run「存为版本」快捷入口 / 直达链接）
  useEffect(() => {
    if (specParamAppliedRef.current || specList.length === 0) return
    const wanted = searchParams.get("spec")
    if (!wanted) return
    if (specList.some((row) => row.id === wanted)) {
      setSelectedSpecId(wanted)
      specParamAppliedRef.current = true
    }
  }, [specList, searchParams])

  const handleSelectSpec = useCallback(
    (specId: string) => {
      setSelectedSpecId(specId)
      setTestRun(null)
      setTestInstruction("")
      setVersionNote("")
      setExpandedVersionId("")
      setConfirmAction(null)
      setPublishPickId("")
      setErrorMsg("")
      setNoticeMsg("")
      void loadVersionList(specId)
    },
    [loadVersionList],
  )

  // 选中助手后加载版本历史
  useEffect(() => {
    if (!selectedSpecId) {
      setVersionList([])
      return
    }
    void loadVersionList(selectedSpecId)
  }, [selectedSpecId, loadVersionList])

  const fetchRunRecord = useCallback(
    async (runId: string): Promise<AgentRunRow | null> => {
      const res = await fetch(`${base}/api/agent_runs/${encodeURIComponent(runId)}`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return null
      }
      if (!res.ok) return null
      return (await res.json()) as AgentRunRow
    },
    [base],
  )

  const pollTestOnce = useCallback(
    async (runId: string) => {
      if (pollBusyRef.current) return
      pollBusyRef.current = true
      try {
        const fresh = await fetchRunRecord(runId)
        if (fresh?.id) {
          setTestRun(fresh)
          if (fresh.status === "running" && !tickInFlightRef.current) {
            // 复用现有引擎：running 态每轮触发一步（服务端 claim_until 防重叠）
            tickInFlightRef.current = true
            void tickAgentRun(runId).finally(() => {
              tickInFlightRef.current = false
            })
          }
        }
      } catch {
        // 单次轮询失败静默，下一轮重试
      } finally {
        pollBusyRef.current = false
      }
    },
    [fetchRunRecord],
  )

  useEffect(() => {
    if (!testRun || !LIVE_STATES.includes(testRun.status)) return
    const runId = testRun.id
    void pollTestOnce(runId)
    const timer = window.setInterval(() => {
      void pollTestOnce(runId)
    }, 3000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testRun?.id, testRun?.status, pollTestOnce])

  const doStartTest = useCallback(async () => {
    if (!selectedSpec || !testInstruction.trim()) return
    setIsStartingTest(true)
    setErrorMsg("")
    try {
      const parsedCustom = parseCustomModelValue(testModel)
      const startBody: Record<string, unknown> = {
        spec_id: selectedSpec.id,
        instruction: testInstruction.trim(),
        model: parsedCustom ? parsedCustom.modelId : testModel,
        config: {
          max_steps: TEST_MAX_STEPS,
          stop_condition: "",
          stop_on_complete: true,
          tools: { calculate: true, summarize: true, knowledge_search: true },
          // 标记为验收测试运行，与普通试跑同表同引擎，仅来源不同
          source: "acceptance_test",
          ...(parsedCustom
            ? {
                custom_model: {
                  connection_id: parsedCustom.connectionId,
                  model_id: parsedCustom.modelId,
                },
              }
            : {}),
        },
      }
      const res = await fetch(`${base}/api/agent-runs/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify(startBody),
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setErrorMsg("登录态已过期，请重新登录后再运行测试")
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.message || "创建测试运行失败，请稍后重试")
        return
      }
      const data = await res.json()
      const runId = String(data?.run_id || "")
      if (runId) {
        const full = await fetchRunRecord(runId)
        if (full) setTestRun(full)
      }
    } catch {
      setErrorMsg("网络异常，创建测试运行失败，请重试")
    } finally {
      setIsStartingTest(false)
    }
  }, [selectedSpec, testInstruction, testModel, base, fetchRunRecord])

  const handleRunTest = useCallback(() => {
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    if (!selectedSpec) {
      setErrorMsg("请先选择要验收的助手方案")
      return
    }
    if (!testInstruction.trim()) {
      setErrorMsg("请输入一条测试指令后再运行")
      return
    }
    if (isStartingTest || isTestLive) return
    setErrorMsg("")
    // 自定义模型走用户自己的密钥，不产生平台费用，不弹计费确认（与试跑页一致）
    if (!parseCustomModelValue(testModel)) {
      setErrorMsg("请先选择你自己的模型连接里的模型（没有的话先到「模型连接」页添加一个模型连接）")
      return
    }
    void doStartTest()
  }, [rhUserId, selectedSpec, testInstruction, isStartingTest, isTestLive, testModel, doStartTest])

  const handleSaveVersion = useCallback(async () => {
    if (!selectedSpec || isSavingVersion) return
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    setIsSavingVersion(true)
    setErrorMsg("")
    setNoticeMsg("")
    try {
      const res = await fetch(`${base}/api/spec-versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({
          spec_id: selectedSpec.id,
          note: versionNote.trim(),
          test_run_id: testRun?.id || "",
        }),
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setErrorMsg("登录态已过期，请重新登录后再保存版本")
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "保存版本失败，请稍后重试")
        return
      }
      const savedNo = Number(data?.item?.version_no || nextVersionNo)
      setVersionNote("")
      setNoticeMsg(
        data?.item?.test_passed
          ? `v${savedNo} 已保存，关联的验收测试已通过。`
          : `v${savedNo} 已保存，标记为「未测试」。建议之后补跑一次验收测试。`,
      )
      await loadVersionList(selectedSpec.id)
    } catch {
      setErrorMsg("网络异常，保存版本失败，请重试")
    } finally {
      setIsSavingVersion(false)
    }
  }, [selectedSpec, isSavingVersion, rhUserId, base, versionNote, testRun, nextVersionNo, loadVersionList])

  const requestPublish = useCallback((row: SpecVersionRow) => {
    setErrorMsg("")
    setNoticeMsg("")
    setConfirmAction({ kind: "publish", row })
  }, [])

  const requestRestore = useCallback((row: SpecVersionRow) => {
    setErrorMsg("")
    setNoticeMsg("")
    setConfirmAction({ kind: "restore", row })
  }, [])

  const requestDelete = useCallback((row: SpecVersionRow) => {
    setErrorMsg("")
    setNoticeMsg("")
    setConfirmAction({ kind: "delete", row })
  }, [])

  const cancelConfirm = useCallback(() => {
    if (!isConfirmBusy) setConfirmAction(null)
  }, [isConfirmBusy])

  const handleConfirm = useCallback(async () => {
    if (!confirmAction || isConfirmBusy || !selectedSpec) return
    const { kind, row } = confirmAction
    setIsConfirmBusy(true)
    setErrorMsg("")
    try {
      const url =
        kind === "delete"
          ? `${base}/api/spec-versions/${encodeURIComponent(row.id)}`
          : `${base}/api/spec-versions/${encodeURIComponent(row.id)}/${kind}`
      const res = await fetch(url, {
        method: kind === "delete" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: kind === "delete" ? undefined : "{}",
      })
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
      setConfirmAction(null)
      if (kind === "publish") {
        setNoticeMsg(`v${row.version_no} 已发布，原发布版本已自动归档。`)
        setPublishPickId("")
      } else if (kind === "restore") {
        setNoticeMsg(`已把 v${row.version_no} 恢复为当前配置，去试跑页可验证。`)
      } else {
        setNoticeMsg(`v${row.version_no} 草稿已删除。`)
      }
      await loadVersionList(selectedSpec.id)
    } catch {
      setErrorMsg("网络异常，操作失败，请重试")
    } finally {
      setIsConfirmBusy(false)
    }
  }, [confirmAction, isConfirmBusy, selectedSpec, base, loadVersionList])

  const handlePublishPick = useCallback(
    (versionId: string) => {
      setPublishPickId(versionId)
      const row = versionList.find((item) => item.id === versionId) || null
      if (row) requestPublish(row)
    },
    [versionList, requestPublish],
  )

  const toggleVersionExpand = useCallback((versionId: string) => {
    setExpandedVersionId((prev) => (prev === versionId ? "" : versionId))
  }, [])

  const dismissError = useCallback(() => setErrorMsg(""), [])
  const dismissNotice = useCallback(() => setNoticeMsg(""), [])

  return {
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    errorMsg,
    dismissError,
    noticeMsg,
    dismissNotice,
    specList,
    isLoadingSpecs,
    selectedSpecId,
    selectedSpec,
    handleSelectSpec,
    versionList,
    isLoadingVersions,
    publishedVersion,
    publishRecords,
    nextVersionNo,
    expandedVersionId,
    toggleVersionExpand,
    testInstruction,
    setTestInstruction,
    testModel,
    setTestModel,
    customModels,
    isCustomTestModel,
    isStartingTest,
    isTestLive,
    testRun,
    testPassed,
    testFailed,
    handleRunTest,
    testMaxSteps: TEST_MAX_STEPS,
    versionNote,
    setVersionNote,
    isSavingVersion,
    handleSaveVersion,
    confirmAction,
    isConfirmBusy,
    requestPublish,
    requestRestore,
    requestDelete,
    handleConfirm,
    cancelConfirm,
    publishPickId,
    handlePublishPick,
    versionStatusMeta: VERSION_STATUS_META,
    formatVersionTime,
  }
}
