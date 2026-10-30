// Shared data contract. No identity, SQL, provider, filesystem or executable input.
export const localDeviceRoute='/api/v2/local-devices'
export const localExecutorRoute='/api/public/native-local-executor'
export const localDeviceApproval='APPROVE_DISPOSABLE_PG18_NATIVE_LOCAL_DEVICES_ONLY'
export const localDeviceStatuses=Object.freeze(['queued','running','succeeded','failed','cancelled','expired','unknown'])
const bad=()=>{throw Error('invalid_native_local_device_value')}
export function parseLocalTransportJson(source,max=1450000){
 if(typeof source!=='string'||source.length>max||new TextEncoder().encode(source).length>max)bad();let at=0,nodes=0
 const space=()=>{while(/[\x20\t\r\n]/.test(source[at]??'X'))at++}
 function string(){const start=at++;while(at<source.length){const c=source[at++];if(c==='"'){const value=JSON.parse(source.slice(start,at));if(value.includes('\0'))bad();return value}if(c==='\\'){if(source[at]==='u'){if(!/^[a-f0-9]{4}$/i.test(source.slice(at+1,at+5)))bad();at+=5}else{if(!'"\\/bfnrt'.includes(source[at]??'X'))bad();at++}}else if(c.charCodeAt(0)<32)bad()}bad()}
 function value(depth){if(depth>12||++nodes>15000)bad();space();const c=source[at]
  if(c==='"')return string()
  if(c==='{'){at++;space();const out=Object.create(null);if(source[at]==='}'){at++;return out}for(;;){space();if(source[at]!=='"')bad();const key=string();if(Object.hasOwn(out,key)||['__proto__','prototype','constructor'].includes(key))bad();space();if(source[at++]!==':')bad();out[key]=value(depth+1);space();const end=source[at++];if(end==='}')return out;if(end!==',')bad()}}
  if(c==='['){at++;space();const out=[];if(source[at]===']'){at++;return out}for(;;){if(out.length>=5000)bad();out.push(value(depth+1));space();const end=source[at++];if(end===']')return out;if(end!==',')bad()}}
  for(const [token,v] of [['true',true],['false',false],['null',null]])if(source.startsWith(token,at)){at+=token.length;return v}
  const found=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(at));if(!found)bad();at+=found[0].length;const number=Number(found[0]);if(!Number.isFinite(number))bad();return number
 }
 const result=value(0);space();if(at!==source.length)bad();return result
}
export function localObject(v,required,optional=[]){
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))bad()
 const entries=Object.getOwnPropertyDescriptors(v)
 if(required.some(k=>!Object.hasOwn(entries,k))||Object.keys(entries).some(k=>!required.includes(k)&&!optional.includes(k)))bad()
 if(Object.values(entries).some(d=>!Object.hasOwn(d,'value')))bad()
 return v
}
export function localId(v){if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v))bad();return v}
export function localText(v,max,empty=false){if(typeof v!=='string'||v.length>max||v.includes('\0')||(!empty&&!v.trim()))bad();return v}
export function localSha(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))bad();return v}
export function localCanonical(value){
 function walk(v,n){
  if(n>12)bad()
  if(v===null||typeof v==='boolean')return v
  if(typeof v==='string'){if(v.includes('\0'))bad();return v}
  if(typeof v==='number'){if(!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER)bad();return v}
  if(Array.isArray(v)){if(v.length>5000)bad();return v.map(x=>walk(x,n+1))}
  localObject(v,[],Object.keys(v??{}));if(Object.keys(v).length>100)bad()
  return Object.fromEntries(Object.keys(v).sort().map(k=>{if(['__proto__','constructor','prototype'].includes(k)||/[\uD800-\uDFFF]/.test(k)||k.includes('\0'))bad();return[k,walk(v[k],n+1)]}))
 }
 return JSON.stringify(walk(value,0))
}
export async function localDigest(value){return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(localCanonical(value))))).map(n=>n.toString(16).padStart(2,'0')).join('')}
export function parseLocalInput(v){
 localObject(v,['tool','arguments']);if(typeof v.tool!=='string'||!/^[A-Za-z0-9_.-]{1,100}$/.test(v.tool))bad()
 localObject(v.arguments,[],Object.keys(v.arguments??{}));const input={tool:v.tool,arguments:JSON.parse(localCanonical(v.arguments))}
 if(new TextEncoder().encode(localCanonical(input)).length>24000)bad();return input
}
export function parseLocalCatalog(v){
 if(!Array.isArray(v)||v.length>50)bad();const seen=new Set()
 const out=v.map(x=>{localObject(x,['name','description','inputSchema']);if(typeof x.name!=='string'||!/^[A-Za-z0-9_.-]{1,100}$/.test(x.name)||seen.has(x.name))bad();seen.add(x.name)
  const description=localText(x.description,600,true);localObject(x.inputSchema,[],Object.keys(x.inputSchema??{}));const inputSchema=JSON.parse(localCanonical(x.inputSchema))
  if(localCanonical(inputSchema).length>10000||inputSchema.type!=='object')bad();return{name:x.name,description,inputSchema}})
 if(new TextEncoder().encode(localCanonical(out)).length>60000)bad();return out
}
export function parseLocalResult(v){
 if(typeof v==='string')v={text:v,images:[]}
 localObject(v,['text','images']);const text=localText(v.text,12000,true)
 if(!Array.isArray(v.images)||v.images.length>1)bad()
 const images=v.images.map(x=>{localObject(x,['mimeType','data']);if(!['image/png','image/jpeg'].includes(x.mimeType)||typeof x.data!=='string'||x.data.length<16||x.data.length>1398104||x.data.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(x.data))bad()
  const bytes=Uint8Array.from(atob(x.data),x=>x.charCodeAt(0));if(bytes.length>1048576||btoa(String.fromCharCode(...bytes.slice(0,12)))!==x.data.slice(0,16))bad()
  if(x.mimeType==='image/png'?![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n):!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))bad()
  // Reject noncanonical base64, including nonzero padding bits.
  let canonical='';for(let i=0;i<bytes.length;i+=8192)canonical+=String.fromCharCode(...bytes.slice(i,i+8192));if(btoa(canonical)!==x.data)bad()
  return{mimeType:x.mimeType,data:x.data}})
 return{text,images}
}
export function parseLocalIntent(v){
 const action=Object.getOwnPropertyDescriptor(v??{},'action')?.value
 if(action==='create'||action==='create_office'){localObject(v,['action','request_id','name']);return{action,request_id:localId(v.request_id),name:localText(v.name,120)}}
 if(action==='revoke'||action==='cancel'){localObject(v,['action','request_id','id','confirm']);if(v.confirm!==true)bad();return{action,request_id:localId(v.request_id),id:localId(v.id),confirm:true}}
 if(action==='enqueue'){localObject(v,['action','request_id','id','input','confirm']);if(v.confirm!==true)bad();return{action,request_id:localId(v.request_id),id:localId(v.id),input:parseLocalInput(v.input),confirm:true}}
 bad()
}
export function parseLocalDevice(v){
 localObject(v,['id','name','revoked','seen_ms','catalog','catalog_sha256','version']);if(typeof v.revoked!=='boolean'||!Number.isSafeInteger(v.seen_ms)||v.seen_ms<0||!Number.isSafeInteger(v.version)||v.version<1)bad()
 return{id:localId(v.id),name:localText(v.name,120),revoked:v.revoked,seen_ms:v.seen_ms,catalog:parseLocalCatalog(v.catalog),catalog_sha256:localSha(v.catalog_sha256),version:v.version}
}
export function parseLocalBinding(raw){const v=localObject(raw,['device_id','version','catalog','catalog_sha256']);if(!Number.isSafeInteger(v.version)||v.version<1)bad();return{device_id:localId(v.device_id),version:v.version,catalog:parseLocalCatalog(v.catalog),catalog_sha256:localSha(v.catalog_sha256)}}
export function parseLocalJob(v){
 localObject(v,['id','device_id','run_id','step_key','status','input','input_sha256','created_ms','deadline_ms','result','error'])
 if(!localDeviceStatuses.includes(v.status)||!Number.isSafeInteger(v.created_ms)||v.created_ms<1||!Number.isSafeInteger(v.deadline_ms)||v.deadline_ms-v.created_ms!==120000)bad()
 if((v.status==='succeeded'||v.status==='failed')!==(v.result!==null))bad()
 return{id:localId(v.id),device_id:localId(v.device_id),run_id:v.run_id===null?null:localId(v.run_id),step_key:localText(v.step_key,160,true),status:v.status,input:parseLocalInput(v.input),input_sha256:localSha(v.input_sha256),created_ms:v.created_ms,deadline_ms:v.deadline_ms,result:v.result===null?null:parseLocalResult(v.result),error:localText(v.error,120,true)}
}
export function parseLocalReply(v){localObject(v,['receipt','pairing_code','replayed']);localObject(v.receipt,['request_id','request_sha256','action','id']);if(!['create','create_office','revoke','cancel','enqueue'].includes(v.receipt.action)||typeof v.replayed!=='boolean'||(v.pairing_code!==null&&(typeof v.pairing_code!=='string'||!/^[a-f0-9]{48}$/.test(v.pairing_code)||v.receipt.action!=='create'||v.replayed)))bad();return{receipt:{request_id:localId(v.receipt.request_id),request_sha256:localSha(v.receipt.request_sha256),action:v.receipt.action,id:localId(v.receipt.id)},pairing_code:v.pairing_code,replayed:v.replayed}}
export async function matchLocalReply(raw,intent){const r=parseLocalReply(raw);if(r.receipt.request_id!==intent.request_id||r.receipt.action!==intent.action||r.receipt.request_sha256!==await localDigest(intent)||!['create','create_office','enqueue'].includes(intent.action)&&r.receipt.id!==intent.id)bad();return r}
