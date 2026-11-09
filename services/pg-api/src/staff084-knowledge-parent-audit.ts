import {hostedStaff084Phase} from './hosted-profile-diagnostic.mjs'
import type {SqlClient} from "./contracts.ts"
import {verifyEmployeeStaff084ApiClient} from "./employee-staff084-profile.mjs"
import {verifyQuality089AgentReleaseCredentials} from "./quality089-release-parent-audit.ts"
export type Staff084StatisticsSelection={profile:string;source_sha256:string;target:{system_identifier:string;database_oid:string}}
// Named Staff source excludes legacy declaration 1.
import {verifyKnowledgeEmbeddingCredentials} from "./knowledge-embedding-privileges.ts"
// The named helper does not import the unrelated keyword facade.
// The named helper does not import the unrelated agent facade.
// The named helper does not import the unrelated lineage facade.
import {verifyScheduleCredentials} from "./schedule-runtime-audit.ts"
import {verifyAgentCollaborationCredentials} from "./agent-collaboration-audit.ts"
import {verifyAgentReleaseCredentials} from "./agent-release-audit.ts"
import {verifyAgentHumanInputCredentials} from "./agent-human-input-audit.ts"
const helpers=["agentstudio_knowledge_acl","agentstudio_knowledge_content"]
function refuse():never{throw Error("unsafe_knowledge_content_privileges")}
// Also called by the ordinary startup inspector when the UI capability is off.
// No employee values are read and private schemas need no login USAGE.
export async function verifyStaff084KnowledgeHelperCredentials(db:SqlClient,selected:Staff084StatisticsSelection):Promise<void>{
  await hostedStaff084Phase('knowledge_parent_01',()=>verifyAgentHumanInputCredentials(db))
  const actual=await hostedStaff084Phase('knowledge_parent_02',()=>verifyEmployeeStaff084ApiClient(db,selected))
  if(actual.quality)await hostedStaff084Phase('knowledge_parent_03',()=>verifyQuality089AgentReleaseCredentials(db));else await hostedStaff084Phase('knowledge_parent_04',()=>verifyAgentReleaseCredentials(db))
  await hostedStaff084Phase('knowledge_parent_05',()=>verifyAgentCollaborationCredentials(db))
  await hostedStaff084Phase('knowledge_parent_06',()=>verifyScheduleCredentials(db))
  await hostedStaff084Phase('knowledge_parent_07',()=>verifyKnowledgeEmbeddingCredentials(db))
  const roles=(await hostedStaff084Phase('knowledge_parent_08',()=>db.query<{name:string;safe:boolean;members:number}>("SELECT rolname AS name,(NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication) AS safe,"+
    "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid) AS members "+
    "FROM pg_catalog.pg_roles r WHERE rolname=ANY($1::text[])",[helpers]))).rows
  if(!roles.length)return
  if(roles.some(role=>!role.safe||role.members!==0))refuse()
  const tables=(await hostedStaff084Phase('knowledge_parent_09',()=>db.query<{id:number;schema:string;name:string}>("SELECT c.oid AS id,n.nspname AS schema,c.relname AS name "+
    "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE "+
    "(n.nspname='agentstudio' AND c.relname IN ('model_connections','tool_connection_headers','mcp_connection_headers','smithery_credentials')) "+
    "OR (n.nspname='agentstudio_auth' AND c.relname IN ('accounts','sessions'))"))).rows
  for(const role of roles)for(const table of tables){
    const predicate=role.name===helpers[0]&&table.schema==="agentstudio_auth"&&table.name==="accounts"
    const state=(await hostedStaff084Phase('knowledge_parent_10',()=>db.query<{read:boolean;write:boolean}>("SELECT has_any_column_privilege($1::text,$2::oid,'SELECT') AS read,"+
      "(has_table_privilege($1::text,$2::oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR "+
      "has_any_column_privilege($1::text,$2::oid,'INSERT,UPDATE,REFERENCES')) AS write",[role.name,table.id]))).rows[0]
    if(!state||state.write||(!predicate&&state.read))refuse()
    if(predicate){
      const columns=(await hostedStaff084Phase('knowledge_parent_11',()=>db.query<{name:string;read:boolean}>("SELECT attname AS name,has_column_privilege($1::text,attrelid,attnum,'SELECT') AS read "+
        "FROM pg_catalog.pg_attribute WHERE attrelid=$2::oid AND attnum>0 AND NOT attisdropped",[role.name,table.id]))).rows
      if(!columns.some(c=>c.name==="user_id"&&c.read)||!columns.some(c=>c.name==="enabled"&&c.read)||
        columns.some(c=>!["user_id","enabled"].includes(c.name)&&c.read))refuse()
    }
  }
}