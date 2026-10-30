import type {SqlPool,Identity} from './contracts.ts'
export const internalShareApproval='APPROVE_DISPOSABLE_PG18_NATIVE_INTERNAL_TEMPLATE_SHARE_ONLY' as const
export function selectNativeInternalShareCapabilities(env:Record<string,string|undefined>,listen:boolean,origin:string,writes:boolean){
 const available=env.AGENT_STUDIO_PG18_INTERNAL_SHARE_AVAILABLE,enabled=env.AGENT_STUDIO_PG18_INTERNAL_SHARE_WRITES_ENABLED,approval=env.AGENT_STUDIO_PG18_INTERNAL_SHARE_APPROVED
 if(available===undefined&&enabled===undefined&&approval===undefined)return{available:false,writes:false}
 let secure=false;try{const url=new URL(origin);secure=url.protocol==='https:'&&url.origin===origin}catch{}
 if(!listen||!secure||available!=='true'||enabled!==undefined&&enabled!=='true'||approval!==internalShareApproval||enabled==='true'&&!writes)throw Error('agent_internal_share_native_opt_in_refused')
 return{available:true,writes:enabled==='true'}
}
export function requireInternalShareNative(identity:Identity){if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject||identity.subject.length>200)throw Error('native_employee_identity_required')}
export async function inspectInternalSharePool(pool:SqlPool){const audit=(await import('./agent-internal-share-audit.ts')).verifyAgentInternalShareCredentials,db=await pool.connect();let begun=false;try{await db.query('BEGIN READ ONLY');begun=true;await db.query('SET LOCAL ROLE agentstudio_api');if(await audit(db)!==true)throw Error('agent_internal_share_schema_required')}finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}}
