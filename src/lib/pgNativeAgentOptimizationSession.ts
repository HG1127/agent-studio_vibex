import {PgNativePilotError,type createPgNativePilotApi,type PgNativeFeedbackStatus} from "./pgNativePilotApi.ts"
import {optimizationRoleSpec,optimizationDraft,optimizationChoice,optimizationPreview,optimizationReceipt,type PgNativeOptimizationDraft,type PgNativeOptimizationChoice,type PgNativeOptimizationPreview,type PgNativeOptimizationHistory} from "./pgNativeAgentOptimization.ts"
import {canonicalMcpJson} from "../../services/pg-api/src/mcp-catalog.ts"

type Api=Pick<ReturnType<typeof createPgNativePilotApi>,"getAgent"|"getAgentCollaboration"|"getAgentFeedback"|"getAgentOptimizations"|"previewAgentOptimization"|"acceptAgentOptimization"|"confirmAgentOptimization">
type Role={id:string;name:string;spec:ReturnType<typeof optimizationRoleSpec>;revision:number;source_sha256:string}
export type OptimizationView={runId:string|null;role:Role|null;feedback:PgNativeFeedbackStatus|null;history:PgNativeOptimizationHistory|null;preview:PgNativeOptimizationPreview|null;loading:boolean;busy:boolean;canAccept:boolean;pending:{request_id:string;run_id:string;spec_id:string}|null;error:string;notice:string}
export const emptyOptimizationView=():OptimizationView=>({runId:null,role:null,feedback:null,history:null,preview:null,loading:false,busy:false,canAccept:false,pending:null,error:"",notice:""})
function freeze<T>(v:T):T{if(v&&typeof v==="object"){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
// Scoped to one authenticated employee. Ambiguous original bodies remain only
// in this closure, across tabs/capability outages, until confirmation or logout.
export function createPgNativeOptimizationSession(api:Api,{key=()=>crypto.randomUUID(),onExpired=()=>{},onChanged=()=>{}}:{key?:()=>string;onExpired?:()=>void;onChanged?:()=>void}={}){
  let active=false,available=false,accepting=false,disposed=false,epoch=0,reads=0
  let runId:string|null=null,role:Role|null=null,feedback:PgNativeFeedbackStatus|null=null,history:PgNativeOptimizationHistory|null=null,preview:PgNativeOptimizationPreview|null=null,draft:PgNativeOptimizationDraft|null=null
  let loading=false,busy=false,error="",notice="",pending:{body:PgNativeOptimizationChoice;ambiguous:boolean}|null=null,flight:Promise<void>|null=null
  const listeners=new Set<()=>void>(),emit=()=>listeners.forEach(fn=>fn()),visible=()=>active&&available&&!disposed,current=(scope:number)=>visible()&&scope===epoch
  const snapshot=():OptimizationView=>!visible()?emptyOptimizationView():structuredClone({runId,role,feedback,history,preview,loading,busy,canAccept:accepting,pending:pending?{request_id:pending.body.request_id,run_id:pending.body.run_id,spec_id:pending.body.spec_id}:null,error,notice})
  const dispose=()=>{if(disposed)return;disposed=true;active=false;epoch++;reads++;runId=null;role=null;feedback=null;history=null;preview=null;draft=null;pending=null;flight=null;loading=false;busy=false;error="";notice="";emit();listeners.clear()}
  const expired=(cause:unknown)=>{if(!(cause instanceof PgNativePilotError)||cause.status!==401)return false;dispose();onExpired();return true}
  const load=async(afterMutation=false)=>{
    if(!visible()||!runId||pending||busy&&!afterMutation)return
    const scope=epoch,ticket=++reads,id=runId;loading=true;error="";preview=null;draft=null;emit()
    try{
      const status=await api.getAgentFeedback(id)
      if(!current(scope)||ticket!==reads||runId!==id)return
      const [agent,collaboration,links]=await Promise.all([api.getAgent(status.spec_id),api.getAgentCollaboration(status.spec_id),api.getAgentOptimizations(status.spec_id)])
      if(!current(scope)||ticket!==reads||runId!==id)return
      const normalized=optimizationRoleSpec(agent.spec,true)
      if(status.run_id!==id||agent.id!==status.spec_id||collaboration.id!==agent.id||collaboration.role!=="owner"||agent.name!==collaboration.name||agent.revision!==collaboration.revision||links.spec_id!==agent.id||!["goal","task_scope","deliverables","task_plan","done_criteria"].every(k=>canonicalMcpJson(normalized[k as keyof typeof normalized])===canonicalMcpJson(collaboration.safe[k as keyof typeof collaboration.safe])))throw Error("changed_role_source")
      role={...agent,spec:normalized,source_sha256:collaboration.source_sha256};feedback=status;history=links
    }catch(cause){if(current(scope)&&ticket===reads&&!expired(cause)){role=null;feedback=null;history=null;error="反馈与角色来源暂无法同时核对，请刷新。"}}
    finally{if(current(scope)&&ticket===reads){loading=false;emit()}}
  }
  const apply=(confirmOnly:boolean):Promise<void>=>{
    if(flight)return flight
    if(!visible()||!pending)return Promise.resolve()
    const value=pending,scope=epoch;busy=true;loading=false;reads++;error="";emit()
    const work=(async()=>{
      try{
        await optimizationReceipt(await(confirmOnly?api.confirmAgentOptimization(value.body):api.acceptAgentOptimization(value.body)),value.body,confirmOnly)
        if(!current(scope)||pending!==value)return
        pending=null;preview=null;draft=null;role=null;feedback=null;history=null;notice="角色修改已记录，可在接受记录中核对反馈与版本。"
        onChanged();await load(true)
      }catch(cause){
        if(!current(scope)||pending!==value||expired(cause))return
        const definitive=cause instanceof PgNativePilotError&&[400,403,404,405,409].includes(cause.status)
        if(!confirmOnly&&definitive&&!value.ambiguous){pending=null;preview=null;draft=null}
        else value.ambiguous=true
        error=confirmOnly&&cause instanceof PgNativePilotError&&cause.status===404?"尚未查到原接受记录，可明确重交同一请求。":pending?"修改结果尚未确认，请核对原请求；原候选已保留。":"反馈、角色或权限已变化，请刷新后重新预览。"
      }finally{if(current(scope)){busy=false;emit()}}
    })()
    const finished=work.finally(()=>{if(flight===finished)flight=null});flight=finished;return finished
  }
  const changeVisibility=()=>{epoch++;reads++;role=null;feedback=null;history=null;preview=null;draft=null;loading=false;busy=false;flight=null;if(pending)pending.ambiguous=true;error="";notice="";emit();if(visible())void load()}
  return {
    navigationBlocked:()=>!disposed&&Boolean(busy||loading||pending||flight),
    snapshot,dispose,refresh:()=>load(),subscribe(fn:()=>void){if(!disposed)listeners.add(fn);return()=>listeners.delete(fn)},
    setActive(value:boolean){if(disposed||active===value)return;active=value;changeVisibility()},
    setScopes(value:{available:boolean;accept:boolean}){if(disposed)return;const changed=available!==(value.available===true);available=value.available===true;accepting=available&&value.accept===true;if(changed)changeVisibility();else emit()},
    async select(id:string|null){
      if(disposed)return
      if(id!==null&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)){error="任务编号无效。";emit();return}
      id=id?.toLowerCase()??null
      if(pending){if(id!==pending.body.run_id&&visible()){error="请先核对原任务的角色接受请求。";emit()}return}
      reads++;runId=id;role=null;feedback=null;history=null;preview=null;draft=null;loading=false;busy=false;error="";notice="";emit();await load()
    },
    invalidatePreview(){if(disposed||pending||busy)return;reads++;preview=null;draft=null;error="";notice="";emit()},
    async prepare(value:{name:string;spec:unknown}){
      if(!visible()||pending||busy||loading||!role||!feedback?.current?.body||feedback.state!=="active"||feedback.spec_id!==role.id)return
      const scope=epoch,ticket=++reads;busy=true;preview=null;draft=null;error="";notice="";emit()
      try{
        const proposed=freeze(optimizationDraft({action:"preview",spec_id:role.id,run_id:feedback.run_id,feedback_id:feedback.current.feedback_id,expected_feedback_sha256:feedback.current.feedback_sha256,expected_spec_revision:role.revision,expected_spec_sha256:role.source_sha256,name:value.name,spec:value.spec}))
        const result=await optimizationPreview(await api.previewAgentOptimization(proposed),proposed)
        if(current(scope)&&ticket===reads){draft=proposed;preview=result}
      }catch(cause){if(current(scope)&&ticket===reads&&!expired(cause))error="无法预览这次修改，请核对当前反馈、角色版本和修改内容。"}
      finally{if(current(scope)&&ticket===reads){busy=false;emit()}}
    },
    accept(confirmed:boolean):Promise<void>{
      if(flight)return flight
      if(!visible()||pending||busy||loading||!accepting||confirmed!==true||!preview||!draft)return Promise.resolve()
      pending={body:freeze(optimizationChoice({...structuredClone(draft),action:"accept",request_id:key(),confirm:true})),ambiguous:false}
      return apply(false)
    },
    confirm:()=>apply(true),retrySameRequest:()=>apply(false),
  }
}
