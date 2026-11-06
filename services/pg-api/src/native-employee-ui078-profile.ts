import {types} from 'node:util'
import type {SqlPool} from './contracts.ts'
const employeeUi078Profile='complete069-employee-ui078',prefix='AGENT_STUDIO_PG18_EMPLOYEE_UI_',fail=():never=>{throw Error('employee_ui078_native_profile_refused')}
export function selectNativeEmployeeUi078Profile(env:NodeJS.ProcessEnv){
 if(!env||typeof env!=='object'||types.isProxy(env))fail()
 const descriptors=Object.getOwnPropertyDescriptors(env),keys=['PROFILE','SOURCE_SHA256','SYSTEM_IDENTIFIER','DATABASE_OID']
 for(const key of Reflect.ownKeys(descriptors)){if(typeof key!=='string'||!key.startsWith(prefix))continue;const d=descriptors[key]!;if(!keys.some(k=>prefix+k===key)||!('value'in d))fail()}
 const value=(suffix:string)=>descriptors[prefix+suffix]?.value
 if(value('PROFILE')===undefined){if(keys.slice(1).some(k=>value(k)!==undefined))fail();return null}
 const source=value('SOURCE_SHA256'),system=value('SYSTEM_IDENTIFIER'),database=value('DATABASE_OID')
 if(value('PROFILE')!==employeeUi078Profile||typeof source!=='string'||!/^[a-f0-9]{64}$/.test(source)||typeof system!=='string'||!/^[1-9][0-9]{0,19}$/.test(system)||BigInt(system)>18446744073709551615n||typeof database!=='string'||!/^[1-9][0-9]{0,9}$/.test(database)||BigInt(database)>4294967295n)fail()
 return Object.freeze({profile:employeeUi078Profile,source_sha256:source,target:Object.freeze({system_identifier:system,database_oid:database})})
}
/** Called by the original Native entry, after actual API login verification
 * and before original auth/service inspectors or HTTP can open. No admin
 * credential, supplied snapshot, fake verifier, DDL or catalog filtering. */
export async function inspectNativeEmployeeUi078Profile(pool:SqlPool,env:NodeJS.ProcessEnv){
 const selected=selectNativeEmployeeUi078Profile(env);if(selected===null)return null
 const {captureEmployeeUi078Sources,assertEmployeeUi078Snapshot}=await import('./pg18-employee-ui078-source.mjs')
 const {verifyEmployeeUi078ApiPool}=await import('./pg18-employee-ui078-audit.ts')
 const snapshot=await captureEmployeeUi078Sources();assertEmployeeUi078Snapshot(snapshot,selected.source_sha256)
 return await verifyEmployeeUi078ApiPool(pool,snapshot,selected.source_sha256,selected.target)
}
