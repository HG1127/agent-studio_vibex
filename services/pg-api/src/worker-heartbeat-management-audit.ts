// Catalog only, on caller-owned actual operator RR READ ONLY client.
// Facade/client admission belongs controller; expectations provide no authority.
// No connect/BEGIN/COMMIT/ROLLBACK/release/settings or role switching.
import {HttpError,type SqlClient} from "./contracts.ts"
import {verifyWorkerHeartbeatManagementCatalogCore,
 type WorkerHeartbeatManagementCatalogAudit} from "./worker-heartbeat-management-audit-core.ts"
export async function verifyWorkerHeartbeatManagementCatalog(
 db:SqlClient,expectations:unknown,
):Promise<WorkerHeartbeatManagementCatalogAudit>{
 try{return await verifyWorkerHeartbeatManagementCatalogCore(db,expectations)}
 catch{throw new HttpError(503,"worker_heartbeat_management_catalog_unavailable")}
}
