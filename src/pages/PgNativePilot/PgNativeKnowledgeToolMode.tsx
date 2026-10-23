import {currentKnowledgeBinding,knowledgeBindingCurrent,knowledgeToolScopeCurrent,type KnowledgeRetrievalBinding,type KnowledgeToolContext} from "@/lib/pgNativeKnowledgeTool"
import {useState} from "react"
export default function PgNativeKnowledgeToolMode({binding,context,hasBases,ids=[],disabled,onChange}:{
  binding?:KnowledgeRetrievalBinding;context:KnowledgeToolContext|null;hasBases:boolean;ids?:readonly string[];disabled:boolean;onChange:(binding:KnowledgeRetrievalBinding|undefined)=>void
}){
  const configured=Boolean(currentKnowledgeBinding("semantic",context)),ready=configured&&knowledgeToolScopeCurrent(ids,context),current=!binding||ready&&knowledgeBindingCurrent(binding,context)
  const [error,setError]=useState("")
  return <div className="space-y-2">
    <label className="block text-sm font-medium">知识库检索方式<select aria-label="知识库检索方式" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
      disabled={disabled} value={binding?current?binding.mode:"unavailable":"keyword"} onChange={event=>{
        const value=event.currentTarget.value;setError("")
        if(value==="keyword")onChange(undefined)
        else{const next=currentKnowledgeBinding(value as "semantic"|"hybrid",context)
          if(next&&hasBases)onChange(next);else setError("检索配置或知识库选择已变化，请重新读取后选择。")}
      }}>
      <option value="keyword">关键词检索（不调用向量模型）</option>
      {!current&&<option value="unavailable" disabled>已保存的语义配置待核对，请读取后重新选择</option>}
      <option value="semantic" disabled={!ready||!hasBases}>语义检索</option>
      <option value="hybrid" disabled={!ready||!hasBases}>混合检索（语义与关键词）</option>
    </select></label>
    {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}
    <p className="text-xs leading-6 text-slate-600">保存配置不会调用模型。语义和混合检索使用你自己的查询模型与密钥，每个检索步骤都需确认费用；后续模型生成另行审批。</p>
    {!ready&&<p role="status" className="text-xs leading-6 text-amber-900">{!configured?context?.enabled===false?"当前环境尚未开放任务内语义检索。":"请读取检索配置，并在知识库页面配置和授权自己的语义查询。":!hasBases?"请先选择知识库。":"所选知识库已变化、无权访问，或尚无允许语义检索的资料，请核对授权。"}当前可选择关键词检索。</p>}
    {!current&&<p role="status" className="text-xs text-amber-900">已有配置不会自动升级。请核对当前授权后重新选择检索方式，或改用关键词检索。</p>}
  </div>
}
