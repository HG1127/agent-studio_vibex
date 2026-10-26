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
import { getVerifiedMarketTools, type VerifiedMarketTool } from "@/lib/marketToolSelection"
import { resolveAgentToolRequirements, chooseVerifiedAgentTool, prepareGeneratedAgentPermissions } from "@/lib/agentToolMatcher"
import { toolCatalogForDesign } from "@/lib/agentCapabilityPlan"
import { preserveRoleSkillBindings } from "@/lib/agentRoles"
import { AGENT_DESIGN_SYSTEM_PROMPT, agentDesignTokenBudget, parseAgentDesignResponse } from "@/lib/agentDesignProtocol"
import { availableAgentDesignModels, chooseAgentDesignModel, type AgentDesignModelOption } from "@/lib/agentDesignModelSelection"
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

const LLM_ERROR_TEXT: Record<string, string> = {
  timeout: "AI 生成超时（可能服务器繁忙），请稍后重试",
  not_found: "请求未能到达 AI，请检查网络后重试",
  rh_login_required: "请先登录后再生成",
  insufficient_balance: "账户余额不足，请充值后重试",
  model_connection_required: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接",
  model_not_permitted: "所选模型已不在当前账号的授权列表中，请刷新并重新选择",
  strict_model_route_unavailable: "当前服务端不支持模型的严格授权绑定，请升级后端或切换到兼容工作台；不会自动使用备用模型。",
  custom_connection_missing: "模型连接已失效或当前账号无权访问，请刷新模型列表",
}

const SYSTEM_PROMPT = AGENT_DESIGN_SYSTEM_PROMPT

const REVISE_SYSTEM_PROMPT = [
  "你是「Agent Studio」的助手方案修订器。用户会给你一份现有方案 JSON 和一句修改要求。",
  "请在现有方案基础上做增量修订：只改与修改要求相关的部分，其余字段保持原样。",
  "只输出修订后的完整 JSON 对象。保留 roles 与 capability_requirements；要求修改分工时可编辑角色的职责、任务和依赖，工具权限只能保留原授权范围，新增角色 tools 留空。角色已绑定的 skill_refs 只能由员工手动在角色编辑器修改，AI 不得新增、替换或清除，新增角色 skill_refs 留空。不得擅自扩大已有工具、知识库或审批权限。",
  "不要 markdown 代码块，不要任何额外文字。所有内容使用简体中文。",
].join("\n")

function parseSpecJson(raw: string): { displayName: string; spec: AgentSpec } | null {
  return parseAgentDesignResponse(raw)
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
  const specContextRef = useRef(0)
  const [editorContextKey, setEditorContextKey] = useState(0)
  const connectedLoadSequence = useRef(0)

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
  const [requirementForTools, setRequirementForTools] = useState("")
  const [toolMatchNotice, setToolMatchNotice] = useState("")
  const [sourceMode, setSourceMode] = useState<"create" | "template">("create")
  const [templateKey, setTemplateKey] = useState("")
  const [editingRecordId, setEditingRecordId] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRevising, setIsRevising] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [revisionError, setRevisionError] = useState("")
  const [savedMsg, setSavedMsg] = useState("")
  const [savedSpecId, setSavedSpecId] = useState("")
  const [specDirty, setSpecDirty] = useState(false)
  const [revisionProposal, setRevisionProposal] = useState<{name:string;spec:AgentSpec;basis:number}|null>(null)
  const [lastSavedAt, setLastSavedAt] = useState(0)
  const [serverUpdated, setServerUpdated] = useState("")
  const [saveConflict, setSaveConflict] = useState(false)
  const [draftRestoreNotice, setDraftRestoreNotice] = useState("")
  const [lastDesignModelUsed,setLastDesignModelUsed]=useState("")
  const markSpecEdited = useCallback(() => {
    specRevisionRef.current += 1
    setSpecDirty(true)
    setRevisionProposal(null)
    setRevisionError("")
  }, [])
  const invalidateSpecContext = useCallback(() => {
    specContextRef.current += 1
    setEditorContextKey(specContextRef.current)
    specRevisionRef.current += 1
    returnSpecRef.current = ""
    setIsSaving(false)
    setIsRevising(false)
    setRevisionProposal(null)
    setRevisionError("")
    setRequirementForTools("")
    setToolMatchNotice("")
    setLastDesignModelUsed("")
  }, [])
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [savedList, setSavedList] = useState<SavedSpecRow[]>([])
  const [savedTotal,setSavedTotal] = useState(0)
  const [connectedTools, setConnectedTools] = useState<ConnectedToolOption[]>([])
  const [connectedMarketTools, setConnectedMarketTools] = useState<VerifiedMarketTool[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [knowledgeBasesError,setKnowledgeBasesError]=useState("")
  const [knowledgeBasesLoading,setKnowledgeBasesLoading]=useState(false)
  const [designModelOptions,setDesignModelOptions]=useState<AgentDesignModelOption[]>([])
  const [designModelStatus,setDesignModelStatus]=useState<"loading"|"ready"|"unavailable">("loading")
  const [designModelKey,setDesignModelKey]=useState("")
  const designModelLoadRef=useRef(0)
  const refreshDesignModels=useCallback(async()=>{
    const seq=++designModelLoadRef.current
    setDesignModelStatus("loading")
    try{
      const response=await fetch(getPocketBaseUrl()+"/api/model-connections",{
        headers:{...vibexAuthHeaders()},
      })
      if(!response.ok)throw Error("model_connections_unavailable")
      const data=await response.json() as {items?:unknown}
      if(seq!==designModelLoadRef.current)return
      setDesignModelOptions(availableAgentDesignModels(data.items))
      setDesignModelStatus("ready")
    }catch{
      if(seq!==designModelLoadRef.current)return
      setDesignModelOptions([])
      setDesignModelStatus("unavailable")
    }
  },[])
  useEffect(()=>{
    let cancelled=false
    const sequence=designModelLoadRef
    void Promise.resolve().then(()=>{if(!cancelled)void refreshDesignModels()})
    return()=>{cancelled=true;sequence.current++}
  },[refreshDesignModels])

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
    invalidateSpecContext()
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
  }, [pendingDraft, markSpecEdited, invalidateSpecContext])

  const discardDraft = useCallback(() => {
    clearAgentDraft(rhUserId)
    setPendingDraft(null)
    setDraftDecisionMade(true)
    setDraftPersistError(false)
  }, [rhUserId])

  // 按当前员工权限拉取真实启用的 HTTP 连接和验证通过的市场插件工具。
  // 任一来源失败时不伪造连接；已经保存的工具清单不会被自动删除。
  const loadConnectedTools = useCallback(async () => {
    const requestId=++connectedLoadSequence.current
    const headers={...vibexAuthHeaders()}
    const [toolRes,marketRes]=await Promise.all([
      fetch(`${getPocketBaseUrl()}/api/tool-connections`,{headers,signal:AbortSignal.timeout(12000)}).catch(()=>null),
      fetch(`${getPocketBaseUrl()}/api/market/connections`,{headers,signal:AbortSignal.timeout(12000)}).catch(()=>null),
    ])
    const [httpData,marketData]=await Promise.all([
      toolRes?.ok?toolRes.json().catch(()=>null):null,
      marketRes?.ok?marketRes.json().catch(()=>null):null,
    ])
    // Both headers and JSON bodies can finish out of order. Only the newest
    // refresh may update availability or feed a rematch of the current draft.
    if(requestId!==connectedLoadSequence.current)
      return {http:[],market:[],verified:false,stale:true}
    let http:ConnectedToolOption[]=[]
    let market:VerifiedMarketTool[]=[]
    const httpValid=Array.isArray(httpData?.items) && httpData.items.every((item:unknown)=>
      Boolean(item && typeof item==="object" && !Array.isArray(item) &&
        typeof (item as {name?:unknown}).name==="string" &&
        typeof (item as {enabled?:unknown}).enabled==="boolean"))
    const marketValid=Array.isArray(marketData?.items) && marketData.items.every((item:unknown)=>
      Boolean(item && typeof item==="object" && !Array.isArray(item) &&
        typeof (item as {id?:unknown}).id==="string" &&
        typeof (item as {enabled?:unknown}).enabled==="boolean"))
    if(httpValid){
      const items=httpData.items as {name:string;description?:string;enabled:boolean;method?:string;status?:string}[]
      http=items.filter(item=>item.enabled===true&&item.name)
        .map(item=>({name:item.name,description:typeof item.description==="string"?item.description:"",
          method:item.method,status:typeof item.status==="string"?item.status:"unknown"}))
      setConnectedTools(http)
    }else setConnectedTools(previous=>previous.map(tool=>({...tool,status:"unknown"})))
    if(marketValid){
      market=getVerifiedMarketTools(marketData.items)
      setConnectedMarketTools(market)
    }else setConnectedMarketTools([])
    const verified=httpValid&&marketValid
    if(!verified)setToolMatchNotice("部分连接状态未能刷新，已保留方案选择；恢复连接后重新匹配，暂不自动认定外部工具就绪。")
    else setToolMatchNotice(previous=>previous.startsWith("部分连接状态未能刷新")?"":previous)
    return {http,market,verified,stale:false}
  }, [])

  useEffect(() => {
    if (!rhUserId) return
    // Plugin OAuth may complete in a second tab. Refresh when the editor regains focus,
    // without throwing away an employee's unsaved Agent configuration.
    let cancelled=false
    const loadSequence = connectedLoadSequence
    const refresh = () => { if(!cancelled)void loadConnectedTools() }
    void Promise.resolve().then(refresh)
    window.addEventListener("focus", refresh)
    return () => { cancelled=true;loadSequence.current++;window.removeEventListener("focus", refresh) }
  }, [rhUserId, loadConnectedTools])

  const refreshKnowledgeBases=useCallback(async()=>{
    setKnowledgeBasesLoading(true)
    setKnowledgeBasesError("")
    try {
      setKnowledgeBases(await getKnowledgeBases())
    } catch {
      // Avoid presenting permission/network failures as an empty personal library.
      setKnowledgeBasesError("知识库列表暂不可用，请刷新资源连接后继续。")
    } finally {setKnowledgeBasesLoading(false)}
  },[])
  useEffect(()=>{
    if(!rhUserId)return
    let cancelled=false
    void Promise.resolve().then(()=>{if(!cancelled)void refreshKnowledgeBases()})
    const onFocus=()=>{if(document.visibilityState==="visible")void refreshKnowledgeBases()}
    window.addEventListener("focus",onFocus)
    return()=>{cancelled=true;window.removeEventListener("focus",onFocus)}
  },[rhUserId,refreshKnowledgeBases])

  // The catalog fetches just its own server-paged 18 visible rows. The
  // workbench only needs the accurate total and a refresh signal here;
  // requesting 200 complete AgentSpecs on every open adds unnecessary payload.
  // An explicitly selected older Agent is retrieved via owner-scoped GET by ID.
  const loadSavedList = useCallback(async (uid: string) => {
    if (!uid) return
    const requestedRevision=specRevisionRef.current
    const targetId=returnSpecRef.current
    try {
      const res = await fetch(
        `${getPocketBaseUrl()}/api/agent_specs?perPage=1&sort=-updated`,
        { headers: { ...vibexAuthHeaders() } },
      )
      if (!res.ok) return
      const data = await res.json()
      const items = Array.isArray(data?.items) ? (data.items as SavedSpecRow[]) : []
      setSavedList(items)
      setSavedTotal(Number.isFinite(Number(data?.totalItems)) ? Number(data.totalItems) : items.length)
      let record=targetId && items.find(item=>item.id===targetId)
      if(!record && targetId && /^[A-Za-z0-9]{15}$/.test(targetId)){
        // Older Agent direct links are not guaranteed to be in the first 200
        // sorted records; exact owner-scoped lookup prevents wrong editing.
        const detail=await fetch(getPocketBaseUrl()+"/api/agent_specs/"+
          encodeURIComponent(targetId),{headers:{...vibexAuthHeaders()}})
        if(detail.ok){
          const candidate=await detail.json() as SavedSpecRow
          if(candidate?.id===targetId)record=candidate
        }
      }
      if(record && targetId===returnSpecRef.current){
        if(requestedRevision!==specRevisionRef.current){returnSpecRef.current="";return}
        invalidateSpecContext()
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
  }, [invalidateSpecContext])

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
    const selectedModel=chooseAgentDesignModel(designModelOptions,designModelKey)
    if (!selectedModel || designModelStatus!=="ready") {
      setErrorMsg(designModelStatus==="loading" ? "正在核验模型连接，请完成后再生成" :
        "请选择当前账号已启用的模型连接，再生成复杂 Agent 方案。")
      return
    }
    setIsGenerating(true)
    setErrorMsg("")
    setSavedMsg("")
    const messages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({requirement, available_tools: toolCatalogForDesign(connectedTools, connectedMarketTools)}) },
    ]
    const startedRevision = specRevisionRef.current
    const result = await callLlmWithFallback(selectedModel.modelId, {
      messages, page: "home", max_tokens: agentDesignTokenBudget(requirement),
      connection_id:selectedModel.connectionId,strict_model:true,
    })
    setIsGenerating(false)
    if (startedRevision !== specRevisionRef.current) {
      setErrorMsg("生成期间当前方案发生修改，已保留你的编辑。请确认需求后重新生成。")
      return
    }
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
    if (result.model && result.model!==selectedModel.modelId) {
      setErrorMsg("服务端使用的模型与所选模型不一致，已拒绝采用这份方案。")
      return
    }
    const parsed = parseSpecJson(result.text || "")
    if (!parsed) {
      setErrorMsg("方案格式异常，请换个说法再试一次")
      return
    }
    const matched = resolveAgentToolRequirements(requirement, parsed.spec, connectedTools, connectedMarketTools)
    invalidateSpecContext()
    setSpec(prepareGeneratedAgentPermissions(parsed.spec, matched))
    setRequirementForTools(requirement)
    setToolMatchNotice(matched.safeAutoBindings.length
      ? `已自动匹配 ${matched.safeAutoBindings.length} 项无需新授权的工具；其余所需能力请检查下方连接建议。`
      : "已核对当前账号的工具权限；未连接的能力会引导你去插件市场完成连接。")
    setSpecName(parsed.displayName)
    setLastDesignModelUsed(`${selectedModel.connectionName} · ${selectedModel.modelId}`)
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
  }, [userInput, markSpecEdited, connectedTools, connectedMarketTools, invalidateSpecContext,
    designModelOptions,designModelKey,designModelStatus,setLastDesignModelUsed])

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
    const selectedModel=chooseAgentDesignModel(designModelOptions,designModelKey)
    if (!selectedModel || designModelStatus!=="ready") {
      setRevisionError("请先选择当前账号已授权的模型连接，再生成修改建议。")
      return
    }
    setIsRevising(true)
    setErrorMsg("")
    setRevisionError("")
    setSavedMsg("")
    setRevisionProposal(null)
    const startedRevision = specRevisionRef.current
    const startedContext = specContextRef.current
    const messages: LlmMessage[] = [
      { role: "system", content: REVISE_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({current:{name:specName,...spec}, modification:instruction,
          available_tools:toolCatalogForDesign(connectedTools,connectedMarketTools)}),
      },
    ]
    const result = await callLlmWithFallback(selectedModel.modelId, {
      messages,page:"home",max_tokens:4096,
      connection_id:selectedModel.connectionId,strict_model:true,
    })
    // A response for a closed or different Agent must never affect the new editor.
    if (startedContext !== specContextRef.current) return
    setIsRevising(false)
    if (startedRevision !== specRevisionRef.current) {
      setRevisionError("生成建议期间方案发生修改，旧建议未覆盖你的编辑。请重新提出调整要求。")
      return
    }
    if (result.needsLogin) {
      setNeedsRhLogin(true)
      setRevisionError(LLM_ERROR_TEXT.rh_login_required)
      return
    }
    if (!result.ok || result.status !== "success") {
      const rawCode = result.error || ""
      setRevisionError(LLM_ERROR_TEXT[rawCode] || rawCode || "修改失败，请重试")
      return
    }
    if (result.model && result.model!==selectedModel.modelId) {
      setRevisionError("服务端使用的模型与所选模型不一致，未采用这次修改建议。")
      return
    }
    const parsed = parseSpecJson(result.text || "")
    if (!parsed) {
      setRevisionError("修订结果格式异常，请换个说法再试一次")
      return
    }
    const existingRoleMap = new Map((spec.roles || []).map(role=>[role.id,role]))
    // AI may revise role descriptions, but cannot silently change reviewed Skill
    // bindings. Only the human role editor is allowed to add/remove versions.
    const proposedRoles = parsed.spec.roles && preserveRoleSkillBindings(
      parsed.spec.roles.map(role=>({...role,
        tools: existingRoleMap.get(role.id)?.tools.filter(tool=>spec.tools.includes(tool)) || [],
      })),spec.roles||[])
    setRevisionProposal({name:parsed.displayName || specName,basis:startedRevision,spec:{
      ...spec,...parsed.spec,tools:[...spec.tools],
      roles: proposedRoles ?? spec.roles,
      capability_requirements:parsed.spec.capability_requirements ?? spec.capability_requirements,
      knowledge_base_ids:spec.knowledge_base_ids,require_approval:spec.require_approval,
      require_plan_review:spec.require_plan_review,quality_checks:spec.quality_checks,
    }})
  }, [reviseInput, spec, specName, connectedTools, connectedMarketTools,
    designModelOptions,designModelKey,designModelStatus])

  const handleRevise = useCallback(() => {
    if (!reviseInput.trim() || !spec || isRevising) return
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    void runRevise()
  }, [reviseInput, spec, isRevising, rhUserId, runRevise])

  const applyRevisionProposal = useCallback(()=>{
    if(!revisionProposal)return
    if(revisionProposal.basis!==specRevisionRef.current){
      setRevisionProposal(null);setRevisionError("方案已有新修改，请重新生成调整建议。");return
    }
    setSpec(revisionProposal.spec);setSpecName(revisionProposal.name)
    markSpecEdited();setReviseInput("")
  },[revisionProposal,markSpecEdited])

  const updateFullSpec = useCallback((next:AgentSpec)=>{
    markSpecEdited();setSpec(next)
  },[markSpecEdited])

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
    const startedContext=specContextRef.current
    const isCurrentContext=()=>startedContext===specContextRef.current
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
      // Saving a snapshot may finish after another Agent was opened. It still
      // saves on the server, but must not rebind the new editor to that record.
      if(!isCurrentContext())return
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
      if(!isCurrentContext())return
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
      if(isCurrentContext())setErrorMsg("网络异常：当前改动仍保留，恢复网络后可重新保存。")
    } finally {
      if(isCurrentContext())setIsSaving(false)
    }
  }, [spec,isSaving,rhUserId,editingRecordId,serverUpdated,specName,sourceMode,templateKey,loadSavedList])

  const handleSave = useCallback(async () => saveCurrentSpec(false), [saveCurrentSpec])
  const handleSaveAsCopy = useCallback(async () => saveCurrentSpec(true), [saveCurrentSpec])
  const handleLoadTemplate = useCallback((preset: TemplatePreset) => {
    if ((specDirty || userInput.trim()) && !window.confirm(
      "当前存在未保存的 Agent 方案或新需求。切换模板将舍弃这些内容，是否继续？"
    )) return
    invalidateSpecContext()
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
  }, [markSpecEdited,specDirty,userInput,invalidateSpecContext])

  const handleOpenSaved = useCallback((row: SavedSpecRow) => {
    if ((specDirty || userInput.trim()) && !window.confirm(
      "当前存在未保存的 Agent 方案或新需求。打开其他 Agent 将舍弃这些内容，是否继续？"
    )) return
    invalidateSpecContext()
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
  }, [specDirty,userInput,invalidateSpecContext])

  const handleDeleteSaved = useCallback(
    async (recordId: string) => {
      if (!recordId) return
      const startedContext=specContextRef.current
      try {
        const res = await fetch(`${getPocketBaseUrl()}/api/agent_specs/${encodeURIComponent(recordId)}`, {
          method: "DELETE",
          headers: { ...vibexAuthHeaders() },
        })
        if (!res.ok) {
          if(startedContext===specContextRef.current)setErrorMsg(res.status === 401 || res.status === 412
            ? "员工登录已过期，当前 Agent 未被删除。请重新登录。"
            : "删除失败，Agent 仍保留在服务器，请稍后重试。")
          return
        }
        if (editingRecordId === recordId && startedContext===specContextRef.current) {
          // Preserve the editor as an UNSAVED copy. Do not keep showing a
          // deleted Agent as saved or allow PATCH against its old record ID.
          invalidateSpecContext()
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
        if(startedContext===specContextRef.current)setErrorMsg("网络异常，无法确认是否删除成功。请刷新列表后核对。")
      }
    },
    [editingRecordId, loadSavedList, rhUserId, markSpecEdited, invalidateSpecContext],
  )

  const handleClearSpec = useCallback(() => {
    if ((specDirty || userInput.trim()) && !window.confirm(
      "当前编辑的 Agent 或新需求尚未保存，确定清空吗？"
    )) return
    invalidateSpecContext()
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
  }, [specDirty,userInput,rhUserId,invalidateSpecContext])

  const togglePlanReview = useCallback((enabled: boolean) => {
    markSpecEdited()
    setSpec(previous => previous ? { ...previous, require_plan_review: enabled } : previous)
  }, [markSpecEdited])

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
    (toolName: string) => toolConnectionStatus(toolName,
      [...connectedTools,...connectedMarketTools.map(tool=>({name:tool.id,description:tool.description,status:"ok"}))]),
    [connectedTools,connectedMarketTools],
  )

  const toolAnalysis = useMemo(() => spec
    ? resolveAgentToolRequirements(requirementForTools, spec, connectedTools, connectedMarketTools,
        (spec.tools||[]).filter(tool=>connectedTools.some(conn=>conn.name===tool) ||
          connectedMarketTools.some(conn=>conn.id===tool)))
    : null,[requirementForTools,spec,connectedTools,connectedMarketTools])

  const rematchAgentTools = useCallback(async () => {
    if(!spec)return
    const basis=specRevisionRef.current
    const fresh=await loadConnectedTools()
    if(fresh.stale||!fresh.verified||basis!==specRevisionRef.current)return
    const currentSelections=(spec.tools||[]).filter(tool=>
      fresh.http.some(conn=>conn.name===tool) || fresh.market.some(conn=>conn.id===tool))
    const result=resolveAgentToolRequirements(requirementForTools,spec,
      fresh.http,fresh.market,currentSelections)
    const updated=[...result.resolvedTools,
      ...result.gaps.map(row=>row.name).filter(name=>!result.resolvedTools.includes(name))]
    if(JSON.stringify(updated)!==JSON.stringify(spec.tools)){
      markSpecEdited()
      setSpec(previous=>previous?{...previous,tools:updated}:previous)
    }
    setToolMatchNotice(result.gaps.length
      ? `已匹配 ${result.resolvedTools.length} 项工具，还有 ${result.gaps.length} 项能力需要连接或人工确认。`
      : `已刷新连接并匹配 ${result.resolvedTools.length} 项工具。请按能力清单确认角色分配与待连接项。`)
  },[spec,requirementForTools,loadConnectedTools,markSpecEdited])

  // 勾选/取消勾选工具 → 写进 spec.tools（内置 id 或已连接工具名精确匹配）
  const handleToggleSpecTool = useCallback((toolName: string, checked: boolean) => {
    markSpecEdited()
    setSpec((prev) => {
      if (!prev) return prev
      const trimmed = toolName.trim()
      if (!trimmed) return prev
      const tools=chooseVerifiedAgentTool(prev.tools,trimmed,checked,connectedMarketTools)
      return tools.join("\u0000")===prev.tools.join("\u0000")?prev:{...prev,tools}
    })
  }, [markSpecEdited,connectedMarketTools])

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
    designModelOptions,
    designModelStatus,
    designModelKey,
    setDesignModelKey,
    refreshDesignModels,
    lastDesignModelUsed,
    isGenerating,
    spec,
    editorContextKey,
    updateFullSpec,
    revisionProposal,
    applyRevisionProposal,
    discardRevisionProposal:()=>{setRevisionProposal(null);setRevisionError("")},
    specName,
    setSpecName: (value:string) => {
      setSpecName(value)
      markSpecEdited()
    },
    sourceMode,
    togglePlanReview,
    updateSpecText,
    updateSpecListItem,
    addSpecListItem,
    removeSpecListItem,
    toolStatusOf,
    connectedTools,    toolAnalysis,
    toolMatchNotice,
    rematchAgentTools,

    connectedMarketTools,
    builtinToolOptions: BUILTIN_TOOL_OPTIONS,
    knowledgeBases,
    toggleKnowledgeBase,    knowledgeBasesError,
    knowledgeBasesLoading,
    refreshKnowledgeBases,

    handleToggleSpecTool,
    reviseInput,
    setReviseInput: (value: string) => { setReviseInput(value); setRevisionError("") },
    revisionError,
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
    savedTotal,
    handleOpenSaved,
    handleDeleteSaved,
  }
}
