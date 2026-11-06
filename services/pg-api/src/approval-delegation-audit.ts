import type {SqlClient} from './contracts.ts'
import {verifyApprovalDelegationCore} from './approval-delegation-audit-core.ts'
import {verifyAgentInternalShareCredentials} from './agent-internal-share-audit.ts'
export async function verifyApprovalDelegationCredentials(db:SqlClient):Promise<boolean>{try{if(!await verifyApprovalDelegationCore(db))return false;if(await verifyAgentInternalShareCredentials(db))return true}catch{}throw Error('unsafe_approval_delegation_privileges')}
