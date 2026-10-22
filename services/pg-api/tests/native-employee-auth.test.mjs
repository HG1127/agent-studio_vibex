import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizeEmployeeEmail,validateEmployeePassword,
  hashEmployeePassword,verifyEmployeePassword,
  generateOpaqueSession,hashOpaqueSession,
  buildNativeSessionCookie,clearNativeSessionCookie,
  NATIVE_LOCAL_ISSUER,NATIVE_SESSION_COOKIE,
} from "../src/native-employee-auth.mjs"

test("native local identity is distinct from PocketBase/OIDC namespaces",()=>{
  assert.equal(NATIVE_LOCAL_ISSUER,"urn:agentstudio:local:v1")
  assert.equal(NATIVE_SESSION_COOKIE,"__Host-agentstudio_session")
  assert.equal(normalizeEmployeeEmail("  Staff@Example.COM "),"staff@example.com")
  for(const email of ["","someone","admin@example..com","space name@example.com",
    "@example.com","admin@evil.test/path","admin\n@example.com"])
    assert.throws(()=>normalizeEmployeeEmail(email),/invalid_employee_email/,email)
})
test("password hashing is salted, slow KDF-verified and rejects wrong passwords",async()=>{
  const password="Correct-Login-Passphrase-2026!"
  assert.equal(validateEmployeePassword(password),password)
  const a=await hashEmployeePassword(password)
  const b=await hashEmployeePassword(password)
  assert.notEqual(a,b)
  assert.match(a,/^scrypt\$v1\$32768\$8\$1\$/)
  assert.equal(await verifyEmployeePassword(password,a),true)
  assert.equal(await verifyEmployeePassword(password,b),true)
  assert.equal(await verifyEmployeePassword("wrong password",a),false)
  assert.equal(await verifyEmployeePassword(password,"unsupported_hash"),false)
  assert.equal(await verifyEmployeePassword(password,null),false)
  assert.equal(await verifyEmployeePassword(password,a.replace("32768","1073741824")),false)
  assert.equal(await verifyEmployeePassword("",a),false)
})
test("password input validation bounds work and supports valid unicode",async()=>{
  for(const value of ["", "short", "             ", "line\nbreak",
      "a\0b", "z".repeat(257), "p".repeat(5)+"\r"+"q".repeat(9)]){
    assert.throws(()=>validateEmployeePassword(value),/invalid_employee_password/)
  }
  const unicode="更安全的企业内部登录密码2026"
  assert.equal(validateEmployeePassword(unicode),unicode)
  const hash=await hashEmployeePassword(unicode)
  assert.equal(await verifyEmployeePassword(unicode,hash),true)
})
test("opaque sessions use random 256-bit tokens and only store digest",()=>{
  const a=generateOpaqueSession()
  const b=generateOpaqueSession()
  assert.notEqual(a.token,b.token)
  assert.equal(a.token.length,43)
  assert.ok(Buffer.isBuffer(a.digest))
  assert.equal(a.digest.length,32)
  assert.equal(hashOpaqueSession(a.token).equals(a.digest),true)
  assert.equal(hashOpaqueSession(b.token).equals(a.digest),false)
  for(const token of ["","abc","A".repeat(42),"_".repeat(42)+"/"])
    assert.throws(()=>hashOpaqueSession(token),/invalid_session_token/)
})
test("session cookie is host-scoped, HTTPS only, HttpOnly and Strict",()=>{
  const {token}=generateOpaqueSession()
  const expiry=new Date(Date.now()+55*60*1000)
  const cookie=buildNativeSessionCookie(token,expiry)
  assert.match(cookie,/^__Host-agentstudio_session=/)
  for(const rule of ["Path=/","Secure","HttpOnly","SameSite=Strict"])
    assert.ok(cookie.includes(rule),rule)
  assert.doesNotMatch(cookie,/Domain=/)
  assert.match(clearNativeSessionCookie(),/Max-Age=0/)
  assert.throws(()=>buildNativeSessionCookie("abc",expiry),/invalid_session_token/)
  assert.throws(()=>buildNativeSessionCookie(token,new Date(Date.now()-1)),/invalid_session_expiry/)
  assert.throws(()=>buildNativeSessionCookie(token,new Date(Date.now()+50*60*60*1000)),/invalid_session_expiry/)
})
