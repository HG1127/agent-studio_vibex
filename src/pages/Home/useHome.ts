import { useCallback, useEffect, useState } from "react"
import { callLlmWithFallback, type LlmMessage } from "@/lib/llm"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
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

  const [rhUserId, setRhUserId] = useState("")
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
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [savedList, setSavedList] = useState<SavedSpecRow[]>([])
  const [connectedTools, setConnectedTools] = useState<ConnectedToolOption[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])

  useEffect(() => {
    const payload = decodeRhToken()
    setRhUserId(payload?.sub ? String(payload.sub) : LOCAL_ANON_UID)
  }, [])

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
    if (rhUserId) void loadConnectedTools()
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
    } catch {
      // 列表加载失败不阻塞主流程，保存成功后会再次尝试刷新
    }
  }, [])

  useEffect(() => {
    if (rhUserId) void loadSavedList(rhUserId)
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
    setSourceMode("create")
    setTemplateKey("")
    setEditingRecordId("")
    scrollToSpecEditor()
  }, [userInput])

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
    setSpec((previous) => ({ ...parsed.spec, knowledge_base_ids: previous?.knowledge_base_ids || [], require_approval: previous?.require_approval }))
    setSpecName(parsed.displayName || specName)
    setReviseInput("")
  }, [reviseInput, spec, specName])

  const handleRevise = useCallback(() => {
    if (!reviseInput.trim() || !spec || isRevising) return
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    void runRevise()
  }, [reviseInput, spec, isRevising, rhUserId, runRevise])

  const handleSave = useCallback(async () => {
    if (!spec || isSaving) return
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    setIsSaving(true)
    setErrorMsg("")
    setSavedMsg("")
    try {
      const url = editingRecordId
        ? `${getPocketBaseUrl()}/api/agent_specs/${encodeURIComponent(editingRecordId)}`
        : `${getPocketBaseUrl()}/api/agent_specs`
      const res = await fetch(url, {
        method: editingRecordId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({
          rh_user_id: rhUserId,
          name: specName.trim() || "未命名助手",
          spec,
          source: sourceMode,
          template_key: templateKey,
        }),
      })
      if (!res.ok) {
        setErrorMsg("保存失败，请稍后重试")
        return
      }
      const row = (await res.json()) as SavedSpecRow
      if (row?.id) {
        setEditingRecordId(row.id)
        setSavedSpecId(row.id)
      }
      setSavedMsg("已保存进「我的助手」，下一步可以为它配置工具并试跑。")
      await loadSavedList(rhUserId)
    } catch {
      setErrorMsg("网络异常，保存失败，请重试")
    } finally {
      setIsSaving(false)
    }
  }, [spec, isSaving, rhUserId, editingRecordId, specName, sourceMode, templateKey, loadSavedList])

  const handleLoadTemplate = useCallback((preset: TemplatePreset) => {
    setSpec(preset.spec)
    setSpecName(preset.defaultName)
    setSourceMode("template")
    setTemplateKey(preset.key)
    setEditingRecordId("")
    setErrorMsg("")
    setSavedMsg("")
    scrollToSpecEditor()
  }, [])

  const handleOpenSaved = useCallback((row: SavedSpecRow) => {
    setSpec(row.spec)
    setSpecName(row.name || "未命名助手")
    setSourceMode(row.source === "template" ? "template" : "create")
    setTemplateKey(row.template_key || "")
    setEditingRecordId(row.id)
    setErrorMsg("")
    setSavedMsg("")
    scrollToSpecEditor()
  }, [])

  const handleDeleteSaved = useCallback(
    async (recordId: string) => {
      if (!recordId) return
      try {
        const res = await fetch(`${getPocketBaseUrl()}/api/agent_specs/${encodeURIComponent(recordId)}`, {
          method: "DELETE",
          headers: { ...vibexAuthHeaders() },
        })
        if (res.ok && editingRecordId === recordId) {
          setEditingRecordId("")
        }
        await loadSavedList(rhUserId)
      } catch {
        setErrorMsg("删除失败，请稍后重试")
      }
    },
    [editingRecordId, loadSavedList, rhUserId],
  )

  const handleClearSpec = useCallback(() => {
    setSpec(null)
    setSpecName("")
    setSourceMode("create")
    setTemplateKey("")
    setEditingRecordId("")
    setReviseInput("")
    setSavedMsg("")
    setErrorMsg("")
  }, [])

  const updateSpecText = useCallback((field: "goal" | "task_scope", value: string) => {
    setSpec((prev) => (prev ? { ...prev, [field]: value } : prev))
  }, [])

  const updateSpecListItem = useCallback((field: ListField, index: number, value: string) => {
    setSpec((prev) => {
      if (!prev) return prev
      const next = [...prev[field]]
      next[index] = value
      return { ...prev, [field]: next }
    })
  }, [])

  const addSpecListItem = useCallback((field: ListField) => {
    setSpec((prev) => (prev ? { ...prev, [field]: [...prev[field], ""] } : prev))
  }, [])

  const removeSpecListItem = useCallback((field: ListField, index: number) => {
    setSpec((prev) => {
      if (!prev) return prev
      return { ...prev, [field]: prev[field].filter((_, i) => i !== index) }
    })
  }, [])

  const dismissError = useCallback(() => setErrorMsg(""), [])

  const toolStatusOf = useCallback(
    (toolName: string) => toolConnectionStatus(toolName, connectedTools),
    [connectedTools],
  )

  // 勾选/取消勾选工具 → 写进 spec.tools（内置 id 或已连接工具名精确匹配）
  const handleToggleSpecTool = useCallback((toolName: string, checked: boolean) => {
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
  }, [])

  const toggleKnowledgeBase = useCallback((id: string, checked: boolean) => {
    setSpec(prev => {
      if (!prev) return prev
      const current = prev.knowledge_base_ids || []
      const ids = checked ? [...new Set([...current, id])].slice(0, 10) : current.filter(item => item !== id)
      const tools = checked && !prev.tools.includes("knowledge_search") ? [...prev.tools, "knowledge_search"] : prev.tools
      return { ...prev, knowledge_base_ids: ids, tools }
    })
  }, [])

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
    setSpecName,
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
    dismissError,
    handleLoadTemplate,
    handleClearSpec,
    savedList,
    handleOpenSaved,
    handleDeleteSaved,
  }
}
