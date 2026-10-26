import type {SqlPool,Identity} from "./contracts.ts"
export interface NativeProfile{
  id:string
  email:string
  display_name:string
  is_admin:boolean
  share_enabled?:boolean
  identity:Identity
}
export interface NativeLoginResult{
  authenticated:true
  token:string
  expiresAt:Date
  identity:Identity
  is_admin:boolean
}
export class NativeAuthRepository{
  constructor(pool:SqlPool)
  inspectEmployeeGovernance():Promise<boolean>
  changeEmployee(token:string,choice:unknown):Promise<Record<string,unknown>>
  confirmEmployeeChange(token:string,choice:unknown):Promise<Record<string,unknown>>
  createGovernedEmployee(token:string,choice:unknown):Promise<Record<string,unknown>>
  changePassword(token:string,choice:unknown):Promise<{ok:true;reauthenticate:true}>
  /** Operator-only, never HTTP-callable. */
  provisionInitialAdmin(employee:{email:string,password:string,display_name:string}):Promise<Omit<NativeProfile,"identity">>
  login(email:string,password:string):Promise<NativeLoginResult>
  getSessionProfile(token:string):Promise<NativeProfile|null>
  verifySession(token:string):Promise<Identity|null>
  /** Server-internal exact lookup; verified native identity only. No directory endpoint. */
  resolveKnowledgeRecipient(identity:Identity,email:string):Promise<{id:string;display_name:string}|null>
  revokeSession(token:string):Promise<boolean>
  listEmployees(token:string,limit?:number):Promise<Array<{
    id:string;email:string;display_name:string;is_admin:boolean
    enabled:boolean;status:"active"|"disabled";created_at:string;share_enabled:boolean;revision:number
  }>>
  provisionEmployee(token:string,employee:{
    email:string,password:string,display_name:string,
  }):Promise<Omit<NativeProfile,"identity">>
}
