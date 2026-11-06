import {prepareOriginalSkillAbNativeRuntime} from './original-skill-ab-native-runtime.ts'
import type {IncomingMessage} from 'node:http'
import type {Identity,SqlPool} from './contracts.ts'
import {prepareOriginalRoleUiPool,selectOriginalRoleUi} from './original-role-ui-policy.ts'
import {OriginalRoleUiRepository} from './original-role-ui-repository.ts'
import {createOriginalRoleUiHttp} from './original-role-ui-http.ts'
export async function prepareOriginalRoleUiRuntime(input:{pool:SqlPool;env:NodeJS.ProcessEnv;listen:boolean;configurationWrites:boolean;autonomousSubmission:boolean;humanInput:boolean;allowedOrigin:string;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}){
 if(!selectOriginalRoleUi(input.env))return null
 if(!input.listen||!input.configurationWrites||!input.autonomousSubmission||!input.humanInput||!input.allowedOrigin.startsWith('https://'))throw Error('original_role_ui_runtime_not_approved')
 await prepareOriginalRoleUiPool(input.pool,input.env)
 const skillAB=await prepareOriginalSkillAbNativeRuntime(input)
 const repository=new OriginalRoleUiRepository(input.pool,input.configurationWrites)
 const legacy=createOriginalRoleUiHttp({repository,skillAB:skillAB?.repository,allowedOrigin:input.allowedOrigin,authenticateRequest:input.authenticateRequest})
 return Object.freeze({protocol:'original-role-ui.v3',handler:async(...args:Parameters<typeof legacy>)=>{if(skillAB&&await skillAB.handler(...args))return true;return legacy(...args)},...(skillAB?.close?{close:skillAB.close}:{})})
}
