import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { callLlmWithFallback, type LlmMessage } from "@/lib/llm"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders,verifyStudioSession,getStudioAccountInfo } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
import {
  clearAgentDraft as clearStoredAgentDraft, readAgentDraft as readStoredAgentDraft, saveAgentDraft as saveStoredAgentDraft, type AgentEditorDraft,
} from "@/lib/agentEditorDraft"
import { registerUnsavedWorkCheck } from "@/lib/unsavedNavigation"
import { useSearchParams } from "react-router-dom"
import { getKnowledgeBases, type KnowledgeBase } from "@/lib/knowledgeBases"
import type { VerifiedMarketTool } from "@/lib/marketToolSelection"
import { fetchCurrentAgentConnectionSnapshot } from "@/lib/currentAgentConnectionSnapshot"
import { resolveAgentToolRequirements, chooseVerifiedAgentTool } from "@/lib/agentToolMatcher"
import {localApi} from '@/lib/localDevices'
import {captureRequirements,previewRequirements,type AuthoringPreview,type CapturedRequirements} from '@/lib/authoringRequirements'
import {ORIGINAL_PG_UI_ENABLED} from '@/lib/studioBackend'
import {createOriginalHomeAgentApi,OriginalHomeApiError,type OriginalHomeAgent} from '@/lib/originalHomeAgentApi'
import {originalHomeAgentForEditor,originalHomeEditorWrite,isOriginalHomeBuiltinTool,type NativeHomeEditingContext} from '@/lib/originalHomeAgentEditor'
import type {OriginalHomeBindingOptions,OriginalHomeResourceView} from '@/lib/originalHomeResources'
import {createPgNativeAgentDesignApi,PgNativeAgentDesignError} from '@/lib/pgNativeAgentDesign'
import {createPgNativePilotApi} from '@/lib/pgNativePilotApi'
import {createOriginalHomeDesignController,originalHomeDesignEditorKey,originalHomeDesignStorageKey,type OriginalHomeDesignController,type OriginalHomeDesignView} from '@/lib/originalHomeDesign'
import type {OriginalHomeDesignMetadata} from '../../../shared/original-home-design-metadata'
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

const HOME_DRAFT_BACKEND=ORIGINAL_PG_UI_ENABLED?'native_pg':'pocketbase'
const readAgentDraft=(uid:string)=>readStoredAgentDraft(uid,Date.now(),HOME_DRAFT_BACKEND)
const saveAgentDraft=(uid:string,draft:AgentEditorDraft)=>saveStoredAgentDraft(uid,draft,HOME_DRAFT_BACKEND)
const clearAgentDraft=(uid:string)=>clearStoredAgentDraft(uid,HOME_DRAFT_BACKEND)
const NATIVE_HOME_BUILTINS=ORIGINAL_PG_UI_ENABLED?new Set(BUILTIN_TOOL_OPTIONS.filter(v=>isOriginalHomeBuiltinTool(v.id)).map(v=>v.id)):undefined
const createNativeHomeApi=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?createOriginalHomeAgentApi:null
const createNativeHomeDesign=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?createOriginalHomeDesignController:null
const createNativeHomeDesignApi=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?createPgNativeAgentDesignApi:null
const createNativeHomeDesignAccount=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?createPgNativePilotApi:null
const nativeHomeDesignEditorKey=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?originalHomeDesignEditorKey:null
const nativeHomeDesignStorageKey=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?originalHomeDesignStorageKey:null

export type SavedSpecRow = {
  id: string
  rh_user_id: string
  name: string
  spec: AgentSpec
  source: string
  template_key: string
  created: string
  updated: string
  native_pg?:NativeHomeEditingContext
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
  'require_plan_review：布尔值；明确要求先由人确认草案、确认后才进入落地计划/下一阶段时为 true，否则为 false',
  "所有内容使用简体中文，贴合用户的真实需求，不空泛。",
].join("\n")

const REVISE_SYSTEM_PROMPT = [
  "你是「Agent Studio」的助手方案修订器。用户会给你一份现有方案 JSON 和一句修改要求。",
  "请在现有方案基础上做增量修订：只改与修改要求相关的部分，其余字段保持原样。",
  "只输出修订后的完整 JSON 对象（字段结构与原方案一致：name/goal/task_scope/deliverables/tools/task_plan/done_criteria/require_plan_review），",
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
        require_plan_review: obj.require_plan_review === true,
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

  const [rhUserId] = useState(() => decodeRhToken()?.sub || (ORIGINAL_PG_UI_ENABLED?'':LOCAL_ANON_UID))
  const nativeApi=useMemo(()=>createNativeHomeApi&&rhUserId?createNativeHomeApi({employeeId:rhUserId}):null,[rhUserId])
  const [nativeContext,setNativeContext]=useState<NativeHomeEditingContext|null>(null)
  const [nativeOutcomeUnknown,setNativeOutcomeUnknown]=useState(false)
  const [nativeBindings,setNativeBindings]=useState<OriginalHomeBindingOptions>({http:[],mcp:[]})
  const [nativeBuiltinSelections,setNativeBuiltinSelections]=useState<string[]>([])
  const [nativeDesign,setNativeDesign]=useState<OriginalHomeDesignMetadata|null>(null)
  const [nativeDesignView,setNativeDesignView]=useState<OriginalHomeDesignView>({busy:false,pending:false,pendingPurpose:null,preview:null,error:'',loginRequired:false,blocked:false})
  const nativeDesignOwned=useRef<OriginalHomeDesignController|null>(null)
  const nativeCurrentBindings=useRef<OriginalHomeBindingOptions>({http:[],mcp:[]})
  const nativeResourcesFlight=useRef<Promise<OriginalHomeResourceView>|null>(null),nativeKnowledgeSequence=useRef(0)
  const readNativeResources=useCallback(()=>{
    if(!nativeApi)throw new OriginalHomeApiError(503,'original_home_resources_unavailable')
    if(!nativeResourcesFlight.current){
      const task=nativeApi.resources().finally(()=>{if(nativeResourcesFlight.current===task)nativeResourcesFlight.current=null})
      nativeResourcesFlight.current=task
    }
    return nativeResourcesFlight.current
  },[nativeApi])
  const nativeWriteInFlight=useRef(false),nativeListSequence=useRef(0),nativeOpenSequence=useRef(0),nativeMounted=useRef(false),nativeEditorIntent=useRef(0)
  useEffect(()=>{nativeMounted.current=true;return()=>{nativeMounted.current=false;nativeListSequence.current++;nativeOpenSequence.current++}},[])
  // A saved draft is offered explicitly, never silently merged with a newer
  // server snapshot or with a different employee's account.
  const [pendingDraft, setPendingDraft] = useState<AgentEditorDraft | null>(() => readAgentDraft(rhUserId))
  const [draftDecisionMade, setDraftDecisionMade] = useState(() => !readAgentDraft(rhUserId))
  const draftDecisionRef=useRef(draftDecisionMade)
  useEffect(()=>{draftDecisionRef.current=draftDecisionMade},[draftDecisionMade])
  const [draftPersistError, setDraftPersistError] = useState(false)
  const [userInput, setUserInputState] = useState("")
  const setUserInput=useCallback((value:string|((previous:string)=>string))=>{
    // A newer requirement invalidates pending reads, without changing the
    // save target or preventing an ACK for the same Agent from settling.
    if(ORIGINAL_PG_UI_ENABLED)nativeOpenSequence.current++
    setUserInputState(value)
  },[])
  const [reviseInput, setReviseInput] = useState("")
  const [spec, setSpec] = useState<AgentSpec | null>(null)
  const [specName, setSpecName] = useState("")
  const [requirementForTools, setRequirementForTools] = useState("")
  const [creationPreview,setCreationPreview]=useState<AuthoringPreview|null>(null)
  const captureKey=useRef({text:'',key:''}),reviseKey=useRef({text:'',key:''})
  const authoringPreview=creationPreview?.text===userInput?creationPreview:null
  const [toolMatchNotice, setToolMatchNotice] = useState("")
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
  const [savedTotal,setSavedTotal] = useState<number|null>(ORIGINAL_PG_UI_ENABLED?null:0)
  const [connectedTools, setConnectedTools] = useState<ConnectedToolOption[]>([])
  const [connectedMarketTools, setConnectedMarketTools] = useState<VerifiedMarketTool[]>([])
  const [connectionLoadNotice,setConnectionLoadNotice] = useState("")
  const connectionRequestRef=useRef(0)
  const connectionAbortRef=useRef<AbortController|null>(null)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [knowledgeBasesError,setKnowledgeBasesError]=useState("")
  const [knowledgeBasesLoading,setKnowledgeBasesLoading]=useState(false)

  const openNativeRecord=useCallback((value:OriginalHomeAgent)=>{
    const record=originalHomeAgentForEditor(value)
    returnSpecRef.current=''
    setSpec(record.spec);setSpecName(record.name)
    setSourceMode(record.source==='template'?'template':'create');setTemplateKey(record.template_key)
    setEditingRecordId(record.id);setSavedSpecId(record.id);setNativeContext(record.native_pg)
    setServerUpdated(record.updated);setLastSavedAt(Date.parse(record.updated));setSpecDirty(false)
    setNativeOutcomeUnknown(false);setSaveConflict(false)
    setNativeBindings({http:[],mcp:[]})
    setNativeBuiltinSelections([])
    setNativeDesign(null)
  },[])

  const currentDraft: AgentEditorDraft = useMemo(() => ({
    version: 1, ownerId: rhUserId, editedAt: 0,
    userInput,
    spec: specDirty ? spec : null,
    specName: specDirty ? specName : "",
    sourceMode: specDirty ? sourceMode : "create",
    templateKey: specDirty ? templateKey : "",
    editingRecordId: specDirty ? editingRecordId : "",
    serverUpdated: specDirty ? serverUpdated : "",
    ...(ORIGINAL_PG_UI_ENABLED?{backend:'native_pg' as const}:{}),
    ...(ORIGINAL_PG_UI_ENABLED&&specDirty&&spec&&nativeContext&&editingRecordId===nativeContext.id?{nativePg:nativeContext}:{}),
    ...(ORIGINAL_PG_UI_ENABLED&&specDirty&&spec&&nativeOutcomeUnknown?{nativeOutcomeUnknown:true as const}:{}),
    ...(ORIGINAL_PG_UI_ENABLED&&specDirty&&spec?{nativeBindings:{http:nativeBindings.http.filter(v=>spec.tools.includes(v.name)),mcp:nativeBindings.mcp.filter(v=>spec.tools.includes(v.name))}}:{}),
    ...(ORIGINAL_PG_UI_ENABLED&&specDirty&&spec?{nativeBuiltinSelections:nativeBuiltinSelections.filter(v=>spec.tools.includes(v))}:{}),
    ...(ORIGINAL_PG_UI_ENABLED&&specDirty&&spec&&nativeDesign?{nativeDesign:{request_id:nativeDesign.request_id,tool_requirements:nativeDesign.tool_requirements.filter(v=>spec.tools.includes(v))}}:{}),
  }), [rhUserId,userInput,spec,specDirty,specName,sourceMode,templateKey,
    editingRecordId,serverUpdated,nativeContext,nativeOutcomeUnknown,nativeBindings,nativeBuiltinSelections,nativeDesign])
  const draftRef = useRef<AgentEditorDraft>(currentDraft)
  useEffect(() => {
    draftRef.current = currentDraft
  }, [currentDraft])
  const nativeDesignEditor=useRef({spec,specName,sourceMode,templateKey,editingRecordId,nativeContext,specDirty,nativeOutcomeUnknown,nativeBindings,nativeBuiltinSelections,nativeDesign,draftDecisionMade,key:''})
  nativeDesignEditor.current={spec,specName,sourceMode,templateKey,editingRecordId,nativeContext,specDirty,nativeOutcomeUnknown,nativeBindings,nativeBuiltinSelections,nativeDesign,draftDecisionMade,
    key:nativeHomeDesignEditorKey?nativeHomeDesignEditorKey({spec,specName,sourceMode,templateKey,editingRecordId,nativeContext,specDirty,nativeOutcomeUnknown,nativeBindings,nativeBuiltinSelections,nativeDesign,draftDecisionMade,writeInFlight:nativeWriteInFlight.current}):''}
  useEffect(()=>{
    if(!nativeApi||!rhUserId||!createNativeHomeDesign||!createNativeHomeDesignApi||!createNativeHomeDesignAccount||!nativeHomeDesignStorageKey)return
    const account=createNativeHomeDesignAccount(),key=nativeHomeDesignStorageKey(rhUserId)
    const controller=createNativeHomeDesign({employeeId:rhUserId,api:createNativeHomeDesignApi({expectedEmployee:rhUserId}),
      currentEmployee:()=>getStudioAccountInfo()?.id??null,
      verifyEmployee:async()=>{const status=await verifyStudioSession(),employee=getStudioAccountInfo();if(status!=='authenticated'||!employee?.active)throw new PgNativeAgentDesignError(status==='signed_out'?401:503,'original_home_design_identity_unavailable');return employee.id},
      capabilities:()=>account.getConfigCapabilities(),models:()=>account.listModelConnections(),
      storage:{read:()=>sessionStorage.getItem(key),write:value=>sessionStorage.setItem(key,value)},
      editorKey:()=>nativeDesignEditor.current.key,
      onChange:value=>{if(nativeDesignOwned.current!==controller)return;setNativeDesignView(value);if(value.error)setErrorMsg(value.error);if(value.loginRequired)setNeedsRhLogin(true)},
      onScopeChanged(){
        if(nativeDesignOwned.current!==controller)return
        void saveAgentDraft(rhUserId,draftRef.current)
        nativeEditorIntent.current++;nativeOpenSequence.current++;nativeListSequence.current++;specRevisionRef.current++
        connectionRequestRef.current++;connectionAbortRef.current?.abort();nativeKnowledgeSequence.current++
        setSpec(null);setSpecName('');setUserInputState('');setReviseInput('');setSavedList([]);setSavedTotal(null)
        setNativeContext(null);setNativeBindings({http:[],mcp:[]});setNativeBuiltinSelections([]);setNativeDesign(null);setNeedsRhLogin(true);setIsGenerating(false);setIsRevising(false)
        setEditingRecordId('');setSavedSpecId('');setServerUpdated('');setLastSavedAt(0);setSavedMsg('');setSpecDirty(false)
        setPendingDraft(null);setDraftDecisionMade(true);draftDecisionRef.current=true;setDraftRestoreNotice('');setCreationPreview(null)
        setRequirementForTools('');setToolMatchNotice('');setConnectionLoadNotice('');setConnectedTools([]);setConnectedMarketTools([]);setKnowledgeBases([]);setKnowledgeBasesError('');setKnowledgeBasesLoading(false)
      },
      onResult(value){
        if(!nativeMounted.current||nativeDesignOwned.current!==controller||getStudioAccountInfo()?.id!==rhUserId)return false
        const current=nativeDesignEditor.current
        if(!current.draftDecisionMade||current.key!==value.editor_key||current.nativeOutcomeUnknown||nativeWriteInFlight.current)return false
        const output=value.result,descriptions={goal:output.goal,task_scope:output.task_scope,deliverables:[...output.deliverables],task_plan:[...output.task_plan],done_criteria:[...output.done_criteria]}
        let next:AgentSpec
        if(value.purpose==='generate')next={...descriptions,tools:[...output.tools],knowledge_base_ids:[],require_approval:true,require_plan_review:true}
        else{
          if(!current.spec||!current.nativeContext||current.editingRecordId!==current.nativeContext.id||current.specDirty)return false
          const previousNames=current.spec.tools
          const actualNames=[...((current.nativeContext.spec.tools as readonly string[]|undefined)??[]),...current.nativeBindings.http.map(v=>v.name),...current.nativeBindings.mcp.map(v=>v.name),...current.nativeBuiltinSelections]
          next={...current.spec,...descriptions,tools:[...previousNames,...new Set([...actualNames,...output.tools].filter(name=>!previousNames.includes(name)))]}
        }
        if(next.tools.length>40)return false
        const designMetadata={request_id:value.request_id,tool_requirements:[...output.tools]},newAgent=value.purpose==='generate',oldInput=draftRef.current.userInput
        // Local recovery precedes marking the paid result applied. This does
        // not save an Agent or write any backend record automatically.
        const durableDraft:AgentEditorDraft={version:1,ownerId:rhUserId,editedAt:Date.now(),backend:'native_pg',
          userInput:newAgent&&oldInput.trim()===value.instruction?'':oldInput,spec:next,specName:output.name,
          sourceMode:newAgent?'create':current.sourceMode,templateKey:newAgent?'':current.templateKey,
          editingRecordId:newAgent?'':current.editingRecordId,serverUpdated:newAgent?'':draftRef.current.serverUpdated,
          ...(!newAgent&&current.nativeContext?{nativePg:current.nativeContext}:{}),
          nativeBindings:newAgent?{http:[],mcp:[]}:current.nativeBindings,nativeBuiltinSelections:newAgent?[]:current.nativeBuiltinSelections,nativeDesign:designMetadata}
        if(!saveAgentDraft(rhUserId,durableDraft)){setDraftPersistError(true);return false}
        draftRef.current=durableDraft;setDraftPersistError(false)
        nativeEditorIntent.current++;nativeOpenSequence.current++
        setSpec(next);setSpecName(output.name);setNativeDesign(designMetadata)
        setSavedMsg('');setSaveConflict(false);markSpecEdited()
        setToolMatchNotice('实际模型结果已载入未保存草稿。工具名称仅作为需求建议；请逐项选择资源并审核后保存。')
        if(value.purpose==='generate'){
          setUserInputState(text=>text.trim()===value.instruction?'':text);setRequirementForTools(value.instruction)
          setSavedSpecId('');setLastSavedAt(0);setServerUpdated('');setSourceMode('create');setTemplateKey('');setEditingRecordId('');setNativeContext(null);setNativeBindings({http:[],mcp:[]});setNativeBuiltinSelections([])
        }else setReviseInput(text=>text.trim()===value.instruction?'':text)
        scrollToSpecEditor();return true
      },
    })
    nativeDesignOwned.current=controller;setNativeDesignView(controller.getView());void controller.start()
    const check=()=>{void controller.checkScope()},visible=()=>{if(document.visibilityState==='visible')check()}
    window.addEventListener('focus',check);window.addEventListener('pageshow',check);window.addEventListener('storage',check);document.addEventListener('visibilitychange',visible)
    return()=>{window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);window.removeEventListener('storage',check);document.removeEventListener('visibilitychange',visible);if(nativeDesignOwned.current===controller)nativeDesignOwned.current=null;controller.dispose()}
  },[nativeApi,rhUserId,markSpecEdited])
  const runNativeDesignAction=useCallback(async(purpose:'generate'|'revise',action:(controller:OriginalHomeDesignController)=>Promise<void>)=>{
    const controller=nativeDesignOwned.current
    if(!controller){setErrorMsg('原首页 PG 模型请求仍在核对员工身份，请稍后重试。');return}
    const state=controller.getView()
    if(state.busy)return
    if(!state.pending&&(!draftDecisionRef.current||nativeWriteInFlight.current||nativeOutcomeUnknown)){
      setErrorMsg(!draftDecisionRef.current?'请先选择恢复或丢弃已有草稿，再预览模型请求。':'原保存结果尚未确认，请先核对服务器中的记录；当前草稿未被替换。');return
    }
    if(purpose==='generate')setIsGenerating(true);else setIsRevising(true)
    setErrorMsg('');setSavedMsg('')
    try{await action(controller)}
    catch{if(nativeMounted.current&&nativeDesignOwned.current===controller)setErrorMsg('原模型请求暂时无法核对，当前草稿保持不变。')}
    finally{if(nativeMounted.current&&nativeDesignOwned.current===controller){if(purpose==='generate')setIsGenerating(false);else setIsRevising(false)}}
  },[nativeOutcomeUnknown])
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
    sourceMode, templateKey, editingRecordId, serverUpdated,nativeContext,nativeOutcomeUnknown,nativeBindings,nativeBuiltinSelections])
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
    nativeEditorIntent.current++;nativeOpenSequence.current++;specRevisionRef.current++
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
    if(ORIGINAL_PG_UI_ENABLED){setNativeContext(draft.nativePg??null);setNativeOutcomeUnknown(draft.nativeOutcomeUnknown===true);setNativeBindings(draft.nativeBindings??{http:[],mcp:[]});setNativeBuiltinSelections(draft.nativeBuiltinSelections??[]);setNativeDesign(draft.nativeDesign??null)}
    if (draft.spec) markSpecEdited()
    setDraftRestoreNotice(draft.nativeOutcomeUnknown?"上次保存结果尚未确认。草稿已保留，请先打开服务器中的记录核对；不会自动重复发送。":"已恢复当前浏览器的未提交草稿，请核对后保存到服务器。")
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

  // Connections are transient permissions, not durable Agent assignments.
  // Invalidate "ready" immediately on refresh, preserve spec.tools unchanged,
  // and prevent older tab-focus replies from overwriting the latest lookup.
  const loadConnectedTools = useCallback(async () => {
    const requestId=++connectionRequestRef.current
    connectionAbortRef.current?.abort()
    const controller=new AbortController()
    connectionAbortRef.current=controller
    setConnectedTools([])
    setConnectedMarketTools([])
    setConnectionLoadNotice("")
    if(nativeApi){
      nativeCurrentBindings.current={http:[],mcp:[]}
      try{
        const resources=await readNativeResources()
        if(controller.signal.aborted||requestId!==connectionRequestRef.current||!nativeMounted.current)return
        nativeCurrentBindings.current=resources.bindings
        setConnectedTools(resources.connectedHttp);setConnectedMarketTools(resources.verifiedMarket)
      }catch{if(!controller.signal.aborted&&requestId===connectionRequestRef.current&&nativeMounted.current)setConnectionLoadNotice('PG 资源权限暂时无法核验，当前工具按待验证处理；保存的工具引用未被删除。')}
      return
    }
    const snapshot=await fetchCurrentAgentConnectionSnapshot(
      fetch,getPocketBaseUrl(),{...vibexAuthHeaders()},controller.signal,
    )
    if(controller.signal.aborted || requestId!==connectionRequestRef.current)return
    setConnectedTools(snapshot.connectedHttp)
    setConnectedMarketTools(snapshot.verifiedMarket)
    if(!snapshot.httpVerified || !snapshot.marketVerified){
      setConnectionLoadNotice("部分工具连接暂时无法核验，已按待验证处理。请在资源中心检查连接；保存的 Agent 工具不会被删除。")
    }
  }, [nativeApi,readNativeResources])

  useEffect(() => {
    if (!rhUserId) return
    // Plugin OAuth may complete in a second tab. Refresh on focus without
    // merging another employee's data or overwriting an unsaved Agent draft.
    const refresh = () => { void loadConnectedTools() }
    void Promise.resolve().then(refresh)
    window.addEventListener("focus", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      connectionRequestRef.current+=1
      connectionAbortRef.current?.abort()
      connectionAbortRef.current=null
    }
  }, [rhUserId, loadConnectedTools])

  const refreshKnowledgeBases=useCallback(async()=>{
    const sequence=++nativeKnowledgeSequence.current
    setKnowledgeBasesLoading(true)
    setKnowledgeBasesError("")
    try {
      if(nativeApi){
        setKnowledgeBases([])
        const resources=await readNativeResources()
        if(!nativeMounted.current||sequence!==nativeKnowledgeSequence.current)return
        setKnowledgeBases(resources.knowledgeBases)
        return
      }
      setKnowledgeBases(await getKnowledgeBases())
    } catch {
      // Avoid presenting permission/network failures as an empty personal library.
      if(!nativeApi||nativeMounted.current&&sequence===nativeKnowledgeSequence.current)setKnowledgeBasesError("知识库列表暂不可用，请刷新资源连接后继续。")
    } finally {if(!nativeApi||nativeMounted.current&&sequence===nativeKnowledgeSequence.current)setKnowledgeBasesLoading(false)}
  },[nativeApi,readNativeResources])
  useEffect(()=>{
    if(!rhUserId)return
    void refreshKnowledgeBases()
    const onFocus=()=>{if(document.visibilityState==="visible")void refreshKnowledgeBases()}
    window.addEventListener("focus",onFocus)
    return()=>window.removeEventListener("focus",onFocus)
  },[rhUserId,refreshKnowledgeBases])

  // The catalog fetches just its own server-paged 18 visible rows. The
  // workbench only needs the accurate total and a refresh signal here;
  // requesting 200 complete AgentSpecs on every open adds unnecessary payload.
  // An explicitly selected older Agent is retrieved via owner-scoped GET by ID.
  const loadSavedList = useCallback(async (uid: string) => {
    if (!uid) return
    if(nativeApi){
      const sequence=++nativeListSequence.current,editEpoch=specRevisionRef.current,openEpoch=nativeOpenSequence.current
      try{
        const data=await nativeApi.catalog({perPage:1})
        if(!nativeMounted.current||sequence!==nativeListSequence.current)return
        setSavedList(data.items.map(originalHomeAgentForEditor));setSavedTotal(data.totalItems)
        const target=returnSpecRef.current
        if(target&&draftDecisionRef.current&&editEpoch===specRevisionRef.current&&openEpoch===nativeOpenSequence.current){
          const record=data.items.find(r=>r.id===target)??await nativeApi.get(target)
          if(nativeMounted.current&&sequence===nativeListSequence.current&&editEpoch===specRevisionRef.current&&openEpoch===nativeOpenSequence.current&&target===returnSpecRef.current&&draftDecisionRef.current)openNativeRecord(record)
        }
      }catch{
        if(nativeMounted.current&&sequence===nativeListSequence.current&&editEpoch===specRevisionRef.current&&openEpoch===nativeOpenSequence.current){setSavedTotal(null);setErrorMsg('暂时无法核验 PG 中的 Agent 列表，当前草稿仍保留。请刷新后重试。')}
      }
      return
    }
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
      const targetId=returnSpecRef.current
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
  }, [nativeApi,openNativeRecord])

  useEffect(() => {
    if (!rhUserId) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadSavedList(rhUserId)
    })
    return () => { cancelled = true }
  }, [rhUserId, loadSavedList])

  const runGenerate = useCallback(async () => {
    const requirement = userInput
    if(nativeApi){await runNativeDesignAction('generate',controller=>controller.submit('generate',requirement));return}
    if (!requirement.trim()||!creationPreview||creationPreview.text!==requirement) return
    setIsGenerating(true)
    setErrorMsg("")
    setSavedMsg("")
    try{await localApi<CapturedRequirements>(`/api/authoring/requirements/${encodeURIComponent(creationPreview.requestId)}`)}catch{setErrorMsg('原始需求未确认保存，请重新预览后再生成。');setIsGenerating(false);return}
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
    const matched = resolveAgentToolRequirements(requirement, parsed.spec, connectedTools, connectedMarketTools)
    setSpec({...parsed.spec,_studio_authoring:{request_id:creationPreview.requestId}, tools:[
      ...matched.resolvedTools,
      ...matched.gaps.map(row=>row.name).filter(name=>!matched.resolvedTools.includes(name)),
    ]})
    setRequirementForTools(requirement)
    setToolMatchNotice(matched.safeAutoBindings.length
      ? `已自动匹配 ${matched.safeAutoBindings.length} 项无需新授权的工具；其余所需能力请检查下方连接建议。`
      : "已核对当前账号的工具权限；未连接的能力会引导你去插件市场完成连接。")
    setSpecName(parsed.displayName)
    // Do not leave a consumed requirement as a permanent second unsaved draft.
    // If the employee typed another requirement during generation, preserve it.
    setUserInput(current => current === requirement ? "" : current)
    markSpecEdited()
    setSavedSpecId("")
    setLastSavedAt(0)
    setServerUpdated("")
    setSaveConflict(false)
    setSourceMode("create")
    setTemplateKey("")
    setEditingRecordId("")
    scrollToSpecEditor()
  }, [userInput, creationPreview, markSpecEdited, connectedTools, connectedMarketTools,nativeApi,runNativeDesignAction])

  const prepareCreation=useCallback(async()=>{
    const text=userInput
    if(nativeApi){await runNativeDesignAction('generate',controller=>controller.prepareGenerate(text));return}
    if(!text.trim())return
    if(captureKey.current.text!==text||!captureKey.current.key)captureKey.current={text,key:crypto.randomUUID()}
    setIsGenerating(true);setErrorMsg('')
    try{const source=await captureRequirements(text,captureKey.current.key),preview=await previewRequirements(source.request_id,{goal:'',task_scope:'',tools:[],task_plan:[]});setCreationPreview({text,requestId:source.request_id,plan:preview.plan})}
    catch{setErrorMsg('需求预览未完成。请检查登录、网络及需求长度（单次最多 12000 字符），重试不会重复保存同一请求。')}
    finally{setIsGenerating(false)}
  },[userInput,nativeApi,runNativeDesignAction])

  const handleCreate = useCallback(() => {
    if ((!userInput.trim()&&!nativeDesignView.pending) || isGenerating) return
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    const preview=nativeApi?nativeDesignView.preview?.purpose==='generate'&&nativeDesignView.preview.instruction===userInput.trim():!!authoringPreview
    if(nativeDesignView.pending||preview)void runGenerate();else void prepareCreation()
  }, [userInput, isGenerating, rhUserId, runGenerate,authoringPreview,prepareCreation,nativeApi,nativeDesignView])

  const runRevise = useCallback(async () => {
    const instruction = reviseInput.trim()
    if(nativeApi){
      await runNativeDesignAction('revise',async controller=>{
        const state=controller.getView()
        if(state.pending){await controller.queryOriginal();return}
        if(!instruction||!spec)return
        if(specDirty||!nativeContext||nativeContext.id!==editingRecordId){setErrorMsg('现有 PG 修订只接受已保存且版本一致的本人方案。请先保留并保存当前修改，再重新打开该记录；不会静默保存或使用旧服务器版本。');return}
        if(state.preview?.purpose==='revise'&&state.preview.instruction===instruction)await controller.submit('revise',instruction)
        else await controller.prepareRevision({instruction,spec_id:nativeContext.id,revision:nativeContext.revision,...(nativeContext.spec.model_binding?{model_binding:nativeContext.spec.model_binding}:{})})
      });return
    }
    if (!instruction || !spec) return
    setIsRevising(true)
    setErrorMsg("")
    setSavedMsg("")
    let revisionSource=''
    const parent=spec._studio_authoring?.request_id||'',revisionKey=parent+'\n'+instruction
    if(reviseKey.current.text!==revisionKey||!reviseKey.current.key)reviseKey.current={text:revisionKey,key:crypto.randomUUID()}
    try{const source=parent?await captureRequirements(instruction,reviseKey.current.key,parent):await localApi<CapturedRequirements>('/api/authoring/requirements',{requirement:instruction,kind:'legacy_revision',idempotency_key:reviseKey.current.key});revisionSource=source.request_id}
    catch{setErrorMsg('修订要求未确认保存，未调用模型。请检查登录、来源权限或需求长度。');setIsRevising(false);return}
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
    setSpec((previous) => {
      const explicitlySelected=(previous?.tools||[]).filter(name=>
        connectedMarketTools.some(tool=>tool.id===name) || connectedTools.some(tool=>tool.name===name))
      const matched=resolveAgentToolRequirements(requirementForTools, parsed.spec,
        connectedTools,connectedMarketTools,explicitlySelected)
      return {...parsed.spec,_studio_authoring:{request_id:revisionSource},capability_requirements:previous?.capability_requirements, tools:[
        ...matched.resolvedTools,
        ...matched.gaps.map(item=>item.name).filter(name=>!matched.resolvedTools.includes(name)),
      ],knowledge_base_ids: previous?.knowledge_base_ids || [],
        require_approval: previous?.require_approval,
        require_plan_review: previous?.require_plan_review,
        quality_checks: previous?.quality_checks || []}
    })
    setSpecName(parsed.displayName || specName)
    markSpecEdited()
    setReviseInput("")
  }, [reviseInput, spec, specName, markSpecEdited, requirementForTools, connectedTools, connectedMarketTools,nativeApi,runNativeDesignAction,specDirty,nativeContext,editingRecordId])

  const handleRevise = useCallback(() => {
    if ((!reviseInput.trim()&&!nativeDesignView.pending) || !spec || isRevising) return
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    void runRevise()
  }, [reviseInput, spec, isRevising, rhUserId, runRevise,nativeDesignView.pending])

  const saveCurrentSpec = useCallback(async (asCopy: boolean) => {
    if (!spec || isSaving) return
    if(nativeApi&&(nativeWriteInFlight.current||nativeOutcomeUnknown)){
      setErrorMsg('上次保存结果尚未确认，请先从服务器列表打开记录核对；当前草稿不会重复发送。')
      return
    }
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    const target = asCopy ? "" : editingRecordId
    // A restored draft may have no valid record version; never do an unsafe
    // overwrite when we cannot prove what server revision was edited.
    if (target && (nativeApi?(!nativeContext||nativeContext.id!==target):!serverUpdated)) {
      setSaveConflict(true)
      setErrorMsg("当前草稿无法核验原版本，请另存为新 Agent，避免覆盖其他人的修改。")
      return
    }
    setIsSaving(true)
    setErrorMsg("")
    setSavedMsg("")
    const startedRevision=specRevisionRef.current
    const startedIntent=nativeEditorIntent.current
    let nativeSent=false
    try {
      let row:SavedSpecRow
      if(nativeApi){
        nativeWriteInFlight.current=true
        const name=asCopy?(specName.trim()||'未命名助手')+'（副本）':specName.trim()||'未命名助手'
        const write=originalHomeEditorWrite({name,spec,source:sourceMode,templateKey,context:nativeContext,asCopy,bindings:nativeBindings,builtinSelections:nativeBuiltinSelections,designMetadata:nativeDesign})
        if(!target&&!write.authoring)throw new OriginalHomeApiError(400,'original_home_authoring_missing')
        nativeSent=true;setNativeOutcomeUnknown(true);setSpecDirty(true)
        draftRef.current={...draftRef.current,spec,specName,sourceMode,templateKey,editingRecordId,serverUpdated,backend:'native_pg',nativePg:nativeContext??undefined,nativeBindings:{http:nativeBindings.http.filter(v=>spec.tools.includes(v.name)),mcp:nativeBindings.mcp.filter(v=>spec.tools.includes(v.name))},nativeBuiltinSelections:nativeBuiltinSelections.filter(v=>spec.tools.includes(v)),nativeOutcomeUnknown:true}
        setDraftPersistError(!saveAgentDraft(rhUserId,draftRef.current))
        const saved=target?await nativeApi.update(target,nativeContext!.revision,write):await nativeApi.create({...write,authoring:write.authoring!})
        if(!nativeMounted.current)return
        if(startedIntent!==nativeEditorIntent.current){
          setSavedMsg('先前方案已保存；当前正在编辑的其他方案未被替换。')
          await loadSavedList(rhUserId)
          return
        }
        row=originalHomeAgentForEditor(saved)
        setNativeContext(row.native_pg!);setNativeOutcomeUnknown(false)
        draftRef.current={...draftRef.current,nativePg:row.native_pg,editingRecordId:row.id,serverUpdated:row.updated,nativeOutcomeUnknown:undefined}
      }else{
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
      row = await res.json() as SavedSpecRow
      if (!row?.id) {
        setErrorMsg("服务器未返回保存记录，无法确认是否保存成功，请先检查「我的 Agent」列表。")
        return
      }
      }
      setEditingRecordId(row.id)
      setSavedSpecId(row.id)
      setServerUpdated(row.updated || "")
      setSaveConflict(false)
      setLastSavedAt(Date.parse(row.updated) || Date.now())
      const noFurtherEdits = startedRevision === specRevisionRef.current
      setSpecDirty(!noFurtherEdits)
      if(nativeApi&&noFurtherEdits){setNativeDesign(null);draftRef.current={...draftRef.current,spec:null,specName:'',editingRecordId:'',serverUpdated:'',nativePg:undefined,nativeBindings:undefined,nativeBuiltinSelections:undefined,nativeOutcomeUnknown:undefined,nativeDesign:undefined}}
      if (asCopy && noFurtherEdits) setSpecName(row.name)
      setSavedMsg(noFurtherEdits
        ? asCopy ? "已另存为独立 Agent，原版本未被覆盖。" :
          "已保存进「我的 Agent」，接下来可以连接资源并试跑。"
        : "保存期间又进行了修改，新的改动仍未保存，请再次保存。")
      if (noFurtherEdits && !draftRef.current.userInput.trim()) clearAgentDraft(rhUserId)
      await loadSavedList(rhUserId)
    } catch(error) {
      if(nativeApi){
        const knownRefusal=error instanceof OriginalHomeApiError&&error.status>=400&&error.status<500
        if(!nativeSent||knownRefusal){setNativeOutcomeUnknown(false);draftRef.current={...draftRef.current,nativeOutcomeUnknown:undefined}}
        if(error instanceof OriginalHomeApiError&&error.code==='employee_session_changed'){
          setNeedsRhLogin(true);setErrorMsg('员工登录已切换，当前账号的草稿未写入其他账号。请重新验证登录后再操作。')
        }else if(error instanceof OriginalHomeApiError&&error.status===409){
          setSaveConflict(true);setErrorMsg('该 Agent 已在其他页面或协作流程中更新。你的修改仍保留，请重新核对服务器版本或另存副本。')
        }else if(error instanceof OriginalHomeApiError&&[401,403].includes(error.status)){
          setNeedsRhLogin(true);setErrorMsg('员工登录或资源权限无法核验，当前草稿仍保留；重新登录后再操作。')
        }else if(nativeSent&&!knownRefusal){
          setErrorMsg('无法确认保存是否完成。当前草稿已保留，请先打开服务器列表核对；不会自动重复提交。')
        }else if(error instanceof OriginalHomeApiError&&error.code==='original_home_execution_contract_unavailable'){
          setErrorMsg('当前 PG 接口尚未支持此方案中的质量检查、能力或需求来源要求，未丢弃这些内容，也未发送保存。')
        }else setErrorMsg('方案未保存，请核对来源、审批、工具和知识库范围；当前内容仍保留。')
      }else setErrorMsg("网络异常：当前改动仍保留，恢复网络后可重新保存。")
    } finally {
      nativeWriteInFlight.current=false
      setIsSaving(false)
    }
  }, [spec,isSaving,rhUserId,editingRecordId,serverUpdated,specName,sourceMode,templateKey,loadSavedList,nativeApi,nativeContext,nativeOutcomeUnknown,nativeBindings,nativeBuiltinSelections,nativeDesign])

  const handleSave = useCallback(async () => saveCurrentSpec(false), [saveCurrentSpec])
  const handleSaveAsCopy = useCallback(async () => saveCurrentSpec(true), [saveCurrentSpec])
  const handleLoadTemplate = useCallback((preset: TemplatePreset) => {
    if ((specDirty || userInput.trim()) && !window.confirm(
      "当前存在未保存的 Agent 方案或新需求。切换模板将舍弃这些内容，是否继续？"
    )) return
    nativeEditorIntent.current++;nativeOpenSequence.current++
    setNativeContext(null);setNativeOutcomeUnknown(false);returnSpecRef.current=''
    setNativeBindings({http:[],mcp:[]})
    setNativeBuiltinSelections([])
    setNativeDesign(null)
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

  const handleOpenSaved = useCallback(async (row: SavedSpecRow) => {
    if ((specDirty || userInput.trim()) && !window.confirm(
      "当前存在未保存的 Agent 方案或新需求。打开其他 Agent 将舍弃这些内容，是否继续？"
    )) return
    if(nativeApi){
      const sequence=++nativeOpenSequence.current,epoch=specRevisionRef.current
      nativeEditorIntent.current++
      try{
        const record=await nativeApi.get(row.id)
        if(!nativeMounted.current||sequence!==nativeOpenSequence.current||epoch!==specRevisionRef.current)return
        setUserInput('');openNativeRecord(record);setErrorMsg('');setSavedMsg('');scrollToSpecEditor()
      }catch{if(nativeMounted.current&&sequence===nativeOpenSequence.current&&epoch===specRevisionRef.current)setErrorMsg('无法核验服务器中的 Agent，当前编辑内容未被替换。')}
      return
    }
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
  }, [specDirty,userInput,nativeApi,openNativeRecord])

  const handleDeleteSaved = useCallback(
    async (recordId: string) => {
      if (!recordId) return
      if(nativeApi){setErrorMsg('PostgreSQL 的 Agent 删除合同尚未完成，记录仍保留在服务器。');return}
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
    [editingRecordId, loadSavedList, rhUserId, markSpecEdited,nativeApi],
  )

  const handleClearSpec = useCallback(() => {
    if ((specDirty || userInput.trim()) && !window.confirm(
      "当前编辑的 Agent 或新需求尚未保存，确定清空吗？"
    )) return
    nativeEditorIntent.current++;nativeOpenSequence.current++;specRevisionRef.current++
    setNativeContext(null);setNativeOutcomeUnknown(false);returnSpecRef.current=''
    setNativeBindings({http:[],mcp:[]})
    setNativeBuiltinSelections([])
    setNativeDesign(null)
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
    (toolName: string):'ready'|'pending' => {
      if(nativeApi){
        if(isOriginalHomeBuiltinTool(toolName))return 'ready'
        const selected=[...nativeBindings.http,...nativeBindings.mcp,...(nativeContext?.spec.http_tools as {name:string;connection_id:string;connection_revision:number}[]??[]),...(nativeContext?.spec.mcp_tools as {name:string;connection_id:string;connection_revision:number;catalog_sha256:string;tool_name:string}[]??[])].find(v=>v.name===toolName)
        const actual=[...nativeCurrentBindings.current.http,...nativeCurrentBindings.current.mcp].find(v=>v.name===toolName)
        if(!selected||!actual||selected.connection_id!==actual.connection_id||selected.connection_revision!==actual.connection_revision)return 'pending'
        if('catalog_sha256'in actual&&(!('catalog_sha256'in selected)||!('tool_name'in selected)||actual.catalog_sha256!==selected.catalog_sha256||actual.tool_name!==selected.tool_name))return 'pending'
        return 'ready'
      }
      return toolConnectionStatus(toolName,[...connectedTools,...connectedMarketTools.map(tool=>({name:tool.id,description:tool.description,status:"ok"}))])
    },
    [connectedTools,connectedMarketTools,nativeApi,nativeBindings,nativeContext],
  )

  const nativeExecutionSelections=useMemo(()=>new Set<string>([
    ...((nativeContext?.spec.tools as readonly string[]|undefined)??[]),
    ...nativeBindings.http.map(v=>v.name),...nativeBindings.mcp.map(v=>v.name),...nativeBuiltinSelections,
  ]),[nativeContext,nativeBindings,nativeBuiltinSelections])
  const toolAnalysis = useMemo(() => spec
    ? resolveAgentToolRequirements(requirementForTools, spec, connectedTools, connectedMarketTools,
        (spec.tools||[]).filter(tool=>(!nativeApi||nativeExecutionSelections.has(tool))&&(connectedTools.some(conn=>conn.name===tool) ||
          connectedMarketTools.some(conn=>conn.id===tool))),NATIVE_HOME_BUILTINS)
    : null,[requirementForTools,spec,connectedTools,connectedMarketTools,nativeApi,nativeExecutionSelections])

  const rematchAgentTools = useCallback(() => {
    if(!spec)return
    const currentSelections=(spec.tools||[]).filter(tool=>(!nativeApi||nativeExecutionSelections.has(tool))&&
      (connectedTools.some(conn=>conn.name===tool) || connectedMarketTools.some(conn=>conn.id===tool)))
    const result=resolveAgentToolRequirements(requirementForTools,spec,
      connectedTools,connectedMarketTools,currentSelections,NATIVE_HOME_BUILTINS)
    const matchedTools=[...result.resolvedTools,
      ...result.gaps.map(row=>row.name).filter(name=>!result.resolvedTools.includes(name))]
    const metadataNames=nativeApi?(spec.tools||[]).filter(name=>!nativeExecutionSelections.has(name)||nativeContext?.authoring?.tool_requirements.includes(name)):[]
    const updated=nativeApi?[...metadataNames,...matchedTools.filter(name=>!metadataNames.includes(name))]:matchedTools
    const namesChanged=JSON.stringify(updated)!==JSON.stringify(spec.tools)
    let intentChanged=false
    if(nativeApi){
      const nextBuiltins=[...new Set([...nativeBuiltinSelections.filter(v=>updated.includes(v)),...result.resolvedTools.filter(isOriginalHomeBuiltinTool)])]
      const savedTools=(nativeContext?.spec.tools as readonly string[]|undefined)??[]
      const selectedNames=new Set(result.resolvedTools.filter(name=>!savedTools.includes(name)))
      const retainedHttp=nativeBindings.http.filter(v=>updated.includes(v.name)),retainedMcp=nativeBindings.mcp.filter(v=>updated.includes(v.name))
      const nextBindings={http:[...retainedHttp,...nativeCurrentBindings.current.http.filter(v=>selectedNames.has(v.name)&&!retainedHttp.some(old=>old.name===v.name))],mcp:[...retainedMcp,...nativeCurrentBindings.current.mcp.filter(v=>selectedNames.has(v.name)&&!retainedMcp.some(old=>old.name===v.name))]}
      intentChanged=JSON.stringify(nextBuiltins)!==JSON.stringify(nativeBuiltinSelections)||JSON.stringify(nextBindings)!==JSON.stringify(nativeBindings)
      if(intentChanged){setNativeBuiltinSelections(nextBuiltins);setNativeBindings(nextBindings)}
    }
    if(namesChanged||intentChanged)markSpecEdited()
    if(namesChanged)setSpec(previous=>previous?{...previous,tools:updated}:previous)
    setToolMatchNotice(result.gaps.length
      ? `已匹配 ${result.resolvedTools.length} 项工具，还有 ${result.gaps.length} 项能力需要连接或人工确认。`
      : `已匹配 ${result.resolvedTools.length} 项工具，当前方案所需能力均已核对。`)
  },[spec,requirementForTools,connectedTools,connectedMarketTools,markSpecEdited,nativeApi,nativeExecutionSelections,nativeContext,nativeBindings,nativeBuiltinSelections])

  // 勾选/取消勾选工具 → 写进 spec.tools（内置 id 或已连接工具名精确匹配）
  const handleToggleSpecTool = useCallback((toolName: string, checked: boolean) => {
    markSpecEdited()
    if(nativeApi){
      const name=toolName.trim()
      if(isOriginalHomeBuiltinTool(name))setNativeBuiltinSelections(previous=>[...previous.filter(v=>v!==name),...(checked?[name]:[])])
      setNativeBindings(previous=>({http:[...previous.http.filter(v=>v.name!==name),...(checked?nativeCurrentBindings.current.http.filter(v=>v.name===name):[])],mcp:[...previous.mcp.filter(v=>v.name!==name),...(checked?nativeCurrentBindings.current.mcp.filter(v=>v.name===name):[])]}))
    }
    setSpec((prev) => {
      if (!prev) return prev
      const trimmed = toolName.trim()
      if (!trimmed) return prev
      const tools=chooseVerifiedAgentTool(prev.tools,trimmed,checked,connectedMarketTools)
      return tools.join("\u0000")===prev.tools.join("\u0000")?prev:{...prev,tools}
    })
  }, [markSpecEdited,connectedMarketTools,nativeApi])

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
    authoringPreview,
    nativeDesignComposer:nativeApi?{preview:nativeDesignView.preview?.purpose==='generate'&&nativeDesignView.preview.instruction===userInput.trim()?nativeDesignView.preview:null,pending:nativeDesignView.pending,blocked:nativeDesignView.blocked||nativeDesignView.busy}:undefined,
    nativeRevisePending:!!nativeApi&&nativeDesignView.pending,
    nativeReviseBlocked:!!nativeApi&&(nativeDesignView.blocked||nativeDesignView.busy),
    nativeReviseActionLabel:nativeApi?nativeDesignView.pending?'查询原模型请求':nativeDesignView.preview?.purpose==='revise'&&nativeDesignView.preview.instruction===reviseInput.trim()?'按已核对要求修改':'预览修改请求':undefined,
    nativeReviseNotice:nativeApi?(nativeDesignView.preview?.purpose==='revise'&&nativeDesignView.preview.instruction===reviseInput.trim()?`已核对服务器来源版本；模型连接：${nativeDesignView.preview.model_name}，模型：${nativeDesignView.preview.model_id}，最多 ${nativeDesignView.preview.output_token_limit} 输出 token。再次点击确认修改才发起模型请求，可能产生费用。`:'请先保存并重新打开本人方案。预览不调用模型；确认修改会使用明确的本人模型并可能产生费用。'):undefined,
    spec,
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
    toolMatchNotice: connectionLoadNotice || toolMatchNotice,
    rematchAgentTools,

    connectedMarketTools,
    builtinToolOptions: BUILTIN_TOOL_OPTIONS,
    knowledgeBases,
    toggleKnowledgeBase,    knowledgeBasesError,
    knowledgeBasesLoading,
    refreshKnowledgeBases,

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
    savedTotal,
    handleOpenSaved,
    handleDeleteSaved,
  }
}
