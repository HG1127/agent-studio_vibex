import {originalSchedulesFunctionManifest} from '../../services/pg-api/src/original-schedules-audit-manifest.ts'
const functions=new Set(originalSchedulesFunctionManifest.map(f=>f.name))
// Own scalar PostgreSQL fields only. Never read/stringify message, detail,
// internalQuery, parameters, arbitrary error objects, SQL or employee content.
export function originalSchedules078RuntimeSqlFailure(error){
 const own=key=>{try{const d=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,key):null;return d&&Object.hasOwn(d,'value')?d.value:undefined}catch{return undefined}}
 const position=value=>typeof value==='string'&&/^[1-9][0-9]{0,6}$/.test(value)?Number(value):null
 const code=own('code'),where=own('where');let name=null,line=null
 if(typeof where==='string'&&where.length<=4096){
  for(const m of where.matchAll(/(?:^|\r?\n)(?:PL\/pgSQL|SQL) function (?:agentstudio\.)?"?(original_schedule_[a-z_]{1,60})"?\([^\r\n)]{0,200}\) line ([1-9][0-9]{0,5})\b/g))if(functions.has(m[1])){name=m[1];line=Number(m[2]);break}
 }
 return Object.freeze({event:'original_schedules078_runtime_sql_failure',sqlstate:typeof code==='string'&&/^[0-9A-Z]{5}$/.test(code)?code:null,position:position(own('position')),internal_position:position(own('internalPosition')),function_name:name,function_line:line,observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false})
}
