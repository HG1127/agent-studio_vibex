import {memo,useCallback,useLayoutEffect,useMemo,useRef} from "react"
import {Background,Controls,Handle,Position,ReactFlow,type Node,type NodeProps,type NodeChange,type EdgeChange,type Connection} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {workflowNodeNames,type WorkflowGraph,type WorkflowNodeDataV2,type WorkflowNodeType} from "@/lib/pgNativeWorkflowGraph"
type FlowNode=Node<WorkflowNodeDataV2&Record<string,unknown>,WorkflowNodeType>
const colors:Record<string,string>={start:"border-emerald-300",end:"border-slate-400",model:"border-indigo-300",agent:"border-purple-300",tool:"border-amber-300",condition:"border-sky-300",loop:"border-rose-300"}
const Card=memo(function Card({data,type,selected}:NodeProps<FlowNode>){
  return <div className={"w-44 rounded-xl border-2 bg-white px-4 py-3 shadow-sm "+(selected?"ring-2 ring-indigo-500 ring-offset-2 ":"")+(colors[type??""]??"border-slate-200")}>
    {type!=="start"&&<Handle type="target" position={Position.Left}/>}
    <p className="max-w-52 truncate text-sm font-semibold">{data.title}</p>
    <p className="mt-1 text-xs text-slate-500">{workflowNodeNames[type as WorkflowNodeType]}</p>
    {type==="condition"?<><Handle id="true" type="source" position={Position.Right} style={{top:"30%"}}/>
      <Handle id="false" type="source" position={Position.Right} style={{top:"75%"}}/><p className="mt-2 text-right text-xs text-sky-700">满足 / 不满足</p></>:
      type==="loop"?<><Handle id="body" type="source" position={Position.Right} style={{top:"30%"}}/>
        <Handle id="done" type="source" position={Position.Right} style={{top:"75%"}}/><p className="mt-2 text-right text-xs text-rose-700">循环体 / 结束</p></>:
        type!=="end"?<Handle type="source" position={Position.Right}/>:null}
  </div>
})
const nodeTypes={start:Card,end:Card,model:Card,agent:Card,tool:Card,condition:Card,loop:Card}
const multiSelectKeys=["Shift","Control","Meta"],deleteKeys=["Backspace","Delete"]
const fitOptions={padding:0.3},proOptions={hideAttribution:true}
export default function PgNativeWorkflowCanvas({graph,selectedNodes,selectedEdge,enabled,onGraph,onNode,onEdge,onConnect,onGesture,onSelection,onShortcut}:{
  graph:WorkflowGraph;selectedNodes:string[];selectedEdge:string;enabled:boolean;onGraph:(update:(current:WorkflowGraph)=>WorkflowGraph)=>void;
  onNode:(id:string)=>void;onEdge:(id:string)=>void;onConnect:(connection:Connection)=>void;onGesture:(begin:boolean)=>void
  onSelection:(ids:string[])=>void;onShortcut:(action:string)=>void
}){
  // React Flow subscribes to these callbacks and controlled arrays. Keep their
  // references stable while forwarding events to the latest committed editor.
  const actions=useRef({graph,enabled,onGraph,onNode,onEdge,onConnect,onGesture,onSelection})
  useLayoutEffect(()=>{actions.current={graph,enabled,onGraph,onNode,onEdge,onConnect,onGesture,onSelection}},[graph,enabled,onGraph,onNode,onEdge,onConnect,onGesture,onSelection])
  const selectionKey=JSON.stringify([...selectedNodes].sort())
  const nodes:FlowNode[]=useMemo(()=>{
    const selected=new Set(JSON.parse(selectionKey) as string[])
    return graph.nodes.map(node=>({...node,data:{...node.data},selected:selected.has(node.id),deletable:node.type!=="start",ariaLabel:workflowNodeNames[node.type]+"节点："+node.data.title}))
  },[graph.nodes,selectionKey])
  const edges=useMemo(()=>graph.edges.map(edge=>({...edge,selected:edge.id===selectedEdge,
    sourceHandle:!edge.sourceHandle&&graph.nodes.find(node=>node.id===edge.source)?.type==="loop"?"body":edge.sourceHandle,
    label:edge.sourceHandle==="true"?"满足":edge.sourceHandle==="false"?"不满足":edge.sourceHandle==="done"?"结束":""})),[graph.edges,graph.nodes,selectedEdge])
  const positions=useCallback((changes:NodeChange<FlowNode>[])=>{
    const {graph,enabled,onGraph}=actions.current
    if(!enabled)return
    const removed=new Set(changes.filter(change=>change.type==="remove").map(change=>change.id).filter(id=>graph.nodes.find(node=>node.id===id)?.type!=="start"))
    const moved=new Map(changes.flatMap(change=>{
      if(change.type!=="position"||!change.position)return []
      const current=graph.nodes.find(node=>node.id===change.id)
      return current&&(current.position.x!==change.position.x||current.position.y!==change.position.y)?[[change.id,change.position] as const]:[]
    }))
    if(!removed.size&&!moved.size)return
    onGraph(current=>({...current,nodes:current.nodes.filter(node=>!removed.has(node.id)).map(node=>{
      const position=moved.get(node.id);return position?{...node,position:{x:Math.max(-100000,Math.min(100000,position.x)),y:Math.max(-100000,Math.min(100000,position.y))}}:node
    }),edges:current.edges.filter(edge=>!removed.has(edge.source)&&!removed.has(edge.target))}))
  },[])
  const edgeChanges=useCallback((changes:EdgeChange[])=>{
    const {enabled,onGraph}=actions.current
    if(!enabled)return;const removed=new Set(changes.filter(change=>change.type==="remove").map(change=>change.id))
    if(removed.size)onGraph(current=>({...current,edges:current.edges.filter(edge=>!removed.has(edge.id))}))
  },[])
  const nodeClick=useCallback((_event:unknown,node:FlowNode)=>actions.current.onNode(node.id),[])
  const edgeClick=useCallback((_event:unknown,edge:{id:string})=>actions.current.onEdge(edge.id),[])
  const select=useCallback(({nodes}:{nodes:FlowNode[]})=>actions.current.onSelection(nodes.map(node=>node.id)),[])
  const connect=useCallback((connection:Connection)=>actions.current.onConnect(connection),[])
  const dragStart=useCallback(()=>actions.current.onGesture(true),[])
  const dragStop=useCallback(()=>actions.current.onGesture(false),[])
  return <div aria-label="PG Workflow 可视化画布" tabIndex={0} className="h-[460px] min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 sm:h-[540px]" onKeyDown={event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey||(event.target instanceof HTMLElement&&(event.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target.tagName))))return
    const key=event.key.toLowerCase();if(!["c","v","d","a","z","y"].includes(key))return
    event.preventDefault();event.stopPropagation();onShortcut(key==="z"?(event.shiftKey?"redo":"undo"):key==="y"?"redo":key)
  }}>
    <ReactFlow<FlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={positions} onEdgesChange={edgeChanges}
      onNodeClick={nodeClick} onEdgeClick={edgeClick} onConnect={connect}
      onSelectionChange={select} selectionOnDrag selectionKeyCode="Shift" multiSelectionKeyCode={multiSelectKeys}
      onNodeDragStart={dragStart} onNodeDragStop={dragStop} nodesDraggable={enabled} nodesConnectable={enabled} edgesReconnectable={false}
      deleteKeyCode={enabled?deleteKeys:null} fitView fitViewOptions={fitOptions} minZoom={0.15} maxZoom={1.8}
      proOptions={proOptions}>
      <Controls showInteractive={false}/><Background gap={18}/>
    </ReactFlow>
  </div>
}
