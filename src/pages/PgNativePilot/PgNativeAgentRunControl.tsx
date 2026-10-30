import type {AutonomousView} from '@/lib/pgNativeAutonomousAgentSession'
export default function PgNativeAgentRunControl({view,enabled,onControl,onConfirm}:{view:AutonomousView;enabled:boolean;onControl:(action:'pause'|'resume')=>void;onConfirm:()=>void}){
 const detail=view.detail,control=detail?.run_control,pending=view.pendingRunControl
 if(!detail||!pending&&(!control||!control.manually_paused&&!control.can_pause))return null
 const locked=view.busy||view.loading||Boolean(view.pendingSubmit)||Boolean(view.pendingMutation)||Boolean(view.pendingHumanResponse)
 const button='min-h-10 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
 return <section aria-label="暂停或恢复原任务" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
  {pending?<>
   <p role="status" className="text-sm leading-6">上次{pending.action==='pause'?'暂停':'恢复'}结果尚未确认。核对只读取原操作回执，不会重新执行任务。</p>
   <button type="button" className={button} disabled={locked} onClick={onConfirm}>核对上次{pending.action==='pause'?'暂停':'恢复'}</button>
  </>:control?.manually_paused?<>
   <p role="status" className="text-sm leading-6">已停止接续后面的步骤。{control.in_flight?'当前调用可能仍在进行，待原调用记录结果后才能恢复。':control.outcome_unknown?'当前调用的结果尚不明确，暂不能恢复，请核对执行记录。':'恢复会继续同一任务，系统会重新核验来源、资源和原审批。'}</p>
   <button type="button" className={button} disabled={locked||!enabled||!control.can_resume} onClick={()=>onControl('resume')}>恢复此任务</button>
  </>:control?.can_pause?<>
   <p className="text-sm leading-6 text-slate-600">暂停会停止后续步骤。已经发出的调用可能继续完成，无法撤回，系统会保留原结果。</p>
   <button type="button" className={button} disabled={locked||!enabled} onClick={()=>onControl('pause')}>暂停此任务</button>
  </>:null}
 </section>
}
