// Only a trusted private adapter may attest a deterministic pre-call failure.
// Transport/provider uncertainty must never be converted into this class.
export const workflowKnownEffectCodes=["workflow_tool_input_invalid","workflow_calculation_invalid",
  "workflow_tool_connection_disabled","workflow_tool_model_binding_missing","workflow_tool_adapter_unavailable"] as const
export type WorkflowKnownEffectCode=typeof workflowKnownEffectCodes[number]
export class WorkflowKnownEffectFailure extends Error{
  readonly code:WorkflowKnownEffectCode
  constructor(code:WorkflowKnownEffectCode){
    if(!workflowKnownEffectCodes.includes(code))throw Error("invalid_known_effect_failure")
    super(code);this.code=code
  }
}
