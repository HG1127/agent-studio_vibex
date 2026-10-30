import type {SqlPool} from './contracts.ts'
export const approvalDelegationApproval='APPROVE_DISPOSABLE_PG18_NATIVE_EXACT_STEP_APPROVAL_DELEGATIONS_ONLY' as const
export function selectApprovalDelegationCapabilities(env:Record<string,string|undefined>,listen:boolean,origin:string,configurationWrites:boolean){
 const available=env.AGENT_STUDIO_PG18_APPROVAL_DELEGATIONS_AVAILABLE,writes=env.AGENT_STUDIO_PG18_APPROVAL_DELEGATIONS_WRITES_ENABLED,approval=env.AGENT_STUDIO_PG18_APPROVAL_DELEGATIONS_APPROVED
 if(available===undefined&&writes===undefined&&approval===undefined)return{available:false,writes:false}
 let secure=false;try{const url=new URL(origin);secure=url.protocol==='https:'&&url.origin===origin}catch{}
 if(!listen||!secure||available!=='true'||writes!==undefined&&writes!=='true'||approval!==approvalDelegationApproval||writes==='true'&&!configurationWrites)throw Error('approval_delegation_opt_in_refused')
 return{available:true,writes:writes==='true'}
}
export async function inspectApprovalDelegationPool(pool:SqlPool){const db=await pool.connect();try{await db.query('BEGIN READ ONLY');await db.query('SET LOCAL ROLE agentstudio_api');const {verifyApprovalDelegationCredentials}=await import('./approval-delegation-audit.ts');if(await verifyApprovalDelegationCredentials(db)!==true)throw Error('approval_delegation_schema_required')}finally{try{await db.query('ROLLBACK')}finally{db.release()}}}
