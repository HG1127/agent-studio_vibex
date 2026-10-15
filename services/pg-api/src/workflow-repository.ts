// PostgreSQL V8 Workflow STORAGE pilot. Deliberately not an execution engine.
import {HttpError,isUuid,type Identity,type SqlPool,type WorkflowGraph}
  from "./contracts.ts"
import {withActor} from "./repository.ts"

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
  create(identity:Identity,name:string,graph:WorkflowGraph):Promise<WorkflowRow> {
    return withActor(this.pool,identity,async(db,actor)=>{
      const rows=await db.query<WorkflowRow>(
        "INSERT INTO agentstudio.workflows(owner_user_id,name,graph) "+
        "VALUES($1::uuid,$2::text,$3::jsonb) RETURNING "+columns,
        [actor,name,JSON.stringify(graph)])
      if(!rows.rows[0])throw new Error("insert_returned_no_rows")
      return normalizeWorkflow(rows.rows[0])
    })
  }
  update(identity:Identity,id:string,name:string,graph:WorkflowGraph,revision:number):
    Promise<WorkflowRow|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_workflow_id")
    if(!Number.isSafeInteger(revision)||revision<1)
      throw new HttpError(400,"invalid_revision")
    return withActor(this.pool,identity,async(db,actor)=>{
      const rows=await db.query<WorkflowRow>(
        "UPDATE agentstudio.workflows SET "+
        "name=$3::text,graph=$4::jsonb,revision=revision+1,updated_at=now() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$5::bigint "+
        "RETURNING "+columns,
        [id,actor,name,JSON.stringify(graph),revision])
      return rows.rows[0]?normalizeWorkflow(rows.rows[0]):null
    })
  }
}
