import {prepareOriginalSkillAbOnClient} from './original-skill-ab-source.ts'
import {HttpError,type SqlClient,type SqlPool,type Identity} from './contracts.ts'
import {withActorClient,assertOwnedAdmissionContext} from './repository.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {requireOriginalRoleUi} from './original-role-ui-policy.ts'
import {importOriginalSkillOnClient,reviewOriginalSkillOnClient,activateOriginalSkillOnClient,parseOriginalSkillSource} from './original-role-skill-policy.ts'
import {originalRoleHash} from './original-role-execution.mjs'
import {roleObject} from '../../../shared/original-role-execution-contract.mjs'
const skill=/^[A-Za-z0-9]{15}$/,sha=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
function bad():never{throw new HttpError(400,'invalid_original_role_input')}
function sourceUrl(raw:unknown){if(raw==='')return '';if(typeof raw!=='string'||raw.length>1000)bad();let u:URL;try{u=new URL(raw)}catch{bad()};if(u.protocol!=='https:'||u.hostname!=='raw.githubusercontent.com'||u.port||u.username||u.password||u.search||u.hash||!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:[A-Za-z0-9_.-]+\/)+SKILL\.md$/i.test(u.pathname))bad();return u.href}
export class OriginalRoleUiRepository{
 readonly pool:SqlPool;readonly writes:boolean
 constructor(pool:SqlPool,writes:boolean){this.pool=pool;this.writes=writes}
 async actor<T>(identity:Identity,expected:string,readOnly:boolean,fn:(db:SqlClient,owner:string)=>Promise<T>):Promise<T>{
  if(identity?.issuer!=='urn:agentstudio:local:v1'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
  const db=await this.pool.connect();let begun=false,committing=false,destroy=false,primary:unknown,hasPrimary=false,value:T|undefined
  try{await db.query(readOnly?'BEGIN READ ONLY':'BEGIN');begun=true;value=await withActorClient(db,this.pool,identity,async(c,owner)=>{assertOriginalUiEmployee(owner,expected);requireOriginalRoleUi(c);await assertOwnedAdmissionContext(c,owner);return fn(c,owner)});committing=true;await db.query('COMMIT');begun=false}
  catch(error){if(!begun)destroy=true;primary=committing?new HttpError(503,'original_role_commit_unconfirmed'):error;hasPrimary=true}
  finally{if(begun)try{await db.query('ROLLBACK')}catch{destroy=true}try{db.release(destroy)}catch(error){if(!hasPrimary){primary=new HttpError(503,'original_role_release_unconfirmed');hasPrimary=true}}}
  if(hasPrimary)throw primary;return value!
 }
 authorize(identity:Identity,owner:string){return this.actor(identity,owner,true,async()=>undefined)}
 meta(identity:Identity,owner:string){return this.actor(identity,owner,true,async()=>({employee_id:owner,protocol:'original-role-ui.v3',roles:true,reviewed_v1:true,skill_ab:false,skill_ab_preview:true,writes:this.writes}))}
 previewSkillAB(identity:Identity,owner:string,raw:unknown){return this.actor(identity,owner,false,async db=>({employee_id:owner,preview:await prepareOriginalSkillAbOnClient(db,owner,raw)}))}
 list(identity:Identity,owner:string){return this.actor(identity,owner,true,async db=>{
  const rows=(await db.query<{id:string;name:string;description:string;active:boolean;latest_version:number;approved_version:number;approved_hash:string;updated_ms:string|number}>("SELECT s.id,s.name,v.description,s.active,s.latest_version,coalesce((SELECT e.metadata->>'source_url' FROM agentstudio.audit_events e WHERE e.owner_user_id=s.owner_user_id AND e.actor_user_id=s.owner_user_id AND e.action='agent.skill_source' AND e.target_id=s.id AND e.metadata->>'version'=v.version::text AND e.metadata->>'hash'=v.content_sha256 ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1),'') AS source_url,coalesce(r.version,0) AS approved_version,coalesce(r.content_sha256,'') AS approved_hash,(extract(epoch FROM s.updated_at)*1000)::bigint AS updated_ms FROM agentstudio_roles.original_skills s JOIN agentstudio_roles.original_skill_versions v ON v.owner_user_id=s.owner_user_id AND v.skill_id=s.id AND v.version=s.latest_version LEFT JOIN LATERAL(SELECT a.version,a.content_sha256 FROM agentstudio_roles.original_skill_reviews a WHERE a.owner_user_id=s.owner_user_id AND a.skill_id=s.id ORDER BY a.version DESC LIMIT 1) r ON true WHERE s.owner_user_id=$1::uuid ORDER BY s.updated_at DESC,s.id LIMIT 100",[owner])).rows
  return {employee_id:owner,items:rows.map(r=>({...r,latest_version:Number(r.latest_version),approved_version:Number(r.approved_version),updated_ms:Number(r.updated_ms)}))}
 })}
 detail(identity:Identity,owner:string,id:string,version:number){if(!skill.test(id)||!Number.isSafeInteger(version)||version<1||version>100)bad();return this.actor(identity,owner,false,async db=>{
  const rows=(await db.query<Record<string,unknown>>("SELECT s.id,v.name,v.description,v.content,v.version,v.content_sha256 AS hash,s.active,coalesce((SELECT e.metadata->>'source_url' FROM agentstudio.audit_events e WHERE e.owner_user_id=s.owner_user_id AND e.actor_user_id=s.owner_user_id AND e.action='agent.skill_source' AND e.target_id=s.id AND e.metadata->>'version'=v.version::text AND e.metadata->>'hash'=v.content_sha256 ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1),'') AS source_url,EXISTS(SELECT 1 FROM agentstudio_roles.original_skill_reviews r WHERE r.owner_user_id=v.owner_user_id AND r.skill_id=v.skill_id AND r.version=v.version AND r.content_sha256=v.content_sha256) AS approved FROM agentstudio_roles.original_skills s JOIN agentstudio_roles.original_skill_versions v ON v.owner_user_id=s.owner_user_id AND v.skill_id=s.id WHERE s.owner_user_id=$1::uuid AND s.id=$2::text AND v.version=$3::integer FOR SHARE OF s,v",[owner,id,version])).rows
  if(rows.length!==1)throw new HttpError(404,'skill_not_found')
  const item=rows[0]!,parsed=parseOriginalSkillSource(item.content);if(parsed.hash!==item.hash)throw new HttpError(503,'original_role_skill_content_changed')
  return {employee_id:owner,item:{...item,version:Number(item.version)}}
 })}
 async mutate(identity:Identity,owner:string,path:string,raw:unknown){
  const value=roleObject(raw,['operation_id','request_sha256'],path==='/import'?['source','source_url']:path==='/approve'?['id','version','hash','confirm_review']:path==='/active'?['id','active']:[])
  const {operation_id,request_sha256,...data}=value
  if(typeof operation_id!=='string'||!uuid.test(operation_id)||typeof request_sha256!=='string'||!sha.test(request_sha256)||originalRoleHash({path,data})!==request_sha256)bad()
  return this.actor(identity,owner,false,async db=>{
   if(!this.writes)throw new HttpError(403,'original_role_writes_disabled')
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',[owner+':role-ui:'+operation_id])
   const prior=await this.receiptOnClient(db,owner,operation_id,request_sha256)
   if(prior)return {employee_id:owner,operation_id,request_sha256,result:prior}
   let result:unknown
   if(path==='/import'){
    roleObject(data,['source','source_url']);const parsed=parseOriginalSkillSource(data.source),url=sourceUrl(data.source_url)
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',[owner+':role-ui-skills'])
    const counts=(await db.query<{count:string|number;existing:boolean}>('SELECT count(*) AS count,bool_or(name=$2::text) AS existing FROM agentstudio_roles.original_skills WHERE owner_user_id=$1::uuid',[owner,parsed.name])).rows[0]
    if(Number(counts?.count)>=50&&!counts?.existing)throw new HttpError(429,'skill_count_limit')
    const item=await importOriginalSkillOnClient(db,owner,data.source)
    if(url)await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES($1::uuid,$1::uuid,'agent.skill_source','agent_skill',$2::text,'succeeded',$3::jsonb)",[owner,item.id,JSON.stringify({version:item.version,hash:item.hash,source_url:url})])
    result={item}
   }else if(path==='/approve'){roleObject(data,['id','version','hash','confirm_review']);result=await reviewOriginalSkillOnClient(db,owner,data)}
   else if(path==='/active'){roleObject(data,['id','active']);result=await activateOriginalSkillOnClient(db,owner,data.id as string,data.active as boolean)}
   else bad()
   await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES($1::uuid,$1::uuid,'agent.role_ui_request','role_ui_request',$2::text,'succeeded',$3::jsonb)",[owner,operation_id,JSON.stringify({operation_id,request_sha256,path,result})])
   return {employee_id:owner,operation_id,request_sha256,result}
  })
 }
 private async receiptOnClient(db:SqlClient,owner:string,id:string,hash:string){
  const rows=(await db.query<{metadata:{operation_id:string;request_sha256:string;path:string;result:unknown}}>("SELECT metadata FROM agentstudio.audit_events WHERE owner_user_id=$1::uuid AND actor_user_id=$1::uuid AND action='agent.role_ui_request' AND target_kind='role_ui_request' AND target_id=$2::text ORDER BY occurred_at,id LIMIT 2",[owner,id])).rows
  if(rows.length>1||rows.length===1&&(rows[0]!.metadata.operation_id!==id||rows[0]!.metadata.request_sha256!==hash))throw new HttpError(409,'original_role_request_conflict')
  return rows[0]?.metadata.result??null
 }
 receipt(identity:Identity,owner:string,id:string,hash:string){if(!uuid.test(id)||!sha.test(hash))bad();return this.actor(identity,owner,true,async db=>{const result=await this.receiptOnClient(db,owner,id,hash);return {employee_id:owner,operation_id:id,request_sha256:hash,confirmed:result!==null,result}})}
}
