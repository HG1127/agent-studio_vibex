import {memo} from "react"
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
export default function PgNativeWorkflowCanvas({graph,selectedNode,selectedEdge,enabled,onGraph,onNode,onEdge,onConnect,onGesture}:{
  graph:WorkflowGraph;selectedNode:string;selectedEdge:string;enabled:boolean;onGraph:(update:(current:WorkflowGraph)=>WorkflowGraph)=>void;
  onNode:(id:string)=>void;onEdge:(id:string)=>void;onConnect:(connection:Connection)=>void;onGesture:(begin:boolean)=>void
}){
  const nodes:FlowNode[]=graph.nodes.map(node=>({...node,data:{...node.data},selected:node.id===selectedNode,deletable:node.type!=="start",ariaLabel:workflowNodeNames[node.type]+"节点："+node.data.title}))
  const edges=graph.edges.map(edge=>({...edge,selected:edge.id===selectedEdge,
    sourceHandle:!edge.sourceHandle&&graph.nodes.find(node=>node.id===edge.source)?.type==="loop"?"body":edge.sourceHandle,
    label:edge.sourceHandle==="true"?"满足":edge.sourceHandle==="false"?"不满足":edge.sourceHandle==="done"?"结束":""}))
  const positions=(changes:NodeChange<FlowNode>[])=>{
    if(!enabled)return
    const removed=new Set(changes.filter(change=>change.type==="remove").map(change=>change.id).filter(id=>graph.nodes.find(node=>node.id===id)?.type!=="start"))
    const moved=new Map(changes.flatMap(change=>change.type==="position"&&change.position?[[change.id,change.position] as const]:[]))
    if(!removed.size&&!moved.size)return
    onGraph(current=>({...current,nodes:current.nodes.filter(node=>!removed.has(node.id)).map(node=>{
      const position=moved.get(node.id);return position?{...node,position:{x:Math.max(-100000,Math.min(100000,position.x)),y:Math.max(-100000,Math.min(100000,position.y))}}:node
    }),edges:current.edges.filter(edge=>!removed.has(edge.source)&&!removed.has(edge.target))}))
  }
  const edgeChanges=(changes:EdgeChange[])=>{
    if(!enabled)return;const removed=new Set(changes.filter(change=>change.type==="remove").map(change=>change.id))
    if(removed.size)onGraph(current=>({...current,edges:current.edges.filter(edge=>!removed.has(edge.id))}))
  }
  return <div aria-label="PG Workflow 可视化画布" className="h-[460px] min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 sm:h-[540px]">
    <ReactFlow<FlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={positions} onEdgesChange={edgeChanges}
      onNodeClick={(_event,node)=>onNode(node.id)} onEdgeClick={(_event,edge)=>onEdge(edge.id)} onConnect={onConnect}
      onNodeDragStart={()=>onGesture(true)} onNodeDragStop={()=>onGesture(false)} nodesDraggable={enabled} nodesConnectable={enabled} edgesReconnectable={false}
      deleteKeyCode={enabled?["Backspace","Delete"]:null} fitView fitViewOptions={{padding:0.3}} minZoom={0.15} maxZoom={1.8}
      proOptions={{hideAttribution:true}}>
      <Controls showInteractive={false}/><Background gap={18}/>
    </ReactFlow>
  </div>
}
