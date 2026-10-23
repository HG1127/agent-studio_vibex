export type FreshRuntimeSnapshot=Readonly<{
  baseline:Readonly<{hash:string;sql:string}>;
  steps:readonly Readonly<{path:string;version:string;sha256:string;sql:string}>[];
  sources:readonly Readonly<{path:string;sha256:string;version?:string;versions?:readonly string[]}>[];
  versions:readonly string[];tables:readonly string[];source_sha256:string;
}>
export const freshRuntimeReceipt:"pg18_fresh_runtime_001"
export const freshRuntimeRoles:readonly string[]
export function freshRuntimeSqlBody(raw:string):string
export function captureFreshRuntimeSources():FreshRuntimeSnapshot
export function freshRuntimePlan(snapshot:FreshRuntimeSnapshot):Record<string,unknown>
