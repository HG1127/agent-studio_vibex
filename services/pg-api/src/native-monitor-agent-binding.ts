import {HttpError,type SqlClient} from './contracts.ts'
import {ownId} from './own-operations-contract.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {monitorCanonical} from './native-monitor-source-contract.ts'
export type MonitorAgentBinding={protocol:'monitor_live_business_v1';check_id:string;case_id:string;definition_hash:string}
export function parseMonitorAgentBinding(raw:unknown):MonitorAgentBinding{
 monitorCanonical(raw)
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(409,'monitor_business_binding_changed')
 const v=raw as Record<string,unknown>
 if(Object.keys(v).sort().join(',')!=='case_id,check_id,definition_hash,protocol'||v.protocol!=='monitor_live_business_v1'||typeof v.definition_hash!=='string'||!/^[a-f0-9]{64}$/.test(v.definition_hash))throw new HttpError(409,'monitor_business_binding_changed')
 return{protocol:v.protocol,check_id:ownId(v.check_id),case_id:ownId(v.case_id),definition_hash:v.definition_hash}
}
export async function optionalMonitorAgentBinding(db:SqlClient,owner:string,runId:string):Promise<MonitorAgentBinding|undefined>{
 ownId(owner);ownId(runId);await assertOwnedAdmissionContext(db,owner)
 const installed=(await db.query<{installed:boolean}>("SELECT to_regclass('agentstudio.monitor_live_checks') IS NOT NULL AS installed")).rows
 if(installed.length!==1)throw new HttpError(503,'monitor_business_runtime_required')
 if(installed[0]?.installed!==true)return undefined
 const rows=(await db.query<{check_id:string;case_id:string;definition_hash:string}>('SELECT c.id AS check_id,c.case_id,c.definition_hash FROM agentstudio.monitor_live_checks c JOIN agentstudio.monitor_live_versions v ON v.monitor_id=c.monitor_id AND v.revision=c.monitor_revision AND v.owner_user_id=c.owner_user_id AND v.case_id=c.case_id AND v.definition_hash=c.definition_hash WHERE c.run_id=$1::uuid AND c.owner_user_id=$2::uuid',[runId,owner])).rows
 if(!rows.length)return undefined
 if(rows.length!==1)throw new HttpError(409,'monitor_business_binding_changed')
 return parseMonitorAgentBinding({protocol:'monitor_live_business_v1',...rows[0]})
}
export async function requireMonitorAgentBinding(db:SqlClient,owner:string,binding:MonitorAgentBinding,specId:string,specRevision:number){
 await assertOwnedAdmissionContext(db,owner);binding=parseMonitorAgentBinding(binding)
 const rows=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.monitor_live_checks c JOIN agentstudio.monitor_live_versions v ON v.monitor_id=c.monitor_id AND v.revision=c.monitor_revision AND v.owner_user_id=c.owner_user_id AND v.case_id=c.case_id WHERE c.id=$1::uuid AND c.owner_user_id=$2::uuid AND c.case_id=$3::uuid AND c.definition_hash=$4::text AND v.definition_hash=c.definition_hash AND v.definition->>'spec_id'=$5::text AND (v.definition->>'spec_revision')::bigint=$6::bigint) AS ok",[binding.check_id,owner,binding.case_id,binding.definition_hash,specId,specRevision])).rows
 if(rows.length!==1||rows[0]?.ok!==true)throw new HttpError(409,'monitor_business_binding_changed')
}
