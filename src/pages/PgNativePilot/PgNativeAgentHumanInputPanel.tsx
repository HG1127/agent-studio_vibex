import {useEffect,useState} from "react"
import type {DurableDetail,PendingHumanResponse} from "@/lib/pgNativeDurableRunSession"
import type {AgentHumanResponse} from "@/lib/pgNativeAgentHumanInput"
const primary="min-h-10 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
const secondary="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
export default function PgNativeAgentHumanInputPanel({detail,pendingResponse,active,enabled,locked,onRespond,onConfirm}:{
  detail:DurableDetail|null;pendingResponse:PendingHumanResponse|null;active:boolean;enabled:boolean;locked:boolean;
  onRespond:(decision:AgentHumanResponse["decision"],answer:string,confirmed:boolean)=>void;onConfirm:()=>void
}){
  const pending=detail?.human_input
  const scope=detail?.run.id+":"+pending?.pending_step_key+":"+pending?.pending_sha256+":"+pending?.source_sha256
  const [answer,setAnswer]=useState(""),[consent,setConsent]=useState("")
  useEffect(()=>{setAnswer("");setConsent("")},[scope,active])
  if(pendingResponse)return <section aria-label="核对上次人工回复" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
    <h3 className="font-semibold">上次回复结果尚未确认</h3>
    <p className="text-sm leading-6">已保留原来的{pendingResponse.choice.decision==="approve"?"方案批准":pendingResponse.choice.decision==="revise"?"方案修改意见":"问题回复"}。核对只查询原回复的登记结果。</p>
    {pendingResponse.choice.answer&&<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 font-sans text-sm">{pendingResponse.choice.answer}</pre>}
    <button type="button" className={secondary} disabled={!active||locked} onClick={onConfirm}>核对上次人工回复</button>
  </section>
  if(detail?.run.status!=="awaiting_input")return null
  if(!pending||detail.human_input_current!==true)return <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">当前问题的来源或授权已变化，请刷新并核对任务配置。</p>
  const plan=pending.kind==="plan_review",ready=active&&enabled&&!locked,confirmed=consent===scope
  return <section aria-label={plan?"Agent 方案审核":"Agent 待你回复"} className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-5">
    <h3 className="font-semibold">第 {pending.round} 轮 · {plan?"方案审核":"待你回复"}</h3>
    <p className="whitespace-pre-wrap break-words text-sm leading-6">{pending.question}</p>
    {plan&&pending.draft&&<div><h4 className="mb-2 text-sm font-semibold">本次方案草案</h4>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-sans text-sm leading-6">{pending.draft}</pre></div>}
    <p className="text-sm leading-6 text-slate-500">回复或批准方案后，后续模型调用和工具操作仍需分别核对费用与执行范围。</p>
    {!enabled&&<p role="status" className="text-sm text-amber-900">当前环境未开放人工回复。可继续查看任务或核对已提交的回复。</p>}
    <label className="block text-sm font-medium">{plan?"方案修改意见或批准备注":"回复内容"}
      <textarea aria-label={plan?"方案修改意见或批准备注":"回复内容"} rows={4} maxLength={1600} disabled={!ready}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm disabled:bg-slate-50" value={answer}
        onChange={event=>{setAnswer(event.target.value);setConsent("")}}/>
    </label>
    <p className="text-xs text-slate-500">{answer.length}/1600 · {plan?"修改方案需填写意见；批准备注可留空。":"请填写当前问题需要的补充信息。"}</p>
    <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" disabled={!ready} checked={confirmed}
      onChange={event=>setConsent(event.target.checked?scope:"")}/>{plan?"我已审阅当前方案，并确认下方所选处理。":"我已核对当前问题和本次回复内容。"}</label>
    <div className="flex flex-wrap gap-2">{plan?<>
      <button type="button" className={primary} disabled={!ready||!confirmed} onClick={()=>onRespond("approve",answer,confirmed)}>批准此方案</button>
      <button type="button" className={secondary} disabled={!ready||!confirmed||!answer.trim()} onClick={()=>onRespond("revise",answer,confirmed)}>提交修改意见</button>
    </>:<button type="button" className={primary} disabled={!ready||!confirmed||!answer.trim()} onClick={()=>onRespond("reply",answer,confirmed)}>提交本次回复</button>}</div>
  </section>
}
