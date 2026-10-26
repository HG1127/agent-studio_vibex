import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {parseAgentMemoryChange,type AgentMemoryChange} from "./agent-memory-contract.ts"
import {sanitizeAgentMemoryText} from "./agent-memory-selection.ts"
export type AgentMemoryReceipt={request_id:string;memory_id:string;spec_id:string;action:"remember"|"forget";content_sha256:string;recorded:true;replayed:boolean}
type StoredReceipt={request_id:string;memory_id:string;spec_id:string;action:"remember"|"forget";content_sha256:string;request_sha256:string}
const receipt=(r:StoredReceipt,replayed:boolean):AgentMemoryReceipt=>({request_id:r.request_id,memory_id:r.memory_id,spec_id:r.spec_id,action:r.action,content_sha256:r.content_sha256,recorded:true,replayed})
function native(identity:Identity){if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")}
async function installed(db:SqlClient){
  const state=(await db.query<{ok:boolean}>("SELECT to_regclass('agentstudio.agent_memory_entries') IS NOT NULL AND to_regclass('agentstudio.agent_memory_receipts') IS NOT NULL "+
    "AND EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_049') AS ok")).rows[0]
  if(state?.ok!==true)throw new HttpError(409,"agent_memory_runtime_required")
}
export class AgentMemoryRepository{
  readonly pool:SqlPool;readonly enabled:boolean
  constructor(pool:SqlPool,options:{allowWrites?:boolean}={}){this.pool=pool;this.enabled=options.allowWrites===true}
  private async previous(db:SqlClient,owner:string,choice:AgentMemoryChange):Promise<AgentMemoryReceipt|null>{
    const row=(await db.query<StoredReceipt>("SELECT request_id,memory_id,spec_id,action,content_sha256,request_sha256 FROM agentstudio.agent_memory_receipts "+
      "WHERE owner_user_id=$1::uuid AND request_id=$2::uuid",[owner,choice.request_id])).rows[0]
    if(!row)return null
    if(row.spec_id!==choice.spec_id||row.action!==choice.action||row.request_sha256!==choice.request_sha256)throw new HttpError(409,"agent_memory_request_conflict")
    return receipt(row,true)
  }
  async confirm(identity:Identity,raw:unknown):Promise<AgentMemoryReceipt>{
    native(identity);const choice=parseAgentMemoryChange(raw)
    return withActor(this.pool,identity,async(db,owner)=>{await installed(db);const prior=await this.previous(db,owner,choice)
      if(!prior)throw new HttpError(404,"agent_memory_receipt_not_found");return prior})
  }
  async change(identity:Identity,raw:unknown):Promise<AgentMemoryReceipt>{
    native(identity);const choice=parseAgentMemoryChange(raw)
    return withActor(this.pool,identity,async(db,owner)=>{
      await installed(db)
      // Serialize a request and every operation on the same memory. Receipt
      // lookup precedes the write gate so recovery works after deactivation.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,49))",[owner+":"+choice.request_id])
      const prior=await this.previous(db,owner,choice);if(prior)return prior
      if(!this.enabled)throw new HttpError(403,"agent_memory_writes_disabled")
      const role=(await db.query<{revision:number|string}>("SELECT revision FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[choice.spec_id,owner])).rows[0]
      if(!role)throw new HttpError(404,"agent_spec_not_found")
      const memory=choice.action==="remember"?choice.request_id:choice.memory_id
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,490))",[owner+":"+memory])
      let hash:string
      if(choice.action==="remember"){
        if(Number(role.revision)!==choice.expected_revision)throw new HttpError(409,"agent_revision_changed")
        hash=choice.content_sha256
      }else{
        // Contents are insert-only; the transaction memory lock serializes
        // erasure. Row-locking SELECT would incorrectly require UPDATE grants.
        const entry=(await db.query<{content_sha256:string}>("SELECT content_sha256 FROM agentstudio.agent_memory_entries WHERE id=$1::uuid AND spec_id=$2::uuid AND owner_user_id=$3::uuid",[memory,choice.spec_id,owner])).rows[0]
        if(!entry)throw new HttpError(404,"agent_memory_not_found")
        if(entry.content_sha256!==choice.expected_sha256)throw new HttpError(409,"agent_memory_content_changed")
        hash=entry.content_sha256
      }
      const row=(await db.query<StoredReceipt>("INSERT INTO agentstudio.agent_memory_receipts(owner_user_id,request_id,memory_id,spec_id,action,content_sha256,request_sha256) "+
        "VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7) RETURNING request_id,memory_id,spec_id,action,content_sha256,request_sha256",[owner,choice.request_id,memory,choice.spec_id,choice.action,hash,choice.request_sha256])).rows[0]!
      if(choice.action==="remember")await db.query("INSERT INTO agentstudio.agent_memory_entries(owner_user_id,id,spec_id,kind,fact,content_sha256) VALUES($1::uuid,$2::uuid,$3::uuid,'user',$4,$5)",[owner,memory,choice.spec_id,choice.fact,hash])
      else await db.query("DELETE FROM agentstudio.agent_memory_entries WHERE owner_user_id=$1::uuid AND id=$2::uuid",[owner,memory])
      await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,$2,'agent_memory',$3,'succeeded',$4::jsonb)",[owner,"agent.memory_"+choice.action,memory,JSON.stringify({request_id:choice.request_id,spec_id:choice.spec_id,content_sha256:hash})])
      return receipt(row,false)
    })
  }
  async list(identity:Identity,specId:string){
    native(identity);if(!isUuid(specId))throw new HttpError(400,"invalid_agent_spec_id")
    return withActor(this.pool,identity,async(db,owner)=>{
      await installed(db)
      if(!(await db.query("SELECT id FROM agentstudio.agent_specs WHERE owner_user_id=$1::uuid AND id=$2::uuid FOR SHARE",[owner,specId])).rows.length)throw new HttpError(404,"agent_spec_not_found")
      const rows=(await db.query<{id:string;kind:"user";fact:string;content_sha256:string;created_at:string}>(
        "SELECT e.id,e.kind,e.fact,e.content_sha256,e.created_at FROM agentstudio.agent_memory_entries e WHERE e.owner_user_id=$1::uuid AND e.spec_id=$2::uuid "+
        "AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_memory_receipts r WHERE r.owner_user_id=e.owner_user_id AND r.memory_id=e.id AND r.action='forget') "+
        "ORDER BY e.created_at DESC,e.id DESC LIMIT 50",[owner,specId])).rows
      return {spec_id:specId.toLowerCase(),items:rows.map(r=>({...r,fact:sanitizeAgentMemoryText(r.fact),tools_used:"",run_id:null})),limit:50}
    })
  }
}
