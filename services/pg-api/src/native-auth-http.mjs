// Native PostgreSQL employee authentication HTTP handlers.
// NOT deployed. Construct only inside a dedicated localhost-only PG18 server.
// Uses server-verified HttpOnly sessions; never trusts forwarded user headers,
// PocketBase tokens or synthetic OIDC claims.
import {createHash} from "node:crypto"
import {NATIVE_SESSION_COOKIE,buildNativeSessionCookie,
  clearNativeSessionCookie} from "./native-employee-auth.mjs"

const prefix="/api/native-auth"
const maxBody=8192
function abort(status,code){const e=Error(code);e.status=status;throw e}
function respond(res,status,body,extra={}){
  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Pragma":"no-cache",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer",
    "Cross-Origin-Resource-Policy":"same-origin",
    "X-Frame-Options":"DENY",
    ...extra
  })
  res.end(JSON.stringify(body))
}
function publicProfile(profile){
  return {id:profile.id,email:profile.email,
    display_name:profile.display_name,is_admin:profile.is_admin===true}
}
export function nativeSessionToken(req){
  const raw=req.headers.cookie
  if(typeof raw!=="string"||raw.length>4096)return null
  let matches=0,token=null
  for(const item of raw.split(";")){
    const part=item.trim()
    if(part.startsWith(NATIVE_SESSION_COOKIE+"=")){
      matches++
      const value=part.slice(NATIVE_SESSION_COOKIE.length+1)
      if(/^[A-Za-z0-9_-]{43}$/.test(value))token=value
    }
  }
  if(matches!==1)return null
  return token
}
function validOrigin(origin){
  if(typeof origin!=="string")return false
  try{
    const parsed=new URL(origin)
    return parsed.origin===origin&&
      (parsed.protocol==="https:"||
       (parsed.protocol==="http:"&&
        ["127.0.0.1","localhost"].includes(parsed.hostname)))
  }catch{return false}
}
export function verifyNativeOrigin(req,allowedOrigin,unsafe=false){
  if(!validOrigin(allowedOrigin))abort(503,"native_origin_unavailable")
  const origin=req.headers.origin
  if(origin!==undefined&&origin!==allowedOrigin)abort(403,"origin_not_allowed")
  const fetchSite=req.headers["sec-fetch-site"]
  if(fetchSite!==undefined&&fetchSite!=="same-origin"&&
     fetchSite!=="none")abort(403,"cross_site_request_denied")
  if(unsafe){
    if(origin!==allowedOrigin||req.headers["x-agentstudio-request"]!=="1")
      abort(403,"origin_or_csrf_header_required")
  }
}
async function readJson(req){
  const type=req.headers["content-type"]
  if(typeof type!=="string"||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type))
    abort(415,"json_content_type_required")
  const declared=Number(req.headers["content-length"]||0)
  if(!Number.isFinite(declared)||declared>maxBody||declared<0)
    abort(413,"request_too_large")
  const fragments=[]
  let count=0
  for await(const chunk of req){
    count+=chunk.length
    if(count>maxBody)abort(413,"request_too_large")
    fragments.push(chunk)
  }
  let value
  try{value=JSON.parse(Buffer.concat(fragments).toString("utf8"))}
  catch{abort(400,"invalid_json")}
  if(!value||typeof value!=="object"||Array.isArray(value))
    abort(400,"invalid_json")
  return value
}
function exactKeys(value,keys){
  if(Object.keys(value).some(k=>!keys.includes(k))||
     keys.some(k=>!Object.prototype.hasOwnProperty.call(value,k)))
    abort(400,"invalid_request_fields")
}
function hashKey(part){
  return createHash("sha256").update(part).digest("base64url")
}
// Process-local admission limiter for an isolated single-process pilot.
// Reverse proxies must also apply upstream IP/rate limits for production.
export class NativeLoginLimiter{
  constructor({now=()=>Date.now(),maxEntries=2048}={}){
    this.now=now;this.maxEntries=maxEntries;this.entries=new Map()
  }
  admit(ip,email){
    const now=this.now()
    if(this.entries.size>=this.maxEntries){
      for(const [k,v] of this.entries)
        if(v.until<=now)this.entries.delete(k)
      if(this.entries.size>=this.maxEntries)abort(429,"login_rate_limited")
    }
    const safeIp=typeof ip==="string"?ip.slice(0,120):"unknown"
    const safeEmail=typeof email==="string"?email.trim().toLowerCase().slice(0,255):"invalid"
    for(const [name,limit] of [[hashKey("i:"+safeIp),60],
                                [hashKey("u:"+safeEmail),12]]){
      const entry=this.entries.get(name)
      if(entry&&entry.until>now&&entry.count>=limit)
        abort(429,"login_rate_limited")
      if(!entry||entry.until<=now)
        this.entries.set(name,{until:now+60_000,count:1})
      else entry.count++
    }
  }
}
export function createNativeAuthHttpHandler({auth,allowedOrigin,businessHandler,
    allowConfigurationWrites=false,allowModelProbe=false,allowMcpDiscovery=false,allowMcpToolExecution=false,allowSmitheryManagement=false,allowKnowledgeSharing=false,allowKnowledgeEmbeddingSettings=false,allowKnowledgeEmbeddingConsent=false,allowKnowledgeIndexRuntime=false,allowKnowledgeQueryRuntime=false,allowKnowledgeToolExecution=false,
    allowRunSubmission=false,allowBoundRunSubmission=false,
    allowWorkflowValidation=false,allowWorkflowExecution=false,
    allowWorkflowV2Submission=false,allowAutonomousAgentSubmission=false,allowScheduleRuntime=false,allowAgentCollaboration=false,
    allowEmployeeProvisioning=true,
    limiter=new NativeLoginLimiter()}){
  if(!auth||typeof auth.login!=="function"||
     typeof auth.getSessionProfile!=="function"||
     typeof auth.revokeSession!=="function"||
     typeof auth.provisionEmployee!=="function"||
     typeof businessHandler!=="function"||
     !validOrigin(allowedOrigin))
    throw Error("invalid_native_http_dependencies")
  const authenticateRequest=async req=>{
    verifyNativeOrigin(req,allowedOrigin,!["GET","HEAD"].includes(req.method))
    if(req.headers.authorization!==undefined)
      abort(401,"native_cookie_only")
    const token=nativeSessionToken(req)
    if(!token)abort(401,"session_required")
    const identity=await auth.verifySession(token)
    if(!identity)abort(401,"session_required")
    return identity
  }
  const handler=async(req,res)=>{
    let pathname="/"
    try{pathname=new URL(req.url||"/","http://127.0.0.1").pathname}
    catch{respond(res,400,{error:"invalid_path"});return}
    if(!pathname.startsWith(prefix+"/")){
      // The PG business handler obtains the identity from exactly the
      // authenticateRequest closure, never from the browser.
      return businessHandler(req,res)
    }
    try{
      const method=req.method||""
      verifyNativeOrigin(req,allowedOrigin,!["GET","HEAD"].includes(method))
      if(req.headers.authorization!==undefined)
        abort(401,"native_cookie_only")
      if(pathname===prefix+"/login"&&method==="POST"){
        const body=await readJson(req)
        exactKeys(body,["email","password"])
        if(typeof body.email!=="string"||typeof body.password!=="string"||
           body.email.length>255||Buffer.byteLength(body.password,"utf8")>256)
          abort(400,"invalid_login_input")
        limiter.admit(req.socket?.remoteAddress,body.email)
        let session
        try{session=await auth.login(body.email,body.password)}
        catch(err){
          if(err?.message==="invalid_employee_credentials")
            abort(401,"invalid_employee_credentials")
          throw err
        }
        return respond(res,200,{authenticated:true,
          role:session.is_admin?"admin":"employee"},
          {"Set-Cookie":buildNativeSessionCookie(session.token,session.expiresAt)})
      }
      if(pathname===prefix+"/me"&&method==="GET"){
        const token=nativeSessionToken(req)
        if(!token)abort(401,"session_required")
        const profile=await auth.getSessionProfile(token)
        if(!profile)abort(401,"session_required")
        return respond(res,200,{authenticated:true,user:publicProfile(profile)})
      }
      if(pathname===prefix+"/capabilities"&&method==="GET"){
        const token=nativeSessionToken(req)
        if(!token)abort(401,"session_required")
        const profile=await auth.getSessionProfile(token)
        if(!profile)abort(401,"session_required")
        // Authenticated, server-derived config capability only. Never expose
        // passwords, raw role grants, runtime UAT markers, or task controls.
        return respond(res,200,{
          mode:"native_pg18",
          config_writes_enabled:allowConfigurationWrites===true,
          ...(allowAgentCollaboration===true?{agent_collaboration_available:true}:{}),
          model_probe_enabled:allowConfigurationWrites===true&&allowModelProbe===true,
          ...(allowConfigurationWrites===true&&allowMcpDiscovery===true?{mcp_discovery_enabled:true}:{}),
          ...(allowConfigurationWrites===true&&allowMcpToolExecution===true?{mcp_tool_runs_enabled:true}:{}),
          ...(allowConfigurationWrites===true&&allowSmitheryManagement===true?{smithery_management_enabled:true}:{}),
          ...(allowConfigurationWrites===true&&allowKnowledgeSharing===true?{knowledge_sharing_enabled:true}:{}),
          ...(allowConfigurationWrites===true&&allowKnowledgeSharing===true&&allowKnowledgeEmbeddingSettings===true?{knowledge_embedding_settings_enabled:true}:{}),
          ...(allowConfigurationWrites===true&&allowKnowledgeSharing===true&&allowKnowledgeEmbeddingSettings===true&&allowKnowledgeEmbeddingConsent===true?{knowledge_embedding_consent_enabled:true}:{}),
          ...(allowConfigurationWrites===true&&allowKnowledgeSharing===true&&allowKnowledgeEmbeddingSettings===true&&allowKnowledgeEmbeddingConsent===true&&allowKnowledgeIndexRuntime===true?{knowledge_index_runtime_enabled:true}:{}),
          ...(allowConfigurationWrites===true&&allowKnowledgeSharing===true&&allowKnowledgeEmbeddingSettings===true&&allowKnowledgeEmbeddingConsent===true&&allowKnowledgeQueryRuntime===true?{knowledge_query_runtime_enabled:true}:{}),
          ...(allowConfigurationWrites===true&&allowKnowledgeSharing===true&&allowKnowledgeEmbeddingSettings===true&&allowKnowledgeEmbeddingConsent===true&&allowKnowledgeQueryRuntime===true&&allowKnowledgeToolExecution===true?{knowledge_tool_runtime_enabled:true}:{}),
          workflow_validation_enabled:allowConfigurationWrites===true&&allowWorkflowValidation===true,
          workflow_execution_enabled:allowConfigurationWrites===true&&allowWorkflowExecution===true,
          ...(allowConfigurationWrites===true&&allowAutonomousAgentSubmission===true?{autonomous_agent_submission_enabled:true}:{}),
          ...(allowConfigurationWrites===true&&allowWorkflowV2Submission===true
            ?{workflow_v2_submission_enabled:true}:{}),
          ...(allowConfigurationWrites===true&&allowWorkflowV2Submission===true&&allowAutonomousAgentSubmission===true&&allowScheduleRuntime===true
            ?{schedule_execution_enabled:true}:{}),
          run_submission_enabled:allowConfigurationWrites===true&&allowRunSubmission===true,
          bound_model_runs_enabled:allowConfigurationWrites===true&&allowRunSubmission===true&&allowBoundRunSubmission===true,
          run_execution_enabled:false,
        })
      }
      if(pathname===prefix+"/logout"&&method==="POST"){
        const token=nativeSessionToken(req)
        if(token)await auth.revokeSession(token)
        return respond(res,200,{ok:true},
          {"Set-Cookie":clearNativeSessionCookie()})
      }
      if(pathname===prefix+"/employees"&&method==="GET"){
        const token=nativeSessionToken(req)
        if(!token)abort(401,"session_required")
        const profile=await auth.getSessionProfile(token)
        if(!profile)abort(401,"session_required")
        if(!profile.is_admin)abort(403,"admin_required")
        if(typeof auth.listEmployees!=="function")
          abort(503,"employee_inventory_unavailable")
        const url=new URL(req.url||"/","http://127.0.0.1")
        const raw=url.searchParams.get("limit")
        const limit=raw===null?50:Number(raw)
        if(!Number.isSafeInteger(limit)||limit<1||limit>100)
          abort(400,"invalid_employee_limit")
        const items=await auth.listEmployees(token,limit)
        return respond(res,200,{items,scope:"admin_employee_inventory"})
      }
      if(pathname===prefix+"/employees"&&method==="POST"){
        if(!allowEmployeeProvisioning)abort(403,"employee_provisioning_disabled")
        const token=nativeSessionToken(req)
        if(!token)abort(401,"session_required")
        const profile=await auth.getSessionProfile(token)
        if(!profile)abort(401,"session_required")
        if(!profile.is_admin)abort(403,"admin_required")
        const body=await readJson(req)
        exactKeys(body,["email","password","display_name"])
        let employee
        try{
          employee=await auth.provisionEmployee(token,body)
        }catch(err){
          if(err?.code==="23505")abort(409,"employee_already_exists")
          if(err?.message==="admin_session_required")
            abort(403,"admin_required")
          if(["invalid_employee_display_name","invalid_employee_password",
               "invalid_employee_email"].includes(err?.message))
            abort(400,"invalid_employee_input")
          throw err
        }
        return respond(res,201,{user:publicProfile(employee)})
      }
      abort(404,"route_not_found")
    }catch(error){
      const status=Number.isInteger(error?.status)&&error.status>=400&&
        error.status<=499?error.status:503
      const code=status===503?"auth_service_unavailable":error.message
      respond(res,status,{error:code})
    }
  }
  return {handler,authenticateRequest}
}
