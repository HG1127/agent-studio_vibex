// A comparison with verified server identity, never an authentication token.
export const originalAccountPasswordProtocol='native_account_password_owner_bound_v1' as const
export const originalAccountPasswordPolicy=Object.freeze({min_utf8_bytes:12,max_utf8_bytes:256})
function fail(code:string):never{throw Error(code)}
function object(raw:unknown,keys?:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return fail('invalid_original_account_contract')
 const out:Record<string,unknown>={}
 for(const key of Reflect.ownKeys(raw)){
  const descriptor=Object.getOwnPropertyDescriptor(raw,key)
  if(typeof key!=='string'||!descriptor?.enumerable||!Object.hasOwn(descriptor,'value')||['__proto__','constructor','prototype'].includes(key))return fail('invalid_original_account_contract')
  out[key]=descriptor.value
 }
 if(keys&&(Object.keys(out).length!==keys.length||keys.some(key=>!Object.hasOwn(out,key))))return fail('invalid_original_account_contract')
 return out
}
export function parseOriginalAccountExpectedOwner(raw:unknown):string{
 if(typeof raw!=='string'||raw.length!==36||! /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(raw))return fail('invalid_expected_owner')
 return raw.toLowerCase()
}
export type OriginalAccountPasswordInput={old_password:string;new_password:string}
export function parseOriginalAccountPasswordInput(raw:unknown):OriginalAccountPasswordInput{
 let value:Record<string,unknown>
 try{value=object(raw,['old_password','new_password'])}catch{return fail('invalid_employee_governance_input')}
 const bytes=(text:string)=>new TextEncoder().encode(text).byteLength
 if(typeof value.old_password!=='string'||bytes(value.old_password)>256)return fail('invalid_employee_governance_input')
 if(typeof value.new_password!=='string'||bytes(value.new_password)<12||bytes(value.new_password)>256||/[\0\r\n]/.test(value.new_password)||!/[\p{L}\p{N}]/u.test(value.new_password))return fail('invalid_employee_password')
 return {old_password:value.old_password,new_password:value.new_password}
}
export function parseOriginalAccountPasswordResponse(raw:unknown):{ok:true;reauthenticate:true}{
 const value=object(raw,['ok','reauthenticate'])
 if(value.ok!==true||value.reauthenticate!==true)return fail('invalid_original_account_password_response')
 return {ok:true,reauthenticate:true}
}
export type OriginalAccountPasswordCapabilities={available:boolean;enabled:boolean;protocol:typeof originalAccountPasswordProtocol|null}
export function parseOriginalAccountPasswordCapabilities(raw:unknown):OriginalAccountPasswordCapabilities{
 const value=object(raw),keys=['original_account_password_protocol','original_account_password_available','original_account_password_enabled']
 if(value.mode!=='native_pg18'||typeof value.config_writes_enabled!=='boolean')return fail('invalid_original_account_password_capabilities')
 if(keys.every(key=>!Object.hasOwn(value,key)))return {available:false,enabled:false,protocol:null}
 if(value.original_account_password_protocol!==originalAccountPasswordProtocol||value.original_account_password_available!==true||typeof value.original_account_password_enabled!=='boolean'||value.employee_governance_available!==true||typeof value.employee_governance_enabled!=='boolean'||value.employee_governance_enabled!==value.config_writes_enabled||value.original_account_password_enabled!==value.config_writes_enabled)return fail('invalid_original_account_password_capabilities')
 return {available:true,enabled:value.original_account_password_enabled,protocol:originalAccountPasswordProtocol}
}
