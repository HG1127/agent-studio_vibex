// UI scope and explicit-intent state only. Native ownership remains server-side.
import {agentPlanWorkflowPurpose as purpose,agentPlanWorkflowObject as object,agentPlanWorkflowText as text,agentPlanWorkflowId as id,
  agentPlanWorkflowOutputTokenLimits,canonicalAgentPlanWorkflowValue as canonical,freezeAgentPlanWorkflowValue as freeze,
  parseAgentPlanWorkflowModel} from "../../services/pg-api/src/agent-plan-workflow-contract.ts"
import {deriveAgentPlanWorkflowDraft,type AgentPlanWorkflowSourceValues} from "../../services/pg-api/src/agent-plan-workflow-result.ts"
import {parseAgentPlanWorkflowPrepared,parseAgentPlanWorkflowReceipt,parseAgentPlanWorkflowView,parseAgentPlanWorkflowControl,parseAgentPlanWorkflowControlReceipt,
  parseAgentPlanWorkflowSavePreviewInput,parseAgentPlanWorkflowSavePreview,parseAgentPlanWorkflowSaveReceipt,agentPlanWorkflowCancelAcknowledgement,agentPlanWorkflowEraseAcknowledgement} from "../../services/pg-api/src/agent-plan-workflow-rpc-contract.ts"
import {agentPlanWorkflowSubmitBody,agentPlanWorkflowSaveBody,parseAgentPlanWorkflowSourceResponse,
  type PgNativeAgentPlanWorkflowApi,type AgentPlanWorkflowPrepared,type AgentPlanWorkflowReceipt,type AgentPlanWorkflowView,type AgentPlanWorkflowSavePreview} from "./pgNativeAgentPlanWorkflow.ts"

function draftChoice(raw:unknown){
  const v=object(raw,["spec_id","generation_model","instruction","output_token_limit"])
  if(!agentPlanWorkflowOutputTokenLimits.some(limit=>limit===v.output_token_limit))throw Error("invalid_agent_plan_workflow_draft_choice")
  return freeze({spec_id:id(v.spec_id),generation_model:parseAgentPlanWorkflowModel(v.generation_model),instruction:text(v.instruction,2000),output_token_limit:v.output_token_limit as typeof agentPlanWorkflowOutputTokenLimits[number]})
}
type DraftChoice=ReturnType<typeof draftChoice>
type Edits=NonNullable<ReturnType<typeof parseAgentPlanWorkflowSavePreviewInput>["edits"]>
type PreviewBinding=Pick<AgentPlanWorkflowPrepared,"content_sha256"|"model_versions_sha256"|"owner_epoch"|"owner_governance_revision">
type Pending={kind:"submit";body:ReturnType<typeof agentPlanWorkflowSubmitBody>;expected:PreviewBinding}|{kind:"control";body:ReturnType<typeof parseAgentPlanWorkflowControl>}|{kind:"save";body:ReturnType<typeof agentPlanWorkflowSaveBody>}
export type AgentPlanWorkflowSessionView={employeeId:string;scopeKey:string;active:boolean;available:boolean;submissions:boolean;saves:boolean;busy:boolean;error:string;
  choice:DraftChoice|null;source:ReturnType<typeof parseAgentPlanWorkflowSourceResponse>|null;preview:AgentPlanWorkflowPrepared|null;feeReviewed:boolean;
  receipt:AgentPlanWorkflowReceipt|null;result:AgentPlanWorkflowView|null;fields:Edits|null;savePreview:AgentPlanWorkflowSavePreview|null;saveReviewed:boolean;
  saveReceipt:ReturnType<typeof parseAgentPlanWorkflowSaveReceipt>|null;controlReceipt:ReturnType<typeof parseAgentPlanWorkflowControlReceipt>|null;pending:Pending|null}
export const emptyAgentPlanWorkflowView=(employeeId="",scopeKey=""):AgentPlanWorkflowSessionView=>({employeeId,scopeKey,active:false,available:false,submissions:false,saves:false,busy:false,error:"",
  choice:null,source:null,preview:null,feeReviewed:false,receipt:null,result:null,fields:null,savePreview:null,saveReviewed:false,saveReceipt:null,controlReceipt:null,pending:null})
const field=(error:unknown,key:string)=>error&&typeof error==="object"?Object.getOwnPropertyDescriptor(error,key)?.value:undefined
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b)
/** Bind to an actual API object and a CurrentTaskKey containing the login epoch.
 * Rebinding invalidates this controller permanently; callers create a new one. */
export function createPgNativeAgentPlanWorkflowSession(api:PgNativeAgentPlanWorkflowApi,options:{employeeId:string;scopeKey:string;onExpired?:()=>void;requestId?:()=>string}){
  const employeeId=id(options.employeeId),scopeKey=text(options.scopeKey,1000,true),newId=options.requestId??(()=>crypto.randomUUID()),listeners=new Set<()=>void>()
  let state=emptyAgentPlanWorkflowView(employeeId,scopeKey),disposed=false,bound=true,ticket=0,abort:AbortController|null=null,pending:Pending|null=null
  let sourceValues:Omit<AgentPlanWorkflowSourceValues,"authority">|null=null
  const visible=()=>!disposed&&bound&&state.active&&state.available
  const emit=()=>{if(!disposed)for(const fn of listeners)fn()}
  const sync=()=>{state.pending=pending}
  const reset=(keepPending=false)=>{
    ++ticket;abort?.abort();abort=null;sourceValues=null
    const {active,available,submissions,saves}=state;state={...emptyAgentPlanWorkflowView(employeeId,scopeKey),active,available,submissions,saves}
    if(!keepPending)pending=null;sync()
  }
  const current=(signal:AbortSignal)=>visible()&&!signal.aborted&&abort?.signal===signal
  const clearConfirmations=()=>{state.feeReviewed=false;state.saveReviewed=false;state.savePreview=null}
  async function run(work:(signal:AbortSignal)=>Promise<void>,mutation=false){
    if(!visible()||state.busy)return
    const turn=++ticket,c=new AbortController();abort=c;state.busy=true;state.error="";emit()
    try{await work(c.signal)}catch(error){
      if(disposed||turn!==ticket)return
      const status=field(error,"status")
      if(status===401){reset();bound=false;state.active=false;state.available=false;state.error="员工登录已失效，请重新登录。";try{void Promise.resolve(options.onExpired?.()).catch(()=>{})}catch{}}
      else if(status===403){reset();state.available=false;state.submissions=false;state.saves=false;state.error="访问状态已变化，内容已清空。"}
      else{
        if(mutation&&field(error,"definitive")===true&&typeof status==="number"&&status>=400&&status<500){pending=null;sync();state.preview=null;clearConfirmations()}
        state.error=pending?"还不能确认本次操作结果。请查询原请求，不要重复提交。":status===409?"来源或资源版本已变化，请重新读取并预览。":"当前内容无法核对，请重新读取或预览。"
      }
    }finally{if(!disposed){if(turn===ticket){state.busy=false;abort=null}emit()}}
  }
  const acceptSubmit=(raw:unknown,p:Extract<Pending,{kind:"submit"}>)=>{
    const r=parseAgentPlanWorkflowReceipt(raw)
    if(r.request_id!==p.body.request_id||r.input_sha256!==p.body.expected_input_sha256||!same(r.source,p.body.source)||!same(r.generation_model,p.body.generation_model)||r.output_token_limit!==p.body.output_token_limit||r.content_sha256!==p.expected.content_sha256||r.model_versions_sha256!==p.expected.model_versions_sha256||r.owner_epoch!==p.expected.owner_epoch||r.owner_governance_revision!==p.expected.owner_governance_revision)throw Error("invalid_agent_plan_workflow_receipt")
    state.receipt=r;state.preview=null;state.feeReviewed=false;pending=null;sync()
  }
  const acceptSave=(raw:unknown,p:Extract<Pending,{kind:"save"}>)=>{
    const r=parseAgentPlanWorkflowSaveReceipt(raw),v=p.body.intent
    if(r.request_id!==v.request_id||r.generation_request_id!==v.generation_request_id||!same(r.source,v.source)||r.result_sha256!==v.expected_result_sha256||r.preview_sha256!==v.expected_preview_sha256||r.candidate_sha256!==v.expected_candidate_sha256)throw Error("invalid_agent_plan_workflow_save_receipt")
    state.saveReceipt=r;state.savePreview=null;state.saveReviewed=false;pending=null;sync()
  }
  const acceptControl=(raw:unknown,p:Extract<Pending,{kind:"control"}>)=>{
    const r=parseAgentPlanWorkflowControlReceipt(raw)
    if(r.request_id!==p.body.request_id||r.generation_request_id!==p.body.generation_request_id||r.action!==p.body.action)throw Error("invalid_agent_plan_workflow_control_receipt")
    state.controlReceipt=r;state.result=null;state.fields=null;state.preview=null;clearConfirmations();if(p.body.action==="erase")sourceValues=null;pending=null;sync()
  }
  return {
    snapshot():AgentPlanWorkflowSessionView{return freeze(structuredClone(visible()?state:{...emptyAgentPlanWorkflowView(employeeId,scopeKey),error:state.error}))},
    hasPendingOriginal(){return !disposed&&bound&&pending!==null},
    subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
    matchesScope(candidate:PgNativeAgentPlanWorkflowApi,owner:string,key:string){return !disposed&&bound&&candidate===api&&owner===employeeId&&key===scopeKey},
    setScope(candidate:PgNativeAgentPlanWorkflowApi,owner:string,key:string){if(disposed)return false;if(bound&&candidate===api&&owner===employeeId&&key===scopeKey)return true;reset();bound=false;state.active=false;state.available=false;state.submissions=false;state.saves=false;emit();return false},
    setActive(active:boolean){if(disposed||!bound||state.active===(active===true))return;state.active=active===true;if(!state.active)reset(true);emit()},
    setAvailability(hints:{available?:boolean;submissions?:boolean;saves?:boolean}){
      if(disposed||!bound)return
      const available=hints.available===true,submissions=hints.submissions===true,saves=hints.saves===true
      if(available===state.available&&submissions===state.submissions&&saves===state.saves)return
      if(available!==state.available)reset(true)
      state.available=available;state.submissions=submissions;state.saves=saves;state.feeReviewed=false;state.saveReviewed=false;emit()
    },
    setDraft(raw:unknown){
      if(!visible()||pending)return false
      const choice=draftChoice(raw);if(state.choice&&same(state.choice,choice))return true
      reset();state.choice=choice;emit();return true
    },
    invalidatePreview(){if(!visible()||pending)return;const choice=state.choice;reset();state.choice=choice;emit()},
    invalidateSavePreview(){if(!visible()||state.busy||pending)return;state.savePreview=null;state.saveReviewed=false;emit()},
    setFeeReviewed(reviewed:boolean){if(!visible()||state.busy||pending||!state.preview)return;state.feeReviewed=reviewed===true;emit()},
    setSaveReviewed(reviewed:boolean){if(!visible()||state.busy||pending||!state.savePreview)return;state.saveReviewed=reviewed===true;emit()},
    async preview(){
      if(!visible()||state.busy||!state.choice||pending)return
      const choice=state.choice;state.source=null;state.preview=null;state.feeReviewed=false;state.savePreview=null;state.saveReviewed=false
      state.receipt=null;state.result=null;state.fields=null;state.saveReceipt=null;state.controlReceipt=null;sourceValues=null
      await run(async signal=>{
        const source=parseAgentPlanWorkflowSourceResponse(await api.source({purpose,spec_id:choice.spec_id,generation_model:choice.generation_model},signal))
        if(!current(signal))return
        if(source.source.spec_id!==choice.spec_id||!same(source.generation_model,choice.generation_model))throw Error("invalid_agent_plan_workflow_source")
        state.source=source;emit()
        const v=parseAgentPlanWorkflowPrepared(await api.preview({action:"preview",purpose,source:source.source,instruction:choice.instruction,generation_model:choice.generation_model,output_token_limit:choice.output_token_limit},signal))
        if(!current(signal))return
        if(!same(v.choice.source,source.source)||!same(v.choice.generation_model,choice.generation_model)||v.choice.instruction!==choice.instruction||v.choice.output_token_limit!==choice.output_token_limit||v.owner_user_id!==employeeId)throw Error("invalid_agent_plan_workflow_preview")
        state.preview=v;sourceValues=v.source_values;state.receipt=null;state.result=null;state.fields=null;state.saveReceipt=null;state.controlReceipt=null
      })
    },
    async submit(){
      if(!visible()||state.busy||!state.submissions||!state.preview||!state.feeReviewed||pending)return
      const preview=state.preview
      await run(async signal=>{const p:Extract<Pending,{kind:"submit"}>={kind:"submit",body:agentPlanWorkflowSubmitBody(preview,newId()),expected:{content_sha256:preview.content_sha256,model_versions_sha256:preview.model_versions_sha256,owner_epoch:preview.owner_epoch,owner_governance_revision:preview.owner_governance_revision}};pending=freeze(p);sync();state.feeReviewed=false;emit();const r=await api.submit(p.body,signal);if(current(signal))acceptSubmit(r,p)},true)
    },
    async readResult(){
      if(pending||!state.receipt)return
      const original=state.receipt
      await run(async signal=>{
        const v=parseAgentPlanWorkflowView(await api.view(original.request_id,signal));if(!current(signal))return
        const {state:_state,body_erased:_erased,replayed:_replayed,...before}=original,{state:_nextState,body_erased:_nextErased,replayed:_nextReplayed,...after}=v.receipt
        if(!same(before,after))throw Error("invalid_agent_plan_workflow_view")
        state.result=v;state.receipt=v.receipt;state.fields=null;state.savePreview=null;state.saveReviewed=false
        if(v.result_status==="available"&&v.result&&!state.saveReceipt)state.fields=freeze({name:v.result.value.result.name,graph:v.result.value.result.graph})
      })
    },
    editFields(raw:unknown){
      if(!visible()||state.busy||pending||!state.fields||!state.result?.result||state.result.result_status!=="available"||state.saveReceipt)return
      const result=state.result,resultData=result.result!,parsed=parseAgentPlanWorkflowSavePreviewInput({generation_request_id:result.receipt.request_id,expected_result_sha256:resultData.result_sha256,edits:raw})
      if(sourceValues&&same(sourceValues.source,result.receipt.source))deriveAgentPlanWorkflowDraft({action:"preview",purpose,source:result.receipt.source,instruction:"",generation_model:result.receipt.generation_model,output_token_limit:result.receipt.output_token_limit},sourceValues,resultData.value.result,parsed.edits)
      state.fields=parsed.edits;state.savePreview=null;state.saveReviewed=false;emit()
    },
    async previewSave(){
      if(!visible()||state.busy||!state.fields||state.result?.result_status!=="available"||!state.result.result||pending||state.saveReceipt)return
      const input=parseAgentPlanWorkflowSavePreviewInput({generation_request_id:state.result.receipt.request_id,expected_result_sha256:state.result.result.result_sha256,edits:state.fields}),original=state.result.receipt
      state.savePreview=null;state.saveReviewed=false
      await run(async signal=>{
        const p=parseAgentPlanWorkflowSavePreview(await api.previewSave(input,signal));if(!current(signal))return
        if(p.generation_request_id!==input.generation_request_id||p.result_sha256!==input.expected_result_sha256||!same(p.source,original.source)||p.input_sha256!==original.input_sha256||p.model_versions_sha256!==original.model_versions_sha256||!same(p.candidate,input.edits))throw Error("invalid_agent_plan_workflow_save_preview")
        state.savePreview=p
      })
    },
    async save(){
      if(!visible()||state.busy||!state.saves||!state.savePreview||!state.saveReviewed||!state.fields||pending||state.saveReceipt)return
      const preview=state.savePreview,input={generation_request_id:preview.generation_request_id,expected_result_sha256:preview.result_sha256,edits:state.fields}
      await run(async signal=>{const p:Extract<Pending,{kind:"save"}>={kind:"save",body:agentPlanWorkflowSaveBody(preview,input,newId())};pending=freeze(p);sync();state.saveReviewed=false;emit();const r=await api.save(p.body,signal);if(current(signal))acceptSave(r,p)},true)
    },
    async control(kind:"cancel"|"erase",confirmed:boolean){
      if(!visible()||state.busy||pending||!state.receipt||confirmed!==true)return
      const generation=state.receipt.request_id
      await run(async signal=>{const body=parseAgentPlanWorkflowControl({action:kind,request_id:newId(),generation_request_id:generation,confirm:true,acknowledgement:kind==="cancel"?agentPlanWorkflowCancelAcknowledgement:agentPlanWorkflowEraseAcknowledgement}),p:Extract<Pending,{kind:"control"}>={kind:"control",body};pending=freeze(p);sync();clearConfirmations();emit();const r=await api.control(body,signal);if(current(signal))acceptControl(r,p)},true)
    },
    async confirmOriginal(){
      const p=pending;if(!p)return
      await run(async signal=>{
        if(p.kind==="submit"){const r=await api.confirm(p.body,signal);if(current(signal))acceptSubmit(r,p)}
        else if(p.kind==="save"){const r=await api.confirmSave(p.body.intent,signal);if(current(signal))acceptSave(r,p)}
        else{const r=await api.confirmControl(p.body,signal);if(current(signal))acceptControl(r,p)}
      })
    },
    dispose(){if(disposed)return;reset();bound=false;disposed=true;listeners.forEach(fn=>fn());listeners.clear()},
  }
}
export type PgNativeAgentPlanWorkflowSession=ReturnType<typeof createPgNativeAgentPlanWorkflowSession>
