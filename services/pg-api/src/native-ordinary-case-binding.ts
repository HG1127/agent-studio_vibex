import {HttpError,type SqlClient} from './contracts.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {ownId} from './own-operations-contract.ts'
import {parseOrdinaryCaseRunBinding,type OrdinaryCaseRunBinding} from '../../../shared/ordinary-case-run-contract.ts'
import {monitorCanonical} from './native-monitor-source-contract.ts'
export type {OrdinaryCaseRunBinding}
const changed=():never=>{throw new HttpError(409,'ordinary_case_binding_changed')}
function checked(raw:unknown){try{return parseOrdinaryCaseRunBinding(raw)}catch{return changed()}}
export async function optionalOrdinaryCaseAgentBinding(db:SqlClient,owner:string,runId:string,enabled=false):Promise<OrdinaryCaseRunBinding|undefined>{
 ownId(owner);ownId(runId);await assertOwnedAdmissionContext(db,owner)
 if(!enabled)return undefined
 const rows=(await db.query<{value:unknown}>('SELECT agentstudio.ordinary_case_lookup($1::uuid) AS value',[runId])).rows
 if(rows.length!==1)throw new HttpError(503,'ordinary_case_binding_unconfirmed')
 if(rows[0]?.value===null)return undefined
 const binding=checked(rows[0]?.value);if(binding.owner_user_id!==owner||binding.run_id!==runId)return changed();return binding
}
export async function requireOrdinaryCaseAgentBinding(db:SqlClient,owner:string,raw:OrdinaryCaseRunBinding,specId:string,specRevision:number){
 const expected=checked(raw);ownId(specId);await assertOwnedAdmissionContext(db,owner)
 const actual=await optionalOrdinaryCaseAgentBinding(db,owner,expected.run_id,true)
 if(!actual||actual.spec_id!==specId||actual.spec_revision!==specRevision||monitorCanonical(actual)!==monitorCanonical(expected))return changed()
 return actual
}

export async function existingOrdinaryCaseAgentBinding(db:SqlClient,owner:string,runId:string){
 const rows=(await db.query<{ready:boolean}>("SELECT to_regprocedure('agentstudio.ordinary_case_lookup(uuid)') IS NOT NULL AS ready")).rows
 if(rows.length!==1)throw new HttpError(503,'ordinary_case_binding_runtime_required')
 return rows[0]?.ready===true?optionalOrdinaryCaseAgentBinding(db,owner,runId,true):undefined
}
