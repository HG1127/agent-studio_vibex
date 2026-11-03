import type {OriginalRolePin,OriginalRole} from '../../../shared/original-role-execution-contract.mjs'
export function originalRoleCanonical(v:unknown):string
export function originalRoleHash(v:unknown):string
export function originalSkillHash(content:string):string
export function checkedOriginalRolePin(raw:unknown,spec:unknown,scope?:{owner_user_id:string;run_id:string;spec_id:string;spec_revision:number}):OriginalRolePin
export function originalRoleContext(pin:OriginalRolePin,completed:{role_id:string;output:string}[]):{role:OriginalRole;last:boolean;context:Record<string,unknown>}
export function originalRoleInstruction(last:boolean):string
