
import type {SqlPool} from './contracts.ts'
import {NativeAuthRepository} from './native-auth-repository.mjs'
export function selectNativeEmployeeStaff084Profile(env:NodeJS.ProcessEnv):null|{profile:string;source_sha256:string;target:{system_identifier:string;database_oid:string}}
export function inspectNativeEmployeeStaff084Profile(api:SqlPool,auth:SqlPool,env:NodeJS.ProcessEnv):Promise<boolean>
export function createStaffCompositeNativeAuthRepository(pool:SqlPool,env:NodeJS.ProcessEnv):Promise<NativeAuthRepository>
export function inspectStaffCompositeReleaseSchema(api:SqlPool,auth:SqlPool,env:NodeJS.ProcessEnv):Promise<true>
