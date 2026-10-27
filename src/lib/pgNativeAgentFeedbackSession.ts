import {PgNativePilotError,type createPgNativePilotApi,type PgNativeFeedbackChoice,type PgNativeFeedbackStatus} from "./pgNativePilotApi.ts"
import {agentFeedbackChoice,agentFeedbackReceipt} from "./pgNativeAgentFeedback.ts"
type Api=Pick<ReturnType<typeof createPgNativePilotApi>,"getAgentFeedback"|"changeAgentFeedback"|"confirmAgentFeedback">
type Submission={rating:"up"|"down";tags:string[];comment:string;remember_lesson:boolean}
export type FeedbackView={runId:string|null;status:PgNativeFeedbackStatus|null;loading:boolean;busy:boolean;canSubmit:boolean;canStoreLesson:boolean;pending:{run_id:string;request_id:string;action:PgNativeFeedbackChoice["action"]}|null;error:string;notice:string}
export const emptyFeedbackView=():FeedbackView=>({runId:null,status:null,loading:false,busy:false,canSubmit:false,canStoreLesson:false,pending:null,error:"",notice:""})
// One employee lifetime. Exact ambiguous bodies stay in memory only; public
// snapshots expose IDs, never the original credential-bearing text intent.
export function createPgNativeFeedbackSession(api:Api,{key=()=>crypto.randomUUID(),onExpired=()=>{}}:{key?:()=>string;onExpired?:()=>void}={}){
  let active=false,available=false,submitting=false,lessons=false,disposed=false,epoch=0,reads=0
  let runId:string|null=null,status:PgNativeFeedbackStatus|null=null,loading=false,busy=false,error="",notice=""
  let pending:{body:PgNativeFeedbackChoice;ambiguous:boolean}|null=null,flight:Promise<void>|null=null
  const listeners=new Set<()=>void>(),emit=()=>listeners.forEach(fn=>fn()),visible=()=>active&&available&&!disposed,current=(scope:number)=>visible()&&scope===epoch
  const snapshot=():FeedbackView=>!visible()?emptyFeedbackView():structuredClone({runId,status,loading,busy,canSubmit:submitting,canStoreLesson:lessons,pending:pending?{run_id:pending.body.run_id,request_id:pending.body.request_id,action:pending.body.action}:null,error,notice})
  const dispose=()=>{if(disposed)return;disposed=true;active=false;epoch++;reads++;runId=null;status=null;pending=null;flight=null;loading=false;busy=false;error="";notice="";emit();listeners.clear()}
  const expired=(cause:unknown)=>{if(!(cause instanceof PgNativePilotError)||cause.status!==401)return false;dispose();onExpired();return true}
  const load=async(afterMutation=false)=>{
    if(!visible()||!runId||busy&&!afterMutation||pending)return
    const scope=epoch,ticket=++reads,id=runId;loading=true;error="";emit()
    try{const value=await api.getAgentFeedback(id);if(current(scope)&&ticket===reads&&runId===id){if(value.run_id!==id)throw new PgNativePilotError(503,"invalid_agent_feedback_projection");status=value}}
    catch(cause){if(current(scope)&&ticket===reads&&!expired(cause)){status=null;error="反馈状态暂不可用，请刷新核对。"}}
    finally{if(current(scope)&&ticket===reads){loading=false;emit()}}
  }
  const apply=(confirmOnly:boolean):Promise<void>=>{
    if(flight)return flight
    if(!visible()||!pending)return Promise.resolve()
    const value=pending,scope=epoch;busy=true;loading=false;reads++;error="";emit()
    const work=(async()=>{
      try{
        const receipt=await agentFeedbackReceipt(await(confirmOnly?api.confirmAgentFeedback(value.body):api.changeAgentFeedback(value.body)),value.body,confirmOnly)
        if(!current(scope)||pending!==value)return
        pending=null;status=null
        notice=value.body.action==="erase_feedback"?"反馈及其全部反馈教训已删除。":value.body.action==="forget_lesson"?"已忘记这条教训，反馈仍保留。":
          receipt.lesson_result?.decision==="stored"?"反馈已记录，教训已保存。":receipt.lesson_result?.decision==="not_requested"?"反馈已记录。":
          receipt.lesson_result===null?"反馈已记录；教训保存结果尚未确认，原请求不会重试保存。":"反馈已记录；本次教训未保存。"
        await load(true)
      }catch(cause){
        if(!current(scope)||pending!==value||expired(cause))return
        const definitive=cause instanceof PgNativePilotError&&[400,403,404,405,409].includes(cause.status)
        if(!confirmOnly&&definitive&&!value.ambiguous)pending=null
        else value.ambiguous=true
        error=confirmOnly&&cause instanceof PgNativePilotError&&cause.status===404?"尚未查到原回执，可重交同一原请求。":
          pending?"结果尚未确认，请核对原请求；原文和原选择已保留。":"反馈或来源已变化，请刷新后重新核对。"
      }finally{if(current(scope)){busy=false;emit()}}
    })()
    const finished=work.finally(()=>{if(flight===finished)flight=null});flight=finished;return finished
  }
  const start=(raw:PgNativeFeedbackChoice):Promise<void>=>{
    if(flight)return flight
    if(!visible()||pending||busy||loading||!status||status.run_id!==runId)return Promise.resolve()
    try{
      const body=agentFeedbackChoice(structuredClone(raw));if(body.action==="submit")Object.freeze(body.tags)
      Object.freeze(body);pending={body,ambiguous:false}
    }catch{error="请重新核对反馈、来源与确认选项。";emit();return Promise.resolve()}
    return apply(false)
  }
  const changeVisibility=()=>{epoch++;reads++;status=null;loading=false;busy=false;flight=null;error="";notice="";emit();if(visible())void load()}
  return {
    navigationBlocked:()=>!disposed&&Boolean(busy||loading||pending||flight),
    snapshot,dispose,refresh:()=>load(),subscribe(fn:()=>void){if(!disposed)listeners.add(fn);return()=>listeners.delete(fn)},
    setActive(value:boolean){if(disposed||active===value)return;active=value;changeVisibility()},
    setScopes(value:{available:boolean;submit:boolean;lessons:boolean}){
      if(disposed)return
      const changed=available!==(value.available===true);available=value.available===true;submitting=available&&value.submit===true;lessons=submitting&&value.lessons===true
      if(changed)changeVisibility();else emit()
    },
    async select(id:string|null){
      if(disposed)return
      if(id!==null&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)){error="任务编号无效。";emit();return}
      id=id?.toLowerCase()??null
      if(pending&&id!==pending.body.run_id){if(visible()){error="请先核对原任务的反馈请求，再切换任务。";emit()}return}
      reads++;runId=id;status=null;loading=false;error="";notice="";emit();await load()
    },
    submit(value:Submission,confirmed:boolean):Promise<void>{
      if(flight)return flight
      if(!visible()||pending||busy||loading||!submitting||confirmed!==true||!status?.source||value.remember_lesson&&!lessons)return Promise.resolve()
      return start({action:"submit",request_id:key(),spec_id:status.spec_id,run_id:status.run_id,expected_revision:status.revision,expected_source_sha256:status.source.source_sha256,...value,confirm:true})
    },
    erase(confirmed:boolean):Promise<void>{
      if(flight)return flight
      if(!visible()||pending||busy||loading||confirmed!==true||!status?.current)return Promise.resolve()
      return start({action:"erase_feedback",request_id:key(),spec_id:status.spec_id,run_id:status.run_id,expected_revision:status.revision,expected_feedback_sha256:status.current.feedback_sha256,confirm:true})
    },
    forget(feedbackId:string,confirmed:boolean):Promise<void>{
      if(flight)return flight
      if(!visible()||pending||busy||loading||confirmed!==true||!status)return Promise.resolve()
      const item=status.lessons.find(v=>v.feedback_id===feedbackId);if(!item)return Promise.resolve()
      return start({action:"forget_lesson",request_id:key(),spec_id:status.spec_id,run_id:status.run_id,feedback_id:item.feedback_id,expected_content_sha256:item.content_sha256,confirm:true})
    },
    confirm:()=>apply(true),retrySameRequest:()=>apply(false),
  }
}
