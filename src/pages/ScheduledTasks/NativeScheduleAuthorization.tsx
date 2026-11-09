import type {ScheduleAuthorizationDraft} from '@/lib/originalSchedules'
import {FORM_CLASS,LABEL_CLASS} from './types'
export function NativeScheduleAuthorization(p:{value:ScheduleAuthorizationDraft;executionEnabled:boolean;recheck():Promise<void>;pinsCurrent:boolean;set:<K extends keyof ScheduleAuthorizationDraft>(key:K,value:ScheduleAuthorizationDraft[K])=>void}){
 const a=p.value
 return <section className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs" aria-label="后台执行授权范围">
  <button type="button" onClick={()=>void p.recheck()} className="rounded-lg border border-border px-3 py-2 hover:bg-secondary">重新核对目标与模型</button>
  <p role="status">{p.pinsCurrent?'已选目标和模型版本已核对；修改版本或资源后需重新确认。':'请核对目标和模型；原保存条件不会随列表刷新自动更新。'}</p>
  <label className="flex items-start gap-2"><input type="checkbox" checked={a.enable} disabled={!p.executionEnabled||!p.pinsCurrent} onChange={e=>p.set('enable',e.target.checked)}/><span>保存后启用后台执行。未勾选时保存为暂停计划，并撤销原计划的后续自动执行。</span></label>
  {!p.executionEnabled&&<p>当前服务未开放定时自动执行授权。</p>}
  {a.enable&&<>
   <label className={LABEL_CLASS}>授权截止时间（当前浏览器时区）<input type="datetime-local" required className={FORM_CLASS} value={a.expires} onChange={e=>p.set('expires',e.target.value)}/></label>
   <div className="grid grid-cols-2 gap-3">
    <label className={LABEL_CLASS}>最多触发次数<input type="number" required min={1} max={1000000} className={FORM_CLASS} value={a.maxOccurrences} onChange={e=>p.set('maxOccurrences',Number(e.target.value))}/></label>
    <label className={LABEL_CLASS}>每次自动动作上限<input type="number" required min={1} max={10000} className={FORM_CLASS} value={a.maxEffects} onChange={e=>p.set('maxEffects',Number(e.target.value))}/></label>
   </div>
   <p>期限和次数限定自动执行范围，动作上限不等于金额或 Token 预算。模型调用和读取可能产生费用；所有 MCP 调用及非 GET 外部工具仍需逐步人工审批。</p>
   <label className="flex items-start gap-2"><input type="checkbox" checked={a.knowledge} onChange={e=>p.set('knowledge',e.target.checked)}/><span>另行授权定时知识检索相关的付费调用。未勾选时不授权这些费用。</span></label>
   <label className="flex items-start gap-2"><input type="checkbox" required checked={a.confirmed} onChange={e=>p.set('confirmed',e.target.checked)}/><span>我已核对本次任务指令、时间规则、目标、模型、期限及次数，授权该范围内的后台执行并承担相关费用。修改表单或重新核验身份后需再次确认。</span></label>
  </>}
 </section>
}
