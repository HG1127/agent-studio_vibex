import {useCallback,useEffect,useRef,useState} from "react"
import type {createPgNativePilotApi,PgNativeAgent,PgNativeKnowledge,PgNativeModelConnection,PgNativeToolConnection,PgNativeWorkflow,WorkflowLatestOutputs} from "@/lib/pgNativePilotApi"
import {createPgNativeWorkflowEditor,emptyWorkflowEditor} from "@/lib/pgNativeWorkflowEditor"
import {addPgWorkflowNode,connectPgWorkflowNodes,patchPgWorkflowNode,removePgWorkflowNode,workflowGraphIssues,workflowExecutionIssues,workflowNodeNames,
  type WorkflowGraph,type WorkflowNodeType} from "@/lib/pgNativeWorkflowGraph"
import PgNativeWorkflowCanvas from "./PgNativeWorkflowCanvas"
import PgNativeWorkflowNodeForm,{workflowButton,workflowSecondary} from "./PgNativeWorkflowNodeForm"
import {importPgWorkflowJson,selectedPgWorkflowFragment,pastePgWorkflowFragment,alignPgWorkflowNodes,PG_WORKFLOW_TRANSFER_BYTES,type PgWorkflowFragment} from "@/lib/pgNativeWorkflowTransfer"
import {pgWorkflowTemplate} from "@/lib/pgNativeWorkflowTemplates"
import PgNativeWorkflowAuthoringTools from "./PgNativeWorkflowAuthoringTools"
import PgNativeWorkflowNodePreview from "./PgNativeWorkflowNodePreview"
import PgNativeWorkflowModelDebugPanel from "./PgNativeWorkflowModelDebugPanel"
import type {WorkflowDebugDraft} from "@/lib/pgNativeWorkflowDebugSession"
import PgNativeWorkflowSampleSource from "./PgNativeWorkflowSampleSource"
import {useMcpConnections} from "./useMcpConnections"
import {useKnowledgeToolContext} from "./useKnowledgeToolContext"
type Controller=ReturnType<typeof createPgNativeWorkflowEditor>
type Change={kind:"fresh";name:string}|{kind:"open";id:string}|{kind:"import";name:string;graph:WorkflowGraph}
export default function PgNativeWorkflowWorkspace({api,workflows,agents,models,tools,bases,active,writeEnabled,executionEnabled,onExpired,onSaved,onRun}:{
  api:ReturnType<typeof createPgNativePilotApi>;workflows:PgNativeWorkflow[];agents:PgNativeAgent[];models:PgNativeModelConnection[];tools:PgNativeToolConnection[];bases:PgNativeKnowledge[];
  active:boolean;writeEnabled:boolean;executionEnabled:boolean;onExpired:()=>void;onSaved:()=>Promise<void>;onRun:(id:string,revision:number)=>void
}){
  const mcp=useMcpConnections(api,active,onExpired)
  const knowledgeTool=useKnowledgeToolContext(api,active,onExpired)
  const [view,setView]=useState(emptyWorkflowEditor),[name,setName]=useState("")
  const [nodeId,setNodeId]=useState(""),[edgeId,setEdgeId]=useState("")
  const [formDirty,setFormDirty]=useState(false),[error,setError]=useState("")
  const [changing,setChanging]=useState<Change|null>(null)
  const [selectedIds,setSelectedIds]=useState<string[]>([]),[clipboardCount,setClipboardCount]=useState(0),[debugDraft,setDebugDraft]=useState<WorkflowDebugDraft|null>(null)
  const [runSamples,setRunSamples]=useState<WorkflowLatestOutputs|null>(null)
  useEffect(()=>{if(!active){setRunSamples(null);setDebugDraft(null)}},[active])
  const receiveSamples=useCallback((source:WorkflowLatestOutputs|null)=>{
    setRunSamples(source)
    setDebugDraft(current=>current?.samples.provenance?.kind==="history"&&
      (!source||source.run.run_id!==current.samples.provenance.run_id||source.run.output_version!==current.samples.provenance.output_version)?null:current)
  },[])
  const clipboard=useRef<PgWorkflowFragment|null>(null),importRead=useRef(0),ui=useRef({active,writeEnabled,formDirty})
  ui.current={active,writeEnabled,formDirty}
  const editor=useRef<Controller|null>(null)
  useEffect(()=>{
    const controller=createPgNativeWorkflowEditor(api,onExpired);editor.current=controller;setView(controller.snapshot());clipboard.current=null;setClipboardCount(0)
    const unsubscribe=controller.subscribe(()=>setView(controller.snapshot()))
    return ()=>{unsubscribe();controller.dispose();++importRead.current;clipboard.current=null;if(editor.current===controller)editor.current=null}
  },[api,onExpired])
  useEffect(()=>{
    if(!view.dirty&&!formDirty&&!view.pending)return
    const beforeUnload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=""}
    window.addEventListener("beforeunload",beforeUnload)
    return ()=>window.removeEventListener("beforeunload",beforeUnload)
  },[view.dirty,view.pending,formDirty])
  const draft=view.draft,graph=draft?.graph,selected=graph?.nodes.find(node=>node.id===nodeId),edge=graph?.edges.find(item=>item.id===edgeId)
  const locked=view.busy||view.loading||Boolean(view.pending),editable=active&&writeEnabled&&!locked
  const selection=graph?.nodes.filter(node=>selectedIds.includes(node.id)).map(node=>node.id)??[]
  const handleSelection=useCallback((ids:string[])=>{if(!active||formDirty)return;setSelectedIds(current=>current.length===ids.length&&current.every(id=>ids.includes(id))?current:ids)},[active,formDirty])
  const issues=graph?workflowGraphIssues(graph):[],runIssues=graph?workflowExecutionIssues(graph):[]
  const change=async(request:Change,discard=false)=>{
    const controller=editor.current,snapshot=controller?.snapshot()
    if(!controller||!snapshot||!ui.current.active||snapshot.busy||snapshot.pending||snapshot.loading||request.kind!=="open"&&!ui.current.writeEnabled)return
    if(!discard&&(snapshot.dirty||ui.current.formDirty)){setChanging(request);return}
    ++importRead.current;setChanging(null);setFormDirty(false);setNodeId("");setEdgeId("");setSelectedIds([]);setError("")
    if(request.kind==="fresh")editor.current?.fresh(request.name,true)
    else if(request.kind==="import")controller.importDraft(request.name,request.graph,true)
    else await editor.current?.open(request.id,true)
  }
  const alter=(work:(current:WorkflowGraph)=>WorkflowGraph)=>{
    if(!editable||!editor.current?.snapshot().draft)return
    if(formDirty){setError("请先应用或撤销当前节点配置。");return}
    const current=editor.current.snapshot().draft!
    try{editor.current.edit(current.name,work(current.graph));setError("")}
    catch(cause){setError(cause instanceof Error?cause.message:"画布更新失败，请检查节点和连线。")}
  }
  const save=async()=>{
    if(!active||!writeEnabled||view.busy||formDirty)return
    const controller=editor.current;if(!controller)return
    await controller.save()
    if(editor.current===controller&&!controller.snapshot().dirty&&controller.snapshot().notice)await onSaved()
  }
  const selectNode=(id:string,replaceSelection=true)=>{if(formDirty){setError("请先应用或撤销当前节点配置。");return}setNodeId(id);if(replaceSelection)setSelectedIds(id?[id]:[]);setEdgeId("");setError("")}
  const copySelection=()=>{
    if(!active||locked||formDirty||!graph)return
    const fragment=selectedPgWorkflowFragment(graph,selection)
    if(!fragment.nodes.length){setError("请选择需要复制的节点；开始节点不能复制。");return}
    clipboard.current=fragment;setClipboardCount(fragment.nodes.length);setError("")
  }
  const paste=(fragment=clipboard.current)=>{if(!fragment)return;let added:string[]|undefined
    alter(current=>{const result=pastePgWorkflowFragment(current,fragment);added=result.selected;return result.graph})
    if(added){setSelectedIds(added);setNodeId(added.length===1?added[0]:"");setEdgeId("")}
  }
  const deleteSelection=()=>{alter(current=>{const removed=new Set(current.nodes.filter(node=>node.type!=="start"&&selection.includes(node.id)).map(node=>node.id))
    return {...current,nodes:current.nodes.filter(node=>!removed.has(node.id)),edges:current.edges.filter(edge=>!removed.has(edge.source)&&!removed.has(edge.target))}});if(editable&&!formDirty){setNodeId("");setSelectedIds([])}}
  const loadFile=async(file:File)=>{
    const controller=editor.current;if(!controller||!ui.current.active||!ui.current.writeEnabled)return
    const ticket=++importRead.current,before=JSON.stringify(controller.snapshot().draft)
    try{
      if(file.size>PG_WORKFLOW_TRANSFER_BYTES)throw Error("导入文件最大 512KB。")
      const parsed=importPgWorkflowJson(await file.text())
      if(editor.current!==controller||ticket!==importRead.current||!ui.current.active||!ui.current.writeEnabled)return
      if(JSON.stringify(controller.snapshot().draft)!==before)throw Error("读取文件期间画布已变化，请重新选择文件。")
      await change({kind:"import",name:(parsed.name+"（导入）").slice(0,120),graph:parsed.graph})
    }catch(cause){if(editor.current===controller&&ticket===importRead.current)setError(cause instanceof Error?cause.message:"导入失败，请检查文件。")}
  }
  return <section aria-label="PG Workflow 工作台" className="space-y-4">
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {view.error&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{view.error}</p>}
    {view.notice&&<p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{view.notice}</p>}
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">我的工作流画布</h2>
      <p className="text-sm leading-6 text-slate-500">配置模型、工具、Agent、条件和循环。保存配置不会运行节点；运行和每次外部操作需要单独授权与审批。</p>
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-52 flex-1 text-sm font-medium">打开工作流
        <select aria-label="打开工作流" className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" disabled={locked} value={draft?.id??""}
          onChange={event=>{if(event.target.value)void change({kind:"open",id:event.target.value})}}><option value="">请选择本人工作流</option>
          {workflows.map(flow=><option key={flow.id} value={flow.id}>{flow.name} · 修订 {flow.revision}</option>)}
        </select></label>
        <button type="button" className={workflowSecondary} disabled={locked||!draft?.id} onClick={()=>{if(draft?.id)void change({kind:"open",id:draft.id})}}>重新读取服务器版本</button>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();if(writeEnabled&&name.trim())void change({kind:"fresh",name:name.trim()})}}>
        <label className="min-w-52 flex-1 text-sm font-medium">新工作流名称<input aria-label="新工作流名称" maxLength={120} required value={name} disabled={!writeEnabled||locked}
          className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" onChange={event=>setName(event.target.value)}/></label>
        <button type="submit" className={workflowButton} disabled={!writeEnabled||locked||!name.trim()}>新建画布草稿</button>
      </form>
      <label className="block text-sm font-medium">导入 Workflow JSON<input type="file" aria-label="导入 Workflow JSON" accept="application/json,.json" disabled={!active||!writeEnabled||locked}
        className="mt-1.5 block w-full text-sm" onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void loadFile(file)}}/></label>
      {!writeEnabled&&<p role="status" className="text-sm text-amber-800">当前环境只允许查看工作流，尚未开放配置保存。</p>}
    </div>
    {changing&&<div role="group" aria-label="确认切换工作流" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <p>当前草稿尚未保存。确认放弃本地更改并切换？</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={workflowSecondary} onClick={()=>void change(changing,true)}>放弃草稿并继续</button>
        <button type="button" className={workflowSecondary} onClick={()=>setChanging(null)}>继续编辑</button></div>
    </div>}
    {view.loading&&<p role="status" className="text-sm text-slate-500">读取工作流中…</p>}
    {draft&&graph&&<>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="min-w-44 flex-1 text-sm font-medium">工作流名称<input aria-label="工作流名称" value={draft.name} maxLength={120} disabled={!editable||formDirty}
          className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" onChange={event=>editor.current?.edit(event.target.value,graph)}/></label>
        <span className="py-2 text-xs text-slate-500">{draft.revision?"修订 "+draft.revision:"新草稿"} · {view.dirty||formDirty?"未保存":"已保存"}</span>
        <button type="button" className={workflowSecondary} disabled={!editable||formDirty||!view.undoDepth} onClick={()=>editor.current?.undo()}>撤销画布更改</button>
        <button type="button" className={workflowSecondary} disabled={!editable||formDirty||!view.redoDepth} onClick={()=>editor.current?.redo()}>重做画布更改</button>
        <button type="button" className={workflowButton} disabled={!active||!writeEnabled||view.busy||view.loading||formDirty||!view.pending&&(!view.dirty||Boolean(issues.length))} onClick={()=>void save()}>
          {view.busy?"保存中…":view.pending?"核对并确认上次保存":"保存工作流"}
        </button>
        <button type="button" className={workflowButton} disabled={!active||!executionEnabled||locked||formDirty||view.dirty||!draft.id||Boolean(runIssues.length)} onClick={()=>onRun(draft.id,draft.revision)}>运行已保存工作流</button>
        <label className="basis-full text-sm font-medium">工作流描述<textarea aria-label="工作流描述" rows={2} maxLength={500} disabled={!editable||formDirty} value={graph.description??""}
          className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" onChange={event=>editor.current?.edit(draft.name,{...graph,description:event.target.value})}/></label>
      </div>
      {view.pending&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">上次保存尚未确认。原请求和版本已保留，请确认原保存结果后再编辑或切换。</p>}
      {!!issues.length&&<div role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">保存前需要修正</p><ul className="mt-2 list-inside list-disc">{issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>}
      <PgNativeWorkflowAuthoringTools graph={graph} name={draft.name} selected={selection.length} clipboard={clipboardCount} readEnabled={active&&!locked&&!formDirty} editEnabled={editable&&!formDirty}
        onCopy={copySelection} onPaste={()=>paste()} onDuplicate={()=>paste(selectedPgWorkflowFragment(graph,selection))} onDelete={deleteSelection}
        onSelectAll={()=>{setSelectedIds(graph.nodes.map(node=>node.id));setNodeId("");setEdgeId("")}} onClear={()=>{setSelectedIds([]);setNodeId("");setEdgeId("")}}
        onAlign={mode=>alter(current=>alignPgWorkflowNodes(current,selection,mode))} onTemplate={kind=>{const preset=pgWorkflowTemplate(kind);void change({kind:"import",...preset})}} onError={setError}/>
      {draft.id&&<PgNativeWorkflowSampleSource key={draft.id} api={api} workflowId={draft.id} active={active} onExpired={onExpired} onSnapshot={receiveSamples}/>}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3" aria-label="添加工作流节点">
        {(Object.keys(workflowNodeNames) as WorkflowNodeType[]).map(type=><button key={type} type="button" className={workflowSecondary} disabled={!editable||formDirty||type==="start"}
          onClick={()=>alter(current=>addPgWorkflowNode(current,type,edge?.id))}>添加{workflowNodeNames[type]}</button>)}
        <p className="basis-full text-xs leading-5 text-slate-500">先点击连线再添加，可插入节点；条件会建立两个出口，循环会建立循环体和返回边。也可直接拖动节点端口连接。</p>
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
        <PgNativeWorkflowCanvas graph={graph} selectedNodes={selection} selectedEdge={edge?.id??""} enabled={editable&&!formDirty}
          onGraph={alter} onNode={id=>selectNode(id,false)} onSelection={handleSelection} onShortcut={action=>{
            if(!active||locked||formDirty)return
            if(action==="c")copySelection()
            else if(action==="a"){setSelectedIds(graph.nodes.map(node=>node.id));setNodeId("");setEdgeId("")}
            else if(editable){if(action==="v")paste();else if(action==="d")paste(selectedPgWorkflowFragment(graph,selection));else if(action==="undo")editor.current?.undo();else if(action==="redo")editor.current?.redo()}
          }} onEdge={id=>{if(formDirty){setError("请先应用或撤销当前节点配置。");return}setEdgeId(id);setNodeId("")}}
          onConnect={connection=>{if(connection.source&&connection.target)alter(current=>connectPgWorkflowNodes(current,connection.source,connection.target,connection.sourceHandle==="body"?undefined:connection.sourceHandle??undefined))}}
          onGesture={begin=>{if(begin)editor.current?.beginGesture();else editor.current?.endGesture()}}/>
        {selected?<div className="space-y-4">
          <button type="button" className={workflowSecondary} disabled={!active||mcp.loading} onClick={()=>void mcp.load()}>读取本人 MCP 工具供工作流选择</button>
          {mcp.error&&<p role="alert" className="text-sm text-rose-800">{mcp.error}</p>}
          <PgNativeWorkflowNodeForm key={selected.id+":"+JSON.stringify(selected.data)} node={selected} nodes={graph.nodes} agents={agents} models={models} tools={tools} bases={bases} mcps={mcp.connections}
          knowledgeContext={knowledgeTool.context} onReadKnowledge={()=>void knowledgeTool.load()} knowledgeReading={knowledgeTool.loading} knowledgeError={knowledgeTool.error}
          enabled={editable} onDirty={setFormDirty} onApply={data=>{
            if(!editable)return "当前环境未开放配置编辑。"
            const current=editor.current?.snapshot().draft;if(!current)return "草稿已关闭。"
            try{editor.current?.edit(current.name,patchPgWorkflowNode(current.graph,selected.id,data));setError("");return undefined}
            catch(cause){return cause instanceof Error&&cause.message!=="invalid_workflow_graph_v2"?cause.message:"请检查节点名称、绑定、轮数和模板长度。"}
          }}/><PgNativeWorkflowNodePreview key={draft.id+":"+draft.revision+":"+selected.id} node={selected} graph={graph} workflowId={draft.id} revision={draft.revision}
            history={runSamples?.run.workflow_id===draft.id?runSamples:null}
            canDebug={executionEnabled&&!view.dirty&&!formDirty&&!locked} onPrepare={request=>setDebugDraft({...request,nodeTitle:selected.data.title,workflowName:draft.name})}/></div>:<div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
            <p>{edge?"已选择连线，可插入节点或删除此连线。":"点击节点配置字段，点击连线插入节点。"}</p>
            {edge&&<><p className="break-words">{graph.nodes.find(node=>node.id===edge.source)?.data.title} → {graph.nodes.find(node=>node.id===edge.target)?.data.title}</p>
              <button type="button" className={workflowSecondary} disabled={!editable} onClick={()=>{alter(current=>({...current,edges:current.edges.filter(item=>item.id!==edge.id)}));setEdgeId("")}}>删除所选连线</button></>}
          </div>}
      </div>
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="text-sm font-medium">选择节点<select aria-label="选择节点" className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={selected?.id??""} disabled={locked||formDirty}
          onChange={event=>selectNode(event.target.value)}><option value="">请选择节点以查看配置</option>{graph.nodes.map(node=><option key={node.id} value={node.id}>{node.data.title}</option>)}</select></label>
        <label className="text-sm font-medium">选择连线<select aria-label="选择连线" className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={edge?.id??""} disabled={locked||formDirty}
          onChange={event=>{setEdgeId(event.target.value);setNodeId("")}}><option value="">请选择连线以插入节点</option>{graph.edges.map(item=>{
            const source=graph.nodes.find(node=>node.id===item.source),target=graph.nodes.find(node=>node.id===item.target)
            const port=item.sourceHandle==="true"?" · 满足":item.sourceHandle==="false"?" · 不满足":item.sourceHandle==="done"?" · 结束":source?.type==="loop"?" · 循环体":""
            return <option key={item.id} value={item.id}>{source?.data.title} → {target?.data.title}{port}</option>
          })}</select></label>
      </div>
      {selected&&selected.type!=="start"&&<button type="button" className={workflowSecondary} disabled={!editable||formDirty} onClick={()=>{alter(current=>removePgWorkflowNode(current,selected.id));setNodeId("")}}>删除所选节点</button>}
      {!issues.length&&!!runIssues.length&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">结构可以保存；运行前还需补齐：{runIssues.join("；")}</p>}
    </>}
      <PgNativeWorkflowModelDebugPanel api={api} draft={debugDraft} active={active} enabled={executionEnabled} onExpired={onExpired} source={runSamples}/>
  </section>
}
