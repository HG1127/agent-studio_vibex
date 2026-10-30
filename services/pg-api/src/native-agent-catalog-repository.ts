import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from './contracts.ts'
import {withActor,withActorClient} from './repository.ts'
import {safeNativeLocalAgentSpec} from './native-local-agent-contract.ts'
import {parseOriginalHomeAuthoring} from '../../../shared/original-home-authoring.ts'
import {parseOriginalAgentCatalogQuery,type OriginalAgentCatalogQuery,type OriginalAgentCatalogRow,type OriginalAgentCatalogPage,type OriginalAgentCatalogFavorite} from '../../../shared/original-agent-catalog.ts'

const native=(identity:Identity):void=>{if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')}
const unavailable=():never=>{throw new HttpError(503,'original_agent_catalog_unavailable')}
const sorts={updated_desc:'s.updated_at DESC,s.id ASC',created_desc:'s.created_at DESC,s.id ASC',name_asc:'s.name COLLATE "C" ASC,s.id ASC',name_desc:'s.name COLLATE "C" DESC,s.id ASC',favorite_desc:'COALESCE(f.favorite,false) DESC,s.updated_at DESC,s.id ASC'} as const
const join=' FROM agentstudio.agent_specs s LEFT JOIN agentstudio.agent_spec_authoring a ON a.agent_spec_id=s.id AND a.owner_user_id=s.owner_user_id LEFT JOIN agentstudio.agent_spec_favorites f ON f.agent_spec_id=s.id AND f.owner_user_id=s.owner_user_id '
// User search values are literal substrings, not LIKE patterns or SQL syntax.
const search="concat_ws(E'\\n',s.name,s.spec->>'goal',s.spec->>'task_scope',(s.spec->'deliverables')::text,(s.spec->'task_plan')::text,(s.spec->'done_criteria')::text,(s.spec->'tools')::text)"
const where='WHERE s.owner_user_id=$1::uuid AND NOT(s.id=ANY($5::uuid[])) AND ($2::text=\'\' OR strpos(lower('+search+'),lower($2::text))>0) AND ($3::text=\'all\' OR a.authoring->>\'source\'=$3::text) AND (NOT $4::boolean OR COALESCE(f.favorite,false))'
async function hidden(db:SqlClient):Promise<string[]>{
 const exists=(await db.query<{ok:boolean}>("SELECT to_regprocedure('agentstudio.agent_caller_internal_sources()') IS NOT NULL AS ok")).rows[0]?.ok
 if(exists!==true&&exists!==false)unavailable()
 //071 is installed only after the complete069/070 predecessor. The original
 //068 helper must exist here; treating its disappearance as an empty hidden
 // set would expose internal caller source Agents in the ordinary catalog.
 if(!exists)return unavailable()
 const ids=(await db.query<{ids:string[]}>('SELECT agentstudio.agent_caller_internal_sources() AS ids')).rows[0]?.ids
 if(!Array.isArray(ids)||ids.some(id=>!isUuid(id)))return unavailable()
 return ids.map(id=>id.toLowerCase())
}
function safeInteger(raw:unknown,minimum:number):number{
 if(typeof raw!=='number'&&typeof raw!=='string'||typeof raw==='string'&&!/^(0|[1-9][0-9]*)$/.test(raw))return unavailable()
 const n=Number(raw);if(!Number.isSafeInteger(n)||n<minimum)return unavailable();return n
}
function timestamp(raw:unknown):string{
 if(raw instanceof Date&&Number.isFinite(raw.getTime()))return raw.toISOString()
 if(typeof raw==='string'&&Number.isFinite(Date.parse(raw)))return new Date(raw).toISOString()
 return unavailable()
}
function readSpec(raw:unknown):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return unavailable()
 const {require_approval:approval,...write}=raw as Record<string,unknown>
 if(approval!==true)return unavailable()
 try{
  // Syntax/data validation only. This read never approves a tool or executes
  // a stored Native-local binding; execution has its existing separate gates.
  return {...safeNativeLocalAgentSpec(write,true)}
 }catch{return unavailable()}
}
function row(raw:Record<string,unknown>,owner:string):OriginalAgentCatalogRow{
 if(!isUuid(raw.id)||raw.owner_user_id!==owner||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>120||/[\u0000-\u001f\u007f]/.test(raw.name)||typeof raw.favorite!=='boolean')return unavailable()
 let authoring:OriginalAgentCatalogRow['authoring'];try{authoring=raw.authoring===null?null:parseOriginalHomeAuthoring(raw.authoring)}catch{return unavailable()}
 return{id:raw.id,owner_user_id:owner,name:raw.name,spec:readSpec(raw.spec),revision:safeInteger(raw.revision,1),created_at:timestamp(raw.created_at),updated_at:timestamp(raw.updated_at),authoring,favorite:raw.favorite}
}
function query(raw:OriginalAgentCatalogQuery):OriginalAgentCatalogQuery{
 if(!raw||typeof raw!=='object'||Object.keys(raw).sort().join(',')!=='favorite,page,perPage,q,sort,source'||typeof raw.favorite!=='boolean')throw new HttpError(400,'invalid_original_agent_catalog_query')
 try{return parseOriginalAgentCatalogQuery({page:String(raw.page),perPage:String(raw.perPage),q:raw.q,source:raw.source,sort:raw.sort,...(raw.favorite?{favorite:'1'}:{})})}catch{throw new HttpError(400,'invalid_original_agent_catalog_query')}
}
/** One RR snapshot includes both COUNT and the real selected SQL page.
 * The existing068 hidden-source helper uses a065 FOR SHARE membership check,
 * so this read transaction permits that original lock; it issues no DML. */
async function snapshot<T>(pool:SqlPool,identity:Identity,body:(db:SqlClient,owner:string)=>Promise<T>):Promise<T>{
 const db=await pool.connect();let begun=false,discard=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');begun=true;const value=await withActorClient(db,pool,identity,body);await db.query('COMMIT');begun=false;return value}
 catch(error){if(begun)try{await db.query('ROLLBACK')}catch{discard=true}throw error}
 finally{if(discard)Reflect.apply(db.release,db,[true]);else db.release()}
}
export class NativeAgentCatalogRepository{
 readonly pool:SqlPool
 constructor(pool:SqlPool){this.pool=pool}
 list(identity:Identity,input:OriginalAgentCatalogQuery):Promise<OriginalAgentCatalogPage>{
  native(identity);const selected=query(input)
  return snapshot(this.pool,identity,async(db,owner)=>{
   const excluded=await hidden(db),args=[owner,selected.q,selected.source,selected.favorite,excluded],count=(await db.query<{total:unknown}>('SELECT count(*)::text AS total'+join+where,args)).rows[0]
   if(!count)return unavailable();const total=safeInteger(count.total,0),offset=(selected.page-1)*selected.perPage
   const records=(await db.query<Record<string,unknown>>('SELECT s.id,s.owner_user_id,s.name,s.spec,s.revision,s.created_at,s.updated_at,a.authoring,COALESCE(f.favorite,false) AS favorite'+join+where+' ORDER BY '+sorts[selected.sort]+' LIMIT $6::int OFFSET $7::bigint',[...args,selected.perPage,offset])).rows
   if(!Array.isArray(records)||records.length!==Math.max(0,Math.min(selected.perPage,total-offset)))return unavailable()
   const items=records.map(value=>row(value,owner));if(new Set(items.map(item=>item.id)).size!==items.length)return unavailable()
   return{items,totalItems:total,page:selected.page,totalPages:Math.ceil(total/selected.perPage),perPage:selected.perPage}
  })
 }
 favorite(identity:Identity,id:string,favorite:boolean,expectedRevision:number,expectedEmployee:string):Promise<OriginalAgentCatalogFavorite>{
  native(identity);if(!isUuid(id)||typeof favorite!=='boolean'||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw new HttpError(400,'invalid_original_agent_catalog_favorite')
  if(!isUuid(expectedEmployee))throw new HttpError(400,'expected_employee_required')
  const selected=id.toLowerCase(),expectedOwner=expectedEmployee.toLowerCase()
  return withActor(this.pool,identity,async(db,owner)=>{
   // This header-derived value is only a concurrency precondition. Cookie
   // authentication and the real active Actor mapping have already happened.
   if(owner.toLowerCase()!==expectedOwner)throw new HttpError(409,'employee_session_changed')
   if((await hidden(db)).includes(selected))throw new HttpError(404,'spec_not_found')
   const master=(await db.query<{revision:unknown}>('SELECT revision FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE',[selected,owner])).rows[0]
   if(!master)throw new HttpError(404,'spec_not_found');const revision=safeInteger(master.revision,1)
   if(revision!==expectedRevision)throw new HttpError(409,'revision_conflict')
   const old=(await db.query<{favorite:boolean}>('SELECT favorite FROM agentstudio.agent_spec_favorites WHERE agent_spec_id=$1::uuid AND owner_user_id=$2::uuid',[selected,owner])).rows[0]
   if(old&&typeof old.favorite!=='boolean')return unavailable()
   const changed=(await db.query<{agent_spec_id:string;owner_user_id:string;favorite:boolean}>('INSERT INTO agentstudio.agent_spec_favorites(agent_spec_id,owner_user_id,favorite) VALUES($1::uuid,$2::uuid,$3::boolean) ON CONFLICT(agent_spec_id) DO UPDATE SET favorite=EXCLUDED.favorite,updated_at=clock_timestamp() WHERE agentstudio.agent_spec_favorites.owner_user_id=EXCLUDED.owner_user_id RETURNING agent_spec_id,owner_user_id,favorite',[selected,owner,favorite])).rows[0]
   if(!changed||changed.agent_spec_id!==selected||changed.owner_user_id!==owner||changed.favorite!==favorite)throw new HttpError(503,'original_agent_catalog_favorite_unconfirmed')
   await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES($1::uuid,$1::uuid,'agent.catalog.favorite','agent_spec',$2::text,'succeeded',$3::jsonb)",[owner,selected,JSON.stringify({format:'agentstudio.agent-catalog-favorite.v1',spec_revision:revision,previous_favorite:old?.favorite??false,favorite})])
   return{agent_spec_id:selected,favorite,revision}
  })
 }
}
