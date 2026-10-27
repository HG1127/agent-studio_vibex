// Check the authenticated login before SET ROLE can hide its privileges.
// No login name, owner or role may be selected by a Worker RPC payload.
import type {SqlClient} from "./contracts.ts"

export type AgentAssessmentRole="agentstudio_review_worker"|"agentstudio_review_dispatch"
type Login={login:boolean;inherit:boolean;superuser:boolean;bypassrls:boolean;createdb:boolean;createrole:boolean;replication:boolean;initial_role:boolean}
type Membership={name:string;admin:boolean;inherit:boolean;set:boolean}
const refuse=():never=>{throw Error("agent_assessment_session_role_refused")}
export async function assertAgentAssessmentSession(db:SqlClient,expected:AgentAssessmentRole):Promise<void>{
  if(expected!=="agentstudio_review_worker"&&expected!=="agentstudio_review_dispatch")return refuse()
  const logins=(await db.query<Login>(
    "SELECT rolcanlogin AS login,rolinherit AS inherit,rolsuper AS superuser,rolbypassrls AS bypassrls,rolcreatedb AS createdb,rolcreaterole AS createrole,rolreplication AS replication,current_user=session_user AS initial_role "+
    "FROM pg_catalog.pg_roles WHERE rolname=session_user")).rows
  const login=logins[0]
  if(logins.length!==1||!login||login.login!==true||login.initial_role!==true||
    [login.inherit,login.superuser,login.bypassrls,login.createdb,login.createrole,login.replication].some(v=>v!==false))return refuse()
  // MEMBER sees all direct and transitive memberships, even when inherited
  // privilege use is disabled. One harmless-looking direct grant must not
  // conceal another group reachable through it.
  const reachable=(await db.query<{name:string}>(
    "SELECT r.rolname AS name FROM pg_catalog.pg_roles r WHERE r.rolname<>session_user AND pg_catalog.pg_has_role(session_user,r.oid,'MEMBER') ORDER BY r.rolname")).rows
  if(reachable.length!==1||reachable[0]?.name!==expected)return refuse()
  const direct=(await db.query<Membership>(
    "SELECT r.rolname AS name,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS \"set\" FROM pg_catalog.pg_auth_members m "+
    "JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles r ON r.oid=m.roleid WHERE member.rolname=session_user ORDER BY r.rolname,m.grantor")).rows
  const grant=direct[0]
  if(direct.length!==1||!grant||grant.name!==expected||grant.admin!==false||grant.inherit!==false||grant.set!==true)return refuse()
}
