import {HttpError,type SqlClient} from "./contracts.ts"
import {checkedWorkflowV2StoredState,verifyWorkflowV2Snapshot,workflowV2RunColumns,type WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
import {agentHumanEvidenceExpected} from "./agent-human-input-policy.ts"
import {agentMemoryContextExpected} from "./agent-memory-context-policy.ts"
export async function currentKnowledgeObservations(db:SqlClient,run:string,currentStep=""):Promise<boolean>{
  const state=(await db.query<{installed:boolean;human_installed?:boolean}>("SELECT to_regprocedure('agentstudio.knowledge_query_execution_validate_run(uuid,text)') IS NOT NULL AS installed,"+
    "to_regclass('agentstudio.agent_human_input_responses') IS NOT NULL AS human_installed")).rows[0]
  if(state?.installed!==true)return state?.human_installed!==true
  if((await db.query<{ok:boolean}>("SELECT agentstudio.knowledge_query_execution_validate_run($1::uuid,$2::text) AS ok",[run,currentStep])).rows[0]?.ok!==true)return false
  if(state.human_installed!==true)return true
  // SQL validates immutable transitive provenance first. Repeat human receipt
  // checks for each original run, including input-only historical reuse.
  const seen=new Set<string>();let selected=run
  try{
    for(let depth=0;depth<8;depth++){
      if(seen.has(selected))return false;seen.add(selected)
      const row=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs WHERE id=$1::uuid FOR SHARE",[selected])).rows[0]
      if(!row)return false
      if(!["workflow_native_v2","agent_native_v2"].includes(row.checkpoint?.execution_mode))return true
      const checkpoint=checkedWorkflowV2StoredState(row.checkpoint,row.instruction)
      if(await agentHumanEvidenceExpected(db,row,checkpoint)||row.kind==="agent"&&await agentMemoryContextExpected(db,row.owner_user_id,row.id,checkpoint.memory_context))await verifyWorkflowV2Snapshot(db,row.owner_user_id,row,checkpoint)
      const origin=checkpoint.node_debug?.samples.provenance
      if(origin?.kind!=="history")return true
      selected=origin.run_id
    }
    return false
  }catch(error){if(error instanceof HttpError&&[400,404,409].includes(error.status))return false;throw error}
}
