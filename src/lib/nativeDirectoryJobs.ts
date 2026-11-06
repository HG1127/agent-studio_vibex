import {createPgNativeLocalDeviceApi,type LocalJob} from './pgNativeLocalDevice'
import {ORIGINAL_PG_UI_ENABLED} from './studioBackend'
import {createNativeDirectoryJobs,NativeDirectoryError,type NativeDirectoryHandle} from '../../shared/native-directory-jobs.mjs'
import {getLocalDeviceSessionScope,sameLocalDeviceSessionScope,subscribeLocalDeviceSessionPrivacy} from './nativeLocalEmployeeApi'
import {invalidateStudioSessionPrivacy} from './studioSessionPrivacy'
import {verifyStudioSession} from './studioAuth'
export type {NativeDirectoryHandle}
export type NativeFileJobPresentation={backend:'native_pg';id:string;status:LocalJob['status'];result:string;error:string;native:LocalJob}
const jobs=ORIGINAL_PG_UI_ENABLED?createNativeDirectoryJobs({createApi:createPgNativeLocalDeviceApi,getContext:getLocalDeviceSessionScope}):null
if(jobs)subscribeLocalDeviceSessionPrivacy(jobs.invalidate)
function requiredDirectoryJobs(){if(!jobs)throw Error('native_directory_backend_disabled');return jobs}
async function checked<T>(handle:NativeDirectoryHandle,work:()=>Promise<T>){const expected=handle.scope;try{return await work()}catch(error){if(sameLocalDeviceSessionScope(expected)&&((error instanceof NativeDirectoryError&&error.status===401)||(error instanceof Error&&'status'in error&&error.status===401))){invalidateStudioSessionPrivacy();void verifyStudioSession().catch(()=>{})}throw error}}
export const nativeDirectoryJobs={begin:(...args:Parameters<ReturnType<typeof createNativeDirectoryJobs>['begin']>)=>requiredDirectoryJobs().begin(...args),submit:(h:NativeDirectoryHandle,s?:AbortSignal)=>checked(h,()=>requiredDirectoryJobs().submit(h,s)),get:(h:NativeDirectoryHandle,s?:AbortSignal)=>checked(h,()=>requiredDirectoryJobs().get(h,s)),cancel:(h:NativeDirectoryHandle,s?:AbortSignal)=>checked(h,()=>requiredDirectoryJobs().cancel(h,s))}
/** UI-only text presentation of a genuine typed Native job, never a transport
 * envelope. The original Native record remains available and is not flattened. */
export function nativeFileJobPresentation(job:LocalJob):NativeFileJobPresentation{return {backend:'native_pg',id:job.id,status:job.status,result:job.result?.text??'',error:job.error,native:job}}
