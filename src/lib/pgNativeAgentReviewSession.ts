import {PgNativePilotError,type createPgNativePilotApi} from "./pgNativePilotApi.ts"
import {agentReviewTarget,agentReviewSource,agentReviewChoiceFromSelection,agentReviewPreview,agentReviewSubmission,agentReviewReceipt,agentReviewControl,agentReviewControlReceipt,agentReviewView,agentReviewId,agentReviewFeeAcknowledgements,type PgNativeAgentReviewTarget,type PgNativeAgentReviewSelection,type PgNativeAgentReviewSource,type PgNativeAgentReviewPreview,type PgNativeAgentReviewSubmission,type PgNativeAgentReviewControl,type PgNativeAgentReviewReceipt,type PgNativeAgentReviewView,type PgNativeAgentReviewRequest} from "./pgNativeAgentReview.ts"
import {agentReviewHistoryPage,agentReviewHistoryItem,type PgNativeAgentReviewHistoryPage,type PgNativeAgentReviewHistoryItem} from "./pgNativeAgentReviewHistory.ts"

type Api=Pick<ReturnType<typeof createPgNativePilotApi>,"getAgentReviewSource"|"previewAgentReview"|"submitAgentReview"|"confirmAgentReview"|"changeAgentReviewControl"|"confirmAgentReviewControl"|"getAgentReview">&Partial<Pick<ReturnType<typeof createPgNativePilotApi>,"listAgentReviewHistory">>
export type PgNativeAgentReviewSessionView={target:PgNativeAgentReviewTarget|null;source:PgNativeAgentReviewSource|null;preview:PgNativeAgentReviewPreview|null;reviewId:string|null;receipt:PgNativeAgentReviewReceipt|null;review:PgNativeAgentReviewView|null;history:PgNativeAgentReviewHistoryPage|null;historyLoading:boolean;historyError:string;selectedMetadata:PgNativeAgentReviewHistoryItem|null;pending:{kind:"submit"|"control";request_id:string;review_id:string;action:"submit"|"cancel"|"erase";run_id:string;spec_id:string}|null;loading:boolean;busy:boolean;canSubmit:boolean;error:string;notice:string}
export const emptyAgentReviewView=():PgNativeAgentReviewSessionView=>({target:null,source:null,preview:null,reviewId:null,receipt:null,review:null,history:null,historyLoading:false,historyError:"",selectedMetadata:null,pending:null,loading:false,busy:false,canSubmit:false,error:"",notice:""})
type Pending=({kind:"submit";body:PgNativeAgentReviewSubmission;prepared:PgNativeAgentReviewPreview}|{kind:"control";body:PgNativeAgentReviewControl})&{target:PgNativeAgentReviewTarget;ambiguous:boolean}
const sameTarget=(a:PgNativeAgentReviewTarget,b:PgNativeAgentReviewTarget)=>a.spec_id===b.spec_id&&a.run_id===b.run_id&&a.purpose===b.purpose
function freeze<T>(v:T):T{if(v&&typeof v==="object"){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
const requestKeys=["request_id","spec_id","run_id","purpose","request_sha256","input_sha256","content_sha256","owner_epoch","source_protocol","created_at"] as const
const sameRequest=(a:PgNativeAgentReviewRequest,b:PgNativeAgentReviewRequest)=>requestKeys.every(k=>a[k]===b[k])

/** One Native employee lifetime. No persistence, provider calls or implicit retries. */
export function createPgNativeAgentReviewSession(api:Api,{key=()=>crypto.randomUUID(),onExpired=()=>{}}:{key?:()=>string;onExpired?:()=>void}={}){
  let active=false,available=false,submitting=false,historyEnabled=false,disposed=false,epoch=0,reads=0,historyEpoch=0,historyReads=0
  let target:PgNativeAgentReviewTarget|null=null,source:PgNativeAgentReviewSource|null=null,preview:PgNativeAgentReviewPreview|null=null,reviewId:string|null=null,receipt:PgNativeAgentReviewReceipt|null=null,review:PgNativeAgentReviewView|null=null
  let pending:Pending|null=null,flight:Promise<void>|null=null,loading=false,busy=false,error="",notice=""
  let history:PgNativeAgentReviewHistoryPage|null=null,selectedMetadata:PgNativeAgentReviewHistoryItem|null=null,historyLoading=false,historyError=""
  const controls=new Map<string,"cancel"|"erase">()
  const listeners=new Set<()=>void>(),emit=()=>listeners.forEach(fn=>fn()),visible=()=>active&&available&&!disposed,current=(scope:number,ticket?:number)=>visible()&&scope===epoch&&(ticket===undefined||ticket===reads)
  const pinnedMetadata=()=>selectedMetadata&&target&&selectedMetadata.request.request_id===reviewId&&sameTarget(selectedMetadata.request,target)?selectedMetadata:null
  const snapshot=():PgNativeAgentReviewSessionView=>!visible()?emptyAgentReviewView():structuredClone({target,source,preview,reviewId,receipt,review,history:historyEnabled?history:null,historyLoading:historyEnabled&&historyLoading,historyError:historyEnabled?historyError:"",selectedMetadata:pinnedMetadata(),pending:pending?{kind:pending.kind,request_id:pending.body.request_id,review_id:pending.kind==="submit"?pending.body.request_id:pending.body.review_id,action:pending.body.action,run_id:pending.target.run_id,spec_id:pending.target.spec_id}:null,loading,busy,canSubmit:submitting,error,notice})
  const invalidateHistory=(clearSelection=false)=>{historyEpoch++;historyReads++;history=null;historyLoading=false;historyError="";if(clearSelection)selectedMetadata=null}
  const dispose=()=>{if(disposed)return;disposed=true;active=false;epoch++;reads++;target=null;source=null;preview=null;reviewId=null;receipt=null;review=null;pending=null;invalidateHistory(true);controls.clear();loading=false;busy=false;error="";notice="";emit();listeners.clear()}
  const expired=(cause:unknown)=>{if(!(cause instanceof PgNativePilotError)||cause.status!==401)return false;dispose();onExpired();return true}
  const invalidate=()=>{epoch++;reads++;source=null;preview=null;review=null;loading=false;error="";notice="";if(pending)pending.ambiguous=true}
  const fail=(code="invalid_agent_review_projection"):never=>{throw new PgNativePilotError(503,code)}
  const rememberControl=(id:string,state:"pending"|"cancelled"|"erased")=>{if(state!=="pending"&&controls.get(id)!=="erase")controls.set(id,state==="erased"?"erase":"cancel")}
  const checkControl=(item:PgNativeAgentReviewHistoryItem)=>{const known=controls.get(item.request.request_id);if(known==="erase"&&item.control.job_state!=="erased"||known==="cancel"&&item.control.job_state==="pending")return fail("invalid_agent_review_history_response")}
  async function loadHistory(before:string|null,afterMutation=false){
    if(!visible()||!historyEnabled||!target||flight&&!afterMutation)return
    const selected=structuredClone(target),scope=historyEpoch,ticket=++historyReads,query={...selected,limit:20,before},previousIds=before!==null?new Set(history?.items.map(item=>item.request.request_id)):null
    const accepts=()=>visible()&&historyEnabled&&scope===historyEpoch&&ticket===historyReads&&target!==null&&sameTarget(target,selected)
    historyLoading=true;historyError="";if(before===null)history=null;emit()
    try{
      if(!api.listAgentReviewHistory)return fail("agent_review_history_unavailable")
      const page=agentReviewHistoryPage(await api.listAgentReviewHistory(query),query)
      if(!accepts())return
      for(const item of page.items){
        checkControl(item)
        const known=selectedMetadata?.request.request_id===item.request.request_id?selectedMetadata.request:receipt?.request_id===item.request.request_id?receipt:review?.request.request_id===item.request.request_id?review.request:null
        if(previousIds?.has(item.request.request_id)||known&&!sameRequest(known,item.request))return fail("invalid_agent_review_history_response")
      }
      // Commit privacy observations only after the entire page is accepted.
      // Unselected entries also forbid future regressions; failed pages do not.
      for(const item of page.items)rememberControl(item.request.request_id,item.control.job_state)
      history=page
      const selectedItem=page.items.find(item=>item.request.request_id===selectedMetadata?.request.request_id)
      if(selectedItem){
        selectedMetadata=freeze(structuredClone(selectedItem))
      }
      const activeItem=page.items.find(item=>item.request.request_id===reviewId)
      if(activeItem&&activeItem.control.job_state!=="pending"){reads++;review=null;preview=null;loading=false}
    }catch(cause){if(!accepts()||expired(cause))return;historyError="历史意见暂无法核对，请重新读取；不会伪造空历史或恢复正文。"}
    finally{if(accepts()){historyLoading=false;emit()}}
  }
  async function loadSource(){
    if(!visible()||!target||pending||flight)return
    const selected=structuredClone(target),scope=epoch,ticket=++reads;loading=true;source=null;preview=null;review=null;error="";emit()
    try{const value=agentReviewSource(await api.getAgentReviewSource(selected),selected);if(current(scope,ticket)&&target&&sameTarget(target,selected)){source=value;return true}}
    catch(cause){if(current(scope,ticket)&&!expired(cause)){source=null;error="当前评审来源暂无法核对，请刷新。"}}
    finally{if(current(scope,ticket)){loading=false;emit()}}
  }
  async function loadReview(id:string,afterMutation=false){
    if(!visible()||pending||flight&&!afterMutation)return
    const metadata=pinnedMetadata(),selected=target?structuredClone(target):null,known=receipt?.request_id===id?structuredClone(receipt):metadata?.request.request_id===id?structuredClone(metadata.request):null,scope=epoch,ticket=++reads
    loading=true;review=null;preview=null;error="";emit()
    try{
      const value=await agentReviewView(await api.getAgentReview(id),id)
      if(!current(scope,ticket))return
      if(selected&&!sameTarget(value.request,selected)||known&&!sameRequest(value.request,known))return fail()
      const controlled=controls.get(id)
      if(controlled==="erase"&&(!value.body_erased||value.execution.job_state!=="erased"||value.available)||controlled==="cancel"&&value.execution.job_state==="pending")return fail()
      review=value;reviewId=id
      if(!target)target={purpose:value.request.purpose,spec_id:value.request.spec_id,run_id:value.request.run_id}
      if(pinnedMetadata()?.request.request_id===id){selectedMetadata=freeze(agentReviewHistoryItem({request:value.request,control:{job_state:value.execution.job_state,body_erased:value.body_erased}},target!));rememberControl(id,value.execution.job_state)}
    }catch(cause){if(current(scope,ticket)&&!expired(cause)){review=null;error="评审结果或当前来源暂不可用，请核对原请求；不会改用缓存正文。"}}
    finally{if(current(scope,ticket)){loading=false;emit()}}
  }
  const apply=(confirmOnly:boolean):Promise<void>=>{
    if(flight)return flight
    if(!visible()||!pending)return Promise.resolve()
    const original=pending,scope=epoch;busy=true;loading=false;reads++;preview=null;review=null;error=""
    const work=Promise.resolve().then(async()=>{
      try{
        if(disposed||pending!==original)return
        if(!current(scope)){original.ambiguous=true;return}
        let saved:PgNativeAgentReviewReceipt|null=null
        if(original.kind==="submit"){
          saved=await agentReviewReceipt(await(confirmOnly?api.confirmAgentReview(original.body):api.submitAgentReview(original.body)),original.body,confirmOnly)
          if(saved.content_sha256!==original.prepared.content_sha256||saved.owner_epoch!==original.prepared.owner_epoch||saved.source_protocol!==original.prepared.source_protocol)return fail()
        }else await agentReviewControlReceipt(await(confirmOnly?api.confirmAgentReviewControl(original.body):api.changeAgentReviewControl(original.body)),original.body,confirmOnly)
        if(!current(scope)||pending!==original){original.ambiguous=true;return}
        pending=null;source=null;preview=null;review=null
        if(saved){receipt=saved;reviewId=saved.request_id;selectedMetadata=null;notice="评审请求已记录；执行状态与费用结果须分别核对。"}
        else {
          const body=(original as Extract<Pending,{kind:"control"}>).body;reviewId=body.review_id
          if(controls.get(reviewId)!=="erase")controls.set(reviewId,body.action)
          notice=body.action==="erase"?"删除控制已记录，评审正文不再展示；已发生的调用费用不能由此推断。":"取消控制已记录；已发出的模型调用及费用结果须另行核对。"
        }
        await loadReview(reviewId!,true)
        if(current(scope)&&historyEnabled)await loadHistory(null,true)
      }catch(cause){
        if(pending!==original||expired(cause))return
        if(!current(scope)){original.ambiguous=true;return}
        const definitive=cause instanceof PgNativePilotError&&[400,403,404,405,409,413,415].includes(cause.status)
        if(!confirmOnly&&definitive&&!original.ambiguous){pending=null;source=null;preview=null}
        else original.ambiguous=true
        error=confirmOnly&&cause instanceof PgNativePilotError&&cause.status===404?"尚未查到原记录；可以明确重交同一原请求，不能据此推断未产生费用。":pending?"结果尚未确认。原请求已保留，请先核对；不会自动重发或更换请求编号。":"权限或当前来源已变化，请重新核对来源与预览。"
      }
    })
    const finished=work.finally(()=>{if(flight===finished){flight=null;busy=false;if(!disposed)emit()}});flight=finished;emit();return finished
  }
  const control=(action:"cancel"|"erase",confirmed:boolean):Promise<void>=>{
    if(flight)return flight
    const r=review?.request??receipt??pinnedMetadata()?.request
    if(!visible()||pending||loading||confirmed!==true||!r||!target||r.request_id!==reviewId||!sameTarget(r,target))return Promise.resolve()
    historyReads++;historyLoading=false
    try{const body=freeze(agentReviewControl({action,request_id:key(),review_id:r.request_id,expected_request_sha256:r.request_sha256,confirm:true}));pending={kind:"control",body,target:freeze(structuredClone(target)),ambiguous:false};reads++;review=null;preview=null}
    catch{error="无法准备控制请求，请重新核对原评审。";emit();return Promise.resolve()}
    return apply(false)
  }
  return {
    snapshot,dispose,subscribe(fn:()=>void){if(!disposed)listeners.add(fn);return()=>listeners.delete(fn)},
    setActive(value:boolean){if(disposed||active===value)return;active=value;invalidate();invalidateHistory();emit()},
    setScopes(value:{available:boolean;submit:boolean;history?:boolean}){
      if(disposed)return
      const next=value.available===true,nextSubmit=next&&value.submit===true,nextHistory=next&&value.history===true,changed=next!==available||nextSubmit!==submitting,changedHistory=next!==available||nextHistory!==historyEnabled
      available=next;submitting=nextSubmit;historyEnabled=nextHistory;if(changed)invalidate();if(changedHistory)invalidateHistory();emit()
    },
    async select(raw:PgNativeAgentReviewTarget|null){
      if(disposed)return
      let selected:PgNativeAgentReviewTarget|null
      try{selected=raw===null?null:agentReviewTarget(raw)}catch{error="任务或用途选择无效。";emit();return}
      if(pending){if(!selected||!sameTarget(pending.target,selected)){error="请先核对原任务的评审请求，再切换选择。";emit()}return}
      if(flight)return
      const changed=!target||!selected||!sameTarget(target,selected);invalidate();target=selected
      if(changed){reviewId=null;receipt=null;invalidateHistory(true)}emit();await loadSource()
    },
    refreshHistory:()=>loadHistory(null),
    loadMoreHistory:()=>!historyLoading&&history?.has_more?loadHistory(history.next_cursor):Promise.resolve(),
    async selectHistory(raw:string){
      if(!visible()||!historyEnabled||!target||pending||flight||historyLoading)return
      let id:string;try{id=agentReviewId(raw)}catch{historyError="意见编号无效。";emit();return}
      const item=history?.items.find(row=>row.request.request_id===id)
      if(!item||!sameTarget(item.request,target)){historyError="只能选择当前历史页中的本人任务意见。";emit();return}
      try{checkControl(item)}catch{historyError="历史隐私状态已变化，请重新读取。";emit();return}
      reads++;review=null;preview=null;loading=false;error="";notice="";receipt=null;reviewId=id;selectedMetadata=freeze(structuredClone(item));rememberControl(id,item.control.job_state);emit()
      await loadReview(id)
    },
    async refresh(){if(!visible()||pending||flight)return;const scope=epoch,loaded=await loadSource();if(loaded&&current(scope)&&reviewId&&!pending&&!flight)await loadReview(reviewId)},
    invalidatePreview(){if(disposed||pending||flight)return;reads++;preview=null;review=null;loading=false;error="";notice="";emit()},
    async prepare(selection:PgNativeAgentReviewSelection){
      if(!visible()||pending||flight||loading||!source||!target)return
      const scope=epoch,ticket=++reads;loading=true;preview=null;review=null;error="";notice="";emit()
      try{
        const choice=freeze(agentReviewChoiceFromSelection(source,selection)),value=agentReviewPreview(await api.previewAgentReview(choice),choice)
        if(current(scope,ticket)&&target&&sameTarget(target,choice))preview=value
      }catch(cause){if(current(scope,ticket)&&!expired(cause)){preview=null;error="无法预览，请核对当前来源、独立模型和本人反馈选择。"}}
      finally{if(current(scope,ticket)){loading=false;emit()}}
    },
    submit(confirmed:boolean):Promise<void>{
      if(flight)return flight
      if(!visible()||pending||loading||!submitting||confirmed!==true||!preview||!target)return Promise.resolve()
      try{
        const prepared=freeze(structuredClone(preview)),body=freeze(agentReviewSubmission({...prepared.choice,action:"submit",request_id:key(),expected_input_sha256:prepared.input_sha256,confirm:true,fee_acknowledgement:agentReviewFeeAcknowledgements[prepared.choice.purpose]}))
        pending={kind:"submit",body,prepared,target:freeze(structuredClone(target)),ambiguous:false}
      }catch{error="无法准备提交，请重新预览并明确确认。";emit();return Promise.resolve()}
      return apply(false)
    },
    async read(raw:string){
      if(!visible()||pending||flight)return
      let id:string;try{id=agentReviewId(raw)}catch{error="评审编号无效。";emit();return}
      reads++;preview=null;review=null;if(reviewId!==id){receipt=null;selectedMetadata=null}reviewId=id;emit();await loadReview(id)
    },
    cancel:(confirmed:boolean)=>control("cancel",confirmed),erase:(confirmed:boolean)=>control("erase",confirmed),confirm:()=>apply(true),retrySameRequest:()=>apply(false),
  }
}
