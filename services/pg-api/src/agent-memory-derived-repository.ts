import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {verifyAgentMemoryDerivedCredentials} from "./agent-memory-derived-audit.ts"
import {parseAgentMemoryDerivedChange,type AgentMemoryDerivedChange} from "./agent-memory-derived-contract.ts"
import {loadAgentMemoryDerivedSource,type AgentMemoryDerivedSource} from "./agent-memory-derived-source.ts"
import {successfulMemoryFallback,failedMemoryLesson} from "./agent-memory-derived-text.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
type Receipt={request_id:string;memory_id:string;spec_id:string;source_run_id:string;action:"save_success"|"save_failure"|"forget";kind:"fact"|"lesson";source_sha256:string;content_sha256:string;tools_sha256:string}
type Stored=Receipt&{request_sha256:string}
export type AgentMemoryDerivedReceipt=Receipt&{recorded:true;replayed:boolean}
const columns="request_id,memory_id,spec_id,source_run_id,action,kind,source_sha256,content_sha256,tools_sha256,request_sha256"
function native(identity:Identity){if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")}
async function schema(db:SqlClient){if(!await verifyAgentMemoryDerivedCredentials(db))throw new HttpError(409,"agent_memory_derived_schema_required")}
function projected(source:AgentMemoryDerivedSource){
  const value=source.status==="succeeded"?successfulMemoryFallback(source.result_text,source.tools_used):failedMemoryLesson(source.status,source.instruction,source.error_code)
  if(!value)throw new HttpError(409,"agent_memory_derived_source_unavailable")
  return {...value,content_sha256:agentMemoryHash(value.fact),tools_sha256:agentMemoryHash(value.tools_used)}
}
function receipt(row:Stored,replayed:boolean):AgentMemoryDerivedReceipt{
  return {request_id:row.request_id,memory_id:row.memory_id,spec_id:row.spec_id,source_run_id:row.source_run_id,action:row.action,kind:row.kind,
    source_sha256:row.source_sha256,content_sha256:row.content_sha256,tools_sha256:row.tools_sha256,recorded:true,replayed}
}
export class AgentMemoryDerivedRepository{
  readonly pool:SqlPool;readonly enabled:boolean
  constructor(pool:SqlPool,options:{allowWrites?:boolean}={}){this.pool=pool;this.enabled=options.allowWrites===true}
  private async previous(db:SqlClient,owner:string,choice:AgentMemoryDerivedChange):Promise<AgentMemoryDerivedReceipt|null>{
    const row=(await db.query<Stored>("SELECT "+columns+" FROM agentstudio.agent_memory_derived_receipts WHERE owner_user_id=$1::uuid AND request_id=$2::uuid",[owner,choice.request_id])).rows[0]
    if(!row)return null
    if(row.spec_id!==choice.spec_id||row.action!==choice.action||row.request_sha256!==choice.request_sha256||
      (choice.action==="forget"?row.memory_id!==choice.memory_id:row.source_run_id!==choice.source_run_id))throw new HttpError(409,"agent_memory_derived_request_conflict")
    return receipt(row,true)
  }
  async confirm(identity:Identity,raw:unknown):Promise<AgentMemoryDerivedReceipt>{
    native(identity);const choice=parseAgentMemoryDerivedChange(raw)
    return withActor(this.pool,identity,async(db,owner)=>{await schema(db);const row=await this.previous(db,owner,choice)
      if(!row)throw new HttpError(404,"agent_memory_derived_receipt_not_found");return row})
  }
  async preview(identity:Identity,specId:string,runId:string){
    native(identity)
    return withActor(this.pool,identity,async(db,owner)=>{
      const source=await loadAgentMemoryDerivedSource(db,owner,specId,runId),value=projected(source)
      return {spec_id:source.spec_id,run_id:source.run_id,source_sha256:source.source_sha256,...value}
    })
  }
  async change(identity:Identity,raw:unknown):Promise<AgentMemoryDerivedReceipt>{
    native(identity);parseAgentMemoryDerivedChange(raw)
    return withActor(this.pool,identity,(db,owner)=>this.changeOwned(db,owner,raw))
  }
  // Trusted compound operation only: no new connection, nested transaction,
  // browser owner override or inherited permission to refine with a model.
  async changeOwned(db:SqlClient,owner:string,raw:unknown):Promise<AgentMemoryDerivedReceipt>{
    await assertOwnedAdmissionContext(db,owner)
    const choice=parseAgentMemoryDerivedChange(raw);await schema(db)
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,51))",[owner+":"+choice.request_id])
    const prior=await this.previous(db,owner,choice);if(prior)return prior
    if(!this.enabled)throw new HttpError(403,"agent_memory_derived_writes_disabled")
    const memory=choice.action==="forget"?choice.memory_id:choice.request_id
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,510))",[owner+":"+memory])
    let source_run_id:string,source_sha256:string,kind:"fact"|"lesson",content_sha256:string,tools_sha256:string,fact="",tools_used=""
    if(choice.action!=="forget"){
      const source=await loadAgentMemoryDerivedSource(db,owner,choice.spec_id,choice.source_run_id)
      if(source.source_sha256!==choice.expected_source_sha256||(choice.action==="save_success")!==(source.status==="succeeded"))throw new HttpError(409,"agent_memory_derived_source_changed")
      const value=projected(source)
      ;({kind,content_sha256,tools_sha256,fact,tools_used}=value);source_run_id=source.run_id;source_sha256=source.source_sha256
    }else{
      const current=(await db.query<Stored>("SELECT "+columns.split(",").map(name=>"r."+name).join(",")+" FROM agentstudio.agent_memory_derived_receipts r JOIN agentstudio.agent_memory_derived_entries e "+
        "ON e.owner_user_id=r.owner_user_id AND e.id=r.request_id WHERE r.owner_user_id=$1::uuid AND r.memory_id=$2::uuid AND r.request_id=r.memory_id AND r.spec_id=$3::uuid AND r.action IN('save_success','save_failure')",[owner,memory,choice.spec_id])).rows[0]
      if(!current)throw new HttpError(404,"agent_memory_derived_not_found")
      if(current.content_sha256!==choice.expected_content_sha256||current.tools_sha256!==choice.expected_tools_sha256)throw new HttpError(409,"agent_memory_derived_content_changed")
      ;({kind,source_run_id,source_sha256,content_sha256,tools_sha256}=current)
    }
    const row=(await db.query<Stored>("INSERT INTO agentstudio.agent_memory_derived_receipts(owner_user_id,request_id,memory_id,spec_id,source_run_id,action,kind,source_sha256,content_sha256,tools_sha256,request_sha256) "+
      "VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9,$10,$11) RETURNING "+columns,[owner,choice.request_id,memory,choice.spec_id,source_run_id,choice.action,kind,source_sha256,content_sha256,tools_sha256,choice.request_sha256])).rows[0]!
    if(choice.action==="forget")await db.query("DELETE FROM agentstudio.agent_memory_derived_entries WHERE owner_user_id=$1::uuid AND id=$2::uuid",[owner,memory])
    else await db.query("INSERT INTO agentstudio.agent_memory_derived_entries(owner_user_id,id,fact,tools_used,content_sha256,tools_sha256) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6)",[owner,memory,fact,tools_used,content_sha256,tools_sha256])
    await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) "+
      "VALUES($1::uuid,$1::uuid,$2,'agent_memory_derived',$3,'succeeded',$4::jsonb)",[owner,"agent.memory_derived_"+choice.action,memory,JSON.stringify({request_id:choice.request_id,spec_id:choice.spec_id,source_run_id,kind,source_sha256,content_sha256,tools_sha256})])
    return receipt(row,false)
  }
  async list(identity:Identity,specId:string){
    native(identity);if(!isUuid(specId))throw new HttpError(400,"invalid_agent_spec_id")
    return withActor(this.pool,identity,async(db,owner)=>{
      await schema(db)
      if(!(await db.query("SELECT id FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[specId,owner])).rows.length)throw new HttpError(404,"agent_spec_not_found")
      const rows=(await db.query<Pick<Receipt,"spec_id"|"source_run_id"|"kind"|"source_sha256"|"content_sha256"|"tools_sha256">&{id:string;fact:string;tools_used:string;created_at:string}>("SELECT e.id,e.fact,e.tools_used,e.created_at,r.spec_id,r.source_run_id,r.kind,r.source_sha256,r.content_sha256,r.tools_sha256 "+
        "FROM agentstudio.agent_memory_derived_entries e JOIN agentstudio.agent_memory_derived_receipts r ON r.owner_user_id=e.owner_user_id AND r.request_id=e.id "+
        "WHERE e.owner_user_id=$1::uuid AND r.spec_id=$2::uuid AND r.request_id=r.memory_id AND r.action IN('save_success','save_failure') AND NOT EXISTS "+
        "(SELECT 1 FROM agentstudio.agent_memory_derived_receipts d WHERE d.owner_user_id=e.owner_user_id AND d.memory_id=e.id AND d.action='forget') ORDER BY e.created_at DESC,e.id DESC LIMIT 50",[owner,specId])).rows
      const sources=new Map<string,AgentMemoryDerivedSource|null>(),items=[]
      for(const row of rows){
        if(!sources.has(row.source_run_id))try{sources.set(row.source_run_id,await loadAgentMemoryDerivedSource(db,owner,specId,row.source_run_id))}
        catch(error){if(!(error instanceof HttpError)||![400,404,409].includes(error.status))throw error;sources.set(row.source_run_id,null)}
        const source=sources.get(row.source_run_id),value=source?projected(source):null
        const available=!!source&&source.source_sha256===row.source_sha256&&!!value&&value.kind===row.kind&&value.content_sha256===row.content_sha256&&value.tools_sha256===row.tools_sha256&&value.fact===row.fact&&value.tools_used===row.tools_used
        items.push({id:row.id,spec_id:row.spec_id,run_id:row.source_run_id,kind:row.kind,source_sha256:row.source_sha256,content_sha256:row.content_sha256,tools_sha256:row.tools_sha256,created_at:row.created_at,
          source_current:available,fact:available?row.fact:null,tools_used:available?row.tools_used:null})
      }
      return {spec_id:specId.toLowerCase(),items,limit:50}
    })
  }
}
