import {qualityId,qualityHash,qualityFail,parseOriginalQualityChecks,parseOriginalQualityRevision,parseOriginalQualityPending,parseOriginalQualityReceipt,parseOriginalQualityWrite,qualityChecksCanonical,qualityWriteCanonical,qualityPendingFor,type OriginalQualityRevision,type OriginalQualityPending,type OriginalQualityWrite} from '../../shared/original-agent-quality-contract.ts'
export type OriginalQualityApiPort={read:(spec:string,signal:AbortSignal)=>Promise<unknown>;save:(spec:string,write:OriginalQualityWrite,signal:AbortSignal)=>Promise<unknown>;receipt:(spec:string,request:string,signal:AbortSignal,pending:OriginalQualityPending)=>Promise<unknown>;writeFailure?:(cause:unknown,pending:OriginalQualityPending)=>'refused'|'not_dispatched'|null}
/** The API port must use Root's server-verified Native session. No PB fallback.
 * Only metadata is persisted; private rules stay in this controller's memory.
 * Unknown requests survive disposal and are recovered by GET exact receipt. */
export function createOriginalAgentQualitySession(options:{employeeId:string;specId:string;scope:()=>{key:string;epoch:number;employeeId:string;ready:boolean};api:OriginalQualityApiPort;hash:(text:string)=>Promise<string>;requestId:()=>string;readPending:()=>unknown|null;writePending:(value:OriginalQualityPending|null)=>void}){
 const employee=qualityId(options.employeeId),spec=qualityId(options.specId),initial={...options.scope()},requests=new Set<AbortController>(),listeners=new Set<()=>void>()
 let closed=false,admitting=false,row:OriginalQualityRevision|null=null,pending:OriginalQualityPending|null=null,error='',state:'unloaded'|'ready'|'unknown'|'pending_invalid'='unloaded'
 const current=()=>{const s=options.scope();return !closed&&initial.ready&&Number.isSafeInteger(initial.epoch)&&s.ready&&initial.key===s.key&&initial.epoch===s.epoch&&s.employeeId===employee&&initial.employeeId===employee}
 const publish=()=>{if(!closed)listeners.forEach(fn=>fn())}
 const assert=()=>{if(!current())return qualityFail(503,'original_quality_scope_changed')}
 const request=async<T>(work:(signal:AbortSignal)=>Promise<T>)=>{assert();const c=new AbortController();requests.add(c);try{const value=await work(c.signal);assert();if(c.signal.aborted)return qualityFail(503,'original_quality_scope_changed');return value}finally{requests.delete(c)}}
 const checkRow=async(raw:unknown)=>{const value=parseOriginalQualityRevision(raw,employee,spec);if(value.state==='configured'&&qualityHash(await options.hash(qualityChecksCanonical(value.checks)))!==value.checks_sha256)return qualityFail();assert();return value}
 const checkReceipt=async(raw:unknown,p:OriginalQualityPending,checks?:unknown)=>{const value=parseOriginalQualityReceipt(raw,p);if(qualityHash(await options.hash(qualityChecksCanonical(value.after.checks)))!==value.after.checks_sha256||checks!==undefined&&qualityChecksCanonical(checks)!==qualityChecksCanonical(value.after.checks))return qualityFail();assert();return value}
 const retain=(value:OriginalQualityPending|null)=>{assert();options.writePending(value);pending=value}
 return{
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  snapshot(){return current()?{state,row,pending,error,busy:admitting}:{state:'unloaded' as const,row:null,pending:null,error:'',busy:false}},
  async activate(){
   assert();let stored:unknown
   try{stored=options.readPending();pending=stored===null?null:parseOriginalQualityPending(stored,employee,spec)}catch{state='pending_invalid';error='原保存标记无效；未清除原记录，也未发起保存。';publish();return}
   state=pending?'unknown':'unloaded';publish()
   try{row=await checkRow(await request(signal=>options.api.read(spec,signal)));state=pending?'unknown':'ready';error=''}catch{if(current()){row=null;error='当前员工方案和完整验收条件尚未核实。'}}finally{publish()}
  },
  async save(checks:unknown):Promise<boolean>{
   // Admission is synchronous and precedes async hashing or transport work.
   if(!current()||admitting||pending||state!=='ready'||!row)return false
   admitting=true;publish();const before=row;let dispatched=false,intent:OriginalQualityPending|null=null
   try{
    const rules=parseOriginalQualityChecks(checks),write=parseOriginalQualityWrite({request_id:options.requestId(),expected_spec_revision:before.spec_revision,expected_source_sha256:before.source_sha256,expected_checks_sha256:before.checks_sha256,checks:rules})
    const fingerprint=qualityHash(await options.hash(qualityWriteCanonical(employee,spec,write)));assert()
    if(row!==before||pending)return false
    intent=qualityPendingFor(employee,spec,write,fingerprint);retain(intent);state='unknown';publish();dispatched=true
    const receipt=await checkReceipt(await request(signal=>options.api.save(spec,write,signal)),intent,rules)
    retain(null);row=receipt.after;state='ready';error='';return true
   }catch(cause){if(current()){if(dispatched&&intent&&options.api.writeFailure?.(cause,intent)){retain(null);row=null;state='unloaded';try{row=await checkRow(await request(signal=>options.api.read(spec,signal)));state='ready'}catch{}error='本次保存已被服务器明确拒绝或尚未发出；已核对当前版本，请检查完整条件后重新保存。'}else if(dispatched){state='unknown';error='保存结果尚未确认；保留原请求标记，只查询精确回执，不重新保存。'}else error='完整规则或当前方案未通过保存检查，未发起保存。'}return false}finally{admitting=false;publish()}
  },
  async confirm():Promise<boolean>{
   if(!current()||admitting||!pending||state==='pending_invalid')return false
   admitting=true;publish();const intent=pending
   try{
    await checkReceipt(await request(signal=>options.api.receipt(spec,intent.request_id,signal,intent)),intent)
    if(pending!==intent)return false
    retain(null);row=null;state='unloaded';error='原请求已有精确回执，正在读取当前方案版本。'
    try{row=await checkRow(await request(signal=>options.api.read(spec,signal)));state='ready';error=''}catch{if(current())error='原请求已确认；当前方案版本尚未核实，暂停继续保存。'}
    return true
   }catch{if(current()){state='unknown';error='尚未取得匹配本人、方案和指纹的原回执；不会用当前相同文本推断成功，也不会重发。'}return false}finally{admitting=false;publish()}
  },
  dispose(){closed=true;for(const c of requests)c.abort();requests.clear();row=null;pending=null;error='';listeners.forEach(fn=>fn());listeners.clear()},
 }
}
