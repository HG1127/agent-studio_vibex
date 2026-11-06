// SchemaFull-only inspection. No old FULL chain, runtime activation, role switch,
// telemetry reading endpoint, Native authorization or Worker integration.
import {HttpError,type SqlClient,type SqlPool} from "./contracts.ts"
import {verifyWorkerHeartbeatCore,type WorkerHeartbeatSchemaFull} from "./worker-heartbeat-audit-core.ts"
const unavailable=():never=>{throw new HttpError(503,"worker_heartbeat_schema_unavailable")}
export async function verifyWorkerHeartbeatSchemaFull(db:SqlClient):Promise<WorkerHeartbeatSchemaFull>{
 try{const result=await verifyWorkerHeartbeatCore(db);if(result)return result}catch{}
 return unavailable()
}
export async function inspectWorkerHeartbeatSchemaFull(pool:SqlPool):Promise<false|WorkerHeartbeatSchemaFull>{
 let db:SqlClient|undefined,ended=false
 try{
  db=await pool.connect();await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
  await db.query("SET LOCAL search_path=pg_catalog")
  const result=await verifyWorkerHeartbeatCore(db)
  await db.query("ROLLBACK");ended=true
  const released=db;db=undefined;released.release()
  return result
 }catch{return unavailable()}
 finally{if(db){if(!ended)await db.query("ROLLBACK").catch(()=>{});try{db.release()}catch{}}}
}
