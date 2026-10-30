import {randomUUID} from 'node:crypto'
import {HttpError,type Identity,type SqlPool} from './contracts.ts'
import {withActor,assertOwnedAdmissionContext} from './repository.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {createModelConnectionPageCursor} from './model-connection-page-cursor.ts'
import {modelConnectionPaginationProtocol,modelConnectionPaginationMode,modelPageId,type ModelConnectionPage} from '../../../shared/model-connection-pagination-contract.ts'
const fields=['id','owner_user_id','name','provider','base_url','api_key_tail','enabled','status','last_latency_ms','last_checked_at','models','last_error','revision','created_at','updated_at'] as const
const fingerprintFields=fields.map(field=>['last_checked_at','created_at','updated_at'].includes(field)?`to_char(${field} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`:field)
export type ModelPageQuery={limit:number;cursor?:string}
export function parseModelConnectionPageQuery(raw:string):ModelPageQuery{
 const fail=():never=>{throw new HttpError(400,'invalid_model_connection_page_query')};let params:URLSearchParams;try{params=new URL(raw,'http://127.0.0.1').searchParams}catch{return fail()}
 for(const key of params.keys())if(!['paging','limit','cursor'].includes(key)||params.getAll(key).length!==1)return fail()
 if(params.get('paging')!==modelConnectionPaginationMode||!/^([1-9]|[1-4][0-9]|50)$/.test(params.get('limit')??''))return fail()
 const cursor=params.get('cursor');if(cursor!==null&&(!/^mcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(cursor)||cursor.length>2048))return fail()
 return{limit:Number(params.get('limit')),...(cursor!==null?{cursor}:{})}
}
// One statement snapshot, only public columns. Any owner metadata change during
// the walk invalidates the next page; no secret/Broker, schema, receipt or write.
export const modelConnectionPageSql=`WITH owned AS MATERIALIZED (
 SELECT ${fields.join(',')} FROM agentstudio.model_connections WHERE owner_user_id=$1::uuid
), state AS (
 SELECT count(*)::text AS page_total,encode(sha256(convert_to(COALESCE(string_agg(jsonb_build_array(${fingerprintFields.join(',')})::text,E'\\n' ORDER BY id),''),'UTF8')),'hex') AS page_fingerprint FROM owned
), selected AS (
 SELECT * FROM owned WHERE ($2::timestamptz IS NULL OR updated_at<$2::timestamptz OR (updated_at=$2::timestamptz AND id>$3::uuid))
 ORDER BY updated_at DESC,id ASC LIMIT $4::int
)
SELECT selected.*,state.page_total,state.page_fingerprint,to_char(selected.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS page_position_time
FROM state LEFT JOIN selected ON true ORDER BY selected.updated_at DESC,selected.id ASC`
export async function readModelConnectionPage<T extends {id:string;owner_user_id:string}>(options:{pool:SqlPool;key:Buffer;identity:Identity;expectedEmployee:string;query:ModelPageQuery;normalize:(raw:Record<string,unknown>)=>T;now?:()=>number}):Promise<ModelConnectionPage<T>>{
 const {limit,cursor}=options.query;if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new HttpError(400,'invalid_limit')
 const expected=modelPageId(options.expectedEmployee),codec=createModelConnectionPageCursor(options.key),now=options.now??Date.now
 return withActor(options.pool,options.identity,async(db,actor)=>{
  assertOriginalUiEmployee(actor,expected);await assertOwnedAdmissionContext(db,actor)
  const at=now(),prior=cursor?codec.open(cursor,actor,limit,at):null
  const rows=(await db.query<Record<string,unknown>>(modelConnectionPageSql,[actor,prior?.after_updated_at??null,prior?.after_id??null,limit+1])).rows,first=rows[0]
  if(!first||typeof first.page_total!=='string'||!/^(0|[1-9][0-9]*)$/.test(first.page_total)||!Number.isSafeInteger(Number(first.page_total))||typeof first.page_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(first.page_fingerprint))throw new HttpError(503,'invalid_model_connection_page_state')
  const total=Number(first.page_total),fingerprint=first.page_fingerprint,offset=prior?.offset??0,snapshot=prior?.snapshot??randomUUID(),expires=prior?.expires_at??at+300000
  if(prior&&(prior.total!==total||prior.fingerprint!==fingerprint))throw new HttpError(409,'model_connection_snapshot_changed')
  const selected=rows.filter(row=>row.id!==null);if(rows.length>limit+1||selected.length===0&&total!==0||selected.length>0&&offset>=total)throw new HttpError(503,'invalid_model_connection_page_state')
  const items:T[]=[];let bytes=0,last:Record<string,unknown>|undefined
  for(const raw of selected.slice(0,limit)){if(raw.page_total!==first.page_total||raw.page_fingerprint!==fingerprint||raw.owner_user_id!==actor||typeof raw.page_position_time!=='string')throw new HttpError(503,'invalid_model_connection_page_state');const publicRow:Record<string,unknown>={};for(const field of fields)publicRow[field]=raw[field];const row=options.normalize(publicRow),size=Buffer.byteLength(JSON.stringify(row),'utf8');if(size>500000)throw new HttpError(503,'model_connection_page_item_too_large');if(items.length&&bytes+size>500000)break;bytes+=size;items.push(row);last=raw}
  const seen=offset+items.length;if(seen>total||seen<total&&!items.length||seen===total&&selected.length>items.length)throw new HttpError(503,'invalid_model_connection_page_state')
  if(expires<=now())throw new HttpError(410,'model_connection_cursor_expired')
  const complete=seen===total,next=complete?null:codec.seal({owner:actor,snapshot,fingerprint,total,offset:seen,limit,expires_at:expires,after_updated_at:String(last!.page_position_time),after_id:String(last!.id)})
  return{protocol:modelConnectionPaginationProtocol,owner_user_id:actor,snapshot_id:snapshot,total,items,next_cursor:next,complete}
 })
}
