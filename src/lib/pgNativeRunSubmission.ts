// A single employee-view lifetime. Memory only: no credentials or browser storage.
import {PgNativePilotError,type PgNativeRunSubmission} from "./pgNativePilotApi.ts"

export type RunDraft={agentId:string;instruction:string}
export type PendingRun=Readonly<RunDraft&{key:string}>
type Submitter={submitRun:(id:string,instruction:string,key:string)=>Promise<PgNativeRunSubmission>}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const rejectedStatuses=new Set([400,401,403,404,405,409,413,415,422,429])

export function createPgNativeRunSubmission(
  makeKey=()=>"pg_run_"+crypto.randomUUID().replaceAll("-",""),
){
  let pending:PendingRun|null=null
  let uncertain=false,closed=false
  let flight:Promise<PgNativeRunSubmission>|null=null
  return {
    pending:()=>pending,
    dispose(){closed=true;pending=null},
    submit(api:Submitter,draft:RunDraft):Promise<PgNativeRunSubmission>{
      if(closed)return Promise.reject(new Error("run_view_expired"))
      // Join rapid duplicate actions, never issue a second HTTP request.
      if(flight)return flight
      if(!pending){
        const instruction=draft.instruction.trim()
        if(!uuid.test(draft.agentId)||!instruction||instruction.length>1200||instruction.includes("\0"))
          return Promise.reject(new Error("invalid_run_draft"))
        pending=Object.freeze({agentId:draft.agentId,instruction,key:makeKey()})
      }
      const frozen=pending
      flight=Promise.resolve().then(()=>api.submitRun(frozen.agentId,frozen.instruction,frozen.key))
        .then(outcome=>{
          if(closed)throw new Error("run_view_expired")
          if(!outcome||typeof outcome.replayed!=="boolean"||!uuid.test(outcome.run?.id??"")||
             outcome.run.agent_spec_id!==frozen.agentId||outcome.run.instruction!==frozen.instruction)
            throw new Error("unconfirmed_run_submission")
          pending=null;uncertain=false
          return outcome
        }).catch(error=>{
          // An authoritative first-attempt rejection permits editing. After
          // ANY uncertain response, keep the original body/key even if a
          // later request is rejected; the earlier task may already exist.
          if(!closed){
            if(!uncertain&&error instanceof PgNativePilotError&&rejectedStatuses.has(error.status))
              pending=null
            else uncertain=true
          }
          throw error
        }).finally(()=>{flight=null})
      return flight
    },
  }
}
