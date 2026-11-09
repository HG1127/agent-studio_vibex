import {requireAgentDesignGenuineCi} from '../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'
import {permitNativePg18BusinessUatRequest,selectNativePg18UatCapabilities} from '../../services/pg-api/src/native-config-uat-policy.ts'
export const originalVersionReleasePurpose='YES_DISPOSABLE_ORIGINAL_VERSION_RELEASE_ONLY'
export const originalVersionReleaseStory='original-version-release'
export function requireOriginalVersionReleaseCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentDesignGenuineCi(env,platform,uid),fail=()=>{throw Error('original_version_release_browser_admission_refused')}
 if(env.GITHUB_JOB!=='pg18-agent-design-browser'||env.AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_CI!==originalVersionReleasePurpose||env.AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_STORY!==originalVersionReleaseStory||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_EXPECTED_HEAD!==env.GITHUB_SHA||!/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??''))fail()
 for(const key of Object.keys(env))if(/^AGENT_STUDIO_ORIGINAL_.*_CI$/.test(key)&&key!=='AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_CI'&&env[key]!==undefined)fail()
 for(const key of ['AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED','AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED','AGENT_STUDIO_PG18_KNOWLEDGE_TOOL_UAT_ENABLED','AGENT_STUDIO_PG18_MODEL_CONFIG_RECEIPTS_ENABLED','AGENT_STUDIO_PG18_MONITOR_LIVE_ENABLED','AGENT_STUDIO_PG18_ORDINARY_CASE_RUNS_ENABLED'])if(Object.hasOwn(env,key))fail()
 const policy=selectNativePg18UatCapabilities(env,true,'https://localhost:17443',uid)
 for(const key of ['configurationWrites','runApprovalUat','workflowExecutionUat','workflowV2ExecutionUat','autonomousAgentUat','agentMemoryUat','agentFeedbackUat','knowledgeSharingUat'])if(policy[key]!==true)fail()
 for(const key of ['boundModelExecutionUat','modelProbeUat','knowledgeToolExecutionUat'])if(policy[key]===true)fail()
 return Object.freeze({target,policy:Object.freeze(policy),head:env.GITHUB_SHA,origin:'https://localhost:17443',profile:'original-version-release-owner-receipts-pending-approval',synthetic_only:true,actual_worker_completion_contract:false,production_GO:false})
}

/** Uses the actual global Native allowlist. A facade-only test cannot bypass
 * the real Native server/own-operations wrapper. No files/SQL/processes open. */
export function originalVersionReleaseServiceContractGaps(policy){
 const id='11111111-1111-4111-8111-111111111111',v='22222222-2222-4222-8222-222222222222',base='/api/v2/original-ui/agent-releases/'+id,closed={...policy,configurationWrites:false,autonomousAgentUat:false}
 const onlyWritesClosed={...policy,configurationWrites:false},onlyAgentClosed={...policy,autonomousAgentUat:false}
 const required=[['GET',base,policy,true],['GET',base+'/versions/'+v,policy,true],['GET',base+'/acceptance/'+v,policy,true],['GET',base+'/receipts/'+v,policy,true],['GET',base+'/receipts/'+v,closed,true],['POST',base+'/change',policy,true],['POST',base+'/acceptance',policy,true],['POST',base+'/change',closed,false],['POST',base+'/acceptance',closed,false],['POST',base+'/receipts/'+v,policy,false],['POST',base+'/receipts/'+v,closed,false],['GET',base,closed,true],['GET',base+'/versions/'+v,closed,true],['GET',base+'/acceptance/'+v,closed,true],['POST',base+'/change',onlyWritesClosed,false],['POST',base+'/acceptance',onlyWritesClosed,false],['POST',base+'/change',onlyAgentClosed,true],['POST',base+'/acceptance',onlyAgentClosed,false],...['/confirm','/receipts','/versions','/acceptance/','/change/'+v,'/receipts/'+v+'/confirm'].flatMap(suffix=>[['GET',base+suffix,policy,false],['POST',base+suffix,policy,false]]),['PATCH',base+'/change',policy,false],['DELETE',base+'/versions/'+v,policy,false],['HEAD',base,policy,false],['GET',base+'/receipts/'+v+'?owner='+v,policy,false],['GET',base.replace('/agent-releases','/%61gent-releases'),policy,false]]
 return required.flatMap(([method,path,p,expected])=>permitNativePg18BusinessUatRequest(path,method,p)===expected?[]:[{method,path,configuration_writes:p.configurationWrites===true,expected,actual:permitNativePg18BusinessUatRequest(path,method,p)}])
}
export function assertOriginalVersionReleaseServiceContracts(policy){const missing=originalVersionReleaseServiceContractGaps(policy);if(missing.length)throw Error('original_version_release_global_native_contract_missing:'+missing[0].method+':'+missing[0].path);return true}
