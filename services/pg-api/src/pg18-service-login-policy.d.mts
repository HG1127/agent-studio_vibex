export type ServiceLoginKind="api"|"worker"|"identity"|"broker"|"index-worker"|"index-broker"
export type ServiceLoginDefinition=Readonly<{kind:ServiceLoginKind;login:string;groups:readonly string[]}>
export const serviceLoginKinds:readonly ServiceLoginKind[]
export const serviceLogins:Readonly<Record<ServiceLoginKind,ServiceLoginDefinition>>
export function serviceLoginDefinition(kind:string):ServiceLoginDefinition
export function serviceLoginReceiptVersion(kind:ServiceLoginKind):string
export function checkedServiceLoginReceipt(version:string,description:string,sourceSha:string):Readonly<{format:string;kind:ServiceLoginKind;login:string;groups:readonly string[];source_sha256:string;operator:string;activated_at:string}>
export const serviceLoginTargetGuardSql:string
