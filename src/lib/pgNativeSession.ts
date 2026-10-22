/**
 * PostgreSQL-native employee session client for the future independent
 * production app. No PocketBase/OIDC imports or local token storage.
 * Not wired into the 8090 PocketBase UI until PG business parity and UAT.
 */
export type PgEmployeeProfile={
  id:string
  email:string
  display_name:string
  is_admin:boolean
}
export type PgSessionState=
  | {status:"authenticated",profile:PgEmployeeProfile}
  | {status:"signed_out"}
  | {status:"unavailable"}

export class PgNativeSessionError extends Error {
  readonly status:number
  readonly code:string
  constructor(status:number,code:string){
    super(code)
    this.name="PgNativeSessionError"
    this.status=status
    this.code=code
  }
}

const routes={
  login:"/api/native-auth/login",
  me:"/api/native-auth/me",
  logout:"/api/native-auth/logout",
} as const
type SessionRoute=typeof routes[keyof typeof routes]
function validProfile(value:unknown):value is PgEmployeeProfile{
  if(!value||typeof value!=="object"||Array.isArray(value))return false
  const user=value as Record<string,unknown>
  return typeof user.id==="string"&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(user.id)&&
    typeof user.email==="string"&&user.email.length>0&&user.email.length<=254&&
    typeof user.display_name==="string"&&user.display_name.length<=80&&
    typeof user.is_admin==="boolean"
}
function errorCode(value:unknown):string {
  if(typeof value==="string"&&/^[a-z_]{1,80}$/.test(value))return value
  return "native_auth_request_failed"
}
export function createPgEmployeeSession(transport:typeof fetch=fetch){
  let epoch=0
  let verifying:Promise<PgSessionState>|null=null
  async function request(route:SessionRoute,method:"GET"|"POST"="GET",
      body?:Record<string,unknown>):Promise<Record<string,unknown>>{
    let response:Response
    try{
      response=await transport(route,{
        method,credentials:"same-origin",cache:"no-store",
        redirect:"error",referrerPolicy:"no-referrer",
        headers:{
          "Accept":"application/json",
          ...(method==="POST"?{"Content-Type":"application/json",
            "X-AgentStudio-Request":"1"}:{}),
        },
        ...(body?{body:JSON.stringify(body)}:{}),
        signal:AbortSignal.timeout(12000),
      })
    }catch{
      throw new PgNativeSessionError(0,"pg_native_connection_unavailable")
    }
    let payload:unknown
    try{payload=await response.json()}
    catch{throw new PgNativeSessionError(response.status,"invalid_native_response")}
    if(!response.ok)
      throw new PgNativeSessionError(response.status,
        errorCode((payload as Record<string,unknown>|null)?.error))
    if(!payload||typeof payload!=="object"||Array.isArray(payload))
      throw new PgNativeSessionError(response.status,"invalid_native_response")
    return payload as Record<string,unknown>
  }
  async function readProfile():Promise<PgEmployeeProfile>{
    const data=await request(routes.me)
    if(data.authenticated!==true||!validProfile(data.user))
      throw new PgNativeSessionError(0,"native_profile_invalid")
    return data.user
  }
  async function session():Promise<PgSessionState>{
    if(verifying)return verifying
    const localEpoch=epoch
    const pending:Promise<PgSessionState>=(async()=>{
      try{
        const profile=await readProfile()
        return localEpoch===epoch?{status:"authenticated",profile}
          :{status:"unavailable"}
      }catch(err){
        if(localEpoch!==epoch)return {status:"unavailable"}
        if(err instanceof PgNativeSessionError&&err.status===401)
          return {status:"signed_out"}
        return {status:"unavailable"}
      }
    })()
    verifying=pending
    void pending.finally(()=>{if(verifying===pending)verifying=null})
    return pending
  }
  async function signIn(email:string,password:string):Promise<PgEmployeeProfile>{
    if(typeof email!=="string"||!email.trim()||email.length>254||
       typeof password!=="string"||!password||password.length>256)
      throw new PgNativeSessionError(400,"invalid_login_input")
    ++epoch
    const login=await request(routes.login,"POST",{
      email:email.trim(),password
    })
    if(login.authenticated!==true)
      throw new PgNativeSessionError(0,"invalid_native_response")
    return readProfile()
  }
  async function signOut():Promise<void>{
    const result=await request(routes.logout,"POST",{})
    if(result.ok!==true)
      throw new PgNativeSessionError(0,"invalid_native_response")
    ++epoch
  }
  return {session,signIn,signOut}
}
