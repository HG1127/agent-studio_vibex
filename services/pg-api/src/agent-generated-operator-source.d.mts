export type GeneratedOperatorSnapshot={readonly source_sha256:string;readonly sql:string;readonly body:string;readonly manifest:{readonly format:string;readonly latest_migration:string;readonly default_fresh_latest:string;readonly default_fresh_source_sha256:string;readonly fresh_sources:readonly {readonly path:string;readonly sha256:string}[];readonly parser:{readonly name:string;readonly version:string;readonly sha256:string};readonly sql:{readonly path:string;readonly sha256:string;readonly body_sha256:string};readonly prosrc:Readonly<Record<string,string>>;readonly sources:readonly {readonly path:string;readonly sha256:string}[];readonly imports:readonly {readonly from:string;readonly to:string}[];readonly externals:readonly string[]}}
export const generatedOperatorPins:Readonly<Record<string,string>>
export function generatedOperatorSha(value:string|Uint8Array):string
export function generatedOperatorSqlBody(raw:string):string
export function captureGeneratedOperatorSources():Promise<GeneratedOperatorSnapshot>
export function assertGeneratedOperatorSnapshot(snapshot:GeneratedOperatorSnapshot,expected:string):void
export function assertGeneratedOperatorDeployment(snapshot:GeneratedOperatorSnapshot):void
export function generatedOperatorPlan(snapshot:GeneratedOperatorSnapshot):Record<string,unknown>
