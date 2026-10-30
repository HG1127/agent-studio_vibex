import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import {stripTypeScriptTypes} from "node:module"
import {createPgEmployeeSession,PgNativeSessionError} from "../src/lib/pgNativeSession.ts"
import {createStudioPgAuthAdapter} from "../src/lib/studioPgAuthAdapter.ts"

const raw=fs.readFileSync(new URL("../src/lib/studioAuth.ts",import.meta.url),"utf8")
const stripped=stripTypeScriptTypes(raw).replace(/^import[^\r\n]*[\r\n]+/gm,"").replace(/^export /gm,"")
const names=["vibexAuthHeaders","decodeRhToken","verifyStudioSession","getStudioAccountInfo","fetchStudioAccountInfo","logoutStudioAccount","shouldCheckStudioSession","readStudioLoginSetup","initializeStudioAdmin","signInStudioAccount","studioLoginErrorMessage","redirectToRhLogin"]
const employee={id:"f53bdb1a-c053-48b5-acf0-2381dfe8ae03",email:"employee@example.test",display_name:"Employee",is_admin:false,share_enabled:true}
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body})
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
function load(mode="native_pg",fetch=async()=>response(401,{error:"session_required"})){
  const events=[],redirects=[],alerts=[]
  const authStore={isValid:true,token:"pb-test-only",record:{id:"pb-test-id",email:"pb@example.test",display_name:"PB",role:"admin",active:true,share_enabled:false},clear(){events.push("pb.clear");this.isValid=false;this.token="";this.record=null}}
  const pb={authStore,collection(name){events.push(["pb.collection",name]);return {
    authRefresh:async options=>{events.push(["pb.refresh",options]);return {record:authStore.record}},
    authWithPassword:async(email,password)=>{events.push(["pb.signIn",email,password])},
  }}}
  const window={location:{pathname:"/agent-run",search:"?id=test",assign:p=>redirects.push(p)},alert:m=>alerts.push(m)}
  const api=vm.runInNewContext("(()=>{\n"+stripped+"\nreturn {"+names.join(",")+"}})()",{
    pb,fetch,window,Error,Promise,createPgEmployeeSession,PgNativeSessionError,createStudioPgAuthAdapter,
    ORIGINAL_PG_UI_ENABLED:mode==="native_pg",
    getStudioBackend:()=>mode,getStudioApiRoot:()=>mode==="native_pg"?"/__pg_native":"/__pb",
  },{timeout:1000})
  return {api,events,redirects,alerts,authStore,pb}
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}

test("PG does not accept an existing PB account or forward its token",async()=>{
  const calls=[]
  const {api,events}=load("native_pg",async(url,options)=>{calls.push({url,options});return response(401,{error:"session_required"})})
  assert.equal(api.shouldCheckStudioSession(),true)
  assert.equal(await api.verifyStudioSession(),"signed_out")
  assert.equal(api.getStudioAccountInfo(),null);assert.equal(api.decodeRhToken(),null)
  assert.equal(Object.keys(api.vibexAuthHeaders()).length,0)
  assert.deepEqual(events,[])
  assert.equal(calls[0].url,"/__pg_native/api/native-auth/me")
  assert.equal(calls[0].options.credentials,"same-origin")
  assert.equal(calls[0].options.headers.Authorization,undefined)
})

test("original login and account facade use Cookie login then verified PG /me",async()=>{
  const calls=[]
  const {api,events}=load("native_pg",async(url,options)=>{
    calls.push({url,options})
    return url.endsWith("/login")?response(200,{authenticated:true,role:"admin"}):response(200,{authenticated:true,user:employee})
  })
  await api.signInStudioAccount(employee.email,"test-password")
  assert.deepEqual(calls.map(c=>c.url),["/__pg_native/api/native-auth/login","/__pg_native/api/native-auth/me"])
  assert.equal(calls[0].options.headers["X-AgentStudio-Request"],"1")
  assert.equal(api.getStudioAccountInfo().role,"employee")
  assert.equal(api.getStudioAccountInfo().share_enabled,true)
  assert.equal((await api.fetchStudioAccountInfo()).id,employee.id)
  assert.equal(api.decodeRhToken().sub,employee.id)
  assert.deepEqual(events,[])
})

test("PG normal-login readiness never queries or permits PB bootstrap",async()=>{
  const calls=[]
  const {api,events}=load("native_pg",async(url)=>{calls.push(url);return response(401,{error:"session_required"})})
  const status=await api.verifyStudioSession()
  const setup=await api.readStudioLoginSetup(status)
  assert.equal(setup.initialized,true);assert.equal(setup.can_setup,false)
  assert.deepEqual(calls,["/__pg_native/api/native-auth/me"])
  await assert.rejects(api.initializeStudioAdmin({email:"test@example.test",password:"test",display_name:"Test",setup_key:"test"}),/运维流程/)
  assert.deepEqual(calls,["/__pg_native/api/native-auth/me"]);assert.deepEqual(events,[])
})

test("PG transport or origin failure blocks readiness without PB fallback",async()=>{
  for(const result of [()=>{throw Error("mock network failure")},()=>response(403,{error:"origin_not_allowed"}),()=>response(503,{error:"native_origin_unavailable"})]){
    const {api,events,authStore}=load("native_pg",async()=>result())
    assert.equal(await api.verifyStudioSession(),"unavailable")
    await assert.rejects(api.readStudioLoginSetup(),/studio_status_unavailable/)
    assert.equal(authStore.isValid,true);assert.equal(api.getStudioAccountInfo(),null);assert.deepEqual(events,[])
  }
})

test("logout button waits for native acknowledgement before navigating",async()=>{
  const gate=deferred(),calls=[]
  const {api,redirects,events}=load("native_pg",async(url,options)=>{calls.push({url,options});return gate.promise})
  const signedOut=api.logoutStudioAccount();let acknowledged=false
  signedOut.then(()=>{acknowledged=true})
  await flush();assert.equal(redirects.length,0)
  assert.equal(acknowledged,false)
  assert.equal(calls[0].url,"/__pg_native/api/native-auth/logout")
  assert.equal(calls[0].options.headers["X-AgentStudio-Request"],"1")
  gate.resolve(response(200,{ok:true}));await signedOut
  assert.equal(acknowledged,true)
  assert.deepEqual(redirects,["/login"]);assert.deepEqual(events,[])
})

test("failed native logout does not navigate or silently use PB logout",async()=>{
  const {api,redirects,alerts,events}=load("native_pg",async()=>{throw Error("mock network failure")})
  await assert.rejects(api.logoutStudioAccount())
  assert.deepEqual(redirects,[]);assert.equal(alerts.length,0)
  assert.deepEqual(events,[])
})

test("PB default retains original SDK login, independent status and logout",async()=>{
  const calls=[]
  const {api,events,redirects}=load("pocketbase",async(url,options)=>{calls.push({url,options});return response(200,{initialized:true,can_setup:false})})
  assert.equal(api.vibexAuthHeaders().Authorization,"pb-test-only")
  assert.equal(api.decodeRhToken().sub,"pb-test-id")
  assert.equal(await api.verifyStudioSession(),"authenticated")
  await api.signInStudioAccount(" pb@example.test ","test-password")
  assert.ok(events.some(e=>Array.isArray(e)&&e[0]==="pb.signIn"&&e[1]==="pb@example.test"))
  const setup=await api.readStudioLoginSetup();assert.equal(setup.initialized,true)
  assert.deepEqual(calls.map(c=>c.url),["/__pb/api/studio/bootstrap/status"])
  const signedOut=api.logoutStudioAccount();assert.deepEqual(redirects,["/login"])
  await signedOut
  assert.ok(events.includes("pb.clear"))
})

test("PB initialization stays on its original endpoint with its setup key",async()=>{
  const calls=[]
  const {api}=load("pocketbase",async(url,options)=>{calls.push({url,options});return response(200,{ok:true})})
  await api.initializeStudioAdmin({email:"pb@example.test",password:"test-password",display_name:"PB",setup_key:"test-setup-key"})
  assert.equal(calls[0].url,"/__pb/api/studio/bootstrap")
  assert.equal(calls[0].options.headers["X-Agent-Studio-Setup-Key"],"test-setup-key")
  assert.deepEqual(JSON.parse(calls[0].options.body),{email:"pb@example.test",password:"test-password",display_name:"PB"})
})

test("bounded native error classes map to existing login error display",()=>{
  const {api}=load()
  assert.match(api.studioLoginErrorMessage(new PgNativeSessionError(401,"invalid_employee_credentials")),/检查邮箱/)
  assert.match(api.studioLoginErrorMessage(new PgNativeSessionError(429,"login_rate_limited")),/过于频繁/)
  assert.match(api.studioLoginErrorMessage(new PgNativeSessionError(0,"pg_native_connection_unavailable")),/账号服务/)
  assert.match(api.studioLoginErrorMessage(new PgNativeSessionError(403,"origin_not_allowed")),/账号服务/)
  assert.equal(api.studioLoginErrorMessage(new Error("初始化失败，请核对初始化密钥、邮箱和密码。")),"初始化失败，请核对初始化密钥、邮箱和密码。")
})

test("PB guard refresh coalesces and temporary failures preserve its token",async()=>{
  const gate=deferred(),ctx=load("pocketbase")
  let calls=0
  ctx.pb.collection=()=>({authRefresh:options=>{calls++;assert.equal(options.requestKey,null);return gate.promise}})
  const first=ctx.api.verifyStudioSession(),second=ctx.api.verifyStudioSession()
  assert.equal(first,second);assert.equal(calls,1)
  gate.resolve({record:ctx.authStore.record});assert.equal(await first,"authenticated")
  ctx.pb.collection=()=>({authRefresh:async()=>{throw {status:503}}})
  assert.equal(await ctx.api.verifyStudioSession(),"unavailable")
  assert.equal(ctx.authStore.token,"pb-test-only");assert.equal(ctx.authStore.isValid,true)
})

test("a verified PB rejection or disabled employee clears the default session",async()=>{
  const rejected=load("pocketbase")
  rejected.pb.collection=()=>({authRefresh:async()=>{throw {status:401}}})
  assert.equal(await rejected.api.verifyStudioSession(),"signed_out")
  assert.equal(rejected.authStore.isValid,false)
  const disabled=load("pocketbase")
  disabled.authStore.record.active=false
  assert.equal(await disabled.api.verifyStudioSession(),"signed_out")
  assert.equal(disabled.authStore.isValid,false)
})

test("isolated-build backend selection has no dependency on DEV or PB imports",()=>{
  const source=fs.readFileSync(new URL("../src/lib/studioBackend.ts",import.meta.url),"utf8")
  assert.doesNotMatch(source,/import\.meta\.env\??\.DEV|from\s*["'][^"']*\/pb["']/)
  const js=stripTypeScriptTypes(source).replace(/^import[^\r\n]*[\r\n]+/gm,"").replace(/^export /gm,"")
  for(const [flag,expected] of [[undefined,"pocketbase"],["true","native_pg"],[true,"pocketbase"],["false","pocketbase"]]){
    const code=js.replaceAll("import.meta.env",JSON.stringify({VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED:flag,DEV:false}))
    const api=vm.runInNewContext("(()=>{"+code+";return {getStudioBackend,getStudioApiRoot,getStudioBasename,ORIGINAL_PG_UI_ENABLED}})()")
    assert.equal(api.getStudioBackend(),expected)
    assert.equal(api.ORIGINAL_PG_UI_ENABLED,expected==="native_pg")
    assert.equal(api.getStudioApiRoot(),expected==="native_pg"?"/__pg_native":"/__pb")
    assert.equal(api.getStudioBasename(),"/")
  }
})
