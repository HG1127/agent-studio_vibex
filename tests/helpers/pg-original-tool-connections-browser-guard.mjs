import {requireAgentDesignGenuineCi} from '../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'
import {selectNativePg18UatCapabilities} from '../../services/pg-api/src/native-config-uat-policy.ts'
export const originalToolConnectionsPurpose='YES_DISPOSABLE_ORIGINAL_TOOL_CONNECTIONS_METADATA_ONLY'
export const originalToolConnectionsStory='original-tool-connections'
export function requireOriginalToolConnectionsCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentDesignGenuineCi(env,platform,uid),refuse=()=>{throw Error('original_tool_connections_admission_refused')}
 if(env.GITHUB_JOB!=='pg18-agent-design-browser'||env.AGENT_STUDIO_ORIGINAL_TOOL_CONNECTIONS_CI!==originalToolConnectionsPurpose||env.AGENT_STUDIO_ORIGINAL_TOOL_CONNECTIONS_STORY!==originalToolConnectionsStory||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_ORIGINAL_TOOL_CONNECTIONS_EXPECTED_HEAD!==env.GITHUB_SHA||!/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??''))refuse()
 for(const key of ['AGENT_STUDIO_ORIGINAL_MODEL_CONNECTIONS_CI','AGENT_STUDIO_ORIGINAL_MODEL_RECEIPTS075_CI','AGENT_STUDIO_ORIGINAL_MODEL_DRAFT_DISCOVERY_CI','AGENT_STUDIO_ORIGINAL_HOME_DESIGN_CI','AGENT_STUDIO_ORIGINAL_AGENT_RUN_QUEUED_CI','AGENT_STUDIO_ORIGINAL_RUN_DETAIL_QUEUED_CI','AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI','AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI'])if(Object.hasOwn(env,key))refuse()
 for(const key of Object.keys(env))if(/^AGENT_STUDIO_ORIGINAL_.*_CI$/.test(key)&&key!=='AGENT_STUDIO_ORIGINAL_TOOL_CONNECTIONS_CI'&&Object.hasOwn(env,key))refuse()
 const policy=selectNativePg18UatCapabilities(env,true,'https://localhost:17443',uid)
 if(policy.configurationWrites!==true||policy.modelProbeUat!==false||Object.entries(policy).some(([key,value])=>value===true&&!['configurationWrites'].includes(key)))refuse()
 return Object.freeze({profile:'original-tool-connections-metadata-disposable',target,head:env.GITHUB_SHA,origin:'https://localhost:17443',policy:Object.freeze(policy),scope:'http_metadata_only',actual_probe_complete:false,actual_genuine_acceptance:false,production_GO:false})
}
export const requireOriginalToolConnectionsBrowserCi=requireOriginalToolConnectionsCi
