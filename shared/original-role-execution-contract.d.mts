export const ORIGINAL_ROLE_PROTOCOL:'original_roles_pinned_v1'
export type OriginalRoleSkillRef={id:string;version:number;hash:string}
export type OriginalRole={id:string;name:string;responsibility:string;tasks:string[];inputs:string[];deliverables:string[];depends_on:string[];tools:string[];done_criteria:string[];skill_refs:OriginalRoleSkillRef[]}
export type OriginalRoleCapability={id:string;title:string;purpose:string;kind:'web_search'|'web_fetch'|'knowledge'|'calculate'|'text'|'document'|'browser'|'desktop'|'integration'|'custom';access:'read'|'write';required:boolean;role_ids:string[];search_terms:string[];suggested_tool_ids:string[]}
export type OriginalRoleExtension={protocol:typeof ORIGINAL_ROLE_PROTOCOL;roles:OriginalRole[];capability_requirements:OriginalRoleCapability[]}
export type OriginalRoleCapabilityBinding={capability_id:string;role_id:string;tool:string;signature:string;local_tools:string[]}
export type OriginalRolePin={protocol:typeof ORIGINAL_ROLE_PROTOCOL;owner_user_id:string;run_id:string;spec_id:string;spec_revision:number;base_spec:unknown;base_spec_sha256:string;extension:OriginalRoleExtension;skills:(OriginalRoleSkillRef&{role_id:string;name:string;description:string;content:string})[];planning_mode?:'reviewed_v1';capability_bindings?:OriginalRoleCapabilityBinding[]}
export function roleContractError():never
export function roleObject(raw:unknown,keys:string[],optional?:string[]):Record<string,unknown>
export function roleText(raw:unknown,max:number,nonempty?:boolean):string
export function roleSha(raw:unknown):string
export function roleSkillRef(raw:unknown):OriginalRoleSkillRef
export function parseOriginalRoleExtension(raw:unknown,grants:string[]):OriginalRoleExtension
export function parseOriginalRoleUiExtension(raw:unknown,grants:string[]):OriginalRoleExtension
export function parseRoleCapabilityBindings(raw:unknown,extension:OriginalRoleExtension,grants:string[]):OriginalRoleCapabilityBinding[]
export function parseOriginalRolePin(raw:unknown,grants:string[],scope?:{owner_user_id:string;run_id:string;spec_id:string;spec_revision:number}):OriginalRolePin
export function parseOriginalRoleDecision(raw:string):{action:'answer';answer:string}|{action:'tool';tool:string;params:Record<string,unknown>}|{action:'ask_user';question:string}|{action:'role_complete';role_id:string;role_output:string}
