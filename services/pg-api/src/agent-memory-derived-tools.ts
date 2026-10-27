// Replay existing private evidence to identify attempted tools. This neither
// changes VM state/hashes nor authorizes a tool, write or model request.
import {HttpError} from "./contracts.ts"
import {inspectWorkflowAgentState,recordWorkflowAgentResult,recordWorkflowAgentHumanResponse,type WorkflowAgentState} from "./workflow-v2-agent-machine.ts"
import type {WorkflowEffectRequest} from "./workflow-v2-machine.ts"
export function agentMemoryDerivedTools(state:WorkflowAgentState,parent:WorkflowEffectRequest):string[]{
  inspectWorkflowAgentState(state,parent)
  let replay:WorkflowAgentState={...state,results:[],...(state.human_protocol?{human_responses:[]}: {})},responses=0
  const used:string[]=[]
  for(const result of state.results){
    const request=inspectWorkflowAgentState(replay,parent).pending
    replay=recordWorkflowAgentResult(replay,parent,result)
    if(request?.kind==="tool"&&result.outcome!=="rejected"){
      const name=request.configuration.tool??request.configuration.title
      if(typeof name!=="string"||!name.trim()||name.length>100||/[\u0000-\u001f\u007f,]/.test(name))throw new HttpError(409,"agent_memory_derived_source_unavailable")
      if(!used.includes(name))used.push(name)
    }
    if(inspectWorkflowAgentState(replay,parent).pending_input&&state.human_responses?.[responses]){
      replay=recordWorkflowAgentHumanResponse(replay,parent,state.human_responses[responses]!);responses++
    }
  }
  if(responses!==(state.human_responses?.length??0))throw new HttpError(409,"agent_memory_derived_source_unavailable")
  return used
}
