// Owner-scoped Workflow configuration (legacy skeleton and explicit V2).
// Storage is independent of the separately authorized execution services.
import {HttpError,isUuid,safeName,safeWorkflowGraph,type Identity,type SqlPool,type SqlClient,type WorkflowGraph}
  from "./contracts.ts"
import {withActor} from "./repository.ts"
import {exactProviderEndpoint} from "./model-connection-probe.ts"
import {resolveMcpBinding} from "./mcp-binding-resources.ts"

export interface WorkflowRow {
  id:string
  owner_user_id:string
  name:string
  graph:WorkflowGraph
  revision:number
  created_at:string
  updated_at:string
}
function normalizeWorkflow(row:WorkflowRow):WorkflowRow {
  const revision=Number(row.revision)
  if(!Number.isSafeInteger(revision)||revision<1)
    throw new Error("invalid_persisted_revision")
  return {...row,revision}
}
const columns="id,owner_user_id,name,graph,revision,created_at,updated_at"

// Resource identity and revisions are checked under the SAME owner transaction
// as the graph write. No credentials, URL overrides or user IDs enter the graph.
export async function verifyWorkflowGraphResources(db:SqlClient,actor:string,graph:WorkflowGraph){
  if(graph.version!==2)return
  for(const node of graph.nodes)await verifyWorkflowResourceReferences(db,actor,node.data)
}
export async function verifyWorkflowResourceReferences(db:SqlClient,actor:string,data:WorkflowGraph["nodes"][number]["data"]){
    const {model_binding:model,agent_binding:agent,tool_binding:tool,knowledge_base_ids:kb}=data
    if(data.mcp_binding)await resolveMcpBinding(db,actor,data.mcp_binding,true)
    if(model){
      const result=await db.query<{revision:number|string;enabled:boolean;status:string;
        models:unknown;provider:"openai"|"anthropic"|"gemini";base_url:string}>(
        "SELECT revision,enabled,status,models,provider,base_url FROM agentstudio.model_connections "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[model.connection_id,actor])
      const row=result.rows[0]
      if(!row)throw new HttpError(404,"workflow_resource_not_found")
      if(Number(row.revision)!==model.connection_revision)throw new HttpError(409,"workflow_resource_revision_changed")
      if(!row.enabled||row.status!=="ok"||!Array.isArray(row.models)||!row.models.includes(model.model_id))
        throw new HttpError(409,"workflow_model_not_ready")
      try{exactProviderEndpoint(row)}catch{throw new HttpError(409,"workflow_model_not_ready")}
    }
    if(agent||tool){
      const table=agent?"agent_specs":"tool_connections",id=agent?agent.spec_id:tool!.connection_id
      const revision=agent?agent.spec_revision:tool!.connection_revision
      const row=(await db.query<{revision:number|string}>(
        "SELECT revision FROM agentstudio."+table+
        " WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[id,actor])).rows[0]
      if(!row)throw new HttpError(404,"workflow_resource_not_found")
      if(Number(row.revision)!==revision)throw new HttpError(409,"workflow_resource_revision_changed")
    }
    if(kb?.length){
      const rows=await db.query<{id:string}>("SELECT id FROM agentstudio.knowledge_bases "+
        "WHERE owner_user_id=$1::uuid AND id=ANY($2::uuid[]) AND visibility='private' FOR SHARE",[actor,kb])
      if(rows.rows.length!==kb.length)throw new HttpError(404,"workflow_resource_not_found")
    }
}
async function auditGraphWrite(db:SqlClient,actor:string,row:WorkflowRow,action:string){
  await db.query("INSERT INTO agentstudio.audit_events "+
    "(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) "+
    "VALUES($1::uuid,$1::uuid,$2::text,'workflow',$3::text,'succeeded',$4::jsonb)",
    [actor,action,row.id,JSON.stringify({revision:Number(row.revision),
      graph_version:row.graph.version??1,node_count:row.graph.nodes.length})])
}

export class WorkflowRepository {
  readonly pool:SqlPool
  constructor(pool:SqlPool) {this.pool=pool}
  list(identity:Identity,limit=30):Promise<WorkflowRow[]> {
    const bounded=Math.max(1,Math.min(50,Math.trunc(limit)))
    return withActor(this.pool,identity,async(db,actor)=>{
      const rows=await db.query<WorkflowRow>(
        "SELECT "+columns+" FROM agentstudio.workflows "+
        "WHERE owner_user_id=$1::uuid ORDER BY updated_at DESC,id LIMIT $2::int",
        [actor,bounded])
      return rows.rows.map(normalizeWorkflow)
    })
  }
  get(identity:Identity,id:string):Promise<WorkflowRow|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_workflow_id")
    return withActor(this.pool,identity,async(db,actor)=>{
      const rows=await db.query<WorkflowRow>(
        "SELECT "+columns+" FROM agentstudio.workflows "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid",[id,actor])
      return rows.rows[0]?normalizeWorkflow(rows.rows[0]):null
    })
  }
  async create(identity:Identity,name:string,graph:WorkflowGraph):Promise<WorkflowRow> {
    const checked=safeWorkflowGraph(graph),checkedName=safeName(name)
    return withActor(this.pool,identity,async(db,actor)=>{
      await verifyWorkflowGraphResources(db,actor,checked)
      const rows=await db.query<WorkflowRow>(
        "INSERT INTO agentstudio.workflows(owner_user_id,name,graph) "+
        "VALUES($1::uuid,$2::text,$3::jsonb) RETURNING "+columns,
        [actor,checkedName,JSON.stringify(checked)])
      if(!rows.rows[0])throw new Error("insert_returned_no_rows")
      await auditGraphWrite(db,actor,rows.rows[0],"workflow.config_create")
      return normalizeWorkflow(rows.rows[0])
    })
  }
  async createIdempotent(identity:Identity,requestId:string,name:string,graph:WorkflowGraph){
    if(!isUuid(requestId)||graph.version!==2)throw new HttpError(400,"invalid_workflow_create_request")
    const id=requestId.toLowerCase(),checked=safeWorkflowGraph(graph),checkedName=safeName(name)
    return withActor(this.pool,identity,async(db,actor)=>{
      // A random request UUID is also this configuration's stable record UUID.
      // It never determines the owner or creates a job. Normalize before locking.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[actor+":"+id])
      const existing=async()=>{
        const row=(await db.query<WorkflowRow>("SELECT "+columns+" FROM agentstudio.workflows "+
          "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[id,actor])).rows[0]
        if(!row||Number(row.revision)!==1||row.name!==checkedName||JSON.stringify(safeWorkflowGraph(row.graph))!==JSON.stringify(checked))
          throw new HttpError(409,"workflow_create_request_conflict")
        return {item:normalizeWorkflow(row),replayed:true}
      }
      if((await db.query("SELECT id FROM agentstudio.workflows WHERE id=$1::uuid AND owner_user_id=$2::uuid",[id,actor])).rows.length)return existing()
      await verifyWorkflowGraphResources(db,actor,checked)
      const row=(await db.query<WorkflowRow>("INSERT INTO agentstudio.workflows(id,owner_user_id,name,graph) "+
        "VALUES($1::uuid,$2::uuid,$3::text,$4::jsonb) ON CONFLICT(id) DO NOTHING RETURNING "+columns,
        [id,actor,checkedName,JSON.stringify(checked)])).rows[0]
      if(!row)return existing() // A foreign UUID collision remains a generic conflict under owner RLS.
      await auditGraphWrite(db,actor,row,"workflow.config_create")
      return {item:normalizeWorkflow(row),replayed:false}
    })
  }
  async update(identity:Identity,id:string,name:string,graph:WorkflowGraph,revision:number):
    Promise<WorkflowRow|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_workflow_id")
    if(!Number.isSafeInteger(revision)||revision<1)
      throw new HttpError(400,"invalid_revision")
    const checked=safeWorkflowGraph(graph),checkedName=safeName(name)
    return withActor(this.pool,identity,async(db,actor)=>{
      // Check access before resource revisions to avoid revealing anything
      // about another employee's Workflow or resource configuration.
      const current=(await db.query<{revision:number|string}>(
        "SELECT revision FROM agentstudio.workflows WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid FOR UPDATE",[id,actor])).rows[0]
      if(!current||Number(current.revision)!==revision)return null
      await verifyWorkflowGraphResources(db,actor,checked)
      const rows=await db.query<WorkflowRow>(
        "UPDATE agentstudio.workflows SET "+
        "name=$3::text,graph=$4::jsonb,revision=revision+1,updated_at=now() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$5::bigint "+
        "RETURNING "+columns,
        [id,actor,checkedName,JSON.stringify(checked),revision])
      if(rows.rows[0])await auditGraphWrite(db,actor,rows.rows[0],"workflow.config_update")
      return rows.rows[0]?normalizeWorkflow(rows.rows[0]):null
    })
  }
}
