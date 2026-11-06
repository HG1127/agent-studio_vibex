import {requireOriginalModelDraftSyntheticCi,originalModelDraftSyntheticPurpose} from './original-model-draft-synthetic-host-source.mjs'
export {originalModelDraftSyntheticPurpose}
/** Pure admission. Positive unit inputs are DATA, never execution approval. */
export function requireOriginalModelDraftDiscoveryBrowserCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const permit=requireOriginalModelDraftSyntheticCi(env,platform,uid)
 for(const name of ['AGENT_STUDIO_ORIGINAL_MODEL_CONNECTIONS_CI','AGENT_STUDIO_ORIGINAL_HOME_DESIGN_CI','AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI','AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI','AGENT_STUDIO_ORIGINAL_OVERVIEW_CI','AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI','AGENT_STUDIO_ORIGINAL_MONITOR073_CI'])if(Object.hasOwn(env,name))throw Error('draft_discovery_cannot_relabel_existing_purpose')
 return Object.freeze({...permit,synthetic_only:true,actual_provider_network:false,Native_timeout_ms:8000,original_provider_timeout_ms:6000,production_GO:false})
}
