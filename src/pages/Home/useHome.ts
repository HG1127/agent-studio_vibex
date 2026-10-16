import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { callLlmWithFallback, type LlmMessage } from "@/lib/llm"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
import {
  clearAgentDraft, readAgentDraft, saveAgentDraft, type AgentEditorDraft,
} from "@/lib/agentEditorDraft"
import { registerUnsavedWorkCheck } from "@/lib/unsavedNavigation"
import { useSearchParams } from "react-router-dom"
import { getKnowledgeBases, type KnowledgeBase } from "@/lib/knowledgeBases"
import {
  BUILTIN_TOOL_OPTIONS,
  TEMPLATE_PRESETS,
  toolConnectionStatus,
  type AgentSpec,
  type ConnectedToolOption,
  type ListField,
  type TemplatePreset,
} from "./presets"

export type { AgentSpec, ConnectedToolOption, ListField, TemplatePreset } from "./presets"

export type SavedSpecRow = {
  id: string
  rh_user_id: string
  name: string
  spec: AgentSpec
  source: string
  template_key: string
  created: string
  updated: string
}

const MODEL_SHORT = "gemini-3.1-flash-lite-preview"

const LLM_ERROR_TEXT: Record<string, string> = {
  timeout: "AI 生成超时（可能服务器繁忙），请稍后重试",
  not_found: "请求未能到达 AI，请检查网络后重试",
  rh_login_required: "请先登录后再生成",
  insufficient_balance: "账户余额不足，请充值后重试",
  model_connection_required: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接",
}

const SYSTEM_PROMPT = [
  "你是「Agent Studio」的助手方案设计器，把用户的一句自然语言需求转成结构化的助手方案。",
  "只输出一个 JSON 对象，不要 markdown 代码块，不要任何额外文字。JSON 字段如下：",
  'name：助手名称，不超过 12 个汉字',
  'goal：一句话说明这个助手帮用户解决什么问题',
  'task_scope：助手负责的任务范围与明确不负责的事，2-3 句话',
  'deliverables：字符串数组，助手最终交付的具体产物（2-5 项）',
  'tools：字符串数组，完成任务所需的通用工具能力名（如「网络搜索」「文档解析」「数据图表」），2-6 项，不写具体产品名',
  'task_plan：字符串数组，按执行顺序拆解的任务步骤（3-7 步）',
  'done_criteria：字符串数组，判断任务完成的标准（2-5 条）',
  "所有内容使用简体中文，贴合用户的真实需求，不空泛。",
].join("\n")

const REVISE_SYSTEM_PROMPT = [
  "你是「Agent Studio」的助手方案修订器。用户会给你一份现有方案 JSON 和一句修改要求。",
  "请在现有方案基础上做增量修订：只改与修改要求相关的部分，其余字段保持原样。",
  "只输出修订后的完整 JSON 对象（字段结构与原方案一致：name/goal/task_scope/deliverables/tools/task_plan/done_criteria），",
  "不要 markdown 代码块，不要任何额外文字。所有内容使用简体中文。",
].join("\n")

function parseSpecJson(raw: string): { displayName: string; spec: AgentSpec } | null {
  let text = (raw || "").trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const toStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v))
    const toStrArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => toStr(x)).filter((x) => x.trim() !== "") : []
    return {
      displayName: toStr(obj.name).slice(0, 24) || "未命名助手",
      spec: {
        goal: toStr(obj.goal),
        task_scope: toStr(obj.task_scope),
        deliverables: toStrArr(obj.deliverables),
        tools: toStrArr(obj.tools),
        task_plan: toStrArr(obj.task_plan),
        done_criteria: toStrArr(obj.done_criteria),
      },
    }
  } catch {
    return null
  }
}

function scrollToSpecEditor() {
  requestAnimationFrame(() => {
    document.getElementById("spec-editor")?.scrollIntoView({ behavior: "smooth", block: "start" })
  })
}

export function useHome() {
  const [query] = useSearchParams()
  const returnSpecRef = useRef(query.get("spec") || "")
  const specRevisionRef = useRef(0)

  const [rhUserId] = useState(() => decodeRhToken()?.sub || LOCAL_ANON_UID)
  // A saved draft is offered explicitly, never silently merged with a newer
  // server snapshot or with a different employee's account.
  const [pendingDraft, setPendingDraft] = useState<AgentEditorDraft | null>(() => readAgentDraft(rhUserId))
  const [draftDecisionMade, setDraftDecisionMade] = useState(() => !readAgentDraft(rhUserId))
  const [draftPersistError, setDraftPersistError] = useState(false)
  const [userInput, setUserInput] = useState("")
  const [reviseInput, setReviseInput] = useState("")
  const [spec, setSpec] = useState<AgentSpec | null>(null)
  const [specName, setSpecName] = useState("")
  const [sourceMode, setSourceMode] = useState<"create" | "template">("create")
  const [templateKey, setTemplateKey] = useState("")
  const [editingRecordId, setEditingRecordId] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRevising, setIsRevising] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [savedMsg, setSavedMsg] = useState("")
  const [savedSpecId, setSavedSpecId] = useState("")
  const [specDirty, setSpecDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(0)
  const [serverUpdated, setServerUpdated] = useState("")
  const [saveConflict, setSaveConflict] = useState(false)
  const [draftRestoreNotice, setDraftRestoreNotice] = useState("")
  const markSpecEdited = useCallback(() => {
    specRevisionRef.current += 1
    setSpecDirty(true)
  }, [])
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [savedList, setSavedList] = useState<SavedSpecRow[]>([])
  const [connectedTools, setConnectedTools] = useState<ConnectedToolOption[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])

  const currentDraft: AgentEditorDraft = useMemo(() => ({
    version: 1, ownerId: rhUserId, editedAt: 0,
    userInput,
    spec: specDirty ? spec : null,
    specName: specDirty ? specName : "",
    sourceMode: specDirty ? sourceMode : "create",
    templateKey: specDirty ? templateKey : "",
    editingRecordId: specDirty ? editingRecordId : "",
    serverUpdated: specDirty ? serverUpdated : "",
  }), [rhUserId,userInput,spec,specDirty,specName,sourceMode,templateKey,
    editingRecordId,serverUpdated])
  const draftRef = useRef<AgentEditorDraft>(currentDraft)
  useEffect(() => {
    draftRef.current = currentDraft
  }, [currentDraft])
  const activeDraft = Boolean(specDirty && spec) || Boolean(userInput.trim())
  useEffect(() => {
    if (!draftDecisionMade) return
    const timeout = window.setTimeout(() => {
      if (activeDraft) {
        setDraftPersistError(!saveAgentDraft(rhUserId, draftRef.current))
      } else {
        clearAgentDraft(rhUserId)
        setDraftPersistError(false)
      }
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [rhUserId, draftDecisionMade, activeDraft, spec, userInput, specName,
    sourceMode, templateKey, editingRecordId, serverUpdated])
  useEffect(() => {
    if (!draftDecisionMade) return
    const saveBeforeExit = () => {
      if (Boolean(draftRef.current.spec) || draftRef.current.userInput.trim())
        void saveAgentDraft(rhUserId, draftRef.current)
      else clearAgentDraft(rhUserId)
    }
    window.addEventListener("pagehide", saveBeforeExit)
    return () => {
      window.removeEventListener("pagehide", saveBeforeExit)
      saveBeforeExit()
    }
  }, [draftDecisionMade, rhUserId])
  useEffect(() => {
    if (!(specDirty && spec) && !userInput.trim()) return
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warnUnsaved)
    return () => window.removeEventListener("beforeunload", warnUnsaved)
  }, [specDirty, spec, userInput])

  useEffect(() => registerUnsavedWorkCheck(
    () => Boolean(specDirty && spec) ||
      Boolean(userInput.trim()) ||
      Boolean(pendingDraft),
  ), [specDirty, spec, userInput, pendingDraft])

  const restoreDraft = useCallback(() => {
    const draft = pendingDraft
    if (!draft) return
    returnSpecRef.current=""
    setUserInput(draft.userInput)

    setSpec(draft.spec)
    setSpecName(draft.specName)
    setSourceMode(draft.sourceMode)
    setTemplateKey(draft.templateKey)
    setEditingRecordId(draft.editingRecordId)
    setServerUpdated(draft.serverUpdated)
    setSavedSpecId(draft.editingRecordId)
    setLastSavedAt(Date.parse(draft.serverUpdated) || 0)
    if (draft.spec) markSpecEdited()
    setDraftRestoreNotice("已恢复当前浏览器的未提交草稿，请核对后保存到服务器。")
    setSaveConflict(false)
    setPendingDraft(null)
    setDraftDecisionMade(true)
  }, [pendingDraft, markSpecEdited])

  const discardDraft = useCallback(() => {
    clearAgentDraft(rhUserId)
    setPendingDraft(null)
    setDraftDecisionMade(true)
    setDraftPersistError(false)
  }, [rhUserId])

  // 登录态下拉取已启用的外部工具连接；失败静默降级为空列表，不阻塞页面
  const loadConnectedTools = useCallback(async () => {
    try {
      const res = await fetch(`${getPocketBaseUrl()}/api/tool-connections`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (!res.ok) return
      const data = await res.json()
      const items = Array.isArray(data?.items)
        ? (data.items as { name: string; description: string; enabled: boolean }[])
        : []
      setConnectedTools(
        items
          .filter((item) => item.enabled && item.name)
          .map((item) => ({ name: item.name, description: item.description || "" })),
      )
    } catch {
      // 工具连接列表加载失败不阻塞方案编辑
    }
  }, [])

  useEffect(() => {
    if (!rhUserId) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadConnectedTools()
    })
    return () => { cancelled = true }
  }, [rhUserId, loadConnectedTools])

  useEffect(() => {
    if (rhUserId) void getKnowledgeBases().then(setKnowledgeBases).catch(() => setKnowledgeBases([]))
  }, [rhUserId])

  const loadSavedList = useCallback(async (uid: string) => {
    if (!uid) return
    try {
      const res = await fetch(
        `${getPocketBaseUrl()}/api/agent_specs?rh_user_id=${encodeURIComponent(uid)}`,
        { headers: { ...vibexAuthHeaders() } },
      )
      if (!res.ok) return
      const data = await res.json()
      const items = Array.isArray(data?.items) ? (data.items as SavedSpecRow[]) : []
      setSavedList(items)
      const targetId=returnSpecRef.current
      const record=targetId && items.find(item=>item.id===targetId)
      if(record){
        returnSpecRef.current=""
        setSpec(record.spec)
        setSpecName(record.name||"未命名助手")
        setSourceMode(record.source==="template"?"template":"create")
        setTemplateKey(record.template_key||"")
        setEditingRecordId(record.id)
        setSavedSpecId(record.id)
        setSpecDirty(false)
        setLastSavedAt(Date.parse(record.updated)||0)
        setServerUpdated(record.updated || "")
        setSaveConflict(false)
      }
    } catch {
      // 列表加载失败不阻塞主流程，保存成功后会再次尝试刷新
    }
  }, [])

  useEffect(() => {
    if (!rhUserId) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadSavedList(rhUserId)
    })
    return () => { cancelled = true }
  }, [rhUserId, loadSavedList])

  const runGenerate = useCallback(async () => {
    const requirement = userInput.trim()
    if (!requirement) return
    setIsGenerating(true)
    setErrorMsg("")
    setSavedMsg("")
    const messages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `我的需求：${requirement}` },
    ]
    const result = await callLlmWithFallback(MODEL_SHORT, { messages, page: "home", max_tokens: 4096 })
    setIsGenerating(false)
    if (result.needsLogin) {
      setNeedsRhLogin(true)
      setErrorMsg(LLM_ERROR_TEXT.rh_login_required)
      return
    }
    if (!result.ok || result.status !== "success") {
      const rawCode = result.error || ""
      setErrorMsg(LLM_ERROR_TEXT[rawCode] || rawCode || "生成失败，请重试")
      return
    }
    const parsed = parseSpecJson(result.text || "")
    if (!parsed) {
      setErrorMsg("方案格式异常，请换个说法再试一次")
      return
    }
    setSpec(parsed.spec)
    setSpecName(parsed.displayName)
    // Do not leave a consumed requirement as a permanent second unsaved draft.
    // If the employee typed another requirement during generation, preserve it.
    setUserInput(current => current.trim() === requirement ? "" : current)
    markSpecEdited()
    setSavedSpecId("")
    setLastSavedAt(0)
    setServerUpdated("")
    setSaveConflict(false)
    setSourceMode("create")
    setTemplateKey("")
    setEditingRecordId("")
    scrollToSpecEditor()
  }, [userInput, markSpecEdited])

  const handleCreate = useCallback(() => {
    if (!userInput.trim() || isGenerating) return
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    void runGenerate()
  }, [userInput, isGenerating, rhUserId, runGenerate])

  const runRevise = useCallback(async () => {
    const instruction = reviseInput.trim()
    if (!instruction || !spec) return
    setIsRevising(true)
    setErrorMsg("")
    setSavedMsg("")
    const messages: LlmMessage[] = [
      { role: "system", content: REVISE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `现有方案 JSON：\n${JSON.stringify({ name: specName, ...spec })}\n\n修改要求：${instruction}`,
      },
    ]
    const result = await callLlmWithFallback(MODEL_SHORT, { messages, page: "home", max_tokens: 4096 })
    setIsRevising(false)
    if (result.needsLogin) {
      setNeedsRhLogin(true)
      setErrorMsg(LLM_ERROR_TEXT.rh_login_required)
      return
    }
    if (!result.ok || result.status !== "success") {
      const rawCode = result.error || ""
      setErrorMsg(LLM_ERROR_TEXT[rawCode] || rawCode || "修改失败，请重试")
      return
    }
    const parsed = parseSpecJson(result.text || "")
    if (!parsed) {
      setErrorMsg("修订结果格式异常，请换个说法再试一次")
      return
    }
    setSpec((previous) => ({ ...parsed.spec, knowledge_base_ids: previous?.knowledge_base_ids || [], require_approval: previous?.require_approval, quality_checks: previous?.quality_checks || [] }))
    setSpecName(parsed.displayName || specName)
    markSpecEdited()
    setReviseInput("")
  }, [reviseInput, spec, specName, markSpecEdited])

  const handleRevise = useCallback(() => {
    if (!reviseInput.trim() || !spec || isRevising) return
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    void runRevise()
  }, [reviseInput, spec, isRevising, rhUserId, runRevise])

  const saveCurrentSpec = useCallback(async (asCopy: boolean) => {
    if (!spec || isSaving) return
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    const target = asCopy ? "" : editingRecordId
    // A restored draft may have no valid record version; never do an unsafe
    // overwrite when we cannot prove what server revision was edited.
    if (target && !serverUpdated) {
      setSaveConflict(true)
      setErrorMsg("当前草稿无法核验原版本，请另存为新 Agent，避免覆盖其他人的修改。")
      return
    }
    setIsSaving(true)
    setErrorMsg("")
    setSavedMsg("")
    const startedRevision=specRevisionRef.current
    try {
      const url = target
        ? `${getPocketBaseUrl()}/api/agent_specs/${encodeURIComponent(target)}`
        : `${getPocketBaseUrl()}/api/agent_specs`
      const res = await fetch(url, {
        method: target ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({
          rh_user_id: rhUserId,
          name: asCopy ? (specName.trim() || "未命名助手") + "（副本）" : (specName.trim() || "未命名助手"),
          spec,
          source: sourceMode,
          template_key: templateKey,
          ...(target ? { expected_updated: serverUpdated } : {}),
        }),
      })
      if (res.status === 409) {
        setSaveConflict(true)
        setErrorMsg("该 Agent 已在其他页面或协作流程中更新。你的修改仍保留，请「另存为新 Agent」，避免覆盖更新后的版本。")
        return
      }
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setErrorMsg("员工登录已过期，草稿仍在当前浏览器中；重新登录后再保存。")
        return
      }
      if (!res.ok) {
        setErrorMsg("保存失败，请确认网络和员工权限后重试。改动仍保留在当前页面。")
        return
      }
      const row = await res.json() as SavedSpecRow
      if (!row?.id) {
        setErrorMsg("服务器未返回保存记录，无法确认是否保存成功，请先检查「我的 Agent」列表。")
        return
      }
      setEditingRecordId(row.id)
      setSavedSpecId(row.id)
      setServerUpdated(row.updated || "")
      setSaveConflict(false)
      setLastSavedAt(Date.parse(row.updated) || Date.now())
      const noFurtherEdits = startedRevision === specRevisionRef.current
      setSpecDirty(!noFurtherEdits)
      if (asCopy && noFurtherEdits) setSpecName(row.name)
      setSavedMsg(noFurtherEdits
        ? asCopy ? "已另存为独立 Agent，原版本未被覆盖。" :
          "已保存进「我的 Agent」，接下来可以连接资源并试跑。"
        : "保存期间又进行了修改，新的改动仍未保存，请再次保存。")
      if (noFurtherEdits && !draftRef.current.userInput.trim()) clearAgentDraft(rhUserId)
      await loadSavedList(rhUserId)
    } catch {
      setErrorMsg("网络异常：当前改动仍保留，恢复网络后可重新保存。")
    } finally {
      setIsSaving(false)
    }
  }, [spec,isSaving,rhUserId,editingRecordId,serverUpdated,specName,sourceMode,templateKey,loadSavedList])

  const handleSave = useCallback(async () => saveCurrentSpec(false), [saveCurrentSpec])
  const handleSaveAsCopy = useCallback(async () => saveCurrentSpec(true), [saveCurrentSpec])
  const handleLoadTemplate = useCallback((preset: TemplatePreset) => {
    if ((specDirty || userInput.trim()) && !window.confirm(
      "当前存在未保存的 Agent 方案或新需求。切换模板将舍弃这些内容，是否继续？"
    )) return
    setUserInput("")
    setSpec(preset.spec)
    setSpecName(preset.defaultName)
    markSpecEdited()
    setSavedSpecId("")
    setLastSavedAt(0)
    setServerUpdated("")
    setSaveConflict(false)
    setSourceMode("template")
    setTemplateKey(preset.key)
    setEditingRecordId("")
    setErrorMsg("")
    setSavedMsg("")
    scrollToSpecEditor()
  }, [markSpecEdited,specDirty,userInput])

  const handleOpenSaved = useCallback((row: SavedSpecRow) => {
    if ((specDirty || userInput.trim()) && !window.confirm(
      "当前存在未保存的 Agent 方案或新需求。打开其他 Agent 将舍弃这些内容，是否继续？"
    )) return
    setUserInput("")
    setSpec(row.spec)
    setSpecName(row.name || "未命名助手")
    setSourceMode(row.source === "template" ? "template" : "create")
    setTemplateKey(row.template_key || "")
    setEditingRecordId(row.id)
    setErrorMsg("")
    setSavedSpecId(row.id)
    setLastSavedAt(Date.parse(row.updated)||0)
    setServerUpdated(row.updated || "")
    setSaveConflict(false)
    setSpecDirty(false)

    setSavedMsg("")
    scrollToSpecEditor()
  }, [specDirty,userInput])

  const handleDeleteSaved = useCallback(
    async (recordId: string) => {
      if (!recordId) return
      try {
        const res = await fetch(`${getPocketBaseUrl()}/api/agent_specs/${encodeURIComponent(recordId)}`, {
          method: "DELETE",
          headers: { ...vibexAuthHeaders() },
        })
        if (!res.ok) {
          setErrorMsg(res.status === 401 || res.status === 412
            ? "员工登录已过期，当前 Agent 未被删除。请重新登录。"
            : "删除失败，Agent 仍保留在服务器，请稍后重试。")
          return
        }
        if (editingRecordId === recordId) {
          // Preserve the editor as an UNSAVED copy. Do not keep showing a
          // deleted Agent as saved or allow PATCH against its old record ID.
          setEditingRecordId("")
          setSavedSpecId("")
          setServerUpdated("")
          setLastSavedAt(0)
          setSaveConflict(false)
          markSpecEdited()
          setSavedMsg("已从服务器删除该 Agent；当前编辑器内容仍保留，可另存为新 Agent。")
        }
        await loadSavedList(rhUserId)
      } catch {
        setErrorMsg("网络异常，无法确认是否删除成功。请刷新列表后核对。")
      }
    },
    [editingRecordId, loadSavedList, rhUserId, markSpecEdited],
  )

  const handleClearSpec = useCallback(() => {
    if ((specDirty || userInput.trim()) && !window.confirm(
      "当前编辑的 Agent 或新需求尚未保存，确定清空吗？"
    )) return
    clearAgentDraft(rhUserId)
    setSpec(null)
    setSpecName("")
    setSpecDirty(false)
    setSavedSpecId("")
    setLastSavedAt(0)
    setServerUpdated("")
    setSaveConflict(false)
    setSourceMode("create")
    setTemplateKey("")
    setEditingRecordId("")
    setReviseInput("")
    setUserInput("")
    setDraftRestoreNotice("")
    setSavedMsg("")
    setErrorMsg("")
  }, [specDirty,userInput,rhUserId])

  const updateSpecText = useCallback((field: "goal" | "task_scope", value: string) => {
    markSpecEdited()
    setSpec((prev) => (prev ? { ...prev, [field]: value } : prev))
  }, [markSpecEdited])

  const updateSpecListItem = useCallback((field: ListField, index: number, value: string) => {
    markSpecEdited()
    setSpec((prev) => {
      if (!prev) return prev
      const next = [...prev[field]]
      next[index] = value
      return { ...prev, [field]: next }
    })
  }, [markSpecEdited])

  const addSpecListItem = useCallback((field: ListField) => {
    markSpecEdited()
    setSpec((prev) => (prev ? { ...prev, [field]: [...prev[field], ""] } : prev))
  }, [markSpecEdited])

  const removeSpecListItem = useCallback((field: ListField, index: number) => {
    markSpecEdited()
    setSpec((prev) => {
      if (!prev) return prev
      return { ...prev, [field]: prev[field].filter((_, i) => i !== index) }
    })
  }, [markSpecEdited])

  const dismissError = useCallback(() => setErrorMsg(""), [])

  const toolStatusOf = useCallback(
    (toolName: string) => toolConnectionStatus(toolName, connectedTools),
    [connectedTools],
  )

  // 勾选/取消勾选工具 → 写进 spec.tools（内置 id 或已连接工具名精确匹配）
  const handleToggleSpecTool = useCallback((toolName: string, checked: boolean) => {
    markSpecEdited()
    setSpec((prev) => {
      if (!prev) return prev
      const trimmed = toolName.trim()
      if (!trimmed) return prev
      const exists = prev.tools.some((item) => item.trim() === trimmed)
      if (checked && !exists) return { ...prev, tools: [...prev.tools, trimmed] }
      if (!checked && exists) {
        return { ...prev, tools: prev.tools.filter((item) => item.trim() !== trimmed) }
      }
      return prev
    })
  }, [markSpecEdited])

  const toggleKnowledgeBase = useCallback((id: string, checked: boolean) => {
    markSpecEdited()
    setSpec(prev => {
      if (!prev) return prev
      const current = prev.knowledge_base_ids || []
      const ids = checked ? [...new Set([...current, id])].slice(0, 10) : current.filter(item => item !== id)
      const tools = checked && !prev.tools.includes("knowledge_search") ? [...prev.tools, "knowledge_search"] : prev.tools
      return { ...prev, knowledge_base_ids: ids, tools }
    })
  }, [markSpecEdited])

  return {
    templates: TEMPLATE_PRESETS,
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    userInput,
    setUserInput,
    handleCreate,
    isGenerating,
    spec,
    specName,
    setSpecName: (value:string) => {
      setSpecName(value)
      markSpecEdited()
    },
    sourceMode,
    updateSpecText,
    updateSpecListItem,
    addSpecListItem,
    removeSpecListItem,
    toolStatusOf,
    connectedTools,
    builtinToolOptions: BUILTIN_TOOL_OPTIONS,
    knowledgeBases,
    toggleKnowledgeBase,
    handleToggleSpecTool,
    reviseInput,
    setReviseInput,
    handleRevise,
    isRevising,
    handleSave,
    isSaving,
    savedMsg,
    savedSpecId,
    errorMsg,
    specDirty,
    lastSavedAt,

    dismissError,    pendingDraft,
    restoreDraft,
    discardDraft,
    draftPersistError,
    draftRestoreNotice,
    saveConflict,
    handleSaveAsCopy,


    handleLoadTemplate,
    handleClearSpec,
    savedList,
    handleOpenSaved,
    handleDeleteSaved,
  }
}
