import type {MonitorEvidenceAccess} from './native-monitor-business-data.ts'
import {HttpError,type Identity,type SqlClient,type SqlPool} from './contracts.ts'
import {withActorClient,assertOwnedAdmissionContext} from './repository.ts'
import {ownOperationsGuardSql} from './own-operations-repository.ts'
import {ownId} from './own-operations-contract.ts'
import {verifyMonitorLiveSchema} from './native-monitor-live-audit.ts'
import {NativeMonitorBusinessData} from './native-monitor-business-data.ts'
import {NativeMonitorDefinitionAuthority} from './native-monitor-definition-authority.ts'
import {NativeMonitorAuthor} from './native-monitor-author.ts'
import {NativeMonitorLiveAnalysis} from './native-monitor-live-analysis.ts'
import {readMonitorStoredReceipt,readMonitorReceiptFragment} from './native-monitor-source-access.ts'
import {requireMonitorEmployeeAuthority} from './native-monitor-employee-authority.ts'
import {monitorCanonical} from './native-monitor-source-contract.ts'
import {NativeMonitorLiveReads,type MonitorHistoryQuery} from './native-monitor-live-reads.ts'
import type {MonitorQuery} from './native-monitor-inbox-contract.ts'
const unavailable=():never=>{throw new HttpError(503,'native_monitor_live_unavailable')}
export class NativeMonitorLiveRepository{
 readonly pool:SqlPool
 readonly data:NativeMonitorBusinessData
 readonly authority:NativeMonitorDefinitionAuthority
 readonly author:NativeMonitorAuthor
 readonly analysis:NativeMonitorLiveAnalysis
 readonly reads:NativeMonitorLiveReads
 private readonly readReceipt:typeof readMonitorStoredReceipt
 private readonly ordinary:boolean
 private readonly extraReady?:(db:SqlClient)=>Promise<void>
 constructor(pool:SqlPool,options:{evidence?:MonitorEvidenceAccess;readReceipt?:typeof readMonitorStoredReceipt;assertReady?:(db:SqlClient)=>Promise<void>}={}){
  this.pool=pool;this.ordinary=options.evidence!==undefined;this.extraReady=options.assertReady
  this.data=new NativeMonitorBusinessData(async()=>{throw new HttpError(403,'monitor_worker_required')},undefined,options.evidence)
  this.authority=new NativeMonitorDefinitionAuthority(this.data);this.author=new NativeMonitorAuthor(this.data,this.authority)
  this.analysis=new NativeMonitorLiveAnalysis(this.data,this.authority.assertCurrent.bind(this.authority));this.reads=new NativeMonitorLiveReads(this.author,this.analysis)
  this.readReceipt=options.readReceipt??readMonitorStoredReceipt
 }
 async actor<T>(identity:Identity,expectedEmployee:string,work:(db:SqlClient,owner:string)=>Promise<T>):Promise<T>{
  if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
  const db=await this.pool.connect();let begun=false,committing=false,discard=false
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');begun=true
   await db.query("SET LOCAL statement_timeout='8000ms'; SET LOCAL lock_timeout='3000ms'");await db.query('SET LOCAL search_path=pg_catalog')
   const value=await withActorClient(db,this.pool,identity,async(client,owner)=>{
    if(ownId(expectedEmployee)!==owner)throw new HttpError(409,'employee_session_changed')
    await assertOwnedAdmissionContext(client,owner);await verifyMonitorLiveSchema(client);await this.extraReady?.(client)
    const guard=(await client.query<{ok:boolean}>(ownOperationsGuardSql)).rows;if(guard.length!==1||guard[0]?.ok!==true)return unavailable()
    await requireMonitorEmployeeAuthority(client,owner)
    return work(client,owner)
   })
   committing=true;await db.query('COMMIT');begun=false;return value
  }catch(error){
   if(committing){discard=true;throw new HttpError(503,'native_monitor_live_commit_unconfirmed')}
   if(error instanceof HttpError)throw error
   const message=error&&typeof error==='object'&&'message'in error?String(error.message):''
   const allowed=new Set(['monitor_not_found','monitor_definition_changed','monitor_control_changed','monitor_schedule_reauthorization_required','monitor_review_preview_changed','monitor_idempotency_conflict','monitor_schedule_already_bound','monitor_native_schedule_authorization_required','monitor_employee_review_required','monitor_employee_changed','monitor_check_changed','monitor_baseline_changed','monitor_live_session_required','native_monitor_event_not_found','monitor_live_event_not_found'])
   if(allowed.has(message))throw new HttpError(message.endsWith('not_found')?404:message.endsWith('session_required')?401:409,message)
   return unavailable()
  }finally{if(begun)try{await db.query('ROLLBACK')}catch{discard=true};if(discard)Reflect.apply(db.release,db,[true]);else db.release()}
 }
 caseCreate(i:Identity,e:string,raw:unknown){return this.actor(i,e,(db,o)=>this.data.caseCreate(db,o,raw))}
 caseGet(i:Identity,id:string,e:string){return this.actor(i,e,(db,o)=>this.data.caseGet(db,o,id))}
 query(i:Identity,e:string,c:string,raw:unknown){return this.actor(i,e,(db,o)=>this.data.query(db,o,c,raw))}
 recordWrite(i:Identity,e:string,c:string,raw:unknown){return this.actor(i,e,(db,o)=>this.data.write(db,o,c,raw))}
 recordReview(i:Identity,e:string,c:string,raw:unknown){return this.actor(i,e,(db,o)=>this.data.review(db,o,c,raw))}
 preview(i:Identity,e:string,c:string,raw:unknown){return this.actor(i,e,(db,o)=>this.author.preview(db,o,c,raw))}
 save(i:Identity,e:string,c:string,raw:unknown,id:string|null=null){return this.actor(i,e,(db,o)=>this.author.save(db,o,c,raw,id))}
 update(i:Identity,e:string,id:string,raw:unknown){return this.actor(i,e,async(db,o)=>{const m=await this.author.get(db,o,id);return this.author.save(db,o,m.case_id,raw,id)})}
 monitorGet(i:Identity,id:string,e:string){return this.actor(i,e,(db,o)=>this.author.get(db,o,id))}
 monitorList(i:Identity,c:string,e:string){return this.actor(i,e,(db,o)=>this.author.list(db,o,c))}
 control(i:Identity,e:string,id:string,raw:unknown){return this.actor(i,e,(db,o)=>this.author.control(db,o,id,raw))}
 reviewPreview(i:Identity,id:string,e:string){return this.actor(i,e,(db,o)=>this.analysis.reviewPreview(db,o,id))}
 review(i:Identity,e:string,id:string,raw:unknown){
  monitorCanonical(raw);if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='preview_hash,rationale')throw new HttpError(400,'invalid_monitor_review')
  return this.actor(i,e,(db,o)=>this.analysis.analyze(db,o,id,raw as {preview_hash:string;rationale:string}))
 }
 discard(i:Identity,e:string,id:string,raw:unknown){return this.actor(i,e,(db,o)=>this.analysis.discard(db,o,id,raw))}
 checkGet(i:Identity,m:string,id:string,e:string){return this.actor(i,e,(db,o)=>this.analysis.readCheck(db,o,m,id))}
 eventGet(i:Identity,m:string,id:string,e:string){return this.actor(i,e,(db,o)=>this.reads.event(db,o,m,id))}
 history(i:Identity,m:string,kind:'checks'|'events',q:MonitorHistoryQuery,e:string){return this.actor(i,e,(db,o)=>this.reads.history(db,o,m,kind,q))}
 inbox(i:Identity,q:MonitorQuery,e:string){return this.actor(i,e,(db,o)=>this.reads.inbox(db,o,q))}
 result(i:Identity,runId:string,resultId:string,q:unknown,e:string){
  ownId(runId);ownId(resultId)
  return this.actor(i,e,async(db,o)=>{
   const rows=(await db.query<{case_id:string}>('SELECT case_id FROM agentstudio.monitor_live_receipts WHERE id=$1::uuid AND run_id=$2::uuid AND owner_user_id=$3::uuid'+(this.ordinary?' UNION ALL SELECT case_id FROM agentstudio.ordinary_case_receipts WHERE id=$1::uuid AND run_id=$2::uuid AND owner_user_id=$3::uuid':''),[resultId,runId,o])).rows
   if(rows.length!==1)throw new HttpError(404,'monitor_result_not_found')
   return readMonitorReceiptFragment(await this.readReceipt(db,o,ownId(rows[0]?.case_id),runId,resultId),q)
  })
 }
 ack(i:Identity,eventId:string,e:string){
  const id=ownId(eventId)
  return this.actor(i,e,async(db,o)=>{
   const rows=(await db.query<{source:string}>("SELECT 'live074'::text AS source FROM agentstudio.monitor_live_events WHERE id=$1::uuid AND owner_user_id=$2::uuid UNION ALL SELECT 'history073' FROM agentstudio.native_monitor_events WHERE id=$1::uuid AND owner_user_id=$2::uuid",[id,o])).rows
   if(!rows.length)throw new HttpError(404,'native_monitor_event_not_found');if(rows.length!==1)return unavailable()
   // One body and one actor transaction;073 routing never consumes/replays the
   // IncomingMessage or guesses from a failed mutation.
   const sql=rows[0]?.source==='live074'?'SELECT agentstudio.monitor_live_ack($1::uuid,$2::uuid) AS ok':'SELECT agentstudio.native_monitor_ack($1::uuid,$2::uuid) AS ok'
   const saved=(await db.query<{ok:boolean}>(sql,[id,o])).rows
   if(saved.length!==1||saved[0]?.ok!==true)return unavailable()
   return{ok:true as const}
  })
 }
 schedules(i:Identity,e:string){return this.actor(i,e,async(db,o)=>({items:(await db.query<{id:string;name:string;kind:string;enabled:boolean}>("SELECT id,name,kind,enabled FROM agentstudio.schedules WHERE owner_user_id=$1::uuid AND deleted_at IS NULL AND kind='agent' AND recurrence->>'config_format'='pg_schedule_execution_v3' ORDER BY updated_at DESC,id LIMIT 100",[o])).rows.map(r=>({id:ownId(r.id),name:r.name,target_kind:r.kind,enabled:r.enabled}))}))}
}
