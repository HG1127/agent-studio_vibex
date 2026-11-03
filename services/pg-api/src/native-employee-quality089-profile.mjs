
import {types} from 'node:util'
import {employeeQuality089Profile,quality089Target} from './employee-quality089-contract.mjs'
export function selectNativeEmployeeQuality089Profile(env){
 if(!env||typeof env!=='object'||types.isProxy(env))throw Error('employee_quality089_native_profile_refused')
 const d=Object.getOwnPropertyDescriptors(env),prefix='AGENT_STUDIO_PG18_EMPLOYEE_UI_',keys=['PROFILE','SOURCE_SHA256','SYSTEM_IDENTIFIER','DATABASE_OID']
 for(const k of Reflect.ownKeys(d))if(typeof k==='string'&&k.startsWith(prefix)&&(!keys.includes(k.slice(prefix.length))||!Object.hasOwn(d[k],'value')))throw Error('employee_quality089_native_profile_refused')
 const value=k=>d[prefix+k]?.value
 if(value('PROFILE')!==employeeQuality089Profile)throw Error('employee_quality089_native_profile_refused')
 const source=value('SOURCE_SHA256');if(typeof source!=='string'||!/^[a-f0-9]{64}$/.test(source)||env.AGENT_STUDIO_PG18_ORIGINAL_QUALITY_ENABLED!=='true')throw Error('employee_quality089_native_profile_refused')
 return Object.freeze({profile:employeeQuality089Profile,source_sha256:source,target:quality089Target({system_identifier:value('SYSTEM_IDENTIFIER'),database_oid:value('DATABASE_OID')})})
}
export async function inspectNativeEmployeeQuality089Profile(pool,env){const selected=selectNativeEmployeeQuality089Profile(env),{captureEmployeeQuality089Sources}=await import('./employee-quality089-source.mjs'),{verifyEmployeeQuality089ApiPool}=await import('./employee-quality089-profile.mjs');const s=await captureEmployeeQuality089Sources();return await verifyEmployeeQuality089ApiPool(pool,s,selected.source_sha256,selected.target)}

/** Independent named combination: original046 was audited before extension and all its original catalog rows remain sealed plus exact089 delta. No old inspector is filtered or weakened. */
export async function inspectNativeQuality089ReleaseSchema(pool,env){await inspectNativeEmployeeQuality089Profile(pool,env);return true}
