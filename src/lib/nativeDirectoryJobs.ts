import {createPgNativeLocalDeviceApi,type LocalJob} from './pgNativeLocalDevice'
import {createNativeDirectoryJobs,NativeDirectoryError,type NativeDirectoryHandle} from '../../shared/native-directory-jobs.mjs'
import {getLocalDeviceSessionScope,sameLocalDeviceSessionScope,subscribeLocalDeviceSessionPrivacy} from './nativeLocalEmployeeApi'
import {invalidateStudioSessionPrivacy} from './studioSessionPrivacy'
import {verifyStudioSession} from './studioAuth'
export type {NativeDirectoryHandle}
export type NativeFileJobPresentation={backend:'native_pg';id:string;status:LocalJob['status'];result:string;error:string;native:LocalJob}
const jobs=createNativeDirectoryJobs({createApi:createPgNativeLocalDeviceApi,getContext:getLocalDeviceSessionScope})
subscribeLocalDeviceSessionPrivacy(jobs.invalidate)
async function checked<T>(handle:NativeDirectoryHandle,work:()=>Promise<T>){const expected=handle.scope;try{return await work()}catch(error){if(sameLocalDeviceSessionScope(expected)&&((error instanceof NativeDirectoryError&&error.status===401)||(error instanceof Error&&'status'in error&&error.status===401))){invalidateStudioSessionPrivacy();void verifyStudioSession().catch(()=>{})}throw error}}
export const nativeDirectoryJobs={begin:jobs.begin,submit:(h:NativeDirectoryHandle,s?:AbortSignal)=>checked(h,()=>jobs.submit(h,s)),get:(h:NativeDirectoryHandle,s?:AbortSignal)=>checked(h,()=>jobs.get(h,s)),cancel:(h:NativeDirectoryHandle,s?:AbortSignal)=>checked(h,()=>jobs.cancel(h,s))}
/** UI-only text presentation of a genuine typed Native job, never a transport
 * envelope. The original Native record remains available and is not flattened. */
export function nativeFileJobPresentation(job:LocalJob):NativeFileJobPresentation{return {backend:'native_pg',id:job.id,status:job.status,result:job.result?.text??'',error:job.error,native:job}}
