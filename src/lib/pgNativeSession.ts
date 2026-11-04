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
  loginStatus:"/api/native-auth/login-status",
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
const nativeLoginStatusProtocol="native_employee_login_status_v1"
function parseLoginStatus(value:Record<string,unknown>):PgSessionState{
  if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new PgNativeSessionError(0,"native_login_status_invalid")
  const keys=Reflect.ownKeys(value),descriptors=Object.getOwnPropertyDescriptors(value)
  if(keys.length!==3||!["protocol","authenticated","user"].every(key=>descriptors[key]?.enumerable&&Object.hasOwn(descriptors[key],"value"))||value.protocol!==nativeLoginStatusProtocol)
    throw new PgNativeSessionError(0,"native_login_status_invalid")
  if(value.authenticated===false&&value.user===null)return {status:"signed_out"}
  const user=value.user
  if(value.authenticated!==true||!user||typeof user!=="object"||Array.isArray(user)||![Object.prototype,null].includes(Object.getPrototypeOf(user)))
    throw new PgNativeSessionError(0,"native_login_status_invalid")
  const fields=Object.getOwnPropertyDescriptors(user),required=["id","email","display_name","is_admin"],allowed=[...required,"share_enabled"]
  if(Reflect.ownKeys(user).some(key=>typeof key!=="string"||!allowed.includes(key))||required.some(key=>!fields[key]?.enumerable||!Object.hasOwn(fields[key],"value"))||Object.values(fields).some(field=>!field.enumerable||!Object.hasOwn(field,"value"))||!validProfile(user)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(user.id)||Object.hasOwn(fields,"share_enabled")&&typeof (user as Record<string,unknown>).share_enabled!=="boolean")
    throw new PgNativeSessionError(0,"native_login_status_invalid")
  return {status:"authenticated",profile:user}
}
function errorCode(value:unknown):string {
  if(typeof value==="string"&&/^[a-z_]{1,80}$/.test(value))return value
  return "native_auth_request_failed"
}
export function createPgEmployeeSession(transport:typeof fetch=fetch){
  let epoch=0
  let verifying:Promise<PgSessionState>|null=null
  let loginVerifying:Promise<PgSessionState>|null=null
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
    if(route===routes.loginStatus&&response.status!==200)
      throw new PgNativeSessionError(response.status,"native_login_status_invalid")
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
        if(err instanceof PgNativeSessionError&&(err.status===401||err.status===403))
          return {status:"signed_out"}
        return {status:"unavailable"}
      }
    })()
    verifying=pending
    void pending.finally(()=>{if(verifying===pending)verifying=null})
    return pending
  }
  // No status result is cached after completion. Errors, including401/403,
  // never become signed_out without the explicit200 status contract.
  function sessionForLogin():Promise<PgSessionState>{
    if(loginVerifying)return loginVerifying
    const localEpoch=epoch
    const pending:Promise<PgSessionState>=(async()=>{
      try{const state=parseLoginStatus(await request(routes.loginStatus));return localEpoch===epoch?state:{status:"unavailable"}}
      catch{return {status:"unavailable"}}
    })()
    loginVerifying=pending
    void pending.then(()=>{if(loginVerifying===pending)loginVerifying=null},()=>{if(loginVerifying===pending)loginVerifying=null})
    return pending
  }
  async function signIn(email:string,password:string):Promise<PgEmployeeProfile>{
    if(typeof email!=="string"||!email.trim()||email.length>254||
       typeof password!=="string"||!password||password.length>256)
      throw new PgNativeSessionError(400,"invalid_login_input")
    ++epoch
    loginVerifying=null
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
    loginVerifying=null
  }
  return {session,sessionForLogin,signIn,signOut}
}
