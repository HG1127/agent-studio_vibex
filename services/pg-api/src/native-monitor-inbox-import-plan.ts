// Pure preparation for a reviewed historical metadata export. No filesystem,
// SQLite, SQL execution, installer, authority grant or employee HTTP entry.
// A real import operator must verify the frozen snapshot/approved identity map
// and apply this plan atomically with exact-row replay comparison. No live PB
// reader or production import permission is supplied by this module.
import {createHash} from 'node:crypto'
import {ownId} from './own-operations-contract.ts'
type Row=Record<string,unknown>
export type NativeMonitorImportPlan={source_snapshot_sha256:string;owner_user_id:string;rows:{table:string;value:Row}[]}
const fail=():never=>{throw Error('invalid_native_monitor_metadata_export')}
function object(v:unknown,keys:readonly string[]):Row{if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)return fail();for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))return fail()}return v as Row}
const legacy=(v:unknown):string=>{if(typeof v!=='string'||!/^[A-Za-z0-9]{20}$/.test(v))return fail();return v}
const integer=(v:unknown,min=1):number=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||Object.is(v,-0))return fail();return v}
const hash=(v:unknown):string=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))return fail();return v}
function list(v:unknown):unknown[]{if(!Array.isArray(v)||v.length>10000||Reflect.ownKeys(v).length!==v.length+1)return fail();for(let i=0;i<v.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))??{},'value'))return fail();return v}
function uuid(kind:string,owner:string,source:string):string{const h=createHash('sha256').update('agentstudio.monitor073|'+kind+'|'+owner+'|'+source).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-8'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32)}
export function prepareNativeMonitorMetadata(raw:unknown):NativeMonitorImportPlan{
 const v=object(raw,['format','source_snapshot_sha256','owner_user_id','exported_ms','cases','monitors','checks','events'])
 if(v.format!=='legacy_monitor_metadata_export_v1')return fail()
 const snapshot=hash(v.source_snapshot_sha256),owner=ownId(v.owner_user_id),stamp=integer(v.exported_ms),batch=uuid('batch',owner,snapshot),rows:NativeMonitorImportPlan['rows']=[{table:'native_monitor_imports',value:{id:batch,owner_user_id:owner,source_snapshot_sha256:snapshot,created_ms:stamp}}]
 const cases=new Map<string,string>(),monitors=new Map<string,Row>(),checks=new Map<string,Row>(),events=new Set<string>(),dedup=new Set<string>()
 for(const rawCase of list(v.cases)){const c=object(rawCase,['id']),old=legacy(c.id);if(cases.has(old))return fail();const id=uuid('case',owner,old);cases.set(old,id);rows.push({table:'native_monitor_cases',value:{id,owner_user_id:owner,import_id:batch}})}
 for(const rawMonitor of list(v.monitors)){
  const m=object(rawMonitor,['id','case_id','revision','enabled','current_check_id','created_ms']),old=legacy(m.id),caseId=cases.get(legacy(m.case_id));if(!caseId||monitors.has(old)||typeof m.enabled!=='boolean')return fail()
  const value={id:uuid('monitor',owner,old),owner_user_id:owner,case_id:caseId,revision:integer(m.revision),enabled:m.enabled,current_check_id:m.current_check_id===null?null:uuid('check',owner,legacy(m.current_check_id)),created_ms:integer(m.created_ms)}
  if(value.created_ms>stamp)return fail();monitors.set(old,value);rows.push({table:'native_monitor_monitors',value})
 }
 for(const rawCheck of list(v.checks)){
  const c=object(rawCheck,['id','monitor_id','case_id','monitor_revision','status','created_ms']),old=legacy(c.id),monitor=monitors.get(legacy(c.monitor_id)),caseId=cases.get(legacy(c.case_id))
  if(!monitor||!caseId||monitor.case_id!==caseId||checks.has(old)||!['collecting','freezing','analyzing','needs_review','incomplete','complete','cancelled'].includes(c.status as string))return fail()
  const value={id:uuid('check',owner,old),owner_user_id:owner,monitor_id:monitor.id,case_id:caseId,monitor_revision:integer(c.monitor_revision),status:c.status,created_ms:integer(c.created_ms)}
  if(value.created_ms>stamp||value.monitor_revision>Number(monitor.revision))return fail();checks.set(old,value);rows.push({table:'native_monitor_checks',value})
 }
 for(const monitor of monitors.values())if(monitor.current_check_id!==null&&![...checks.values()].some(c=>c.id===monitor.current_check_id&&c.monitor_id===monitor.id))return fail()
 for(const rawEvent of list(v.events)){
  const e=object(rawEvent,['id','monitor_id','check_id','dedup_hash','kind','notify','read_ms','created_ms']),old=legacy(e.id),monitor=monitors.get(legacy(e.monitor_id)),check=checks.get(legacy(e.check_id)),digest=hash(e.dedup_hash)
  if(!monitor||!check||check.monitor_id!==monitor.id||events.has(old)||dedup.has(String(monitor.id)+':'+digest)||typeof e.notify!=='boolean'||!['additional_role','role_started','role_ended','conflict','source_invalidated','fact_corrected'].includes(e.kind as string))return fail()
  const read=integer(e.read_ms,0),created=integer(e.created_ms);if(created>stamp||read>stamp||read!==0&&read<created)return fail()
  events.add(old);dedup.add(String(monitor.id)+':'+digest);rows.push({table:'native_monitor_events',value:{id:uuid('event',owner,old),owner_user_id:owner,monitor_id:monitor.id,check_id:check.id,dedup_hash:digest,kind:e.kind,notify:e.notify,read_ms:read,created_ms:created}})
 }
 return{source_snapshot_sha256:snapshot,owner_user_id:owner,rows}
}
