// Only the explicit named stats/profile path selects this independent predecessor audit.
import type {SqlClient} from "./contracts.ts"
import {inspectEmployeeGovernance} from "./native-employee-governance-audit.mjs"
import {verifyKnowledgeEmbeddingCredentials} from "./knowledge-embedding-privileges.ts"
import {verifyScheduleCredentials} from "./schedule-runtime-audit.ts"
import {verifyAgentCollaborationCredentials} from "./agent-collaboration-audit.ts"
import {verifyAgentReleaseCredentials} from "./agent-release-audit.ts"
import {verifyAgentHumanInputCredentials} from "./agent-human-input-audit.ts"
import {verifyQuality089AgentReleaseCredentials} from './quality089-release-parent-audit.ts'
const quality089KnowledgeParentToken=Symbol('named_quality089_knowledge_parent')
const helpers=["agentstudio_knowledge_acl","agentstudio_knowledge_content"]
function refuse():never{throw Error("unsafe_knowledge_content_privileges")}
async function verifyKnowledgeHelperCredentials(db:SqlClient,profileToken?:symbol):Promise<void>{
  const qualityMode=profileToken!==undefined&&profileToken===quality089KnowledgeParentToken;if(profileToken!==undefined&&!qualityMode)refuse()
  await verifyAgentHumanInputCredentials(db)
  await inspectEmployeeGovernance(db)
  if(qualityMode)await verifyQuality089AgentReleaseCredentials(db);else await verifyAgentReleaseCredentials(db)
  await verifyAgentCollaborationCredentials(db)
  await verifyScheduleCredentials(db)
  await verifyKnowledgeEmbeddingCredentials(db)
  const roles=(await db.query<{name:string;safe:boolean;members:number}>("SELECT rolname AS name,(NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication) AS safe,"+
    "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid) AS members "+
    "FROM pg_catalog.pg_roles r WHERE rolname=ANY($1::text[])",[helpers])).rows
  if(!roles.length)return
  if(roles.some(role=>!role.safe||role.members!==0))refuse()
  const tables=(await db.query<{id:number;schema:string;name:string}>("SELECT c.oid AS id,n.nspname AS schema,c.relname AS name "+
    "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE "+
    "(n.nspname='agentstudio' AND c.relname IN ('model_connections','tool_connection_headers','mcp_connection_headers','smithery_credentials')) "+
    "OR (n.nspname='agentstudio_auth' AND c.relname IN ('accounts','sessions'))")).rows
  for(const role of roles)for(const table of tables){
    const predicate=role.name===helpers[0]&&table.schema==="agentstudio_auth"&&table.name==="accounts"
    const state=(await db.query<{read:boolean;write:boolean}>("SELECT has_any_column_privilege($1::text,$2::oid,'SELECT') AS read,"+
      "(has_table_privilege($1::text,$2::oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR "+
      "has_any_column_privilege($1::text,$2::oid,'INSERT,UPDATE,REFERENCES')) AS write",[role.name,table.id])).rows[0]
    if(!state||state.write||(!predicate&&state.read))refuse()
    if(predicate){
      const columns=(await db.query<{name:string;read:boolean}>("SELECT attname AS name,has_column_privilege($1::text,attrelid,attnum,'SELECT') AS read "+
        "FROM pg_catalog.pg_attribute WHERE attrelid=$2::oid AND attnum>0 AND NOT attisdropped",[role.name,table.id])).rows
      if(!columns.some(c=>c.name==="user_id"&&c.read)||!columns.some(c=>c.name==="enabled"&&c.read)||
        columns.some(c=>!["user_id","enabled"].includes(c.name)&&c.read))refuse()
    }
  }
}
export async function verifyQuality089KnowledgeHelperCredentials(db:SqlClient):Promise<void>{await verifyKnowledgeHelperCredentials(db,quality089KnowledgeParentToken)}
