// CATALOG-ONLY wrapper, not an activation capability, Native guard or runtime reader.
// No HTTP, credential loading, LOGIN/generation changes or snapshot/registry read.
// A future integration must establish current operator epoch + Native authorization
// BEFORE pool.connect; a plain expectations object provides neither.
import {HttpError,type SqlClient,type SqlPool} from "./contracts.ts"
import {parseWorkerHeartbeatReaderCatalogExpectations,verifyWorkerHeartbeatActivatedCatalogCore,
 type WorkerHeartbeatReaderCatalogAudit} from "./worker-heartbeat-activated-audit-core.ts"
const unavailable=():never=>{throw new HttpError(503,"worker_heartbeat_reader_catalog_unavailable")}
export async function verifyWorkerHeartbeatActivatedCatalog(
 db:SqlClient,expectations:unknown,
):Promise<WorkerHeartbeatReaderCatalogAudit>{
 try{return await verifyWorkerHeartbeatActivatedCatalogCore(db,expectations)}catch{return unavailable()}
}
export async function inspectWorkerHeartbeatActivatedCatalog(
 pool:SqlPool,rawExpectations:unknown,
):Promise<WorkerHeartbeatReaderCatalogAudit>{
 let db:SqlClient|undefined,ended=false
 try{
  const expected=parseWorkerHeartbeatReaderCatalogExpectations(rawExpectations)
  db=await pool.connect()
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
  await db.query("SET LOCAL search_path=pg_catalog")
  await db.query("SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='1000ms'")
  const value=await verifyWorkerHeartbeatActivatedCatalogCore(db,expected)
  await db.query("ROLLBACK");ended=true
  const released=db;db=undefined;released.release()
  return value
 }catch{return unavailable()}
 finally{
  if(db){
   if(!ended)await db.query("ROLLBACK").catch(()=>{})
   try{db.release()}catch{}
  }
 }
}

