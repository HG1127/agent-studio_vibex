import {HttpError,isUuid,type SqlClient} from './contracts.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
/** The caller holds the existing fenced occurrence transaction. Read its
 * permitted metadata as the verified API owner, then invoke the unchanged
 * worker-only readiness RPC; neither role receives a new table privilege. */
export async function requireMonitorScheduleLaunchReady(db:SqlClient,owner:string,occurrenceId:string):Promise<void>{
 if(!isUuid(owner)||!isUuid(occurrenceId))throw new HttpError(400,'invalid_schedule_claim')
 await assertOwnedAdmissionContext(db,owner)
 const rows=(await db.query<{schedule_id:string}>('SELECT schedule_id FROM agentstudio.schedule_occurrences WHERE id=$1::uuid AND owner_user_id=$2::uuid',[occurrenceId,owner])).rows
 if(rows.length!==1||!isUuid(rows[0]?.schedule_id))throw new HttpError(409,'schedule_monitor_occurrence_unavailable')
 await db.query('SET LOCAL ROLE agentstudio_worker')
 const ready=(await db.query<{ready:boolean}>('SELECT agentstudio.monitor_live_schedule_ready($1::uuid) AS ready',[rows[0]!.schedule_id])).rows
 // false is the existing ordinary-schedule/no-monitor case. A missing or
 // malformed RPC reply never becomes a successful readiness check.
 if(ready.length!==1||typeof ready[0]?.ready!=='boolean')throw new HttpError(503,'schedule_monitor_readiness_unconfirmed')
 await db.query('SET LOCAL ROLE agentstudio_api')
 // A failed query leaves the enclosing transaction to its existing rollback;
 // it never continues admission,registers origin or retries here.
}
