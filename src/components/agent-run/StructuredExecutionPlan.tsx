import {useState} from 'react'
import {GitBranch,ShieldCheck,CheckCircle2} from 'lucide-react'
import type {ExecutionPlanView} from '@/lib/structuredTaskPlanView'
const labels={review:'待审核',pending:'未开始',active:'当前步骤',awaiting_approval:'等待操作批准',submitted:'已交付 · 待验收',stopped:'已停止',paused:'已暂停'} as const
export function StructuredExecutionPlan({plan}:{plan:ExecutionPlanView}){
 const [selected,setSelected]=useState('')
 const active=plan.nodes.find(n=>n.id===selected)||plan.nodes.find(n=>['active','awaiting_approval','paused','stopped'].includes(n.status))||plan.nodes[0]
 return <section aria-label="模型执行计划与证据" className="min-w-0 rounded-2xl border border-primary/25 bg-card p-4">
  <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><GitBranch className="h-4 w-4 text-primary"/>模型执行计划</h2><span className="text-xs text-muted-foreground">{plan.runStatus==='cancelled'?'已取消':plan.runStatus==='failed'?'已停止 · 查看原因':plan.runStatus==='paused'?'已暂停':plan.runStatus==='succeeded'?'已交付 · 请复核':plan.approved?'已批准 · 按依赖串行调度':'待本人审核'} · {plan.nodes.length} 步 · 版本 {plan.revision.slice(0,8)}</span></div>
  <p className="mt-2 break-words text-sm leading-6">{plan.summary}</p>
  {plan.gaps.length>0&&<div role="alert" className="mt-3 rounded-lg border border-destructive/30 p-3 text-xs text-destructive">尚不能批准：{plan.gaps.join('；')}。请退回修改，或补齐资源后新建任务；本次任务不会自动扩大授权。</div>}
  <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
   <nav aria-label="计划步骤选择" className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2">{plan.nodes.map((n,i)=><button key={n.id} type="button" aria-pressed={active.id===n.id} onClick={()=>setSelected(n.id)} className={'rounded-lg px-3 py-2 text-left text-xs '+(active.id===n.id?'bg-primary/10 text-primary':'hover:bg-secondary')}><span className="block font-semibold">{i+1}. {n.title}</span><span className="mt-1 block text-[11px]">{labels[n.status]}</span></button>)}</nav>
   <div role="region" aria-label="计划节点详情" className="min-w-0 space-y-3 rounded-xl border border-border p-3 text-xs">
    <h3 className="text-sm font-semibold">{active.title}</h3><p className="break-words leading-6">{active.objective}</p>
    <dl className="grid gap-2 sm:grid-cols-2"><div><dt className="font-semibold">依赖步骤</dt><dd className="mt-1 break-words text-muted-foreground">{active.dependsOn.map(id=>plan.nodes.find(n=>n.id===id)?.title||id).join('、')||'无'}</dd></div><div><dt className="font-semibold">本步工具范围</dt><dd className="mt-1 break-all text-muted-foreground">{active.tools.join('、')||'仅分析，不调用工具'}{active.localTools.length>0&&' / '+active.localTools.join('、')}</dd></div><div><dt className="font-semibold">输入</dt><dd className="mt-1 break-words text-muted-foreground">{active.inputs.join('；')||'当前任务与前序成果'}</dd></div><div><dt className="font-semibold">预期产出</dt><dd className="mt-1 break-words text-muted-foreground">{active.outputs.join('；')}</dd></div></dl>
    <p className="break-words"><strong>验收标准：</strong>{active.acceptance.join('；')}</p>
    {active.approvalRequired&&<p className="flex items-start gap-2 text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0"/>本步涉及有副作用或本机操作；每次调用仍须本人批准具体参数。</p>}
    <div className="border-t border-border pt-2"><p className="flex items-center gap-1 font-semibold"><CheckCircle2 className="h-3.5 w-3.5"/>已保存的成功回执</p>{active.evidence.length?<ul className="mt-1 space-y-1">{active.evidence.map((e,i)=><li key={i} className="break-all">第 {e.step} 次执行步骤 · {e.tool}</li>)}</ul>:<p className="mt-1 text-muted-foreground">尚无成功回执，不会由计划文字推断已执行。</p>}</div>
    {active.output&&<details><summary className="cursor-pointer font-semibold">本节点交付内容</summary><p className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words leading-6">{active.output}</p></details>}
   </div>
  </div><p className="mt-3 text-[11px] leading-5 text-muted-foreground">模型规划与实际调用分开记录。成功回执证明工具完成调用，不等于业务结论正确；最终交付仍需按验收标准复核。</p>
 </section>
}
