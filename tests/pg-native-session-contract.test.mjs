import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createPgEmployeeSession,PgNativeSessionError}
  from "../src/lib/pgNativeSession.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const source=readFileSync(path.join(root,"src/lib/pgNativeSession.ts"),"utf8")
const profile={
  id:"f53bdb1a-c053-48b5-acf0-2381dfe8ae03",
  email:"admin@example.com",display_name:"Admin",is_admin:true
}
const response=(status,data)=>({
  status,ok:status>=200&&status<300,json:async()=>data,
})
test("native production session adapter is PocketBase-free and cookie-only",()=>{
  assert.doesNotMatch(source,/from\s*["'][^"']*(pocketbase|lib\/pb|studioAuth)/i)
  assert.doesNotMatch(source,/\b(?:localStorage|sessionStorage|document\.cookie|Authorization|Bearer|X-Rh-User-Id)\b/)
  assert.match(source,/credentials:"same-origin"/)
  assert.match(source,/cache:"no-store"/)
  assert.match(source,/redirect:"error"/)
  assert.match(source,/X-AgentStudio-Request/)
  assert.ok(source.includes("/api/native-auth/login"))
})
test("secure sign-in verifies PostgreSQL session and sends no bearer tokens",async()=>{
  const calls=[]
  const transport=async(url,options)=>{
    calls.push({url,options})
    if(url==="/api/native-auth/login")
      return response(200,{authenticated:true,role:"admin"})
    if(url==="/api/native-auth/me")
      return response(200,{authenticated:true,user:profile})
    throw Error("unknown route")
  }
  const auth=createPgEmployeeSession(transport)
  const result=await auth.signIn(" admin@example.com ","Secret-passphrase-123")
  assert.deepEqual(result,profile)
  assert.deepEqual(calls.map(c=>c.url),
    ["/api/native-auth/login","/api/native-auth/me"])
  assert.equal(JSON.parse(calls[0].options.body).email,"admin@example.com")
  assert.equal(calls[0].options.headers["X-AgentStudio-Request"],"1")
  assert.ok(calls.every(c=>c.options.credentials==="same-origin"))
  assert.ok(calls.every(c=>!Object.hasOwn(c.options.headers,"Authorization")))
  assert.ok(calls.every(c=>!Object.hasOwn(c.options.headers,"X-Rh-User-Id")))
  assert.deepEqual(await auth.session(),{status:"authenticated",profile})
})
test("auth API 401 signs out; server downtime leaves session unavailable",async()=>{
  const missing=createPgEmployeeSession(
    async()=>response(401,{error:"session_required"}))
  assert.deepEqual(await missing.session(),{status:"signed_out"})
  const unavailable=createPgEmployeeSession(async()=>{throw Error("ECONNRESET")})
  assert.deepEqual(await unavailable.session(),{status:"unavailable"})
  await assert.rejects(unavailable.signIn("admin@example.com","secret"),
    e=>e instanceof PgNativeSessionError&&e.status===0)
})
test("logout requires confirmed server response and cannot reuse old profile",async()=>{
  let logged=true
  const calls=[]
  const adapter=createPgEmployeeSession(async(url,opt)=>{
    calls.push({url,method:opt.method})
    if(url==="/api/native-auth/me")
      return logged?response(200,{authenticated:true,user:profile}):
        response(401,{error:"session_required"})
    if(url==="/api/native-auth/logout"){
      logged=false
      return response(200,{ok:true})
    }
    throw Error("not expected")
  })
  assert.equal((await adapter.session()).status,"authenticated")
  await adapter.signOut()
  assert.deepEqual(await adapter.session(),{status:"signed_out"})
  assert.deepEqual(calls.map(x=>x.method),["GET","POST","GET"])
})
test("profile and malformed login inputs fail closed",async()=>{
  const bad=createPgEmployeeSession(async()=>response(200,{
    authenticated:true,user:{id:"forged",email:"bad",is_admin:"yes"}
  }))
  assert.deepEqual(await bad.session(),{status:"unavailable"})
  let calls=0
  const adapter=createPgEmployeeSession(async()=>{calls++;return response(200,{})})
  await assert.rejects(adapter.signIn("","bad"),e=>e.status===400)
  await assert.rejects(adapter.signIn("staff@example.com",""),e=>e.status===400)
  assert.equal(calls,0)
})
test("concurrent session checks coalesce and a stale result cannot survive re-login",async()=>{
  let resolveMe
  let count=0
  const deferred=new Promise(r=>{resolveMe=r})
  const auth=createPgEmployeeSession(async(route)=>{
    if(route==="/api/native-auth/me"){
      count++
      if(count===1)return deferred
      return response(200,{authenticated:true,user:profile})
    }
    if(route==="/api/native-auth/login")return response(200,{authenticated:true})
    throw Error("not expected")
  })
  const first=auth.session()
  const second=auth.session()
  await Promise.resolve()
  assert.equal(count,1)
  const login=auth.signIn(profile.email,"password")
  resolveMe(response(200,{authenticated:true,user:profile}))
  assert.equal((await first).status,"unavailable")
  assert.equal((await second).status,"unavailable")
  assert.deepEqual(await login,profile)
})
