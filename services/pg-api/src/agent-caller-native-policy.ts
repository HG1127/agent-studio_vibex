import type {SqlPool} from './contracts.ts'
import {agentCallerOrigin} from '../../../shared/agent-caller-contract.ts'
export const agentCallerNativeApproval='APPROVE_DISPOSABLE_PG18_PUBLISHED_AGENT_CALLERS_ONLY' as const
export function selectNativeAgentCallerCapabilities(env:Record<string,string|undefined>,listen:boolean,origin:string,configurationWrites:boolean,autonomousAdmission:boolean){
 const available=env.AGENT_STUDIO_PG18_AGENT_CALLERS_AVAILABLE,writes=env.AGENT_STUDIO_PG18_AGENT_CALLERS_WRITES_ENABLED,runs=env.AGENT_STUDIO_PG18_AGENT_CALLERS_RUNS_ENABLED,approval=env.AGENT_STUDIO_PG18_AGENT_CALLERS_APPROVED
 if([available,writes,runs,approval].every(v=>v===undefined))return{available:false,writes:false,runs:false}
 try{agentCallerOrigin(origin)}catch{throw Error('agent_caller_native_opt_in_refused')}
 if(!listen||available!=='true'||approval!==agentCallerNativeApproval||writes!==undefined&&writes!=='true'||runs!==undefined&&runs!=='true'||writes==='true'&&!configurationWrites||runs==='true'&&(!configurationWrites||!autonomousAdmission))throw Error('agent_caller_native_opt_in_refused')
 return{available:true,writes:writes==='true',runs:runs==='true'}
}
export async function inspectAgentCallerPool(pool:SqlPool){const {verifyAgentCallerCredentials}=await import('./agent-caller-audit.ts'),db=await pool.connect();let begun=false;try{await db.query('BEGIN READ ONLY');begun=true;await db.query('SET LOCAL ROLE agentstudio_api');if(await verifyAgentCallerCredentials(db)!==true)throw Error('agent_caller_schema_required')}finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}}
