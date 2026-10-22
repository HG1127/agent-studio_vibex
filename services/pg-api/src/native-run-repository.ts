// Shared Native server/test composition. Submission does not execute a model.
import type {SqlPool} from "./contracts.ts"
import type {NativePg18UatCapabilities} from "./native-config-uat-policy.ts"
import {RunRepository} from "./run-repository.ts"
export function createNativeRunRepository(
  pool:SqlPool,policy:Partial<NativePg18UatCapabilities>={},
):RunRepository{
  const allowBoundModelRuns=policy.configurationWrites===true&&
    policy.runApprovalUat===true&&policy.boundModelExecutionUat===true
  return new RunRepository(pool,{allowBoundModelRuns})
}
