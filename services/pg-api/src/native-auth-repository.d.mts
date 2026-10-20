import type {SqlPool,Identity} from "./contracts.ts"
export interface NativeProfile{
  id:string
  email:string
  display_name:string
  is_admin:boolean
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
  /** Operator-only, never HTTP-callable. */
  provisionInitialAdmin(employee:{email:string,password:string,display_name:string}):Promise<Omit<NativeProfile,"identity">>
  login(email:string,password:string):Promise<NativeLoginResult>
  getSessionProfile(token:string):Promise<NativeProfile|null>
  verifySession(token:string):Promise<Identity|null>
  revokeSession(token:string):Promise<boolean>
  provisionEmployee(token:string,employee:{
    email:string,password:string,display_name:string,
  }):Promise<Omit<NativeProfile,"identity">>
}
