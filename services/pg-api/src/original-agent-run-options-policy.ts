import {createHash} from 'node:crypto'
import {HttpError,type SqlClient} from './contracts.ts'
import {parseOriginalRunOptions,originalRunOptionsCanonical,originalRunOptionsObject,originalRunBudgetRefusal,type OriginalRunOptions} from '../../../shared/original-agent-run-options.ts'
type Row={id:string;owner_user_id:string;agent_spec_id:string|null;instruction:string;created_at:unknown;checkpoint?:unknown}
export type OriginalRunAdmission={protocol:'native_original_run_admission_v1';options:Readonly<OriginalRunOptions>;source_sha256:string}
type Reservation={source_sha256:string;step_key:string;input_sha256:string;effect_kind:'model'|'tool';tool:string|null;uses_model:boolean}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,shaPattern=/^[a-f0-9]{64}$/
function fail(code='unconfirmed_original_run_admission'):never{throw new HttpError(409,code)}
const sha=(value:string)=>createHash('sha256').update(value).digest('hex')
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail();for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!d?.enumerable||!Object.hasOwn(d,'value'))return fail()}return value as Record<string,unknown>}
function stamp(value:unknown):string{if(!(typeof value==='string'||value instanceof Date))return fail();const time=value instanceof Date?value.getTime():Date.parse(value);if(!Number.isFinite(time)||time<=0)return fail();return new Date(time).toISOString()}
function source(row:Row,revision:number,options:OriginalRunOptions):string{
 const graph=record(record(row.checkpoint).machine).graph_sha256
 if(![row.id,row.owner_user_id,row.agent_spec_id].every(v=>typeof v==='string'&&uuid.test(v))||!Number.isSafeInteger(revision)||revision<1||typeof row.instruction!=='string'||typeof graph!=='string'||!shaPattern.test(graph))return fail()
 return sha(JSON.stringify({run_id:row.id,owner_user_id:row.owner_user_id,spec_id:row.agent_spec_id,spec_revision:revision,instruction_sha256:sha(row.instruction),created_at:stamp(row.created_at),graph_sha256:graph,options:parseOriginalRunOptions(options)}))
}
export function parseOriginalRunAdmission(raw:unknown):Readonly<OriginalRunAdmission>{
 let v:Record<string,unknown>;try{v=originalRunOptionsObject(raw,['protocol','options','source_sha256'])}catch{return fail()}
 if(v.protocol!=='native_original_run_admission_v1'||typeof v.source_sha256!=='string'||!shaPattern.test(v.source_sha256))return fail()
 return Object.freeze({protocol:'native_original_run_admission_v1',options:parseOriginalRunOptions(v.options),source_sha256:v.source_sha256})
}
function reservation(raw:unknown):Reservation{
 let v:Record<string,unknown>;try{v=originalRunOptionsObject(raw,['source_sha256','step_key','input_sha256','effect_kind','tool','uses_model'])}catch{return fail()}
 if(typeof v.source_sha256!=='string'||!shaPattern.test(v.source_sha256)||typeof v.step_key!=='string'||!/^[A-Za-z0-9_:-]{1,200}$/.test(v.step_key)||typeof v.input_sha256!=='string'||!shaPattern.test(v.input_sha256)||(v.effect_kind!=='model'&&v.effect_kind!=='tool')||(v.tool!==null&&(typeof v.tool!=='string'||!/^[A-Za-z0-9_:-]{1,220}$/.test(v.tool)))||typeof v.uses_model!=='boolean'||v.effect_kind==='model'&&v.tool!==null||v.uses_model!==(v.effect_kind==='model'||v.tool==='summarize'))return fail()
 return {source_sha256:v.source_sha256,step_key:v.step_key,input_sha256:v.input_sha256,effect_kind:v.effect_kind,tool:v.tool as string|null,uses_model:v.uses_model}
}
/** Same owner transaction as run/job admission. Audit metadata is append-only
 * under the existing API grants; no prompt, key or Skill content is stored. */
export async function bindOriginalRunAdmission(db:SqlClient,row:Row,revision:number,raw:unknown):Promise<Readonly<OriginalRunAdmission>>{
 const options=parseOriginalRunOptions(raw),binding=Object.freeze({protocol:'native_original_run_admission_v1' as const,options,source_sha256:source(row,revision,options)})
 const inserted=await db.query<{id:string}>("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) SELECT $1::uuid,$1::uuid,$2::uuid,'agent.original_ui_admitted','agent_run',$2::text,'succeeded',$3::jsonb FROM agentstudio.runs WHERE id=$2::uuid AND owner_user_id=$1::uuid AND kind='agent' RETURNING id",[row.owner_user_id,row.id,JSON.stringify(binding)])
 if(inserted.rows.length!==1||!uuid.test(inserted.rows[0]?.id??''))return fail()
 return binding
}
/** Queried even when a persisted Agent checkpoint omits original_ui. A missing
 * mutable marker cannot remove an immutable admission or debit history. */
export async function originalRunAdmissionOnClient(db:SqlClient,owner:string,row:Row,revision:number,raw:unknown):Promise<{binding:Readonly<OriginalRunAdmission>;model_calls:number}|null>{
 if(owner!==row.owner_user_id||!uuid.test(owner)||!uuid.test(row.id))return fail()
 const audit=(await db.query<{action:string;metadata:unknown}>("SELECT action,metadata FROM agentstudio.audit_events WHERE owner_user_id=$1::uuid AND actor_user_id=$1::uuid AND run_id=$2::uuid AND action IN ('agent.original_ui_admitted','agent.original_ui_effect_reserved') ORDER BY occurred_at,id LIMIT 2001",[owner,row.id])).rows
 if(!audit.length){if(raw!==undefined)return fail();return null}
 if(audit.length>2000||raw===undefined)return fail()
 const receipts=audit.filter(r=>r.action==='agent.original_ui_admitted');if(receipts.length!==1)return fail()
 const binding=parseOriginalRunAdmission(raw),receipt=parseOriginalRunAdmission(receipts[0]?.metadata)
 if(source(row,revision,binding.options)!==binding.source_sha256||receipt.source_sha256!==binding.source_sha256||originalRunOptionsCanonical(receipt.options)!==originalRunOptionsCanonical(binding.options))return fail()
 const debits=new Map<string,Reservation>();let model_calls=0
 for(const r of audit){if(r.action==='agent.original_ui_admitted')continue;if(r.action!=='agent.original_ui_effect_reserved')return fail();const debit=reservation(r.metadata);if(debit.source_sha256!==binding.source_sha256||debits.has(debit.step_key))return fail();debits.set(debit.step_key,debit);if(debit.uses_model)model_calls++}
 const effects=(await db.query<{step_key:string;arguments_sha256:string;tool_name:string}>("SELECT step_key,arguments_sha256,tool_name FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND tool_name IN ('workflow:model','workflow:tool') ORDER BY step_key LIMIT 2001",[owner,row.id])).rows
 if(effects.length!==debits.size||effects.length>2000||model_calls>binding.options.max_model_calls)return fail()
 const seen=new Set<string>();for(const effect of effects){const debit=debits.get(effect.step_key);if(seen.has(effect.step_key)||!debit||debit.input_sha256!==effect.arguments_sha256||effect.tool_name!=='workflow:'+debit.effect_kind)return fail();seen.add(effect.step_key)}
 return {binding,model_calls}
}
export async function verifyOriginalRunAdmission(db:SqlClient,owner:string,row:Row,revision:number,raw:unknown):Promise<Readonly<OriginalRunAdmission>>{const value=await originalRunAdmissionOnClient(db,owner,row,revision,raw);if(!value)return fail();return value.binding}
export function originalRunAdmissionMatches(raw:unknown,choices:unknown|undefined):boolean{if(raw===undefined)return choices===undefined;if(choices===undefined)return false;try{return originalRunOptionsCanonical(parseOriginalRunAdmission(raw).options)===originalRunOptionsCanonical(choices)}catch{return false}}
/** Existing live job/run lock is held. Called ONLY after the no-replay branch,
 * after exact approval and adapter checks, before inserting NEW started effect.
 * Debit and effect commit together. Unknown/started/succeeded replay never debits. */
export async function reserveOriginalRunEffect(db:SqlClient,owner:string,row:Row,revision:number,raw:unknown,pending:{step_key:string;input_sha256:string;kind:string;configuration:{tool?:unknown}}):Promise<'original_run_model_budget_exhausted'|'original_run_time_budget_exhausted'|null>{
 const current=await originalRunAdmissionOnClient(db,owner,row,revision,raw);if(!current)return fail();const {binding,model_calls}=current
 const next=reservation({source_sha256:binding.source_sha256,step_key:pending.step_key,input_sha256:pending.input_sha256,effect_kind:pending.kind,tool:pending.kind==='tool'&&typeof pending.configuration.tool==='string'?pending.configuration.tool:null,uses_model:pending.kind==='model'||pending.kind==='tool'&&pending.configuration.tool==='summarize'})
 const clock=(await db.query<{now_ms:number}>("SELECT (extract(epoch FROM clock_timestamp())*1000)::double precision AS now_ms")).rows;if(clock.length!==1)return fail('unconfirmed_original_run_budget')
 const refusal=originalRunBudgetRefusal(binding.options,model_calls,Date.parse(stamp(row.created_at)),clock[0]?.now_ms??NaN,next.uses_model);if(refusal)return refusal
 const expires=binding.options.max_runtime_minutes===0?null:new Date(Date.parse(stamp(row.created_at))+binding.options.max_runtime_minutes*60000).toISOString()
 const reserved=await db.query<{id:string}>("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) SELECT $1::uuid,$1::uuid,$2::uuid,'agent.original_ui_effect_reserved','agent_run',$2::text,'succeeded',$3::jsonb WHERE $4::timestamptz IS NULL OR clock_timestamp()<$4::timestamptz RETURNING id",[owner,row.id,JSON.stringify(next),expires])
 if(reserved.rows.length>1||reserved.rows.length===1&&!uuid.test(reserved.rows[0]?.id??''))return fail('unconfirmed_original_run_budget')
 return reserved.rows.length===1?null:'original_run_time_budget_exhausted'
}
