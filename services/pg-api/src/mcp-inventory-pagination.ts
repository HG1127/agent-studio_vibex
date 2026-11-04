import {randomUUID} from 'node:crypto'
import {HttpError,type Identity,type SqlPool} from './contracts.ts'
import {withActor,assertOwnedAdmissionContext} from './repository.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {parseMcpCatalog} from './mcp-catalog.ts'
import {createMcpInventoryPageCursor,mcpInventoryEpoch,type McpInventoryPosition} from './mcp-inventory-page-cursor.ts'
import {mcpInventoryProtocol,mcpInventoryMode,mcpInventoryCollection,mcpInventoryId,parseMcpInventoryItem,compareMcpInventoryOrder,type McpInventoryItem,type McpInventoryPage} from '../../../shared/mcp-inventory-pagination-contract.ts'
export type McpInventoryQuery={limit:number;cursor?:string}
export function parseMcpInventoryQuery(raw:string):McpInventoryQuery{const fail=():never=>{throw new HttpError(400,'invalid_mcp_inventory_query')};let url:URL;try{url=new URL(raw,'http://127.0.0.1')}catch{return fail()}if(raw.length>2400||raw!==url.pathname+url.search||url.pathname!==mcpInventoryCollection||url.hash)return fail();const p=url.searchParams;for(const key of p.keys())if(!['paging','limit','cursor'].includes(key)||p.getAll(key).length!==1)return fail();if(p.get('paging')!==mcpInventoryMode||!/^([1-9]|[1-4][0-9]|50)$/.test(p.get('limit')??''))return fail();const cursor=p.get('cursor');if(cursor!==null&&!/^mcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(cursor))return fail();return{limit:Number(p.get('limit')),...(cursor!==null?{cursor}:{})}}
const fields=['id','owner_user_id','name','description','enabled','status','catalog','last_checked_at','revision','updated_at'] as const,times=new Set(['last_checked_at','updated_at']),fingerprint=fields.map(field=>times.has(field)?`to_char(${field} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`:field),outputs=fields.map(field=>times.has(field)?`to_char(selected.${field} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ${field}`:`selected.${field}`)
// One statement/MVCC page and full owner fingerprint. Only metadata leaves this
// module; catalog schemas are validated with the actual existing parser here.
// No URL, credential headers, ciphertext, Broker, network, DML, OFFSET or cap.
export const mcpInventoryPageSql=`WITH owned AS MATERIALIZED (
 SELECT ${fields.join(',')} FROM agentstudio.mcp_connections WHERE owner_user_id=$1::uuid
), state AS (
 SELECT count(*)::text AS page_total,encode(sha256(convert_to(COALESCE(string_agg(jsonb_build_array(${fingerprint.join(',')})::text,E'\\n' ORDER BY id),''),'UTF8')),'hex') AS page_fingerprint FROM owned
), selected AS (
 SELECT * FROM owned WHERE ($2::timestamptz IS NULL OR updated_at<$2::timestamptz OR (updated_at=$2::timestamptz AND id>$3::uuid)) ORDER BY updated_at DESC,id ASC LIMIT $4::int
)
SELECT ${outputs.join(',')},state.page_total,state.page_fingerprint FROM state LEFT JOIN selected ON true ORDER BY selected.updated_at DESC,selected.id ASC`
type Codec=ReturnType<typeof createMcpInventoryPageCursor>
/** Pure SQL-row DATA projection, never proof of an Actor/role/context. */
export function assembleMcpInventoryPage(options:{rows:Record<string,unknown>[];actor:string;contextEpoch:string;limit:number;prior:McpInventoryPosition|null;codec:Codec;now:number;snapshotId?:()=>string}):McpInventoryPage{try{
 const {rows,actor,limit,prior,codec,now}=options,epoch=mcpInventoryEpoch(options.contextEpoch),first=rows[0];mcpInventoryId(actor);if(!Number.isSafeInteger(limit)||limit<1||limit>50||!first||typeof first.page_total!=='string'||!/^(0|[1-9][0-9]*)$/.test(first.page_total)||!Number.isSafeInteger(Number(first.page_total))||typeof first.page_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(first.page_fingerprint))throw new HttpError(503,'invalid_mcp_inventory_state')
 const total=Number(first.page_total),hash=first.page_fingerprint,offset=prior?.offset??0,snapshot=prior?.snapshot??(options.snapshotId??randomUUID)(),expires=prior?.expires_at??now+300000;if(prior&&(prior.owner!==actor||prior.context_epoch!==epoch||prior.limit!==limit))throw new HttpError(409,'employee_session_changed');if(prior&&(prior.total!==total||prior.fingerprint!==hash))throw new HttpError(409,'mcp_inventory_snapshot_changed')
 const selected=rows.filter(row=>row.id!==null);if(rows.length>limit+1||!selected.length&&total!==0||selected.length>0&&offset>=total||rows.some(row=>row.page_total!==first.page_total||row.page_fingerprint!==hash)||selected.some(row=>row.owner_user_id!==actor))throw new HttpError(503,'invalid_mcp_inventory_state')
 const items:McpInventoryItem[]=[];let bytes=0,last=prior?{id:prior.after_id,updated_at:prior.after_updated_at}:undefined
 for(const raw of selected.slice(0,limit)){const catalog=raw.status==='ok'?parseMcpCatalog(raw.catalog):null,tools=catalog?.tools.map(tool=>({name:tool.name,description:tool.description}))??[],revision=typeof raw.revision==='string'&&/^[1-9][0-9]*$/.test(raw.revision)?Number(raw.revision):raw.revision,row=parseMcpInventoryItem({id:raw.id,owner_user_id:raw.owner_user_id,name:raw.name,description:raw.description,enabled:raw.enabled,status:raw.status,revision,updated_at:raw.updated_at,last_checked_at:raw.last_checked_at,catalog_recorded:catalog!==null,tool_count:catalog?tools.length:null,tools},actor);if(last&&compareMcpInventoryOrder(last,row)>=0)throw new HttpError(503,'invalid_mcp_inventory_order');const size=Buffer.byteLength(JSON.stringify(row),'utf8');if(size>500000)throw new HttpError(503,'mcp_inventory_item_too_large');if(items.length&&bytes+size>500000)break;bytes+=size;items.push(row);last=row}
 const seen=offset+items.length;if(seen>total||seen<total&&!items.length||seen===total&&selected.length>items.length)throw new HttpError(503,'invalid_mcp_inventory_state');if(expires<=now)throw new HttpError(410,'mcp_inventory_cursor_expired');const complete=seen===total,next=complete?null:codec.seal({owner:actor,context_epoch:epoch,snapshot,fingerprint:hash,total,offset:seen,limit,expires_at:expires,after_updated_at:last!.updated_at,after_id:last!.id});return{protocol:mcpInventoryProtocol,owner_user_id:actor,snapshot_id:mcpInventoryId(snapshot),total,items,next_cursor:next,complete,execution_enabled:false}
 }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(503,'invalid_mcp_inventory_state')}}
export async function readMcpInventoryPage(options:{pool:SqlPool;key:Buffer;identity:Identity;expectedEmployee:string;query:McpInventoryQuery;now?:()=>number}):Promise<McpInventoryPage>{
 if(options.identity?.issuer!=='urn:agentstudio:local:v1')throw new HttpError(403,'native_employee_identity_required')
 const {limit,cursor}=options.query,expected=mcpInventoryId(options.expectedEmployee),codec=createMcpInventoryPageCursor(options.key),now=options.now??Date.now
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new HttpError(400,'invalid_mcp_inventory_query')
 return withActor(options.pool,options.identity,async(db,actor)=>{
  assertOriginalUiEmployee(actor,expected);await assertOwnedAdmissionContext(db,actor)
  await db.query("SET LOCAL statement_timeout='8000ms'; SET LOCAL lock_timeout='3000ms'")
  const result=(await db.query<{epoch:unknown}>('SELECT agentstudio.agent_memory_outcome_epoch() AS epoch')).rows
  if(result.length!==1||result[0]?.epoch===null)throw new HttpError(401,'session_required')
  const epoch=mcpInventoryEpoch(result[0]?.epoch),at=now(),prior=cursor?codec.open(cursor,actor,epoch,limit,at):null
  const rows=(await db.query<Record<string,unknown>>(mcpInventoryPageSql,[actor,prior?.after_updated_at??null,prior?.after_id??null,limit+1])).rows,page=assembleMcpInventoryPage({rows,actor,contextEpoch:epoch,limit,prior,codec,now:at})
  const final=(await db.query<{epoch:unknown}>('SELECT agentstudio.agent_memory_outcome_epoch() AS epoch')).rows
  if(final.length!==1||final[0]?.epoch===null||mcpInventoryEpoch(final[0]?.epoch)!==epoch)throw new HttpError(409,'employee_session_changed')
  if(prior&&prior.expires_at<=now()||!prior&&at+300000<=now())throw new HttpError(410,'mcp_inventory_cursor_expired')
  return page
 })
}
