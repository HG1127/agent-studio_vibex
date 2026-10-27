import {agentGeneratedTarget,agentGeneratedPreview,agentGeneratedReceipt,agentGeneratedOriginal,agentGeneratedCanonical,
  type PgNativeAgentGeneratedAcceptanceApi,type PgNativeAgentGeneratedTarget,type PgNativeAgentGeneratedPreview,type PgNativeAgentGeneratedReceipt,type PgNativeAgentGeneratedAcceptance} from "./pgNativeAgentGeneratedAcceptance.ts"

export type PgNativeAgentGeneratedAcceptanceSessionView={target:PgNativeAgentGeneratedTarget|null;preview:PgNativeAgentGeneratedPreview|null;receipt:PgNativeAgentGeneratedReceipt|null;pending:{original:PgNativeAgentGeneratedAcceptance;unknown:boolean}|null;loading:boolean;busy:boolean;canAccept:boolean;error:string;notice:string}
export const emptyAgentGeneratedAcceptanceView=():PgNativeAgentGeneratedAcceptanceSessionView=>({target:null,preview:null,receipt:null,pending:null,loading:false,busy:false,canAccept:false,error:"",notice:""})
function freeze<T>(value:T):T{if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
const equal=(a:unknown,b:unknown)=>agentGeneratedCanonical(a)===agentGeneratedCanonical(b)
function status(error:unknown):number|null{if(!error||typeof error!=="object")return null;const v=Object.getOwnPropertyDescriptor(error,"status")?.value;return typeof v==="number"&&Number.isInteger(v)?v:null}

type MetadataScope={api:object;ownerId:string;specId:string|null;runId:string|null;purpose:string;reviewId?:string|null;request?:{request_id:string;spec_id:string;run_id:string;purpose:string}|null}
export type PgNativeAgentGeneratedSelection={api:object;ownerId:string;scope:string;target:PgNativeAgentGeneratedTarget|null}
/** Retains validated request metadata when a paid opinion snapshot hides its body. */
export function retainPgNativeAgentGeneratedSelection(previous:PgNativeAgentGeneratedSelection|null,value:MetadataScope):PgNativeAgentGeneratedSelection{
  // The parent durable task view clears detail while hidden or refreshing.
  // Missing detail is not an employee's explicit selection of another task.
  if(previous?.api===value.api&&previous.ownerId===value.ownerId&&value.purpose==="optimize"&&(!value.specId||!value.runId))return previous
  const scope=[value.purpose,value.specId,value.runId].join(":"),same=previous?.api===value.api&&previous.ownerId===value.ownerId&&previous.scope===scope
  const current=same?previous:{api:value.api,ownerId:value.ownerId,scope,target:null}
  if(value.purpose!=="optimize"||!value.reviewId)return current
  const request=value.request
  if(request?.request_id===value.reviewId&&request.purpose==="optimize"&&request.spec_id===value.specId&&request.run_id===value.runId){
    try{const target=agentGeneratedTarget({review_id:request.request_id,spec_id:request.spec_id,target_run_id:request.run_id});return current.target&&equal(current.target,target)?current:{...current,target}}
    catch{return current.target?{...current,target:null}:current}
  }
  return current.target?.review_id!==value.reviewId&&current.target?{...current,target:null}:current
}

export function createPgNativeAgentGeneratedAcceptanceSession(api:PgNativeAgentGeneratedAcceptanceApi,{key=()=>crypto.randomUUID(),onExpired=()=>{},onAccepted=()=>{}}:{key?:()=>string;onExpired?:()=>void;onAccepted?:(receipt:PgNativeAgentGeneratedReceipt)=>void}={}){
  let active=false,available=false,acceptance=false,disposed=false,life=0,reads=0,loading=false,busy=false
  let target:PgNativeAgentGeneratedTarget|null=null,preview:PgNativeAgentGeneratedPreview|null=null,receipt:PgNativeAgentGeneratedReceipt|null=null
  let pending:{original:PgNativeAgentGeneratedAcceptance;unknown:boolean;proof:PgNativeAgentGeneratedPreview}|null=null,flight:Promise<void>|null=null,error="",notice=""
  const listeners=new Set<()=>void>(),visible=()=>active&&!disposed
  const notified=new Set<string>()
  const snapshot=():PgNativeAgentGeneratedAcceptanceSessionView=>!visible()?emptyAgentGeneratedAcceptanceView():structuredClone({target,preview,receipt,pending:pending?{original:pending.original,unknown:pending.unknown}:null,loading,busy,canAccept:available&&acceptance&&Boolean(preview)&&!receipt&&!pending&&!loading&&!busy,error,notice})
  const emit=()=>{if(!disposed)listeners.forEach(fn=>fn())}
  const invalidate=()=>{reads++;loading=false;preview=null}
  const dispose=()=>{disposed=true;life++;reads++;target=null;preview=null;receipt=null;pending=null;flight=null;loading=false;busy=false;error="";notice="";notified.clear();listeners.forEach(fn=>fn());listeners.clear()}
  const expire=(ticket:number)=>{if(disposed||ticket!==life)return;dispose();onExpired()}
  const live=(ticket:number)=>!disposed&&ticket===life
  async function read(kind:"preview"|"receipt"){
    if(!visible()||!target||pending||flight||kind==="preview"&&(!available||receipt))return
    const selected=structuredClone(target),ticket=++reads,lifetime=life
    loading=true;error="";notice="";if(kind==="preview")preview=null;emit()
    const accepts=()=>visible()&&live(lifetime)&&ticket===reads&&target!==null&&equal(target,selected)
    try{
      const raw=await(kind==="preview"?api.previewAgentGeneratedAcceptance({action:"preview",...selected}):api.getAgentGeneratedAcceptance(selected.review_id))
      if(!accepts())return
      if(kind==="preview"){
        const value=await agentGeneratedPreview(raw,selected);if(!accepts())return
        preview=freeze(value)
      }else{
        const value=await agentGeneratedReceipt(raw,{target:selected,replayed:true});if(!accepts())return
        if(receipt&&receipt.receipt_sha256!==value.receipt_sha256)throw Error("generated_receipt_changed")
        receipt=freeze(value);preview=null;notice="已核对真实的配置接受回执。"
      }
    }catch(caught){
      if(!live(lifetime))return
      if(status(caught)===401){expire(lifetime);return}
      if(!accepts())return
      if(kind==="receipt"&&status(caught)===404&&!receipt)notice="尚未找到已接受的配置回执。"
      else error=kind==="preview"?"当前完整建议或来源暂无法核对，请重新预览。":"配置接受回执暂无法核对，请重试读取。"
    }finally{if(accepts()){loading=false;emit()}}
  }
  function mutate(mode:"fresh"|"confirm"|"retry"):Promise<void>{
    if(flight)return flight
    if(!visible()||!pending)return Promise.resolve()
    const original=pending.original,proof=pending.proof,lifetime=life
    reads++;loading=false;preview=null;busy=true;error="";notice=""
    const work=(async()=>{
      let accepted:PgNativeAgentGeneratedReceipt|null=null
      try{
        const raw=await(mode==="confirm"?api.confirmAgentGeneratedAcceptance(original):api.acceptAgentGeneratedAcceptance(original))
        if(!live(lifetime))return
        const value=await agentGeneratedReceipt(raw,{target:{review_id:original.review_id,spec_id:original.spec_id,target_run_id:original.target_run_id},original,...(mode==="confirm"?{replayed:true}:{})})
        if(!live(lifetime))return
        for(const k of ["source","feedback_sources","feedback_sources_sha256","anchor","changed_keys"] as const)if(!equal(value[k],proof[k]))throw Error("generated_receipt_binding_changed")
        receipt=freeze(value);pending=null;notice="已接受这份完整描述建议，角色配置已更新。"
        accepted=value
      }catch(caught){
        if(!live(lifetime))return
        const code=status(caught)
        if(code===401){expire(lifetime);return}
        if(mode==="fresh"&&pending&&!pending.unknown&&code!==null&&[400,403,404,405,409,413,415].includes(code)){pending=null;error="本次配置修改未获确认，请重新核对来源后预览。"}
        else{if(pending)pending.unknown=true;error="配置修改结果尚未确认。请核对原请求，或明确重交完全相同的原请求。"}
      }
      // A UI observer cannot turn a verified committed receipt into ambiguity.
      if(accepted&&live(lifetime)){
        const notification=accepted.request_id+":"+accepted.receipt_sha256
        if(!notified.has(notification)){
          notified.add(notification)
          try{void Promise.resolve(onAccepted(structuredClone(accepted))).catch(()=>{})}catch{/* Keep the verified receipt. */}
        }
      }
    })()
    const finished=work.finally(()=>{if(live(lifetime)&&flight===finished){flight=null;busy=false;emit()}})
    flight=finished;emit();return finished
  }
  return {
    navigationBlocked:()=>!disposed&&Boolean(busy||loading||pending||flight),
    snapshot,dispose,subscribe(fn:()=>void){if(!disposed)listeners.add(fn);return()=>listeners.delete(fn)},
    setActive(value:boolean){if(disposed||active===Boolean(value))return;active=Boolean(value);invalidate();emit()},
    setScopes(value:{available:boolean;acceptance:boolean}){if(disposed)return;const next=value.available===true,enabled=next&&value.acceptance===true;if(next!==available||enabled!==acceptance){available=next;acceptance=enabled;invalidate();emit()}},
    async select(raw:PgNativeAgentGeneratedTarget|null){
      if(disposed||pending||flight)return
      let selected:PgNativeAgentGeneratedTarget|null
      try{selected=raw===null?null:agentGeneratedTarget(raw)}catch{error="意见目标无效。";emit();return}
      if(equal(target,selected))return
      invalidate();target=selected?freeze(selected):null;receipt=null;error="";notice="";emit();if(selected)await read("receipt")
    },
    prepare:()=>read("preview"),refreshReceipt:()=>read("receipt"),
    accept(confirmed:boolean):Promise<void>{
      if(flight)return flight
      if(!visible()||!available||!acceptance||!preview||receipt||pending||loading||confirmed!==true)return Promise.resolve()
      try{pending={original:freeze(agentGeneratedOriginal(preview,key())),proof:preview,unknown:false}}
      catch{error="无法准备这次配置修改，请重新预览。";emit();return Promise.resolve()}
      return mutate("fresh")
    },
    confirm:()=>mutate("confirm"),retrySameRequest:()=>mutate("retry")
  }
}
