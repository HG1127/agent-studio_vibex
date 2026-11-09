import type {SqlClient} from './contracts.ts'
import {verifyAgentCallerCore} from './agent-caller-audit-core.ts'
import {verifyApprovalDelegationCredentials} from './approval-delegation-audit.ts'
// Own068 plus actual unchanged066→065→064→063→062→061→060→059.
// Optional067 device office is independently verified by Root's full profile.
export async function verifyAgentCallerCredentials(db:SqlClient):Promise<boolean>{try{if(!await verifyAgentCallerCore(db))return false;if(await verifyApprovalDelegationCredentials(db))return true}catch{}throw Error('unsafe_agent_caller_privileges')}
