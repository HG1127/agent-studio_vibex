import {staffExpectedOwner,parseOriginalStaffList,parseOriginalStaffReceipt} from '../../../shared/original-staff-contract.mjs'
import {originalStaffRuntimeState} from './original-staff-runtime.mjs'
import {authorizeOriginalStaff,readOriginalStaffSelf,readOriginalStaffList,readOriginalStaffReceipt,writeOriginalStaff} from './original-staff-operations.mjs'
const repositories=new WeakMap(),refuse=()=>{throw Error('original_staff084_runtime_required')}
export function originalStaffRepositoryState(repository){const state=repositories.get(repository);if(!state||Object.getPrototypeOf(repository)!==OriginalStaffRepository.prototype||['authorize','me','list','receipt','mutate'].some(k=>repository[k]!==OriginalStaffRepository.prototype[k]))return refuse();return state}
async function transaction(repository,write,work){
 const state=originalStaffRepositoryState(repository),db=await state.pool.connect();let begun=false,committing=false,discard=false
 try{await db.query(write?'BEGIN ISOLATION LEVEL READ COMMITTED':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await db.query('SET LOCAL ROLE agentstudio_native_auth');await db.query('SET LOCAL search_path=pg_catalog');await db.query("SET LOCAL statement_timeout='8000ms'; SET LOCAL lock_timeout='3000ms'");const value=await work(db);committing=true;await db.query('COMMIT');begun=false;return value}
 catch(error){if(committing){discard=true;throw Error(write?'original_staff_commit_unconfirmed':'original_staff_read_unconfirmed')}throw error}
 finally{if(begun)try{await db.query('ROLLBACK')}catch{discard=true};if(discard)Reflect.apply(db.release,db,[true]);else db.release()}
}
export class OriginalStaffRepository{
 constructor(prepared){repositories.set(this,originalStaffRuntimeState(prepared))}
 authorize(token,owner,admin=true){staffExpectedOwner(owner);return transaction(this,false,db=>authorizeOriginalStaff(db,token,owner,admin))}
 me(token,owner){staffExpectedOwner(owner);return transaction(this,false,db=>readOriginalStaffSelf(db,token,owner))}
 list(token,owner,params){staffExpectedOwner(owner);const choice=parseOriginalStaffList(params);return transaction(this,false,db=>readOriginalStaffList(db,token,owner,choice))}
 receipt(token,owner,id,params){staffExpectedOwner(owner);const choice=parseOriginalStaffReceipt(id,params);return transaction(this,false,db=>readOriginalStaffReceipt(db,token,owner,choice))}
 mutate(token,owner,action,target,raw){staffExpectedOwner(owner);const state=originalStaffRepositoryState(this);if(!state.configurationWrites)throw Error('original_staff_writes_disabled');if(action==='create'&&!state.employeeProvisioning)throw Error('employee_provisioning_disabled');return transaction(this,true,db=>writeOriginalStaff(db,token,owner,action,target,raw))}
}
