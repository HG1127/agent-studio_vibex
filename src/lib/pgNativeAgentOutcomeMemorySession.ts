import {PgNativePilotError,type createPgNativePilotApi,type PgNativeOutcomeStatus,type PgNativeOutcomeStop} from "./pgNativePilotApi.ts"
import {agentOutcomeStop} from "./pgNativeAgentOutcomeMemory.ts"
type Api=Pick<ReturnType<typeof createPgNativePilotApi>,"getAgentOutcomeMemory"|"stopAgentOutcomeMemory"|"confirmAgentOutcomeStop">
export type OutcomeMemoryView={runId:string|null;status:PgNativeOutcomeStatus|null;loading:boolean;busy:boolean;pending:{run_id:string;request_id:string}|null;error:string;notice:string}
export const emptyOutcomeMemoryView=():OutcomeMemoryView=>({runId:null,status:null,loading:false,busy:false,pending:null,error:"",notice:""})
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
// One employee lifetime, no persistent storage, timers or execution requests.
export function createPgNativeOutcomeMemorySession(api:Api,{key=()=>crypto.randomUUID(),onExpired=()=>{}}:{key?:()=>string;onExpired?:()=>void}={}){
  let active=false,available=false,disposed=false,epoch=0,reads=0,runId:string|null=null,status:PgNativeOutcomeStatus|null=null
  let loading=false,busy=false,error="",notice="",pending:Readonly<PgNativeOutcomeStop>|null=null,flight:Promise<void>|null=null
  const listeners=new Set<()=>void>(),emit=()=>listeners.forEach(fn=>fn())
  const visible=()=>active&&available&&!disposed
  const snapshot=():OutcomeMemoryView=>!visible()?emptyOutcomeMemoryView():structuredClone({runId,status,loading,busy,pending:pending?{run_id:pending.run_id,request_id:pending.request_id}:null,error,notice})
  const current=(scope:number)=>visible()&&scope===epoch
  const expired=(cause:unknown)=>{
    if(!(cause instanceof PgNativePilotError)||cause.status!==401)return false
    disposed=true;active=false;epoch++;reads++;runId=null;status=null;pending=null;busy=false;loading=false;error="";notice="";emit();onExpired();return true
  }
  const refresh=async()=>{
    if(!visible()||busy||!runId)return
    const scope=epoch,ticket=++reads,id=runId;loading=true;error="";emit()
    try{const value=await api.getAgentOutcomeMemory(id);if(current(scope)&&ticket===reads&&runId===id)status=value}
    catch(cause){if(current(scope)&&ticket===reads&&!expired(cause)){status=null;error="自动保存状态暂不可用，请刷新核对。"}}
    finally{if(current(scope)&&ticket===reads){loading=false;emit()}}
  }
  const apply=(confirmOnly:boolean):Promise<void>=>{
    if(flight)return flight
    if(!visible()||!pending)return Promise.resolve()
    const body=pending,scope=epoch;busy=true;loading=false;reads++;error="";emit()
    const work=(async()=>{
      try{
        const receipt=await(confirmOnly?api.confirmAgentOutcomeStop(body):api.stopAgentOutcomeMemory(body))
        if(receipt.run_id!==body.run_id||receipt.request_id!==body.request_id||receipt.intent_sha256!==body.expected_intent_sha256||receipt.stopped!==true||receipt.recorded!==true||confirmOnly&&receipt.replayed!==true)throw new PgNativePilotError(503,"unconfirmed_agent_outcome_memory_stop")
        if(current(scope)&&pending===body){
          pending=null
          if(status?.enabled&&status.run_id===body.run_id)status={...status,stopped:true}
          notice="本次任务后续自动保存已停止；已保存的内容仍可在任务记忆中核对并忘记。"
        }
      }catch(cause){
        if(!current(scope)||pending!==body)return
        if(expired(cause))return
        // Even a later rejection cannot replace a previously ambiguous body.
        error=confirmOnly&&cause instanceof PgNativePilotError&&cause.status===404?"尚未查到原停止回执，可重新提交同一停止请求。":"停止结果尚未确认，请核对原请求。"
      }finally{
        if(current(scope)){busy=false;emit()}
      }
    })()
    flight=work.finally(()=>{if(flight===finished)flight=null})
    const finished=flight
    return flight
  }
  const setVisible=()=>{epoch++;reads++;busy=false;loading=false;status=null;error="";notice="";flight=null;emit();if(visible())void refresh()}
  return {
    snapshot,subscribe(fn:()=>void){listeners.add(fn);return()=>listeners.delete(fn)},refresh,
    setActive(value:boolean){if(disposed||active===value)return;active=value;setVisible()},
    setAvailable(value:boolean){if(disposed||available===value)return;available=value;setVisible()},
    async select(id:string|null){
      if(disposed)return
      if(id!==null&&!uuid.test(id)){error="任务编号无效。";emit();return}
      id=id?.toLowerCase()??null
      if(pending&&id!==pending.run_id){if(visible()){error="请先核对原任务的停止请求，再切换自动保存状态。";emit()}return}
      if(id===runId){if(visible()&&!loading&&!busy)await refresh();return}
      reads++;runId=id;status=null;error="";notice="";loading=false;emit();await refresh()
    },
    stop(confirmed:boolean){
      if(flight)return flight
      if(!visible()||busy||loading||pending||confirmed!==true||!status?.enabled||status.stopped||status.state==="finished")return Promise.resolve()
      try{pending=Object.freeze(agentOutcomeStop({request_id:key(),run_id:status.run_id,expected_intent_sha256:status.intent_sha256,confirm:true}))}
      catch{error="无法准备停止请求，请刷新核对。";emit();return Promise.resolve()}
      return apply(false)
    },
    confirm:()=>apply(true),retrySameRequest:()=>apply(false),
    dispose(){if(disposed)return;disposed=true;epoch++;reads++;active=false;runId=null;status=null;pending=null;flight=null;busy=false;loading=false;listeners.clear()}
  }
}
