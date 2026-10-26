import {useEffect,useRef,useState} from "react"
import {FlaskConical,ShieldCheck} from "lucide-react"
import {getPocketBaseUrl} from "@/lib/pb"
import {vibexAuthHeaders} from "@/lib/studioAuth"
import {
  skillAbMessages,SKILL_AB_SCENARIO,SKILL_AB_OUTPUT_MAX_TOKENS,
  SKILL_AB_MAX_INSTRUCTION,SKILL_AB_TOTAL_TOKEN_STOP,
  skillAbValidTokenCount,type SkillAbVariant,
} from "@/lib/skillAbCompare"
import type {SkillDetail} from "@/lib/skillLibrary"
import type {ModelConnectionRow} from "@/pages/ModelConnections/useModelConnections"

type Trial={variant:SkillAbVariant;label:"A"|"B";text:string;inputTokens:number;outputTokens:number;elapsedMs:number}
type ModelOption={connection:ModelConnectionRow;model:string}
export function SkillABReview({skill}:{skill:SkillDetail}) {
  const [options,setOptions]=useState<ModelOption[]>([])
  const [modelKey,setModelKey]=useState("")
  const [loading,setLoading]=useState(true)
  const [consent,setConsent]=useState(false)
  const [busy,setBusy]=useState(false)
  const [trials,setTrials]=useState<Trial[]>([])
  const [error,setError]=useState("")
  const [progress,setProgress]=useState("")
  const [revealed,setRevealed]=useState(false)
  const stopping=useRef(false)
  const model=options.find(row=>JSON.stringify([row.connection.id,row.model])===modelKey)
  const tooLong=(()=>{
    try{skillAbMessages("with_skill",skill.content);return false}catch{return true}
  })()
  useEffect(()=>{
    let active=true
    void fetch(getPocketBaseUrl()+"/api/model-connections",{
      headers:vibexAuthHeaders(),
    }).then(async response=>{
      if(!response.ok)throw Error("无法查询已连接模型")
      const payload=await response.json() as {items?:ModelConnectionRow[]}
      if(!Array.isArray(payload.items))throw Error("模型列表格式不正确")
      if(!active)return
      setOptions(payload.items.filter(row=>row.enabled&&Array.isArray(row.models))
        .flatMap(row=>row.models.map(modelName=>({connection:row,model:modelName}))))
      setLoading(false)
    }).catch(()=>{if(active){setLoading(false);setError("暂时无法获取员工已启用的模型连接")}})
    return()=>{active=false}
  },[])
  const run=async()=>{
    if(!consent||!model||!skill.approved||!skill.active||tooLong||busy)return
    setBusy(true);setError("");setProgress("");setTrials([]);setRevealed(false)
    stopping.current=false
    const order:SkillAbVariant[]=crypto.getRandomValues(new Uint8Array(1))[0]%2
      ?["with_skill","baseline"]:["baseline","with_skill"]
    let consumed=0
    try{
      for(let i=0;i<order.length;i++){
        if(stopping.current||consumed>=SKILL_AB_TOTAL_TOKEN_STOP)break
        const variant=order[i]
        setProgress("受控真实模型对照 "+(i+1)+"/2 · 已启用严格模型绑定")
        const started=performance.now()
        // No tools, browsing or writes. Each request uses a unique idempotency ID;
        // never replay an uncertain provider request.
        const requestId="skill-ab-"+crypto.randomUUID()
        let res:Response
        let answer:{
          ok?:boolean;status?:string;text?:string;error?:string;
          model?:string;usage?:{input_tokens?:number|null;output_tokens?:number|null}|null
        }
        try{
          res=await fetch(getPocketBaseUrl()+"/api/llm/chat",{
            method:"POST",headers:{"Content-Type":"application/json",...vibexAuthHeaders()},
            body:JSON.stringify({
              page:"skill_ab_review",connection_id:model.connection.id,
              model:model.model,strict_model:true,request_id:requestId,
              max_tokens:SKILL_AB_OUTPUT_MAX_TOKENS,
              // No user-supplied long prompt: server reconstructs it using
              // this employee's approved, immutable Skill version.
              skill_ref:{id:skill.id,version:skill.version,hash:skill.hash},
              variant,
            }),
          })
          answer=await res.json()
        }catch{
          setError("模型请求结果不确定，停止后续可能计费的调用。请查模型服务记录，勿自动重试。")
          break
        }
        if(!res.ok||!answer.ok||answer.status!=="success"||
            !answer.text||answer.model!==model.model){
          setError("模型响应未确认成功或实际模型与选择不符。已停止后续调用。")
          break
        }
        const input=skillAbValidTokenCount(answer.usage?.input_tokens)
        const output=skillAbValidTokenCount(answer.usage?.output_tokens)
        if(input===null||output===null){
          setError("响应缺少可靠 Token 计量，停止后续调用，不将本次计入有效对照。")
          break
        }
        consumed+=input+output
        setTrials(items=>[...items,{
          variant,label:i===0?"A":"B",text:answer.text||"",
          inputTokens:input,outputTokens:output,
          elapsedMs:Math.round(performance.now()-started),
        }])
      }
      setProgress(stopping.current?"已停止后续调用": "对照调用结束；分析质量需要人工评审。")
    }finally{setBusy(false)}
  }
  return <section aria-label="Skill 真实模型 A/B 对照" className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-start gap-2">
      <FlaskConical className="mt-0.5 h-5 w-5 text-primary"/>
      <div>
        <h2 className="text-sm font-semibold">Skill / 不使用 Skill · 真实模型对照</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          同一合成投资问题、同一个模型、同样的输出预算，仅调整是否加载本 Skill。
          最多两次调用；不读取私有资料，不调用工具，也不自动给结论打质量分。
        </p>
      </div>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">
      <strong>全文测试：</strong>当前 Skill {skill.content.length.toLocaleString()} 字符，
      加入固定任务后总输入约 {(()=>{try{return skillAbMessages("with_skill",skill.content)[1].content.length.toLocaleString()}catch{return "超过限制"}})()} 字符。
      后端将重新读取并校验已审核版本，不要求删减已有 Skill。
    </p>
    <div className="mt-3 rounded-lg border border-border bg-secondary/20 p-3">
      <p className="text-xs font-semibold">对照问题（公开合成资料）</p>
      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{SKILL_AB_SCENARIO}</p>
    </div>
    {tooLong&&<p role="alert" className="mt-3 text-xs text-destructive">
      当前 Skill 全文加测试任务超过 {SKILL_AB_MAX_INSTRUCTION.toLocaleString()} 字符的受控输入上限。
      不会静默截断或冒称完整验证，请使用较短的审核版本。
    </p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium">本账号已启用的模型
        <select aria-label="Skill A/B 模型" value={modelKey} disabled={busy||loading}
          onChange={event=>{setModelKey(event.target.value);setConsent(false);setTrials([]);setRevealed(false)}}
          className="mt-1 min-h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
          <option value="">{loading?"读取连接中...":"请选择连接及具体模型"}</option>
          {options.map(option=><option key={JSON.stringify([option.connection.id,option.model])}
            value={JSON.stringify([option.connection.id,option.model])}>
            {option.connection.name} · {option.model}
          </option>)}
        </select>
      </label>
      <div className="flex items-end text-xs text-muted-foreground">
        <ShieldCheck className="mr-2 h-4 w-4 shrink-0 text-primary"/>
        绑定当前员工的连接与确切模型；绝不自动降级到其他模型。
      </div>
    </div>
    <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
      <input type="checkbox" checked={consent} disabled={busy||!model||tooLong}
        onChange={e=>setConsent(e.target.checked)} className="mt-0.5"/>
      <span>我同意向所选模型发送上面的合成问题及本 Skill 方法全文，最多发起两次可能收费的真实调用。
        每次输出上限 {SKILL_AB_OUTPUT_MAX_TOKENS} tokens，累计报告 Token 达到 {SKILL_AB_TOTAL_TOKEN_STOP} 停止；
        费用以模型服务商实际账单为准。</span>
    </label>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={!model||!consent||busy||tooLong||!skill.approved||!skill.active}
        onClick={()=>void run()}
        className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40">
        {busy?"模型对照进行中…":"运行 2 次受控 A/B 对照"}
      </button>
      {busy&&<button type="button" onClick={()=>{stopping.current=true}}
        className="min-h-10 rounded-lg border border-border px-3 text-xs">当前调用后停止</button>}
      {trials.length===2&&!busy&&<button type="button" onClick={()=>setRevealed(v=>!v)}
        className="min-h-10 rounded-lg border border-border px-3 text-xs">
        {revealed?"隐藏分组身份":"人工阅读后揭示哪组用了 Skill"}
      </button>}
    </div>
    {progress&&<p role="status" className="mt-2 text-xs text-muted-foreground">{progress}</p>}
    {error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    {trials.length>0&&<div className="mt-4 grid gap-3 lg:grid-cols-2">
      {trials.map(trial=><article key={trial.label} aria-label={"分析结果 "+trial.label}
        className="min-w-0 rounded-lg border border-border p-3">
        <h3 className="text-sm font-semibold">结果 {trial.label} {revealed&&
          <span className="text-xs font-normal text-primary">
            · {trial.variant==="with_skill"?"已加载该 Skill":"未加载 Skill"}
          </span>}</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {trial.inputTokens+trial.outputTokens} tokens · {trial.elapsedMs} ms
        </p>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 font-sans">{trial.text}</pre>
      </article>)}
    </div>}
    {trials.length===2&&<p className="mt-3 text-xs leading-5 text-muted-foreground">
      人工评审重点：事实与假设区分、单位经济计算、底层约束、反面证据、可证伪实验。
      A/B 只有两次样本，不能据此证明 Skill 普遍提高模型质量。结果仅保留在当前浏览器会话。
    </p>}
  </section>
}
