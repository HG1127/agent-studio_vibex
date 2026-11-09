import {requireAgentDesignGenuineCi} from '../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'
export const originalQueuedStories=Object.freeze({'original-agent-run-queued':{key:'AGENT_STUDIO_ORIGINAL_AGENT_RUN_QUEUED_CI',value:'YES_DISPOSABLE_ORIGINAL_AGENT_RUN_QUEUED_ONLY'},'original-run-detail-queued':{key:'AGENT_STUDIO_ORIGINAL_RUN_DETAIL_QUEUED_CI',value:'YES_DISPOSABLE_ORIGINAL_RUN_DETAIL_QUEUED_ONLY'}})
export function requireOriginalRunQueuedBrowserCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentDesignGenuineCi(env,platform,uid),story=env.AGENT_STUDIO_ORIGINAL_RUN_QUEUED_STORY,profile=originalQueuedStories[story]
 if(!profile||env.GITHUB_JOB!=='pg18-agent-design-browser'||env[profile.key]!==profile.value||env.AGENT_STUDIO_ORIGINAL_RUN_QUEUED_EXPECTED_HEAD!==env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||!/^refs\/heads\/codex\/pg18-(worker-heartbeat|agent-design)-[a-zA-Z0-9_-]+$/.test(env.GITHUB_REF??''))throw Error('refuse_original_run_queued_purpose')
 for(const key of Object.keys(env))if(env[key]!==undefined&&/^(AGENT_STUDIO_ORIGINAL_.*_CI|AGENT_STUDIO_NATIVE_.*_CI)$/.test(key)&&key!==profile.key)throw Error('refuse_mixed_original_run_queued_purpose')
 if(env.AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED!==undefined||env.AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED!==undefined||env.AGENT_STUDIO_PG18_KNOWLEDGE_TOOL_UAT_ENABLED!==undefined)throw Error('refuse_original_run_queued_external_execution')
 return Object.freeze({target,story,head:env.GITHUB_SHA,origin:'https://localhost:17443',profile:'original-native-queued-runs-no-execution',Native_timeout_ms:8000,worker_ticks:0,provider_calls:0,actual_genuine_acceptance:false,production_GO:false})
}
