import {useEffect,useRef,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {originalAgentRunPrivacy,originalAgentRunLocalView} from '../../lib/originalAgentRunPrivacy.ts'
import {createOriginalModelConnectionsApi} from '../../lib/originalModelConnectionsApi.ts'
import {createPgNativePilotApi} from '../../lib/pgNativePilotApi.ts'
import {createOriginalHomeAgentApi} from '../../lib/originalHomeAgentApi.ts'
import {createOriginalHomeInboxApi} from '../../lib/originalHomeInboxApi.ts'
import {createOriginalAgentRunTransport} from '../../lib/originalAgentRunTransport.ts'
import {createOriginalAgentRunSession} from '../../lib/originalAgentRunSession.ts'
import {getStudioAccountInfo,verifyStudioSession,redirectToRhLogin} from '../../lib/studioAuth.ts'
import {registerUnsavedWorkCheck} from '../../lib/unsavedNavigation.ts'
import {BUILTIN_TOOLS,FEEDBACK_TAGS,RUN_STATE_META} from '../../lib/runPresentation.ts'
import type {usePocketBaseAgentRun,AgentRunRow,RunEventRow} from './useAgentRun.ts'

type Controller=ReturnType<typeof createOriginalAgentRunSession>
type View=ReturnType<Controller['snapshot']>
type Draft={rating:''|'up'|'down';tags:string[];comment:string}
const emptyDraft=():Draft=>({rating:'',tags:[],comment:''})
/** Original AgentRunPage consumes exactly the existing hook presentation API. */
export type OriginalNativeRunInputView={pendingInput:string;pendingInputKind:'clarification'|'plan_review';replyText:string;setReplyText:(value:string)=>void;replyBusy:boolean;handleReply:(decision:'reply'|'approve'|'revise')=>Promise<void>}
export function usePgOriginalAgentRun():ReturnType<typeof usePocketBaseAgentRun>&OriginalNativeRunInputView{
 const [params,setParams]=useSearchParams(),[storedView,setView]=useState<View|null>(null),[initialError,setInitialError]=useState(''),[instruction,setInstruction]=useState(''),[maxSteps,setMaxSteps]=useState(10),[copied,setCopied]=useState(false),[feedbackDraft,setFeedbackDraft]=useState<Draft>(emptyDraft),[editing,setEditing]=useState(false),[controlBusy,setControlBusy]=useState<''|'pause'|'resume'|'cancel'>(''),[approvalBusy,setApprovalBusy]=useState<''|'approve'|'reject'>(''),[memoryDeletingId,setMemoryDeletingId]=useState(''),[replyText,setReplyText]=useState('')
 const accountId=getStudioAccountInfo()?.id??''
 const contextChanged=Boolean(storedView&&!storedView.closed&&storedView.employeeId!==accountId)
 const privacy=originalAgentRunPrivacy(storedView,accountId),view=privacy.hidden?null:storedView
 const local=originalAgentRunLocalView({instruction,maxSteps,feedbackDraft,replyText,copied,editing},privacy.hidden)
 const controller=useRef<Controller|null>(null),appliedRoute=useRef(''),copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null),lifecycle=useRef(0)
 useEffect(()=>{
  let cancelled=false,session:Controller|null=null,transport:ReturnType<typeof createOriginalAgentRunTransport>|null=null,unsubscribe:(()=>void)|undefined,unregister:(()=>void)|undefined
  const life=++lifecycle.current
  async function verify(){const status=await verifyStudioSession(),employee=getStudioAccountInfo();if(status==='unavailable'){session?.hidePrivateForIdentity();throw Error('original_agent_run_identity_unavailable')}const owner=status==='authenticated'&&employee?.active?employee.id:'';if(session&&owner!==session.snapshot().employeeId)session.hidePrivateForIdentity(true);return owner}
  let checking=false
  const checkOwner=()=>{if(cancelled||checking||document.hidden||!session||session.snapshot().closed)return;checking=true;void session.verifyIdentity().catch(()=>{}).finally(()=>{if(session?.snapshot().closed)transport?.close();checking=false})}
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(session?.navigationBlocked()){event.preventDefault();event.returnValue=''}}
  void(async()=>{
   try{
    const employee=await verify();if(cancelled)return;if(!employee)throw Error('original_agent_run_signed_out')
    transport=createOriginalAgentRunTransport({employeeId:employee,verifyEmployee:verify})
    session=createOriginalAgentRunSession({employeeId:employee,verifyEmployee:verify,api:createPgNativePilotApi(transport.transport),models:createOriginalModelConnectionsApi({employeeId:employee,transport:transport.transport}),home:createOriginalHomeAgentApi({employeeId:employee,transport:transport.transport}),inbox:createOriginalHomeInboxApi(employee,transport.transport),confirm:request=>window.confirm(request.description)})
    if(cancelled){session.dispose();transport.close();return}
    controller.current=session
    const publish=()=>{if(!cancelled&&lifecycle.current===life)setView(session!.snapshot())}
    unsubscribe=session.subscribe(publish);unregister=registerUnsavedWorkCheck(()=>session?.navigationBlocked()??false);publish();await session.activate();publish()
   }catch{if(!cancelled&&lifecycle.current===life)setInitialError('当前员工会话或原运行页 Native 接口尚未核实，请重新登录或刷新。')}
  })()
  window.addEventListener('beforeunload',beforeUnload)
  window.addEventListener('focus',checkOwner)
  const ownerTimer=window.setInterval(checkOwner,3000)
  return()=>{cancelled=true;++lifecycle.current;unsubscribe?.();unregister?.();window.clearInterval(ownerTimer);window.removeEventListener('focus',checkOwner);window.removeEventListener('beforeunload',beforeUnload);session?.dispose();transport?.close();if(controller.current===session)controller.current=null;if(copyTimer.current)clearTimeout(copyTimer.current)}
 },[])
 const canAct=()=>{const c=controller.current;return Boolean(c&&originalAgentRunPrivacy(c.snapshot(),getStudioAccountInfo()?.id??'').canAct)}
 useEffect(()=>{if(!privacy.clearLocal)return;setInstruction('');setMaxSteps(10);setFeedbackDraft(emptyDraft());setReplyText('');setEditing(false);setCopied(false);setControlBusy('');setApprovalBusy('');setMemoryDeletingId('');if(copyTimer.current){clearTimeout(copyTimer.current);copyTimer.current=null}},[privacy.clearLocal,accountId,storedView?.closed,storedView?.ownerChanged])
 const requestedSpec=params.get('spec')??'',requestedRun=params.get('run')??'',requestedKind=params.get('engine_kind')??params.get('kind')??''
 useEffect(()=>{
  const c=controller.current;if(!canAct()||!c||!view||view.loading||view.runs.loading||view.closed)return
  const key=[requestedSpec,requestedRun,requestedKind].join(':');if(appliedRoute.current===key)return
  appliedRoute.current=key
  if(requestedRun)void c.selectRun(requestedRun,requestedSpec||undefined,requestedKind).catch(()=>c.reportUnavailable('待办来源或当前运行尚未核实，未读取其他协议作为替代。'))
  else if(requestedSpec)void c.selectAgent(requestedSpec).catch(()=>c.reportUnavailable('助手或员工会话已变化，请重新读取。'))
 },[requestedSpec,requestedRun,requestedKind,view])
 const selectedSpecId=view?.selectedAgentId??'',selectedSpec=view?.agents.find(a=>a.id===selectedSpecId)??null,selectedNative=view?.nativeAgents.find(a=>a.id===selectedSpecId),binding=selectedNative?.spec.model_binding as {connection_id:string;connection_revision:number;model_id:string}|undefined
 const model=binding?'custom:'+binding.connection_id+':'+binding.model_id:''
 const activeRun=view?.activeRun&&(!requestedRun||view.activeRun.id===requestedRun)&&(!requestedSpec||view.activeRun.spec_id===requestedSpec)?view.activeRun:null,isLive=Boolean(activeRun&&['queued','running','paused','awaiting_approval','awaiting_input'].includes(activeRun.status))
 useEffect(()=>{
  const c=controller.current;if(!c||!activeRun||!isLive)return
  let busy=false;const poll=()=>{if(busy||document.hidden)return;busy=true;void c.poll().catch(()=>{}).finally(()=>{busy=false})}
  const timer=window.setInterval(poll,3000)
  return()=>window.clearInterval(timer)
 },[activeRun?.id,isLive])
 useEffect(()=>{setFeedbackDraft(emptyDraft());setEditing(false)},[activeRun?.id,view?.employeeId])
 const human=view?.runs.detail?.human_input_current?view.runs.detail.human_input:null
 useEffect(()=>setReplyText(''),[activeRun?.id,human?.pending_sha256,view?.employeeId])
 const report=(message:string)=>controller.current?.reportUnavailable(message)
 const unavailable=(name:string)=>()=>report(name+'尚缺原页面的同义 Native 合同，未提交操作。')
 const handleSelectSpec=(id:string)=>{const c=controller.current;if(!canAct()||!c)return;void c.selectAgent(id).then(()=>{if(c.snapshot().selectedAgentId===id)setParams(previous=>{const next=new URLSearchParams(previous);next.set('spec',id);next.delete('run');next.delete('kind');next.delete('engine_kind');return next},{replace:true})}).catch(()=>report('当前选择尚未核实，未切换到其他运行或助手。'))}
 const handleViewHistoryRun=async(row:AgentRunRow)=>{const c=controller.current;if(!canAct()||!c)return;return c.selectRun(row.id,row.spec_id).then(()=>{if(c.snapshot().activeRun?.id===row.id)setParams(previous=>{const next=new URLSearchParams(previous);next.set('run',row.id);next.set('spec',row.spec_id);next.set('engine_kind','agent_autonomous');return next},{replace:true})}).catch(()=>report('运行来源或员工会话已变化，未展示其他任务作为替代。'))}
 const handleControl=async(action:'pause'|'resume'|'cancel')=>{const c=controller.current;if(!canAct()||!c||controlBusy)return;setControlBusy(action);return c.control(action).catch(()=>report('控制结果尚未确认，请保留当前任务并核对原请求。')).finally(()=>{if(controller.current===c)setControlBusy('')})}
 const handleApproval=async(decision:'approve'|'reject')=>{const c=controller.current;if(!canAct()||!c||approvalBusy)return;setApprovalBusy(decision);return c.decide(decision).catch(()=>report('当前审批结果尚未确认，请刷新核对原步骤。')).finally(()=>{if(controller.current===c)setApprovalBusy('')})}
 const handleSubmitFeedback=async()=>{const c=controller.current;if(!canAct()||!c||!feedbackDraft.rating)return;const submittedRunId=c.snapshot().activeRun?.id;return c.submitFeedback({rating:feedbackDraft.rating,tags:[...feedbackDraft.tags],comment:feedbackDraft.comment.trim()}).then(()=>{if(controller.current===c&&c.snapshot().activeRun?.id===submittedRunId&&c.snapshot().feedback.status?.state==='active')setEditing(false)}).catch(()=>report('反馈结果尚未确认，再次提交只会核对原请求。'))}
 const handleDeleteMemory=async(id:string)=>{const c=controller.current;if(!canAct()||!c||memoryDeletingId)return;setMemoryDeletingId(id);return c.forgetMemory(id).catch(()=>report('记忆删除结果尚未确认，再次操作只会核对原请求。')).finally(()=>{if(controller.current===c)setMemoryDeletingId('')})}
 const handleCopyResult=()=>{const c=controller.current;if(!c||!canAct())return;void c.readResultForCopy().then(async text=>{if(!text||controller.current!==c||!canAct())return;await navigator.clipboard.writeText(text);if(controller.current!==c||!canAct())return;setCopied(true);copyTimer.current=setTimeout(()=>setCopied(false),2000)}).catch(()=>report('当前来源或权限尚未核实，未复制旧正文。'))}
 const customModels=(view?.models??[]).filter(c=>c.enabled&&c.status==='ok').flatMap(c=>c.models.map(id=>({value:'custom:'+c.id+':'+id,label:id,hint:c.provider+' · '+c.name+' · 第'+c.revision+'版'})))
 const stopCondition=selectedSpec?.spec.done_criteria.join('；')??''
 return{
  isLoggedIn:Boolean(view?.employeeId)&&!view?.closed,needsRhLogin:privacy.hidden||Boolean(initialError),onLoginClick:redirectToRhLogin,errorMsg:[initialError,contextChanged?'员工身份尚未核实，旧页面数据已隐藏。':'',privacy.hidden?storedView?.error:view?.error,view?.notice].filter(Boolean).join(' '),dismissError:()=>{setInitialError('');controller.current?.dismissError()},specList:view?.agents??[],isLoadingSpecs:!view||view.loading,selectedSpecId,selectedSpec,handleSelectSpec,
  customModels,genWfBusy:false,handleGenerateWorkflow:async()=>unavailable('从当前原页面发起工作流生成及费用预览')(),isCustomModel:Boolean(binding),model,setModel:value=>{const next=typeof value==='function'?value(model):value;if(next!==model)report('本次临时模型覆盖没有同义合同。请在原助手配置中保存本人模型及版本后刷新，未改动当前绑定。')},builtinTools:BUILTIN_TOOLS,enabledTools:(selectedNative?.spec.tools as string[]|undefined)??[],handleToggleTool:unavailable('本次运行临时工具覆盖'),maxSteps:local.maxSteps,setMaxSteps:value=>{if(canAct())setMaxSteps(value)},
  stopCondition,setStopCondition:value=>{const next=typeof value==='function'?value(stopCondition):value;if(next!==stopCondition)report('本次临时停止条件没有同义合同。请先在原助手配置中保存完成标准。')},stopOnComplete:true,setStopOnComplete:value=>{const next=typeof value==='function'?value(true):value;if(!next)report('Native 任务按自身完成规则结束；旧 stop_on_complete 临时覆盖尚无同义合同。')},instruction:local.instruction,setInstruction:value=>{if(canAct())setInstruction(value)},isStarting:privacy.hidden||Boolean(view?.runs.busy),handleRun:()=>{if(!canAct())return;void controller.current?.submit(instruction,maxSteps).catch(()=>report('提交结果尚未确认。保留原请求，不会创建第二次运行。'))},activeRun,runEvents:[] as RunEventRow[],isLive,controlBusy:privacy.hidden?'':controlBusy,handleControl,runStateMeta:RUN_STATE_META,handleCopyResult,copiedFlag:local.copied,runHistory:view?.runHistory??[],handleViewHistoryRun,
  priceHint:'最多 '+local.maxSteps+' 轮；后续模型或外部工具需独立费用预览。当前原审批卡尚未接通费用预览，相关调用保持阻断。',requireApproval:true,handleToggleRequireApproval:()=>report('Native 后台要求逐步审批；此开关不能撤销服务端审批要求。'),pendingApproval:view?.pendingApproval??null,approvalBusy:privacy.hidden?'':approvalBusy,handleApproval,harnessLine:activeRun?'后台已完成模型轮次 '+activeRun.current_step+' / '+activeRun.max_steps+'；金额与工具预算另行核对。':null,
  memoryList:(view?.memories.items??[]).map(m=>({id:m.id,spec_id:selectedSpecId,fact:m.fact,tools_used:m.tools_used,run_id:m.run_id??'',kind:m.kind,created:m.created_at})),isLoadingMemories:privacy.hidden||Boolean(view?.memories.loading),memoryDeletingId:privacy.hidden?'':memoryDeletingId,handleDeleteMemory,evalBusy:false,handleEvaluate:unavailable('原评估卡的来源预览、模型及费用确认'),feedbackDraft:local.feedbackDraft,feedbackBusy:privacy.hidden||Boolean(view?.feedback.busy),feedbackEditing:local.editing,feedbackTagOptions:FEEDBACK_TAGS,
  handleSelectFeedbackRating:rating=>{if(!canAct())return;setFeedbackDraft(d=>({...d,rating}))},handleToggleFeedbackTag:tag=>{if(!canAct())return;setFeedbackDraft(d=>({...d,tags:d.tags.includes(tag)?d.tags.filter(t=>t!==tag):[...d.tags,tag]}))},handleFeedbackCommentChange:comment=>{if(canAct())setFeedbackDraft(d=>({...d,comment}))},handleSubmitFeedback,handleEditFeedback:()=>{if(!canAct())return;const current=activeRun?.feedback;setFeedbackDraft(current?{rating:current.rating,tags:[...current.tags],comment:current.comment}:emptyDraft());setEditing(true)},handleCancelFeedbackEdit:()=>{setEditing(false);setFeedbackDraft(emptyDraft())},
  pendingInput:human?[human.question,human.draft].filter(Boolean).join('\n\n'):'',pendingInputKind:human?.kind??'clarification',replyText:local.replyText,setReplyText:value=>{if(canAct())setReplyText(value)},replyBusy:privacy.hidden||Boolean(view?.runs.busy||view?.runs.pendingHumanResponse),handleReply:async decision=>{const c=controller.current;if(!canAct()||!c)return;await c.respond(decision,replyText).catch(()=>report('人员回复结果尚未确认，请核对原问题与原回复回执。'))},
  optimizeBusy:false,optimizeSuggestion:null,optimizeError:'',applyBusy:false,handleOptimizeSpec:unavailable('原优化卡的本人反馈选择、预览和费用确认'),handleApplyOptimize:async()=>unavailable('原优化意见的版本化预览及接受')(),handleDiscardOptimize:()=>{},dismissOptimizeError:()=>controller.current?.dismissError(),
 }
}
