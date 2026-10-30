import {selectNativePg18UatCapabilities} from '../../services/pg-api/src/native-config-uat-policy.ts'
import {requireAgentDesignGenuineCi} from '../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'
export const originalModelReceipts075Purpose='YES_DISPOSABLE_ORIGINAL_MODEL_CONFIG_RECEIPTS075_ONLY'
export const originalModelReceipts075Story='original-model-config-receipts075'
export function requireOriginalModelReceipts075Ci(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentDesignGenuineCi(env,platform,uid),refuse=()=>{throw Error('original_model_receipts075_browser_admission_refused')}
 if(env.GITHUB_JOB!=='pg18-agent-design-browser'||env.AGENT_STUDIO_ORIGINAL_MODEL_RECEIPTS075_CI!==originalModelReceipts075Purpose||env.AGENT_STUDIO_ORIGINAL_MODEL_RECEIPTS075_STORY!==originalModelReceipts075Story||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_ORIGINAL_MODEL_RECEIPTS075_EXPECTED_HEAD!==env.GITHUB_SHA||!/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??''))refuse()
 for(const key of ['AGENT_STUDIO_ORIGINAL_MODEL_CONNECTIONS_CI','AGENT_STUDIO_ORIGINAL_MODEL_DRAFT_DISCOVERY_CI','AGENT_STUDIO_ORIGINAL_HOME_DESIGN_CI','AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI','AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI','AGENT_STUDIO_ORIGINAL_OVERVIEW_CI','AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI','AGENT_STUDIO_ORIGINAL_MONITOR073_CI'])if(Object.hasOwn(env,key))refuse()
 if(env.AGENT_STUDIO_PG18_MODEL_CONFIG_RECEIPTS_ENABLED!=='true')refuse()
 const policy=selectNativePg18UatCapabilities(env,true,'https://localhost:17443',uid)
 if(policy.configurationWrites!==true||policy.modelProbeUat!==false)refuse()
 return Object.freeze({policy:Object.freeze(policy),profile:'original-model-config-receipts075-disposable',target,head:env.GITHUB_SHA,origin:'https://localhost:17443',synthetic_only:true,production_GO:false})
}
