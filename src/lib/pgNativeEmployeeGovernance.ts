export type EmployeeChange={request_id:string;target_id:string;expected_revision:number;is_admin:boolean;enabled:boolean;share_enabled:boolean;confirm:true}
export type EmployeeGovernanceResult={request_id:string;target_id:string;is_admin:boolean;enabled:boolean;status:"active"|"disabled";share_enabled:boolean;revision:number;replayed:boolean}
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v)
export function employeeChange(raw:EmployeeChange):EmployeeChange{
  if(!raw||!uuid(raw.request_id)||!uuid(raw.target_id)||!Number.isSafeInteger(raw.expected_revision)||raw.expected_revision<1||raw.expected_revision>=Number.MAX_SAFE_INTEGER-1||
    [raw.is_admin,raw.enabled,raw.share_enabled].some(v=>typeof v!=="boolean")||raw.confirm!==true||Object.keys(raw).sort().join(",")!=="confirm,enabled,expected_revision,is_admin,request_id,share_enabled,target_id")throw Error("invalid_employee_change")
  return {...raw,request_id:raw.request_id.toLowerCase(),target_id:raw.target_id.toLowerCase()}
}
export function employeeGovernanceResult(raw:unknown,choice:EmployeeChange):EmployeeGovernanceResult{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("invalid_employee_governance_response")
  const r=raw as Record<string,unknown>
  if(Object.keys(r).sort().join(",")!=="enabled,is_admin,replayed,request_id,revision,share_enabled,status,target_id"||r.target_id!==choice.target_id||r.request_id!==choice.request_id||
    [r.is_admin,r.enabled,r.share_enabled,r.replayed].some(v=>typeof v!=="boolean")||!Number.isSafeInteger(r.revision)||Number(r.revision)<2||
    r.status!==(r.enabled?"active":"disabled")||r.revision!==choice.expected_revision+1||r.is_admin!==choice.is_admin||r.enabled!==choice.enabled||r.share_enabled!==choice.share_enabled)throw Error("invalid_employee_governance_response")
  return r as EmployeeGovernanceResult
}
export type EmployeeCreation={email:string;display_name:string;password:string;is_admin:boolean;share_enabled:boolean}
export function employeeCreation(raw:EmployeeCreation):EmployeeCreation{
  if(!raw||Object.keys(raw).sort().join(",")!=="display_name,email,is_admin,password,share_enabled"||typeof raw.email!=="string"||raw.email.length>254||
    typeof raw.display_name!=="string"||raw.display_name.length>80||typeof raw.password!=="string"||new TextEncoder().encode(raw.password).length>256||
    typeof raw.is_admin!=="boolean"||typeof raw.share_enabled!=="boolean")throw Error("invalid_employee_creation")
  return {...raw,email:raw.email.trim().toLowerCase(),display_name:raw.display_name.trim()}
}
export function employeeCreationResult(raw:unknown,choice:EmployeeCreation){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("invalid_employee_creation_response")
  const r=raw as Record<string,unknown>
  if(Object.keys(r).sort().join(",")!=="display_name,email,enabled,id,is_admin,revision,share_enabled,status"||!uuid(r.id)||r.email!==choice.email||r.display_name!==choice.display_name||
    r.is_admin!==choice.is_admin||r.share_enabled!==choice.share_enabled||r.enabled!==true||r.status!=="active"||r.revision!==1)throw Error("invalid_employee_creation_response")
  return {id:r.id,email:choice.email,display_name:choice.display_name,is_admin:choice.is_admin,share_enabled:choice.share_enabled}
}
