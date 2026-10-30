import {HttpError,type Identity,type SqlClient,type SqlPool} from './contracts.ts'
import {withActorClient,assertOwnedAdmissionContext} from './repository.ts'
import {ownOperationsGuardSql} from './own-operations-repository.ts'
import {ownId,ownDatabaseCount,ownStamp,ownPublicStamp} from './own-operations-contract.ts'
import {verifyNativeMonitorInboxSchema} from './native-monitor-inbox-audit.ts'
import {parseMonitorPage,parseMonitorQuery,type MonitorPage,type MonitorQuery} from './native-monitor-inbox-contract.ts'
export const nativeMonitorInboxSql=`WITH candidates AS (
 SELECT 'check:'||c.id::text AS item_id,m.id AS monitor_id,m.case_id,c.id AS check_id,c.created_ms
 FROM agentstudio.native_monitor_monitors m JOIN agentstudio.native_monitor_cases k ON k.id=m.case_id AND k.owner_user_id=m.owner_user_id
 JOIN agentstudio.native_monitor_checks c ON c.id=m.current_check_id AND c.monitor_id=m.id AND c.owner_user_id=m.owner_user_id AND c.case_id=m.case_id
 WHERE m.owner_user_id=$1::uuid AND m.enabled AND m.revision=c.monitor_revision AND c.status IN('needs_review','incomplete')
 UNION ALL
 SELECT 'event:'||e.id::text,e.monitor_id,m.case_id,e.check_id,e.created_ms
 FROM agentstudio.native_monitor_events e JOIN agentstudio.native_monitor_monitors m ON m.id=e.monitor_id AND m.owner_user_id=e.owner_user_id
 JOIN agentstudio.native_monitor_cases k ON k.id=m.case_id AND k.owner_user_id=m.owner_user_id
 JOIN agentstudio.native_monitor_checks c ON c.id=e.check_id AND c.monitor_id=m.id AND c.owner_user_id=e.owner_user_id AND c.case_id=m.case_id
 WHERE e.owner_user_id=$1::uuid AND e.notify AND e.read_ms=0
) SELECT item_id,monitor_id,case_id,check_id,created_ms::text AS created_ms
 FROM candidates WHERE ($2::bigint IS NULL OR (created_ms,item_id COLLATE "C")<($2::bigint,$3::text COLLATE "C"))
 ORDER BY created_ms DESC,item_id COLLATE "C" DESC LIMIT 11`
const unavailable=():never=>{throw new HttpError(503,'native_monitor_inbox_unavailable')}
export class NativeMonitorInboxRepository{
 readonly pool:SqlPool
 constructor(pool:SqlPool){this.pool=pool}
 private async actor<T>(identity:Identity,write:boolean,body:(db:SqlClient,owner:string)=>Promise<T>):Promise<T>{
  if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
  const db=await this.pool.connect();let begun=false,discard=false
  try{await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ');begun=true;await db.query("SET LOCAL statement_timeout='8000ms'; SET LOCAL lock_timeout='3000ms'");await db.query('SET LOCAL search_path=pg_catalog')
   const result=await withActorClient(db,this.pool,identity,async(client,owner)=>{
    await assertOwnedAdmissionContext(client,owner);await verifyNativeMonitorInboxSchema(client)
    const guard=(await client.query<{ok:boolean}>(ownOperationsGuardSql)).rows;if(guard.length!==1||guard[0]?.ok!==true)return unavailable()
    const epoch=(await client.query<{epoch:unknown}>('SELECT agentstudio.agent_memory_outcome_epoch() AS epoch')).rows
    if(epoch.length!==1)return unavailable();if(epoch[0]?.epoch===null)throw new HttpError(401,'session_required');if(ownDatabaseCount(epoch[0]?.epoch)<1)return unavailable()
    return body(client,owner)
   });await db.query('COMMIT');begun=false;return result
  }catch(error){if(begun)try{await db.query('ROLLBACK')}catch{discard=true}
   if(error instanceof HttpError)throw error
   const message=error&&typeof error==='object'&&'message'in error?error.message:null
   const codes:Record<string,[number,string]>={native_monitor_session_required:[401,'session_required'],native_monitor_employee_changed:[409,'employee_session_changed'],native_monitor_event_not_found:[404,'native_monitor_event_not_found']}
   if(typeof message==='string'&&Object.hasOwn(codes,message)){const [status,code]=codes[message]!;throw new HttpError(status,code)}return unavailable()
  }finally{if(discard)Reflect.apply(db.release,db,[true]);else db.release()}
 }
 list(identity:Identity,query:MonitorQuery):Promise<MonitorPage>{
  query=parseMonitorQuery(query)
  return this.actor(identity,false,async(db,owner)=>{
   const rows=(await db.query<Record<string,unknown>>(nativeMonitorInboxSql,[owner,query.cursor?.after_ms??null,query.cursor?.after_id??null])).rows
   if(!Array.isArray(rows)||rows.length>11)return unavailable()
   const more=rows.length>10,items=rows.slice(0,10).map(r=>{
    if(!r||Object.keys(r).sort().join(',')!=='case_id,check_id,created_ms,item_id,monitor_id')return unavailable()
    return{item_id:r.item_id,monitor_id:r.monitor_id,case_id:r.case_id,check_id:r.check_id,created_ms:ownDatabaseCount(r.created_ms),kind:'source_unavailable',title:'监测来源不可用'}
   })
   const now=(await db.query<{as_of:string}>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS as_of`)).rows
   if(now.length!==1)return unavailable();const last=items.at(-1)
   return parseMonitorPage({protocol:'native_original_monitor_inbox_v1',scope:'current_user',employee_id:owner,as_of:ownPublicStamp(ownStamp(now[0]?.as_of,true)),items,has_more:more,next_cursor:more&&last?{after_ms:last.created_ms,after_id:last.item_id}:null},query)
  })
 }
 ack(identity:Identity,eventId:string,expectedEmployee:string):Promise<{ok:true}>{
  const event=ownId(eventId),expected=ownId(expectedEmployee)
  return this.actor(identity,true,async(db,owner)=>{
   // This is only a session-switch precondition, never an identity input.
   if(owner!==expected)throw new HttpError(409,'employee_session_changed')
   const result=(await db.query<{ok:boolean}>('SELECT agentstudio.native_monitor_ack($1::uuid,$2::uuid) AS ok',[event,owner])).rows
   if(result.length!==1||result[0]?.ok!==true)return unavailable();return{ok:true}
  })
 }
}
