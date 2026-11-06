// Data-only public DTOs. Browser and API share no repository, Node transport,
// credential, authority flag or execution implementation through this module.
// A bounded 500-row sum stays within exact integer arithmetic, including tasks
// lasting longer than a day. This is an arithmetic bound, not a run timeout.
export const maxToolHubRecordedDurationMs=Math.floor(Number.MAX_SAFE_INTEGER/500)
export type RegistryEntry={name:string;title:string;description:string;version:string;status:'active'|'deprecated';remotes:{type:'streamable-http';url:string}[];packages:{registry:string;identifier:string;version:string}[];source_sha256:string}
export type RegistryPage={items:RegistryEntry[];next_cursor:string;query:string;source:'official_mcp_registry';is_execution_authority:false}
type ModelBinding={connection_id:string;connection_revision:number;model_id:string}
export type ToolTrialReceipt={request_id:string;purpose:'tool'|'registry_translation';source_kind:'builtin'|'http'|'mcp'|'registry_translation';target:
 |{kind:'builtin';tool:'calculate'|'summarize'|'knowledge_search'|'web_fetch'|'web_search'}
 |{kind:'http';connection_id:string;connection_revision:number}
 |{kind:'mcp';connection_id:string;connection_revision:number;tool_name:string;catalog_sha256:string}
 |{kind:'registry_translation';model_binding:ModelBinding;entries:{name:string;version:string;source_sha256:string}[]};
 request_sha256:string;arguments_sha256:string;graph_sha256:string;workflow_id:string;run_id:string;fee_confirmed:boolean;created_at:string;execution_mode:'workflow_native_v2';worker_started_by_api:false}
export type ToolHubInvocation={run_id:string;step_key:string;status:'started'|'succeeded'|'failed'|'unknown';arguments_sha256:string;origin:'trial'|'agent'|'workflow';trial_request_id:string|null;kind:'builtin'|'http'|'mcp'|'unavailable';tool:string;connection_id:string|null;created_at:string;recorded_duration_ms:number|null;error:'outcome_unknown'|'tool_failed'|null;retry_count:null;may_replay:false}
export type ToolHubInvocations={items:ToolHubInvocation[];next_after:string|null;scope:'owner_only';scan_limit:500;scanned:number;sampled:boolean;worker_liveness:'not_inferred';automatic_replay_allowed:false}
export type ToolHubStats={calls:number;started:number;succeeded:number;failed:number;unknown:number;tools:{kind:ToolHubInvocation['kind'];tool:string;calls:number;started:number;succeeded:number;failed:number;unknown:number;average_recorded_duration_ms:number|null;retry_count:null}[];retry_count:null;scope:'owner_only';sample_limit:500;sampled:boolean;metrics:'recorded_external_effects_only';worker_liveness:'not_inferred'}
export type ToolHubHarness={totals:{runs:number;succeeded:number;failed:number;cancelled:number;average_recorded_steps:number|null;average_completed_duration_ms:number|null;stuck_loop_failures:number;estimated_tokens:null;compressions:null;truncations:null;retries:null};scope:'owner_only';run_sample_per_kind:100;unrecorded_metrics:'unavailable';worker_liveness:'not_inferred'}
