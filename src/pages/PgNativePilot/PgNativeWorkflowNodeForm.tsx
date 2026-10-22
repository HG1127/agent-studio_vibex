import {useState} from "react"
import type {PgNativeAgent,PgNativeKnowledge,PgNativeModelConnection,PgNativeToolConnection} from "@/lib/pgNativePilotApi"
import {type WorkflowNode,type WorkflowNodeDataV2} from "@/lib/pgNativeWorkflowGraph"
const field="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
export const workflowButton="min-h-10 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
export const workflowSecondary="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
const defaults:Record<string,string>={calculate:'{"expression":"1+1"}',summarize:'{"text":"{{input}}"}',knowledge_search:'{"query":"{{input}}"}',web_search:'{"query":"{{input}}"}',web_fetch:'{"url":"https://example.com"}'}
export default function PgNativeWorkflowNodeForm({node,nodes,agents,models,tools,bases,enabled,onApply,onDirty}:{
  node:WorkflowNode;nodes:WorkflowNode[];agents:PgNativeAgent[];models:PgNativeModelConnection[];tools:PgNativeToolConnection[];bases:PgNativeKnowledge[];
  enabled:boolean;onApply:(data:WorkflowNodeDataV2)=>string|undefined;onDirty:(dirty:boolean)=>void
}){
  const [data,setData]=useState(()=>structuredClone(node.data))
  const [dirty,setDirty]=useState(false),[error,setError]=useState("")
  const [target,setTarget]=useState<"prompt"|"params_template"|"list_source"|"output_template">("prompt")
  const change=(patch:Partial<WorkflowNodeDataV2>,remove:Array<keyof WorkflowNodeDataV2>=[])=>{
    const next={...data,...patch};for(const key of remove)delete next[key]
    setData(next);setDirty(true);onDirty(true);setError("")
  }
  const text=(key:"input_hint"|"prompt"|"params_template"|"value"|"list_source"|"stop_keyword"|"output_template",label:string,max=12000)=>
    <label className="block text-sm font-medium">{label}<textarea className={field} aria-label={label} rows={key==="value"||key==="stop_keyword"?2:4} maxLength={max}
      value={String(data[key]??"")} onFocus={()=>{if(["prompt","params_template","list_source","output_template"].includes(key))setTarget(key as typeof target)}} onChange={event=>change({[key]:event.target.value})}/></label>
  const number=(key:"max_steps"|"count"|"max_iterations",label:string,max:number)=>
    <label className="block text-sm font-medium">{label}<input type="number" aria-label={label} className={field} min={1} max={max} step={1}
      value={data[key]??""} onChange={event=>change({[key]:event.target.value===""?undefined:Number(event.target.value)},event.target.value===""?[key]:[])}/></label>
  const providerBases={openai:"https://api.openai.com/v1",anthropic:"https://api.anthropic.com/v1",gemini:"https://generativelanguage.googleapis.com/v1beta"}
  const availableModels=models.flatMap(model=>model.enabled&&model.status==="ok"&&model.base_url===providerBases[model.provider]?model.models.map(id=>({label:model.name+" · "+id,
    binding:{connection_id:model.id,connection_revision:model.revision,model_id:id}})):[])
  const bindingValue=data.model_binding?JSON.stringify(data.model_binding):""
  const modelSelect=(optional=false)=><label className="block text-sm font-medium">{optional?"覆盖模型（可选）":"绑定模型"}
    <select aria-label={optional?"覆盖模型（可选）":"绑定模型"} className={field} value={bindingValue} onChange={event=>event.target.value?change({model_binding:JSON.parse(event.target.value)}):change({},["model_binding"])}>
      <option value="">{optional?"沿用 Agent 的绑定模型":"请选择已测试的本人模型"}</option>
      {bindingValue&&!availableModels.some(item=>JSON.stringify(item.binding)===bindingValue)&&<option value={bindingValue}>已绑定版本不可用，请重新选择</option>}
      {availableModels.map(item=><option key={JSON.stringify(item.binding)} value={JSON.stringify(item.binding)}>{item.label}</option>)}
    </select></label>
  const agentValue=data.agent_binding?JSON.stringify(data.agent_binding):""
  const httpValue=data.tool_binding?JSON.stringify(data.tool_binding):""
  const toolValue=httpValue?"http:"+httpValue:data.tool??""
  const variables=["input",...nodes.filter(item=>item.id!==node.id).map(item=>item.data.title+".output"),"loop.item","loop.index"]
  const variableFields=node.type==="loop"?data.mode==="list":["model","agent","tool","end"].includes(node.type)&&data.prompt_format!=="literal"
  const variableTarget=node.type==="tool"?"params_template":node.type==="end"?"output_template":node.type==="loop"?"list_source":target
  return <form aria-label="Workflow 节点配置" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" onSubmit={event=>{
    event.preventDefault();if(!enabled)return
    const result=onApply(data);if(result){setError(result);return}setDirty(false);onDirty(false);setError("")
  }}>
    <h3 className="font-semibold">节点配置</h3>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <fieldset disabled={!enabled} className="space-y-3"><legend className="sr-only">所选节点配置字段</legend>
      <label className="block text-sm font-medium">节点名称<input aria-label="节点名称" className={field} maxLength={120} required value={data.title} onChange={event=>change({title:event.target.value})}/></label>
      {node.type==="start"&&text("input_hint","输入提示",2000)}
      {node.type==="model"&&<>{modelSelect()}<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={data.prompt_format==="literal"}
        onChange={event=>event.target.checked?change({prompt_format:"literal"}):change({},["prompt_format"])}/>按原文发送提示词（不替换变量）</label>{text("prompt","模型提示词")}</>}
      {node.type==="agent"&&<>
        <label className="block text-sm font-medium">Agent 方案<select aria-label="Agent 方案" className={field} value={agentValue}
          onChange={event=>event.target.value?change({agent_binding:JSON.parse(event.target.value)}):change({},["agent_binding"])}>
          <option value="">请选择本人 Agent</option>
          {agentValue&&!agents.some(agent=>JSON.stringify({spec_id:agent.id,spec_revision:agent.revision})===agentValue)&&<option value={agentValue}>已绑定方案版本不可用，请重新选择</option>}
          {agents.map(agent=><option key={agent.id} value={JSON.stringify({spec_id:agent.id,spec_revision:agent.revision})}>{agent.name} · 修订 {agent.revision}</option>)}
        </select></label>
        {modelSelect(true)}{number("max_steps","Agent 最多规划轮数",5)}{text("prompt","Agent 任务模板")}
      </>}
      {node.type==="tool"&&<>
        <label className="block text-sm font-medium">工具<select aria-label="工具" className={field} value={toolValue} onChange={event=>{
          const value=event.target.value
          if(value.startsWith("http:"))change({tool_binding:JSON.parse(value.slice(5)),params_template:data.params_template??"{}"},["tool","model_binding","knowledge_base_ids","tool_binding_required"])
          else if(value)change({tool:value as WorkflowNodeDataV2["tool"],params_template:defaults[value]},["tool_binding","model_binding","knowledge_base_ids","tool_binding_required"])
          else change({tool_binding_required:true},["tool","tool_binding","model_binding","knowledge_base_ids"])
        }}>
          <option value="">请选择工具后再运行</option>
          <option value="calculate">计算</option><option value="summarize">摘要</option><option value="knowledge_search">知识库检索</option><option value="web_fetch">读取网页</option><option value="web_search">网页搜索</option>
          {httpValue&&!tools.some(tool=>JSON.stringify({connection_id:tool.id,connection_revision:tool.revision})===httpValue)&&<option value={toolValue}>已绑定 HTTP 版本不可用，请重新选择</option>}
          {tools.filter(tool=>tool.enabled).map(tool=><option key={tool.id} value={"http:"+JSON.stringify({connection_id:tool.id,connection_revision:tool.revision})}>{tool.name} · HTTP</option>)}
        </select></label>
        {data.tool==="summarize"&&modelSelect()}
        {data.tool==="knowledge_search"&&<fieldset className="space-y-2"><legend className="text-sm font-medium">检索知识库（最多三个）</legend>
          {bases.map(base=><label className="flex items-start gap-2 text-sm" key={base.id}><input type="checkbox" checked={data.knowledge_base_ids?.includes(base.id)??false}
            disabled={!enabled||!data.knowledge_base_ids?.includes(base.id)&&(data.knowledge_base_ids?.length??0)>=3} onChange={event=>change({knowledge_base_ids:event.target.checked?[...(data.knowledge_base_ids??[]),base.id]:(data.knowledge_base_ids??[]).filter(id=>id!==base.id)})}/>{base.name}</label>)}
        </fieldset>}
        {text("params_template","工具参数模板（JSON）")}
      </>}
      {node.type==="condition"&&<>
        <label className="block text-sm font-medium">比较上游节点<select aria-label="比较上游节点" className={field} value={data.ref_title??""}
          onChange={event=>event.target.value?change({ref_title:event.target.value}):change({},["ref_title"])}><option value="">使用传入结果</option>
          {nodes.filter(item=>item.id!==node.id).map(item=><option key={item.id} value={item.data.title}>{item.data.title}</option>)}</select></label>
        <label className="block text-sm font-medium">条件规则<select aria-label="条件规则" className={field} value={data.op??"contains"} onChange={event=>change({op:event.target.value as WorkflowNodeDataV2["op"]})}>
          <option value="contains">包含</option><option value="not_contains">不包含</option><option value="gt">大于</option><option value="lt">小于</option><option value="eq">相等</option>
        </select></label>{text("value","比较值",2000)}
      </>}
      {node.type==="loop"&&<>
        <label className="block text-sm font-medium">循环方式<select aria-label="循环方式" className={field} value={data.mode??"count"} onChange={event=>event.target.value==="count"?
          change({mode:"count",count:data.count??3},["list_source","delimiter"]):change({mode:"list",list_source:data.list_source??"{{input}}",delimiter:data.delimiter??"line"},["count"])}>
          <option value="count">按次数</option><option value="list">按列表逐项</option></select></label>
        {data.mode==="list"?<>{text("list_source","列表来源模板")}<label className="block text-sm font-medium">列表格式<select aria-label="列表格式" className={field} value={data.delimiter??"line"}
          onChange={event=>change({delimiter:event.target.value as WorkflowNodeDataV2["delimiter"]})}><option value="line">每行一项</option><option value="comma">逗号分隔</option><option value="json_array">JSON 数组</option></select></label></>:number("count","重复次数",1000)}
        {number("max_iterations","最多循环次数",20)}{text("stop_keyword","提前结束关键词",300)}
      </>}
      {node.type==="end"&&text("output_template","结果模板")}
      {variableFields&&<div className="space-y-2"><p className="text-xs text-slate-500">点击插入到当前模板字段</p><div className="flex max-h-28 flex-wrap gap-1 overflow-auto">
        {variables.map(value=><button type="button" key={value} className="rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs" onClick={()=>change({[variableTarget]:String(data[variableTarget]??"")+"{{"+value+"}}"})}>{"{{"+value+"}}"}</button>)}
      </div></div>}
    </fieldset>
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={!enabled||!dirty} className={workflowButton}>应用节点配置</button>
      <button type="button" className={workflowSecondary} disabled={!dirty} onClick={()=>{setData(structuredClone(node.data));setDirty(false);onDirty(false);setError("")}}>撤销本次节点编辑</button></div>
    {dirty&&<p role="status" className="text-xs text-amber-800">当前节点配置尚未应用，请应用后再保存或选择其他节点。</p>}
  </form>
}
