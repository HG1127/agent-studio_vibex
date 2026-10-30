import type {IncomingMessage} from 'node:http'
import type {Identity,SqlPool} from './contracts.ts'
import {inspectOptionalNativeAgentCatalogSchema} from './native-agent-catalog-audit.ts'
import {NativeAgentCatalogRepository} from './native-agent-catalog-repository.ts'
import {createNativeAgentCatalogHttp} from './native-agent-catalog-http.ts'
export function selectNativeAgentCatalog(env:NodeJS.ProcessEnv,listen:boolean,origin:string,writes:boolean){
 const marker=env.AGENT_STUDIO_PG18_ORIGINAL_AGENT_CATALOG_ENABLED
 if(marker===undefined)return{available:false,allowWrites:false}
 if(marker!=='true'||listen!==true||!origin.startsWith('https://')||typeof writes!=='boolean')throw Error('unsafe_original_agent_catalog_config')
 return{available:true,allowWrites:writes===true}
}
/** Default-off controls HTTP admission, not optional schema-integrity auditing. */
export async function prepareNativeAgentCatalog(input:{pool:SqlPool;env:NodeJS.ProcessEnv;listen:boolean;allowedOrigin:string;configurationWrites:boolean}){
 const policy=selectNativeAgentCatalog(input.env,input.listen,input.allowedOrigin,input.configurationWrites),schema=await inspectOptionalNativeAgentCatalogSchema(input.pool)
 if(!policy.available)return null
 if(schema!=='installed')throw Error('original_agent_catalog_schema_required')
 return Object.freeze({createHandler(authenticateRequest:(req:IncomingMessage)=>Promise<Identity>){
  return createNativeAgentCatalogHttp({repository:new NativeAgentCatalogRepository(input.pool),authenticateRequest,allowedOrigin:input.allowedOrigin,allowWrites:policy.allowWrites})
 }})
}
