import test from "node:test"
import assert from "node:assert/strict"
import {StudioAuthStore,STUDIO_AUTH_KEY,readLoginPreferences,saveLoginPreferences} from "../src/lib/studioAuthStore.ts"
import {passwordInputError,passwordAdvice,safeLoginReturn,accountError} from "../src/lib/accountUx.ts"
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,v)=>data.set(key,v),removeItem:key=>data.delete(key),data}}
const profile={id:"abcdefghijklmno",collectionId:"studio-users",collectionName:"studio_users",email:"test@example.test",role:"employee",active:true,password:"MUST_NOT_BE_STORED",tokenKey:"PRIVATE_SERVER_FIELD"}
test("password length is advice, not a 12-character gate; blanks and abusive size still rejected",()=>{
 for(const value of ["a","123","短密码","a long unique passphrase"])assert.equal(passwordInputError(value),"")
 assert.ok(passwordInputError(" "));assert.ok(passwordInputError("x".repeat(129)))
 assert.equal(passwordAdvice("123456").level,1)
 assert.ok(passwordAdvice("long-phrase-for-this-account").level>=2)
})
test("new sessions default to tab storage, never persist password or private user fields",()=>{
 const local=memory(),session=memory(),store=new StudioAuthStore(local,session)
 store.save("issued-token",profile)
 assert.equal(local.getItem(STUDIO_AUTH_KEY),null)
 assert.equal(JSON.parse(session.getItem(STUDIO_AUTH_KEY)).record.id,profile.id)
 assert.doesNotMatch(session.getItem(STUDIO_AUTH_KEY),/MUST_NOT|PRIVATE_SERVER|password|tokenKey/)
 assert.equal(new StudioAuthStore(local,session).token,"issued-token")
 assert.equal(new StudioAuthStore(local,memory()).token,"")
})
test("keep-signed-in selection migrates only public session data and logout clears both stores",()=>{
 const local=memory(),session=memory(),store=new StudioAuthStore(local,session)
 store.setPersistence(true);store.save("persistent-token",profile)
 assert.ok(local.getItem(STUDIO_AUTH_KEY));assert.equal(session.getItem(STUDIO_AUTH_KEY),null)
 assert.equal(new StudioAuthStore(local,memory()).token,"persistent-token")
 store.setPersistence(false)
 assert.equal(local.getItem(STUDIO_AUTH_KEY),null);assert.ok(session.getItem(STUDIO_AUTH_KEY))
 store.clear();assert.equal(local.getItem(STUDIO_AUTH_KEY),null);assert.equal(session.getItem(STUDIO_AUTH_KEY),null)
 assert.equal(store.token,"")
})
test("account preferences exclude passwords and can be explicitly forgotten",()=>{
 const local=memory()
 saveLoginPreferences("person@example.test",true,false,local)
 assert.deepEqual(readLoginPreferences(local),{email:"person@example.test",rememberAccount:true,rememberLogin:false})
 saveLoginPreferences("person@example.test",false,true,local)
 assert.equal(readLoginPreferences(local).email,"")
 saveLoginPreferences("person@example.test",false,false,local)
 assert.equal(local.data.size,0)
})
test("blocked browser storage degrades to memory rather than losing a successful sign-in",()=>{
 const blocked={getItem(){throw Error("blocked")},setItem(){throw Error("blocked")},removeItem(){throw Error("blocked")}}
 const store=new StudioAuthStore(blocked,blocked)
 store.save("memory-token",profile);assert.equal(store.token,"memory-token")
 assert.doesNotThrow(()=>store.clear())
})
test("login return paths cannot redirect credentials into an external origin",()=>{
 for(const value of ["https://evil.test","//evil.test","/\\evil.test","/login?next=/","javascript:alert(1)",null])assert.equal(safeLoginReturn(value),"/")
 assert.equal(safeLoginReturn("/agent-run?run=abc#results"),"/agent-run?run=abc#results")
 assert.match(accountError(Error("email_already_used")),/邮箱/)
 assert.match(accountError(Error("employee_changed")),/刷新/)
})
