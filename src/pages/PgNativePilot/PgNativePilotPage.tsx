import {createPgNativeLocalDeviceApi} from '@/lib/pgNativeLocalDevice'
import PgNativeLocalDevicesPanel from './PgNativeLocalDevicesPanel'
import PgNativeOfficeWorkflowPanel,{type NativeOfficeRunRequest} from './PgNativeOfficeWorkflowPanel'
import {PgNativeEmployeeSettingsPanel} from "./PgNativeEmployeeSettingsPanel.tsx"
import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react"
import {Bot,BookOpen,BriefcaseBusiness,CheckCircle2,Database,
  KeyRound,Loader2,LogOut,Plus,RefreshCcw,ShieldCheck,Users,Workflow,
  AlertTriangle,ClipboardCheck,CalendarClock,Wrench} from "lucide-react"
import {createPgNativePilotApi,PgNativePilotError,
  type PgNativeAgent,type PgNativeWorkflow,type PgNativeKnowledge,
  type PgNativeStaff,type PgNativeEmployee,
  type PgNativeModelConnection,type PgNativeModelProvider,
  type PgNativeToolConnection} from "@/lib/pgNativePilotApi"
import PgNativeAgentCreateJourney,{type NativeJourneyDestination} from "./PgNativeAgentCreateJourney"
import PgNativeStudioNavigation from "./PgNativeStudioNavigation"
import {nativeStudioGroup,type NativeStudioScreen} from "@/lib/pgNativeStudioNavigation"
import PgConfigRecordEditor,{type PgConfigEditTarget} from "./PgConfigRecordEditor"
import PgNativeConfigDetail,{type DetailKind} from "./PgNativeConfigDetail"
import PgNativeSchedulesReadonlyPanel from "./PgNativeSchedulesReadonlyPanel"
import {createPgNativeSessionReadFence} from "@/lib/pgNativeSessionReadFence"
import PgNativeAgentModelBindingPanel from "./PgNativeAgentModelBindingPanel"
import PgNativeAgentHttpToolsPanel from "./PgNativeAgentHttpToolsPanel"
import PgNativeAgentKnowledgePanel from "./PgNativeAgentKnowledgePanel"
import PgNativeAgentMcpToolsPanel from "./PgNativeAgentMcpToolsPanel"
import PgNativeRunHistoryReadonlyPanel from "./PgNativeRunHistoryReadonlyPanel"
import PgNativeWorkflowRunHistoryReadonlyPanel from "./PgNativeWorkflowRunHistoryReadonlyPanel"
import PgNativeToolConnectionsPanel from "./PgNativeToolConnectionsPanel"
import PgNativeMcpConnectionsPanel from "./PgNativeMcpConnectionsPanel"
import PgNativeSmitheryPanel from "./PgNativeSmitheryPanel"
import PgNativeKnowledgeSharingPanel from "./PgNativeKnowledgeSharingPanel"
import PgNativeKnowledgeEmbeddingPanel,{type KnowledgeSemanticCapabilities} from "./PgNativeKnowledgeEmbeddingPanel"
import PgNativeKnowledgeQueryPanel from "./PgNativeKnowledgeQueryPanel"
import PgNativeWorkflowValidationPanel from "./PgNativeWorkflowValidationPanel"
import PgNativeAgentRunPanel from "./PgNativeAgentRunPanel"
import PgNativeAutonomousAgentPanel from "./PgNativeAutonomousAgentPanel"
import PgNativeAgentPlanReviewPanel from "./PgNativeAgentPlanReviewPanel"
import PgNativeAgentMemoryPanel from "./PgNativeAgentMemoryPanel"
import PgNativeAgentDerivedMemoryPanel from "./PgNativeAgentDerivedMemoryPanel"
import PgNativeAgentCollaborationPanel from "./PgNativeAgentCollaborationPanel"
import PgNativeAgentReleasePanel from "./PgNativeAgentReleasePanel"
import OwnOperationsPanel from "./OwnOperationsPanel"
import PgNativeAgentDesignPanel from "./PgNativeAgentDesignPanel.tsx"
import {createPgNativeAgentDesignApi} from "@/lib/pgNativeAgentDesign"
import {createPgNativeAgentPlanWorkflowApi} from "@/lib/pgNativeAgentPlanWorkflow"
import PgNativeApprovalDelegationPanel from "./PgNativeApprovalDelegationPanel.tsx"
import {createPgNativeApprovalDelegationApi} from "@/lib/pgNativeApprovalDelegations"
import PgNativeInternalSharePanel from "./PgNativeInternalSharePanel.tsx"
import {createPgNativeInternalShareApi} from "@/lib/pgNativeInternalShare"
import PgNativeTemplateMarketPanel from "./PgNativeTemplateMarketPanel.tsx"
import PgNativeTemplateMarketAgentSetup from "./PgNativeTemplateMarketAgentSetup.tsx"
import {createPgNativeTemplateMarketApi} from "@/lib/pgNativeTemplateMarket"
import CompanyOverviewPanel from "./CompanyOverviewPanel"
import {createPgNativeCompanyOverviewApi} from "@/lib/pgNativeCompanyOverview"
import {createPgNativeCompanyWorkerHeartbeatsApi} from "@/lib/pgNativeCompanyWorkerHeartbeats"
import {readOwnTaskTarget,ownTaskTargetResource,pgNativeOriginalTasksBlocked,subscribePgNativeOriginalTasks,pgNativeOriginalTaskScopeKey,type OwnTaskTarget} from "@/lib/pgNativeOwnTaskNavigation"
import type {OwnOriginalTask} from "@/lib/pgNativeOwnOperations"
const PgNativeAgentPlanWorkflowPanel=lazy(()=>import("./PgNativeAgentPlanWorkflowPanel"))
const PgNativeWorkflowWorkspace=lazy(()=>import("./PgNativeWorkflowWorkspace"))
const PgNativeWorkflowRunPanel=lazy(()=>import("./PgNativeWorkflowRunPanel"))

// The isolated Run UAT view is excluded from production builds and never
// unlocks backend task execution: the server enforces a separate approval.
const RUN_UAT_LOCAL_ONLY=import.meta.env.DEV &&
  import.meta.env.VITE_AGENT_STUDIO_PG_RUN_APPROVAL_UI_ENABLED==="true"
const RunUatPanel=RUN_UAT_LOCAL_ONLY
  ?lazy(()=>import("./PgNativeRunUatPanel")):null
// Real TXT/MD ingestion is independently approved in the Native API and
// NEVER included in the standalone production-candidate build.
const KB_INGEST_UAT_LOCAL_ONLY=import.meta.env.DEV &&
  import.meta.env.VITE_AGENT_STUDIO_PG_KB_TEXT_INGEST_UI_ENABLED==="true"
const TextIngestUatPanel=KB_INGEST_UAT_LOCAL_ONLY
  ?lazy(()=>import("./PgNativeTextIngestUatPanel")):null
const KB_AGENT_BINDING_DEV_ONLY=import.meta.env.DEV &&
  import.meta.env.VITE_AGENT_STUDIO_PG_AGENT_KB_BIND_UI_ENABLED==="true"
const AgentKnowledgeUatPanel=KB_AGENT_BINDING_DEV_ONLY
  ?lazy(()=>import("./PgNativeAgentKnowledgeUatPanel")):null
type Screen="localDevices"|"officeWorkflow"|"createAgent"|"ownOperations"|"companyOverview"|"agents"|"templates"|"internalShares"|"approvalDelegations"|"workflowDraft"|"collaboration"|"releases"|"workflows"|"knowledge"|"schedules"|"employees"|"runs"|"runAgent"|"autonomousAgent"|"workflowRuns"|"workflowNativeRuns"|"runUat"|"modelConnections"|"toolConnections"
type State="checking"|"signedout"|"signedin"|"unavailable"
const field="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
const button="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
const secondary="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
function describe(error:unknown):string {
  if(error instanceof PgNativePilotError){
    if(error.status===0)return "尚未连接 PostgreSQL 原生认证试验服务，请检查独立 API 与本地开发代理。"
    if(error.status===401)return "员工身份验证失败或会话已失效。"
    if(error.status===403)return "请求未通过权限或来源检查。"
    if(error.status===409)return error.code==="revision_conflict"
      ?"配置已被更新，请刷新后使用最新版本重试。":"该员工账号已存在，请核实。"
    if(error.status===429)return "操作过于频繁，请稍后再试。"
    return "请求未成功（"+error.code+"）。"
  }
  return "操作未成功，请联系管理员检查独立测试服务。"
}
export default function PgNativePilotPage({productionRoot=false}:{productionRoot?:boolean}){
  // PG-only build uses SAME-ORIGIN /api endpoints. Vite DEV retains
  // its own isolated /__pg_native proxy. No PocketBase tokens or storage.
  const api=useMemo(()=>createPgNativePilotApi(fetch,
    productionRoot?"":"/__pg_native"),[productionRoot])
  const companyApi=useMemo(()=>createPgNativeCompanyOverviewApi({transport:fetch,
    rootPath:productionRoot?"":"/__pg_native"}),[productionRoot])
  const companyWorkerApi=useMemo(()=>createPgNativeCompanyWorkerHeartbeatsApi({transport:fetch,
    rootPath:productionRoot?"":"/__pg_native"}),[productionRoot])
  const designApi=useMemo(()=>createPgNativeAgentDesignApi({transport:fetch,rootPath:productionRoot?"":"/__pg_native"}),[productionRoot])
  const agentPlanWorkflowApi=useMemo(()=>createPgNativeAgentPlanWorkflowApi({transport:fetch,rootPath:productionRoot?"":"/__pg_native"}),[productionRoot])
  const templateMarketApi=useMemo(()=>createPgNativeTemplateMarketApi({transport:fetch,rootPath:productionRoot?"":"/__pg_native"}),[productionRoot])
  const internalShareApi=useMemo(()=>createPgNativeInternalShareApi({transport:fetch,rootPath:productionRoot?"":"/__pg_native"}),[productionRoot])
  const localDeviceApi=useMemo(()=>createPgNativeLocalDeviceApi({transport:fetch,rootPath:productionRoot?"":"/__pg_native"}),[productionRoot])
  const approvalDelegationApi=useMemo(()=>createPgNativeApprovalDelegationApi({transport:fetch,rootPath:productionRoot?"":"/__pg_native"}),[productionRoot])
  const authenticatedApi=useRef(api)
  const apiMatches=authenticatedApi.current===api
  const [status,setStatus]=useState<State>("checking")
  const [profile,setProfile]=useState<PgNativeStaff|null>(null)
  const [section,setSection]=useState<Screen>("agents")
  const [journeyReturning,setJourneyReturning]=useState(false)
  const [journeyDesignVisible,setJourneyDesignVisible]=useState(false)
  const [journeyAdoptRequest,setJourneyAdoptRequest]=useState<{id:string;selection:number}|null>(null)
  const [journeyAgentRequest,setJourneyAgentRequest]=useState<{id:string;selection:number}|null>(null)
  const journeySequence=useRef(0)
  const [ownOperationsAvailable,setOwnOperationsAvailable]=useState(false)
  const [companyOverviewAvailable,setCompanyOverviewAvailable]=useState(false)
  const [companyWorkerHeartbeatsAvailable,setCompanyWorkerHeartbeatsAvailable]=useState(false)
  const [originalTarget,setOriginalTarget]=useState<OwnTaskTarget|null>(null)
  const [originalOpening,setOriginalOpening]=useState(false)
  const [originalBlocked,setOriginalBlocked]=useState(false)
  const [schedulesOpened,setSchedulesOpened]=useState(false)
  const originalSequence=useRef(0)
  const originalPending=useRef<{api:object;ownerId:string;selection:number}|null>(null)
  const [loading,setLoading]=useState(false)
  const [configEditEnabled,setConfigEditEnabled]=useState(false)
  const [modelProbeEnabled,setModelProbeEnabled]=useState(false)
  const [mcpDiscoveryEnabled,setMcpDiscoveryEnabled]=useState(false)
  const [mcpToolsEnabled,setMcpToolsEnabled]=useState(false)
  const [smitheryEnabled,setSmitheryEnabled]=useState(false)
  const [knowledgeSharingEnabled,setKnowledgeSharingEnabled]=useState(false)
  const [knowledgeSharingOpened,setKnowledgeSharingOpened]=useState(false)
  const [knowledgeSemantic,setKnowledgeSemantic]=useState<KnowledgeSemanticCapabilities>({settings:false,consent:false,index:false,query:false})
  const [knowledgeSemanticOpened,setKnowledgeSemanticOpened]=useState(false)
  const [knowledgeSettingsVersion,setKnowledgeSettingsVersion]=useState(0)
  const knowledgeSettingsChanged=useCallback(()=>setKnowledgeSettingsVersion(value=>value+1),[])
  useEffect(()=>{if(knowledgeSharingEnabled)setKnowledgeSharingOpened(true)},[knowledgeSharingEnabled])
  useEffect(()=>{if(knowledgeSemantic.settings)setKnowledgeSemanticOpened(true)},[knowledgeSemantic.settings])
  const [workflowValidationEnabled,setWorkflowValidationEnabled]=useState(false)
  const [workflowExecutionEnabled,setWorkflowExecutionEnabled]=useState(false)
  const [workflowV2Enabled,setWorkflowV2Enabled]=useState(false)
  const [workflowCanvasOpened,setWorkflowCanvasOpened]=useState(false)
  const [workflowOpenRequest,setWorkflowOpenRequest]=useState<{id:string;selection:number}|null>(null)
  const workflowOpenSequence=useRef(0)
  const [mcpOpened,setMcpOpened]=useState(false)
  const [agentMcpOpened,setAgentMcpOpened]=useState(false)
  const [workflowRunsOpened,setWorkflowRunsOpened]=useState(false)
  const [workflowRunTarget,setWorkflowRunTarget]=useState<{id:string;revision:number;selection:number}|null>(null)
  const [runSubmissionEnabled,setRunSubmissionEnabled]=useState(false)
  const [boundModelRunsEnabled,setBoundModelRunsEnabled]=useState(false)
  const [autonomousEnabled,setAutonomousEnabled]=useState(false)
  const [scheduleEnabled,setScheduleEnabled]=useState(false)
  const [collaborationAvailable,setCollaborationAvailable]=useState(false)
  const [releasesAvailable,setReleasesAvailable]=useState(false)
  const [releaseAcceptanceEnabled,setReleaseAcceptanceEnabled]=useState(false)
  const [autonomousTarget,setAutonomousTarget]=useState<{id:string;selection:number}|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [agents,setAgents]=useState<PgNativeAgent[]>([])
  const [workflows,setWorkflows]=useState<PgNativeWorkflow[]>([])
  const [knowledge,setKnowledge]=useState<PgNativeKnowledge[]>([])
  const [readableKnowledge,setReadableKnowledge]=useState<PgNativeKnowledge[]>([])
  const [employees,setEmployees]=useState<PgNativeEmployee[]>([])
  const [employeeGovernance,setEmployeeGovernance]=useState({available:false,enabled:false})
  const [humanInput,setHumanInput]=useState({available:false,enabled:false})
  const [agentMemory,setAgentMemory]=useState({available:false,enabled:false})
  const [derivedMemory,setDerivedMemory]=useState({available:false,enabled:false})
  const [outcomeMemory,setOutcomeMemory]=useState({available:false,enabled:false})
  const [optimization,setOptimization]=useState({available:false,enabled:false})
  const [feedback,setFeedback]=useState({available:false,enabled:false,lessons:false})
  const [agentReview,setAgentReview]=useState({available:false,enabled:false,history:false})
  const [generatedAcceptance,setGeneratedAcceptance]=useState({available:false,enabled:false})
  const [descriptivePatch,setDescriptivePatch]=useState({available:false,enabled:false})
  const [agentPlanWorkflow,setAgentPlanWorkflow]=useState({available:false,submissions:false,saves:false})
  const [agentPlanWorkflowOpened,setAgentPlanWorkflowOpened]=useState(false)
  useEffect(()=>{if(agentPlanWorkflow.available)setAgentPlanWorkflowOpened(true)},[agentPlanWorkflow.available])
  const [agentDesign,setAgentDesign]=useState({available:false,submissions:false,saves:false})
  const [agentDesignOpened,setAgentDesignOpened]=useState(false)
  useEffect(()=>{if(agentDesign.available)setAgentDesignOpened(true)},[agentDesign.available])
  const [approvalDelegation,setApprovalDelegation]=useState({available:false,writes:false})
  const [localDevices,setLocalDevices]=useState({available:false,writes:false})
  const [localDevicesOpened,setLocalDevicesOpened]=useState(false)
  useEffect(()=>{if(localDevices.available)setLocalDevicesOpened(true)},[localDevices.available])
  const [officeRequest,setOfficeRequest]=useState<NativeOfficeRunRequest|null>(null)
  const [internalShare,setInternalShare]=useState({available:false,writes:false})
  const [internalShareOpened,setInternalShareOpened]=useState(false)
  useEffect(()=>{if(internalShare.available)setInternalShareOpened(true)},[internalShare.available])
  const [templateMarket,setTemplateMarket]=useState({available:false,writes:false})
  const [templateMarketOpened,setTemplateMarketOpened]=useState(false)
  useEffect(()=>{if(templateMarket.available)setTemplateMarketOpened(true)},[templateMarket.available])
  const [templateSetup,setTemplateSetup]=useState<{api:typeof api;owner:string;session:number;sequence:number;agent:PgNativeAgent}|null>(null)
  const templateSetupSequence=useRef(0)
  const templateSetupPending=useRef<{api:typeof api;owner:string;session:number;sequence:number}|null>(null)
  const [templateSetupOpening,setTemplateSetupOpening]=useState(false)
  const [derivedMemoryOpened,setDerivedMemoryOpened]=useState(false)
  useEffect(()=>{if(derivedMemory.available)setDerivedMemoryOpened(true)},[derivedMemory.available])
  const [modelConnections,setModelConnections]=useState<PgNativeModelConnection[]>([])
  const [toolConnections,setToolConnections]=useState<PgNativeToolConnection[]>([])
  const [modelEditing,setModelEditing]=useState<PgNativeModelConnection|null>(null)
  const [modelName,setModelName]=useState("")
  const [modelProvider,setModelProvider]=useState<PgNativeModelProvider>("openai")
  const [modelBaseUrl,setModelBaseUrl]=useState("https://api.openai.com/v1")
  const [modelApiKey,setModelApiKey]=useState("")
  const [modelModels,setModelModels]=useState("")
  const [modelEnabled,setModelEnabled]=useState(true)
  const [editing,setEditing]=useState<PgConfigEditTarget|null>(null)
  const [detailTarget,setDetailTarget]=useState<{kind:DetailKind;id:string}|null>(null)
  // In-flight reads from a revoked/changed session must never repopulate UI.
  const sessionFence=useRef(createPgNativeSessionReadFence())
  const [newName,setNewName]=useState("")
  const [newGoal,setNewGoal]=useState("")
  const [newDescription,setNewDescription]=useState("")
  const [staffEmail,setStaffEmail]=useState("")
  const [staffName,setStaffName]=useState("")
  const [staffPassword,setStaffPassword]=useState("")
  const originalIdentity=useRef({api,ownerId:profile?.id??null,available:ownOperationsAvailable,status,busy})
  originalIdentity.current={api,ownerId:apiMatches?profile?.id??null:null,available:apiMatches&&ownOperationsAvailable,status:apiMatches?status:"checking",busy:busy||!apiMatches}
  useEffect(()=>{
    const update=()=>setOriginalBlocked(pgNativeOriginalTasksBlocked(api))
    const unsubscribe=subscribePgNativeOriginalTasks(api,update);update();return unsubscribe
  },[api])
  useEffect(()=>{originalSequence.current++;originalPending.current=null;setOriginalTarget(null);setOriginalOpening(false)},[api,profile?.id])
  useEffect(()=>{
    if(ownOperationsAvailable||!originalPending.current)return
    originalSequence.current++;originalPending.current=null;setOriginalTarget(null);setOriginalOpening(false)
    setError("本人概览读取暂不可用，已停止本次原任务切换；原有未决请求保持不变。")
  },[ownOperationsAvailable])
  const clearPrivateDrafts=useCallback(()=>{
    setNewName("");setNewGoal("");setNewDescription("")
    setJourneyReturning(false);setJourneyDesignVisible(false);setJourneyAdoptRequest(null);setJourneyAgentRequest(null);journeySequence.current++
    setStaffEmail("");setStaffName("");setStaffPassword("")
    setModelName("");setModelApiKey("");setModelModels("");setNotice("")
    setWorkflowCanvasOpened(false);setWorkflowRunsOpened(false);setWorkflowRunTarget(null)
    originalSequence.current++;originalPending.current=null;setOriginalTarget(null);setOriginalOpening(false)
    setOwnOperationsAvailable(false);setSchedulesOpened(false)
    setCompanyOverviewAvailable(false);setCompanyWorkerHeartbeatsAvailable(false)
    setMcpOpened(false)
    setAgentMcpOpened(false)
    setKnowledgeSharingOpened(false);setKnowledgeSharingEnabled(false)
    setCollaborationAvailable(false)
    setReleasesAvailable(false);setReleaseAcceptanceEnabled(false);setAutonomousTarget(null)
    setEmployeeGovernance({available:false,enabled:false})
    setHumanInput({available:false,enabled:false})
    setAgentMemory({available:false,enabled:false})
    setDerivedMemory({available:false,enabled:false})
    setOutcomeMemory({available:false,enabled:false})
    setOptimization({available:false,enabled:false})
    setFeedback({available:false,enabled:false,lessons:false})
    setAgentReview({available:false,enabled:false,history:false})
    setGeneratedAcceptance({available:false,enabled:false})
    setDescriptivePatch({available:false,enabled:false})
    setAgentPlanWorkflow({available:false,submissions:false,saves:false});setAgentPlanWorkflowOpened(false);setWorkflowOpenRequest(null);workflowOpenSequence.current++
    setAgentDesign({available:false,submissions:false,saves:false});setAgentDesignOpened(false)
    setTemplateMarket({available:false,writes:false});setTemplateMarketOpened(false);setTemplateSetup(null)
    setLocalDevices({available:false,writes:false});setLocalDevicesOpened(false);setOfficeRequest(null)
    setInternalShare({available:false,writes:false});setInternalShareOpened(false)
    setApprovalDelegation({available:false,writes:false})
    templateSetupSequence.current++;templateSetupPending.current=null;setTemplateSetupOpening(false)
    setDerivedMemoryOpened(false)
    setKnowledgeSemanticOpened(false);setKnowledgeSemantic({settings:false,consent:false,index:false,query:false});setKnowledgeSettingsVersion(0)
  },[])
  const expireAgentSession=useCallback(()=>{
    sessionFence.current.invalidate();setProfile(null);setStatus("signedout")
    setAutonomousEnabled(false);setScheduleEnabled(false);setRunSubmissionEnabled(false);setBoundModelRunsEnabled(false)
    setConfigEditEnabled(false);setModelProbeEnabled(false);setMcpDiscoveryEnabled(false);setMcpToolsEnabled(false);setSmitheryEnabled(false);setWorkflowValidationEnabled(false);setWorkflowExecutionEnabled(false);setWorkflowV2Enabled(false)
    setAgents([]);setWorkflows([]);setKnowledge([]);setReadableKnowledge([]);setEmployees([]);setModelConnections([]);setToolConnections([])
    setEditing(null);setModelEditing(null);setModelApiKey("");setDetailTarget(null);setLoading(false)
    clearPrivateDrafts()
    setError("员工登录已失效，请重新登录。")
  },[clearPrivateDrafts])
  const expireOriginalTaskSession=useMemo(()=>{
    const scopedApi=api,ownerId=profile?.id
    return ()=>{if(originalIdentity.current.api===scopedApi&&originalIdentity.current.ownerId===ownerId)expireAgentSession()}
  },[api,profile?.id,expireAgentSession])
  useEffect(()=>{
    if(authenticatedApi.current===api)return
    authenticatedApi.current=api
    expireAgentSession();setStatus("checking");setError("");setBusy(false)
  },[api,expireAgentSession])
  const refresh=useCallback(async()=>{
    const ticket=sessionFence.current.beginRead()
    setReadableKnowledge([])
    setConfigEditEnabled(false);setWorkflowV2Enabled(false)
    setCompanyOverviewAvailable(false);setCompanyWorkerHeartbeatsAvailable(false)
    setGeneratedAcceptance(previous=>({...previous,enabled:false}))
    setDescriptivePatch(previous=>({...previous,enabled:false}))
    setAgentPlanWorkflow(previous=>({...previous,submissions:false,saves:false}))
    setAgentDesign({available:false,submissions:false,saves:false})
    setRunSubmissionEnabled(false);setBoundModelRunsEnabled(false);setAutonomousEnabled(false);setScheduleEnabled(false)
    setLoading(true)
    try{
      const capabilities=api.getConfigCapabilities().then(value=>{
        if(originalIdentity.current.api===api&&sessionFence.current.acceptsRead(ticket)){
          setOwnOperationsAvailable(value.own_operations_available===true)
          setCompanyOverviewAvailable(value.company_overview_available===true)
          setCompanyWorkerHeartbeatsAvailable(value.company_worker_heartbeats_available===true)
        }
        return value
      }).catch(err=>{
        if(originalIdentity.current.api===api&&sessionFence.current.acceptsRead(ticket)){
          setOwnOperationsAvailable(false)
          setCompanyOverviewAvailable(false);setCompanyWorkerHeartbeatsAvailable(false)
          if(err instanceof PgNativePilotError&&err.status===401)expireAgentSession()
        }
        return null
      })
      const [a,w,k,m,t,capability]=await Promise.all([
        api.listAgents(),api.listWorkflows(),api.listKnowledge(),
        api.listModelConnections(),api.listToolConnections(),
        // The server owns the probe authorization; browser flags cannot
        // enable network access even in the standalone dev workspace.
        capabilities,
      ])
      if(!sessionFence.current.acceptsRead(ticket))return
      const shared=capability?.knowledge_sharing_enabled===true&&capability.config_writes_enabled===true?await api.listSharedKnowledge():[]
      if(!sessionFence.current.acceptsRead(ticket))return
      setReadableKnowledge([...k,...shared.filter(base=>!k.some(own=>own.id===base.id)).map(base=>({id:base.id,name:base.name+" · "+base.owner_name+"共享 · "+(base.access_role==="editor"?"可编辑":"可查看"),description:base.description,revision:base.base_revision}))])
      setAgents(a);setWorkflows(w);setKnowledge(k);setModelConnections(m)
      setToolConnections(t)
      setConfigEditEnabled(capability?.config_writes_enabled===true)
      setModelProbeEnabled(capability?.model_probe_enabled===true)
      setMcpDiscoveryEnabled(capability?.mcp_discovery_enabled===true&&capability?.config_writes_enabled===true)
      setMcpToolsEnabled(capability?.mcp_tool_runs_enabled===true&&capability?.config_writes_enabled===true)
      setSmitheryEnabled(capability?.smithery_management_enabled===true&&capability?.config_writes_enabled===true)
      setKnowledgeSharingEnabled(capability?.knowledge_sharing_enabled===true&&capability?.config_writes_enabled===true)
      const semanticSettings=capability?.config_writes_enabled===true&&capability.knowledge_sharing_enabled===true&&capability.knowledge_embedding_settings_enabled===true
      const semanticConsent=semanticSettings&&capability?.knowledge_embedding_consent_enabled===true
      setKnowledgeSemantic({settings:semanticSettings,consent:semanticConsent,index:semanticConsent&&capability?.knowledge_index_runtime_enabled===true,query:semanticConsent&&capability?.knowledge_query_runtime_enabled===true})
      setWorkflowValidationEnabled(capability?.workflow_validation_enabled===true)
      setWorkflowExecutionEnabled(capability?.workflow_execution_enabled===true)
      setWorkflowV2Enabled(capability?.config_writes_enabled===true&&capability.workflow_v2_submission_enabled===true)
      setRunSubmissionEnabled(capability?.config_writes_enabled===true&&capability.run_submission_enabled===true)
      setBoundModelRunsEnabled(capability?.bound_model_runs_enabled===true)
      setAutonomousEnabled(capability?.config_writes_enabled===true&&capability.autonomous_agent_submission_enabled===true)
      setScheduleEnabled(capability?.config_writes_enabled===true&&capability.schedule_execution_enabled===true)
      setEmployeeGovernance({available:capability?.employee_governance_available===true,enabled:capability?.employee_governance_enabled===true&&capability.config_writes_enabled===true})
      setHumanInput({available:capability?.agent_human_input_available===true,enabled:capability?.agent_human_responses_enabled===true&&capability.config_writes_enabled===true})
      setAgentMemory({available:capability?.agent_memory_available===true,enabled:capability?.agent_memory_writes_enabled===true&&capability.config_writes_enabled===true})
      setOptimization({available:capability?.agent_optimization_available===true,enabled:capability?.agent_optimization_acceptance_enabled===true&&capability.config_writes_enabled===true})
      setFeedback({available:capability?.agent_feedback_available===true,enabled:capability?.agent_feedback_submission_enabled===true&&capability.config_writes_enabled===true,lessons:capability?.agent_feedback_lesson_storage_enabled===true&&capability.config_writes_enabled===true})
      setAgentReview({available:capability?.agent_review_available===true,enabled:capability?.agent_review_available===true&&capability.agent_review_submission_enabled===true&&capability.config_writes_enabled===true,history:capability?.agent_review_available===true&&capability.agent_review_history_available===true})
      setGeneratedAcceptance({available:capability?.agent_generated_acceptance_available===true,enabled:capability?.agent_generated_acceptance_enabled===true&&capability.config_writes_enabled===true})
      setDescriptivePatch({available:capability?.agent_descriptive_patch_available===true,enabled:capability?.agent_descriptive_patch_enabled===true&&capability.config_writes_enabled===true})
      setAgentPlanWorkflow({available:capability?.agent_plan_workflow_available===true,submissions:capability?.agent_plan_workflow_submissions_enabled===true&&capability.config_writes_enabled===true,saves:capability?.agent_plan_workflow_saves_enabled===true&&capability.config_writes_enabled===true})
      setAgentDesign({available:capability?.agent_design_available===true,submissions:capability?.agent_design_submissions_enabled===true&&capability.config_writes_enabled===true,saves:capability?.agent_design_saves_enabled===true&&capability.config_writes_enabled===true})
      setTemplateMarket({available:capability?.agent_template_market_available===true,writes:capability?.agent_template_market_writes_enabled===true&&capability.config_writes_enabled===true})
      setInternalShare({available:capability?.internal_share_available===true,writes:capability?.internal_share_writes_enabled===true&&capability.config_writes_enabled===true})
      setLocalDevices({available:capability?.local_devices_available===true,writes:capability?.local_device_writes_enabled===true&&capability.config_writes_enabled===true})
      setApprovalDelegation({available:capability?.approval_delegations_available===true,writes:capability?.approval_delegations_writes_enabled===true&&capability.config_writes_enabled===true})
      setOutcomeMemory({available:capability?.agent_outcome_memory_available===true,enabled:capability?.agent_outcome_memory_admission_enabled===true&&capability.config_writes_enabled===true})
      setDerivedMemory({available:capability?.agent_derived_memory_available===true,enabled:capability?.agent_derived_memory_writes_enabled===true&&capability.config_writes_enabled===true})
      setCollaborationAvailable(capability?.agent_collaboration_available===true)
      setReleasesAvailable(capability?.agent_releases_available===true)
      setReleaseAcceptanceEnabled(capability?.config_writes_enabled===true&&capability?.agent_release_acceptance_enabled===true)
      setError("")
    }catch(err){
      if(!sessionFence.current.acceptsRead(ticket))return
      if(err instanceof PgNativePilotError&&err.status===401){
        expireAgentSession()
      }
      setError(describe(err))
    }finally{
      if(sessionFence.current.acceptsRead(ticket))setLoading(false)
    }
  },[api,productionRoot,expireAgentSession])
  const openSavedPlanWorkflow=useCallback(async(id:string)=>{
    const identity=originalIdentity.current
    if(identity.api!==api||identity.status!=="signedin"||!identity.ownerId)return
    const owner=identity.ownerId,session=sessionFence.current.session(),selection=++workflowOpenSequence.current
    const current=()=>originalIdentity.current.api===api&&originalIdentity.current.ownerId===owner&&originalIdentity.current.status==="signedin"&&sessionFence.current.acceptsSession(session)&&workflowOpenSequence.current===selection
    try{
      const row=await api.getWorkflow(id)
      if(!current())return
      if(row.id!==id)throw Error("saved_workflow_identity_mismatch")
      setWorkflows(previous=>[row,...previous.filter(item=>item.id!==id)]);setWorkflowOpenRequest({id,selection});setWorkflowCanvasOpened(true);setSection("workflows")
    }catch(cause){if(!current())return;if(cause instanceof PgNativePilotError&&cause.status===401)expireAgentSession();else setError("暂时无法打开已保存的工作流，请刷新后重试。")}
  },[api,expireAgentSession])
  const openTemplateAgentConfiguration=useCallback(async(id:string)=>{
    const identity=originalIdentity.current
    if(templateSetupPending.current||identity.api!==api||identity.status!=="signedin"||!identity.ownerId)return
    const owned={api,owner:identity.ownerId,session:sessionFence.current.session(),sequence:++templateSetupSequence.current}
    templateSetupPending.current=owned;setTemplateSetupOpening(true);setError("")
    const current=()=>templateSetupPending.current===owned&&originalIdentity.current.api===api&&originalIdentity.current.ownerId===owned.owner&&originalIdentity.current.status==="signedin"&&sessionFence.current.acceptsSession(owned.session)
    try{
      const agent=await api.getAgent(id)
      if(!current())return
      if(agent.id!==id)throw Error("template_copy_identity_mismatch")
      setTemplateSetup({...owned,agent});setAgents(previous=>[agent,...previous.filter(item=>item.id!==id)])
      setSection("agents");setAgentMcpOpened(true);setEditing(null);setDetailTarget(null)
      setNotice("已读取你的助手副本，请配置自己的模型与资源。")
    }catch(cause){
      if(!current())return
      if(cause instanceof PgNativePilotError&&cause.status===401)expireAgentSession()
      else setError("暂时无法读取你的助手副本，请刷新后重试。")
    }finally{if(templateSetupPending.current===owned){templateSetupPending.current=null;setTemplateSetupOpening(false)}}
  },[api,expireAgentSession])
  const refreshTemplateAgentConfiguration=useCallback(async()=>{
    const selected=templateSetup
    if(!selected)return
    const current=()=>originalIdentity.current.api===selected.api&&originalIdentity.current.ownerId===selected.owner&&originalIdentity.current.status==="signedin"&&sessionFence.current.acceptsSession(selected.session)
    if(!current())return
    await refresh()
    if(!current())return
    try{
      const agent=await selected.api.getAgent(selected.agent.id)
      if(!current()||agent.id!==selected.agent.id)return
      setTemplateSetup(previous=>previous?.sequence===selected.sequence?{...selected,agent}:previous)
    }catch(cause){if(current()&&cause instanceof PgNativePilotError&&cause.status===401)expireAgentSession();throw cause}
  },[templateSetup,refresh,expireAgentSession])
  const originalTargetSettled=useCallback((selection:number,opened:boolean)=>{
    const pending=originalPending.current,identity=originalIdentity.current
    if(!pending||pending.selection!==selection||identity.api!==pending.api||identity.ownerId!==pending.ownerId||identity.status!=="signedin")return
    originalPending.current=null;setOriginalOpening(false)
    if(opened)setNotice("已重新核对并打开原任务。处理操作仍需在原任务中另行确认。")
    else setError("原任务暂无法核对，或仍有未确认请求。当前没有切换任务控制权，请回原任务核对。")
  },[])
  const openOwnOriginal=useCallback(async(requested:OwnOriginalTask)=>{
    const identity=originalIdentity.current
    if(identity.api!==api||!identity.ownerId||identity.status!=="signedin"||!identity.available||identity.busy||originalPending.current||pgNativeOriginalTasksBlocked(api))throw Error("original_request_must_be_confirmed")
    const ownerId=identity.ownerId,selection=++originalSequence.current,session=sessionFence.current.session()
    const current=()=>originalIdentity.current.api===api&&originalIdentity.current.ownerId===ownerId&&originalIdentity.current.status==="signedin"&&originalPending.current?.selection===selection&&sessionFence.current.acceptsSession(session)
    originalPending.current={api,ownerId,selection};setOriginalOpening(true);setError("");setNotice("")
    try{
      const target=await readOwnTaskTarget(api,ownerId,requested,selection,current)
      if(!current())return
      if(!originalIdentity.current.available||pgNativeOriginalTasksBlocked(api))throw Error("original_request_must_be_confirmed")
      // This is the actual independently fetched resource, never an aggregate DTO.
      const resource=ownTaskTargetResource(api,target)
      if(target.kind.startsWith("agent_")||target.kind==="schedule"&&target.resourceKind==="agent"){
        const agent=resource as PgNativeAgent;setAgents(previous=>[agent,...previous.filter(item=>item.id!==agent.id)])
      }else{
        const flow=resource as PgNativeWorkflow;setWorkflows(previous=>[flow,...previous.filter(item=>item.id!==flow.id)])
      }
      setOriginalTarget(target)
      if(target.kind==="agent_single")setSection("runAgent")
      else if(target.kind==="agent_autonomous"){setAutonomousTarget(null);setSection("autonomousAgent")}
      else if(target.kind==="workflow_v2"){setWorkflowRunsOpened(true);setSection("workflowNativeRuns")}
      else if(target.kind==="workflow_safe")setSection("workflowRuns")
      else{setSchedulesOpened(true);setSection("schedules")}
    }catch(err){
      if(!current())return
      if(err instanceof PgNativePilotError&&err.status===401){expireAgentSession();return}
      originalTargetSettled(selection,false);throw Error("original_task_source_unconfirmed")
    }
  },[api,expireAgentSession,originalTargetSettled])
  useEffect(()=>{
    let active=true
    const sessionAtStart=sessionFence.current.session()
    if(productionRoot && typeof window!=="undefined" &&
       window.location.protocol!=="https:"){
      setStatus("unavailable")
      return ()=>{active=false}
    }
    void api.me().then(user=>{
      if(!active||!sessionFence.current.acceptsSession(sessionAtStart))return
      setProfile(user);setStatus("signedin")
      void refresh()
    }).catch(err=>{
      if(!active||!sessionFence.current.acceptsSession(sessionAtStart))return
      setStatus(err instanceof PgNativePilotError&&err.status===401
        ?"signedout":"unavailable")
      setError(describe(err))
    })
    return ()=>{active=false}
  },[api,refresh,productionRoot])
  useEffect(()=>{
    let active=true
    const sessionAtStart=sessionFence.current.session()
    if(status!=="signedin"||!profile?.is_admin){
      setEmployees([])
      return ()=>{active=false}
    }
    void api.listEmployees(50).then(items=>{
      if(active&&sessionFence.current.acceptsSession(sessionAtStart))setEmployees(items)
    }).catch(err=>{
      if(active&&sessionFence.current.acceptsSession(sessionAtStart))setError(describe(err))
    })
    return ()=>{active=false}
  },[api,status,profile?.id,profile?.is_admin,sessionFence])
  const login=async(event:FormEvent)=>{
    event.preventDefault()
    if(productionRoot && typeof window!=="undefined" &&
       window.location.protocol!=="https:"){
      setPassword("");setError("必须通过可信 HTTPS 登录")
      return
    }
    if(busy)return
    const sessionAtStart=sessionFence.current.invalidate()
    clearPrivateDrafts()
    setAgents([]);setWorkflows([]);setKnowledge([]);setReadableKnowledge([]);setModelConnections([])
    setToolConnections([])
    setConfigEditEnabled(false);setModelProbeEnabled(false);setMcpDiscoveryEnabled(false);setMcpToolsEnabled(false);setSmitheryEnabled(false);setWorkflowValidationEnabled(false);setWorkflowExecutionEnabled(false);setWorkflowV2Enabled(false)
    setEditing(null);setModelEditing(null);setModelApiKey("");setDetailTarget(null);setLoading(false)
    setBusy(true);setError("")
    try{
      await api.login(email,password)
      if(!sessionFence.current.acceptsSession(sessionAtStart))return
      setPassword("")
      const user=await api.me()
      if(!sessionFence.current.acceptsSession(sessionAtStart))return
      setProfile(user);setStatus("signedin")
      setNotice("已通过 PostgreSQL 原生员工身份验证")
      await refresh()
    }catch(err){
      if(sessionFence.current.acceptsSession(sessionAtStart)){
        setPassword("");setProfile(null);setStatus("signedout")
        setError(describe(err))
      }
    }finally{setBusy(false)}
  }
  const logout=async()=>{
    if(busy)return
    const sessionAtStart=sessionFence.current.invalidate()
    clearPrivateDrafts()
    // Hide all private information before the network logout completes.
    setProfile(null);setStatus("checking")
    setRunSubmissionEnabled(false);setBoundModelRunsEnabled(false);setAutonomousEnabled(false);setScheduleEnabled(false)
    setAgents([]);setWorkflows([]);setKnowledge([]);setReadableKnowledge([]);setEmployees([]);setModelConnections([])
    setToolConnections([])
    setConfigEditEnabled(false);setModelProbeEnabled(false);setMcpDiscoveryEnabled(false);setMcpToolsEnabled(false);setSmitheryEnabled(false);setWorkflowValidationEnabled(false);setWorkflowExecutionEnabled(false);setWorkflowV2Enabled(false)
    setEditing(null);setModelEditing(null);setModelApiKey("");setDetailTarget(null);setLoading(false)
    setBusy(true);setError("")
    try{
      await api.logout()
      if(!sessionFence.current.acceptsSession(sessionAtStart))return
      setStatus("signedout")
      setNotice("");setNewGoal("");setStaffPassword("")
    }catch(err){
      if(sessionFence.current.acceptsSession(sessionAtStart)){
        setStatus("unavailable")
        setError(describe(err))
      }
    }finally{setBusy(false)}
  }
  const action=async(work:()=>Promise<unknown>,message:string)=>{
    if(busy)return false
    const sessionAtStart=sessionFence.current.session()
    setBusy(true);setError("");setNotice("")
    try{
      await work()
      if(!sessionFence.current.acceptsSession(sessionAtStart))return false
      setNewName("");setNewGoal("");setNewDescription("")
      setStaffEmail("");setStaffName("");setStaffPassword("")
      setNotice(message)
      await refresh()
      return sessionFence.current.acceptsSession(sessionAtStart)
    }catch(err){
      if(sessionFence.current.acceptsSession(sessionAtStart))
        setError(describe(err))
      return false
    }finally{setBusy(false)}
  }

  const resetModelForm=()=>{
    setModelEditing(null);setModelName("");setModelProvider("openai")
    setModelBaseUrl("https://api.openai.com/v1");setModelApiKey("")
    setModelModels("");setModelEnabled(true)
  }
  const editModelConnection=(item:PgNativeModelConnection)=>{
    setModelEditing(item);setModelName(item.name);setModelProvider(item.provider)
    setModelBaseUrl(item.base_url);setModelApiKey("")
    setModelModels(item.models.join(", "));setModelEnabled(item.enabled)
    setSection("modelConnections");setError("");setNotice("")
  }
  const submitModelConnection=async(event:FormEvent)=>{
    event.preventDefault()
    const input={
      name:modelName.trim(),provider:modelProvider,base_url:modelBaseUrl.trim(),
      api_key:modelApiKey.trim(),models:modelModels.split(/[,，\\n;；]+/).map(x=>x.trim()).filter(Boolean),
      enabled:modelEnabled,
    }
    const current=modelEditing
    const success=await action(async()=>{
      if(current)await api.updateModelConnection(current.id,current.revision,input)
      else await api.createModelConnection(input)
    },current?"模型连接配置已更新":"模型连接已加密保存")
    if(success)resetModelForm()
  }
  const testModelConnection=async(item:PgNativeModelConnection)=>{
    if(!modelProbeEnabled||busy)return
    const session=sessionFence.current.session()
    setBusy(true);setError("");setNotice("")
    try{
      const checked=await api.testModelConnection(item.id,item.revision)
      if(!sessionFence.current.acceptsSession(session))return
      setModelConnections(old=>old.map(row=>row.id===checked.id?checked:row))
      if(modelEditing?.id===checked.id)setModelEditing(checked)
      const safeFailure:Record<string,string>={
        provider_credential_rejected:"API Key 未通过供应商认证",
        provider_rate_limited:"供应商请求频率受限",
        provider_dns_unsafe:"供应商域名解析未通过公网 IP 安全检查",
        provider_dns_unavailable:"供应商 DNS 解析失败",
        provider_endpoint_not_allowlisted:"当前地址不在安全检测白名单",
        provider_response_rejected:"供应商未返回成功状态",
        provider_response_invalid:"供应商返回的模型列表格式无效",
        provider_response_too_large:"供应商返回内容超过安全大小限制",
        provider_probe_timeout:"供应商响应超时",
      }
      setNotice(checked.status==="ok"
        ?"连接测试通过（只读模型列表，"+checked.last_latency_ms+" ms）"
        :"连接测试未通过："+(safeFailure[checked.last_error]||"供应商连接失败"))
    }catch(err){
      if(sessionFence.current.acceptsSession(session))setError(describe(err))
    }finally{setBusy(false)}
  }
  const deleteModelConnection=(item:PgNativeModelConnection)=>{
    if(typeof window!=="undefined"&&!window.confirm("确定删除模型连接“"+item.name+"”？此操作不可撤销。"))return
    void action(()=>api.deleteModelConnection(item.id),"模型连接已删除")
    if(modelEditing?.id===item.id)resetModelForm()
  }
  const saveEditing=async(name:string,detail:string)=>{
    if(!editing)return
    const current=editing
    const success=await action(async()=>{
      if(current.kind==="agents"){
        await api.updateAgent(current.id,current.revision,name,detail)
      }else if(current.kind==="workflows"){
        await api.updateWorkflow(current.id,current.revision,name)
      }else{
        await api.updateKnowledge(current.id,current.revision,name,detail)
      }
    },"配置已更新并重新读取")
    if(success)setEditing(null)
  }
  const canRunOwnerModel=runSubmissionEnabled&&boundModelRunsEnabled
  const canReadSingleTask=canRunOwnerModel||ownOperationsAvailable||originalTarget?.kind==="agent_single"
  const originalTaskKey=(profile?.id??"signedout")+":"+pgNativeOriginalTaskScopeKey(api)
  const currentTemplateSetup=templateSetup?.api===api&&templateSetup.owner===profile?.id&&sessionFence.current.acceptsSession(templateSetup.session)?templateSetup:null
  const templateSetupSelection=currentTemplateSetup?.sequence
  useEffect(()=>{if(section==="agents"&&templateSetupSelection!==undefined)document.getElementById("template-market-agent-setup")?.scrollIntoView({block:"start"})},[section,templateSetupSelection])
  const title=[{key:"createAgent" as const,label:"创建助手",icon:Plus,count:null},{key:"ownOperations" as const,label:"我的概览与待办",icon:ClipboardCheck,count:null},{key:"agents" as const,label:"Agent 配置",icon:Bot,count:agents.length},
    ...(apiMatches&&profile?.is_admin&&(companyOverviewAvailable||companyWorkerHeartbeatsAvailable)?[{key:"companyOverview" as const,label:"公司概览",icon:BriefcaseBusiness,count:null}]:[]),
    ...(collaborationAvailable?[{key:"collaboration" as const,label:"Agent 协作",icon:Users,count:null}]:[]),
    ...(releasesAvailable?[{key:"releases" as const,label:"版本与发布",icon:ClipboardCheck,count:null}]:[]),
    ...(agentPlanWorkflow.available?[{key:"workflowDraft" as const,label:"生成工作流草图",icon:Workflow,count:null}]:[]),
    ...(templateMarket.available?[{key:"templates" as const,label:"模板市场",icon:BookOpen,count:null}]:[]),
    ...(internalShare.available?[{key:"internalShares" as const,label:"内部模板共享",icon:BookOpen,count:null}]:[]),
    ...(localDevices.available?[{key:"localDevices" as const,label:"本机设备",icon:BookOpen,count:null},{key:"officeWorkflow" as const,label:"本地办公流程",icon:BookOpen,count:null}]:[]),
    ...(approvalDelegation.available?[{key:"approvalDelegations" as const,label:"审批委托",icon:ClipboardCheck,count:null}]:[]),
    ...(canReadSingleTask?[{key:"runAgent" as const,label:canRunOwnerModel?"运行 Agent":"Agent 原任务（只读）",icon:Bot,count:null}]:[]),
    {key:"workflows" as const,label:"Workflow",icon:Workflow,count:workflows.length},
    {key:"knowledge" as const,label:"知识库",icon:BookOpen,count:knowledge.length},
    {key:"schedules" as const,label:"定时计划草稿",icon:CalendarClock,count:null},
    {key:"autonomousAgent" as const,label:"多轮 Agent",icon:Bot,count:null},
    {key:"runs" as const,label:"Agent 运行历史（只读）",icon:ClipboardCheck,count:null},
    {key:"workflowNativeRuns" as const,label:"Workflow 运行与审批",icon:Workflow,count:null},
    {key:"workflowRuns" as const,label:"Workflow 运行历史（只读）",icon:Workflow,count:null},
    ...(RUN_UAT_LOCAL_ONLY&&!productionRoot?
      [{key:"runUat" as const,label:"运行与审批 UAT",icon:ClipboardCheck,count:null}]:[]),
    {key:"modelConnections" as const,label:"模型连接",icon:KeyRound,count:modelConnections.length},
    {key:"toolConnections" as const,label:"工具连接",icon:Wrench,count:toolConnections.length},
    {key:"employees" as const,label:"员工管理",icon:Users,count:null},
  ]
  const navigate=(screen:NativeStudioScreen)=>{
    if(originalOpening)return
    setSection(screen);setEditing(null);setDetailTarget(null)
    if(screen==="schedules")setSchedulesOpened(true)
    if(screen==="workflows")setWorkflowCanvasOpened(true)
    if(screen==="workflowNativeRuns")setWorkflowRunsOpened(true)
    if(screen==="toolConnections")setMcpOpened(true)
    if(screen==="agents")setAgentMcpOpened(true)
    requestAnimationFrame(()=>{const content=document.getElementById("pg-native-workspace-content");content?.focus({preventScroll:true});if(window.matchMedia("(max-width: 1023px)").matches)content?.scrollIntoView({block:"start"})})
  }
  const journeyNavigate=(destination:NativeJourneyDestination,agentId?:string)=>{
    if(originalOpening)return
    if((destination==="runAgent"||destination==="autonomousAgent"||destination==="releases")&&pgNativeOriginalTasksBlocked(api)){
      setError("请先在原任务页面核对已有未决请求，再打开新的助手任务。");return
    }
    if(agentId&&(destination==="runAgent"||destination==="autonomousAgent"||destination==="releases"))setJourneyAgentRequest({id:agentId,selection:++journeySequence.current})
    setJourneyReturning(true);navigate(destination)
  }
  // Never trust browser flags for production editing: the authenticated
  // Native service alone publishes its reviewed configuration capability.
  const canEditConfig=!productionRoot||configEditEnabled
  // The independent PG18 build may be hosted only on company-trusted HTTPS.
  // Never display password input or initiate login on a plain HTTP origin.
  if(productionRoot && typeof window!=="undefined" &&
     window.location.protocol!=="https:"){
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-900">
      <section className="max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold">需要可信 HTTPS 连接</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          PostgreSQL 独立工作台仅支持经公司信任的 HTTPS 地址。
          当前未建立加密连接，因此不会展示管理员登录表单。
        </p>
      </section>
    </main>
  }
  return <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-900 sm:px-8 lg:py-9">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-indigo-600">
            <Database size={16}/> PostgreSQL 18 · Standalone Authentication
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{productionRoot?"PostgreSQL 独立工作台":"独立员工工作台"}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{canRunOwnerModel?"管理本人配置与任务。当前环境已授权提交绑定模型的 Agent 任务，模型调用须另行审批并可能产生费用。":productionRoot?"独立 PostgreSQL 会话与本人 Agent、Workflow、知识库核验。当前环境未授权 Agent 模型任务。":"仅供本机隔离验证的原生员工登录、Agent、Workflow 与知识库配置。不会连接原 PocketBase 登录，也不会自动执行 Agent。"}</p>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <AlertTriangle className="mr-1.5 inline-block" size={14}/> 正式切换 NO-GO
        </div>
      </header>
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
        <ShieldCheck className="mr-2 inline-block align-middle text-indigo-600" size={18}/>
        独立 Cookie 会话 · 服务端验证身份 · PostgreSQL RLS 数据隔离 · 旧系统保持不变
      </div>
      {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {notice&&<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
      {(status==="checking"||!apiMatches)&&<div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-600">
        <Loader2 className="animate-spin" size={19}/> 正在验证 PostgreSQL 员工会话…
      </div>}
      {status==="unavailable"&&<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold">独立认证服务尚不可用</h2>
        <p className="mt-3 text-sm text-slate-500">请确认本地 PG18 Native API、HTTPS/来源及代理配置，当前不会退回到旧 PocketBase 凭证。</p>
        <button className={secondary+" mt-6"} onClick={()=>window.location.reload()}>重新检查连接</button>
      </div>}
      {status==="signedout"&&apiMatches&&<section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
          <KeyRound size={21}/></span>
          <div><h2 className="text-lg font-semibold">原生员工账号登录</h2>
            <p className="text-xs text-slate-500">请使用独立 PostgreSQL 测试账号</p>
          </div></div>
        <form onSubmit={login} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">员工邮箱
            <input className={field} type="email" autoComplete="username" required
              value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="staff@company.com"/>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">密码
            <input className={field} type="password" autoComplete="current-password"
              required value={password} onChange={e=>setPassword(e.target.value)}/>
          </label>
          <button type="submit" className={button+" w-full"} disabled={busy}>
            {busy?<Loader2 size={17} className="animate-spin"/>:<ShieldCheck size={17}/>} 登录独立工作台
          </button>
        </form>
      </section>}
      {status==="signedin"&&apiMatches&&profile&&<>
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><BriefcaseBusiness size={20}/></div>
            <div><p className="font-medium">{profile.display_name}</p>
              <p className="text-xs text-slate-500">{profile.email} · {profile.is_admin?"管理员":"员工"}</p></div>
          </div>
          <div className="flex gap-2">
            <button className={secondary} onClick={()=>void refresh()} disabled={busy||loading}>
              <RefreshCcw className={loading?"animate-spin":""} size={15}/>刷新
            </button>
            <button className={secondary} onClick={()=>void logout()} disabled={busy}><LogOut size={15}/>退出</button>
          </div>
        </section>
        <div className="grid gap-4 lg:grid-cols-[210px_1fr]">
          <PgNativeStudioNavigation key={originalTaskKey+":"+sessionFence.current.session()} items={title.filter(x=>(x.key!=="employees"||profile.is_admin||employeeGovernance.available)&&(!productionRoot||x.key!=="employees"||employeeGovernance.available))} selected={section} disabled={originalOpening} onNavigate={navigate}/>
          <section id="pg-native-workspace-content" tabIndex={-1} className="min-w-0 space-y-5 outline-none">
            <p aria-label="当前位置" aria-live="polite" className="text-sm text-slate-500">{nativeStudioGroup(section)} / {title.find(item=>item.key===section)?.label??"当前工作区"}</p>
            {journeyReturning&&section!=="createAgent"&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm"><p>完成当前配置或核对原任务后，可返回创建向导继续。</p><button type="button" className={secondary} disabled={originalOpening} onClick={()=>navigate("createAgent")}>返回创建助手向导</button></div>}
            <PgNativeAgentCreateJourney key={originalTaskKey+":create:"+sessionFence.current.session()} api={api} employeeId={profile.id} scopeKey={originalTaskKey+":"+sessionFence.current.session()}
              active={apiMatches&&section==="createAgent"} enabled={configEditEnabled&&!loading&&!busy} loading={loading||busy}
              agents={agents} models={modelConnections} tools={toolConnections} bases={readableKnowledge} designAvailable={agentDesign.available}
              singleEnabled={canRunOwnerModel} autonomousEnabled={autonomousEnabled} releasesAvailable={releasesAvailable} adoptRequest={journeyAdoptRequest}
              onExpired={expireOriginalTaskSession} onSaved={refresh} onNavigate={journeyNavigate}
              onOpenDesign={()=>{setJourneyDesignVisible(true);setAgentDesignOpened(true)}}/>

            {originalOpening&&<p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm">正在重新核对原任务、资源和版本；完成前暂不能切换或提交任务。</p>}
            <fieldset disabled={originalOpening} className="min-w-0 space-y-5 border-0 p-0">
            <div hidden={section!=="ownOperations"}>
              <OwnOperationsPanel key={originalTaskKey} api={api} employeeId={profile.id} active={section==="ownOperations"}
                availability={{own_overview_available:ownOperationsAvailable,own_todos_available:ownOperationsAvailable}}
                destinationBusy={originalOpening||originalBlocked||busy} onOpenOriginal={openOwnOriginal} onExpired={expireOriginalTaskSession}/>
            </div>
            <div hidden={section!=="companyOverview"}>
              <CompanyOverviewPanel key={originalTaskKey} api={companyApi} employeeId={profile.id}
                workerHeartbeatsApi={companyWorkerApi} workerHeartbeatsAvailable={apiMatches&&companyWorkerHeartbeatsAvailable}
                currentAdmin={apiMatches&&profile.is_admin===true} available={apiMatches&&companyOverviewAvailable}
                active={apiMatches&&section==="companyOverview"} onExpired={expireOriginalTaskSession}/>
            </div>
            {releasesAvailable&&<div hidden={section!=="releases"}>
              <PgNativeAgentReleasePanel key={profile.id} api={api} agents={agents} connections={modelConnections} active={section==="releases"}
                agentSelectionRequest={journeyAgentRequest} canWrite={configEditEnabled&&!loading&&!busy} canAccept={releaseAcceptanceEnabled&&!loading&&!busy} onUpdated={refresh} onExpired={expireAgentSession}
                onOpenRun={id=>{if(pgNativeOriginalTasksBlocked(api))return;setOriginalTarget(null);setAutonomousTarget(previous=>({id,selection:(previous?.selection??0)+1}));setSection("autonomousAgent")}}/>
            </div>}
            {collaborationAvailable&&<div hidden={section!=="collaboration"}>
              <PgNativeAgentCollaborationPanel key={profile.id} api={api} active={section==="collaboration"}
                canWrite={configEditEnabled&&!loading&&!busy} onUpdated={refresh} onExpired={expireAgentSession}/>
            </div>}
            {/* Preserve an uncertain request while changing tabs; the employee
                session key below destroys it immediately on logout/switch. */}
            <div hidden={section!=="runAgent"||!canReadSingleTask}>
              <PgNativeAgentRunPanel key={originalTaskKey} api={api} agents={agents} connections={modelConnections}
                agentSelectionRequest={journeyAgentRequest} active={section==="runAgent"&&canReadSingleTask} enabled={canRunOwnerModel&&!loading&&!busy}
                onExpired={expireOriginalTaskSession} runTarget={originalTarget?.kind==="agent_single"?originalTarget:null} onTargetSettled={originalTargetSettled}/>
            </div>
            {section==="runAgent"&&!canRunOwnerModel&&<p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              当前环境未授权提交模型任务。已有记录可在运行历史中查看。
            </p>}
            <div hidden={section!=="autonomousAgent"}>
              <PgNativeAutonomousAgentPanel key={originalTaskKey} api={api} ownerId={profile.id} agents={agents} connections={modelConnections} tools={toolConnections} agentSelectionRequest={journeyAgentRequest} localDeviceApi={localDeviceApi} localDevicesAvailable={localDevices.available} officeRequest={officeRequest}
                humanAvailable={humanInput.available} humanEnabled={humanInput.enabled}
                outcomeAvailable={outcomeMemory.available} outcomeEnabled={outcomeMemory.enabled&&!loading&&!busy}
                optimizationAvailable={optimization.available} optimizationEnabled={optimization.enabled&&!loading&&!busy} onRoleChanged={refresh}
                feedbackAvailable={feedback.available} feedbackEnabled={feedback.enabled&&!loading&&!busy} feedbackLessons={feedback.lessons&&!loading&&!busy}
                reviewAvailable={agentReview.available} reviewEnabled={agentReview.enabled&&!loading&&!busy} reviewHistoryAvailable={agentReview.history}
                generatedAvailable={generatedAcceptance.available} generatedEnabled={generatedAcceptance.enabled&&!loading&&!busy}
                descriptivePatchAvailable={descriptivePatch.available} descriptivePatchEnabled={descriptivePatch.enabled&&!loading&&!busy}
                target={autonomousTarget}
                runTarget={originalTarget?.kind==="agent_autonomous"?originalTarget:null} onTargetSettled={originalTargetSettled}
                mcpEnabled={mcpToolsEnabled}
                active={section==="autonomousAgent"} enabled={autonomousEnabled&&!loading&&!busy} onExpired={expireOriginalTaskSession}/>
            </div>
            <div hidden={section!=="agents"&&!(section==="createAgent"&&journeyDesignVisible)}>{(agentDesignOpened||agentDesign.available)&&<PgNativeAgentDesignPanel key={profile.id+":design"} api={designApi} employeeId={profile.id}
              active={apiMatches&&(section==="agents"||section==="createAgent"&&journeyDesignVisible)} available={agentDesign.available}
              submissions={agentDesign.submissions&&!loading&&!busy} saves={agentDesign.saves&&!loading&&!busy}
              models={modelConnections.filter(c=>c.enabled&&c.status==="ok").flatMap(c=>c.models.map(model_id=>({connection_id:c.id,connection_revision:c.revision,model_id,label:c.name})))}
              sources={agents.map(a=>({spec_id:a.id,name:a.name}))} onSaved={id=>{setJourneyAdoptRequest({id,selection:++journeySequence.current});setJourneyDesignVisible(false);setSection("createAgent");void refresh()}} onExpired={expireAgentSession}/>}</div>
            <div hidden={section!=="workflowDraft"}>{(agentPlanWorkflowOpened||agentPlanWorkflow.available)&&<Suspense fallback={<p role="status">加载工作流草图生成中…</p>}>
              <PgNativeAgentPlanWorkflowPanel key={originalTaskKey+":plan-workflow:"+sessionFence.current.session()} api={agentPlanWorkflowApi} workflowApi={api}
                employeeId={profile.id} scopeKey={originalTaskKey+":"+sessionFence.current.session()} active={apiMatches&&section==="workflowDraft"}
                available={agentPlanWorkflow.available} submissions={agentPlanWorkflow.submissions&&!loading&&!busy} saves={agentPlanWorkflow.saves&&!loading&&!busy} configurationWrites={configEditEnabled&&!loading&&!busy}
                agents={agents} models={modelConnections} tools={toolConnections} bases={readableKnowledge} onExpired={expireOriginalTaskSession} onSaved={refresh} onOpenSavedWorkflow={openSavedPlanWorkflow}/>
            </Suspense>}</div>
            <div hidden={section!=="templates"}>{(templateMarketOpened||templateMarket.available)&&<PgNativeTemplateMarketPanel
              key={originalTaskKey+":templates"} api={templateMarketApi} employeeId={profile.id} scopeKey={originalTaskKey+":"+sessionFence.current.session()}
              active={apiMatches&&section==="templates"} available={templateMarket.available} writes={templateMarket.writes&&!loading&&!busy&&!templateSetupOpening}
              onExpired={expireOriginalTaskSession} onChanged={refresh} onConfigureAgent={id=>{void openTemplateAgentConfiguration(id)}}/>}</div>
            {(localDevicesOpened||localDevices.available)&&<div hidden={section!=="localDevices"}><PgNativeLocalDevicesPanel key={originalTaskKey+":local-devices"} api={localDeviceApi} active={apiMatches&&section==="localDevices"} available={localDevices.available} writes={localDevices.writes&&!loading&&!busy} onExpired={expireOriginalTaskSession}/></div>}
            {(localDevicesOpened||localDevices.available)&&<div hidden={section!=="officeWorkflow"}><PgNativeOfficeWorkflowPanel key={originalTaskKey+":office"} api={api} devicesApi={localDeviceApi} active={apiMatches&&section==="officeWorkflow"} available={localDevices.available} writes={localDevices.writes&&!loading&&!busy} onExpired={expireOriginalTaskSession} onChanged={refresh} onConfigureAgent={id=>{void openTemplateAgentConfiguration(id)}} onPrepareRun={r=>{setOfficeRequest(old=>({...r,selection:(old?.selection??0)+1}));setSection("autonomousAgent")}}/></div>}
            <div hidden={section!=="internalShares"}>{(internalShareOpened||internalShare.available)&&<PgNativeInternalSharePanel
              key={originalTaskKey+":internal-shares"} api={internalShareApi} employeeId={profile.id} scopeKey={originalTaskKey+":"+sessionFence.current.session()}
              active={apiMatches&&section==="internalShares"} available={internalShare.available} writes={internalShare.writes&&!loading&&!busy&&!templateSetupOpening}
              onExpired={expireOriginalTaskSession} onChanged={refresh} onConfigureAgent={id=>{void openTemplateAgentConfiguration(id)}}/>}</div>
            <PgNativeApprovalDelegationPanel key={originalTaskKey+":delegations"} api={approvalDelegationApi} employeeId={profile.id} scopeKey={originalTaskKey+":"+sessionFence.current.session()} active={apiMatches&&section==="approvalDelegations"} available={approvalDelegation.available} writes={approvalDelegation.writes&&!loading&&!busy} isAdmin={profile.is_admin} onExpired={expireOriginalTaskSession} onChanged={refresh}/>
            {templateSetupOpening&&<p role="status">正在读取你保存的助手副本…</p>}
            {currentTemplateSetup&&<PgNativeTemplateMarketAgentSetup key={originalTaskKey+":template-setup:"+currentTemplateSetup.sequence}
              api={api} agent={currentTemplateSetup.agent} active={apiMatches&&section==="agents"} enabled={configEditEnabled&&!loading&&!busy}
              connections={modelConnections} tools={toolConnections} bases={readableKnowledge} onSaved={refreshTemplateAgentConfiguration}
              onExpired={()=>{if(sessionFence.current.acceptsSession(currentTemplateSetup.session)&&originalIdentity.current.ownerId===currentTemplateSetup.owner)expireAgentSession()}} onClose={()=>setTemplateSetup(null)}/>}
            {section==="agents"&&<>
              {canEditConfig&&<CreateCard title="创建 Agent 配置" description="创建后写入本人独立的 PG18 Agent 记录，不会自动运行。">
                <form className="space-y-3" onSubmit={e=>{e.preventDefault();void action(()=>
                  api.createAgent(newName.trim(),newGoal.trim()),"Agent 配置已保存")}}>
                  <input required maxLength={120} className={field} placeholder="Agent 名称" value={newName} onChange={e=>setNewName(e.target.value)}/>
                  <textarea required maxLength={3000} rows={3} className={field} placeholder="Agent 的具体目标" value={newGoal} onChange={e=>setNewGoal(e.target.value)}/>
                  <button className={button} disabled={busy} type="submit"><Plus size={16}/>保存 Agent</button>
                </form>
              </CreateCard>}
              <Records title="我的 Agent" items={agents.map(x=>({
                id:x.id,name:x.name,description:x.spec?.goal||"",
                revision:x.revision,meta:"修订 "+x.revision}))}
                onInspect={item=>setDetailTarget({kind:"agents",id:item.id})}
                onEdit={canEditConfig?item=>setEditing({
                  kind:"agents",id:item.id,revision:item.revision,
                  name:item.name,detail:item.description
                }):undefined}/>
              {humanInput.available&&<PgNativeAgentPlanReviewPanel key={profile.id+":plan-review"} api={api} agents={agents} enabled={canEditConfig&&!loading&&!busy} onUpdated={refresh} onExpired={expireAgentSession}/>}
              {canEditConfig&&<div hidden={Boolean(currentTemplateSetup)}><PgNativeAgentModelBindingPanel
                key={profile.id+":model-binding"} api={api} agents={agents}
                connections={modelConnections} onUpdated={refresh} runtimeSubmissionEnabled={canRunOwnerModel}/></div>}
              {canEditConfig&&<div hidden={Boolean(currentTemplateSetup)}><PgNativeAgentHttpToolsPanel key={profile.id+":http-tools"} api={api} agents={agents} connections={toolConnections}
                enabled={configEditEnabled&&!loading&&!busy} onSaved={refresh} onExpired={expireAgentSession}/></div>}
            </>}
            <div hidden={section!=="agents"}>{agentMemory.available&&<PgNativeAgentMemoryPanel key={profile.id+":memory"} api={api} agents={agents} active={section==="agents"} canWrite={agentMemory.enabled&&!loading&&!busy} onExpired={expireAgentSession}/>}</div>
            <div hidden={section!=="agents"}>{(derivedMemoryOpened||derivedMemory.available)&&<PgNativeAgentDerivedMemoryPanel key={profile.id+":derived-memory"} api={api} agents={agents} active={section==="agents"&&derivedMemory.available} canWrite={derivedMemory.enabled&&!loading&&!busy} onExpired={expireAgentSession}/>}</div>
            {section==="agents"&&derivedMemoryOpened&&!derivedMemory.available&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">任务记忆暂不可用，刷新后可继续核对原请求。</p>}
            <div hidden={section!=="agents"||Boolean(currentTemplateSetup)}>{(agentMcpOpened||section==="agents")&&<PgNativeAgentMcpToolsPanel key={profile.id} api={api} agents={agents}
              active={section==="agents"} enabled={configEditEnabled&&!loading&&!busy} onSaved={refresh} onExpired={expireAgentSession}/>}</div>
            <div hidden={section!=="agents"||Boolean(currentTemplateSetup)}>{(agentMcpOpened||section==="agents")&&<PgNativeAgentKnowledgePanel key={profile.id} api={api} agents={agents} bases={readableKnowledge}
              active={section==="agents"} enabled={configEditEnabled&&!loading&&!busy} onSaved={refresh} onExpired={expireAgentSession}/>}</div>
            <div hidden={section!=="workflows"}>
              {(workflowCanvasOpened||section==="workflows")&&<Suspense fallback={<p role="status">加载工作流画布中…</p>}>
                <PgNativeWorkflowWorkspace key={profile.id} api={api} openWorkflowRequest={workflowOpenRequest} workflows={workflows} agents={agents} models={modelConnections} tools={toolConnections} bases={readableKnowledge}
                  active={section==="workflows"} writeEnabled={configEditEnabled&&!loading&&!busy} executionEnabled={workflowV2Enabled&&!loading&&!busy}
                  onExpired={expireAgentSession} onSaved={refresh} onRun={(id,revision)=>{
                    setWorkflowRunTarget(previous=>({id,revision,selection:(previous?.selection??0)+1}));setWorkflowRunsOpened(true);setSection("workflowNativeRuns")
                  }}/>
              </Suspense>}
            </div>
            <div hidden={section!=="workflowNativeRuns"}>
              {(workflowRunsOpened||section==="workflowNativeRuns")&&<Suspense fallback={<p role="status">加载工作流任务中…</p>}>
                <PgNativeWorkflowRunPanel key={originalTaskKey} api={api} workflows={workflows} active={section==="workflowNativeRuns"}
                  humanEnabled={humanInput.enabled} humanAvailable={humanInput.available}
                  enabled={workflowV2Enabled&&!loading&&!busy} target={workflowRunTarget} onExpired={expireOriginalTaskSession}
                  runTarget={originalTarget?.kind==="workflow_v2"?originalTarget:null} onTargetSettled={originalTargetSettled}/>
              </Suspense>}
            </div>
            {section==="workflows"&&workflows.some(flow=>flow.graph?.version!==2)&&(workflowValidationEnabled||workflowExecutionEnabled)&&
              <PgNativeWorkflowValidationPanel key={profile.id} api={api}
                workflows={workflows} validationEnabled={workflowValidationEnabled}
                executionEnabled={workflowExecutionEnabled}/>}
            {section==="agents"&&AgentKnowledgeUatPanel&&!productionRoot&&
              <AgentKnowledgeUatPanel key={profile.id} api={api}
                agents={agents} bases={knowledge} onSaved={refresh}/>
            }
            {section==="knowledge"&&<>
              {canEditConfig&&<CreateCard title="创建知识库" description="管理文档、共享权限，并按管理员开放范围使用语义检索。">
                <form className="space-y-3" onSubmit={e=>{e.preventDefault();void action(()=>
                  api.createKnowledge(newName.trim(),newDescription.trim()),"知识库已创建")}}>
                  <input required maxLength={120} className={field} placeholder="知识库名称" value={newName} onChange={e=>setNewName(e.target.value)}/>
                  <textarea className={field} maxLength={1000} rows={2} placeholder="知识库介绍" value={newDescription} onChange={e=>setNewDescription(e.target.value)}/>
                  <button className={button} type="submit" disabled={busy}><Plus size={16}/>创建知识库</button>
                </form>
              </CreateCard>}
              <Records title="我的知识库" items={knowledge.map(x=>({
                id:x.id,name:x.name,description:x.description,
                revision:x.revision,meta:"修订 "+x.revision}))}
                onInspect={item=>setDetailTarget({kind:"knowledge",id:item.id})}
                onEdit={canEditConfig?item=>setEditing({
                  kind:"knowledge",id:item.id,revision:item.revision,
                  name:item.name,detail:item.description
                }):undefined}/>
            </>}
            <div hidden={section!=="knowledge"}>{(knowledgeSharingOpened||knowledgeSharingEnabled)&&<PgNativeKnowledgeSharingPanel key={profile.id} api={api} bases={knowledge}
              active={section==="knowledge"} enabled={knowledgeSharingEnabled&&!loading&&!busy} onExpired={expireAgentSession}/>}</div>
            <div hidden={section!=="knowledge"}>{(knowledgeSemanticOpened||knowledgeSemantic.settings)&&<div className="space-y-4">
              <PgNativeKnowledgeEmbeddingPanel key={profile.id+":embedding"} api={api} models={modelConnections} bases={knowledge} active={section==="knowledge"}
                enabled={configEditEnabled&&!loading&&!busy} capabilities={knowledgeSemantic} onChanged={knowledgeSettingsChanged} onExpired={expireAgentSession}/>
              <PgNativeKnowledgeQueryPanel key={profile.id+":query"} api={api} bases={readableKnowledge} active={section==="knowledge"}
                enabled={configEditEnabled&&!loading&&!busy} queryAllowed={knowledgeSemantic.query} settingsVersion={knowledgeSettingsVersion} onExpired={expireAgentSession}/>
            </div>}</div>
            {section==="knowledge"&&TextIngestUatPanel&&!productionRoot&&
              <TextIngestUatPanel key={profile.id} api={api} bases={knowledge}/>
            }
            {detailTarget&&detailTarget.kind===section&&
              <PgNativeConfigDetail key={profile.id+":"+detailTarget.kind+":"+detailTarget.id}
                api={api} kind={detailTarget.kind} id={detailTarget.id}
                onClose={()=>setDetailTarget(null)}/>
            }
            {section==="toolConnections"&&<PgNativeToolConnectionsPanel
              api={api} items={toolConnections} canEdit={canEditConfig}
              onUpdated={refresh}/>}
            <div hidden={section!=="toolConnections"}>{(mcpOpened||section==="toolConnections")&&<PgNativeMcpConnectionsPanel key={profile.id} api={api}
              active={section==="toolConnections"} enabled={configEditEnabled&&!loading&&!busy} discoveryEnabled={mcpDiscoveryEnabled} onExpired={expireAgentSession}/>}</div>
            <div hidden={section!=="toolConnections"}>{(mcpOpened||section==="toolConnections")&&<PgNativeSmitheryPanel key={profile.id} api={api}
              active={section==="toolConnections"} enabled={smitheryEnabled&&!loading&&!busy} onExpired={expireAgentSession}/>}</div>
            {section==="modelConnections"&&<>
              {canEditConfig&&<CreateCard
                title={modelEditing?"编辑模型连接":"新增模型连接"}
                description="密钥使用独立 AES-256-GCM 加密密钥加密后存入 PostgreSQL，只展示末四位。连接检测需服务器独立授权，默认关闭；不会运行 Agent 或触发文本生成。">
                <form className="space-y-3" onSubmit={submitModelConnection}>
                  <input className={field} required maxLength={100}
                    placeholder="连接名称" value={modelName}
                    onChange={e=>setModelName(e.target.value)}/>
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span>模型协议</span>
                    <select className={field} value={modelProvider}
                      onChange={e=>{
                        const next=e.target.value as PgNativeModelProvider
                        setModelProvider(next)
                        if(!modelEditing)setModelBaseUrl(next==="anthropic"
                          ?"https://api.anthropic.com/v1":next==="gemini"
                          ?"https://generativelanguage.googleapis.com/v1beta"
                          :"https://api.openai.com/v1")
                      }}>
                      <option value="openai">OpenAI 兼容协议</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="gemini">Google Gemini</option>
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span>Base URL（仅 HTTPS）</span>
                    <input className={field} type="url" required maxLength={2048}
                      placeholder="https://api.openai.com/v1" value={modelBaseUrl}
                      onChange={e=>setModelBaseUrl(e.target.value)}/>
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span>API Key {modelEditing?"（留空表示保留现有密钥）":"（仅提交时发送一次）"}</span>
                    <input className={field} type="password"
                      autoComplete="new-password" required={!modelEditing}
                      maxLength={4096} value={modelApiKey}
                      onChange={e=>setModelApiKey(e.target.value)}
                      placeholder={modelEditing?"不修改密钥请留空":"输入提供商 API Key"}/>
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span>模型 ID（可选，使用逗号分隔）</span>
                    <input className={field} maxLength={3000}
                      value={modelModels} onChange={e=>setModelModels(e.target.value)}
                      placeholder="gpt-4o, gpt-4.1"/>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={modelEnabled}
                      onChange={e=>setModelEnabled(e.target.checked)}
                      className="accent-indigo-600"/>
                    启用此连接（当前仅保存配置，不触发模型调用）
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button className={button} type="submit" disabled={busy}>
                      <Plus size={16}/>{modelEditing?"保存修改":"加密保存连接"}
                    </button>
                    {modelEditing&&<button className={secondary} type="button"
                      onClick={resetModelForm} disabled={busy}>取消编辑</button>}
                  </div>
                </form>
              </CreateCard>}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">已保存的模型连接 <span className="text-xs text-slate-400">({modelConnections.length})</span></h2>
                  <button className={secondary} type="button" onClick={()=>void refresh()} disabled={loading||busy}>
                    <RefreshCcw size={15}/>刷新
                  </button>
                </div>
                {!modelConnections.length&&<p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">暂无模型连接。密钥加密保存后，只有经独立审核的测试环境才允许执行只读连接检测；模型执行仍关闭。</p>}
                <div className="space-y-3">
                  {modelConnections.map(item=><article key={item.id}
                    className="rounded-xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{item.name}</h3>
                          <span className={"rounded-full px-2 py-1 text-xs "+(item.enabled?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500")}>
                            {item.enabled?"已启用":"已停用"}
                          </span>
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                            {item.status==="untested"?"尚未测试":item.status==="ok"?"连接正常":"连接异常"}
                          </span>
                        </div>
                        <p className="mt-2 break-all text-xs text-slate-500">{item.provider} · {item.base_url}</p>
                        <p className="mt-1 text-xs text-slate-500">API Key：••••{item.api_key_tail} · 修订 {item.revision}</p>
                        <p className="mt-1 break-words text-xs text-slate-500">
                          模型：{item.models.length?item.models.join(", "):"尚未填写"}
                        </p>
                      </div>
                      {modelProbeEnabled&&<button type="button"
                        className={secondary} disabled={busy}
                        onClick={()=>void testModelConnection(item)}>
                        <RefreshCcw size={15}/>测试连接
                      </button>}
                      {canEditConfig&&<div className="flex shrink-0 gap-2">
                        <button type="button" className={secondary}
                          onClick={()=>editModelConnection(item)} disabled={busy}>编辑</button>
                        <button type="button"
                          className="inline-flex min-h-10 items-center rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          onClick={()=>deleteModelConnection(item)} disabled={busy}>删除</button>
                      </div>}
                    </div>
                  </article>)}
                </div>
              </section>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                安全边界：已实现加密存储、本人数据隔离与配置 CRUD。只在独立审批的隔离环境开放固定供应商的只读模型列表探测，默认关闭；自定义地址不允许探测。Agent 模型执行和 Worker 仍未启用。
              </p>
            </>}
            <div hidden={section!=="schedules"}>{(schedulesOpened||section==="schedules")&&
              <PgNativeSchedulesReadonlyPanel key={originalTaskKey} api={api}
                agents={agents} workflows={workflows} connections={modelConnections} canEdit={canEditConfig} canExecute={scheduleEnabled}
                active={section==="schedules"} onExpired={expireOriginalTaskSession} scheduleTarget={originalTarget?.kind==="schedule"?originalTarget:null} onTargetSettled={originalTargetSettled}/>
            }</div>
            {section==="runs"&&
              <PgNativeRunHistoryReadonlyPanel key={profile.id} api={api}/>
            }
            {section==="workflowRuns"&&
              <PgNativeWorkflowRunHistoryReadonlyPanel key={originalTaskKey} api={api} onExpired={expireOriginalTaskSession}
                runTarget={originalTarget?.kind==="workflow_safe"?originalTarget:null} onTargetSettled={originalTargetSettled}/>
            }
            {section==="runUat"&&RunUatPanel&&!productionRoot&&
              <RunUatPanel key={profile.id} api={api} agents={agents}/>
            }
            {editing&&canEditConfig&&editing.kind===section&&
              <PgConfigRecordEditor
                key={editing.kind+":"+editing.id+":"+editing.revision}
                target={editing} busy={busy}
                onSave={saveEditing} onCancel={()=>setEditing(null)}/>
            }
            {employeeGovernance.available&&<PgNativeEmployeeSettingsPanel key={profile.id} api={api} profile={profile} enabled={employeeGovernance.enabled} active={section==="employees"} onExpire={expireAgentSession}/>}
            {section==="employees"&&profile.is_admin&&!employeeGovernance.available&&
              <CreateCard title="员工账号清单" description="仅管理员可查看；只展示账号元数据，不返回密码哈希、会话令牌或认证凭据。">
                <div className="space-y-2">
                  {!employees.length&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">暂无员工记录，或正在加载。</p>}
                  {employees.map(employee=><div key={employee.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{employee.display_name||"未设置姓名"}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{employee.email}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {employee.is_admin&&<span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">管理员</span>}
                      <span className={"rounded-full px-2 py-1 "+(employee.enabled&&employee.status==="active"?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700")}>
                        {employee.enabled&&employee.status==="active"?"启用":"已停用"}
                      </span>
                    </div>
                  </div>)}
                </div>
                <button type="button" className={secondary+" mt-3"} onClick={()=>void api.listEmployees(50).then(setEmployees).catch(err=>setError(describe(err)))} disabled={busy}>
                  <RefreshCcw size={15}/>刷新清单
                </button>
              </CreateCard>}
            {section==="employees"&&profile.is_admin&&!productionRoot&&!employeeGovernance.available&&
              <CreateCard title="创建员工测试账号" description="仅管理员可操作，员工密码不在页面持久保存。">
                <form className="space-y-3" onSubmit={e=>{e.preventDefault();void action(()=>
                  api.createEmployee(staffEmail.trim(),staffPassword,staffName.trim()),"已创建独立员工账号")}}>
                  <input className={field} type="email" required placeholder="员工邮箱" value={staffEmail} onChange={e=>setStaffEmail(e.target.value)}/>
                  <input className={field} required maxLength={80} placeholder="员工姓名" value={staffName} onChange={e=>setStaffName(e.target.value)}/>
                  <input className={field} type="password" required minLength={12} maxLength={256} placeholder="初始密码（至少12位）" autoComplete="new-password" value={staffPassword} onChange={e=>setStaffPassword(e.target.value)}/>
                  <button className={button} type="submit" disabled={busy}><Plus size={16}/>创建员工</button>
                </form>
              </CreateCard>}
            </fieldset>
          </section>
        </div>
        <p className="text-center text-xs text-slate-400">{canRunOwnerModel?"本人模型任务按环境授权处理 · 正式迁移未完成":productionRoot?(configEditEnabled?"独立 PostgreSQL 受控配置管理 · 模型任务未授权 · 正式迁移未完成":"独立 PostgreSQL 只读验证版 · 模型任务未授权 · 正式迁移未完成"):"开发模式试验页面 · 模型任务未授权 · 未批准正式切换"}</p>
      </>}
    </div>
  </main>
}

function CreateCard({title,description,children}:{title:string;description:string;children:React.ReactNode}){
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <h2 className="font-semibold">{title}</h2>
    <p className="mb-5 mt-1.5 text-xs leading-5 text-slate-500">{description}</p>
    {children}
  </section>
}
function Records({title,items,onEdit,onInspect}:{
  title:string
  items:{id:string;name:string;description:string;meta:string;revision:number}[]
  onEdit?:(item:{id:string;name:string;description:string;meta:string;revision:number})=>void
  onInspect?:(item:{id:string;name:string;description:string;meta:string;revision:number})=>void
}){
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <h2 className="mb-4 flex items-center gap-2 font-semibold"><CheckCircle2 size={17} className="text-indigo-600"/>{title} <span className="text-xs text-slate-400">({items.length})</span></h2>
    {!items.length&&<p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">暂无记录</p>}
    <div className="space-y-2">{items.map(item=><div key={item.id} className="rounded-xl border border-slate-100 p-4">
      <div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{item.name}</p><span className="text-xs text-slate-400">{item.meta}</span></div>
      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description}</p>
      {onInspect&&<button type="button" onClick={()=>onInspect(item)}
        className="mt-3 mr-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        查看详情
      </button>}
      {onEdit&&<button type="button" onClick={()=>onEdit(item)}
        className="mt-3 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
        编辑配置
      </button>}
    </div>)}</div>
  </section>
}
