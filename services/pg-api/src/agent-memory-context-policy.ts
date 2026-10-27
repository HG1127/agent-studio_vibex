import {HttpError,isUuid,type SqlClient,type SqlPool} from "./contracts.ts"
import {assertOwnedAdmissionContext} from "./repository.ts"
import {AgentMemoryRepository} from "./agent-memory-repository.ts"
import {explicitAgentMemory} from "./agent-memory-selection.ts"
import {buildAgentMemoryContext,parseAgentMemoryContext,agentMemoryContextHash,verifyAgentMemoryContextRows,type AgentMemoryContext} from "./agent-memory-context.ts"
type Scope={owner_user_id:string;spec_id:string;spec_revision:number;instruction:string}
type SourceRow={id:string;kind:"user";fact:string;tools_used:"";content_sha256:string}
type Proof=Scope&{run_id:string;graph_sha256:string;context:unknown|undefined}
const unavailable=():never=>{throw new HttpError(409,"agent_memory_context_unavailable")}
export async function agentMemoryContextInstalled(db:SqlClient):Promise<boolean>{
  const present=(await db.query<{ok:boolean}>("SELECT to_regclass('agentstudio.agent_memory_run_contexts') IS NOT NULL AS ok")).rows[0]?.ok
  if(present===false)return false
  if(present!==true)return unavailable()
  const stamped=(await db.query<{ok:boolean}>("SELECT to_regclass('agentstudio.agent_memory_entries') IS NOT NULL AND to_regclass('agentstudio.agent_memory_receipts') IS NOT NULL "+
    "AND (SELECT count(*)=2 FROM agentstudio.schema_migrations WHERE version IN('pg_v9_049','pg_v9_050')) AS ok")).rows[0]?.ok
  if(stamped!==true)return unavailable()
  return true
}
async function currentRows(db:SqlClient,s:Scope,ids?:string[]):Promise<SourceRow[]>{
  return (await db.query<SourceRow>("SELECT e.id,e.kind,e.fact,''::text AS tools_used,e.content_sha256 FROM agentstudio.agent_memory_entries e "+
    "WHERE e.owner_user_id=$1::uuid AND e.spec_id=$2::uuid "+(ids?"AND e.id=ANY($3::uuid[]) ":"")+
    "AND EXISTS(SELECT 1 FROM agentstudio.agent_memory_receipts c WHERE c.owner_user_id=e.owner_user_id AND c.request_id=e.id AND c.memory_id=e.id AND c.spec_id=e.spec_id AND c.action='remember' AND c.content_sha256=e.content_sha256) "+
    "AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_memory_receipts d WHERE d.owner_user_id=e.owner_user_id AND d.memory_id=e.id AND d.action='forget') "+
    "ORDER BY e.created_at DESC,e.id DESC LIMIT 50",[s.owner_user_id,s.spec_id,...(ids?[ids]:[])])).rows
}
// Caller chooses a NEW server run UUID only after original-request recovery.
// A failed admission rolls back explicit memory, run, queue and both receipts.
export async function prepareOwnedAgentMemoryContext(db:SqlClient,pool:SqlPool,s:Scope,runId:string):Promise<AgentMemoryContext>{
  await assertOwnedAdmissionContext(db,s.owner_user_id)
  if(!isUuid(runId)||!await agentMemoryContextInstalled(db))return unavailable()
  const native=(await db.query<{ok:boolean}>("SELECT external_issuer='urn:agentstudio:local:v1' AND status='active' AS ok FROM agentstudio.users WHERE id=$1::uuid",[s.owner_user_id])).rows[0]?.ok
  if(native!==true)throw new HttpError(403,"native_employee_identity_required")
  const directive=explicitAgentMemory(s.instruction)
  if(directive.fact)await new AgentMemoryRepository(pool,{allowWrites:true}).changeOwned(db,s.owner_user_id,{action:"remember",request_id:runId,spec_id:s.spec_id,
    expected_revision:s.spec_revision,fact:directive.fact,confirm:true})
  return buildAgentMemoryContext(s,await currentRows(db,s),directive.fact?runId:null)
}
export async function insertAgentMemoryContextReceipt(db:SqlClient,p:Proof):Promise<void>{
  await assertOwnedAdmissionContext(db,p.owner_user_id)
  if(!isUuid(p.run_id)||!await agentMemoryContextInstalled(db)||!/^([a-f0-9]{64})$/.test(p.graph_sha256))return unavailable()
  const context=parseAgentMemoryContext(p.context,p),hash=agentMemoryContextHash(context,p)
  const run=(await db.query<{kind:string;agent_spec_id:string;instruction:string;checkpoint:{spec_revision?:number;machine?:{graph_sha256?:string};memory_context?:unknown}}>(
    "SELECT kind,agent_spec_id,instruction,checkpoint FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid",[p.run_id,p.owner_user_id])).rows[0]
  if(!run||run.kind!=="agent"||run.agent_spec_id!==p.spec_id.toLowerCase()||run.instruction!==p.instruction||run.checkpoint.spec_revision!==p.spec_revision||
    run.checkpoint.machine?.graph_sha256!==p.graph_sha256||agentMemoryContextHash(run.checkpoint.memory_context,p)!==hash)return unavailable()
  await db.query("INSERT INTO agentstudio.agent_memory_run_contexts(owner_user_id,run_id,spec_id,spec_revision,protocol,graph_sha256,context_sha256) VALUES($1::uuid,$2::uuid,$3::uuid,$4,'agent_memory_context_v1',$5,$6)",
    [p.owner_user_id,p.run_id,p.spec_id,p.spec_revision,p.graph_sha256,hash])
}
export async function verifyCurrentAgentMemoryContext(db:SqlClient,p:Proof):Promise<AgentMemoryContext|null>{
  await assertOwnedAdmissionContext(db,p.owner_user_id)
  const installed=await agentMemoryContextInstalled(db)
  if(!installed){if(p.context!==undefined)return unavailable();return null}
  if(!isUuid(p.run_id))return unavailable()
  const receipt=(await db.query<{spec_id:string;spec_revision:number|string;protocol:string;graph_sha256:string;context_sha256:string}>(
    "SELECT spec_id,spec_revision,protocol,graph_sha256,context_sha256 FROM agentstudio.agent_memory_run_contexts WHERE owner_user_id=$1::uuid AND run_id=$2::uuid",[p.owner_user_id,p.run_id])).rows[0]
  if(!receipt&&p.context===undefined)return null // genuine legacy run
  if(!receipt||p.context===undefined||receipt.protocol!=="agent_memory_context_v1"||receipt.spec_id!==p.spec_id.toLowerCase()||Number(receipt.spec_revision)!==p.spec_revision||receipt.graph_sha256!==p.graph_sha256)return unavailable()
  const context=parseAgentMemoryContext(p.context,p)
  if(receipt.context_sha256!==agentMemoryContextHash(context,p))return unavailable()
  const ids=[...new Set([...context.memories.map(m=>m.id),...(context.remembered?[context.remembered.id]:[])])]
  // Same locks as physical erasure, in a fixed order. Source authorization
  // and forgetting have a transaction order without granting text UPDATE.
  for(const id of [...ids].sort())await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,490))",[p.owner_user_id+":"+id])
  return verifyAgentMemoryContextRows(context,p,ids.length?await currentRows(db,p,ids):[])
}
export async function agentMemoryContextExpected(db:SqlClient,owner:string,runId:string,context:unknown|undefined):Promise<boolean>{
  if(context!==undefined)return true
  if(!isUuid(runId)||!await agentMemoryContextInstalled(db))return false
  return (await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.agent_memory_run_contexts WHERE owner_user_id=$1::uuid AND run_id=$2::uuid) AS ok",[owner,runId])).rows[0]?.ok===true
}
