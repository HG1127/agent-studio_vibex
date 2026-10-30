// Optional064 candidate. No loader until Root supplies the actual DB auditor.
import type {SqlClient, SqlPool} from './contracts.ts'
export const agentPlanWorkflowPrivateRoute='/__internal/v1/agent-plan-workflow/dispatch' as const
export const agentPlanWorkflowNativeApproval='APPROVE_DISPOSABLE_PG18_NATIVE_AGENT_PLAN_WORKFLOW_ONLY' as const
export const agentPlanWorkflowExecutionApproval='APPROVE_DISPOSABLE_PG18_AGENT_PLAN_WORKFLOW_EXECUTION_ONLY' as const
export const agentPlanWorkflowPrivateRequestBytes=2048
export const agentPlanWorkflowPrivateReplyBytes=2048
/** Trusted server dependency: verify real064 definitions, ownership, ACLs,
 * dedicated roles, source/envelope reads and durable one-use reservation on
 * THIS original client. Never accept an auditor from HTTP or ordinary data. */
export type AgentPlanWorkflowAuditVerifier=(db:SqlClient)=>Promise<boolean>
export async function requireAgentPlanWorkflowAudit(db:SqlClient,audit?:AgentPlanWorkflowAuditVerifier):Promise<void>{
 if(typeof audit!=='function'||await audit(db)!==true)throw Error('agent_plan_workflow_actual_auditor_required')
}
export function selectNativeAgentPlanWorkflowCapabilities(env:Record<string,string|undefined>,listen:boolean,allowedOrigin:string,configurationWrites:boolean){
 const keys=['AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_AVAILABLE','AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SUBMISSIONS_ENABLED','AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SAVES_ENABLED'] as const
 const values=keys.map(key=>env[key]),approval=env.AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_APPROVED
 if(values.every(v=>v===undefined)&&approval===undefined)return {available:false,submissions:false,saves:false}
 let originValid=false;try{const url=new URL(allowedOrigin);originValid=url.protocol==='https:'&&url.origin===allowedOrigin}catch{}
 if(!listen||!originValid||values.some(v=>v!==undefined&&v!=='true')||values[0]!=='true'||approval!==agentPlanWorkflowNativeApproval||(values[1]==='true'||values[2]==='true')&&configurationWrites!==true)throw Error('agent_plan_workflow_native_opt_in_refused')
 return {available:true,submissions:values[1]==='true',saves:values[2]==='true'}
}
export function selectAgentPlanWorkflowServiceOptIn(env:Record<string,string|undefined>):boolean{
 const enabled=env.AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_EXECUTION_ENABLED,approval=env.AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_EXECUTION_APPROVED
 if(enabled===undefined&&approval===undefined)return false
 if(enabled!=='true'||approval!==agentPlanWorkflowExecutionApproval)throw Error('agent_plan_workflow_service_not_approved')
 return true
}
export function agentPlanWorkflowExecutionEnabled(options:{executionEnabled?:boolean;executionApproval?:string}={}):boolean{
 if(options.executionEnabled===undefined||options.executionEnabled===false)return false
 if(options.executionEnabled!==true||options.executionApproval!==agentPlanWorkflowExecutionApproval)throw Error('agent_plan_workflow_execution_disabled')
 return true
}
export type AgentPlanWorkflowDatabaseRole='agentstudio_plan_workflow_worker'|'agentstudio_plan_workflow_dispatch'
/** Inspect authenticated LOGIN before SET ROLE, including the target role.
 * MEMBER reachability catches transitive extra privileges as well as grants. */
export async function assertAgentPlanWorkflowSession(db:SqlClient,expected:AgentPlanWorkflowDatabaseRole):Promise<void>{
 const refuse=():never=>{throw Error('agent_plan_workflow_session_role_refused')}
 if(expected!=='agentstudio_plan_workflow_worker'&&expected!=='agentstudio_plan_workflow_dispatch')return refuse()
 const flags='rolcanlogin AS login,rolinherit AS inherit,rolsuper AS superuser,rolbypassrls AS bypassrls,rolcreatedb AS createdb,rolcreaterole AS createrole,rolreplication AS replication'
 const rows=(await db.query<Record<string,unknown>>('SELECT '+flags+',current_user=session_user AS initial_role FROM pg_catalog.pg_roles WHERE rolname=session_user')).rows,r=rows[0]
 const safe=(v:Record<string,unknown>)=>[v.inherit,v.superuser,v.bypassrls,v.createdb,v.createrole,v.replication].every(x=>x===false)
 if(rows.length!==1||!r||r.login!==true||r.initial_role!==true||!safe(r))return refuse()
 const targets=(await db.query<Record<string,unknown>>('SELECT '+flags+' FROM pg_catalog.pg_roles WHERE rolname=$1::text',[expected])).rows,t=targets[0]
 if(targets.length!==1||!t||t.login!==false||!safe(t))return refuse()
 const reachable=(await db.query<{name:string}>("SELECT r.rolname AS name FROM pg_catalog.pg_roles r WHERE r.rolname<>session_user AND pg_catalog.pg_has_role(session_user,r.oid,'MEMBER') ORDER BY r.rolname")).rows
 if(reachable.length!==1||reachable[0]?.name!==expected)return refuse()
 const direct=(await db.query<{name:string;admin:boolean;inherit:boolean;set:boolean}>('SELECT r.rolname AS name,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS "set" FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles r ON r.oid=m.roleid WHERE member.rolname=session_user ORDER BY r.rolname,m.grantor')).rows,g=direct[0]
 if(direct.length!==1||!g||g.name!==expected||g.admin!==false||g.inherit!==false||g.set!==true)return refuse()
}
export async function inspectAgentPlanWorkflowApiPool(pool:SqlPool,audit:AgentPlanWorkflowAuditVerifier):Promise<void>{
 const db=await pool.connect();let begun=false
 try{await db.query('BEGIN READ ONLY');begun=true;await db.query('SET LOCAL ROLE agentstudio_api');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='8s'")
  if((await db.query<{role:string}>('SELECT current_user AS role')).rows[0]?.role!=='agentstudio_api')throw Error('agent_plan_workflow_api_role_refused')
  await requireAgentPlanWorkflowAudit(db,audit)
 }finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
}
