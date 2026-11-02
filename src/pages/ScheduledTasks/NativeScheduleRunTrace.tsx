import type {RunDetailRow} from '../RunDetail/useRunDetail'
export function NativeScheduleRunTrace({run}:{run:RunDetailRow}){
 const detail=run.native
 if(!detail)return null
 return <section className="space-y-2 rounded-xl border border-border p-3 text-xs">
  <h3 className="font-semibold">执行诊断 · 已存储公开步骤</h3>
  <p className="text-muted-foreground">后台未提供原始事件流和完整耗时，以下是经权限核验的步骤状态快照。</p>
  {!detail.sourceAvailable&&<p role="status">运行来源当前不可用，私有正文和步骤输出已隐藏。</p>}
  {detail.steps.map(step=><details key={step.step_key} className="rounded-lg bg-secondary/40 p-2"><summary className="cursor-pointer">{step.step_key} · {step.status}</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(step.metadata,null,2)}</pre></details>)}
  {!detail.steps.length&&<p>没有可展示的公开步骤。</p>}
  {!detail.stepsComplete&&<p>仍有未加载的步骤，请打开完整运行记录继续查看。</p>}
 </section>
}
