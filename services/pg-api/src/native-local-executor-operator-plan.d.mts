export const executorOperatorAbi:Readonly<{login:'agentstudio_local_executor_login';group:'agentstudio_local_executor';unit:'agentstudio-pg18-native.service';secret:'local-executor.secret';vaultFile:string;serviceFile:string;envKey:'AGENT_STUDIO_PG18_LOCAL_EXECUTOR_PASSWORD_FILE'}>
export const disabledExecutorReservationSql:string
export const executorOperatorTargetGuardSql:string
export function executorConnectGrant(database:'agent_studio'|'agentstudio_pg18_ci'):string
export function executorActivationStatement(verifier:string):string
export function inspectExecutorHba(rows:unknown):{loopback_scram:boolean;local_reject:boolean;remote_ipv4_reject:boolean;remote_ipv6_reject:boolean;safe:boolean}
export function localExecutorOperatorPlan():Record<string,unknown>
