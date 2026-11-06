// Catalog only, on caller-owned actual operator RR READ ONLY client.
// Facade/client admission belongs controller; expectations provide no authority.
// No connect/BEGIN/COMMIT/ROLLBACK/release/settings or role switching.
import {isNativeError,isProxy} from 'node:util/types'
import {registryReadFailureData,type RegistryReadFailureObservation} from './worker-heartbeat-registry-failure-observation.ts'
import {HttpError,type SqlClient} from "./contracts.ts"
import {verifyWorkerHeartbeatManagementCatalogCore,managementCoreReadFailureObservation,
 type WorkerHeartbeatManagementCatalogAudit} from "./worker-heartbeat-management-audit-core.ts"
// Private closed failure DATA; never an audit result or authorization cache.
const managementReadFailures=new WeakMap<object,RegistryReadFailureObservation>()
export function workerHeartbeatManagementReadFailureObservation(error:unknown):RegistryReadFailureObservation|null{try{return isNativeError(error)&&!isProxy(error)?managementReadFailures.get(error)??null:null}catch{return null}}
export async function verifyWorkerHeartbeatManagementCatalog(
 db:SqlClient,expectations:unknown,
):Promise<WorkerHeartbeatManagementCatalogAudit>{
 try{return await verifyWorkerHeartbeatManagementCatalogCore(db,expectations)}
 catch(error){const refusal=new HttpError(503,"worker_heartbeat_management_catalog_unavailable");try{managementReadFailures.set(refusal,managementCoreReadFailureObservation(error)??registryReadFailureData('management_catalog',error))}catch{}throw refusal}
}
