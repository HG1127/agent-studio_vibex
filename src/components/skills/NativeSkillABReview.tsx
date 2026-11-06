import {useCallback,useEffect,useRef,useState} from 'react'
import {FlaskConical,ShieldCheck} from 'lucide-react'
import {createOriginalRoleApi} from '@/lib/originalRoleApi'
import {createOriginalModelConnectionsApi,type OriginalModelConnection} from '@/lib/originalModelConnectionsApi'
import {createOriginalAgentRunTransport} from '@/lib/originalAgentRunTransport'
import {getStudioAccountInfo,verifyStudioSession} from '@/lib/studioAuth'
import {confirmInStudio} from '@/lib/studioDialogs'
import {skillAbMessages,SKILL_AB_SCENARIO,SKILL_AB_OUTPUT_MAX_TOKENS,SKILL_AB_TOTAL_TOKEN_STOP,SKILL_AB_MAX_INSTRUCTION} from '@/lib/skillAbCompare'
import {skillAbFeeAcknowledgement,type SkillAbReceipt,skillAbView} from '../../../shared/original-skill-ab-execution-contract.ts'
import type {OriginalSkillAbPreview} from '../../../shared/original-skill-ab-contract.ts'
import type {SkillDetail} from '@/lib/skillLibrary'
type View=ReturnType<typeof skillAbView>
type Option={connection:OriginalModelConnection;model:string}
type Runtime={api:ReturnType<typeof createOriginalRoleApi>;session:ReturnType<ReturnType<typeof createOriginalRoleApi>['ab']>}
const optionKey=(o:Option)=>JSON.stringify([o.connection.id,o.connection.revision,o.model])
const binding=(o:Option)=>({connection_id:o.connection.id,connection_revision:o.connection.revision,model_id:o.model})
const acceptedOrigins={openai:'https://api.openai.com/v1',anthropic:'https://api.anthropic.com/v1',gemini:'https://generativelanguage.googleapis.com/v1beta'}
/** The original A/B interaction, over Native owner/version/effect receipts. */
export function NativeSkillABReview(props:{skill:SkillDetail;employeeId:string}){
 const s=props.skill
 return <NativeSkillABWorkspace key={`${props.employeeId}:${s.id}:${s.version}:${s.hash}:${s.active}:${s.approved}`} {...props}/>
}
function NativeSkillABWorkspace({skill,employeeId}:{skill:SkillDetail;employeeId:string}){
 const [options,setOptions]=useState<Option[]>([]),[modelKey,setModelKey]=useState(''),[loading,setLoading]=useState(true),[enabled,setEnabled]=useState(false),[partial,setPartial]=useState(false)
 const [preview,setPreview]=useState<OriginalSkillAbPreview|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[view,setView]=useState<View|null>(null),[requestId,setRequestId]=useState(''),[error,setError]=useState(''),[progress,setProgress]=useState(''),[revealed,setRevealed]=useState(false)
 const [known,setKnown]=useState<SkillAbReceipt|null>(null),[attempted,setAttempted]=useState<(0|1)[]>([])
 const runtime=useRef<Runtime|null>(null),alive=useRef(false),stopping=useRef(false),receipt=useRef<SkillAbReceipt|null>(null)
 const current=useCallback(()=>alive.current&&getStudioAccountInfo()?.active===true&&getStudioAccountInfo()?.id===employeeId,[employeeId])
 const model=options.find(o=>optionKey(o)===modelKey),tooLong=(()=>{try{skillAbMessages('with_skill',skill.content);return false}catch{return true}})()
 const terminal=!!view&&(view.receipt.state!=='active'||view.receipt.trials.every(t=>t.state==='succeeded'))
 const pending=!!requestId&&!terminal
 const selection=model?{skill_ref:{id:skill.id,version:skill.version,hash:skill.hash},model_binding:binding(model)}:null
 const receive=useCallback((v:View)=>{if(!current())return;receipt.current=v.receipt;setKnown(v.receipt);setView(v);setRequestId(v.receipt.request_id);setAttempted(runtime.current?.session.locators().find(l=>l.request_id===v.receipt.request_id)?.attempted??[])},[current])
 useEffect(()=>{
  alive.current=true;let live=true;const abort=new AbortController()
  const check=async()=>{if(await verifyStudioSession()!=='authenticated'||getStudioAccountInfo()?.id!==employeeId||!getStudioAccountInfo()?.active)throw Error('employee_session_changed');return employeeId}
  const fence=createOriginalAgentRunTransport({employeeId,verifyEmployee:check})
  void(async()=>{
   try{
    await check();if(!live)return
    const api=createOriginalRoleApi({employeeId,currentEmployee:()=>live?getStudioAccountInfo()?.id??'':''}),session=api.ab();runtime.current={api,session}
    const [meta,snapshot]=await Promise.all([api.meta(),createOriginalModelConnectionsApi({employeeId,transport:fence.transport}).listSnapshot(abort.signal)])
    if(!live||!current())return
    const rows=snapshot.items.filter(c=>c.enabled&&c.status==='ok'&&c.base_url===acceptedOrigins[c.provider]).flatMap(connection=>connection.models.filter(m=>/^[A-Za-z0-9._:/-]{1,120}$/.test(m)).map(model=>({connection,model})))
    setOptions(rows);setPartial(!snapshot.complete);setEnabled(meta.skill_ab===true)
    const prior=session.locators().filter(l=>l.skill_ref.id===skill.id&&l.skill_ref.version===skill.version&&l.skill_ref.hash===skill.hash).at(-1)
    if(prior){setRequestId(prior.request_id);try{const restored=await session.view(prior.request_id);if(!live||!current())return;receive(restored);const b=restored.receipt.selection.model_binding,o=rows.find(o=>o.connection.id===b.connection_id&&o.connection.revision===b.connection_revision&&o.model===b.model_id);if(o)setModelKey(optionKey(o));setProgress('已恢复原回执。继续前请重新核对发送范围和费用；不会自动重复试跑。')}catch{if(live&&current())setError('上次请求仍待核对，已保留原定位信息；不会重新提交。')}}
   }catch{if(live&&current())setError('暂时无法核实本账号的模型连接或 A/B 权限。')}
   finally{if(live&&current())setLoading(false)}
  })()
  return()=>{live=false;alive.current=false;stopping.current=true;abort.abort();runtime.current?.session.close();runtime.current=null;fence.close()}
 },[employeeId,skill.id,skill.version,skill.hash,current,receive])
 const review=async()=>{
  if(!runtime.current||!selection||busy||!skill.active||!skill.approved||tooLong)return
  setBusy(true);setConsent(false);setError('')
  try{const p=await runtime.current.api.previewAB(selection);if(!current())return;setPreview(p);if(receipt.current&&receipt.current.input_sha256!==p.input_sha256)setError('当前 Skill 或模型授权已变化；原比较不能继续，请先核对或擦除原回执。')}
  catch{if(current())setError('未能确认当前 Skill、模型和发送范围；未发起模型调用。')}
  finally{if(current())setBusy(false)}
 }
 const confirm=async()=>{
  if(!runtime.current||!requestId||busy)return;setBusy(true);setError('')
  try{receive(await runtime.current.session.view(requestId));if(current())setProgress('已读取原回执；此次核对不会重发任何模型请求。')}
  catch{if(current())setError('原请求尚未确认，请稍后继续核对；不会自动重试。')}
  finally{if(current())setBusy(false)}
 }
 const stop=async()=>{
  stopping.current=true;if(current())setProgress('已停止后续调用；已经开始的调用可能仍会计费。')
  const r=receipt.current,session=runtime.current?.session;if(!r||!session)return
  try{await session.control(r.request_id,'cancel');if(current())receive(await session.view(r.request_id))}catch{if(current())setError('停止请求尚待确认。再次停止只会核对原操作回执。')}
 }
 const run=async()=>{
  const r=runtime.current;if(!r||!selection||!preview||!preview.execution_available||!enabled||!consent||busy||!skill.active||!skill.approved||tooLong)return
  if(preview.skill.id!==selection.skill_ref.id||preview.skill.version!==selection.skill_ref.version||preview.skill.hash!==selection.skill_ref.hash||JSON.stringify(preview.model_binding)!==JSON.stringify(selection.model_binding))return
  setBusy(true);setError('');setProgress('');setRevealed(false);stopping.current=false
  let id=requestId,state=receipt.current
  try{
   if(!id){id=crypto.randomUUID();setRequestId(id);const saved=await r.session.submit({...selection,request_id:id,expected_input_sha256:preview.input_sha256,confirm:true,fee_acknowledgement:skillAbFeeAcknowledgement});if(!current())return;state=saved;receipt.current=saved;setKnown(saved)}
   if(!state||state.request_id!==id||state.input_sha256!==preview.input_sha256)throw Error('unconfirmed_original_scope')
   for(const ordinal of [0,1] as const){
    if(!current())return;if(stopping.current){await stop();break}
    const trial=state.trials[ordinal];if(trial.state==='succeeded')continue
    if(state.state!=='active'||trial.state!=='planned'||ordinal===1&&(state.trials[0].state!=='succeeded'||state.trials[0].total_tokens===null||state.trials[0].total_tokens>=SKILL_AB_TOTAL_TOKEN_STOP))throw Error('unconfirmed_original_trial')
    if(r.session.locators().find(l=>l.request_id===id)?.attempted.includes(ordinal))throw Error('original_trial_already_sent')
    setProgress('受控真实模型对照 '+(ordinal+1)+'/2 · 绑定原 Skill 版本和确切模型')
    const next=await r.session.startTrial(id,ordinal);if(!current())return;receive(next);state=next.receipt
    if(next.result_status!=='available'||state.trials[ordinal].state!=='succeeded')throw Error('original_trial_pending')
    const reported=state.trials[ordinal].total_tokens
    if(reported!==null&&reported>=SKILL_AB_TOTAL_TOKEN_STOP){stopping.current=true;await stop();if(current())setProgress('报告 Token 已达到停止阈值，未开始后续调用。');break}
   }
   if(current()&&!stopping.current)setProgress('对照调用结束；分析质量仍需人工评审。')
  }catch{if(current()){const saved=r.session.locators().find(l=>l.request_id===id);if(!saved)setRequestId('');setAttempted(saved?.attempted??[]);setError('原试跑请求未确认成功，已停止后续可能计费的调用。请核对原回执；不会自动重放。')}}
  finally{if(current())setBusy(false)}
 }
 const erase=async()=>{
  const r=runtime.current;if(!r||!requestId||busy||!await confirmInStudio('确认擦除本次 A/B 返回文本？已发生的模型费用不会撤销。'))return
  setBusy(true);setView(null);setRevealed(false);setError('')
  try{await r.session.control(requestId,'erase');if(current())receive(await r.session.view(requestId))}catch{if(current())setError('擦除结果尚待确认。再次擦除只核对原操作回执；当前正文已隐藏。')}
  finally{if(current())setBusy(false)}
 }
 const next=known?.trials.find(t=>t.state!=='succeeded'),continuable=!requestId||!!next&&next.state==='planned'&&!attempted.includes(next.ordinal)&&(next.ordinal===0||known?.trials[0].state==='succeeded'&&known.trials[0].total_tokens!==null&&known.trials[0].total_tokens<SKILL_AB_TOTAL_TOKEN_STOP)
 const canRun=!!model&&!!preview&&preview.execution_available&&enabled&&consent&&!busy&&!tooLong&&skill.active&&skill.approved&&continuable&&(!requestId||!!view&&view.result_status!=='stale'&&view.result_status!=='erased'&&view.receipt.state==='active'&&view.receipt.input_sha256===preview.input_sha256)
 return <section aria-label="Skill 真实模型 A/B 对照" className="rounded-xl border border-border bg-card p-4">
  <div className="flex items-start gap-2"><FlaskConical className="mt-0.5 h-5 w-5 text-primary"/><div><h2 className="text-sm font-semibold">Skill / 不使用 Skill · 真实模型对照</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">同一合成投资问题、同一个模型、同样的输出预算，仅调整是否加载本 Skill。最多两次调用；不读取私有资料，不调用工具，也不自动给结论打质量分。</p></div></div>
  <p className="mt-3 text-xs text-muted-foreground"><strong>全文测试：</strong>当前 Skill {skill.content.length.toLocaleString()} 字符。后端将重新读取并校验已审核版本，不要求删减已有 Skill。</p>
  <div className="mt-3 rounded-lg border border-border bg-secondary/20 p-3"><p className="text-xs font-semibold">对照问题（公开合成资料）</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{SKILL_AB_SCENARIO}</p></div>
  {tooLong&&<p role="alert" className="mt-3 text-xs text-destructive">全文加固定任务超过 {SKILL_AB_MAX_INSTRUCTION.toLocaleString()} 字符上限，不能静默截断后试跑。</p>}
  <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">本账号已启用的模型<select aria-label="Skill A/B 模型" value={modelKey} disabled={busy||loading||pending} onChange={e=>{setModelKey(e.target.value);setConsent(false);setPreview(null);setRevealed(false)}} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="">{loading?'读取连接中...':'请选择连接及具体模型'}</option>{options.map(o=><option key={optionKey(o)} value={optionKey(o)}>{o.connection.name} · {o.model}</option>)}</select></label><div className="flex items-end text-xs text-muted-foreground"><ShieldCheck className="mr-2 h-4 w-4 shrink-0 text-primary"/>绑定当前员工的连接与确切模型；不会自动换用其他模型。</div></div>
  {partial&&<p className="mt-2 text-xs text-muted-foreground">当前服务只返回首批连接；这里可选的每个模型仍需通过后端当前授权检查。</p>}
  {!loading&&!enabled&&<p role="status" className="mt-3 text-xs text-muted-foreground">此环境暂未开放 Skill A/B 执行。可以核对已有回执；费用预览不会发起模型调用。</p>}
  <button type="button" disabled={!model||busy||tooLong||!skill.approved||!skill.active} onClick={()=>void review()} className="mt-3 min-h-9 rounded-lg border border-border px-3 text-xs">核对发送范围与可能费用</button>
  {preview&&<p role="status" className="mt-2 text-xs text-muted-foreground">已核对 Skill v{preview.skill.version} 和所选模型。两次输入分别为 {preview.input_characters.baseline.toLocaleString()} / {preview.input_characters.with_skill.toLocaleString()} 字符；每次输出上限 {preview.output_token_limit} tokens。当前无法给出可靠金额估算，费用以服务商实际账单为准。</p>}
  <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={consent} disabled={busy||!preview?.execution_available||!enabled||!model||tooLong} onChange={e=>setConsent(e.target.checked)} className="mt-0.5"/><span>我同意向所选模型发送上面的合成问题及本 Skill 方法全文，最多发起两次可能收费的真实调用。每次输出上限 {SKILL_AB_OUTPUT_MAX_TOKENS} tokens，累计报告 Token 达到 {SKILL_AB_TOTAL_TOKEN_STOP} 后停止；费用以模型服务商实际账单为准。</span></label>
  <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!canRun||terminal} onClick={()=>void run()} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40">{busy?'模型对照进行中…':requestId?'继续尚未开始的对照':'运行 2 次受控 A/B 对照'}</button>{requestId&&<><button type="button" disabled={busy} onClick={()=>void confirm()} className="min-h-10 rounded-lg border border-border px-3 text-xs">核对原回执</button><button type="button" disabled={!known||terminal} onClick={()=>void stop()} className="min-h-10 rounded-lg border border-border px-3 text-xs">当前调用后停止</button><button type="button" disabled={busy||!known} onClick={()=>void erase()} className="min-h-10 rounded-lg border border-border px-3 text-xs">擦除本次结果</button></>}{terminal&&<button type="button" disabled={busy} onClick={()=>{receipt.current=null;setKnown(null);setAttempted([]);setRequestId('');setView(null);setPreview(null);setConsent(false);setRevealed(false);setProgress('');setError('')}} className="min-h-10 rounded-lg border border-border px-3 text-xs">新建一轮对照</button>}{view?.results?.length===2&&!busy&&<button type="button" onClick={()=>setRevealed(v=>!v)} className="min-h-10 rounded-lg border border-border px-3 text-xs">{revealed?'隐藏分组身份':'人工阅读后揭示哪组用了 Skill'}</button>}</div>
  {progress&&<p role="status" className="mt-2 text-xs text-muted-foreground">{progress}</p>}{error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  {view?.result_status==='stale'&&<p role="status" className="mt-2 text-xs text-muted-foreground">当前授权或来源已变化，原结果正文已隐藏。</p>}{view?.result_status==='erased'&&<p role="status" className="mt-2 text-xs text-muted-foreground">本次结果正文已擦除；原计量与操作回执保留。</p>}
  {!!view?.results?.length&&<div className="mt-4 grid gap-3 lg:grid-cols-2">{view.results.map(result=>{const t=view.receipt.trials[result.ordinal];return <article key={t.label} aria-label={'分析结果 '+t.label} className="min-w-0 rounded-lg border border-border p-3"><h3 className="text-sm font-semibold">结果 {t.label} {revealed&&<span className="text-xs font-normal text-primary">· {t.variant==='with_skill'?'已加载该 Skill':'未加载 Skill'}</span>}</h3><p className="mt-1 text-[11px] text-muted-foreground">{t.total_tokens} tokens · {t.elapsed_ms} ms {t.truncated?'· 输出达到上限':''}</p><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-6">{result.text}</pre></article>})}</div>}
  {view?.results?.length===2&&<p className="mt-3 text-xs leading-5 text-muted-foreground">人工评审重点：事实与假设区分、单位经济计算、底层约束、反面证据、可证伪实验。A/B 只有两次样本，不能据此证明 Skill 普遍提高模型质量。正文仅在当前授权下展示，不保存在浏览器存储中。</p>}
 </section>
}
