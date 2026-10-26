import {useEffect,useRef,useState,type FormEvent} from "react"
import type {createPgNativePilotApi,PgNativeAgentSafeText} from "@/lib/pgNativePilotApi"
import {createPgNativeOptimizationSession,emptyOptimizationView} from "@/lib/pgNativeAgentOptimizationSession"
import {optimizationRoleSpec} from "@/lib/pgNativeAgentOptimization"
import PgNativeAgentSafeFields,{PgNativeAgentSafeTextView} from "./PgNativeAgentSafeFields"

type Controller=ReturnType<typeof createPgNativeOptimizationSession>
const button="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-50"
const emptyText=():PgNativeAgentSafeText=>({goal:"",task_scope:"",deliverables:[],task_plan:[],done_criteria:[]})
const labels:Record<string,string>={name:"名称",goal:"目标",task_scope:"任务范围",deliverables:"交付物",task_plan:"任务计划",done_criteria:"完成标准",tools:"工具",knowledge_base_ids:"知识库",require_plan_review:"方案审核",model_binding:"模型绑定",http_tools:"HTTP 工具绑定",mcp_tools:"MCP 工具绑定",knowledge_retrieval:"知识检索设置"}
function resources(spec:ReturnType<typeof optimizationRoleSpec>){return <ul className="space-y-1 text-xs leading-5 text-slate-600"><li>模型：{spec.model_binding?.model_id??"未绑定"}{spec.model_binding?" · 连接版本 "+spec.model_binding.connection_revision:""}</li><li>工具：{spec.tools.join("、")||"未选择"}</li><li>知识库：{spec.knowledge_base_ids.length} 个；HTTP 工具：{spec.http_tools?.length??0} 个；MCP 工具：{spec.mcp_tools?.length??0} 个。</li><li>方案审核：{spec.require_plan_review?"需要本人审核":"无需方案审核"}；任务步骤继续由本人审批。</li></ul>}
export default function PgNativeAgentOptimizationPanel({api,runId,runStatus,active,available,acceptEnabled,onExpired,onChanged}:{api:ReturnType<typeof createPgNativePilotApi>;runId:string|null;runStatus:string;active:boolean;available:boolean;acceptEnabled:boolean;onExpired:()=>void;onChanged:()=>void}){
  const controller=useRef<Controller|null>(null),[view,setView]=useState(emptyOptimizationView),[opened,setOpened]=useState(available)
  const [name,setName]=useState(""),[text,setText]=useState(emptyText),[review,setReview]=useState<boolean|undefined>(),[confirmed,setConfirmed]=useState(false)
  useEffect(()=>{
    const current=createPgNativeOptimizationSession(api,{onExpired,onChanged});controller.current=current;setView(current.snapshot())
    const unsubscribe=current.subscribe(()=>setView(current.snapshot()))
    return()=>{unsubscribe();current.dispose();if(controller.current===current)controller.current=null}
  },[api,onExpired,onChanged])
  useEffect(()=>{controller.current?.setScopes({available,accept:acceptEnabled});if(available)setOpened(true)},[available,acceptEnabled,api,onExpired,onChanged])
  useEffect(()=>{controller.current?.setActive(active)},[active,api,onExpired,onChanged])
  useEffect(()=>{setConfirmed(false)},[acceptEnabled])
  useEffect(()=>{if(active&&available)void controller.current?.select(runId)},[active,available,runId,runStatus,api,onExpired,onChanged])
  const role=view.role,scope=role?role.id+":"+role.revision+":"+role.source_sha256:""
  useEffect(()=>{
    setName(role?.name??"");setText(role?{goal:role.spec.goal,task_scope:role.spec.task_scope,deliverables:[...role.spec.deliverables],task_plan:[...role.spec.task_plan],done_criteria:[...role.spec.done_criteria]}:emptyText());setReview(role?.spec.require_plan_review);setConfirmed(false)
    // A role source/version change resets the local editor and confirmation.
    // These primitives identify every complete server role snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active,available,scope])
  if(!active||!available&&!opened)return null
  if(!available)return <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">角色修改暂不可用，刷新后可继续核对原接受请求。</p>
  const locked=view.loading||view.busy||Boolean(view.pending),currentFeedback=view.feedback?.state==="active"&&Boolean(view.feedback.current?.body)
  const changed=()=>{setConfirmed(false);controller.current?.invalidatePreview()}
  const prepare=async(event:FormEvent)=>{
    event.preventDefault();if(!role||locked)return
    const {require_approval:_,...stored}=role.spec
    await controller.current?.prepare({name,spec:{...stored,...text,...(review===undefined?{}:{require_plan_review:review})}})
    setConfirmed(false)
  }
  return <section aria-label="根据反馈修改角色" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">根据反馈修改角色</h3><button type="button" className={button} disabled={locked||!view.runId} onClick={()=>{setConfirmed(false);void controller.current?.refresh()}}>读取当前反馈与角色</button></div>
    <p className="text-sm leading-6 text-slate-500">结合本人的任务反馈手工调整角色。预览后明确接受，才会更新角色并保留前后版本；本次修改不会调用模型。</p>
    {view.error?<p role="alert" className="text-sm text-rose-800">{view.error}</p>:null}
    {view.notice?<p role="status" className="text-sm text-emerald-800">{view.notice}</p>:null}
    {view.loading?<p role="status" className="text-sm text-slate-500">正在核对本人反馈与角色…</p>:null}
    {!view.runId?<p className="text-sm text-slate-500">选择本人已结束的任务后，可核对反馈和角色修改。</p>:null}
    {role?<>
      <p className="text-sm text-slate-600">当前角色：{role.name} · 版本 {role.revision}</p>
      {view.feedback?.current?.body?<div aria-label="此次修改参考的反馈" className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm"><p className="font-medium">{view.feedback.current.body.rating==="up"?"满意":"需要改进"}</p><p className="whitespace-pre-wrap break-words">{view.feedback.current.body.comment||"未填写补充意见"}</p></div>:<p className="text-sm text-slate-500">提交任务反馈后，读取当前反馈与角色即可准备修改。</p>}
      {!view.canAccept?<p role="status" className="text-sm text-amber-900">当前未开放新的角色接受，已有接受记录仍可核对。</p>:null}
      <form onSubmit={prepare} className="space-y-3">
        <fieldset disabled={locked||!currentFeedback} className="space-y-3">
          <legend className="sr-only">准备反馈角色修改</legend>
          <label className="block text-sm font-medium">角色修改名称<input aria-label="角色修改名称" required maxLength={120} value={name} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" onChange={e=>{setName(e.target.value);changed()}}/></label>
          <PgNativeAgentSafeFields key={scope+":"+active} value={text} disabled={locked||!currentFeedback} onChange={value=>{setText(value);changed()}}/>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="修改后需要本人审核方案" checked={review===true} onChange={e=>{setReview(e.target.checked);changed()}}/>修改后需要本人审核方案。</label>
          <details className="rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-medium">本次保留的模型、工具与知识配置</summary><div className="mt-2">{resources(role.spec)}</div></details>
        </fieldset>
        <button type="submit" className={button} disabled={locked||!currentFeedback||!name.trim()||!text.goal.trim()}>预览这次角色修改</button>
      </form>
    </>:null}
    {view.preview?<div aria-label="角色修改预览" className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <h4 className="text-sm font-semibold">此次变更：{view.preview.changed_keys.map(k=>labels[k]).join("、")}</h4>
      <div className="grid gap-4 md:grid-cols-2"><div className="min-w-0 space-y-2"><p className="text-sm font-medium">修改前 · 版本 {view.preview.before.revision}</p><p className="text-sm">{view.preview.before.name}</p><PgNativeAgentSafeTextView value={view.preview.before.spec}/>{resources(view.preview.before.spec)}</div><div className="min-w-0 space-y-2"><p className="text-sm font-medium">待接受的角色</p><p className="text-sm">{view.preview.candidate.name}</p><PgNativeAgentSafeTextView value={view.preview.candidate.spec}/>{resources(view.preview.candidate.spec)}</div></div>
      <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" aria-label="确认接受这次反馈角色修改" disabled={locked||!view.canAccept} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>确认接受以上修改，并关联此次反馈及前后角色版本。</label>
      <button type="button" className={button} disabled={locked||!view.canAccept||!confirmed} onClick={()=>void controller.current?.accept(confirmed)}>接受这次角色修改</button>
    </div>:null}
    {view.pending?<div role="status" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm leading-6"><p>上次角色修改结果尚未确认，原候选已保留。</p><p className="break-all text-xs">原任务编号：{view.pending.run_id}</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={view.busy} onClick={()=>void controller.current?.confirm()}>核对原角色接受请求</button><button type="button" className={button} disabled={view.busy} onClick={()=>void controller.current?.retrySameRequest()}>重交同一角色接受请求</button></div></div>:null}
    {view.history?<div className="space-y-2" aria-label="反馈角色接受记录"><h4 className="text-sm font-medium">反馈角色接受记录</h4>{!view.history.items.length?<p className="text-sm text-slate-500">暂无接受记录。</p>:<ul className="space-y-2">{view.history.items.map(item=><li key={item.request_id} className="space-y-1 rounded-xl border border-slate-200 p-3 text-sm"><p>角色版本 {item.before_spec_revision} → {item.after_spec_revision} · {item.changed_keys.map(k=>labels[k]).join("、")}</p><p className="text-xs text-slate-500">{item.feedback_unchanged?"参考反馈仍为原版本":"参考反馈已修改或删除"}；{item.role_current?"当前角色仍为此次接受版本":"角色已有后续修改"}。</p><p className="break-all text-xs text-slate-400">接受编号：{item.request_id}</p></li>)}</ul>}</div>:null}
  </section>
}
