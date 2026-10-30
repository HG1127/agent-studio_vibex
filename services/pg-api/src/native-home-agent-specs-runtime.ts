import type {IncomingMessage} from 'node:http'
import type {Identity,SqlPool} from './contracts.ts'
import {inspectOptionalNativeHomeAuthoringSchema} from './native-home-authoring-audit.ts'
import {NativeHomeAgentSpecsRepository} from './native-home-agent-specs-repository.ts'
import {createNativeHomeAgentSpecsHttp} from './native-home-agent-specs-http.ts'
import {NativeHomeResourcesRepository} from './native-home-resources-repository.ts'
import {createNativeHomeResourcesHttp} from './native-home-resources-http.ts'

export function selectNativeHomeAuthoring(env:NodeJS.ProcessEnv,listen:boolean,origin:string,configurationWrites:boolean):{available:boolean;allowWrites:boolean}{
 const marker=env.AGENT_STUDIO_PG18_ORIGINAL_HOME_ENABLED
 if(marker===undefined)return{available:false,allowWrites:false}
 if(marker!=='true'||listen!==true||!origin.startsWith('https://')||typeof configurationWrites!=='boolean')throw Error('unsafe_original_home_config')
 return{available:true,allowWrites:configurationWrites===true}
}
/** Optional070 source feature; defaults off and never installs or starts DBs. */
export async function prepareNativeHomeAgentSpecs(input:{pool:SqlPool;env:NodeJS.ProcessEnv;listen:boolean;allowedOrigin:string;configurationWrites:boolean;allowNativeLocalAgentSpecs:boolean;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}){
 const policy=selectNativeHomeAuthoring(input.env,input.listen,input.allowedOrigin,input.configurationWrites)
 // Always inspect installed optional070, including when admission is off.
 // A missing optional profile is safe only while the facade is disabled.
 const schema=await inspectOptionalNativeHomeAuthoringSchema(input.pool)
 if(!policy.available)return null
 if(schema!=='installed')throw Error('original_home_authoring_schema_required')
 const specs=createNativeHomeAgentSpecsHttp({repository:new NativeHomeAgentSpecsRepository(input.pool,{allowNativeLocalAgentSpecs:input.allowNativeLocalAgentSpecs}),authenticateRequest:input.authenticateRequest,allowedOrigin:input.allowedOrigin,allowWrites:policy.allowWrites})
 const resources=createNativeHomeResourcesHttp({repository:new NativeHomeResourcesRepository(input.pool),authenticateRequest:input.authenticateRequest,allowedOrigin:input.allowedOrigin})
 return async(req:Parameters<typeof specs>[0],res:Parameters<typeof specs>[1])=>{if(await resources(req,res))return true;return specs(req,res)}
}
