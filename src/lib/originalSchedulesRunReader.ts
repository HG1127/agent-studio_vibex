import {OriginalSchedulesError,parseOriginalScheduleHistoryRow,scheduleId,type OriginalScheduleHistoryRow} from '../../shared/original-schedules-contract.ts'
import {createOriginalRunDetailTransport} from './originalRunDetailTransport.ts'
import {createOriginalRunDetailSession} from './originalRunDetailSession.ts'
import {createPgNativePilotApi} from './pgNativePilotApi.ts'
/** Actual original detail projection. Transport is strictly GET-only here. */
export function createOriginalSchedulesRunReader(o:{employeeId:string;verifyEmployee():Promise<string>;transport?:typeof fetch;budgetMs?:number}){
 const employee=scheduleId(o.employeeId),budget=o.budgetMs??30000;if(!Number.isSafeInteger(budget)||budget<1||budget>30000)throw new OriginalSchedulesError(400,'invalid_original_schedule_run_budget')
 return async(raw:OriginalScheduleHistoryRow,signal:AbortSignal)=>{const row=parseOriginalScheduleHistoryRow(raw,employee);if(!row.run_id)throw new OriginalSchedulesError(400,'original_schedule_run_unavailable')
  const transport=createOriginalRunDetailTransport({employeeId:employee,verifyEmployee:o.verifyEmployee,transport:o.transport}),readOnly:typeof fetch=(url,init)=>{if((init?.method??'GET')!=='GET')throw new OriginalSchedulesError(405,'original_schedule_run_read_only');return transport.transport(url,init)},session=createOriginalRunDetailSession({employee,api:createPgNativePilotApi(readOnly),verifyEmployee:o.verifyEmployee}),cancel=()=>{session.dispose();transport.close()};let timer:ReturnType<typeof setTimeout>|undefined,rejectAbort:(error:Error)=>void=()=>{}
  const failure=()=>new OriginalSchedulesError(503,'original_schedule_run_unconfirmed'),abort=()=>{cancel();rejectAbort(failure())},aborted=new Promise<never>((_,reject)=>{rejectAbort=reject});signal.addEventListener('abort',abort,{once:true})
  const perform=async()=>{if(signal.aborted)throw failure();await session.select({id:row.run_id!,kind:row.run_kind});const run=session.snapshot().run;if(signal.aborted||!run?.native||run.id!==row.run_id||run.native.ownerId!==employee||row.run_kind!==null&&run.native.kind!==row.run_kind)throw failure();if(await o.verifyEmployee()!==employee)throw failure();return structuredClone(run)}
  try{return await Promise.race([perform(),aborted,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{cancel();reject(failure())},budget)})])}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);cancel()}
 }
}
