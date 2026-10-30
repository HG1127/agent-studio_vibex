// Reuse the original052 Native employee/epoch guard and its exact auditor.
// The API receives no users UPDATE/locking privilege and no auth-table read.
import {HttpError,type SqlClient} from './contracts.ts'
import {ownOperationsGuardSql} from './own-operations-repository.ts'
function observeResumeGuardFailure(phase:'guard_catalog'|'employee_epoch',error:unknown):void{
 try{if(phase!=='guard_catalog'&&phase!=='employee_epoch')return
  const descriptor=error&&(typeof error==='object'||typeof error==='function')?Object.getOwnPropertyDescriptor(error,'code'):undefined,code=descriptor&&'value'in descriptor?descriptor.value:undefined
  const sqlstate=typeof code==='string'&&['42501','42P01','42703','42883','23503','23505','23514','40001','40P01','55P03','57014'].includes(code)?code:null
  process.stderr.write(JSON.stringify({event:'agent_run_resume_guard_failure_observation',phase,sqlstate,observed_data_only:true})+'\n')
 }catch{/* An observation cannot replace the original failure. */}
}
export async function requireAgentRunResumeEmployee(db:SqlClient):Promise<void>{
 let phase:'guard_catalog'|'employee_epoch'='guard_catalog'
 try{
  const guard=(await db.query<{ok:boolean}>(ownOperationsGuardSql)).rows
  if(guard.length!==1||guard[0]?.ok!==true)throw new HttpError(503,'agent_run_resume_guard_unavailable')
  phase='employee_epoch'
  const rows=(await db.query<{epoch:unknown}>('SELECT agentstudio.agent_memory_outcome_epoch() AS epoch')).rows
  if(rows.length!==1)throw new HttpError(503,'agent_run_resume_guard_unavailable')
  const epoch=rows[0]?.epoch
  if(epoch===null)throw new HttpError(403,'employee_disabled')
  if(!(typeof epoch==='string'&&/^[1-9][0-9]*$/.test(epoch)||typeof epoch==='number')||!Number.isSafeInteger(Number(epoch))||Number(epoch)<1||Number(epoch)>Number.MAX_SAFE_INTEGER-2)throw new HttpError(503,'agent_run_resume_guard_unavailable')
 }catch(error){observeResumeGuardFailure(phase,error);throw error}
}
