// Explicit named Quality089 predecessor only. Ordinary075 and frozen auditors stay unchanged.
// Source-derived terminal checks/SQL are retained; the installed089 knowledge/release delta
// is checked by the existing strict named Quality089 parent audit on the same client.
import {hostedQuality089Phase,hostedQuality089Sync} from './hosted-profile-diagnostic.mjs'
import type {SqlClient,SqlPool} from './contracts.ts'
import {verifyApprovalDelegationCredentials} from './approval-delegation-audit.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {verifyAgentCallerCredentials} from './agent-caller-audit.ts'
import {verifyOwnerToolTrialCredentials} from './owner-tool-trial-audit.ts'
import {verifyModelConfigReceiptSchema075} from './model-config-receipt-schema075.ts'
import {verifyQuality089KnowledgeHelperCredentials} from './quality089-knowledge-parent-audit.ts'

type Kind="api"|"identity"|"broker"|"worker"
const memberships:Record<Kind,string[]>={api:["agentstudio_api"],identity:["agentstudio_bound_dispatch"],broker:["agentstudio_model_broker"],worker:["agentstudio_api","agentstudio_worker"]}
const tables=["mcp_connections","mcp_connection_headers","smithery_credentials","smithery_connections"]
const secrets:Record<string,string[]>={mcp_connection_headers:["value_ciphertext","value_nonce","value_tag"],smithery_credentials:["api_key_ciphertext","api_key_nonce","api_key_tag"]}
function refuse():never{throw Error("unsafe_optional_credential_boundary")}

async function verifyOptionalCredentialBoundary(db:SqlClient,kind:Kind):Promise<void>{
  if(!Object.hasOwn(memberships,kind))refuse()
  await verifyQuality089KnowledgeHelperCredentials(db)
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

async function verifyDatabaseRole(pool:SqlPool):Promise<void> {
  const client=await pool.connect()
  try{
    const roles=await client.query<{username:string;admin:boolean;bypass:boolean}>(
      "SELECT session_user AS username,rolsuper AS admin,rolbypassrls AS bypass "+
      "FROM pg_roles WHERE rolname=session_user",
    )
    const role=roles.rows[0]
    if(!role || role.admin || role.bypass || role.username==="agentstudio_admin")
      throw new Error("unsafe_database_role")
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    try {
      await client.query("SET LOCAL ROLE agentstudio_api")
      const roleResult=await client.query<{name:string}>(
        "SELECT current_user AS name",
      )
      if(roleResult.rows[0]?.name!=="agentstudio_api")
        throw new Error("database_api_role_unavailable")
      await client.query("SET LOCAL search_path=pg_catalog")
      await verifyOptionalCredentialBoundary(client,"api")
    } finally {await client.query("ROLLBACK")}
  } finally {client.release()}
}

export async function auditQuality089ModelConfigReceipt075After069(pool:SqlPool):Promise<void>{
 return await hostedQuality089Phase('receipt075_body',async()=>{
 await hostedQuality089Phase('receipt075_role',()=>verifyDatabaseRole(pool))
 const db=await hostedQuality089Phase('receipt075_connect',()=>pool.connect());let begun=false,primary:unknown
 try{
  await hostedQuality089Phase('receipt075_begin',()=>db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));begun=true
  const session=(await hostedQuality089Phase('receipt075_session_query',()=>db.query<{safe:boolean}>("SELECT current_user=session_user AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AND "+
   "(SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member=r.oid)=1 AND (SELECT count(*) FROM pg_catalog.pg_roles p WHERE p.oid<>r.oid AND pg_has_role(r.oid,p.oid,'MEMBER'))=1 AND EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid AND p.rolname='agentstudio_api' AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option) AS safe FROM pg_catalog.pg_roles r WHERE r.rolname=session_user"))).rows
  hostedQuality089Sync('receipt075_session_check',()=>{if(session.length!==1||session[0]?.safe!==true)throw Error('model_config_receipt075_actual_api_login_required')})
  await hostedQuality089Phase('receipt075_set_role',()=>db.query('SET LOCAL ROLE agentstudio_api'));await hostedQuality089Phase('receipt075_search_path',()=>db.query("SET LOCAL search_path=pg_catalog,public"));await hostedQuality089Phase('receipt075_lock_timeout',()=>db.query("SET LOCAL lock_timeout='3s'"));await hostedQuality089Phase('receipt075_statement_timeout',()=>db.query("SET LOCAL statement_timeout='8s'"))
  if(await hostedQuality089Phase('receipt075_approval',()=>verifyApprovalDelegationCredentials(db))!==true||await hostedQuality089Phase('receipt075_devices',()=>verifyNativeLocalDeviceSchema(db))!==true||await hostedQuality089Phase('receipt075_callers',()=>verifyAgentCallerCredentials(db))!==true||await hostedQuality089Phase('receipt075_trials',()=>verifyOwnerToolTrialCredentials(db))!==true)throw Error('model_config_receipt075_original069_audit_required')
  await hostedQuality089Phase('receipt075_schema',()=>verifyModelConfigReceiptSchema075(db))
 }catch(error){primary=error;throw error}finally{try{if(begun)await hostedQuality089Phase('receipt075_rollback',()=>db.query('ROLLBACK'))}catch{if(primary===undefined)throw Error('model_config_receipt075_startup_rollback_required')}finally{hostedQuality089Sync('receipt075_release',()=>db.release())}}
 })
}
