import {HttpError,type SqlClient,type WorkflowGraph} from "./contracts.ts"
import {knowledgeLineageInstalled} from "./knowledge-lineage-audit.ts"
import {currentKnowledgeObservations} from "./knowledge-observation-policy.ts"
import {checkedWorkflowV2StoredState,workflowV2RunColumns,workflowV2ExecutionRequest,type WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
import {workflowV2OutputProjection} from "./workflow-v2-output-projection.ts"
import {workflowPreviewDependencies,type WorkflowPreviewSamples} from "./workflow-v2-preview.ts"
const changed=():never=>{throw new HttpError(409,"workflow_sample_source_unavailable")}
export async function prepareWorkflowSampleLineage(db:SqlClient,owner:string,workflow:string,node:string,graph:WorkflowGraph,samples:WorkflowPreviewSamples):Promise<string|null|undefined>{
  const installed=await knowledgeLineageInstalled(db),origin=samples.provenance
  if(!installed){if(origin?.kind==="history")throw new HttpError(409,"workflow_sample_lineage_schema_required");return undefined}
  if(!origin)throw new HttpError(400,"workflow_sample_provenance_required")
  if(origin.kind==="manual")return null
  if(origin.workflow_id!==workflow)changed()
  // Freeze the source material until target capture commits. Status/timestamps
  // and Agent child bookkeeping do not change this canonical outer-state seal.
  const source=(await db.query<WorkflowV2RunRow&{source_sha256:string}>("SELECT "+workflowV2RunColumns+",encode(sha256(convert_to(jsonb_build_array(workflow_id,checkpoint->'graph',checkpoint->'machine',instruction)::text,'UTF8')),'hex') AS source_sha256 "+
    "FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='workflow' AND checkpoint->>'execution_mode'='workflow_native_v2' FOR SHARE",[origin.run_id,owner])).rows[0]
  if(!source||source.workflow_id!==workflow)return changed()
  const state=checkedWorkflowV2StoredState(source.checkpoint,source.instruction)
  if(!await currentKnowledgeObservations(db,source.id,workflowV2ExecutionRequest(state)?.step_key))changed()
  const projected=workflowV2OutputProjection(state.graph,state.machine,{run_id:source.id,workflow_id:workflow,workflow_revision:state.workflow_revision!,status:source.status,
    instruction:source.instruction,updated_at:source.updated_at,...(state.node_debug?{node_debug_id:state.node_debug.node_id}:{})}).latest()
  if(projected.run.output_version!==origin.output_version||projected.run.workflow_revision!==origin.workflow_revision||origin.input&&samples.input!==projected.run.instruction)changed()
  const wanted=new Map(workflowPreviewDependencies(graph,node).map(n=>[n.id,n]))
  for(const id of origin.nodes){
    const from=projected.nodes.find(n=>n.node_id===id),to=wanted.get(id)
    if(!from||!to||from.node_id===node||from.node_type!==to.type||from.node_type==="start"||from.node_status!=="done"||typeof from.output_text!=="string"||
      projected.run.node_debug_id&&projected.run.node_debug_id!==id||samples.outputs[id]!==from.output_text)changed()
  }
  return source.source_sha256
}
export async function registerWorkflowSampleLineage(db:SqlClient,run:string,seal:string|null|undefined){
  if(seal===undefined)return
  const row=(await db.query<{ok:boolean}>("SELECT agentstudio.knowledge_lineage_register($1::uuid,$2::text) AS ok",[run,seal])).rows[0]
  if(row?.ok!==true)changed()
}
