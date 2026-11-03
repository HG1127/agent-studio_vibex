
import {types} from 'node:util'
import {staffCompositeProfiles,staffCompositeTarget} from './employee-staff084-contract.mjs'
import {NativeAuthRepository} from './native-auth-repository.mjs'
const bad=()=>{throw Error('staff_composite_native_profile_refused')}
export function selectNativeEmployeeStaff084Profile(env){
 if(!env||typeof env!=='object'||types.isProxy(env))bad()
 const ds=Object.getOwnPropertyDescriptors(env),prefix='AGENT_STUDIO_PG18_EMPLOYEE_UI_',value=s=>ds[prefix+s]?.value,profile=value('PROFILE')
 if(!staffCompositeProfiles.includes(profile))return null
 for(const k of Reflect.ownKeys(ds))if(typeof k==='string'&&k.startsWith(prefix)&&(!['PROFILE','SOURCE_SHA256','SYSTEM_IDENTIFIER','DATABASE_OID'].includes(k.slice(prefix.length))||!Object.hasOwn(ds[k],'value')))bad()
 if(typeof value('SOURCE_SHA256')!=='string'||!/^[a-f0-9]{64}$/.test(value('SOURCE_SHA256'))||env.AGENT_STUDIO_PG18_ORIGINAL_STAFF_PROFILE!=='native047-original-staff084'||env.AGENT_STUDIO_PG18_ORIGINAL_STAFF_APPROVED!=='APPROVE_DISPOSABLE_ORIGINAL_STAFF_084_ONLY'||(profile===staffCompositeProfiles[1]&&env.AGENT_STUDIO_PG18_ORIGINAL_QUALITY_ENABLED!=='true'))bad()
 return {profile,source_sha256:value('SOURCE_SHA256'),target:staffCompositeTarget({system_identifier:value('SYSTEM_IDENTIFIER'),database_oid:value('DATABASE_OID')})}
}
export async function inspectNativeEmployeeStaff084Profile(api,auth,env){
 const selected=selectNativeEmployeeStaff084Profile(env);if(!selected)return false
 const {captureEmployeeStaff084Sources}=await import('./employee-staff084-source.mjs'),{verifyEmployeeStaff084Pool}=await import('./employee-staff084-profile.mjs')
 const snapshot=await captureEmployeeStaff084Sources(selected.profile)
 await verifyEmployeeStaff084Pool(api,snapshot,selected.source_sha256,selected.target,'api')
 await verifyEmployeeStaff084Pool(auth,snapshot,selected.source_sha256,selected.target,'auth')
 return true
}
export async function createStaffCompositeNativeAuthRepository(pool,env){
 const selected=selectNativeEmployeeStaff084Profile(env);if(!selected)return new NativeAuthRepository(pool)
 const {captureEmployeeStaff084Sources}=await import('./employee-staff084-source.mjs'),{verifyEmployeeStaff084Pool}=await import('./employee-staff084-profile.mjs')
 const snapshot=await captureEmployeeStaff084Sources(selected.profile),verify=()=>verifyEmployeeStaff084Pool(pool,snapshot,selected.source_sha256,selected.target,'auth')
 await verify()
 // Only the inspector changes for the explicit named profile. Password KDF,
 // session authorization, governance locks/thresholds and revocation remain
 // the actual original NativeAuthRepository/Governance implementation.
 return new class extends NativeAuthRepository{async inspectEmployeeGovernance(){await verify();return true}}(pool)
}
export async function inspectStaffCompositeReleaseSchema(api,auth,env){if(!selectNativeEmployeeStaff084Profile(env))bad();await inspectNativeEmployeeStaff084Profile(api,auth,env);return true}
