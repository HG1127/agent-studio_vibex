import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react"
import {Bot,BookOpen,BriefcaseBusiness,CheckCircle2,Database,
  KeyRound,Loader2,LogOut,Plus,RefreshCcw,ShieldCheck,Users,Workflow,
  AlertTriangle,ClipboardCheck,CalendarClock,Wrench} from "lucide-react"
import {createPgNativePilotApi,PgNativePilotError,
  type PgNativeAgent,type PgNativeWorkflow,type PgNativeKnowledge,
  type PgNativeStaff,type PgNativeEmployee,
  type PgNativeModelConnection,type PgNativeModelProvider,
  type PgNativeToolConnection} from "@/lib/pgNativePilotApi"
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
type Screen="agents"|"workflows"|"knowledge"|"schedules"|"employees"|"runs"|"runAgent"|"autonomousAgent"|"workflowRuns"|"workflowNativeRuns"|"runUat"|"modelConnections"|"toolConnections"
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
  const [status,setStatus]=useState<State>("checking")
  const [profile,setProfile]=useState<PgNativeStaff|null>(null)
  const [section,setSection]=useState<Screen>("agents")
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
  const [mcpOpened,setMcpOpened]=useState(false)
  const [agentMcpOpened,setAgentMcpOpened]=useState(false)
  const [workflowRunsOpened,setWorkflowRunsOpened]=useState(false)
  const [workflowRunTarget,setWorkflowRunTarget]=useState<{id:string;revision:number;selection:number}|null>(null)
  const [runSubmissionEnabled,setRunSubmissionEnabled]=useState(false)
  const [boundModelRunsEnabled,setBoundModelRunsEnabled]=useState(false)
  const [autonomousEnabled,setAutonomousEnabled]=useState(false)
  const [scheduleEnabled,setScheduleEnabled]=useState(false)
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
  const clearPrivateDrafts=useCallback(()=>{
    setNewName("");setNewGoal("");setNewDescription("")
    setStaffEmail("");setStaffName("");setStaffPassword("")
    setModelName("");setModelApiKey("");setModelModels("");setNotice("")
    setWorkflowCanvasOpened(false);setWorkflowRunsOpened(false);setWorkflowRunTarget(null)
    setMcpOpened(false)
    setAgentMcpOpened(false)
    setKnowledgeSharingOpened(false);setKnowledgeSharingEnabled(false)
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
  const refresh=useCallback(async()=>{
    const ticket=sessionFence.current.beginRead()
    setReadableKnowledge([])
    setConfigEditEnabled(false);setWorkflowV2Enabled(false)
    setRunSubmissionEnabled(false);setBoundModelRunsEnabled(false);setAutonomousEnabled(false);setScheduleEnabled(false)
    setLoading(true)
    try{
      const [a,w,k,m,t,capability]=await Promise.all([
        api.listAgents(),api.listWorkflows(),api.listKnowledge(),
        api.listModelConnections(),api.listToolConnections(),
        // The server owns the probe authorization; browser flags cannot
        // enable network access even in the standalone dev workspace.
        api.getConfigCapabilities().catch(()=>null),
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
  const title=[{key:"agents" as const,label:"Agent 配置",icon:Bot,count:agents.length},
    ...(canRunOwnerModel?[{key:"runAgent" as const,label:"运行 Agent",icon:Bot,count:null}]:[]),
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
      {status==="checking"&&<div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-600">
        <Loader2 className="animate-spin" size={19}/> 正在验证 PostgreSQL 员工会话…
      </div>}
      {status==="unavailable"&&<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold">独立认证服务尚不可用</h2>
        <p className="mt-3 text-sm text-slate-500">请确认本地 PG18 Native API、HTTPS/来源及代理配置，当前不会退回到旧 PocketBase 凭证。</p>
        <button className={secondary+" mt-6"} onClick={()=>window.location.reload()}>重新检查连接</button>
      </div>}
      {status==="signedout"&&<section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
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
      {status==="signedin"&&profile&&<>
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
          <nav aria-label="独立 PostgreSQL 功能" className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 lg:flex-col lg:gap-1 lg:self-start">
            {title.filter(x=>(x.key!=="employees"||profile.is_admin)&&
              (!productionRoot||x.key!=="employees")).map(item=>
              <button key={item.key} type="button" onClick={()=>{setSection(item.key);setEditing(null);setDetailTarget(null);if(item.key==="workflows")setWorkflowCanvasOpened(true);if(item.key==="workflowNativeRuns")setWorkflowRunsOpened(true);if(item.key==="toolConnections")setMcpOpened(true);if(item.key==="agents")setAgentMcpOpened(true)}}
                className={"flex min-w-max items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium lg:w-full "+
                  (section===item.key?"bg-indigo-50 text-indigo-700":"text-slate-600 hover:bg-slate-50")}>
                <item.icon size={17}/>
                <span className="flex-1">{item.label}</span>
                {item.count!==null&&<span className="text-xs tabular-nums">{item.count}</span>}
              </button>)}
          </nav>
          <section className="min-w-0 space-y-5">
            {/* Preserve an uncertain request while changing tabs; the employee
                session key below destroys it immediately on logout/switch. */}
            <div hidden={section!=="runAgent"||!canRunOwnerModel}>
              <PgNativeAgentRunPanel key={profile.id} api={api} agents={agents} connections={modelConnections}
                active={section==="runAgent"&&canRunOwnerModel} enabled={canRunOwnerModel&&!loading&&!busy}/>
            </div>
            {section==="runAgent"&&!canRunOwnerModel&&<p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              当前环境未授权提交模型任务。已有记录可在运行历史中查看。
            </p>}
            <div hidden={section!=="autonomousAgent"}>
              <PgNativeAutonomousAgentPanel key={profile.id} api={api} agents={agents} connections={modelConnections} tools={toolConnections}
                mcpEnabled={mcpToolsEnabled}
                active={section==="autonomousAgent"} enabled={autonomousEnabled&&!loading&&!busy} onExpired={expireAgentSession}/>
            </div>
            {section==="agents"&&<>
              {canEditConfig&&<CreateCard title="创建 Agent 配置" description="创建后写入本人独立的 PG18 Agent 记录，不会自动运行。">
                <form className="space-y-3" onSubmit={e=>{e.preventDefault();void action(()=>
                  api.createAgent(newName.trim(),newGoal.trim()),"Agent 配置已保存")}}>
                  <input required maxLength={120} className={field} placeholder="Agent 名称" value={newName} onChange={e=>setNewName(e.target.value)}/>
                  <textarea required maxLength={2000} rows={3} className={field} placeholder="Agent 的具体目标" value={newGoal} onChange={e=>setNewGoal(e.target.value)}/>
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
              {canEditConfig&&<PgNativeAgentModelBindingPanel
                key={profile.id} api={api} agents={agents}
                connections={modelConnections} onUpdated={refresh} runtimeSubmissionEnabled={canRunOwnerModel}/>}
              {canEditConfig&&<PgNativeAgentHttpToolsPanel key={profile.id} api={api} agents={agents} connections={toolConnections}
                enabled={configEditEnabled&&!loading&&!busy} onSaved={refresh} onExpired={expireAgentSession}/>}
            </>}
            <div hidden={section!=="agents"}>{(agentMcpOpened||section==="agents")&&<PgNativeAgentMcpToolsPanel key={profile.id} api={api} agents={agents}
              active={section==="agents"} enabled={configEditEnabled&&!loading&&!busy} onSaved={refresh} onExpired={expireAgentSession}/>}</div>
            <div hidden={section!=="agents"}>{(agentMcpOpened||section==="agents")&&<PgNativeAgentKnowledgePanel key={profile.id} api={api} agents={agents} bases={readableKnowledge}
              active={section==="agents"} enabled={configEditEnabled&&!loading&&!busy} onSaved={refresh} onExpired={expireAgentSession}/>}</div>
            <div hidden={section!=="workflows"}>
              {(workflowCanvasOpened||section==="workflows")&&<Suspense fallback={<p role="status">加载工作流画布中…</p>}>
                <PgNativeWorkflowWorkspace key={profile.id} api={api} workflows={workflows} agents={agents} models={modelConnections} tools={toolConnections} bases={readableKnowledge}
                  active={section==="workflows"} writeEnabled={configEditEnabled&&!loading&&!busy} executionEnabled={workflowV2Enabled&&!loading&&!busy}
                  onExpired={expireAgentSession} onSaved={refresh} onRun={(id,revision)=>{
                    setWorkflowRunTarget(previous=>({id,revision,selection:(previous?.selection??0)+1}));setWorkflowRunsOpened(true);setSection("workflowNativeRuns")
                  }}/>
              </Suspense>}
            </div>
            <div hidden={section!=="workflowNativeRuns"}>
              {(workflowRunsOpened||section==="workflowNativeRuns")&&<Suspense fallback={<p role="status">加载工作流任务中…</p>}>
                <PgNativeWorkflowRunPanel key={profile.id} api={api} workflows={workflows} active={section==="workflowNativeRuns"}
                  enabled={workflowV2Enabled&&!loading&&!busy} target={workflowRunTarget} onExpired={expireAgentSession}/>
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
            {section==="schedules"&&
              <PgNativeSchedulesReadonlyPanel key={profile.id} api={api}
                agents={agents} workflows={workflows} canEdit={canEditConfig} canExecute={scheduleEnabled}/>
            }
            {section==="runs"&&
              <PgNativeRunHistoryReadonlyPanel key={profile.id} api={api}/>
            }
            {section==="workflowRuns"&&
              <PgNativeWorkflowRunHistoryReadonlyPanel key={profile.id} api={api}/>
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
            {section==="employees"&&profile.is_admin&&
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
            {section==="employees"&&profile.is_admin&&!productionRoot&&
              <CreateCard title="创建员工测试账号" description="仅管理员可操作，员工密码不在页面持久保存。">
                <form className="space-y-3" onSubmit={e=>{e.preventDefault();void action(()=>
                  api.createEmployee(staffEmail.trim(),staffPassword,staffName.trim()),"已创建独立员工账号")}}>
                  <input className={field} type="email" required placeholder="员工邮箱" value={staffEmail} onChange={e=>setStaffEmail(e.target.value)}/>
                  <input className={field} required maxLength={80} placeholder="员工姓名" value={staffName} onChange={e=>setStaffName(e.target.value)}/>
                  <input className={field} type="password" required minLength={12} maxLength={256} placeholder="初始密码（至少12位）" autoComplete="new-password" value={staffPassword} onChange={e=>setStaffPassword(e.target.value)}/>
                  <button className={button} type="submit" disabled={busy}><Plus size={16}/>创建员工</button>
                </form>
              </CreateCard>}
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
