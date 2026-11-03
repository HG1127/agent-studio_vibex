import {HttpError,isUuid,type SqlClient} from './contracts.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {originalRoleProfileEnabled} from './original-role-profile.ts'
import {originalRoleUiEnabled} from './original-role-ui-policy.ts'
import {workflowAgentSpec} from './workflow-v2-agent-machine.ts'
import {originalRoleHash} from './original-role-execution.mjs'
import {parseOriginalRoleExtension} from '../../../shared/original-role-execution-contract.mjs'
import {saveOriginalRoleExtensionOnClient} from './original-role-skill-policy.ts'
/** Preserve the employee's independent role/Skill intent when an EXISTING
 * approved base-only operation advances its real revision. No new grant,
 * review, activation, Skill text or run is manufactured here. The caller owns
 * the original Actor transaction; a failed carry rolls back that same write. */
export async function carryOriginalRoleRevisionOnClient(db:SqlClient,owner:string,id:string,before:number,after:number){
 if(!originalRoleProfileEnabled(db))return undefined
 if(!isUuid(id)||!Number.isSafeInteger(before)||before<1||!Number.isSafeInteger(after)||after!==before+1)throw new HttpError(409,'original_role_revision_transition_invalid')
 await assertOwnedAdmissionContext(db,owner)
 const rows=(await db.query<{extension:unknown;base_spec_sha256:string;spec:unknown;spec_sha256:string}>(
  'SELECT e.extension,e.base_spec_sha256,h.spec,h.spec_sha256 FROM agentstudio_roles.original_role_extensions e JOIN agentstudio_roles.original_role_specs h ON h.owner_user_id=e.owner_user_id AND h.spec_id=e.spec_id AND h.spec_revision=e.spec_revision WHERE e.owner_user_id=$1::uuid AND e.spec_id=$2::uuid AND e.spec_revision=$3::bigint FOR SHARE OF e,h',[owner,id,before])).rows
 if(!rows.length){const history=(await db.query('SELECT 1 FROM agentstudio_roles.original_role_extensions WHERE owner_user_id=$1::uuid AND spec_id=$2::uuid LIMIT 1',[owner,id])).rows;if(history.length)throw new HttpError(409,'original_role_revision_metadata_missing');return undefined}
 const old=rows[0];if(rows.length!==1||!old)throw new HttpError(409,'original_role_revision_metadata_missing')
 const prior=workflowAgentSpec(old.spec,originalRoleUiEnabled(db)),hash=originalRoleHash(prior)
 if(old.base_spec_sha256!==hash||old.spec_sha256!==hash)throw new HttpError(409,'original_role_base_changed')
 const extension=parseOriginalRoleExtension(old.extension,prior.tools)
 // save re-reads the actual new owned revision and revalidates every role
 // against its real selected tools before appending snapshot/sidecar/audit.
 return saveOriginalRoleExtensionOnClient(db,owner,id,after,extension)
}
