import {useEffect,useRef,useState,type FormEvent} from "react"
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeAgent,type PgNativeKnowledge} from "@/lib/pgNativePilotApi"
import {knowledgeBindingCurrent,knowledgeToolScopeCurrent} from "@/lib/pgNativeKnowledgeTool"
import {useKnowledgeToolContext} from "./useKnowledgeToolContext"
import PgNativeKnowledgeToolMode from "./PgNativeKnowledgeToolMode"
type Api=ReturnType<typeof createPgNativePilotApi>
const field="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
type Props={api:Api;agents:PgNativeAgent[];bases:PgNativeKnowledge[];active:boolean;enabled:boolean;onSaved:()=>Promise<void>;onExpired:()=>void}
export default function PgNativeAgentKnowledgePanel(props:Props){
  const [id,setId]=useState(""),[busy,setBusy]=useState(false)
  const agent=props.agents.find(row=>row.id===id)
  return <section aria-label="Agent 知识库绑定" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="font-semibold">Agent 知识库绑定</h2>
    <p className="text-sm leading-6 text-slate-600">最多选择三个本人或获授权的知识库。运行时会重新核对权限；模型调用使用你自己的模型连接，并须另行审批。</p>
    <label className="block text-sm font-medium">知识库绑定 Agent<select aria-label="知识库绑定 Agent" className={field} value={id} disabled={!props.active||busy} onChange={event=>setId(event.target.value)}>
      <option value="">请选择本人 Agent</option>{props.agents.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
    {agent&&<AgentKnowledgeForm key={agent.id+":"+agent.revision} {...props} agent={agent} onBusy={setBusy}/>}
  </section>
}
export function AgentKnowledgeForm({api,agent,bases,active,enabled,onSaved,onExpired,onBusy}:{
  api:Api;agent:PgNativeAgent;bases:PgNativeKnowledge[];active:boolean;enabled:boolean;onSaved:()=>Promise<void>;onExpired:()=>void;onBusy:(value:boolean)=>void
}){
  const [row,setRow]=useState(agent),[ids,setIds]=useState(()=>[...(agent.spec.knowledge_base_ids??[])])
  const [retrieval,setRetrieval]=useState(agent.spec.knowledge_retrieval)
  const semantic=useKnowledgeToolContext(api,active,onExpired)
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("")
  const live=useRef(false)
  useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
  const missing=ids.filter(id=>!bases.some(base=>base.id===id)),locked=!active||!enabled||busy||uncertain
  const handleError=(cause:unknown)=>{
    if(cause instanceof PgNativePilotError&&cause.status===401){onExpired();return}
    const known=cause instanceof PgNativePilotError&&[400,403,404,405,409,429].includes(cause.status)
    setUncertain(!known);setError(known?"权限、知识库或 Agent 版本已改变，请读取当前配置后核对。":"保存结果待确认。请读取当前配置核对后再编辑。")
  }
  const save=async(event:FormEvent)=>{
    event.preventDefault();if(locked||missing.length)return
    setBusy(true);onBusy(true);setError("");setNotice("")
    try{
      if(retrieval&&(!knowledgeBindingCurrent(retrieval,semantic.context)||!knowledgeToolScopeCurrent(ids,semantic.context))){setError("请读取并重新核对语义检索配置，或改用关键词检索。");return}
      const current=await api.updateAgentKnowledgeBases(row.id,row.revision,[...ids],retrieval??null)
      if(!live.current)return
      setRow(current);setIds([...(current.spec.knowledge_base_ids??[])]);setRetrieval(current.spec.knowledge_retrieval);setNotice("知识库绑定已保存。")
      await onSaved()
    }catch(cause){if(live.current)handleError(cause)}
    finally{onBusy(false);if(live.current)setBusy(false)}
  }
  const read=async()=>{
    if(!active||busy)return
    setBusy(true);onBusy(true);setError("")
    try{
      const current=await api.getAgent(row.id)
      if(!live.current)return
      setRow(current);setIds([...(current.spec.knowledge_base_ids??[])]);setRetrieval(current.spec.knowledge_retrieval);setUncertain(false);setNotice("已读取当前配置，请核对知识库选择。")
      await onSaved()
    }catch(cause){if(live.current)handleError(cause)}
    finally{onBusy(false);if(live.current)setBusy(false)}
  }
  return <form onSubmit={save} className="space-y-3">
    <fieldset disabled={locked} className="space-y-2"><legend className="text-sm font-medium">允许检索的知识库（{ids.length}/3）</legend>
      {bases.map(base=><label key={base.id} className="flex items-start gap-2 break-words text-sm"><input type="checkbox" aria-label={base.name} checked={ids.includes(base.id)} disabled={!ids.includes(base.id)&&ids.length>=3}
        onChange={event=>{const next=event.target.checked?[...ids,base.id]:ids.filter(id=>id!==base.id);setIds(next);if(!next.length)setRetrieval(undefined)}}/>{base.name}</label>)}
      {missing.map(id=><label key={id} className="flex items-start gap-2 break-all text-sm text-amber-900"><input type="checkbox" aria-label={"不可用知识库 "+id} checked onChange={()=>{const next=ids.filter(value=>value!==id);setIds(next);if(!next.length)setRetrieval(undefined)}}/>不可用知识库 {id}，请移除或重新核对授权。</label>)}
      {!bases.length&&!ids.length&&<p className="text-sm text-slate-500">当前没有可绑定的知识库。</p>}
    </fieldset>
    <button type="button" disabled={!active||busy||semantic.loading} onClick={()=>void semantic.load()} className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm">读取本人检索配置</button>
    {semantic.error&&<p role="alert" className="text-sm text-rose-800">{semantic.error}</p>}
    <PgNativeKnowledgeToolMode binding={retrieval} context={semantic.context} hasBases={ids.length>0} ids={ids} disabled={locked} onChange={setRetrieval}/>
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={locked||Boolean(missing.length)} className="min-h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">保存知识库绑定</button>
      <button type="button" disabled={!active||busy} className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm" onClick={()=>void read()}>读取当前 Agent 配置</button></div>
    {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  </form>
}
