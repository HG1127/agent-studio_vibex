import {HttpError,type SqlClient,type SqlPool} from './contracts.ts'
import {ownId} from './own-operations-contract.ts'
import {applyKnowledgeScope} from './knowledge-scope-policy.ts'
import {NativeMonitorBusinessData} from './native-monitor-business-data.ts'
import {NativeMonitorDefinitionAuthority} from './native-monitor-definition-authority.ts'
import {NativeMonitorLiveFreezer} from './native-monitor-live-freeze.ts'
import {NativeMonitorLiveAnalysis} from './native-monitor-live-analysis.ts'
import {monitorCanonical} from './native-monitor-source-contract.ts'
type Lease={check_id:string;owner_user_id:string;case_id:string;run_id:string;lease_token:string;lease_version:number}
export type MonitorWorkerTick={status:'disabled'|'closed'|'idle'|'uncertain'|'waiting_collector'|'freezing'|'analyzing'|'needs_review'|'incomplete'|'complete'|'stale';check_id?:string}
function lease(raw:unknown):Lease{
 monitorCanonical(raw)
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('invalid_monitor_worker_claim')
 const v=raw as Record<string,unknown>
 if(!Number.isSafeInteger(v.lease_version)||Number(v.lease_version)<1)throw Error('invalid_monitor_worker_claim')
 return Object.freeze({check_id:ownId(v.check_id),owner_user_id:ownId(v.owner_user_id),case_id:ownId(v.case_id),run_id:ownId(v.run_id),lease_token:ownId(v.lease_token),lease_version:Number(v.lease_version)})
}
// Explicit single-step service. Construction/installation starts no interval,
// Worker, provider, scheduler or network. Root host calls tick only after its
// disposable/production execution admission is separately approved.
export class NativeMonitorWorker{
 readonly pool:SqlPool
 readonly workerId:string
 private readonly approved:boolean
 private current:Lease|null=null
 private closed=false
 private uncertain=false
 constructor(pool:SqlPool,workerId:string,options:{executionApproved?:boolean}={}){
  if(!pool||!/^[A-Za-z0-9_-]{1,120}$/.test(workerId))throw Error('invalid_monitor_worker_options')
  this.pool=pool;this.workerId=workerId;this.approved=options.executionApproved===true
 }
 closeNewClaims(){this.closed=true}
 claimAdmissionSnapshot(){return Object.freeze({closed:this.closed,uncertain:this.uncertain,held:this.current!==null,coverage:'local_monitor_coordinator_only'})}
 private async transaction<T>(work:(db:SqlClient)=>Promise<T>):Promise<T>{
  const db=await this.pool.connect();let begun=false,committing=false,discard=false
  try{
   await db.query('BEGIN');begun=true;await applyKnowledgeScope(db,this.pool)
   await db.query('SET LOCAL ROLE agentstudio_monitor_worker');await db.query('SET LOCAL search_path=pg_catalog')
   const role=(await db.query<{ok:boolean}>("SELECT current_user='agentstudio_monitor_worker' AND pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') AND NOT pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') AND NOT (SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=session_user) AS ok")).rows
   if(role.length!==1||role[0]?.ok!==true)throw new HttpError(403,'monitor_worker_identity_required')
   const value=await work(db)
   committing=true;await db.query('COMMIT');begun=false;return value
  }catch(error){
   if(committing){this.uncertain=true;discard=true;throw new HttpError(503,'monitor_worker_commit_unconfirmed')}
   throw error
  }finally{
   if(begun)try{await db.query('ROLLBACK')}catch{this.uncertain=true;discard=true}
   if(discard)Reflect.apply(db.release,db,[true]);else db.release()
  }
 }
 async tick():Promise<MonitorWorkerTick>{
  if(!this.approved)return{status:'disabled'}
  if(this.uncertain)return{status:'uncertain'}
  if(!this.current){
   if(this.closed)return{status:'closed'}
   const claimed=await this.transaction(async db=>{
    await db.query('SELECT agentstudio.monitor_live_expire_checks()')
    const rows=(await db.query<{value:unknown}>('SELECT agentstudio.monitor_live_claim($1::text,$2::bigint) AS value',[this.workerId,30000])).rows
    if(rows.length!==1)throw Error('monitor_claim_unconfirmed')
    return rows[0]?.value===null?null:lease(rows[0]?.value)
   })
   if(!claimed)return{status:'idle'}
   this.current=claimed
  }
  const active=this.current
  try{
   const tick=await this.transaction(async db=>{
    const renewed=(await db.query<{value:unknown}>('SELECT agentstudio.monitor_live_renew($1::uuid,$2::uuid,$3::bigint,$4::bigint) AS value',[active.check_id,active.lease_token,active.lease_version,30000])).rows
    if(renewed.length!==1||renewed[0]?.value!==true)throw new HttpError(409,'monitor_worker_lease_changed')
    await db.query('SET LOCAL ROLE agentstudio_api')
    await db.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[active.owner_user_id])
    const rows=(await db.query<{status:string;run_status:string}>('SELECT c.status,r.status AS run_status FROM agentstudio.monitor_live_checks c JOIN agentstudio.runs r ON r.id=c.run_id AND r.owner_user_id=c.owner_user_id WHERE c.id=$1::uuid AND c.owner_user_id=$2::uuid AND c.case_id=$3::uuid AND c.run_id=$4::uuid',[active.check_id,active.owner_user_id,active.case_id,active.run_id])).rows
    if(rows.length!==1)throw new HttpError(409,'monitor_worker_lease_changed')
    const state=rows[0]!,data=new NativeMonitorBusinessData(async()=>{throw Error('coordinator_cannot_write_business_records')}),authority=new NativeMonitorDefinitionAuthority(data),gate=authority.assertCurrent.bind(authority)
    if(state.status==='collecting'){
     if(['failed','cancelled','paused'].includes(state.run_status)){
      const changed=(await db.query<{value:string}>('SELECT agentstudio.monitor_live_check_state($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::text,$7::jsonb) AS value',[active.check_id,active.lease_token,active.lease_version,'collecting','incomplete','monitor_collector_not_succeeded',JSON.stringify({collection_complete:false,baseline_advanced:false})])).rows
      if(changed.length!==1||changed[0]?.value!==active.check_id)throw Error('monitor_state_unconfirmed')
      return{status:'incomplete',check_id:active.check_id} as const
     }
     if(state.run_status!=='succeeded')return{status:'waiting_collector',check_id:active.check_id} as const
     const out=await new NativeMonitorLiveFreezer(data,gate).step(db,active.owner_user_id,{check_id:active.check_id,lease_token:active.lease_token,lease_version:active.lease_version})
     return{status:out.status,check_id:active.check_id}
    }
    if(state.status==='freezing'){const out=await new NativeMonitorLiveFreezer(data,gate).step(db,active.owner_user_id,{check_id:active.check_id,lease_token:active.lease_token,lease_version:active.lease_version});return{status:out.status,check_id:active.check_id}}
    if(state.status==='analyzing'){
     const out=await new NativeMonitorLiveAnalysis(data,gate,active).analyze(db,active.owner_user_id,active.check_id)
     if(!['needs_review','complete','incomplete'].includes(out.status))throw Error('monitor_analysis_state_unconfirmed')
     return{status:out.status as 'needs_review'|'complete'|'incomplete',check_id:active.check_id}
    }
    return{status:'stale',check_id:active.check_id} as const
   })
   if(['needs_review','complete','incomplete','stale'].includes(tick.status))this.current=null
   return tick
  }catch(error){if(!this.uncertain)this.current=null;throw error}
 }
}
