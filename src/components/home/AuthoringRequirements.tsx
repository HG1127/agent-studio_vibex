import {useEffect,useState} from 'react'
import type {AgentSpec} from '@/pages/Home/presets'
import {localApi} from '@/lib/localDevices'
import {previewRequirements,type CapturedRequirements,type AuthoringPlan} from '@/lib/authoringRequirements'
const labels:Record<string,string>={native:'原生可用',connected:'已连接',configuration_required:'待配置',development_required:'需开发'}
export function AuthoringPlanSummary({plan}:{plan:AuthoringPlan}){
  return <div className="mt-2 space-y-2 text-xs">{plan.requirements.map(item=><div className="rounded border p-2" key={item.id}><p>{item.title} · <strong>{labels[item.state]||item.state}</strong></p><p className="mt-1 text-muted-foreground">{item.limits}</p>{item.missing_tools.length>0&&<p className="mt-1">方案待绑定：{item.missing_tools.join('、')}</p>}</div>)}<p className="text-muted-foreground">这是依赖预览，未执行任务、授权工具或证明研究质量；文字步骤尚未自动编译为执行图。</p></div>
}
export function AuthoringRequirements({spec}:{spec:AgentSpec}){
  const id=spec._studio_authoring?.request_id||'',encoded=JSON.stringify(spec)
  const [state,setState]=useState<{key:string;source:CapturedRequirements|null;plan:AuthoringPlan|null;failed:boolean}>({key:'',source:null,plan:null,failed:false})
  useEffect(()=>{
    if(!id)return
    const abort=new AbortController(),timer=window.setTimeout(()=>{
      void Promise.all([localApi<CapturedRequirements>(`/api/authoring/requirements/${encodeURIComponent(id)}`,undefined,abort.signal),previewRequirements(id,JSON.parse(encoded) as AgentSpec,abort.signal)])
        .then(([source,preview])=>{if(!abort.signal.aborted)setState({key:encoded,source,plan:preview.plan,failed:false})})
        .catch(()=>{if(!abort.signal.aborted)setState({key:encoded,source:null,plan:null,failed:true})})
    },300)
    return ()=>{window.clearTimeout(timer);abort.abort()}
  },[id,encoded])
  if(!id)return <p className="px-4 py-2 text-xs text-muted-foreground">本方案尚无原始需求记录；现有功能检查不能证明原需求已完整保留。</p>
  const current=state.key===encoded?state:null
  return <section aria-label="原始需求与能力预览" className="border-b p-4"><h3 className="text-sm font-medium">原始需求与能力预览</h3>
    {!current&&<p role="status" className="mt-2 text-xs">正在核对保存的需求与当前草案…</p>}
    {current?.failed&&<p role="alert" className="mt-2 text-xs text-destructive">需求来源或依赖暂不可读取；不能据此宣称功能已齐备。</p>}
    {current?.source&&<><p className="mt-1 text-xs text-muted-foreground">{current.plan?.original_requirements.state==='revision_only'?'仅记录本次起的修订；旧方案更早的原始需求未知。':'原始要求与后续修订逐条保留，生成文本不能替代或删除。'}</p><details className="mt-2 text-xs"><summary className="cursor-pointer">读取原始需求与修订（{current.source.entries.length} 条）</summary>{current.source.entries.map((entry,index)=><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border p-2" key={entry.request_id}>{index+1}. {entry.requirement}</pre>)}</details></>}
    {current?.plan&&<AuthoringPlanSummary plan={current.plan}/>}</section>
}
