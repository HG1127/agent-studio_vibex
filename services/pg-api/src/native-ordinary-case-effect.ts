import {createHash} from 'node:crypto'
import {HttpError,type SqlClient,type SqlPool} from './contracts.ts'
import {applyKnowledgeScope} from './knowledge-scope-policy.ts'
import {workflowAgentJson} from './workflow-v2-agent-machine.ts'
import type {WorkflowEffectRequest} from './workflow-v2-machine.ts'
import type {WorkflowV2ModelRequest} from './workflow-v2-model-contract.ts'
export function ordinaryCaseEffectProof(pending:WorkflowEffectRequest&{node_debug?:boolean},parentHash:string,snapshotHash:string):string{
 const {input_sha256,missing,node_debug,...request}=pending
 const preimage=workflowAgentJson({parent_input_sha256:parentHash,snapshot_sha256:snapshotHash,...request})
 if(createHash('sha256').update(preimage).digest('hex')!==input_sha256)throw new HttpError(409,'ordinary_case_original_effect_required')
 return preimage
}
export async function readOrdinaryCaseEffectProof(db:SqlClient,owner:string,r:WorkflowV2ModelRequest,pending:WorkflowEffectRequest&{node_debug?:boolean}){
 const rows=(await db.query<{parent_hash:string;snapshot_hash:string}>("SELECT checkpoint->'agent_state'->>'parent_input_sha256' AS parent_hash,checkpoint->'agent_state'->>'snapshot_sha256' AS snapshot_hash FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[r.claim.run_id,owner])).rows
 if(rows.length!==1||!/^[a-f0-9]{64}$/.test(rows[0]?.parent_hash??'')||!/^[a-f0-9]{64}$/.test(rows[0]?.snapshot_hash??''))throw new HttpError(409,'ordinary_case_original_effect_required')
 return ordinaryCaseEffectProof(pending,rows[0]!.parent_hash,rows[0]!.snapshot_hash)
}
/** An unknown COMMIT discards the connection and never releases a provider call. */
export async function ordinaryCaseTransaction<T>(pool:SqlPool,role:'agentstudio_worker'|'agentstudio_bound_dispatch'|'agentstudio_api',work:(db:SqlClient)=>Promise<T>):Promise<T>{
 const db=await pool.connect();let begun=false,committing=false,discard=false
 try{await db.query('BEGIN');begun=true;await applyKnowledgeScope(db,pool);await db.query('SET LOCAL search_path=pg_catalog');await db.query('SET LOCAL ROLE '+role)
  const result=await work(db);committing=true;await db.query('COMMIT');begun=false;return result
 }catch(error){if(committing){discard=true;throw new HttpError(503,'ordinary_case_commit_unconfirmed')}throw error}
 finally{if(begun)try{await db.query('ROLLBACK')}catch{discard=true};if(discard)Reflect.apply(db.release,db,[true]);else db.release()}
}
