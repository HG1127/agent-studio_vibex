import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:http"
import {once} from "node:events"
import {createNativeAuthHttpHandler,NativeLoginLimiter,
  nativeSessionToken} from "../src/native-auth-http.mjs"
import {generateOpaqueSession} from "../src/native-employee-auth.mjs"
import {createHandler} from "../src/http.ts"

const origin="http://localhost:7403"
function authStub(){
  const sessions=new Map()
  const calls={verified:[],employees:[]}
  return {
    calls,
    async login(email,password){
      if(password!=="correct-password-1234")throw Error("invalid_employee_credentials")
      const session=generateOpaqueSession()
      const subject=email.startsWith("admin")?"administrator":"staff"
      sessions.set(session.token,{id:subject,email,display_name:subject,
        is_admin:subject==="administrator",
        identity:{issuer:"urn:agentstudio:local:v1",subject}})
      return {token:session.token,expiresAt:new Date(Date.now()+600000),
        is_admin:subject==="administrator"}
    },
    async getSessionProfile(token){return sessions.get(token)||null},
    async verifySession(token){
      const p=sessions.get(token)
      if(!p)return null
      calls.verified.push(p.identity)
      return p.identity
    },
    async revokeSession(token){return sessions.delete(token)},
    async provisionEmployee(token,data){
      const p=sessions.get(token)
      if(!p?.is_admin)throw Error("admin_session_required")
      calls.employees.push(data)
      return {id:"33",email:data.email,display_name:data.display_name,is_admin:false}
    },
  }
}
async function listen(handler){
  const server=createServer(handler)
  server.listen(0,"127.0.0.1")
  await once(server,"listening")
  const port=server.address().port
  return {server,base:`http://127.0.0.1:${port}`}
}
async function request(base,route,{method="GET",cookie,originHeader,csrf=false,
    data,spoofUser,bearer}={}){
  const headers={...(cookie?{Cookie:cookie}:{}),
    ...(originHeader?{Origin:originHeader}:{}),
    ...(csrf?{"X-AgentStudio-Request":"1"}:{}),
    ...(spoofUser?{"X-Rh-User-Id":spoofUser}:{}),
    ...(bearer?{Authorization:"Bearer "+bearer}:{}),
    ...(data?{"Content-Type":"application/json"}:{})}
  const res=await fetch(base+route,{
    method,headers,redirect:"manual",cache:"no-store",
    ...(data?{body:JSON.stringify(data)}:{})
  })
  return {status:res.status,data:await res.json(),
    setCookie:res.headers.get("set-cookie")}
}
test("native HTTP login, business identity bridge, admin provisioning and logout",async()=>{
  const auth=authStub()
  let businessHandler=()=>{}
  const native=createNativeAuthHttpHandler({
    auth,allowedOrigin:origin,
    businessHandler:(req,res)=>businessHandler(req,res),
  })
  businessHandler=createHandler({
    allowedOrigin:origin,
    verifyToken:async()=>{throw Error("OIDC bearer must not be accepted")},
    authenticateRequest:native.authenticateRequest,
    repository:{
      async list(identity){return [{id:"verified-user",name:identity.subject}]},
    },
  })
  const {server,base}=await listen(native.handler)
  try{
    assert.equal((await request(base,"/healthz")).status,200)
    const bogus=await request(base,"/api/v2/agent-specs",{
      spoofUser:"forged-admin",bearer:"a.b.c"})
    assert.equal(bogus.status,401)
    const noOrigin=await request(base,"/api/native-auth/login",{method:"POST",
      csrf:true,data:{email:"staff@example.com",password:"correct-password-1234"}})
    assert.equal(noOrigin.status,403)
    const crossSite=await request(base,"/api/native-auth/login",{method:"POST",
      csrf:true,originHeader:"https://evil.example",
      data:{email:"staff@example.com",password:"correct-password-1234"}})
    assert.equal(crossSite.status,403)
    const staff=await request(base,"/api/native-auth/login",{method:"POST",
      csrf:true,originHeader:origin,
      data:{email:"staff@example.com",password:"correct-password-1234"}})
    assert.equal(staff.status,200)
    assert.equal(staff.data.authenticated,true)
    assert.equal(staff.data.role,"employee")
    assert.match(staff.setCookie,/__Host-agentstudio_session=/)
    assert.match(staff.setCookie,/Secure; HttpOnly; SameSite=Strict/)
    assert.equal(JSON.stringify(staff.data).includes("session"),false)
    const cookie=staff.setCookie.split(";")[0]
    const me=await request(base,"/api/native-auth/me",{cookie})
    assert.equal(me.status,200)
    assert.equal(me.data.user.email,"staff@example.com")
    const list=await request(base,"/api/v2/agent-specs",{
      cookie,spoofUser:"malicious-admin",bearer:undefined})
    assert.equal(list.status,200)
    assert.equal(list.data.items[0].name,"staff")
    assert.equal(auth.calls.verified[0].subject,"staff")
    const spoof=await request(base,"/api/v2/agent-specs",{cookie,
      bearer:"forged.jwt.token"})
    assert.equal(spoof.status,401)
    const notAdmin=await request(base,"/api/native-auth/employees",{
      method:"POST",cookie,csrf:true,originHeader:origin,
      data:{email:"new@example.com",password:"good-password-12345",display_name:"New"}})
    assert.equal(notAdmin.status,403)
    const invalidLogout=await request(base,"/api/native-auth/logout",{
      method:"POST",cookie,csrf:true,originHeader:"https://evil.example"})
    assert.equal(invalidLogout.status,403)
    const logout=await request(base,"/api/native-auth/logout",{
      method:"POST",cookie,csrf:true,originHeader:origin})
    assert.equal(logout.status,200)
    assert.match(logout.setCookie,/Max-Age=0/)
    assert.equal((await request(base,"/api/native-auth/me",{cookie})).status,401)
    const admin=await request(base,"/api/native-auth/login",{method:"POST",
      csrf:true,originHeader:origin,
      data:{email:"admin@example.com",password:"correct-password-1234"}})
    assert.equal(admin.status,200)
    const adminCookie=admin.setCookie.split(";")[0]
    const created=await request(base,"/api/native-auth/employees",{
      method:"POST",cookie:adminCookie,csrf:true,originHeader:origin,
      data:{email:"new@example.com",password:"good-password-12345",display_name:"New"}})
    assert.equal(created.status,201)
    assert.equal(created.data.user.email,"new@example.com")
    assert.equal(auth.calls.employees.length,1)
  }finally{await new Promise(resolve=>server.close(resolve))}
})
test("Native capabilities are authenticated and never browser-controlled",async()=>{
  const native=createNativeAuthHttpHandler({
    auth:authStub(),allowedOrigin:origin,
    allowConfigurationWrites:true,allowEmployeeProvisioning:false,
    businessHandler:(req,res)=>{
      res.writeHead(405,{"Content-Type":"application/json"})
      res.end(JSON.stringify({error:"pilot_business_writes_disabled"}))
    }
  })
  const {server,base}=await listen(native.handler)
  try{
    assert.equal((await request(base,"/api/native-auth/capabilities")).status,401)
    const signedIn=await request(base,"/api/native-auth/login",{
      method:"POST",csrf:true,originHeader:origin,
      data:{email:"staff@example.com",password:"correct-password-1234"}
    })
    const cookie=signedIn.setCookie.split(";")[0]
    const capabilities=await request(base,"/api/native-auth/capabilities",{cookie,
      spoofUser:"forged-admin"})
    assert.equal(capabilities.status,200)
    assert.deepEqual(capabilities.data,{
      mode:"native_pg18",config_writes_enabled:true,run_execution_enabled:false
    })
    assert.equal((await request(base,"/api/native-auth/capabilities",{
      cookie,bearer:"forged.jwt.token"})).status,401)
    await request(base,"/api/native-auth/logout",{cookie,method:"POST",
      originHeader:origin,csrf:true,data:{}})
    assert.equal((await request(base,"/api/native-auth/capabilities",{cookie})).status,401)
  }finally{await new Promise(resolve=>server.close(resolve))}
})
test("Native capabilities default to read-only even after login",async()=>{
  const native=createNativeAuthHttpHandler({
    auth:authStub(),allowedOrigin:origin,
    businessHandler:(req,res)=>{
      res.writeHead(404,{"Content-Type":"application/json"})
      res.end(JSON.stringify({error:"not_found"}))
    }
  })
  const {server,base}=await listen(native.handler)
  try{
    const login=await request(base,"/api/native-auth/login",{
      method:"POST",csrf:true,originHeader:origin,
      data:{email:"admin@example.com",password:"correct-password-1234"}
    })
    const cookie=login.setCookie.split(";")[0]
    const capabilities=await request(base,"/api/native-auth/capabilities",{cookie})
    assert.equal(capabilities.status,200)
    assert.equal(capabilities.data.config_writes_enabled,false)
    assert.equal(capabilities.data.run_execution_enabled,false)
  }finally{await new Promise(resolve=>server.close(resolve))}
})
test("native session cookie parser rejects duplicate and malformed tokens",()=>{
  const token=generateOpaqueSession().token
  assert.equal(nativeSessionToken({headers:{cookie:
    "__Host-agentstudio_session="+token}}),token)
  assert.equal(nativeSessionToken({headers:{cookie:
    "__Host-agentstudio_session="+token+"; __Host-agentstudio_session="+token}}),null)
  assert.equal(nativeSessionToken({headers:{cookie:
    "__Host-agentstudio_session=forged"}}),null)
  assert.equal(nativeSessionToken({headers:{cookie:undefined}}),null)
})

test("initial HTTPS pilot allows login/logout but denies staff creation",async()=>{
  const auth=authStub()
  const native=createNativeAuthHttpHandler({
    auth,allowedOrigin:origin,
    allowEmployeeProvisioning:false,
    businessHandler:(req,res)=>{
      if(req.method!=="GET"){
        res.writeHead(405,{"Content-Type":"application/json"})
        res.end(JSON.stringify({error:"pilot_business_writes_disabled"}))
      }else{
        res.writeHead(200,{"Content-Type":"application/json"})
        res.end(JSON.stringify({items:[]}))
      }
    }
  })
  const {server,base}=await listen(native.handler)
  try{
    const login=await request(base,"/api/native-auth/login",{
      method:"POST",csrf:true,originHeader:origin,
      data:{email:"admin@example.com",password:"correct-password-1234"}
    })
    assert.equal(login.status,200)
    const cookie=login.setCookie.split(";")[0]
    assert.equal((await request(base,"/api/native-auth/me",{cookie})).status,200)
    const employee=await request(base,"/api/native-auth/employees",{
      method:"POST",csrf:true,originHeader:origin,cookie,
      data:{email:"staff@example.com",password:"Password-For-Test12345",display_name:"Staff"}
    })
    assert.equal(employee.status,403)
    assert.equal(employee.data.error,"employee_provisioning_disabled")
    assert.equal(auth.calls.employees.length,0)
    const update=await request(base,"/api/v2/agent-specs",{
      method:"POST",csrf:true,originHeader:origin,cookie,
      data:{name:"blocked",spec:{}}
    })
    assert.equal(update.status,405)
    assert.equal(update.data.error,"pilot_business_writes_disabled")
    const list=await request(base,"/api/v2/agent-specs",{cookie})
    assert.equal(list.status,200)
    assert.deepEqual(list.data.items,[])
    const logout=await request(base,"/api/native-auth/logout",{
      method:"POST",csrf:true,originHeader:origin,cookie,data:{}
    })
    assert.equal(logout.status,200)
    assert.equal((await request(base,"/api/native-auth/me",{cookie})).status,401)
  }finally{await new Promise(resolve=>server.close(resolve))}
})
test("native password attempt limiter has time-bound per-identity and per-IP caps",()=>{
  let clock=100000
  const limiter=new NativeLoginLimiter({now:()=>clock})
  for(let i=0;i<12;i++)limiter.admit("127.0.0.1","user@example.com")
  assert.throws(()=>limiter.admit("127.0.0.1","user@example.com"),
    /login_rate_limited/)
  clock+=60001
  assert.doesNotThrow(()=>limiter.admit("127.0.0.1","user@example.com"))
})
