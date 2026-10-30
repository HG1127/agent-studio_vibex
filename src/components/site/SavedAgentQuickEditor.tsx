import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {confirmInStudio} from "@/lib/studioDialogs"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowRight, AlertTriangle, Loader2, RefreshCcw, Save, ShieldCheck } from "lucide-react"
import { AgentDraftDrawer } from "@/components/site/AgentDraftDrawer"
import { SpecEditorCard } from "@/components/home/SpecEditorCard"
import {AgentResourceReminder} from "@/components/site/AgentResourceReminder"
import {useAgentResourceReminder} from "@/lib/useAgentResourceReminder"
import {EMPTY_AGENT_RESOURCE_FOCUS,requestAgentResourceFocus,resourceFocusForAgent} from "@/lib/agentResourceFocus"
import { BUILTIN_TOOL_OPTIONS, toolConnectionStatus,
  type AgentSpec, type ConnectedToolOption, type ListField } from "@/pages/Home/presets"
import type { SavedSpecRow } from "@/pages/Home/useHome"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, vibexAuthHeaders } from "@/lib/studioAuth"
import { getKnowledgeBases, type KnowledgeBase } from "@/lib/knowledgeBases"
import { getVerifiedMarketTools, type VerifiedMarketTool } from "@/lib/marketToolSelection"
import { safeAgentSpecId } from "@/lib/toolSearchPrivacy"
import { resolveAgentToolRequirements } from "@/lib/agentToolMatcher"
import { callLlmWithFallback } from "@/lib/llm"
import { agentCapabilityRequirements, normalizeCapabilityRequirements, toolCatalogForDesign } from "@/lib/agentCapabilityPlan"
import { preserveRoleSkillBindings, sanitizeAgentRoles } from "@/lib/agentRoles"
import { readQuickAgentDraft, saveQuickAgentDraft, clearQuickAgentDraft, type QuickAgentDraft } from "@/lib/quickAgentDraft"

type Props={open:boolean;onClose:()=>void;preferredSpecId?:string}

const cloneSpec=(spec:AgentSpec):AgentSpec=>({
  ...spec,deliverables:[...(spec.deliverables||[])],tools:[...(spec.tools||[])],
  task_plan:[...(spec.task_plan||[])],done_criteria:[...(spec.done_criteria||[])],
  knowledge_base_ids:[...(spec.knowledge_base_ids||[])],
  quality_checks:[...(spec.quality_checks||[])],
  roles:sanitizeAgentRoles(spec.roles),
  ...(Array.isArray(spec.capability_requirements)?{capability_requirements:normalizeCapabilityRequirements(spec.capability_requirements)}:{}),
})
const defaultSpec=():AgentSpec=>({goal:"",task_scope:"",deliverables:[],tools:[],
  task_plan:[],done_criteria:[]})

export function SavedAgentQuickEditor({open,onClose,preferredSpecId=""}:Props){
  const loc=useLocation(),navigate=useNavigate()
  const base=getPocketBaseUrl()
  const ownerId=decodeRhToken()?.sub||""
  const [list,setList]=useState<SavedSpecRow[]>([])
  const [record,setRecord]=useState<SavedSpecRow|null>(null)
  const [draft,setDraft]=useState<AgentSpec>(defaultSpec)
  const [name,setName]=useState("")
  const [dirty,setDirty]=useState(false)
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const [revising,setRevising]=useState(false)
  const [conflict,setConflict]=useState(false)
  const [error,setError]=useState("")
  const [revisionError,setRevisionError]=useState("")
  const [notice,setNotice]=useState("")
  const [reviseInstruction,setReviseInstruction]=useState("")
  const [revisionProposal,setRevisionProposal]=useState<{name:string;spec:AgentSpec;basis:number}|null>(null)
  const [connectedTools,setConnectedTools]=useState<ConnectedToolOption[]>([])
  const [marketTools,setMarketTools]=useState<VerifiedMarketTool[]>([])
  const [knowledge,setKnowledge]=useState<KnowledgeBase[]>([])
  const [toolNotice,setToolNotice]=useState("")
  const [nextTrialUrl,setNextTrialUrl]=useState("")
  const [baseUpdated,setBaseUpdated]=useState("")
  const [pendingQuickDraft,setPendingQuickDraft]=useState<QuickAgentDraft|null>(null)
  const [draftStorageError,setDraftStorageError]=useState(false)
  // Updated when an owner-scoped Agent is loaded, not read from mutable refs during render.
  const [editorSessionKey,setEditorSessionKey]=useState("")
  const [resourceFocus,setResourceFocus]=useState(EMPTY_AGENT_RESOURCE_FOCUS)
  const scopedResourceFocus=resourceFocusForAgent(resourceFocus,record?.id||"")
  const {reminder:resourceReminder,dismissReminder:dismissResourceReminder}=useAgentResourceReminder(record?.id||"",draft,open&&!!record&&!pendingQuickDraft&&record.rh_user_id===ownerId)
  const revision=useRef(0)
  const loadSequence=useRef(0)
  const connectedLoadSequence=useRef(0)
  const latestDraft=useRef({record:null as SavedSpecRow|null,draft,
    name,dirty,baseUpdated,pendingQuickDraft})
  useEffect(()=>{
    latestDraft.current={record,draft,name,dirty,baseUpdated,pendingQuickDraft}
  },[record,draft,name,dirty,baseUpdated,pendingQuickDraft])
  const persistUnsavedDraft=useCallback(()=>{
    const current=latestDraft.current
    if(!current.record||!current.dirty||current.pendingQuickDraft)return true
    return saveQuickAgentDraft(ownerId,current.record.id,{
      ownerId,specId:current.record.id,expectedUpdated:current.baseUpdated,
      name:current.name,spec:current.draft,
    })
  },[ownerId])
  useEffect(()=>{
    if(!open||!record||!dirty||pendingQuickDraft)return
    const timer=window.setTimeout(()=>setDraftStorageError(!persistUnsavedDraft()),500)
    return()=>window.clearTimeout(timer)
  },[open,record,dirty,pendingQuickDraft,draft,name,baseUpdated,persistUnsavedDraft])
  useEffect(()=>{
    if(!open)return
    const onPageHide=()=>{persistUnsavedDraft()}
    window.addEventListener("pagehide",onPageHide)
    return()=>{
      window.removeEventListener("pagehide",onPageHide)
      persistUnsavedDraft()
    }
  },[open,persistUnsavedDraft])

  const focusSpecId=safeAgentSpecId(preferredSpecId) ||
    safeAgentSpecId(new URLSearchParams(loc.search).get("spec")||"")
  const runId=new URLSearchParams(loc.search).get("run")||""

  const modified=useCallback(()=>{revision.current++;setDirty(true);setNotice("");setConflict(false);setRevisionProposal(null);setRevisionError("")},[])
  const request=useCallback(async(route:string,init?:RequestInit)=>{
    return fetch(base+route,{
      ...init,headers:{"Content-Type":"application/json",...vibexAuthHeaders(),...init?.headers},
      signal:AbortSignal.timeout(14000),
    })
  },[base])
  const refreshConnected=useCallback(async()=>{
    const requestId=++connectedLoadSequence.current
    const [http,market,bases]=await Promise.allSettled([
      request("/api/tool-connections"),
      request("/api/market/connections"),
      getKnowledgeBases(),
    ])
    const [httpData,marketData]=await Promise.all([
      http.status==="fulfilled"&&http.value.ok?http.value.json().catch(()=>null):null,
      market.status==="fulfilled"&&market.value.ok?market.value.json().catch(()=>null):null,
    ])
    if(requestId!==connectedLoadSequence.current)
      return {http:[],market:[],verified:false,stale:true}
    let freshHttp:ConnectedToolOption[]=[]
    let freshMarket:VerifiedMarketTool[]=[]
    const httpValid=Array.isArray(httpData?.items) && httpData.items.every((item:unknown)=>
      Boolean(item && typeof item==="object" && !Array.isArray(item) &&
        typeof (item as {name?:unknown}).name==="string" &&
        typeof (item as {enabled?:unknown}).enabled==="boolean"))
    const marketValid=Array.isArray(marketData?.items) && marketData.items.every((item:unknown)=>
      Boolean(item && typeof item==="object" && !Array.isArray(item) &&
        typeof (item as {id?:unknown}).id==="string" &&
        typeof (item as {enabled?:unknown}).enabled==="boolean"))
    if(httpValid){
      freshHttp=httpData.items
        .filter((item:{name?:string;enabled?:boolean})=>item.enabled===true&&item.name)
        .map((item:{id?:string;name:string;description?:string;method?:string;status?:string})=>
          ({name:item.name,description:typeof item.description==="string"?item.description:"",
            method:item.method,status:typeof item.status==="string"?item.status:"unknown",
            id:safeAgentSpecId(item.id||"")||undefined}))
      setConnectedTools(freshHttp)
    }else setConnectedTools(previous=>previous.map(tool=>({...tool,status:"unknown"})))
    if(marketValid){
      freshMarket=getVerifiedMarketTools(marketData.items)
      setMarketTools(freshMarket)
    }else setMarketTools([])
    if(bases.status==="fulfilled")setKnowledge(bases.value)
    const verified=httpValid&&marketValid
    if(!verified)setToolNotice("部分连接状态刷新失败，原方案仍保留；外部能力暂按待核验处理。")
    else setToolNotice(previous=>previous.startsWith("部分连接状态刷新失败")?"":previous)
    return {http:freshHttp,market:freshMarket,verified,stale:false}
  },[request])

  const loadRecord=useCallback(async(id:string,guard?:()=>boolean)=>{
    const loadId=++loadSequence.current
    const isCurrent=()=>loadSequence.current===loadId && (!guard || guard())
    setSaving(false)
    setRevising(false)
    setLoading(true)
    setError("")
    setRevisionError("")
    try {
      const res=await request("/api/agent_specs/"+encodeURIComponent(id))
      if(!res.ok)throw new Error("当前 Agent 不存在或无权查看")
      const item=await res.json() as SavedSpecRow
      if(!item || item.id!==id || !item.spec)throw new Error("服务器未返回完整方案")
      if(!isCurrent())return
      setRecord(item);setDraft(cloneSpec(item.spec));setName(item.name||"")
      setEditorSessionKey(`${item.id}:${loadId}`)
      setBaseUpdated(item.updated)
      setPendingQuickDraft(readQuickAgentDraft(ownerId,item.id))
      setDraftStorageError(false)
      setDirty(false);setConflict(false);setNotice("");setNextTrialUrl("")
      setList(prev=>prev.map(row=>row.id===item.id?item:row))
      setReviseInstruction("")
      setRevisionProposal(null)
      revision.current++
    }catch(err){
      if(isCurrent())setError(err instanceof Error?err.message:"读取 Agent 失败")
    }finally{if(isCurrent())setLoading(false)}
  },[request,ownerId])

  useEffect(()=>{
    if(!open)return
    let cancelled=false
    void Promise.resolve().then(async()=>{
      if(cancelled)return
      setLoading(true);setError("");setRevisionError("");setNotice("")
      try {
        const res=await request("/api/agent_specs?perPage=200&sort=-updated")
        if(!res.ok)throw new Error("无法加载当前员工的 Agent 列表")
        const data=await res.json()
        const rows:SavedSpecRow[]=Array.isArray(data?.items)?data.items:[]
        if(cancelled)return
        setList(rows)
        let requested=focusSpecId
        if(!requested && runId){
          const runRes=await request("/api/agent_runs/"+encodeURIComponent(runId))
          if(runRes.ok){
            const run=await runRes.json()
            requested=String(run.spec_id||"")
          }
        }
        // The explicitly requested Agent is authoritative even when its row
        // falls outside the recent-200 selector list.
        const target=requested&&/^[A-Za-z0-9]{15}$/.test(requested)
          ?requested:rows[0]?.id||""
        if(target){
          await loadRecord(target,()=>!cancelled)
          if(!rows.some(row=>row.id===target)){
            const loaded=await request("/api/agent_specs/"+encodeURIComponent(target))
            if(loaded.ok){
              const extra=await loaded.json() as SavedSpecRow
              if(!cancelled && extra?.id===target)
                setList(current=>[extra,...current.filter(row=>row.id!==target)])
            }
          }
        }
        else{setRecord(null);setDraft(defaultSpec());setName("");setLoading(false)}
        void refreshConnected()
      }catch(err){
        if(!cancelled){setError(err instanceof Error?err.message:"读取 Agent 列表失败");setLoading(false)}
      }
    })
    return()=>{cancelled=true}
  },[open,focusSpecId,runId,request,loadRecord,refreshConnected])

  useEffect(()=>{
    if(!open)return
    const reload=()=>{void refreshConnected()}
    const connectionRequestSeq=connectedLoadSequence
    window.addEventListener("focus",reload)
    return()=>{connectionRequestSeq.current++;window.removeEventListener("focus",reload)}
  },[open,refreshConnected])

  const toolStatusOf=useCallback((tool:string)=>toolConnectionStatus(tool,[
    ...connectedTools,...marketTools.map(item=>({name:item.id,description:item.description,status:"ok"})),
  ]),[connectedTools,marketTools])
  const analysis=useMemo(()=>resolveAgentToolRequirements("",
    draft,connectedTools,marketTools,draft.tools.filter(tool=>
      marketTools.some(row=>row.id===tool)||connectedTools.some(row=>row.name===tool))),
    [draft,connectedTools,marketTools])
  const updateText=(field:"goal"|"task_scope",value:string)=>{
    modified();setDraft(prev=>({...prev,[field]:value}))
  }
  const listChange=(field:ListField,index:number,value:string)=>{
    modified();setDraft(prev=>({...prev,[field]:prev[field].map((v,i)=>i===index?value:v)}))
  }
  const listAdd=(field:ListField)=>{
    modified();setDraft(prev=>({...prev,[field]:[...prev[field],""]}))
  }
  const listRemove=(field:ListField,index:number)=>{
    modified();setDraft(prev=>({...prev,[field]:prev[field].filter((_,i)=>i!==index)}))
  }
  const toggleTool=(tool:string,on:boolean)=>{
    modified()
    setDraft(prev=>({...prev,tools:on?[...new Set([...prev.tools,tool])]:
      prev.tools.filter(value=>value!==tool)}))
  }
  const matchTools=async()=>{
    const basis=revision.current
    const fresh=await refreshConnected()
    if(fresh.stale)return {listsChecked:false,detail:"当前存在更新的连接刷新请求；请重新核对当前员工资源。"}
    if(!fresh.verified)return {listsChecked:false,detail:"部分 HTTP/MCP 清单无法核验，没有将未知工具标记为可用。请检查后重试。"}
    if(basis!==revision.current)return {listsChecked:false,detail:"核验期间当前草稿发生修改，已拒绝使用过期结果，未覆盖修改。"}
    const result=resolveAgentToolRequirements("",draft,fresh.http,fresh.market,draft.tools)
    const added=result.safeAutoBindings.filter(id=>id&&!draft.tools.includes(id))
    if(added.length){
      modified()
      setDraft(prev=>({...prev,tools:[...new Set([...prev.tools,...added])]}))
    }
    const detail=(added.length?`已从最新清单安全匹配 ${added.length} 项候选（仅草稿，未保存）。`:
      "已重新读取当前员工连接清单，当前没有新增候选工具。")+
      (result.gaps.length?`还有 ${result.gaps.length} 项能力待连接或人工确认。`:
        "仍需检查具体工具健康、角色分配与完成标准。")
    setToolNotice(detail)
    return {listsChecked:true,detail}
  }
  const toggleKb=(id:string,on:boolean)=>{
    modified()
    setDraft(prev=>({...prev,
      knowledge_base_ids:on?[...new Set([...(prev.knowledge_base_ids||[]),id])].slice(0,10):
        (prev.knowledge_base_ids||[]).filter(value=>value!==id),
      tools:on?[...new Set([...prev.tools,"knowledge_search"])]:prev.tools,
    }))
  }

  const restoreQuickDraft=()=>{
    if(!record||!pendingQuickDraft)return
    const copy=pendingQuickDraft
    setDraft(cloneSpec(copy.spec))
    setName(copy.name)
    setBaseUpdated(copy.expectedUpdated)
    setPendingQuickDraft(null)
    setDirty(true)
    revision.current++
    if(copy.expectedUpdated!==record.updated){
      setConflict(true)
      setError("该草稿基于较早的服务器版本，无法直接覆盖当前方案。请核对后另存为新 Agent。")
    }else{
      setNotice("已恢复当前标签页的未保存草稿，请核对后保存到服务器。")
    }
  }
  const discardQuickDraft=()=>{
    if(!record)return
    clearQuickAgentDraft(ownerId,record.id)
    setPendingQuickDraft(null)
    setDraft(cloneSpec(record.spec))
    setName(record.name)
    setBaseUpdated(record.updated)
    setDirty(false)
    setConflict(false)
    setError("")
    setRevisionError("")
  }

  const save=async(copy=false):Promise<string>=>{
    if(!record||saving||pendingQuickDraft)return ""
    if(!copy && (!baseUpdated || baseUpdated!==record.updated)){
      setConflict(true)
      setError("草稿基于旧版本，不能覆盖服务器的新方案；请另存为副本。")
      return ""
    }
    if(!name.trim()||!draft.goal.trim()||!draft.done_criteria.some(Boolean)){
      setError("请填写 Agent 名称、目标及至少一项完成标准，再保存。")
      return ""
    }
    setSaving(true);setError("");setNotice("")
    const version=revision.current
    const saveContext=loadSequence.current
    const isCurrentContext=()=>saveContext===loadSequence.current
    try {
      const res=await request(copy?"/api/agent_specs":"/api/agent_specs/"+encodeURIComponent(record.id),{
        method:copy?"POST":"PATCH",
        body:JSON.stringify({
          name:copy?name.trim()+"（独立副本）":name.trim(),
          spec:draft,
          ...(copy?{}:{expected_updated:baseUpdated}),
        }),
      })
      if(!isCurrentContext())return ""
      if(res.status===409){
        setConflict(true)
        setError("方案已在另一页面修改。为避免覆盖，你可以另存为副本，或关闭窗口后重新读取新版本。")
        return ""
      }
      if(!res.ok){
        const info=await res.json().catch(()=>null)
        if(!isCurrentContext())return ""
        setError(info?.message||"方案保存失败，编辑内容仍保留。")
        return ""
      }
      const saved=await res.json() as SavedSpecRow
      if(!isCurrentContext())return ""
      if(!saved?.id || !saved.updated){
        setError("服务器未返回有效版本，无法确认保存是否完成。请核验后再试跑。")
        return ""
      }
      setRecord(saved)
      setBaseUpdated(saved.updated)
      setList(prev=>copy?[saved,...prev]:prev.map(row=>row.id===saved.id?saved:row))
      if(version===revision.current)clearQuickAgentDraft(ownerId,record.id)
      setConflict(false)
      if(version===revision.current)setDirty(false)
      setNotice("Agent 方案已保存。新配置将在下一次试跑时生效；已有运行保持原配置快照。")
      window.dispatchEvent(new CustomEvent("studio:agent-spec-saved",{detail:{specId:saved.id}}))
      return saved.id
    }catch{
      if(isCurrentContext())setError("网络异常，无法确认方案已保存；请先检查服务器版本。")
      return ""
    }finally{if(isCurrentContext())setSaving(false)}
  }
  const saveAndTest=async()=>{
    const draftRevision=revision.current
    const trialContext=loadSequence.current
    const canContinue=()=>{
      if(trialContext!==loadSequence.current)return false
      if(revision.current!==draftRevision){
        setNotice("保存期间方案又被修改。为避免试跑旧版本，请先再次保存最新改动。")
        return false
      }
      return true
    }
    const id=dirty?await save():record?.id||""
    if(!id||!canContinue())return
    const target="/agent-run?spec="+encodeURIComponent(id)
    if(loc.pathname==="/agent-run" && runId){
      // This run may be driven by this browser's polling loop; switching tabs
      // must not silently abandon an in-progress run or its human approval.
      try {
        const current=await request("/api/agent_runs/"+encodeURIComponent(runId))
        if(!canContinue())return
        if(current.ok){
          const live=await current.json() as {status?:string}
          if(!canContinue())return
          if(["queued","running","paused","awaiting_approval","awaiting_input"]
            .includes(String(live.status||""))){
            setNextTrialUrl(target)
            setNotice("新版本已保存，但当前任务尚未结束。请从下方的新标签入口试跑新版本，保留当前页面继续执行和审批。")
            return
          }
        }
      }catch{
        if(!canContinue())return
        setNextTrialUrl(target)
        setNotice("暂时无法确认当前运行是否结束。为避免中断任务，请在新标签中试跑新版本。")
        return
      }
    }
    if(!canContinue())return
    onClose()
    navigate(target)
  }
  const revise=async()=>{
    if(!reviseInstruction.trim()||!record || revising)return
    setRevising(true);setError("");setRevisionError("")
    const requestText=reviseInstruction.trim()
    const currentRev=revision.current
    const startedLoad=loadSequence.current
    const currentAgentId=record.id
    const result=await callLlmWithFallback("gemini-3.1-flash-lite-preview",{
      page:"home",max_tokens:4096,
      messages:[
        {role:"system",content:"你是 Agent 方案修改助手。按要求调整 name、goal、task_scope、deliverables、task_plan、done_criteria、roles、capability_requirements。严格返回 JSON，不要 Markdown。保留未要求修改的角色/能力配置；roles为空代表单助手，否则为顺序角色阶段，依赖不能成环，新增角色tools为空；现有角色 skill_refs 只允许人工编辑，AI 不得修改、授予或删除 Skill 绑定。能力建议仅使用附带目录的真实ID，不得假定连接可用。不得扩大 tools、knowledge_base_ids、quality_checks、审批或角色工具权限。"},
        {role:"user",content:JSON.stringify({name,...draft,modification:requestText,
          available_tools:toolCatalogForDesign(connectedTools,marketTools)})},
      ],
    })
    // A late result from an Agent that was closed or replaced is not a
    // revision of the new Agent, and must not clear its busy or error state.
    if(startedLoad!==loadSequence.current)return
    setRevising(false)
    if(currentRev!==revision.current || currentAgentId!==record?.id){
      setRevisionError("AI 生成期间方案或 Agent 已发生变化，本次旧修改建议未自动套用。")
      return
    }
    if(!result.ok || result.status!=="success"){
      setRevisionError("AI 修订暂时不可用；可以直接修改各项字段，不影响手动保存。")
      return
    }
    try {
      const text=String(result.text||"")
      const match=text.match(/\{[\s\S]*\}/)
      if(!match)throw Error("invalid result")
      const item=JSON.parse(match[0]) as Record<string,unknown>
      if(typeof item.goal!=="string"||typeof item.task_scope!=="string")throw Error("missing fields")
      const cleanList=(key:string)=>
        Array.isArray(item[key])?
          (item[key] as unknown[]).filter((entry):entry is string=>typeof entry==="string")
            .map(entry=>entry.slice(0,1200)).slice(0,40):draft[key as "deliverables"]
      const existingRoles=new Map((draft.roles||[]).map(role=>[role.id,role]))
      const proposedRoles=Array.isArray(item.roles)?preserveRoleSkillBindings(
        sanitizeAgentRoles(item.roles).map(role=>({...role,
          tools:existingRoles.get(role.id)?.tools.filter(tool=>draft.tools.includes(tool))||[],
        })),draft.roles||[]):draft.roles
      setRevisionProposal({name:typeof item.name==="string"?item.name.slice(0,90):name,basis:currentRev,spec:{
        ...draft,goal:(item.goal as string).slice(0,6000),
        task_scope:(item.task_scope as string).slice(0,6000),
        deliverables:cleanList("deliverables"),
        task_plan:cleanList("task_plan"),
        done_criteria:cleanList("done_criteria"),
        roles:proposedRoles,
        capability_requirements:Array.isArray(item.capability_requirements)?normalizeCapabilityRequirements(item.capability_requirements):draft.capability_requirements,
      }})
      setNotice("AI 修改建议已生成，请先核对预览，再应用到草稿。")
    }catch{setRevisionError("AI 修订结果格式无法核验，方案未被改动。")}
  }
  const close=async()=>{
    if(dirty && !persistUnsavedDraft() &&
      !await confirmInStudio("未能暂存草稿。直接关闭将丢失本次未保存的改动，确定关闭吗？"))return
    loadSequence.current++
    setSaving(false)
    setRevising(false)
    setRevisionError("")
    onClose()
  }
  const changeAgent=async(id:string)=>{
    if(id===record?.id)return
    if(dirty && !persistUnsavedDraft() &&
      !await confirmInStudio("草稿暂存失败，切换将丢失修改。确定切换吗？"))return
    void loadRecord(id)
  }

  return <AgentDraftDrawer open={open} onClose={close}
    title="随时调整 Agent 方案"
    description="从任何页面快速修改已保存的 Agent；保存后可以立即进入试跑。正在执行的任务不会被修改。">
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-secondary/40 p-3">
      <label htmlFor="quick-agent-select" className="text-xs font-semibold">当前 Agent</label>
      <select id="quick-agent-select" value={record?.id||""} disabled={loading||saving||!list.length}
        onChange={event=>changeAgent(event.target.value)}
        className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm">
        {list.length===0&&<option value="">暂无保存的 Agent</option>}
        {list.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
      </select>
      <button type="button" title="从服务器重新读取版本"
        onClick={()=>record&&loadRecord(record.id)} disabled={!record||loading||saving||dirty}
        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs disabled:opacity-40">
        <RefreshCcw className="h-3.5 w-3.5"/>刷新
      </button>
      {dirty?<span className="text-xs font-medium text-amber-600">未保存</span>:
        <span className="inline-flex items-center gap-1 text-xs text-primary"><ShieldCheck className="h-3.5 w-3.5"/>服务器版本</span>}
    </div>
    <AgentResourceReminder key={resourceReminder?.issuedAt||"empty"}
      reminder={resourceReminder} onDismiss={dismissResourceReminder}
      onLocate={()=>setResourceFocus(current=>requestAgentResourceFocus(current,record?.id||"",resourceReminder?.capabilityId||""))}
      capabilityName={resourceReminder?.capabilityId?
        agentCapabilityRequirements(draft).find(item=>item.id===resourceReminder.capabilityId)?.title:undefined}
      onRecheck={()=>matchTools()} />
    {pendingQuickDraft && !loading && <section aria-label="恢复快捷编辑草稿"
      className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h3 className="text-sm font-semibold">发现该 Agent 在本标签页有未提交的修改</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        草稿保存在本浏览器当前标签页，非服务器备份，最长保留 12 小时。
        {record && pendingQuickDraft.expectedUpdated!==record.updated
          ? "正式方案已有新版本，恢复后只能另存为副本，避免覆盖他人改动。"
          : "正式方案没有自动被草稿覆盖。"}请勿在 Agent 描述中粘贴密码或 API Key。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={restoreQuickDraft}
          className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">
          恢复我的修改
        </button>
        <button type="button" onClick={discardQuickDraft}
          className="min-h-10 rounded-lg border border-border bg-background px-4 text-xs">
          舍弃草稿并打开正式版本
        </button>
      </div>
    </section>}
    {draftStorageError && <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 p-3 text-xs text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0"/>当前标签页临时草稿暂存失败，请在离开前保存至服务器。
    </p>}
    {error&&<p role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">{notice}</p>}
    {nextTrialUrl&&<Link to={nextTrialUrl} target="_blank" rel="noopener noreferrer"
      className="mb-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-primary/30 px-3 text-xs font-semibold text-primary hover:bg-primary/5">
      在新标签试跑新版本 <ArrowRight className="h-3.5 w-3.5"/>
    </Link>}
    {loading&&<div role="status" className="flex items-center gap-2 py-10 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>正在读取 Agent 最新版本…</div>}
    {!loading&&!record&&<div className="rounded-xl border border-border p-5 text-sm">
      当前账号还没有可编辑的 Agent。请先到 <Link to="/agent-create" onClick={onClose} className="text-primary underline">创建 Agent</Link> 生成并保存方案。
    </div>}
    {!loading&&record&&!pendingQuickDraft&&<>
      <SpecEditorCard
        editorContextKey={editorSessionKey}
        resourceFocusToken={scopedResourceFocus.token}
        focusCapabilityId={scopedResourceFocus.token>0?scopedResourceFocus.capabilityId:undefined}
        spec={draft} specName={name} sourceMode={record.source==="template"?"template":"create"}
        onSpecChange={next=>{modified();setDraft(next)}}
        onSpecNameChange={value=>{setName(value);modified()}}
        onTextChange={updateText}
        onTogglePlanReview={on=>{modified();setDraft(prev=>({...prev,require_plan_review:on}))}}
        onListItemChange={listChange} onListItemAdd={listAdd} onListItemRemove={listRemove}
        toolStatusOf={toolStatusOf} builtinTools={BUILTIN_TOOL_OPTIONS}
        connectedTools={connectedTools} connectedMarketTools={marketTools}
        toolAnalysis={analysis} toolMatchNotice={toolNotice} onRematchTools={matchTools}
        knowledgeBases={knowledge} onToggleKnowledgeBase={toggleKb}
        onToggleTool={toggleTool} reviseInput={reviseInstruction}
        onReviseInputChange={value=>{setReviseInstruction(value);setRevisionError("")}} onRevise={()=>void revise()}
        isRevising={revising} editorError={revisionError} onSave={()=>void save()} isSaving={saving}
        revisionProposal={revisionProposal}
        onApplyRevision={()=>{
          if(!revisionProposal)return
          if(revisionProposal.basis!==revision.current){setRevisionProposal(null);setRevisionError("方案已有新修改，请重新生成建议。");return}
          setDraft(revisionProposal.spec);setName(revisionProposal.name);modified();setReviseInstruction("")
        }}
        onDiscardRevision={()=>{setRevisionProposal(null);setRevisionError("")}}
        dirty={dirty} saveConflict={conflict} onSaveAsCopy={()=>void save(true)}
        savedMsg={notice} savedSpecId={record.id} onClear={()=>{}}
        showClear={false} compactActions
      />
      <div className="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {dirty?"有待保存的修改。只有保存成功，下一次试跑才会使用它。":"已读取服务器正式版本；随时可以前往试跑。"}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={()=>void save()} disabled={saving||!dirty}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-primary/40 px-3 text-xs font-semibold text-primary disabled:opacity-40">
            <Save className="h-4 w-4"/>保存方案
          </button>
          <button type="button" onClick={()=>void saveAndTest()} disabled={saving||revising}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40">
            保存并进入试跑 <ArrowRight className="h-4 w-4"/>
          </button>
        </div>
      </div>
    </>}
  </AgentDraftDrawer>
}
