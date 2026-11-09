import {useCallback,useEffect,useMemo,useState} from "react"
import {Link} from "react-router-dom"
import {BookOpen,RefreshCw,ShieldAlert} from "lucide-react"
import {loadSkillSummaries,skillBindingOf,skillApi,type SkillRef,type SkillSummary,type SkillDetail} from "@/lib/skillLibrary"

type Props={roleName:string;refs:SkillRef[];onChange:(next:SkillRef[])=>void;disabled:boolean}
export function AgentRoleSkillBinder({roleName,refs,onChange,disabled}:Props){
  const [skills,setSkills]=useState<SkillSummary[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState("")
  const [validRefs,setValidRefs]=useState<Record<string,boolean>>({})
  const refKey=JSON.stringify(refs)
  const load=useCallback(async()=>{
    setLoading(true)
    try{setSkills(await loadSkillSummaries());setError("")}
    catch(e){setError(String((e as Error).message))}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{
    let active=true
    void loadSkillSummaries().then(rows=>{
      if(active){setSkills(rows);setError("");setLoading(false)}
    }).catch(e=>{
      if(active){setError(String((e as Error).message));setLoading(false)}
    })
    return()=>{active=false}
  },[])
  const available=useMemo(()=>skills.filter(x=>skillBindingOf(x)),[skills])
  useEffect(()=>{
    let live=true
    const current=JSON.parse(refKey) as SkillRef[]
    void Promise.all(current.map(async ref=>{
      const found=skills.find(item=>item.id===ref.id)
      if(!found?.active)return [ref.id,false] as const
      if(found.approved_version===ref.version&&found.approved_hash===ref.hash)
        return [ref.id,true] as const
      try {
        const detail=await skillApi<SkillDetail>("/detail?id="+encodeURIComponent(ref.id)+"&version="+ref.version)
        return [ref.id,detail.approved&&detail.active&&detail.hash===ref.hash] as const
      } catch {return [ref.id,false] as const}
    })).then(pairs=>{if(live)setValidRefs(Object.fromEntries(pairs))})
    return()=>{live=false}
  },[refKey,skills])
  const selected=refs.map(ref=>{
    const match=skills.find(s=>s.id===ref.id)
    return {ref,match,valid:validRefs[ref.id]}
  })
  return <section aria-label="角色 Skills 方法绑定" className="mt-4 border-t border-border pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h5 className="flex items-center gap-1.5 text-sm font-semibold"><BookOpen className="h-4 w-4 text-primary"/>这个角色使用的 Skills</h5>
      <button type="button" onClick={()=>void load()} disabled={disabled||loading} aria-label="刷新可用 Skills"
        className="rounded-lg border border-border p-2 hover:bg-secondary disabled:opacity-50"><RefreshCw className="h-4 w-4"/></button>
    </div>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">让「{roleName||"当前角色"}」调用经过审核的方法，最多绑定两个版本。它只改变分析方法，不会增加工具权限。运行启动时固定版本和内容。</p>
    {!!error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    <div className="mt-3 space-y-2">
      {selected.map(({ref,match,valid})=><div key={ref.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-xs">
        <span className="min-w-0 flex-1 break-all font-medium">{match?.name||"已失效的 Skill"} · v{ref.version}
          {valid===false&&<span className="ml-2 text-amber-700">版本不可用，请重新选择</span>}
          {valid===undefined&&<span className="ml-2 text-muted-foreground">核验中…</span>}
        </span>
        <button type="button" className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
          disabled={disabled} onClick={()=>onChange(refs.filter(x=>x.id!==ref.id))}>移除</button>
      </div>)}
      {!refs.length&&<div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">尚未绑定 Skill，当前角色将按照默认职责执行。</div>}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <select aria-label={"为"+roleName+"选择 Skill"} disabled={disabled||loading||refs.length>=2}
        value="" className="min-h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs"
        onChange={e=>{
          const item=available.find(x=>x.id===e.target.value)
          if(!item)return
          const binding=skillBindingOf(item)
          if(!binding)return
          onChange([...refs.filter(x=>x.id!==item.id),binding])
        }}>
        <option value="">选择已审核 Skill（{available.length} 项可用）</option>
        {available.filter(x=>!refs.some(ref=>ref.id===x.id)).map(x=>
          <option key={x.id} value={x.id}>{x.name} · v{x.approved_version}</option>)}
      </select>
      <Link to="/skills" target="_blank" rel="noopener noreferrer"
        title="在新标签页管理 Skill，原 Agent 草稿继续保留；完成后返回并刷新 Skills"
        className="rounded-lg border border-primary/30 px-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/5">在新标签页管理 Skill</Link>
    </div>
    {selected.some(x=>x.valid===false)&&<p role="status" className="mt-2 flex items-start gap-1.5 text-xs text-amber-700"><ShieldAlert className="mt-0.5 h-3.5 w-3.5"/>已绑定版本可能被停用或变更。正式运行时后端会再次核验所有权、审核及版本哈希。</p>}
  </section>
}
