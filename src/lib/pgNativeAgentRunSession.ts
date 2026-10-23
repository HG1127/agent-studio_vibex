// One employee/API lifetime. Retain recovery requests, never hidden result data.
import {PgNativePilotError,type PgNativeRun,type PgNativeRunDetail,type createPgNativePilotApi} from "./pgNativePilotApi.ts"
import {createPgNativeRunSubmission,type RunDraft,type PendingRun} from "./pgNativeRunSubmission.ts"

type Api=Pick<ReturnType<typeof createPgNativePilotApi>,"listRuns"|"getRun"|"submitRun"|"decideModel">
export type AgentRunDecision=Readonly<{id:string;value:"approved"|"rejected"}>
export type AgentRunView={runs:PgNativeRun[];detail:PgNativeRunDetail|null;pending:PendingRun|null;
  decision:AgentRunDecision|null;busy:boolean;loading:boolean;error:string;notice:string}
export function emptyAgentRunView():AgentRunView{return {runs:[],detail:null,pending:null,decision:null,busy:false,loading:false,error:"",notice:""}}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const statuses=new Set(["queued","running","awaiting_approval","paused","succeeded","failed","cancelled"])
export function agentRunError(error:unknown){
  if(error instanceof PgNativePilotError){
    if(error.status===401)return "登录已失效，请重新登录。"
    if(error.status===403||error.status===405)return "当前账号或环境未授权此操作。"
    if(error.status===404)return "此记录不存在，或不属于当前员工。"
    if(error.status===409)return "任务状态或模型配置已经变化，请刷新核对。"
    if(error.status===429)return "操作过于频繁，请稍后再试。"
  }
  return "请求结果暂未确认，请刷新状态或确认上次操作。"
}
function checkedRun(run:PgNativeRun,id?:string){
  if(!run||!uuid.test(run.id)||id&&run.id!==id||!uuid.test(run.agent_spec_id)||
    !statuses.has(run.status)||typeof run.instruction!=="string"||typeof run.result_text!=="string"||
    !run.checkpoint||typeof run.checkpoint!=="object"||Array.isArray(run.checkpoint))throw Error("unconfirmed_agent_run")
  return run
}
function checkedDetail(detail:PgNativeRunDetail,id:string){
  checkedRun(detail?.run,id)
  if(!Array.isArray(detail.steps)||detail.approval!==null&&(!detail.approval||detail.approval.step_key!=="model"||
    !["pending","approved","rejected"].includes(detail.approval.status)))throw Error("unconfirmed_agent_detail")
  return detail
}
export function createPgNativeAgentRunSession(api:Api,options:{key?:()=>string}={}){
  let state=emptyAgentRunView(),active=false,closed=false,ticket=0,selected:string|null=null,flight:Promise<void>|null=null
  const submission=createPgNativeRunSubmission(options.key),listeners=new Set<()=>void>()
  const submitApi={submitRun:async(...args:Parameters<Api["submitRun"]>)=>{
    const outcome=await api.submitRun(...args)
    checkedRun(outcome?.run)
    return outcome
  }}
  const update=(patch:Partial<AgentRunView>)=>{if(!closed){state={...state,...patch};for(const listener of listeners)listener()}}
  const expired=(error:unknown)=>{
    if(!(error instanceof PgNativePilotError)||error.status!==401)return false
    ++ticket;selected=null;active=false;submission.dispose()
    update({...emptyAgentRunView(),error:agentRunError(error)});closed=true;listeners.clear();return true
  }
  async function refresh(id=selected){
    if(closed||!active)return
    const read=++ticket
    // A refresh is a new authorization read. Clear the previous payload while
    // waiting, including when a different task or workspace tab was selected.
    update({runs:[],detail:null,loading:true,error:""})
    try{
      const [runs,detail]=await Promise.all([api.listRuns(),id?api.getRun(id):Promise.resolve(null)])
      if(closed||!active||read!==ticket)return
      if(!Array.isArray(runs))throw Error("unconfirmed_agent_history")
      for(const run of runs)checkedRun(run)
      if(detail)checkedDetail(detail,id!)
      const decision=state.decision
      const confirmed=decision?.id===detail?.run.id&&["approved","rejected"].includes(detail?.approval?.status??"")
      update({runs:runs.slice(0,50),detail,...(confirmed?{decision:null,notice:detail!.approval!.status===decision!.value?
        "已确认上次审批。":"此步骤已由当前账号的另一操作决定，已更新为最新状态。"}:{})})
    }catch(error){if(!closed&&active&&read===ticket&&!expired(error))update({runs:[],detail:null,error:agentRunError(error)})}
    finally{if(!closed&&read===ticket)update({loading:false})}
  }
  function perform(work:()=>Promise<void>){
    if(closed||!active)return Promise.resolve()
    if(flight)return flight
    ++ticket;update({busy:true,loading:false,error:"",notice:""})
    flight=Promise.resolve().then(work).finally(()=>{flight=null;update({busy:false})})
    return flight
  }
  return {
    snapshot:()=>state,
    subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener)}},
    dispose(){closed=true;active=false;++ticket;selected=null;submission.dispose();state=emptyAgentRunView();listeners.clear()},
    setActive(value:boolean){
      if(closed)return Promise.resolve()
      active=value
      if(value)return refresh()
      ++ticket;update({runs:[],detail:null,loading:false});return Promise.resolve()
    },
    refresh,
    select(id:string){if(!uuid.test(id)||state.busy||state.decision)return Promise.resolve();selected=id;return refresh(id)},
    submit(draft:RunDraft){
      if(state.decision)return Promise.resolve()
      return perform(async()=>{
        const operation=submission.submit(submitApi,draft);update({pending:submission.pending()})
        try{
          const outcome=await operation
          if(closed)return
          checkedRun(outcome.run)
          ++ticket;selected=outcome.run.id
          update({pending:null,runs:[],detail:null,notice:outcome.replayed?"已确认上次提交，未创建重复任务。":"任务已提交，模型步骤需要另行审批。"})
          // POST responses can predate a revoke while a tab is hidden. Use
          // only their identifier; display data must come from a fresh GET.
          if(active)await refresh()
        }catch(error){if(!closed&&!expired(error))update({pending:submission.pending(),error:agentRunError(error)})}
      })
    },
    decide(value:"approved"|"rejected",consented=false){
      const detail=state.detail
      if(state.pending||!detail||detail.approval?.status!=="pending"||detail.run.status!=="awaiting_approval"||
        !["approved","rejected"].includes(value)||value==="approved"&&!consented)return Promise.resolve()
      const previous=state.decision
      if(previous&&(previous.id!==detail.run.id||previous.value!==value))return Promise.resolve()
      const request=previous??Object.freeze({id:detail.run.id,value})
      return perform(async()=>{
        update({decision:request})
        try{
          const outcome=await api.decideModel(request.id,request.value)
          if(closed)return
          checkedRun(outcome?.run,request.id)
          if(typeof outcome.replayed!=="boolean"||outcome.approval!==request.value)throw Error("unconfirmed_agent_decision")
          ++ticket;update({decision:null,detail:null,runs:[],notice:value==="approved"?
            "已批准模型步骤，后台处理可能产生费用。":"已拒绝模型步骤。"})
          if(active)await refresh()
        }catch(error){if(!closed&&!expired(error))update({error:agentRunError(error)})}
      })
    },
  }
}
