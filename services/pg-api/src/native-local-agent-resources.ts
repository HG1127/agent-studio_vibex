// Actual SQL067 catalog and immutable same-owner binding checks for Native
// role reads/replays. A parsed data marker is never execution authority.
import {HttpError,type SqlClient} from './contracts.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {localCanonical,localDigest,parseLocalBinding,type LocalBinding} from '../../../shared/native-local-device-contract.mjs'
export async function verifyNativeLocalRoleSchema(db:SqlClient){
 await verifyNativeLocalDeviceSchema(db)
}
export async function verifyNativeLocalWorkerRole(db:SqlClient,claim:{job_id:string;run_id:string;lease_token:string;lease_version:number;lease_owner:string},snapshot:LocalBinding){
 await verifyNativeLocalRoleSchema(db)
 // Preserve the independently reviewed Worker LOGIN/lease proof. The API-only
 // owner RPC deliberately rejects the Worker's two-group original LOGIN.
 await db.query('SET LOCAL ROLE agentstudio_worker')
 let rows:{value:unknown}[]
 try{rows=(await db.query<{value:unknown}>('SELECT agentstudio.native_local_worker_binding($1::jsonb) AS value',[JSON.stringify(claim)])).rows}
 catch(error){try{await db.query('SET LOCAL ROLE agentstudio_api')}catch{}throw error}
 await db.query('SET LOCAL ROLE agentstudio_api')
 if(rows.length!==1||rows[0]!.value===null)throw new HttpError(409,'native_local_device_binding_required')
 const binding=parseLocalBinding(rows[0]!.value)
 if(await localDigest(binding.catalog)!==binding.catalog_sha256||localCanonical(parseLocalBinding(snapshot))!==localCanonical(binding))
  throw new HttpError(409,'native_local_device_binding_changed')
 return binding
}
