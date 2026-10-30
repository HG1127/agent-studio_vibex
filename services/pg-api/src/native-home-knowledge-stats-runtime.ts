import type {SqlPool} from './contracts.ts'
import {inspectOptionalOriginalHomeKnowledgeStatisticsSchema} from './native-home-knowledge-stats-audit.ts'
export function selectOriginalHomeKnowledgeStatistics(env:NodeJS.ProcessEnv,origin:string,sharing:boolean):boolean{
 const marker=env.AGENT_STUDIO_PG18_ORIGINAL_HOME_SHARED_STATISTICS_ENABLED
 if(marker===undefined)return false
 let https=false;try{const url=new URL(origin);https=url.protocol==='https:'&&url.origin===origin}catch{}
 if(marker!=='true'||!https||sharing!==true)throw Error('unsafe_original_home_statistics_config')
 return true
}
/** Configuration/catalog preflight, including no-listen mode. Never installs,
 * opens HTTP, changes grants, or substitutes an attested schemaStatus input. */
export async function inspectOriginalHomeKnowledgeStatisticsStartup(input:{pool:SqlPool;env:NodeJS.ProcessEnv;allowedOrigin:string}){
 const enabled=selectOriginalHomeKnowledgeStatistics(input.env,input.allowedOrigin,input.pool.knowledgeSharing===true)
 const schema=await inspectOptionalOriginalHomeKnowledgeStatisticsSchema(input.pool)
 if(enabled&&schema!=='installed')throw Error('original_home_statistics_schema_required')
 return Object.freeze({available:enabled})
}
