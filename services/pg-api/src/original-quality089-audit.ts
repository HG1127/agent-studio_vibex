import {HttpError,type SqlClient,type SqlPool} from './contracts.ts'
import {assertOriginalQuality089Catalog,originalQuality089CatalogSQL} from './original-quality089-catalog.mjs'
/** Extension audit only; the original composed parent audit remains mandatory. */
export async function verifyOriginalQuality089Schema(db:SqlClient):Promise<void>{
 try{await db.query('SET LOCAL search_path=pg_catalog');const rows=(await db.query<{value:unknown}>(originalQuality089CatalogSQL)).rows;if(rows.length!==1)throw Error();assertOriginalQuality089Catalog(rows[0]?.value)}catch{throw new HttpError(503,'original_quality_schema_unavailable')}
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
