// Standalone employee password/session cryptography for the UNDEPLOYED
// PostgreSQL 18 migration. No JWT compatibility with PocketBase or OIDC.
// Does NOT authenticate anyone by itself: server-side session persistence,
// account status, throttling, and origin protection are mandatory.
import {createHash,randomBytes,scrypt as scryptCallback,timingSafeEqual} from "node:crypto"
import {promisify} from "node:util"

const scrypt=promisify(scryptCallback)
const N=32768
const r=8
const p=1
const keyLength=64
const maxmem=64*1024*1024
const saltBytes=16
const dummySalt=Buffer.alloc(saltBytes,0x5a)
const dummyRecord="scrypt$v1$32768$8$1$"+dummySalt.toString("base64url")+"$"+
  Buffer.alloc(keyLength,0xa5).toString("base64url")
export const NATIVE_LOCAL_ISSUER="urn:agentstudio:local:v1"
export const NATIVE_SESSION_COOKIE="__Host-agentstudio_session"

export function normalizeEmployeeEmail(value){
  if(typeof value!=="string")throw Error("invalid_employee_email")
  const email=value.trim().toLowerCase()
  if(email.length<5||email.length>254||
     !/^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9][a-z0-9.-]{0,251}\.[a-z]{2,63}$/.test(email)||
     email.includes(".."))throw Error("invalid_employee_email")
  return email
}
export function validateEmployeePassword(value){
  if(typeof value!=="string")throw Error("invalid_employee_password")
  const len=Buffer.byteLength(value,"utf8")
  if(len<12||len>256||/[\0\r\n]/.test(value)||
     !/[\p{L}\p{N}]/u.test(value))throw Error("invalid_employee_password")
  return value
}
export function validateEmployeeDisplayName(value){
  if(typeof value!=="string")throw Error("invalid_employee_display_name")
  const display=value.trim()
  if(display.length<1||display.length>80||
     Array.from(display).some(ch=>[0,10,13].includes(ch.charCodeAt(0))))
    throw Error("invalid_employee_display_name")
  return display
}
function decodeRecord(record){
  if(typeof record!=="string"||record.length>320)return null
  const parts=record.split("$")
  if(parts.length!==7||
     parts[0]!=="scrypt"||parts[1]!=="v1"||
     parts[2]!=="32768"||parts[3]!=="8"||parts[4]!=="1"||
     !/^[A-Za-z0-9_-]{22}$/.test(parts[5])||
     !/^[A-Za-z0-9_-]{86}$/.test(parts[6]))return null
  const salt=Buffer.from(parts[5],"base64url")
  const hash=Buffer.from(parts[6],"base64url")
  if(salt.length!==saltBytes||hash.length!==keyLength||
     salt.toString("base64url")!==parts[5]||
     hash.toString("base64url")!==parts[6])return null
  return {salt,hash}
}
async function derivePassword(password,salt){
  return await scrypt(Buffer.from(password,"utf8"),salt,keyLength,{N,r,p,maxmem})
}
export async function hashEmployeePassword(password){
  validateEmployeePassword(password)
  const salt=randomBytes(saltBytes)
  const derived=await derivePassword(password,salt)
  return "scrypt$v1$32768$8$1$"+salt.toString("base64url")+"$"+
    derived.toString("base64url")
}
export async function verifyEmployeePassword(password,stored){
  // One bounded expensive KDF for either a missing user, invalid stored
  // record or a valid hash, minimizing account-existence timing clues.
  const value=typeof password==="string"&&Buffer.byteLength(password,"utf8")<=256&&
    password.length>0&&!/[\0\r\n]/.test(password)?password:"\uFFFD"
  const decoded=decodeRecord(stored)||decodeRecord(dummyRecord)
  const actual=await derivePassword(value,decoded.salt)
  return timingSafeEqual(actual,decoded.hash)&&decodeRecord(stored)!==null&&
    value===password
}
export function generateOpaqueSession(){
  const token=randomBytes(32).toString("base64url")
  return {token,digest:hashOpaqueSession(token)}
}
export function hashOpaqueSession(token){
  if(typeof token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw Error("invalid_session_token")
  const bytes=Buffer.from(token,"base64url")
  if(bytes.length!==32||bytes.toString("base64url")!==token)
    throw Error("invalid_session_token")
  return createHash("sha256").update(bytes).digest()
}
export function buildNativeSessionCookie(token,expiresAt){
  // The cookie is exclusively sent over HTTPS and is host-only.
  hashOpaqueSession(token)
  if(!(expiresAt instanceof Date)||!Number.isFinite(expiresAt.getTime())||
     expiresAt.getTime()<=Date.now()||
     expiresAt.getTime()>Date.now()+24*60*60*1000+5000)
    throw Error("invalid_session_expiry")
  const maxAge=Math.floor((expiresAt.getTime()-Date.now())/1000)
  return NATIVE_SESSION_COOKIE+"="+token+
    "; Path=/; Max-Age="+maxAge+
    "; Secure; HttpOnly; SameSite=Strict"
}
export function clearNativeSessionCookie(){
  return NATIVE_SESSION_COOKIE+
    "=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict"
}
