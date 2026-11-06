import type {NativeDirectoryHandle} from './nativeDirectoryJobs'
import type {LocalJob} from './pgNativeLocalDevice'

/** Re-read a completed receipt through the original scoped SDK. This path has
 * no record/confirm/cancel/apply port and cannot create or resume an operation. */
export async function readNativeDirectoryTerminalReceipt(
 handle:NativeDirectoryHandle,
 jobId:string,
 signal:AbortSignal,
 current:()=>boolean,
 get:(handle:NativeDirectoryHandle,signal:AbortSignal)=>Promise<LocalJob>,
):Promise<LocalJob>{
 const check=()=>{signal.throwIfAborted();if(!current())throw Error('当前身份或授权范围已变化，未采用原目录回执。')}
 check()
 const value=await get(handle,signal)
 check()
 if(value.id!==jobId||!['succeeded','failed','cancelled','expired'].includes(value.status))throw Error('原目录操作最终回执尚未核实。')
 return value
}
