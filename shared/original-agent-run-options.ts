// Closed UI choices, shared by the original page and verified Native admission.
// This parser grants no identity, role, device, tool or execution permission.
export const originalRunOptionsProtocol='native_original_run_options_v1' as const
export const originalRunRuntimeChoices=Object.freeze([0,30,60,120,240,480,1440] as const)
export type OriginalRunOptions={protocol:typeof originalRunOptionsProtocol;max_model_calls:number;max_runtime_minutes:number;require_plan_review:boolean;structured_planning:boolean;local_device_id:string|null}
export function originalRunOptionsObject(raw:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error('invalid_original_run_options')
 const descriptors=Object.getOwnPropertyDescriptors(raw),names=Reflect.ownKeys(descriptors)
 if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k))||keys.some(k=>!descriptors[k]?.enumerable||!Object.hasOwn(descriptors[k],'value')))throw Error('invalid_original_run_options')
 return raw as Record<string,unknown>
}
export function parseOriginalRunOptions(raw:unknown):Readonly<OriginalRunOptions>{
 const v=originalRunOptionsObject(raw,['protocol','max_model_calls','max_runtime_minutes','require_plan_review','structured_planning','local_device_id'])
 if(v.protocol!==originalRunOptionsProtocol||!Number.isSafeInteger(v.max_model_calls)||Number(v.max_model_calls)<1||Number(v.max_model_calls)>100||!originalRunRuntimeChoices.some(x=>x===v.max_runtime_minutes)||typeof v.require_plan_review!=='boolean'||typeof v.structured_planning!=='boolean'||v.structured_planning&&!v.require_plan_review||v.local_device_id!==null&&(typeof v.local_device_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.local_device_id)))throw Error('invalid_original_run_options')
 return Object.freeze({protocol:originalRunOptionsProtocol,max_model_calls:Number(v.max_model_calls),max_runtime_minutes:Number(v.max_runtime_minutes),require_plan_review:v.require_plan_review,structured_planning:v.structured_planning,local_device_id:v.local_device_id as string|null})
}
export const originalRunOptionsCanonical=(raw:unknown)=>JSON.stringify(parseOriginalRunOptions(raw))
export function originalRunBudgetRefusal(options:OriginalRunOptions,modelCalls:number,createdAt:number,databaseNow:number,nextUsesModel:boolean):'original_run_model_budget_exhausted'|'original_run_time_budget_exhausted'|null{
 parseOriginalRunOptions(options)
 if(typeof nextUsesModel!=='boolean'||!Number.isSafeInteger(modelCalls)||modelCalls<0||modelCalls>options.max_model_calls||!Number.isFinite(createdAt)||!Number.isFinite(databaseNow)||createdAt<=0||databaseNow<createdAt)throw Error('unconfirmed_original_run_budget')
 if(options.max_runtime_minutes>0&&databaseNow-createdAt>=options.max_runtime_minutes*60000)return'original_run_time_budget_exhausted'
 if(nextUsesModel&&modelCalls>=options.max_model_calls)return'original_run_model_budget_exhausted'
 return null
}
