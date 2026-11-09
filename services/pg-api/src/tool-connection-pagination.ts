import {randomUUID} from 'node:crypto'
import {HttpError,type Identity,type SqlPool} from './contracts.ts'
import {withActor,assertOwnedAdmissionContext} from './repository.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {createToolConnectionPageCursor,type ToolPagePosition} from './tool-connection-page-cursor.ts'
import {toolConnectionPaginationProtocol,toolConnectionPaginationMode,toolPageId,toolPageTime,compareToolPageOrder,type ToolConnectionPage} from '../../../shared/tool-connection-pagination-contract.ts'
import {parseOriginalToolConnection,type OriginalToolConnection} from '../../../shared/original-tool-connections-contract.ts'
const fields=['id','owner_user_id','name','description','url','method','headers','body_template','timeout_s','enabled','status','last_latency_ms','last_checked_at','last_error','revision','created_at','updated_at'] as const
const times=new Set(['last_checked_at','created_at','updated_at']),fingerprintFields=fields.map(field=>times.has(field)?`to_char(${field} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`:field),outputFields=fields.map(field=>times.has(field)?`to_char(selected.${field} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ${field}`:`selected.${field}`)
export type ToolPageQuery={limit:number;cursor?:string}
export function parseToolConnectionPageQuery(raw:string):ToolPageQuery{const fail=():never=>{throw new HttpError(400,'invalid_tool_connection_page_query')};let params:URLSearchParams;try{params=new URL(raw,'http://127.0.0.1').searchParams}catch{return fail()}for(const key of params.keys())if(!['paging','limit','cursor'].includes(key)||params.getAll(key).length!==1)return fail();if(params.get('paging')!==toolConnectionPaginationMode||!/^([1-9]|[1-4][0-9]|50)$/.test(params.get('limit')??''))return fail();const cursor=params.get('cursor');if(cursor!==null&&(!/^tcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(cursor)||cursor.length>2048))return fail();return{limit:Number(params.get('limit')),...(cursor!==null?{cursor}:{})}}
// One PostgreSQL statement/MVCC snapshot. Header names and constant public masks
// share that same snapshot; no credential ciphertext, Broker, DML or OFFSET.
export const toolConnectionPageSql=`WITH owned AS MATERIALIZED (
 SELECT t.id,t.owner_user_id,t.name,t.description,t.url,t.method,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('key',h.header_name,'value','••••') ORDER BY h.header_name) FROM agentstudio.tool_connection_headers h WHERE h.owner_user_id=$1::uuid AND h.tool_connection_id=t.id),'[]'::jsonb) AS headers,
 t.body_template,t.timeout_s,t.enabled,t.status,t.last_latency_ms,t.last_checked_at,t.last_error,t.revision,t.created_at,t.updated_at
 FROM agentstudio.tool_connections t WHERE t.owner_user_id=$1::uuid
), state AS (
 SELECT count(*)::text AS page_total,encode(sha256(convert_to(COALESCE(string_agg(jsonb_build_array(${fingerprintFields.join(',')})::text,E'\\n' ORDER BY id),''),'UTF8')),'hex') AS page_fingerprint FROM owned
), selected AS (
 SELECT * FROM owned WHERE ($2::timestamptz IS NULL OR updated_at<$2::timestamptz OR (updated_at=$2::timestamptz AND id>$3::uuid))
 ORDER BY updated_at DESC,id ASC LIMIT $4::int
)
SELECT ${outputFields.join(',')},state.page_total,state.page_fingerprint FROM state LEFT JOIN selected ON true ORDER BY selected.updated_at DESC,selected.id ASC`
type Codec=ReturnType<typeof createToolConnectionPageCursor>
/** Pure assembly of statement DATA; it does not establish DB/role authority. */
export function assembleToolConnectionPage(options:{rows:Record<string,unknown>[];actor:string;limit:number;prior:ToolPagePosition|null;codec:Codec;now:number;snapshotId?:()=>string}):ToolConnectionPage<Readonly<OriginalToolConnection>>{
 const {rows,actor,limit,prior,codec,now}=options,first=rows[0];if(!Number.isSafeInteger(limit)||limit<1||limit>50||!first||typeof first.page_total!=='string'||!/^(0|[1-9][0-9]*)$/.test(first.page_total)||!Number.isSafeInteger(Number(first.page_total))||typeof first.page_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(first.page_fingerprint))throw new HttpError(503,'invalid_tool_connection_page_state')
 const total=Number(first.page_total),fingerprint=first.page_fingerprint,offset=prior?.offset??0,snapshot=prior?.snapshot??(options.snapshotId??randomUUID)(),expires=prior?.expires_at??now+300000
 if(prior&&(prior.owner!==actor||prior.limit!==limit))throw new HttpError(409,'employee_session_changed')
 if(prior&&(prior.total!==total||prior.fingerprint!==fingerprint))throw new HttpError(409,'tool_connection_snapshot_changed')
 const selected=rows.filter(row=>row.id!==null);if(rows.length>limit+1||selected.length===0&&total!==0||selected.length>0&&offset>=total)throw new HttpError(503,'invalid_tool_connection_page_state')
 const items:Readonly<OriginalToolConnection>[]=[];let bytes=0,last=prior?{id:prior.after_id,updated_at:prior.after_updated_at}:undefined
 for(const raw of selected.slice(0,limit)){if(raw.page_total!==first.page_total||raw.page_fingerprint!==fingerprint||raw.owner_user_id!==actor)throw new HttpError(503,'invalid_tool_connection_page_state');const publicRow:Record<string,unknown>={};for(const field of fields)publicRow[field]=raw[field];let row:Readonly<OriginalToolConnection>;try{if(typeof publicRow.revision==='string'){if(!/^[1-9][0-9]*$/.test(publicRow.revision))throw Error();publicRow.revision=Number(publicRow.revision)}row=parseOriginalToolConnection(publicRow,actor);toolPageTime(row.updated_at)}catch{throw new HttpError(503,'invalid_tool_connection_page_state')}if(last&&compareToolPageOrder(last,row)>=0)throw new HttpError(503,'invalid_tool_connection_page_order');const size=Buffer.byteLength(JSON.stringify(row),'utf8');if(size>500000)throw new HttpError(503,'tool_connection_page_item_too_large');if(items.length&&bytes+size>500000)break;bytes+=size;items.push(row);last=row}
 const seen=offset+items.length;if(seen>total||seen<total&&!items.length||seen===total&&selected.length>items.length)throw new HttpError(503,'invalid_tool_connection_page_state');if(expires<=now)throw new HttpError(410,'tool_connection_cursor_expired')
 const complete=seen===total,next=complete?null:codec.seal({owner:actor,snapshot,fingerprint,total,offset:seen,limit,expires_at:expires,after_updated_at:last!.updated_at,after_id:last!.id})
 return{protocol:toolConnectionPaginationProtocol,owner_user_id:actor,snapshot_id:toolPageId(snapshot),total,items,next_cursor:next,complete}
}
export async function readToolConnectionPage(options:{pool:SqlPool;key:Buffer;identity:Identity;expectedEmployee:string;query:ToolPageQuery;now?:()=>number}):Promise<ToolConnectionPage<Readonly<OriginalToolConnection>>>{const {limit,cursor}=options.query;if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new HttpError(400,'invalid_limit');const expected=toolPageId(options.expectedEmployee),codec=createToolConnectionPageCursor(options.key),now=options.now??Date.now;return withActor(options.pool,options.identity,async(db,actor)=>{assertOriginalUiEmployee(actor,expected);await assertOwnedAdmissionContext(db,actor);const at=now(),prior=cursor?codec.open(cursor,actor,limit,at):null,rows=(await db.query<Record<string,unknown>>(toolConnectionPageSql,[actor,prior?.after_updated_at??null,prior?.after_id??null,limit+1])).rows;const page=assembleToolConnectionPage({rows,actor,limit,prior,codec,now:at});if(prior&&prior.expires_at<=now()||!prior&&at+300000<=now())throw new HttpError(410,'tool_connection_cursor_expired');return page})}
