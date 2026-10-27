import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import type {createPgNativePilotApi,PgNativeKnowledge,PgNativeModelConnection,KnowledgeEmbeddingSettings,KnowledgeEmbeddingConsent,KnowledgeIndexStatus} from "@/lib/pgNativePilotApi"
import {createKnowledgeEmbeddingMutationSession,type EmbeddingMutation} from "@/lib/pgNativeKnowledgeEmbeddingSession"
import {EMBEDDING_CHARGE_ACKNOWLEDGEMENT} from "../../../services/pg-api/src/knowledge-embedding-consent-contracts"
import {INDEX_START_ACKNOWLEDGEMENT} from "../../../services/pg-api/src/knowledge-index-contracts"
import {semanticButton as button,semanticField as field,semanticError} from "./pgNativeKnowledgeSemanticUi"

type Api=ReturnType<typeof createPgNativePilotApi>
export interface KnowledgeSemanticCapabilities {settings:boolean;consent:boolean;index:boolean;query:boolean}
export function KnowledgeIndexProgress({value}:{value:KnowledgeIndexStatus}){
  return <div role="status" aria-label="本人语义索引状态" className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
    <p>{value.index_authorized?"已明确启动本人索引":"尚未明确启动本人索引"} · 已索引 {value.indexed} / {value.total} 段 · 待处理 {value.pending} 段</p>
    <p>正在执行 {value.active_attempts} 批 · 结果不明 {value.unknown_attempts} 批{value.dimensions?" · 向量维度 "+value.dimensions:""}</p>
    {value.unknown_attempts>0&&<p className="text-amber-900">结果不明的批次不会自动重发。如需再次尝试，请先重新保存费用授权，再明确启动；可能重复产生提供商费用。</p>}
  </div>
}
export default function PgNativeKnowledgeEmbeddingPanel({api,models,bases,active,enabled,capabilities,onChanged,onExpired}:{
  api:Api;models:PgNativeModelConnection[];bases:PgNativeKnowledge[];active:boolean;enabled:boolean;capabilities:KnowledgeSemanticCapabilities;onChanged:()=>void;onExpired:()=>void
}){
  const [session]=useState(()=>createKnowledgeEmbeddingMutationSession(api))
  const [mutation,setMutation]=useState(()=>session.snapshot())
  const [settings,setSettings]=useState<KnowledgeEmbeddingSettings|null>(null),[consent,setConsent]=useState<KnowledgeEmbeddingConsent|null>(null)
  const [progress,setProgress]=useState<KnowledgeIndexStatus|null>(null)
  const [connection,setConnection]=useState(""),[model,setModel]=useState(""),[url,setUrl]=useState("")
  const [base,setBase]=useState(""),[indexConsent,setIndexConsent]=useState(false),[queryConsent,setQueryConsent]=useState(false)
  const [consentAck,setConsentAck]=useState(false),[startAck,setStartAck]=useState(false)
  const [confirm,setConfirm]=useState<"disable"|"rebuild"|null>(null)
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("")
  const life=useRef(0),readVersion=useRef(0)
  const {settings:settingsAllowed,consent:consentAllowed,index:indexAllowed}=capabilities
  useEffect(()=>()=>{life.current++;readVersion.current++;session.reset()},[session])
  const report=useCallback((err:unknown)=>{if((err as {status?:number})?.status===401){session.reset();onExpired()}else setError(semanticError(err))},[onExpired,session])
  const load=useCallback(async()=>{
    if(!settingsAllowed)return
    const ticket=++readVersion.current,epoch=life.current
    setLoading(true);setError("");setConsentAck(false);setStartAck(false);setProgress(null)
    try{
      const [current,authorization,status]=await Promise.all([api.getKnowledgeEmbeddingSettings(),consentAllowed?api.getKnowledgeEmbeddingConsent():null,
        indexAllowed&&base?api.getKnowledgeIndexStatus(base):null])
      if(epoch!==life.current||ticket!==readVersion.current)return
      setSettings(current);setConsent(authorization);setProgress(status)
      setConnection(current.connection_id??"");setModel(current.model_name);setUrl(current.base_url)
      setIndexConsent(authorization?.index_enabled===true);setQueryConsent(authorization?.query_enabled===true)
    }catch(err){if(epoch===life.current&&ticket===readVersion.current){setSettings(null);setConsent(null);setProgress(null);report(err)}}
    finally{if(epoch===life.current&&ticket===readVersion.current)setLoading(false)}
  },[api,base,consentAllowed,indexAllowed,report,settingsAllowed])
  useEffect(()=>{if(active&&enabled&&settingsAllowed)void load()},[active,enabled,load,settingsAllowed])
  useEffect(()=>{if(!settingsAllowed){readVersion.current++;setSettings(null);setConsent(null);setProgress(null);setConsentAck(false);setStartAck(false)}},[settingsAllowed])
  const locked=!active||!enabled||!settingsAllowed||loading||mutation.busy||mutation.pending!==null
  const eligible=models.filter(item=>item.enabled&&item.provider==="openai")
  const selected=eligible.find(item=>item.id===connection),validModel=!!selected?.models.includes(model)
  const draftChanged=!!settings&&(connection!==(settings.connection_id??"")||model!==settings.model_name||url.trim()!==settings.base_url)
  const billingLocked=locked||draftChanged
  async function mutate(intent:EmbeddingMutation){
    if(locked)return
    const epoch=life.current
    setError("");setNotice("");setConfirm(null);setConsentAck(false);setStartAck(false)
    try{
      const task=session.start(intent);setMutation(session.snapshot())
      const result=await task
      if(epoch!==life.current||result.stale)return
      if(result.confirmed){setNotice("操作已确认，以下为重新读取的当前状态。");await load();onChanged()}
    }catch(err){if(epoch===life.current)report(err)}finally{if(epoch===life.current)setMutation(session.snapshot())}
  }
  async function recover(retry=false){
    if(!enabled||!settingsAllowed||session.snapshot().busy||!session.snapshot().pending)return
    const epoch=life.current;setError("")
    try{
      const task=retry?session.retry():session.recover();setMutation(session.snapshot())
      const result=await task
      if(epoch!==life.current||result.stale)return
      if(result.confirmed){setNotice("已核对历史回执，并重新读取当前状态。");await load();onChanged()}
      else setNotice("暂未查到回执。核对当前状态后，可手动重试原请求。")
    }catch(err){if(epoch===life.current)report(err)}finally{if(epoch===life.current)setMutation(session.snapshot())}
  }
  function configure(event:FormEvent){
    event.preventDefault();if(!selected||!validModel||!settings)return
    void mutate({kind:"settings",payload:{action:"configure",request_id:crypto.randomUUID(),expected_revision:settings.revision,connection_id:selected.id,
      connection_revision:selected.revision,model_name:model,base_url:url.trim()}})
  }
  return <section aria-label="语义检索设置与索引" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="font-semibold">语义检索设置与索引</h2>
    <p className="text-sm leading-6 text-slate-600">使用本人模型连接生成语义向量。保存设置不会调用提供商；索引费用授权与实际启动需要分别确认。</p>
    {!settingsAllowed&&<p role="status" className="text-sm text-slate-500">管理员尚未开放语义设置。</p>}
    {mutation.pending&&<div role="status" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
      <p>设置或索引启动结果待确认：{mutation.pending.requestId}</p><p>保留原请求和原配置版本，核对回执不会增加费用。</p>
      <button type="button" className={button} disabled={!enabled||!settingsAllowed||mutation.busy} onClick={()=>void recover()}>核对设置回执</button>{" "}
      <button type="button" className={button} disabled={!enabled||!settingsAllowed||mutation.busy} onClick={()=>void recover(true)}>重试同一设置请求</button>
    </div>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {loading&&<p role="status" className="text-sm text-slate-500">正在读取本人语义设置与索引状态…</p>}
    <button type="button" className={button} disabled={!active||!enabled||!settingsAllowed||loading||mutation.busy} onClick={()=>void load()}>刷新语义设置与索引状态</button>
    {settingsAllowed&&<>
      <form onSubmit={configure} className="space-y-3">
        <fieldset disabled={locked} className="space-y-3">
          <legend className="text-sm font-semibold">本人向量模型</legend>
          <label className="block text-sm">向量模型连接<select className={field} required value={connection} onChange={e=>{
            const next=eligible.find(item=>item.id===e.target.value);setConnection(e.target.value);setModel("");setUrl(next?.base_url??"");setConsentAck(false);setStartAck(false)
          }}><option value="">请选择本人已启用的连接</option>{connection&&!selected&&<option value={connection} disabled>原连接已不可用</option>}{eligible.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {!eligible.length&&<p className="text-sm text-slate-600">请先在模型连接页添加本人的 OpenAI 兼容连接，并声明向量模型名称。</p>}
          <label className="block text-sm">向量模型名称<select required className={field} value={model} onChange={e=>{setModel(e.target.value);setConsentAck(false);setStartAck(false)}}><option value="">请选择已声明的向量模型</option>{model&&!validModel&&<option disabled value={model}>{model}（已不可用）</option>}{selected?.models.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
          <label className="block text-sm">向量服务地址<input required type="url" maxLength={2048} className={field} value={url} onChange={e=>{setUrl(e.target.value);setConsentAck(false);setStartAck(false)}}/></label>
          <p className="text-xs text-slate-500">使用管理员允许的兼容服务地址。更换配置会清除旧向量缓存，旧费用授权也需要重新确认。</p>
          <button type="submit" className={button} disabled={locked||!settings||!validModel||!url.trim()}>保存语义设置</button>{" "}
          <button type="button" className={button} disabled={locked||!settings?.configured} onClick={()=>setConfirm("disable")}>停用语义配置</button>
        </fieldset>
      </form>
      {draftChanged&&<p role="status" className="text-sm text-amber-900">请先保存或刷新模型设置，再确认费用授权和索引启动。</p>}
      {consentAllowed&&<fieldset disabled={billingLocked||!consent?.profile_valid} className="space-y-3 border-t border-slate-100 pt-4">
        <legend className="text-sm font-semibold">本人费用授权</legend>
        <p className="text-sm text-slate-600">当前授权：索引{consent?.index_enabled?"已允许":"未允许"}，查询{consent?.query_enabled?"已允许":"未允许"}。授权记录本身不会调用模型。</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={indexConsent} onChange={e=>{setIndexConsent(e.target.checked);setConsentAck(false)}}/>允许本人知识内容的索引费用</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={queryConsent} onChange={e=>{setQueryConsent(e.target.checked);setConsentAck(false)}}/>允许使用本人模型的查询费用</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={consentAck} onChange={e=>setConsentAck(e.target.checked)}/>我确认承担所选当前模型配置的提供商费用</label>
        <button type="button" className={button} disabled={billingLocked||!consentAck||!consent?.profile_valid||!consent.profile_id||!indexConsent&&!queryConsent} onClick={()=>{
          if(consent?.profile_id)void mutate({kind:"consent",payload:{action:"grant",request_id:crypto.randomUUID(),expected_revision:consent.revision,profile_id:consent.profile_id,
            profile_revision:consent.profile_revision,index_enabled:indexConsent,query_enabled:queryConsent,acknowledgement:EMBEDDING_CHARGE_ACKNOWLEDGEMENT}})
        }}>保存本人费用授权</button>
      </fieldset>}
      {consentAllowed&&<button type="button" className={button} disabled={locked||!consent||!consent.index_enabled&&!consent.query_enabled} onClick={()=>{
        if(consent)void mutate({kind:"consent",payload:{action:"revoke",request_id:crypto.randomUUID(),expected_revision:consent.revision}})
      }}>撤销本人全部费用授权</button>}
      {indexAllowed&&<div className="space-y-3 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-semibold">本人内容索引</h3>
        <label className="block text-sm">查看本人知识库索引<select className={field} value={base} disabled={locked} onChange={e=>{setBase(e.target.value);setProgress(null);setConfirm(null)}}><option value="">请选择本人知识库</option>{bases.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {progress&&<KnowledgeIndexProgress value={progress}/>}
        <button type="button" className={button} disabled={billingLocked||!base||!settings?.configured} onClick={()=>setConfirm("rebuild")}>重建所选库的语义索引</button>
        <p className="text-sm leading-6 text-slate-600">启动会处理当前配置下本人全部待索引内容，以及之后新增的本人内容。授权给其他员工的共享内容仍由原所有者支付索引费用。</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={startAck} disabled={billingLocked||!consent?.profile_valid||!consent.index_enabled} onChange={e=>setStartAck(e.target.checked)}/>同意支付本人全部待索引内容及后续新增内容的提供商费用</label>
        <button type="button" className={button} disabled={billingLocked||!startAck||!consent?.profile_valid||!consent.index_enabled||!consent.profile_id} onClick={()=>{
          if(consent?.profile_id)void mutate({kind:"start",payload:{request_id:crypto.randomUUID(),expected_consent_revision:consent.revision,profile_id:consent.profile_id,
            profile_revision:consent.profile_revision,acknowledgement:INDEX_START_ACKNOWLEDGEMENT}})
        }}>确认启动本人索引</button>
      </div>}
      {confirm&&<div role="group" aria-label="确认语义索引变更" className="space-y-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
        <p>{confirm==="disable"?"停用会清除当前向量缓存，并使旧配置授权失效。":"重建会清除所选库的向量缓存并重新排队。历史计费记录保留，原授权下不会重复处理已分派片段。如需重做，请重新保存费用授权并明确启动，可能再次计费。"}</p>
        <button type="button" className={button} disabled={locked||confirm==="rebuild"&&draftChanged} onClick={()=>{
          if(!settings)return
          void mutate(confirm==="disable"?{kind:"settings",payload:{action:"disable",request_id:crypto.randomUUID(),expected_revision:settings.revision}}:
            {kind:"rebuild",payload:{action:"rebuild",request_id:crypto.randomUUID(),expected_revision:settings.revision,base_id:base}})
        }}>{confirm==="disable"?"确认停用语义配置":"确认重建所选库"}</button>{" "}
        <button type="button" className={button} disabled={locked} onClick={()=>setConfirm(null)}>取消变更</button>
      </div>}
    </>}
  </section>
}
