import {useState} from "react"
import {exportPgWorkflowJson,type PgWorkflowAlign} from "@/lib/pgNativeWorkflowTransfer"
import type {WorkflowGraph} from "@/lib/pgNativeWorkflowGraph"
import {pgWorkflowTemplates,type PgWorkflowTemplate} from "@/lib/pgNativeWorkflowTemplates"
import {workflowSecondary} from "./PgNativeWorkflowNodeForm"
export default function PgNativeWorkflowAuthoringTools({graph,name,selected,clipboard,readEnabled,editEnabled,onCopy,onPaste,onDuplicate,onDelete,onSelectAll,onClear,onAlign,onTemplate,onError}:{
  graph:WorkflowGraph;name:string;selected:number;clipboard:number;readEnabled:boolean;editEnabled:boolean;
  onCopy:()=>void;onPaste:()=>void;onDuplicate:()=>void;onDelete:()=>void;onSelectAll:()=>void;onClear:()=>void;onAlign:(mode:PgWorkflowAlign)=>void;onTemplate:(kind:PgWorkflowTemplate)=>void;onError:(message:string)=>void
}){
  const [reviewed,setReviewed]=useState(""),[mode,setMode]=useState<PgWorkflowAlign>("left"),content=JSON.stringify([name,graph])
  return <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Workflow 高效编辑">
    <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-sm">已选 {selected} 个节点</span>
      <button type="button" className={workflowSecondary} disabled={!readEnabled} onClick={onSelectAll}>全选节点</button>
      <button type="button" className={workflowSecondary} disabled={!readEnabled||!selected} onClick={onClear}>清空选择</button>
      <button type="button" className={workflowSecondary} disabled={!readEnabled||!selected} onClick={onCopy}>复制所选片段</button>
      <button type="button" className={workflowSecondary} disabled={!editEnabled||!clipboard} onClick={onPaste}>粘贴片段（{clipboard}）</button>
      <button type="button" className={workflowSecondary} disabled={!editEnabled||!selected} onClick={onDuplicate}>创建所选副本</button>
      <button type="button" className={workflowSecondary} disabled={!editEnabled||!selected} onClick={onDelete}>删除所选节点组</button>
    </div>
    <div className="flex flex-wrap items-center gap-2"><label className="text-sm">排列方式<select aria-label="排列方式" className="ml-2 min-h-10 rounded-xl border border-slate-200 bg-white px-3" value={mode} disabled={!editEnabled} onChange={event=>setMode(event.target.value as PgWorkflowAlign)}>
      {Object.entries({left:"左对齐",centerX:"水平居中",right:"右对齐",top:"顶部对齐",centerY:"垂直居中",bottom:"底部对齐",distributeX:"水平等距",distributeY:"垂直等距"}).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <button type="button" className={workflowSecondary} disabled={!editEnabled||selected<(mode.startsWith("distribute")?3:2)} onClick={()=>onAlign(mode)}>排列所选节点</button>
    </div>
    <p className="text-xs leading-5 text-slate-500">拖动框选或按住 Shift 多选；开始节点不会被复制或删除。片段只保留在当前员工会话内，可跨本人画布粘贴。画布聚焦时支持 Ctrl/Cmd+C、V、D、A、Z 和 Shift+Z。</p>
    <details className="space-y-3"><summary className="cursor-pointer text-sm font-medium">示例与可移植导出</summary>
      <div className="mt-3 flex flex-wrap gap-2">{(Object.keys(pgWorkflowTemplates) as PgWorkflowTemplate[]).map(kind=><button type="button" key={kind} className={workflowSecondary} disabled={!editEnabled} onClick={()=>onTemplate(kind)}>载入{pgWorkflowTemplates[kind]}示例</button>)}</div>
      <p className="mt-3 text-sm leading-6 text-slate-500">示例载入为新草稿。导出只包含结构、描述、提示词和参数文本，会移除模型、工具、Agent 与知识库绑定；手写在文本中的凭据不会被自动识别。</p>
      <label className="mt-3 flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" checked={reviewed===content} disabled={!readEnabled} onChange={event=>setReviewed(event.target.checked?content:"")}/>我已核对导出文本，不包含手写密钥、凭据或不应分享的资料。</label>
      <button type="button" className={workflowSecondary+" mt-3"} disabled={!readEnabled||reviewed!==content} onClick={()=>{
        if(!readEnabled||reviewed!==content)return
        try{const json=exportPgWorkflowJson(name,graph),url=URL.createObjectURL(new Blob([json],{type:"application/json;charset=utf-8"})),link=document.createElement("a")
          link.href=url;link.download=(name.replace(/[^\p{L}\p{N}_-]+/gu,"_").slice(0,80)||"workflow")+".json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setReviewed("")
        }catch(error){onError(error instanceof Error?error.message:"导出失败，请检查节点和连线。")}
      }}>导出可移植 Workflow JSON</button>
    </details>
  </div>
}
