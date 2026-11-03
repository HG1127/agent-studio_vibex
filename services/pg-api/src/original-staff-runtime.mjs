import {originalStaffProtocol} from '../../../shared/original-staff-contract.mjs'
const runtimes=new WeakMap(),refuse=()=>{throw Error('original_staff084_runtime_required')}
export function originalStaffRuntimeState(handle){const state=runtimes.get(handle);if(!state)return refuse();return state}
export function selectOriginalStaff084(env){
 const prefix='AGENT_STUDIO_PG18_ORIGINAL_STAFF_',keys=['PROFILE','APPROVED'];for(const key of Object.keys(env))if(key.startsWith(prefix)&&!keys.includes(key.slice(prefix.length)))refuse()
 const profile=env[prefix+'PROFILE'],approved=env[prefix+'APPROVED'];if(profile===undefined&&approved===undefined)return null
 if(profile!=='native047-original-staff084'||approved!=='APPROVE_DISPOSABLE_ORIGINAL_STAFF_084_ONLY')refuse()
 return Object.freeze({profile})
}
// This is the only minting port. A string/profile flag/catalog DTO is never a
// runtime permit. Default-off performs no new audit import, query or I/O.
export async function prepareOriginalStaffRuntime({pool,env,allowedOrigin,configurationWrites=false,employeeProvisioning=false,listen=false}){
 const selected=selectOriginalStaff084(env);if(!selected)return null
 let valid=false;try{const u=new URL(allowedOrigin);valid=u.protocol==='https:'&&u.origin===allowedOrigin}catch{}if(!valid)return refuse()
 const {verifyOriginalStaffCompatible084Schema}=await import('./original-staff-compatible084-audit.mjs'),db=await pool.connect();let begun=false,discard=false,primary
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await db.query('SET LOCAL ROLE agentstudio_native_auth');await db.query('SET LOCAL search_path=pg_catalog');await verifyOriginalStaffCompatible084Schema(db)}catch(error){primary=error;throw error}finally{try{if(begun)await db.query('ROLLBACK')}catch{discard=true;if(primary===undefined)throw Error('original_staff084_startup_rollback_unconfirmed')}finally{if(discard)Reflect.apply(db.release,db,[true]);else db.release()}}
 const prepared=Object.freeze({});runtimes.set(prepared,Object.freeze({pool,allowedOrigin,configurationWrites:listen===true&&configurationWrites===true,employeeProvisioning:listen===true&&configurationWrites===true&&employeeProvisioning===true}))
 const [{OriginalStaffRepository},{createOriginalStaffHttp}]=await Promise.all([import('./original-staff-repository.mjs'),import('./original-staff-http.mjs')]),repository=new OriginalStaffRepository(prepared)
 return Object.freeze({protocol:originalStaffProtocol,repository,handler:createOriginalStaffHttp(repository)})
}
