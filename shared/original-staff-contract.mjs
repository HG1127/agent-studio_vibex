export const originalStaffProtocol='native_original_staff_owner_cas_v1'
export const originalStaffPrefix='/api/native-auth/original-staff'
const fail=()=>{throw Error('invalid_original_staff_input')}
export function staffObject(value,keys){
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail()
 const ds=Object.getOwnPropertyDescriptors(value)
 if(Reflect.ownKeys(ds).length!==keys.length||keys.some(k=>!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')))fail()
 return Object.fromEntries(keys.map(k=>[k,ds[k].value]))
}
export function staffId(value){if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))fail();return value}
export function staffExpectedOwner(value){return staffId(value)}
export function staffRevision(value){if(!Number.isSafeInteger(value)||value<1||value>Number.MAX_SAFE_INTEGER-1)fail();return value}
export function staffUpdated(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value.slice(0,23)+'Z')fail();return value}
function name(v){if(typeof v!=='string'||v!==v.trim()||!v||v.length>80||/[\x00-\x1f\x7f]/.test(v))fail();return v}
function email(v,max=180){if(typeof v!=='string'||v!==v.trim().toLowerCase()||v.length>max||! /^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$/.test(v)||v.includes('..'))fail();return v}
function password(v){if(typeof v!=='string'||new TextEncoder().encode(v).length<12||new TextEncoder().encode(v).length>256||/[\0\r\n]/.test(v)||!/[\p{L}\p{N}]/u.test(v))fail();for(let i=0;i<v.length;i++){const code=v.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const low=v.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))fail()}else if(code>=0xdc00&&code<=0xdfff)fail()}return v}
function flags(v){if(!['admin','employee'].includes(v.role)||typeof v.share_enabled!=='boolean')fail()}
export function parseOriginalStaffMutation(action,target,raw){
 if(!['create','update','reset'].includes(action))fail()
 const keys=action==='create'?['request_id','display_name','email','role','share_enabled','password','confirm']:action==='update'?['request_id','expected_revision','expected_governance_revision','expected_updated','display_name','email','role','active','share_enabled','confirm']:['request_id','expected_revision','expected_governance_revision','expected_updated','new_password','confirm']
 const v=staffObject(raw,keys);staffId(v.request_id);if(v.confirm!==true)fail()
 if(action==='create'){if(target!==null)fail();password(v.password)}else{staffId(target);staffRevision(v.expected_revision);staffRevision(v.expected_governance_revision);if(v.expected_revision>=Number.MAX_SAFE_INTEGER-1)fail();staffUpdated(v.expected_updated)}
 if(action!=='reset'){name(v.display_name);email(v.email);flags(v)}
 if(action==='update'&&typeof v.active!=='boolean')fail()
 if(action==='reset')password(v.new_password)
 return Object.freeze({action,target_id:target,...v})
}
// Only non-secret fields participate in the public request binding. Password
// input equality is checked separately with a private random-salt scrypt record.
export function originalStaffPublicChoice(choice){const {password,new_password,...safe}=choice;return safe}
export function parseOriginalStaffList(params){
 if(!(params instanceof URLSearchParams))fail()
 const allowed=['page','perPage','q','role','active'];for(const k of params.keys())if(!allowed.includes(k)||params.getAll(k).length!==1)fail()
 const integer=(key,fallback,max)=>{const v=params.get(key);if(v===null)return fallback;if(!/^[1-9][0-9]{0,6}$/.test(v)||Number(v)>max)fail();return Number(v)}
 const page=integer('page',1,1000000),perPage=integer('perPage',20,100),q=params.get('q')??'',role=params.get('role')??'',active=params.get('active')??''
 if(q!==q.trim()||q.length>180||/[\x00-\x1f\x7f]/.test(q)||!['','admin','employee'].includes(role)||!['','true','false'].includes(active))fail()
 return Object.freeze({page,perPage,q,role,active})
}
export function parseOriginalStaffReceipt(requestId,params){
 staffId(requestId);for(const k of params.keys())if(!['action','request_sha256','target_id'].includes(k)||params.getAll(k).length!==1)fail()
 const action=params.get('action'),hash=params.get('request_sha256'),target=params.get('target_id')
 if(!['create','update','reset'].includes(action)||typeof hash!=='string'||! /^[a-f0-9]{64}$/.test(hash))fail()
 if(action==='create'){if(target!==null)fail()}else staffId(target)
 if([...params.keys()].length!==(action==='create'?2:3))fail()
 return Object.freeze({request_id:requestId,action,request_sha256:hash,target_id:target})
}
export function originalStaffEmployee(raw){
 const v=staffObject(raw,['id','display_name','email','role','active','share_enabled','revision','governance_revision','created','updated'])
 staffId(v.id);name(v.display_name);email(v.email,254);flags(v);if(typeof v.active!=='boolean')fail();staffRevision(v.revision);staffRevision(v.governance_revision);staffUpdated(v.created);staffUpdated(v.updated);return Object.freeze(v)
}
export function originalStaffListResult(raw){
 const v=staffObject(raw,['items','page','perPage','totalItems','totalPages','summary']),s=staffObject(v.summary,['total','active','admins','sharing'])
 if(!Array.isArray(v.items)||Object.getPrototypeOf(v.items)!==Array.prototype||v.items.length>100)fail()
 for(const n of [v.page,v.perPage,v.totalItems,v.totalPages,...Object.values(s)])if(!Number.isSafeInteger(n)||n<0)fail()
 if(v.perPage<1||v.perPage>100||v.page<1||v.totalPages!==Math.max(1,Math.ceil(v.totalItems/v.perPage))||v.page>v.totalPages||v.totalItems>s.total||s.active>s.total||s.admins>s.active||s.sharing>s.total||v.items.length!==Math.min(v.perPage,Math.max(0,v.totalItems-(v.page-1)*v.perPage)))fail()
 const items=v.items.map(originalStaffEmployee);if(new Set(items.map(v=>v.id)).size!==items.length)fail()
 return Object.freeze({...v,items:Object.freeze(items),summary:Object.freeze(s)})
}
export function originalStaffReceiptResult(raw){
 const v=staffObject(raw,['request_id','action','target_id','request_sha256','committed','user','revoked_sessions']);staffId(v.request_id);staffId(v.target_id)
 if(!['create','update','reset'].includes(v.action)||typeof v.request_sha256!=='string'||! /^[a-f0-9]{64}$/.test(v.request_sha256)||v.committed!==true||typeof v.revoked_sessions!=='boolean')fail()
 const user=originalStaffEmployee(v.user);if(user.id!==v.target_id)fail();return Object.freeze({...v,user})
}
