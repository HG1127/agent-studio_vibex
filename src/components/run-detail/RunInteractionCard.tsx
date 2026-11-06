import {useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {createOriginalRunInteraction} from '../../lib/originalRunInteraction.ts'
import {createOriginalRunInteractionApi} from '../../lib/originalRunInteractionApi.ts'
import {getStudioAccountInfo,verifyStudioSession} from '../../lib/studioAuth.ts'
import {getStudioBackend} from '../../lib/studioBackend.ts'
import {registerUnsavedWorkCheck} from '../../lib/unsavedNavigation.ts'
type Controller=ReturnType<typeof createOriginalRunInteraction>
type View=ReturnType<Controller['snapshot']>
const button='rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50'
const primary=button+' bg-primary text-primary-foreground'
export function RunInteractionCard({employee,run,sourceAllowed,parentLoading,sourceStamp,onBlocked}:{employee:string;run:string;sourceAllowed:boolean;parentLoading:boolean;sourceStamp:string;onBlocked:(value:boolean)=>void}){
 const ref=useRef<Controller|null>(null),stamp=useRef(sourceStamp),[view,setView]=useState<View|null>(null)
 useEffect(()=>{let closed=false;async function verify(){if(getStudioBackend()!=='native_pg')return '';const status=await verifyStudioSession();if(status==='unavailable')throw Error('interaction_identity_unavailable');const account=getStudioAccountInfo();return status==='authenticated'&&account?.active?account.id:''}const key='agentstudio.original.run-interaction.v1.'+employee+'.'+run,api=createOriginalRunInteractionApi({employee,run,verifyEmployee:verify}),controller=createOriginalRunInteraction({employee,run,api,verifyEmployee:verify,storage:{read:()=>sessionStorage.getItem(key),write:value=>sessionStorage.setItem(key,value),remove:()=>sessionStorage.removeItem(key)}});ref.current=controller;const update=()=>{if(!closed&&ref.current===controller){setView(controller.snapshot());onBlocked(controller.navigationBlocked())}},unsubscribe=controller.subscribe(update),unregister=registerUnsavedWorkCheck(()=>controller.navigationBlocked());const focus=()=>{controller.hidePrivate();void controller.refresh()},visible=()=>{if(document.hidden)controller.hidePrivate();else focus()},unload=(e:BeforeUnloadEvent)=>{if(controller.navigationBlocked()){e.preventDefault();e.returnValue=''}};update();void controller.refresh();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);window.addEventListener('beforeunload',unload);return()=>{closed=true;unsubscribe();unregister();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);window.removeEventListener('beforeunload',unload);controller.dispose();if(ref.current===controller)ref.current=null;onBlocked(false)}},[employee,run,onBlocked])
 useEffect(()=>{if(sourceStamp&&stamp.current!==sourceStamp){stamp.current=sourceStamp;void ref.current?.refresh()}},[sourceStamp])
 useEffect(()=>{if(!sourceAllowed&&!parentLoading)ref.current?.hidePrivate()},[sourceAllowed,parentLoading])
 const account=getStudioAccountInfo(),current=view?.employee===employee&&view.run===run&&account?.active&&account.id===employee?view:null,state=current?.state,locked=Boolean(!current||current.busy||current.loading||current.pending),allowed=Boolean(sourceAllowed&&current?.visible),approval=allowed?state?.approval:null,human=allowed?state?.human_input:null
 const act=(work:(c:Controller)=>Promise<void>)=>{const c=ref.current;if(c)void work(c).catch(()=>c.hidePrivate())}
 return <section aria-label="当前运行审批与回复" className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">当前运行审批与回复</h2><button type="button" className={button} disabled={!current||current.busy||current.loading} onClick={()=>act(c=>c.refresh())}>刷新待确认步骤</button></div>
  {current?.error&&<p role="alert" className="text-sm text-destructive">{current.error}</p>}
  {current?.pending?<div role="status" className="space-y-3 text-sm"><p>原操作结果尚未确认。只核对原来的操作结果，不会重新发送审批或回复。</p><button type="button" className={button} disabled={current.busy} onClick={()=>act(c=>c.confirmPending())}>核对原审批或回复结果（不重发）</button></div>:<>
   {!allowed&&<p role="status" className="text-sm text-muted-foreground">当前来源或员工身份尚未核实，私有审批与回复正文已隐藏。</p>}
   {approval&&<div aria-label="原运行当前步骤审批" className="space-y-3">
    <h3 className="text-sm font-semibold">{approval.kind==='model'?'模型调用':approval.kind==='agent'?'启动当前助手':'工具调用'}</h3>
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-secondary p-3 text-xs">{JSON.stringify({input:approval.input,configuration:approval.configuration,resources:approval.review},null,2)}</pre>
    {approval.possible_charges&&<p className="text-sm">本次调用可能产生费用；当前未提供金额估算。请核对输入、模型和数据发送范围。</p>}
    {approval.kind==='agent'&&<p className="text-sm text-muted-foreground">这里只批准启动当前助手，后续模型与工具仍须逐步批准。</p>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={Boolean(current?.feeConfirmed)} disabled={locked||!state?.writes_enabled} onChange={e=>ref.current?.setFeeConfirmed(e.target.checked)}/>我已核对当前步骤、数据发送范围及可能产生的费用。</label>
    {approval.knowledge_charge_required&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={Boolean(current?.knowledgeConfirmed)} disabled={locked||!state?.writes_enabled} onChange={e=>ref.current?.setKnowledgeConfirmed(e.target.checked)}/>我确认本次知识语义查询可能产生费用。</label>}
    <div className="flex gap-2"><button type="button" className={primary} disabled={locked||!state?.writes_enabled||!current?.feeConfirmed||approval.knowledge_charge_required&&!current?.knowledgeConfirmed} onClick={()=>act(c=>c.decide('approved'))}>批准并继续执行</button><button type="button" className={button} disabled={locked||!state?.writes_enabled} onClick={()=>act(c=>c.decide('rejected'))}>拒绝这次调用</button></div>
   </div>}
   {human&&<div aria-label="原运行当前人工回复" className="space-y-3"><h3 className="text-sm font-semibold">{human.kind==='plan_review'?'方案审核':'待你回复'}</h3><p className="whitespace-pre-wrap text-sm">{human.question}</p>{human.draft&&<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-secondary p-3 text-sm">{human.draft}</pre>}
    <label className="block text-sm">{human.kind==='plan_review'?'方案修改意见或批准备注':'回复内容'}<textarea aria-label={human.kind==='plan_review'?'方案修改意见或批准备注':'回复内容'} className="mt-2 w-full rounded-lg border border-input bg-background p-3" rows={4} maxLength={1600} value={current?.answer??''} disabled={locked||!state?.writes_enabled||!state?.human_enabled} onChange={e=>ref.current?.setAnswer(e.target.value)}/></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={Boolean(current?.humanConfirmed)} disabled={locked||!state?.human_enabled} onChange={e=>ref.current?.setHumanConfirmed(e.target.checked)}/>我已核对当前问题、方案及本次回复。</label><p className="text-xs text-muted-foreground">回复或批准方案不授权后续模型、工具调用或费用。</p>
    <div className="flex gap-2">{human.kind==='plan_review'?<><button type="button" className={primary} disabled={locked||!state?.human_enabled||!current?.humanConfirmed} onClick={()=>act(c=>c.respond('approve'))}>批准此方案</button><button type="button" className={button} disabled={locked||!state?.human_enabled||!current?.humanConfirmed||!current?.answer.trim()} onClick={()=>act(c=>c.respond('revise'))}>提交修改意见</button></>:<button type="button" className={primary} disabled={locked||!state?.human_enabled||!current?.humanConfirmed||!current?.answer.trim()} onClick={()=>act(c=>c.respond('reply'))}>提交本次回复</button>}</div>
   </div>}
   {allowed&&!approval&&!human&&<p role="status" className="text-sm text-muted-foreground">当前没有等待你处理的审批或回复。</p>}
  </>}
  {allowed&&state?.spec_id&&!current?.pending&&<Link className="inline-block text-sm text-primary underline" to={'/version-release?spec='+state.spec_id+'&testRun='+run}>返回版本验收</Link>}
 </section>
}
