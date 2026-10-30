import test from "node:test"
import assert from "node:assert/strict"
import {createStudioPgAuthAdapter, selectStudioAuthBackend}
  from "../src/lib/studioPgAuthAdapter.ts"
import {createPgEmployeeSession} from "../src/lib/pgNativeSession.ts"

const employee={id:"f53bdb1a-c053-48b5-acf0-2381dfe8ae03",email:"employee@example.test",display_name:"Employee",is_admin:false}
const admin={...employee,id:"b53bdb1a-c053-48b5-acf0-2381dfe8ae03",email:"admin@example.test",is_admin:true}
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body})
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const port=(extra={})=>({session:async()=>({status:"authenticated",profile:employee}),signIn:async()=>employee,signOut:async()=>{},...extra})

test("only the explicit isolated-build flag selects PostgreSQL",()=>{
  for(const flag of [undefined,null,false,true,"TRUE","native_pg",""," true "])
    assert.equal(selectStudioAuthBackend(flag),"pocketbase")
  assert.equal(selectStudioAuthBackend("true"),"native_pg")
})

test("original role and share fields derive from verified /me, never login role",async()=>{
  const calls=[]
  const native=createPgEmployeeSession(async(route,options)=>{
    calls.push({route,options})
    return route.endsWith("/login") ? response(200,{authenticated:true,role:"admin"}) :
      response(200,{authenticated:true,user:{...employee,share_enabled:true}})
  })
  const auth=createStudioPgAuthAdapter(native)
  assert.equal(auth.account(),null)
  const profile=await auth.signIn(employee.email,"test-password")
  assert.equal(profile.role,"employee")
  assert.equal(profile.share_enabled,true)
  assert.equal(profile.active,true)
  assert.deepEqual(auth.identity(),{sub:employee.id,nickName:"Employee"})
  assert.deepEqual(calls.map(c=>c.route),["/api/native-auth/login","/api/native-auth/me"])
  for(const {options} of calls){assert.equal(options.credentials,"same-origin");assert.equal(options.headers.Authorization,undefined)}
  assert.equal(calls[0].options.headers["X-AgentStudio-Request"],"1")
})

test("missing, false or malformed sharing never grants sharing to an admin",async()=>{
  for(const share_enabled of [undefined,false,"true",1]){
    const auth=createStudioPgAuthAdapter(port({signIn:async()=>({...admin,share_enabled})}))
    assert.equal((await auth.signIn(admin.email,"password")).role,"admin")
    assert.equal(auth.account().share_enabled,false)
  }
})

test("caller changes cannot mutate cached account or escalate its role",async()=>{
  const auth=createStudioPgAuthAdapter(port())
  const first=await auth.signIn(employee.email,"password")
  first.role="admin"
  const second=auth.account();second.id=admin.id;second.share_enabled=true
  assert.equal(auth.account().role,"employee")
  assert.equal(auth.account().share_enabled,false)
  assert.equal(auth.identity().sub,employee.id)
})

test("parallel guards share one verified read",async()=>{
  const gate=deferred();let reads=0
  const auth=createStudioPgAuthAdapter(port({session:()=>{reads++;return gate.promise}}))
  const a=auth.verify(),b=auth.verify()
  assert.equal(a,b);assert.equal(reads,1)
  gate.resolve({status:"authenticated",profile:admin})
  assert.equal(await a,"authenticated")
  assert.equal(auth.account().role,"admin")
})

test("401 clears local profile; transient failure stays unavailable and can recover",async()=>{
  let status=200
  const auth=createStudioPgAuthAdapter(createPgEmployeeSession(async()=>{
    if(status===0)throw Error("mock transport failure")
    return response(status,status===200?{authenticated:true,user:employee}:{error:"session_required"})
  }))
  assert.equal(await auth.verify(),"authenticated")
  status=0;assert.equal(await auth.verify(),"unavailable");assert.equal(auth.account(),null)
  status=200;assert.equal(await auth.verify(),"authenticated")
  status=401;assert.equal(await auth.verify(),"signed_out");assert.equal(auth.identity(),null)
})

test("stale signed-out read cannot erase a more recent successful login",async()=>{
  const gate=deferred()
  const auth=createStudioPgAuthAdapter(port({session:()=>gate.promise,signIn:async()=>admin}))
  const before=auth.verify()
  await auth.signIn(admin.email,"password")
  gate.resolve({status:"signed_out"})
  assert.equal(await before,"unavailable")
  assert.equal(auth.account().id,admin.id)
})

test("logout invalidates pending reads immediately and waits for server acknowledgement",async()=>{
  const read=deferred(),revoked=deferred()
  const auth=createStudioPgAuthAdapter(port({session:()=>read.promise,signOut:()=>revoked.promise}))
  const before=auth.verify()
  const logout=auth.signOut();let finished=false;void logout.then(()=>{finished=true})
  assert.equal(auth.account(),null);assert.equal(await auth.verify(),"unavailable")
  read.resolve({status:"authenticated",profile:admin})
  assert.equal(await before,"unavailable");assert.equal(auth.account(),null);assert.equal(finished,false)
  revoked.resolve();await logout;assert.equal(finished,true);assert.equal(auth.account(),null)
})

test("logout failure rejects, retains no apparent success and permits a retry",async()=>{
  let calls=0
  const auth=createStudioPgAuthAdapter(port({signOut:async()=>{if(++calls===1)throw Error("mock revoke failure")}}))
  await auth.signIn(employee.email,"password")
  await assert.rejects(auth.signOut(),/mock revoke failure/)
  assert.equal(auth.account(),null)
  await auth.signOut();assert.equal(calls,2)
})

test("repeated logout shares one Cookie mutation",async()=>{
  const gate=deferred();let calls=0
  const auth=createStudioPgAuthAdapter(port({signOut:()=>{calls++;return gate.promise}}))
  const a=auth.signOut(),b=auth.signOut()
  assert.equal(a,b)
  await Promise.resolve();assert.equal(calls,1)
  gate.resolve();await a
})

test("overlapping login and logout mutate the Cookie in invocation order",async()=>{
  const gate=deferred(),events=[]
  const auth=createStudioPgAuthAdapter(port({signIn:async()=>{events.push("login");await gate.promise;return employee},signOut:async()=>{events.push("logout")}}))
  const login=auth.signIn(employee.email,"password")
  const refused=assert.rejects(login,/studio_auth_operation_superseded/)
  const logout=auth.signOut()
  await Promise.resolve();assert.deepEqual(events,["login"])
  gate.resolve();await refused;await logout
  assert.deepEqual(events,["login","logout"]);assert.equal(auth.account(),null)
})

test("a failed earlier mutation does not prevent a later genuine login",async()=>{
  const events=[]
  const auth=createStudioPgAuthAdapter(port({signOut:async()=>{events.push("logout");throw Error("mock revoke failure")},signIn:async()=>{events.push("login");return employee}}))
  const failed=assert.rejects(auth.signOut(),/mock revoke failure/)
  const login=auth.signIn(employee.email,"password")
  await failed;await login
  assert.deepEqual(events,["logout","login"]);assert.equal(auth.account().id,employee.id)
})

test("logout after an intervening queued login performs its own final revoke",async()=>{
  const firstRevoke=deferred(),lastRevoke=deferred(),events=[]
  let cookiePresent=true,revokes=0,lastFinished=false
  const auth=createStudioPgAuthAdapter(port({
    session:async()=>cookiePresent?{status:"authenticated",profile:employee}:{status:"signed_out"},
    signIn:async()=>{events.push("login");cookiePresent=true;return employee},
    signOut:async()=>{
      const which=++revokes;events.push("logout"+which)
      await (which===1?firstRevoke.promise:lastRevoke.promise)
      cookiePresent=false
    },
  }))
  const out1=auth.signOut()
  const in2=auth.signIn(employee.email,"password")
  const superseded=assert.rejects(in2,/studio_auth_operation_superseded/)
  const out3=auth.signOut()
  assert.notEqual(out3,out1)
  assert.equal(auth.signOut(),out3,"adjacent final logouts still coalesce")
  void out3.then(()=>{lastFinished=true})
  await Promise.resolve();assert.deepEqual(events,["logout1"])
  firstRevoke.resolve();await out1;await superseded
  for(let i=0;i<8;i++)await Promise.resolve()
  assert.deepEqual(events,["logout1","login","logout2"])
  assert.equal(cookiePresent,true,"new login Cookie still awaits final revoke")
  assert.equal(lastFinished,false)
  lastRevoke.resolve();await out3
  assert.equal(lastFinished,true);assert.equal(cookiePresent,false)
  assert.equal(auth.account(),null);assert.equal(await auth.verify(),"signed_out")
})
