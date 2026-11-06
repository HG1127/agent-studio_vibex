import {originalHarnessPath,parseOriginalHarnessSnapshot,type OriginalHarnessSnapshot} from '../../shared/original-harness-contract.ts'
import {parseOwnOperationsJson} from './pgNativeOwnOperations.ts'
export function createOriginalHarnessApi(options:{employeeId:string;transport:typeof fetch}){
 return{async snapshot(signal?:AbortSignal):Promise<OriginalHarnessSnapshot>{const response=await options.transport('/__pg_native'+originalHarnessPath,{method:'GET',headers:{Accept:'application/json','X-AgentStudio-Expected-Employee':options.employeeId},signal});if(!response.ok)throw Object.assign(Error('original_harness_read_unavailable'),{status:response.status});return parseOriginalHarnessSnapshot(parseOwnOperationsJson(await response.text()),options.employeeId)}}
}
