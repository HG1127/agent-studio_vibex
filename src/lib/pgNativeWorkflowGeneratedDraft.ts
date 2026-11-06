// Reuse the actual Workflow editor for local graph edits. The first F05 save
// is an explicit preview callback, never an ordinary Workflow create/update.
import {createPgNativeWorkflowEditor} from './pgNativeWorkflowEditor.ts'
import {parseWorkflowGraphV2,type WorkflowGraph} from './pgNativeWorkflowGraph.ts'
import type {PgNativeAgent,PgNativeModelConnection,PgNativeToolConnection,PgNativeKnowledge,PgNativeMcpConnection} from './pgNativePilotApi.ts'
import type {AgentPlanWorkflowSourceValues} from '../../services/pg-api/src/agent-plan-workflow-result.ts'
export type PgWorkflowDraftResourcePolicy={builtinTools:readonly string[];requirePlanReview:boolean;lockKnowledgeRetrieval:boolean;knowledgeRetrieval?:AgentPlanWorkflowSourceValues['spec']['knowledge_retrieval'];
  mcpBindings:NonNullable<AgentPlanWorkflowSourceValues['spec']['mcp_tools']>}
export type PgWorkflowGeneratedDraftPort={key:string;name:string;graph:WorkflowGraph;disabled:boolean;confirmed?:boolean;policy:PgWorkflowDraftResourcePolicy;
  onEdited:()=>void;onPreviewSave:(fields:{name:string;graph:WorkflowGraph})=>Promise<void>}
type Editor=ReturnType<typeof createPgNativeWorkflowEditor>
export function createPgNativeWorkflowGeneratedDraftEditor(api:Parameters<typeof createPgNativeWorkflowEditor>[0],onExpired:()=>void,port:()=>PgWorkflowGeneratedDraftPort):Editor{
  const base=createPgNativeWorkflowEditor(api,onExpired),seed=port(),listeners=new Set<()=>void>()
  base.importDraft(seed.name,seed.graph,true)
  let closed=false,busy=false,error='',last=JSON.stringify([seed.name,seed.graph])
  const emit=()=>{if(!closed)listeners.forEach(fn=>fn())}
  const unsubscribe=base.subscribe(()=>{
    const draft=base.snapshot().draft,next=draft?JSON.stringify([draft.name,draft.graph]):''
    if(next!==last){last=next;error='';if(!closed)port().onEdited()}
    emit()
  })
  const editable=()=>!closed&&!busy&&!port().disabled
  return {...base,
    snapshot:()=>({...base.snapshot(),busy,notice:'',error:error||base.snapshot().error}),
    subscribe(fn){listeners.add(fn);return()=>{listeners.delete(fn)}},
    fresh(){},async open(){},importDraft(){},
    edit(name,graph){if(editable())base.edit(name,graph)},
    undo(){if(editable())base.undo()},redo(){if(editable())base.redo()},
    beginGesture(){if(editable())base.beginGesture()},endGesture(){if(editable())base.endGesture()},
    async save(){
      if(!editable())return
      const draft=base.snapshot().draft;if(!draft)return
      let graph:WorkflowGraph
      try{graph=parseWorkflowGraphV2(draft.graph);if(!draft.name.trim()||draft.name.trim().length>120)throw Error()}
      catch{error='请先修正工作流名称、节点配置和连线。';emit();return}
      busy=true;error='';emit()
      try{await port().onPreviewSave({name:draft.name.trim(),graph})}
      catch{if(!closed)error='请检查来源资源和节点配置后重新预览保存。'}
      finally{busy=false;emit()}
    },
    dispose(){if(closed)return;closed=true;unsubscribe();base.dispose();listeners.clear()},
  }
}
export function agentPlanWorkflowEditorResources(source:AgentPlanWorkflowSourceValues,inventory:{agents:PgNativeAgent[];models:PgNativeModelConnection[];tools:PgNativeToolConnection[];bases:PgNativeKnowledge[]}){
  const {spec}=source,binding=spec.model_binding
  return {
    agents:inventory.agents.filter(row=>row.id===source.source.spec_id&&row.revision===source.source.spec_revision),
    models:binding?inventory.models.filter(row=>row.id===binding.connection_id&&row.revision===binding.connection_revision).map(row=>({...row,models:row.models.filter(name=>name===binding.model_id)})):[],
    tools:inventory.tools.filter(row=>spec.http_tools?.some(ref=>ref.connection_id===row.id&&ref.connection_revision===row.revision)),
    bases:inventory.bases.filter(row=>spec.knowledge_base_ids.includes(row.id)),
    policy:{builtinTools:spec.tools.filter(tool=>['calculate','summarize','knowledge_search','web_fetch','web_search'].includes(tool)),requirePlanReview:spec.require_plan_review===true,lockKnowledgeRetrieval:true,...(spec.knowledge_retrieval?{knowledgeRetrieval:spec.knowledge_retrieval}:{}),mcpBindings:spec.mcp_tools??[]} satisfies PgWorkflowDraftResourcePolicy,
  }
}
export function scopedPgWorkflowMcpConnections(rows:PgNativeMcpConnection[],policy:PgWorkflowDraftResourcePolicy){
  return rows.filter(row=>policy.mcpBindings.some(ref=>ref.connection_id===row.id&&ref.connection_revision===row.revision&&ref.catalog_sha256===row.catalog_sha256))
    .map(row=>({...row,catalog:row.catalog?{...row.catalog,tools:row.catalog.tools.filter(tool=>policy.mcpBindings.some(ref=>ref.connection_id===row.id&&ref.connection_revision===row.revision&&ref.catalog_sha256===row.catalog_sha256&&ref.tool_name===tool.name))}:null}))
}
