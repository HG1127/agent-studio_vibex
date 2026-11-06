import type {IncomingMessage} from 'node:http'
import type {Identity,SqlPool} from './contracts.ts'
import {inspectOriginalQuality089Startup} from './original-quality089-audit.ts'
import {OriginalAgentQualityRepository} from './original-agent-quality-repository.ts'
import {createOriginalAgentQualityHttp} from './original-agent-quality-http.ts'
export function originalQuality089Policy(env:Readonly<Record<string,string|undefined>>,listen:boolean,origin:string,configurationWrites:boolean){const value=env.AGENT_STUDIO_PG18_ORIGINAL_QUALITY_ENABLED;if(value===undefined)return null;if(value!=='true'||listen!==true||!origin.startsWith('https://')||typeof configurationWrites!=='boolean')throw Error('unsafe_original_quality_config');return{allowWrites:configurationWrites}}
/** Explicit optional source profile only. Root's full parent/profile audit is
 * mandatory separately; this factory neither installs nor upgrades SQL. */
export async function prepareOriginalAgentQuality(input:{pool:SqlPool;env:Readonly<Record<string,string|undefined>>;listen:boolean;allowedOrigin:string;configurationWrites:boolean;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}){const policy=originalQuality089Policy(input.env,input.listen,input.allowedOrigin,input.configurationWrites);if(!policy)return null;await inspectOriginalQuality089Startup(input.pool);return createOriginalAgentQualityHttp({repo:new OriginalAgentQualityRepository(input.pool,policy),allowedOrigin:input.allowedOrigin,authenticateRequest:input.authenticateRequest})}
