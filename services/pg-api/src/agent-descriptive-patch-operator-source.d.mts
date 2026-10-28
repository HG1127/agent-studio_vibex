import type {GeneratedOperatorSnapshot} from './agent-generated-operator-source.mjs'

type Source={readonly path:string;readonly sha256:string}
export type DescriptivePatchOperatorSnapshot={
  readonly source_sha256:string
  readonly sql:string
  readonly body:string
  readonly manifest:{
    readonly format:'agent_descriptive_patch_operator_sources_v1'
    readonly latest_migration:'pg_v9_060'
    readonly default_fresh_latest:'pg_v9_050'
    readonly default_fresh_source_sha256:string
    readonly fresh_sources:readonly Source[]
    readonly predecessor:{readonly latest_migration:'pg_v9_059';readonly source_sha256:string;readonly manifest:GeneratedOperatorSnapshot['manifest']}
    readonly parser:{readonly name:'typescript';readonly version:'5.9.3';readonly sha256:string}
    readonly sql:{readonly path:string;readonly sha256:string;readonly body_sha256:string}
    readonly prosrc:Readonly<Record<string,string>>
    readonly sources:readonly Source[]
    readonly imports:readonly {readonly from:string;readonly to:string}[]
    readonly externals:readonly string[]
  }
}
export type DescriptivePatchOperatorPlan=DescriptivePatchOperatorSnapshot['manifest']&{
  readonly mode:'plan'
  readonly source_sha256:string
  readonly database:'agent_studio'
  readonly postgres_major:18
  readonly read_only:true
  readonly network_used:false
  readonly secret_read:false
  readonly initializes_database:false
  readonly services_started:false
  readonly writes_performed:false
  readonly installation_supported:false
  readonly recovery_supported:false
  readonly production_cutover_allowed:false
}
export const descriptivePatchOperatorPins:Readonly<Record<string,string>>
export function descriptivePatchOperatorSha(value:string|Uint8Array):string
export function descriptivePatchOperatorSqlBody(raw:string):string
export function captureDescriptivePatchOperatorSources():Promise<DescriptivePatchOperatorSnapshot>
export function assertDescriptivePatchOperatorSnapshot(snapshot:DescriptivePatchOperatorSnapshot,expected:string):void
export function descriptivePatchOperatorPlan(snapshot:DescriptivePatchOperatorSnapshot):DescriptivePatchOperatorPlan
export function parseDescriptivePatchOperatorArguments(argv:readonly string[]):Readonly<{mode:'plan'}>
export function runDescriptivePatchOperator(argv:readonly string[]):Promise<DescriptivePatchOperatorPlan>
