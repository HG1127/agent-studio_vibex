import {createHash} from 'node:crypto'
import {HttpError,isUuid,type Identity,type SqlPool,type SqlClient} from './contracts.ts'
import {withActorClient} from './repository.ts'
import {parseAgentHttpTools} from './agent-http-tools.ts'
import {parseMcpCatalog} from './mcp-catalog.ts'
import {mcpCatalogHash} from './mcp-binding-resources.ts'
import {parseAgentMcpTools} from './mcp-binding.ts'
import {verifyOriginalHomeKnowledgeStats,verifyOriginalHomeKnowledgeAclDependencies} from './native-home-knowledge-stats-audit.ts'
import type {OriginalHomeResources,OriginalHomeHttpConnection,OriginalHomeMcpConnection,OriginalHomeKnowledgeBase} from './native-home-resources-contract.ts'
type Row=Record<string,unknown>
const fail=():never=>{throw new HttpError(503,'original_home_resources_unavailable')}
function integer(value:unknown,min:number):number{
 if(typeof value!=='number'&&(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value)))return fail()
 const result=Number(value);if(!Number.isSafeInteger(result)||result<min||result>=Number.MAX_SAFE_INTEGER)return fail();return result
}
function uuid(value:unknown):string{if(!isUuid(value))return fail();return value.toLowerCase()}
function text(value:unknown,max:number,nonblank=false):string{if(typeof value!=='string'||value.length>max||value.includes('\0')||nonblank&&!value.trim())return fail();return value}
function instant(value:unknown):string{if(!(value instanceof Date)&&typeof value!=='string')return fail();const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))return fail();return date.toISOString()}
function boolean(value:unknown):boolean{if(typeof value!=='boolean')return fail();return value}
function connection(row:Row,owner:string){
 const result={id:uuid(row.id),owner_user_id:uuid(row.owner_user_id),revision:integer(row.revision,1),name:text(row.name,100,true),description:text(row.description,500),enabled:boolean(row.enabled),status:row.status,last_checked_at:row.last_checked_at===null?null:instant(row.last_checked_at)}
 if(result.owner_user_id!==owner||!['untested','ok','error'].includes(String(result.status)))return fail()
 return {...result,status:result.status as 'untested'|'ok'|'error'}
}
function http(row:Row,owner:string):OriginalHomeHttpConnection{
 const value=connection(row,owner),alias='http_c'+value.id.replaceAll('-','');if(row.method!=='GET'&&row.method!=='POST')return fail()
 const description=value.description.replace(/[\u0000-\u001f\u007f]/g,' ').trim()||value.name.replace(/[\u0000-\u001f\u007f]/g,' ').trim()
 let binding:OriginalHomeHttpConnection['binding']=null
 if(value.enabled&&value.status==='ok'){try{binding=parseAgentHttpTools([{name:alias,description,connection_id:value.id,connection_revision:value.revision}])[0]!}catch{return fail()}}
 return {...value,method:row.method,alias,binding}
}
function mcp(row:Row,owner:string):OriginalHomeMcpConnection{
 const value=connection(row,owner);let catalog
 try{catalog=value.status==='ok'?parseMcpCatalog(row.catalog):null}catch{return fail()}
 const hash=catalog?mcpCatalogHash(catalog):null
 const tools:OriginalHomeMcpConnection['tools']=[]
 if(catalog&&hash&&value.enabled)for(const tool of catalog.tools){
  if(tool.requires_tasks)continue
  const alias='mcp_t'+createHash('sha256').update(value.id+'\0'+tool.name).digest('hex').slice(0,40)
  try{const binding=parseAgentMcpTools([{name:alias,connection_id:value.id,connection_revision:value.revision,catalog_sha256:hash,tool_name:tool.name}])[0]!;tools.push({alias,tool_name:tool.name,description:tool.description,read_only:tool.read_only,destructive:tool.destructive,binding})}catch{return fail()}
 }
 return {...value,catalog_sha256:hash,tools}
}
function knowledge(row:Row,owner:string,shared:boolean):OriginalHomeKnowledgeBase{
 const id=uuid(row.id),ownerId=uuid(row.owner_user_id),role=row.access_role
 if(!['owner','viewer','editor'].includes(String(role))||(shared?(role!=='viewer'&&role!=='editor'||ownerId===owner):(role!=='owner'||ownerId!==owner)))return fail()
 return {id,owner_user_id:ownerId,revision:integer(row.revision,1),name:text(row.name,120,true),description:text(row.description,1000),created_at:instant(row.created_at),updated_at:instant(row.updated_at),access_role:role as 'owner'|'viewer'|'editor',semantic_allowed:shared?boolean(row.semantic_allowed):null,document_count:integer(row.document_count,0),chunk_count:integer(row.chunk_count,0)}
}
export const originalHomeOwnedKnowledgeSql="SELECT b.id,b.owner_user_id,b.name,b.description,b.revision,b.created_at,b.updated_at,'owner'::text AS access_role,"+
 "(SELECT count(*) FROM agentstudio.knowledge_documents d WHERE d.base_id=b.id AND d.owner_user_id=b.owner_user_id AND d.status<>'deleted') AS document_count,"+
 "(SELECT count(*) FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id WHERE d.base_id=b.id AND d.owner_user_id=b.owner_user_id AND d.status<>'deleted') AS chunk_count "+
 "FROM agentstudio.knowledge_bases b WHERE b.owner_user_id=$1::uuid AND b.visibility='private' ORDER BY b.updated_at DESC,b.id LIMIT 51"
const bounded=(rows:Row[],max=50)=>{if(!Array.isArray(rows))return fail();if(rows.length>max)throw new HttpError(503,'original_home_resources_limit_exceeded');return rows}
// This new read path reserves2s for pool admission and5s for the entire PG18
// transaction, leaving response/cleanup room inside the existing8s wire budget.
// Old frozen runtime deadlines and the underlying pool configuration are intact.
function connectForResources(pool:SqlPool):Promise<SqlClient>{
 return new Promise((resolve,reject)=>{
  let settled=false
  const timer=setTimeout(()=>{settled=true;reject(new HttpError(503,'original_home_resources_connection_timeout'))},2000)
  void Promise.resolve().then(()=>pool.connect()).then(db=>{
   if(settled){db.release();return}
   settled=true;clearTimeout(timer);resolve(db)
  },error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error)})
 })
}
/** No key/broker pool, probe callback, Worker, network transport or mutator. */
export class NativeHomeResourcesRepository{
 readonly pool:SqlPool
 readonly allowSharedStatistics:boolean
 constructor(pool:SqlPool,options:{allowSharedStatistics?:boolean}={}){this.pool=pool;this.allowSharedStatistics=options.allowSharedStatistics===true}
 async get(identity:Identity):Promise<OriginalHomeResources>{
  if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
   const db=await connectForResources(this.pool);let begun=false,primary:unknown,discard=false
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true
   await db.query("SET LOCAL transaction_timeout='5s'")
   await db.query("SET LOCAL statement_timeout='5s'")
   const result=await withActorClient(db,this.pool,identity,async(client,actor)=>this.read(client,uuid(actor)))
   await db.query('COMMIT');begun=false;return result
  }catch(error){primary=error;throw error}
   finally{try{if(begun)await db.query('ROLLBACK')}catch{discard=true;if(primary===undefined)throw new HttpError(503,'original_home_resources_rollback_required')}finally{if(discard)Reflect.apply(db.release,db,[true]);else db.release()}}
 }
 private async read(db:SqlClient,owner:string):Promise<OriginalHomeResources>{
  await db.query("SET LOCAL lock_timeout='3s'")
  const httpRows=bounded((await db.query<Row>('SELECT id,owner_user_id,revision,name,description,method,enabled,status,last_checked_at FROM agentstudio.tool_connections WHERE owner_user_id=$1::uuid ORDER BY updated_at DESC,id LIMIT 51',[owner])).rows)
  const mcpRows=bounded((await db.query<Row>('SELECT id,owner_user_id,revision,name,description,enabled,status,last_checked_at,catalog FROM agentstudio.mcp_connections WHERE owner_user_id=$1::uuid ORDER BY updated_at DESC,id LIMIT 51',[owner])).rows)
  const knowledgeRows=bounded((await db.query<Row>(originalHomeOwnedKnowledgeSql,[owner])).rows).map(row=>knowledge(row,owner,false))
  if(this.pool.knowledgeSharing===true){
   if(this.allowSharedStatistics)await verifyOriginalHomeKnowledgeStats(db)
   else await verifyOriginalHomeKnowledgeAclDependencies(db)
   const shared=bounded((await db.query<Row>('SELECT id,owner_user_id,name,description,access_role,semantic_allowed,base_revision FROM agentstudio.knowledge_shared_bases()')).rows,99)
   if(shared.length){
    if(!this.allowSharedStatistics)throw new HttpError(503,'original_home_knowledge_statistics_disabled')
    await db.query("SELECT set_config('agentstudio.original_home_knowledge_statistics_enabled','true',true)")
    const ids=shared.map(row=>uuid(row.id));if(new Set(ids).size!==ids.length)return fail()
    const stats=(await db.query<Row>('SELECT stats.* FROM unnest($1::uuid[]) AS requested(id) CROSS JOIN LATERAL agentstudio.original_home_knowledge_stats(requested.id) AS stats',[ids])).rows
    if(stats.length!==shared.length||new Set(stats.map(row=>uuid(row.id))).size!==ids.length)return fail()
    const byId=new Map(stats.map(row=>[uuid(row.id),row]))
    for(const row of shared){const actual=byId.get(uuid(row.id));if(!actual||uuid(actual.owner_user_id)!==uuid(row.owner_user_id)||actual.access_role!==row.access_role||integer(actual.revision,1)!==integer(row.base_revision,1))return fail();knowledgeRows.push(knowledge({...actual,name:row.name,description:row.description,semantic_allowed:row.semantic_allowed},owner,true))}
   }
  }
  if(new Set(knowledgeRows.map(row=>row.id)).size!==knowledgeRows.length)return fail()
  const httpConnections=httpRows.map(row=>http(row,owner)),mcpConnections=mcpRows.map(row=>mcp(row,owner))
  const aliases=[...httpConnections.map(row=>row.alias),...mcpConnections.flatMap(row=>row.tools.map(tool=>tool.alias))]
  if(new Set(aliases).size!==aliases.length)return fail()
  if(mcpConnections.reduce((sum,row)=>sum+row.tools.length,0)>200)throw new HttpError(503,'original_home_resources_limit_exceeded')
  return {format:'agentstudio.original-home-resources.v1',employee_id:owner,knowledge_sharing_enabled:this.pool.knowledgeSharing===true,http_connections:httpConnections,mcp_connections:mcpConnections,knowledge_bases:knowledgeRows}
 }
}
