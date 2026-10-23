import type {SqlClient} from "./contracts.ts"
import {verifyKnowledgeHelperCredentials} from "./knowledge-content-privileges.ts"
type Kind="api"|"identity"|"broker"|"worker"
const memberships:Record<Kind,string[]>={api:["agentstudio_api"],identity:["agentstudio_bound_dispatch"],broker:["agentstudio_model_broker"],worker:["agentstudio_api","agentstudio_worker"]}
const tables=["mcp_connections","mcp_connection_headers","smithery_credentials","smithery_connections"]
const secrets:Record<string,string[]>={mcp_connection_headers:["value_ciphertext","value_nonce","value_tag"],smithery_credentials:["api_key_ciphertext","api_key_nonce","api_key_tag"]}
function refuse():never{throw Error("unsafe_optional_credential_boundary")}

// Always inspect installed optional tables, irrespective of execution flags.
// The caller owns a READ ONLY role transaction. Only pg_catalog and privilege
// predicates are queried; no employee rows or credential values are selected.
export async function verifyOptionalCredentialBoundary(db:SqlClient,kind:Kind):Promise<void>{
  if(!Object.hasOwn(memberships,kind))refuse()
  await verifyKnowledgeHelperCredentials(db)
  const relations=(await db.query<{id:number;name:string;kind:string;enabled:boolean;forced:boolean}>(
    "SELECT c.oid AS id,c.relname AS name,c.relkind AS kind,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced "+
    "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='agentstudio' AND c.relname=ANY($1::text[]) ORDER BY c.relname",[tables])).rows
  const memberRows=(await db.query<{name:string}>("SELECT rolname AS name FROM pg_catalog.pg_roles WHERE rolname<>session_user "+
    "AND pg_has_role(session_user,oid,'member')")).rows
  if(memberRows.length!==memberships[kind].length||memberRows.some(row=>!memberships[kind].includes(row.name)))refuse()
  if(!relations.length)return
  const present=new Set(relations.map(row=>row.name))
  if(relations.length!==present.size||relations.some(row=>!tables.includes(row.name)||row.kind!=="r"||row.enabled!==true||row.forced!==true)||
    !present.has("mcp_connections")||!present.has("mcp_connection_headers")||present.has("smithery_credentials")!==present.has("smithery_connections"))refuse()
  for(const relation of relations){
    // Resolve OIDs through pg_catalog so NOINHERIT logins need no schema USAGE
    // merely to be audited. Deny both table-wide and partial-column grants.
    const login=(await db.query<{access:boolean}>("SELECT (has_table_privilege(session_user,$1::oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR "+
      "has_any_column_privilege(session_user,$1::oid,'SELECT,INSERT,UPDATE,REFERENCES')) AS access",[relation.id])).rows[0]
    if(!login||login.access!==false)refuse()
    const denied=(await db.query<{name:string;access:boolean}>("SELECT rolname AS name,(has_table_privilege(oid,$1::oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR "+
      "has_any_column_privilege(oid,$1::oid,'SELECT,INSERT,UPDATE,REFERENCES')) AS access FROM pg_catalog.pg_roles "+
      "WHERE rolname IN ('agentstudio_worker','agentstudio_bound_dispatch','agentstudio_native_auth')",[relation.id])).rows
    if(!denied.some(row=>row.name==="agentstudio_worker")||!denied.some(row=>row.name==="agentstudio_bound_dispatch")||denied.some(row=>row.access!==false))refuse()
    const broker=(await db.query<{reads:boolean;writes:boolean}>("SELECT has_any_column_privilege('agentstudio_model_broker',$1::oid,'SELECT') AS reads,"+
      "(has_table_privilege('agentstudio_model_broker',$1::oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR "+
      "has_any_column_privilege('agentstudio_model_broker',$1::oid,'INSERT,UPDATE,REFERENCES')) AS writes",[relation.id])).rows[0]
    const columns=secrets[relation.name]
    if(!broker||broker.writes!==false||broker.reads!==Boolean(columns))refuse()
    if(columns){
      const selected=(await db.query<{name:string;bytes:boolean;api:boolean;broker:boolean}>("SELECT attname AS name,atttypid='bytea'::regtype AS bytes,"+
        "has_column_privilege('agentstudio_api',attrelid,attnum,'SELECT') AS api,"+
        "has_column_privilege('agentstudio_model_broker',attrelid,attnum,'SELECT') AS broker "+
        "FROM pg_catalog.pg_attribute WHERE attrelid=$1::oid AND attnum>0 AND NOT attisdropped AND attname=ANY($2::text[])",[relation.id,columns])).rows
      if(selected.length!==columns.length||selected.some(column=>!columns.includes(column.name)||column.bytes!==true||column.api!==false||column.broker!==true))refuse()
    }
  }
}
