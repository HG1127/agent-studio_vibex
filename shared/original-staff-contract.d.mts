export const originalStaffProtocol:'native_original_staff_owner_cas_v1'
export const originalStaffPrefix:'/api/native-auth/original-staff'
export type OriginalStaffEmployee=Readonly<{id:string;display_name:string;email:string;role:'admin'|'employee';active:boolean;share_enabled:boolean;revision:number;governance_revision:number;created:string;updated:string}>
export type OriginalStaffMutation=Readonly<{action:'create'|'update'|'reset';target_id:string|null;request_id:string;expected_revision?:number;expected_governance_revision?:number;expected_updated?:string;display_name?:string;email?:string;role?:'admin'|'employee';active?:boolean;share_enabled?:boolean;password?:string;new_password?:string;confirm:true}>
export type OriginalStaffReceipt=Readonly<{request_id:string;action:'create'|'update'|'reset';target_id:string;request_sha256:string;committed:true;user:OriginalStaffEmployee;revoked_sessions:boolean}>
export type OriginalStaffList=Readonly<{items:readonly OriginalStaffEmployee[];page:number;perPage:number;totalItems:number;totalPages:number;summary:Readonly<{total:number;active:number;admins:number;sharing:number}>}>
export function staffObject(value:unknown,keys:string[]):Record<string,unknown>
export function staffId(value:unknown):string
export function staffExpectedOwner(value:unknown):string
export function staffRevision(value:unknown):number
export function staffUpdated(value:unknown):string
export function parseOriginalStaffMutation(action:string,target:string|null,raw:unknown):OriginalStaffMutation
export function originalStaffPublicChoice(choice:OriginalStaffMutation):Record<string,unknown>
export function parseOriginalStaffList(params:URLSearchParams):Readonly<{page:number;perPage:number;q:string;role:string;active:string}>
export function parseOriginalStaffReceipt(requestId:string,params:URLSearchParams):Readonly<{request_id:string;action:string;request_sha256:string;target_id:string|null}>
export function originalStaffEmployee(raw:unknown):OriginalStaffEmployee
export function originalStaffListResult(raw:unknown):OriginalStaffList
export function originalStaffReceiptResult(raw:unknown):OriginalStaffReceipt
