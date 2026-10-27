import {useEffect,useRef,useState} from "react"
import {agentGeneratedCanonical,agentGeneratedDescriptiveKeys,type PgNativeAgentGeneratedAcceptanceApi,type PgNativeAgentGeneratedTarget,type PgNativeAgentGeneratedPreview} from "@/lib/pgNativeAgentGeneratedAcceptance"
import {createPgNativeAgentGeneratedAcceptanceSession,emptyAgentGeneratedAcceptanceView} from "@/lib/pgNativeAgentGeneratedAcceptanceSession"

type Props={api:PgNativeAgentGeneratedAcceptanceApi;ownerId:string;target:PgNativeAgentGeneratedTarget|null;available:boolean;acceptanceEnabled:boolean;active:boolean;onExpired:()=>void}
type Controller=ReturnType<typeof createPgNativeAgentGeneratedAcceptanceSession>
const button="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
const labels={goal:"目标",task_scope:"任务范围",deliverables:"交付内容",task_plan:"任务计划",done_criteria:"完成标准"}
function Comparison({preview}:{preview:PgNativeAgentGeneratedPreview}){
  const display=(value:string|string[])=>typeof value==="string"?<p className="whitespace-pre-wrap break-words">{value||"（空）"}</p>:value.length?<ol className="list-decimal space-y-2 pl-5">{value.map((item,i)=><li key={i} className="whitespace-pre-wrap break-words">{item||"（空项）"}</li>)}</ol>:<p>（空列表）</p>
  return <section aria-label="生成建议的完整配置对比" className="space-y-4">
    {agentGeneratedDescriptiveKeys.map(key=><section key={key} aria-label={labels[key]+"修改对比"} className="rounded-xl border border-slate-200 p-4">
      <h4 className="font-medium">{labels[key]}{preview.changed_keys.includes(key)?" · 将修改":" · 保持一致"}</h4>
      <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2"><div className="min-w-0 space-y-2"><h5 className="text-xs text-slate-500">修改前</h5>{display(preview.before.descriptive[key])}</div><div className="min-w-0 space-y-2"><h5 className="text-xs text-slate-500">接受后</h5>{display(preview.candidate.descriptive[key])}</div></div>
    </section>)}
  </section>
}
/** Foundation only: parent owns API transport and later page mounting. */
export default function PgNativeAgentGeneratedAcceptancePanel({api,ownerId,target,available,acceptanceEnabled,active,onExpired}:Props){
  const controller=useRef<Controller|null>(null)
  const [state,setState]=useState({api,ownerId,view:emptyAgentGeneratedAcceptanceView()}),[consent,setConsent]=useState("")
  const view=state.api===api&&state.ownerId===ownerId?state.view:emptyAgentGeneratedAcceptanceView()
  const targetKey=target?[target.review_id,target.spec_id,target.target_run_id].join(":"):""
  useEffect(()=>{
    const current=createPgNativeAgentGeneratedAcceptanceSession(api,{onExpired});controller.current=current
    const publish=()=>setState({api,ownerId,view:current.snapshot()});const unsubscribe=current.subscribe(publish)
    return()=>{unsubscribe();current.dispose();if(controller.current===current)controller.current=null}
  },[api,ownerId,onExpired])
  useEffect(()=>{controller.current?.setActive(active)},[active,api,ownerId,onExpired])
  useEffect(()=>{controller.current?.setScopes({available,acceptance:acceptanceEnabled})},[available,acceptanceEnabled,api,ownerId,onExpired])
  useEffect(()=>{
    if(!active||view.pending||view.busy)return
    void controller.current?.select(target?{review_id:target.review_id,spec_id:target.spec_id,target_run_id:target.target_run_id}:null)
  },[active,target,targetKey,view.pending,view.busy,api,ownerId,onExpired])
  const matches=Boolean(target&&view.target&&view.target.review_id===target.review_id&&view.target.spec_id===target.spec_id&&view.target.target_run_id===target.target_run_id)
  const preview=matches?view.preview:null,receipt=matches?view.receipt:null
  const consentScope=active&&available&&acceptanceEnabled&&preview?ownerId+":"+targetKey+":"+agentGeneratedCanonical(preview):"",confirmed=Boolean(consentScope&&consent===consentScope)
  const locked=view.loading||view.busy||Boolean(view.pending)
  if(!active)return null
  return <section aria-label="接受生成建议修改角色" className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-5">
    <div><h3 className="font-semibold">接受完整建议，修改角色描述</h3><p className="mt-2 text-sm leading-6 text-slate-600">仅接受本人的完整五项优化描述。角色名称、模型、工具、知识库及审批权限保持原样；工具说明不会授予执行权限。</p></div>
    <p className="text-sm leading-6 text-slate-600">模型费用确认与本次配置修改分别确认。接受后配置和修改历史独立保留，删除意见正文不会撤销已接受的修改。</p>
    {view.error?<p role="alert" className="text-sm text-rose-800">{view.error}</p>:null}
    {view.notice?<p role="status" className="text-sm text-emerald-800">{view.notice}</p>:null}
    {!available?<p role="status" className="text-sm text-amber-900">当前环境暂未开放生成建议接受入口；已知原请求仍可明确核对。</p>:!acceptanceEnabled?<p role="status" className="text-sm text-amber-900">当前未开放新的配置修改，可继续预览或读取已有接受回执。</p>:null}
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!matches||locked||!available||Boolean(receipt)} onClick={()=>{setConsent("");void controller.current?.prepare()}}>预览完整建议对角色的修改</button><button type="button" className={button} disabled={!matches||locked} onClick={()=>{setConsent("");void controller.current?.refreshReceipt()}}>读取已有配置接受回执</button></div>
    {view.loading?<p role="status" className="text-sm text-slate-500">正在核对配置来源与接受记录…</p>:null}
    {preview?<><p className="text-xs text-slate-500">当前配置修订 {preview.before.revision} · 将完整替换下列五项描述。</p><Comparison preview={preview}/>
      <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" aria-label="确认接受本次完整生成建议修改角色" className="mt-1.5" checked={confirmed} disabled={locked||!view.canAccept} onChange={event=>setConsent(event.target.checked?consentScope:"")}/>我已核对完整前后对比，同意仅将这份建议的五项描述应用到角色。</label>
      <button type="button" className={button} disabled={locked||!view.canAccept||!confirmed} onClick={()=>{if(confirmed&&view.canAccept&&!locked){setConsent("");void controller.current?.accept(true)}}}>确认接受并修改角色描述</button>
    </>:null}
    {view.pending?<section aria-label="待核对的原配置接受请求" className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm leading-6">
      <h4 className="font-medium">{view.pending.unknown?"配置修改结果尚未确认":"正在处理这次配置修改"}</h4><p className="break-all text-xs">原请求编号：{view.pending.original.request_id}<br/>原意见编号：{view.pending.original.review_id}</p><p>保留原请求和原选择。核对只查询登记结果；重交只发送同一编号和完全相同的请求。</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={view.busy} onClick={()=>void controller.current?.confirm()}>核对原配置接受请求</button><button type="button" className={button} disabled={view.busy} onClick={()=>void controller.current?.retrySameRequest()}>重交完全相同的配置接受请求</button></div>
    </section>:null}
    {receipt?<section aria-label="生成建议配置接受回执" className="space-y-2 rounded-xl bg-emerald-50 p-4 text-sm leading-6"><h4 className="font-medium">已记录独立的角色配置修改</h4><p>修订 {receipt.before.revision} → {receipt.after.revision}</p><p className="break-all text-xs">接受请求：{receipt.request_id}<br/>原意见：{receipt.source.review_id}</p><p>接受时间：<time dateTime={receipt.created_at}>{new Date(receipt.created_at).toLocaleString("zh-CN")}</time></p><p>此回执证明当时已提交配置修改；当前角色和意见正文是否可读，须分别核对。删除意见正文不会回滚这次修改。</p></section>:null}
  </section>
}
