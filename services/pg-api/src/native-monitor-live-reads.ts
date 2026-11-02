import {HttpError,type SqlClient} from './contracts.ts'
import {ownId,ownDatabaseCount,ownStamp,ownPublicStamp} from './own-operations-contract.ts'
import {NativeMonitorAuthor} from './native-monitor-author.ts'
import {NativeMonitorLiveAnalysis} from './native-monitor-live-analysis.ts'
import {parseMonitorQuery,type MonitorQuery} from './native-monitor-inbox-contract.ts'
import {nativeMonitorInboxSql} from './native-monitor-inbox-repository.ts'
import {monitorCanonical} from './native-monitor-source-contract.ts'
export type MonitorHistoryQuery={limit:20;cursor:{after_ms:number;after_id:string}|null}
const titles:Record<string,string>={needs_review:'待员工复核',incomplete:'检查未完成',configuration_required:'配置需重新核对',source_unavailable:'监测来源不可用',additional_role:'新增角色',role_started:'新增任职',role_ended:'有明确结束依据',conflict:'关系事实冲突',source_invalidated:'事实依据已失效',fact_corrected:'已复核事实更正'}
export const monitorLiveInboxSql=[
"WITH candidates AS (",
" SELECT 'check:'||c.id::text AS item_id,m.id AS monitor_id,m.case_id,c.id AS check_id,c.created_ms",
" FROM agentstudio.monitor_live_monitors m JOIN agentstudio.monitor_live_checks c ON c.id=m.current_check_id AND c.monitor_id=m.id AND c.owner_user_id=m.owner_user_id AND c.case_id=m.case_id",
" WHERE m.owner_user_id=$1::uuid AND m.enabled AND m.revision=c.monitor_revision AND c.status IN('needs_review','incomplete')",
" UNION ALL",
" SELECT 'event:'||e.id::text,e.monitor_id,m.case_id,e.check_id,e.created_ms",
" FROM agentstudio.monitor_live_events e JOIN agentstudio.monitor_live_monitors m ON m.id=e.monitor_id AND m.owner_user_id=e.owner_user_id",
" JOIN agentstudio.monitor_live_checks c ON c.id=e.check_id AND c.monitor_id=m.id AND c.owner_user_id=e.owner_user_id AND c.case_id=m.case_id",
" WHERE e.owner_user_id=$1::uuid AND e.notify AND e.read_ms=0",
") SELECT item_id,monitor_id,case_id,check_id,created_ms::text AS created_ms FROM candidates",
" WHERE ($2::bigint IS NULL OR (created_ms,item_id COLLATE \"C\")<($2::bigint,$3::text COLLATE \"C\"))",
" ORDER BY created_ms DESC,item_id COLLATE \"C\" DESC LIMIT 11"
].join('\n')
export const monitorUnifiedInboxSql="SELECT * FROM (SELECT h.*,'history073'::text AS source FROM ("+nativeMonitorInboxSql+") h UNION ALL SELECT l.*,'live074'::text AS source FROM ("+monitorLiveInboxSql+") l) u ORDER BY created_ms::bigint DESC,item_id COLLATE \"C\" DESC LIMIT 11"
export function parseMonitorHistoryQuery(raw:unknown):MonitorHistoryQuery{
 monitorCanonical(raw)
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='cursor,limit')throw new HttpError(400,'invalid_monitor_history_query')
 const v=raw as MonitorHistoryQuery
 if(v.limit!==20)throw new HttpError(400,'invalid_monitor_history_query')
 if(v.cursor!==null){const c=v.cursor;if(!c||Object.keys(c).sort().join(',')!=='after_id,after_ms'||!Number.isSafeInteger(c.after_ms)||c.after_ms<1)throw new HttpError(400,'invalid_monitor_history_query');ownId(c.after_id)}
 return v
}
export class NativeMonitorLiveReads{
 readonly author:NativeMonitorAuthor
 readonly analysis:NativeMonitorLiveAnalysis
 constructor(author:NativeMonitorAuthor,analysis:NativeMonitorLiveAnalysis){this.author=author;this.analysis=analysis}
 async event(db:SqlClient,owner:string,monitorId:string,id:string){
  ownId(monitorId);ownId(id)
  const rows=(await db.query<{id:string;check_id:string;kind:string;payload:Record<string,unknown>;read_ms:string;created_ms:string}>('SELECT id,check_id,kind,payload,read_ms::text AS read_ms,created_ms::text AS created_ms FROM agentstudio.monitor_live_events WHERE id=$1::uuid AND monitor_id=$2::uuid AND owner_user_id=$3::uuid',[id,monitorId,owner])).rows
  if(rows.length!==1)throw new HttpError(404,'monitor_event_not_found')
  const event=rows[0]!,check=await this.analysis.readCheck(db,owner,monitorId,ownId(event.check_id))
  if(check.status==='blocked')throw new HttpError(403,'monitor_source_unavailable')
  return{event_id:id,check_id:check.check_id,revision:check.revision,kind:event.kind,read_ms:ownDatabaseCount(event.read_ms),created_ms:ownDatabaseCount(event.created_ms),payload:event.payload}
 }
 async history(db:SqlClient,owner:string,monitorId:string,kind:'checks'|'events',raw:MonitorHistoryQuery){
  ownId(monitorId);const query=parseMonitorHistoryQuery(raw);await this.author.get(db,owner,monitorId)
  if(kind!=='checks'&&kind!=='events')throw new HttpError(400,'invalid_monitor_history_query')
  const sql=kind==='checks'?'SELECT id,created_ms::text AS created_ms FROM agentstudio.monitor_live_checks WHERE monitor_id=$1::uuid AND owner_user_id=$2::uuid AND ($3::bigint IS NULL OR (created_ms,id)<($3::bigint,$4::uuid)) ORDER BY created_ms DESC,id DESC LIMIT 21':'SELECT id,created_ms::text AS created_ms FROM agentstudio.monitor_live_events WHERE monitor_id=$1::uuid AND owner_user_id=$2::uuid AND ($3::bigint IS NULL OR (created_ms,id)<($3::bigint,$4::uuid)) ORDER BY created_ms DESC,id DESC LIMIT 21'
  const rows=(await db.query<{id:string;created_ms:string}>(sql,[monitorId,owner,query.cursor?.after_ms??null,query.cursor?.after_id??null])).rows
  if(rows.length>21)throw new HttpError(503,'native_monitor_live_unavailable')
  const items=[];for(const row of rows.slice(0,20))items.push(kind==='checks'?await this.analysis.readCheck(db,owner,monitorId,ownId(row.id)):await this.event(db,owner,monitorId,ownId(row.id)))
  const last=rows[Math.min(rows.length,20)-1]
  return{items,has_more:rows.length>20,next_cursor:rows.length>20&&last?{after_ms:ownDatabaseCount(last.created_ms),after_id:ownId(last.id)}:null}
 }
 async inbox(db:SqlClient,owner:string,raw:MonitorQuery){
  const query=parseMonitorQuery(raw)
  const rows=(await db.query<{item_id:string;monitor_id:string;case_id:string;check_id:string;created_ms:string;source:string}>(monitorUnifiedInboxSql,[owner,query.cursor?.after_ms??null,query.cursor?.after_id??null])).rows
  if(rows.length>11||new Set(rows.map(r=>r.item_id)).size!==rows.length)throw new HttpError(503,'native_monitor_live_unavailable')
  const items=[]
  for(const row of rows.slice(0,10)){
   let kind='source_unavailable',title=titles.source_unavailable!
   if(row.source==='live074'){
    const check=await this.analysis.readCheck(db,owner,ownId(row.monitor_id),ownId(row.check_id)),monitor=await this.author.get(db,owner,row.monitor_id)
    if(check.status!=='blocked'&&!monitor.blocked){
     if(row.item_id.startsWith('check:'))kind=check.status==='needs_review'?'needs_review':'incomplete'
     else{const event=await this.event(db,owner,row.monitor_id,ownId(row.item_id.slice(6)));kind=event.kind}
     if(!Object.hasOwn(titles,kind))throw new HttpError(503,'native_monitor_live_unavailable')
     title=String(monitor.definition?.title??'监测')+' · '+titles[kind]
    }else if(check.status!=='blocked'){kind='configuration_required';title=titles.configuration_required!}
   }else if(row.source!=='history073')throw new HttpError(503,'native_monitor_live_unavailable')
   items.push({item_id:row.item_id,monitor_id:ownId(row.monitor_id),case_id:ownId(row.case_id),check_id:ownId(row.check_id),created_ms:ownDatabaseCount(row.created_ms),kind,title})
  }
  const now=(await db.query<{as_of:string}>("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS as_of")).rows
  if(now.length!==1)throw new HttpError(503,'native_monitor_live_unavailable')
  const last=items.at(-1)
  return{protocol:'native_original_monitor_inbox_v1',scope:'current_user',employee_id:owner,as_of:ownPublicStamp(ownStamp(now[0]?.as_of,true)),items,has_more:rows.length>10,next_cursor:rows.length>10&&last?{after_ms:last.created_ms,after_id:last.item_id}:null}
 }
}
