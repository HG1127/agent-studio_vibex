// Shared employee-lifetime recovery for Native Workflow and standalone Agent runs.
// Fixed adapters select the protocol. No storage, credentials, timers or executors.
import {PgNativePilotError} from "./pgNativePilotApi.ts"
import {isOwnTaskTarget,type OwnTaskRunTarget} from "./pgNativeOwnTaskNavigation.ts"
import {agentHumanChoice,agentHumanReceipt,agentHumanProjection,type AgentHumanResponse,type PgNativeAgentHumanInput,type PgNativeAgentHumanReceipt} from "./pgNativeAgentHumanInput.ts"
import {usesPaidKnowledge} from "./pgNativeKnowledgeTool.ts"
import {KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT} from "../../services/pg-api/src/knowledge-retrieval-binding.ts"
export type DurableDetail={execution_mode:string;replayed:boolean;knowledge_outputs_available?:boolean;run:{id:string;status:string;instruction:string;result_text:string};
  human_input_evidence_current?:boolean;human_input_current?:boolean;human_input?:PgNativeAgentHumanInput|null;
  approvals:Array<{step_key:string;status:string}>;steps:unknown[];pending_effect:{step_key:string;input_sha256:string;kind?:string;configuration?:Record<string,unknown>}|null;
  decision_confirmation?:{run_id:string;step_key:string;input_sha256:string;status:string}}
export type DurableSummary={id:string;status:string;instruction_preview:string;result_preview:string}
type Mutation=Readonly<{kind:"decision";id:string;decision:"approved"|"rejected";step:string;hash:string;knowledge_query_charge?:typeof KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT}|{kind:"cancel";id:string}>
export type PendingHumanResponse=Readonly<{runId:string;choice:Readonly<AgentHumanResponse>}>
export type DurableRunView<R,S,D>={runs:S[];detail:R|null;pendingSubmit:Readonly<D&{key:string}>|null;pendingMutation:Mutation|null;pendingHumanResponse:PendingHumanResponse|null;
  busy:boolean;loading:boolean;error:string;notice:string}
export function emptyDurableRunView<R,S,D>():DurableRunView<R,S,D>{return {runs:[],detail:null,pendingSubmit:null,pendingMutation:null,pendingHumanResponse:null,busy:false,loading:false,error:"",notice:""}}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const terminal=new Set(["succeeded","failed","cancelled"]),definite=new Set([400,401,403,404,405,409,413,415,422,429])
export function createPgNativeDurableRunSession<TDraft extends object,TResult extends DurableDetail,TSummary extends DurableSummary>(api:{
  list():Promise<TSummary[]>;get(id:string):Promise<TResult>;submit(body:Readonly<TDraft&{key:string}>):Promise<TResult>;
  decide(id:string,decision:"approved"|"rejected",step:string,hash:string,charge?:typeof KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT):Promise<TResult>;cancel(id:string):Promise<TResult>;
  respond?(id:string,choice:AgentHumanResponse):Promise<PgNativeAgentHumanReceipt>;confirmHumanResponse?(id:string,choice:AgentHumanResponse):Promise<PgNativeAgentHumanReceipt>
},options:{freezeDraft:(draft:TDraft)=>TDraft;acceptSubmit:(result:TResult,body:TDraft)=>boolean;acceptDetail:(result:TResult)=>boolean;
  submittedNotice:string;describe:(error:unknown)=>string;key?:()=>string;responseKey?:()=>string;onExpired?:()=>void;canApprove?:(detail:TResult)=>boolean;
  validateOriginal?:(target:OwnTaskRunTarget,detail:TResult)=>Promise<void>}){
  const checked=(value:TResult,id?:string)=>{
    if(!value||!uuid.test(value.run?.id??"")||id&&value.run.id!==id||!Array.isArray(value.approvals)||!Array.isArray(value.steps)||
       typeof value.replayed!=="boolean"||value.knowledge_outputs_available!==undefined&&typeof value.knowledge_outputs_available!=="boolean"||!options.acceptDetail(value))throw Error("unconfirmed_durable_response")
    return agentHumanProjection(value)
  }
  let state:DurableRunView<TResult,TSummary,TDraft>=emptyDurableRunView(),closed=false,active=false,ticket=0,selected:string|null=null
  let uncertain=false,flight:Promise<void>|null=null
  let originalTarget:OwnTaskRunTarget|null=null
  const listeners=new Set<()=>void>()
  const update=(patch:Partial<DurableRunView<TResult,TSummary,TDraft>>)=>{if(!closed){state={...state,...patch};for(const listener of listeners)listener()}}
  const expired=(error:unknown)=>{
    if(error instanceof PgNativePilotError&&error.status===401){
      selected=null;++ticket;update({...emptyDurableRunView<TResult,TSummary,TDraft>(),error:options.describe(error)});uncertain=false;active=false;closed=true;listeners.clear();options.onExpired?.();return true
    }return false
  }
  const confirmMutation=(detail:TResult)=>{
    const pending=state.pendingMutation
    if(pending?.id!==detail.run.id)return
    const approval=pending.kind==="decision"?detail.approvals.find(a=>a.step_key===pending.step):undefined
    if(pending.kind==="cancel"?terminal.has(detail.run.status):approval&&["approved","rejected"].includes(approval.status)){
      uncertain=false;update({pendingMutation:null,notice:pending.kind==="cancel"&&detail.run.status!=="cancelled"?
        "任务已经结束，无法再取消。":pending.kind==="decision"&&approval?.status!==pending.decision?
          "此步骤已由当前账号的另一操作决定，已更新为最新状态。":"已确认上次操作。"})
    }
  }
  async function refresh(id=selected,background=false):Promise<void>{
    if(closed||!active)return
    const expected=originalTarget?.runId===id?originalTarget:null
    const read=++ticket;if(!background)update({loading:true,...(expected?{detail:null}:{}),error:""})
    try{
      const [runs,detail]=await Promise.all([background?Promise.resolve(state.runs):api.list(),id?api.get(id):Promise.resolve(null)])
      if(closed||!active||read!==ticket)return
      if(!Array.isArray(runs)||runs.some(run=>!run||!uuid.test(run.id)||typeof run.status!=="string"||typeof run.instruction_preview!=="string"))throw Error("invalid_autonomous_history")
      if(detail){checked(detail,id!);if(expected){if(!options.validateOriginal)throw Error("original_task_source_unconfirmed");await options.validateOriginal(expected,detail)}}
      if(closed||!active||read!==ticket)return
      selected=id
      update({runs:runs.slice(0,50).map(row=>background&&row.id===detail?.run.id?{...row,status:detail.run.status,result_preview:detail.run.result_text.slice(0,240)}:row),detail,error:""})
      if(detail)confirmMutation(detail)
    }catch(error){if(!closed&&active&&read===ticket&&!expired(error))update({runs:[],detail:null,error:options.describe(error)})}
    finally{if(!closed&&read===ticket&&!background)update({loading:false})}
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
    navigationBlocked:()=>!closed&&Boolean(state.busy||state.loading||state.pendingSubmit||state.pendingMutation||state.pendingHumanResponse||flight),
    subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn)}},
    dispose(){closed=true;active=false;++ticket;selected=null;state={...emptyDurableRunView<TResult,TSummary,TDraft>()};listeners.clear()},
    setActive(value:boolean){if(closed)return;active=value;if(value)void refresh();else{++ticket;update({loading:false,detail:null,runs:[]})}},
    refresh,
    poll(){return selected&&!state.busy&&!state.loading&&!state.pendingSubmit&&!state.pendingMutation&&!state.pendingHumanResponse?refresh(selected,true):Promise.resolve()},
    select(id:string){if(!uuid.test(id)||state.busy||state.pendingSubmit||state.pendingMutation||state.pendingHumanResponse)return Promise.resolve();originalTarget=null;return refresh(id)},
    async selectOriginal(target:OwnTaskRunTarget){
      if(closed||!active||!isOwnTaskTarget(target)||state.busy||state.pendingSubmit||state.pendingMutation||state.pendingHumanResponse)return false
      originalTarget=target;selected=target.runId;await refresh(target.runId)
      return !closed&&active&&originalTarget===target&&state.detail?.run.id===target.runId&&!state.error
    },
    submit(draft:TDraft){
      if(state.pendingMutation||state.pendingHumanResponse)return Promise.resolve()
      return perform(async()=>{
        if(!state.pendingSubmit){
          try{update({pendingSubmit:Object.freeze({...options.freezeDraft(draft),key:options.key?.()??"pg_run_"+crypto.randomUUID().replaceAll("-","")})})}
          catch{update({error:"请核对任务、绑定版本和执行范围。"});return}
        }
        const body=state.pendingSubmit!
        try{
          const result=checked(await api.submit(body))
          if(closed)return
          if(!options.acceptSubmit(result,body))throw Error("unconfirmed_autonomous_submission")
          ++ticket;selected=result.run.id;uncertain=false;update({pendingSubmit:null,detail:active?result:null,notice:result.replayed?"已确认上次提交，未创建重复任务。":options.submittedNotice})
          if(active)await refresh()
        }catch(error){
          if(closed||expired(error))return
          if(!uncertain&&error instanceof PgNativePilotError&&definite.has(error.status))update({pendingSubmit:null});else uncertain=true
          update({error:options.describe(error)})
        }
      })
    },
    decide(decision:"approved"|"rejected",consented=false,knowledgeConsented=false){
      const detail=state.detail,pending=detail?.pending_effect
      if(state.pendingHumanResponse||state.pendingSubmit||!detail||detail.run.status!=="awaiting_approval"||!pending||!["approved","rejected"].includes(decision)||decision==="approved"&&!consented)return Promise.resolve()
      if(decision==="approved"&&detail.knowledge_outputs_available===false)return Promise.resolve()
      if(decision==="approved"&&options.canApprove&&!options.canApprove(detail))return Promise.resolve()
      const paid=decision==="approved"&&usesPaidKnowledge(pending)
      if(paid&&!knowledgeConsented)return Promise.resolve()
      const request:Mutation=Object.freeze({kind:"decision",id:detail.run.id,decision,step:pending.step_key,hash:pending.input_sha256,
        ...(paid?{knowledge_query_charge:KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT}:{})})
      return mutate(request)
    },
    cancel(){const id=state.detail?.run.id;if(!id||state.pendingHumanResponse||state.pendingSubmit||terminal.has(state.detail!.run.status))return Promise.resolve();return mutate(Object.freeze({kind:"cancel",id}))},
    retryMutation(){return state.pendingMutation?mutate(state.pendingMutation):Promise.resolve()},
    respond(decision:AgentHumanResponse["decision"],answer:string,consented=false){
      const detail=state.detail,pending=detail?.human_input
      if(!consented||!api.respond||state.pendingSubmit||state.pendingMutation||state.pendingHumanResponse||!pending||detail?.run.status!=="awaiting_input"||detail.human_input_current!==true)return Promise.resolve()
      if(pending.kind==="clarification"?decision!=="reply":decision==="reply")return Promise.resolve()
      let choice:AgentHumanResponse
      try{choice=agentHumanChoice({request_id:options.responseKey?.()??crypto.randomUUID(),pending_step_key:pending.pending_step_key,
        pending_sha256:pending.pending_sha256,source_sha256:pending.source_sha256,decision,answer,confirm:true})}
      catch{update({error:"请核对当前问题和回复内容，最多1600字。"});return Promise.resolve()}
      return humanResponse(Object.freeze({runId:detail.run.id,choice:Object.freeze(choice)}),false)
    },
    retryHumanResponse(){return state.pendingHumanResponse?humanResponse(state.pendingHumanResponse,true):Promise.resolve()},
  }
  function humanResponse(next:PendingHumanResponse,confirmOnly:boolean):Promise<void>{
    return perform(async()=>{
      const request=state.pendingHumanResponse??next
      update({pendingHumanResponse:request})
      try{
        const call=confirmOnly?api.confirmHumanResponse:api.respond
        if(!call)throw Error("agent_human_response_unavailable")
        const result=await call(request.runId,request.choice)
        if(closed)return
        agentHumanReceipt(result,request.runId,request.choice,confirmOnly)
        ++ticket;selected=request.runId;update({pendingHumanResponse:null,notice:confirmOnly?"已核对原回复登记，后续执行继续受原有权限和费用确认约束。":"回复已登记，后续执行继续受原有权限和费用确认约束。"})
        if(active)await refresh()
      }catch(error){
        if(closed||expired(error))return
        if(confirmOnly&&error instanceof PgNativePilotError&&error.status===404&&error.code==="agent_human_response_not_found"){
          update({pendingHumanResponse:null,notice:"原回复未登记，已刷新当前问题。请重新核对后提交。"});if(active)await refresh();return
        }
        if(!confirmOnly&&error instanceof PgNativePilotError&&definite.has(error.status))update({pendingHumanResponse:null})
        update({error:options.describe(error)})
      }
    })
  }
  function mutate(next:Mutation):Promise<void>{
    if(state.pendingMutation&&JSON.stringify(state.pendingMutation)!==JSON.stringify(next))return Promise.resolve()
    return perform(async()=>{
      const request=state.pendingMutation??next;update({pendingMutation:request})
      try{
        const result=checked(await(request.kind==="cancel"?api.cancel(request.id):request.knowledge_query_charge?
          api.decide(request.id,request.decision,request.step,request.hash,request.knowledge_query_charge):api.decide(request.id,request.decision,request.step,request.hash)),request.id)
        if(closed)return
        const proof=result.decision_confirmation
        const confirmed=request.kind==="cancel"?result.run.status==="cancelled":
          proof?.run_id===request.id&&proof.step_key===request.step&&proof.input_sha256===request.hash&&proof.status===request.decision||
          result.approvals.some(a=>a.step_key===request.step&&a.status===request.decision)
        if(!confirmed)throw Error("unconfirmed_autonomous_decision")
        ++ticket;uncertain=false;update({detail:active?result:null,pendingMutation:null,notice:request.kind==="cancel"?"任务已取消。":request.decision==="approved"?"已批准当前步骤。":"已拒绝当前步骤。"});if(active)await refresh()
      }catch(error){
        if(closed||expired(error))return
        if(!uncertain&&error instanceof PgNativePilotError&&definite.has(error.status))update({pendingMutation:null});else uncertain=true
        update({error:options.describe(error)})
      }
    })
  }
}
