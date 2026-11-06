import type {SqlClient} from './contracts.ts'
import {ownDatabaseCount,ownPublicStamp,ownStamp,ownUnavailable} from './own-operations-contract.ts'
import {originalInternalCountKeys,parseOriginalInternalOverview} from '../../../shared/original-internal-overview-contract.ts'
const owned=`WITH owned_runs AS (SELECT r.id,r.kind,r.status,r.created_at,r.updated_at FROM agentstudio.runs r WHERE r.owner_user_id=$1::uuid AND r.kind IN('agent','workflow'))`
const stamp=(value:string)=>`to_char(${value} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
export const originalInternalCountsSql=owned+` SELECT
 count(*) FILTER(WHERE status='running')::text AS running,count(*) FILTER(WHERE status='awaiting_approval')::text AS awaiting_approval,
 count(*) FILTER(WHERE status='failed' AND created_at >= $2::timestamptz-interval '7 days')::text AS failed_7d,count(*) FILTER(WHERE status='paused')::text AS paused,
 (SELECT count(*)::text FROM agentstudio.schedules s WHERE s.owner_user_id=$1::uuid AND s.deleted_at IS NULL AND s.enabled) AS schedules_active,
 (SELECT count(*)::text FROM agentstudio.schedules s WHERE s.owner_user_id=$1::uuid AND s.deleted_at IS NULL AND s.enabled AND s.next_at>'epoch'::timestamptz AND s.next_at<$2::timestamptz-interval '60 seconds') AS schedules_overdue,
 (SELECT count(*)::text FROM agentstudio.knowledge_bases k WHERE k.owner_user_id=$1::uuid) AS knowledge_bases,
 (SELECT count(*)::text FROM agentstudio.external_effects e JOIN owned_runs r ON r.id=e.run_id WHERE e.owner_user_id=$1::uuid AND (e.status='unknown' OR e.status='started' AND e.updated_at<$2::timestamptz-interval '10 minutes')) AS writes_need_review FROM owned_runs`
// The current PG producers do not persist spec_name/workflow_name at run creation.
// Do not join current resource names or project a complete checkpoint/job body.
export const originalInternalRecentSql=owned+`, selected AS (SELECT *,row_number() OVER(PARTITION BY kind ORDER BY created_at DESC,id DESC) AS ordinal FROM owned_runs)
 SELECT id,kind,NULL::text AS title,'not_recorded'::text AS title_source,status,${stamp('created_at')} AS created,${stamp('updated_at')} AS updated FROM selected WHERE ordinal<=12 ORDER BY created_at DESC,id DESC LIMIT 16`
export const originalInternalActionsSql=owned+`, attention AS (
 SELECT CASE WHEN status='awaiting_approval' THEN 'approval' ELSE 'failed' END AS category,kind,id,NULL::text AS title,'not_recorded'::text AS title_source,updated_at AS observed_at,''::text AS step_key FROM owned_runs WHERE status='awaiting_approval' OR status='failed' AND created_at >= $2::timestamptz-interval '7 days'
 UNION ALL SELECT 'review',r.kind,e.run_id,'外部写操作待核验 · 步骤 '||left(e.step_key,28),'effect_step',e.updated_at,e.step_key FROM agentstudio.external_effects e JOIN owned_runs r ON r.id=e.run_id WHERE e.owner_user_id=$1::uuid AND (e.status='unknown' OR e.status='started' AND e.updated_at<$2::timestamptz-interval '10 minutes')
 UNION ALL SELECT 'overdue','schedule',s.id,coalesce(nullif(s.name,''),'未命名任务'),'schedule_name',s.next_at,'' FROM agentstudio.schedules s WHERE s.owner_user_id=$1::uuid AND s.deleted_at IS NULL AND s.enabled AND s.next_at>'epoch'::timestamptz AND s.next_at<$2::timestamptz-interval '60 seconds'
 ), selected AS (SELECT *,row_number() OVER(PARTITION BY category,CASE WHEN category IN('approval','failed') THEN kind ELSE '' END ORDER BY CASE WHEN category='overdue' THEN observed_at END ASC,CASE WHEN category<>'overdue' THEN observed_at END DESC,id DESC,step_key COLLATE "C" DESC) AS ordinal FROM attention)
 SELECT category,kind,id,left(title,110) AS title,title_source,${stamp('observed_at')} AS timestamp FROM selected WHERE ordinal<=CASE WHEN category IN('approval','failed') THEN 8 ELSE 10 END ORDER BY CASE category WHEN 'approval' THEN 0 WHEN 'review' THEN 1 WHEN 'overdue' THEN 2 ELSE 3 END,observed_at DESC,id DESC,step_key COLLATE "C" DESC LIMIT 32`
function exact(raw:unknown,keys:readonly string[]):Record<string,unknown>{if(!raw||typeof raw!=='object'||Object.getPrototypeOf(raw)!==Object.prototype||Reflect.ownKeys(raw).length!==keys.length)return ownUnavailable();const ds=Object.getOwnPropertyDescriptors(raw);if(keys.some(k=>!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')))return ownUnavailable();return Object.fromEntries(keys.map(k=>[k,ds[k]!.value]))}
function boundedTitle(raw:unknown):unknown{if(raw===null)return null;if(typeof raw!=='string'||raw.length>220)return ownUnavailable();const cut=raw.slice(0,110);return /[\ud800-\udbff]$/.test(cut)?cut.slice(0,-1):cut}
/** Only called inside the original OwnOperationsRepository actor transaction. */
export async function readOriginalInternalOverview(db:SqlClient,owner:string,now:string){
 const rows=(await db.query(originalInternalCountsSql,[owner,now])).rows;if(rows.length!==1)return ownUnavailable()
 const raw=exact(rows[0],originalInternalCountKeys),counters=Object.fromEntries(originalInternalCountKeys.map(k=>[k,ownDatabaseCount(raw[k])]))
 const recent=(await db.query(originalInternalRecentSql,[owner])).rows;if(recent.length>16)return ownUnavailable()
 const actions=(await db.query(originalInternalActionsSql,[owner,now])).rows;if(actions.length>32)return ownUnavailable()
 return parseOriginalInternalOverview({protocol:'native_original_internal_overview_v1',scope:'current_user',employee_id:owner,as_of:ownPublicStamp(ownStamp(now,true)),counters,
  recent_runs:recent.map(r=>exact(r,['id','kind','title','title_source','status','created','updated'])),action_items:actions.map(r=>{const v=exact(r,['category','kind','id','title','title_source','timestamp']);return{...v,title:boundedTitle(v.title)}}),
  worker:{availability:'unavailable',reason:'legacy_main_worker_not_equivalent'},sampling:{recent_limit_per_kind:12,action_limit:32,failed_window_days:7},unavailable:['historical_run_titles','legacy_main_worker_health']},owner)
}
