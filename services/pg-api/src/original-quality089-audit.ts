import {createHash} from 'node:crypto'
import {employeeUi078LedgerRpcAuditSql} from './pg18-employee-ui078-catalog.mjs'
import {HttpError,type SqlClient,type SqlPool} from './contracts.ts'
import {hostedQuality089SchemaRefusal} from './hosted-profile-diagnostic.mjs'
import {assertOriginalQuality089Catalog,originalQuality089CatalogSQL} from './original-quality089-catalog.mjs'
// Same body seal used by the unchanged employee UI078 parent snapshot.
const originalQuality089LedgerRpcBodySha256='ec9b8350a95564a7400db3a8923f4d3cfebebc5f7fbb07eabaf46f7c3f5d421d'
/** Extension audit only; the original composed parent audit remains mandatory. */
export async function verifyOriginalQuality089Schema(db:SqlClient):Promise<void>{
 let quality089SchemaStage='schema_query_01'
 try{await db.query('SET LOCAL search_path=pg_catalog');quality089SchemaStage='ledger_rpc_audit';const rpc=(await db.query<{ok:boolean;source:string}>(employeeUi078LedgerRpcAuditSql)).rows;quality089SchemaStage='ledger_rpc_identity';const marker=rpc[0];if(!Array.isArray(rpc)||rpc.length!==1||!marker||marker.ok!==true||typeof marker.source!=='string'||marker.source.length!==269||createHash('sha256').update(marker.source).digest('hex')!==originalQuality089LedgerRpcBodySha256)throw Error('original_quality_ledger_rpc_unconfirmed');quality089SchemaStage='schema_query_02';const rows=(await db.query<{value:unknown}>(originalQuality089CatalogSQL)).rows;quality089SchemaStage='catalog_rows';if(rows.length!==1)throw Error();quality089SchemaStage='catalog_assert';assertOriginalQuality089Catalog(rows[0]?.value)}catch(error){if(quality089SchemaStage!=='catalog_assert')hostedQuality089SchemaRefusal(quality089SchemaStage,error);throw new HttpError(503,'original_quality_schema_unavailable')}
}
export async function inspectOriginalQuality089Startup(pool:SqlPool):Promise<void>{
 const db=await pool.connect();let begun=false,discard=false,auditFailed=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await db.query('SET LOCAL ROLE agentstudio_api');await verifyOriginalQuality089Schema(db)}
 catch(error){auditFailed=true;if(!begun)discard=true;throw error}
 finally{
  if(begun)try{await db.query('ROLLBACK')}catch{discard=true}
  try{if(discard)Reflect.apply(db.release,db,[true]);else db.release()}catch{if(!auditFailed&&!discard)throw new HttpError(503,'original_quality_startup_release_unconfirmed')}
  if(discard&&!auditFailed)throw new HttpError(503,'original_quality_startup_rollback_unconfirmed')
 }
}

export async function optionalOriginalQuality089OnClient(db:SqlClient):Promise<boolean>{
 const rows=(await db.query<{present:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_089') OR to_regclass('agentstudio.agent_quality089_revisions') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='agentstudio_quality089') AS present")).rows
 if(rows.length!==1||typeof rows[0]?.present!=='boolean')throw new HttpError(503,'original_quality_schema_unavailable')
 if(!rows[0].present)return false
 await verifyOriginalQuality089Schema(db);return true
}
