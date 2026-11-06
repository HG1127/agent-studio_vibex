import {verifyApprovalDelegationCredentials} from '../../services/pg-api/src/approval-delegation-audit.ts'
import {verifyNativeLocalDeviceSchema} from '../../services/pg-api/src/native-local-device-audit.ts'
import {verifyAgentCallerCredentials} from '../../services/pg-api/src/agent-caller-audit.ts'
import {verifyOwnerToolTrialCredentials} from '../../services/pg-api/src/owner-tool-trial-audit.ts'
// Original auditors on the same actual independent API LOGIN/role transaction.
// No complete-profile target rewrite or catalog/role projection is permitted.
export async function verifyOriginalTool069Audits(db){
 if(await verifyApprovalDelegationCredentials(db)!==true)throw Error('original_tools_actual066_audit_failed')
 if(await verifyNativeLocalDeviceSchema(db)!==true)throw Error('original_tools_actual067_audit_failed')
 if(await verifyAgentCallerCredentials(db)!==true)throw Error('original_tools_actual068_audit_failed')
 if(await verifyOwnerToolTrialCredentials(db)!==true)throw Error('original_tools_actual069_audit_failed')
 return true
}
