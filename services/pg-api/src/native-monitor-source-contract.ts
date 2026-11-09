import {createHash} from 'node:crypto'
import {HttpError} from './contracts.ts'
export type MonitorSourceDefinition={source_id:string;adapter_id:'http.json-items.v1'|'web.text.v1';scope_key:string;required_markers:string[]}
export type MonitorBoundSourceDefinition=MonitorSourceDefinition&{tool:string;input:Record<string,unknown>;request_hash:string;connection_id?:string;config_hash?:string}
export type MonitorSourceEnvelope={text:string;structuredContent:unknown;coverage:{stored_complete:true};redacted:false;usable_as_evidence:true;http_response:{status:number;complete:true;empty:false;media_type:string}}
export const monitorCanonical=(value:unknown):string=>{
 const bad=():never=>{throw new HttpError(422,'invalid_monitor_source_value')};let nodes=0
 const text=(v:string)=>{if(v.includes('\0')||Array.from(v).some(c=>c.length===1&&/[\ud800-\udfff]/u.test(c)))return bad();return JSON.stringify(v)}
 function walk(v:unknown,depth:number):string{
  if(depth>40||++nodes>200000)return bad()
  if(v===null)return'null';if(typeof v==='boolean')return String(v);if(typeof v==='string')return text(v)
  if(typeof v==='number'){if(!Number.isFinite(v))return bad();return JSON.stringify(v)}
  if(!v||typeof v!=='object')return bad()
  const d=Object.getOwnPropertyDescriptors(v)
  if(Array.isArray(v)){
   if(Reflect.ownKeys(v).length!==v.length+1)return bad();const values:string[]=[]
   for(let i=0;i<v.length;i++){const field=d[String(i)];if(!field?.enumerable||!Object.hasOwn(field,'value'))return bad();values.push(walk(field.value,depth+1))}return'['+values.join(',')+']'
  }
  if(![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).some(k=>typeof k!=='string'||!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))return bad()
  return'{'+Object.keys(v).sort().map(k=>text(k)+':'+walk(d[k]!.value,depth+1)).join(',')+'}'
 }
 return walk(value,0)
}
export const monitorHash=(value:unknown):string=>createHash('sha256').update(monitorCanonical(value),'utf8').digest('hex')
const fail=():never=>{throw new HttpError(409,'monitor_source_coverage_incomplete')}
/** Same declaration-only source coverage rule as the original PB collector.
 * Called only AFTER the stored immutable receipt and current recursive ACL have
 * been checked by the repository. This pure result grants no read authority. */
export function monitorSourceProjection(source:MonitorSourceDefinition,raw:unknown):{source_id:string;projection_hash:string;adapter_id:string;scope:'declared_request_response_only'}{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail()
 const envelope=raw as Record<string,unknown>,coverage=envelope.coverage as Record<string,unknown>|null,validation=envelope.validation as Record<string,unknown>|null
 if(coverage?.stored_complete!==true||envelope.redacted!==false||envelope.usable_as_evidence!==true||validation?.status==='invalid')return fail()
 let projection:unknown
 if(source.adapter_id==='http.json-items.v1'){
  const value=envelope.structuredContent as Record<string,unknown>|null
  if(!value||value.scope_key!==source.scope_key||value.complete!==true||value.has_more!==false||value.next_cursor!==null||!Array.isArray(value.items)||value.items.length>1000)return fail()
  projection=value.items
 }else if(source.adapter_id==='web.text.v1'){
  const http=envelope.http_response as Record<string,unknown>|null,text=envelope.text
  if(!http||typeof http.status!=='number'||http.status<200||http.status>=300||http.complete!==true||http.empty!==false||typeof http.media_type!=='string'||!/^text\/(?:html|plain)(?:;|$)/i.test(http.media_type)||typeof text!=='string'||text.length<40||source.required_markers.some(m=>!text.includes(m)))return fail()
  projection=text
 }else return fail()
 return{source_id:source.source_id,projection_hash:monitorHash(projection),adapter_id:source.adapter_id,scope:'declared_request_response_only'}
}
export function monitorEventDedup(input:{monitor_id:string;revision:number;baseline_check_id:string|null;kind:string;fact:Record<string,unknown>}):string{
 // Preserve PB's canonical key exactly (legacy empty baseline representation).
 // Check ID, quote text, result ID and new prose never enter the semantic key.
 return monitorHash({monitor_id:input.monitor_id,revision:input.revision,baseline:input.baseline_check_id??'',kind:input.kind,fact:input.fact})
}
