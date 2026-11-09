// Browser/Node data-only F08 contract. Uses the already reviewed063 safe text
// snapshot, canonical bytes and limits; no DB, identity or permission factory.
import {agentTemplateMarketObject as O,agentTemplateMarketArray as A,agentTemplateMarketText as T,agentTemplateMarketInteger as N,agentTemplateMarketId as ID,agentTemplateMarketSha as SHA,agentTemplateMarketBoolean as B,agentTemplateMarketCanonicalJson as canonical,agentTemplateMarketDigest as digest,parseAgentTemplateMarketSnapshot,parseAgentTemplateMarketSourcePin} from '../services/pg-api/src/agent-template-market-contract.ts'
export {canonical as internalShareCanonical,digest as internalShareDigest}
export const internalSharePurpose='internal_agent_template_share' as const
export const internalShareReviewAcknowledgement='SHARE_REVIEWED_AGENT_TEMPLATE_ONCE' as const
export const internalShareRoute='/api/v2/internal-templates' as const
export class InternalShareValueError extends Error{readonly status=400;readonly code='invalid_internal_share_value';constructor(){super('invalid_internal_share_value');this.name='InternalShareValueError'}}
const bad=():never=>{throw new InternalShareValueError()}
export function freezeInternalShare<T>(v:T):T{if(v&&typeof v==='object'){for(const x of Object.values(v))freezeInternalShare(x);Object.freeze(v)}return v}
function parse<T>(fn:()=>T):T{try{return freezeInternalShare(fn())}catch{return bad()}}
export const internalShareId=(raw:unknown)=>parse(()=>ID(raw))
export function internalShareCode(raw:unknown){return parse(()=>{if(typeof raw!=='string')return bad();const code=raw.trim();if(!/^[A-Za-z0-9]{48}$/.test(code))return bad();return code})}
export function parseInternalShareIntent(raw:unknown){return parse(()=>{
 const descriptor=raw&&typeof raw==='object'?Object.getOwnPropertyDescriptor(raw,'action'):undefined,action=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined
 if(action==='create'){const v=O(raw,['action','request_id','source','preview_hash','confirm_safe','acknowledgement']);if(v.confirm_safe!==true||v.acknowledgement!==internalShareReviewAcknowledgement)return bad();return{action:'create' as const,request_id:ID(v.request_id),source:parseAgentTemplateMarketSourcePin(v.source),preview_hash:SHA(v.preview_hash),confirm_safe:true as const,acknowledgement:internalShareReviewAcknowledgement}}
 if(action==='redeem'){const v=O(raw,['action','request_id','share_code','confirm']);if(v.confirm!==true)return bad();return{action:'redeem' as const,request_id:ID(v.request_id),share_code:internalShareCode(v.share_code),confirm:true as const}}
 if(action==='revoke'){const v=O(raw,['action','request_id','id','confirm']);if(v.confirm!==true)return bad();return{action:'revoke' as const,request_id:ID(v.request_id),id:ID(v.id),confirm:true as const}}
 return bad()
})}
export type InternalShareIntent=ReturnType<typeof parseInternalShareIntent>
export function internalShareIntentValue(raw:unknown){return freezeInternalShare({protocol:'agent_internal_share_intent_v1' as const,purpose:internalSharePurpose,intent:parseInternalShareIntent(raw)})}
export function internalShareReviewValue(raw:unknown){const v=parseInternalSharePreviewShape(raw);return freezeInternalShare({protocol:'agent_internal_share_review_v1' as const,source:v.source,name:v.name,snapshot:v.snapshot,snapshot_sha256:v.snapshot_sha256,owner_epoch:v.owner_epoch})}
function removed(raw:unknown){const v=O(raw,['model_binding','http_tools','mcp_tools','knowledge_bases','knowledge_retrieval','quality_checks','unknown_tools','unknown_fields']);return{model_binding:B(v.model_binding),http_tools:N(v.http_tools),mcp_tools:N(v.mcp_tools),knowledge_bases:N(v.knowledge_bases),knowledge_retrieval:B(v.knowledge_retrieval),quality_checks:N(v.quality_checks),unknown_tools:N(v.unknown_tools),unknown_fields:N(v.unknown_fields)}}
function parseInternalSharePreviewShape(raw:unknown){return parse(()=>{
 const v=O(raw,['protocol','purpose','source','name','snapshot','snapshot_sha256','owner_epoch','preview_hash','removed','review_required','one_time','expires_in_seconds','authority'])
 if(v.protocol!=='agent_internal_share_preview_v1'||v.purpose!==internalSharePurpose||v.review_required!==true||v.one_time!==true||v.expires_in_seconds!==604800||v.authority!==false)return bad()
 const owner_epoch=N(v.owner_epoch,1);if(owner_epoch>9007199254740989)return bad()
 return{protocol:'agent_internal_share_preview_v1' as const,purpose:internalSharePurpose,source:parseAgentTemplateMarketSourcePin(v.source),name:T(v.name,120,true),snapshot:parseAgentTemplateMarketSnapshot(v.snapshot),snapshot_sha256:SHA(v.snapshot_sha256),owner_epoch,preview_hash:SHA(v.preview_hash),removed:removed(v.removed),review_required:true as const,one_time:true as const,expires_in_seconds:604800 as const,authority:false as const}
})}
export async function parseInternalSharePreview(raw:unknown){const v=parseInternalSharePreviewShape(raw);if(await digest(v.snapshot)!==v.snapshot_sha256||await digest(internalShareReviewValue(v))!==v.preview_hash)return bad();return v}
export type InternalSharePreview=ReturnType<typeof parseInternalSharePreviewShape>
export function parseInternalShareList(raw:unknown){return parse(()=>{
 const v=O(raw,['protocol','ok','scope','specs','invites']);if(v.protocol!=='agent_internal_share_list_v1'||v.ok!==true||v.scope!=='current_user')return bad()
 const specs=A(v.specs,100).map(raw=>{const x=O(raw,['id','name']);return{id:ID(x.id),name:T(x.name,120,true)}}),invites=A(v.invites,50).map(raw=>{
  const x=O(raw,['id','name','spec_id','created_ms','expires_ms','used_ms','revoked','status']),created_ms=N(x.created_ms,1),expires_ms=N(x.expires_ms,1),used_ms=N(x.used_ms),revoked=B(x.revoked)
  if(expires_ms-created_ms!==604800000||typeof x.status!=='string'||!['active','used','revoked','expired','inactive'].includes(x.status)||revoked!==(x.status==='revoked')||!revoked&&(used_ms>0)!==(x.status==='used'))return bad()
  return{id:ID(x.id),name:T(x.name,120,true),spec_id:ID(x.spec_id),created_ms,expires_ms,used_ms,revoked,status:x.status as 'active'|'used'|'revoked'|'expired'|'inactive'}
 });if(new Set(specs.map(x=>x.id)).size!==specs.length||new Set(invites.map(x=>x.id)).size!==invites.length)return bad()
 return{protocol:'agent_internal_share_list_v1' as const,ok:true as const,scope:'current_user' as const,specs,invites}
})}
export type InternalShareList=ReturnType<typeof parseInternalShareList>
export function parseInternalShareReceipt(raw:unknown){return parse(()=>{
 const v=O(raw,['protocol','action','request_id','request_sha256','id'],['name','spec_id','created_ms','expires_ms','one_time','spec_revision','used_ms','resource_selection_required','starts_run','revoked','revoked_ms']);if(v.protocol!=='agent_internal_share_receipt_v1')return bad()
 const common={protocol:'agent_internal_share_receipt_v1' as const,request_id:ID(v.request_id),request_sha256:SHA(v.request_sha256),id:ID(v.id)}
 if(v.action==='create'){O(raw,['protocol','action','request_id','request_sha256','id','name','spec_id','created_ms','expires_ms','one_time']);const created_ms=N(v.created_ms,1),expires_ms=N(v.expires_ms,1);if(v.one_time!==true||expires_ms-created_ms!==604800000)return bad();return{...common,action:'create' as const,name:T(v.name,120,true),spec_id:ID(v.spec_id),created_ms,expires_ms,one_time:true as const}}
 if(v.action==='redeem'){O(raw,['protocol','action','request_id','request_sha256','id','spec_id','spec_revision','name','used_ms','resource_selection_required','starts_run']);if(v.spec_revision!==1||v.resource_selection_required!==true||v.starts_run!==false)return bad();return{...common,action:'redeem' as const,spec_id:ID(v.spec_id),spec_revision:1 as const,name:T(v.name,120,true),used_ms:N(v.used_ms,1),resource_selection_required:true as const,starts_run:false as const}}
 if(v.action==='revoke'){O(raw,['protocol','action','request_id','request_sha256','id','revoked','revoked_ms']);if(v.revoked!==true)return bad();return{...common,action:'revoke' as const,revoked:true as const,revoked_ms:N(v.revoked_ms,1)}}
 return bad()
})}
export type InternalShareReceipt=ReturnType<typeof parseInternalShareReceipt>
export async function matchInternalShareReceipt(raw:unknown,intent:InternalShareIntent){const r=parseInternalShareReceipt(raw);if(r.action!==intent.action||r.request_id!==intent.request_id||r.request_sha256!==await digest(internalShareIntentValue(intent))||r.action==='create'&&intent.action==='create'&&r.spec_id!==intent.source.spec_id||r.action==='revoke'&&intent.action==='revoke'&&r.id!==intent.id)return bad();return r}
export function parseInternalShareReply(raw:unknown){return parse(()=>{const v=O(raw,['protocol','receipt','share_code','replayed']),receipt=parseInternalShareReceipt(v.receipt),replayed=B(v.replayed);if(v.protocol!=='agent_internal_share_reply_v1')return bad();const share_code=v.share_code===null?null:internalShareCode(v.share_code);if((share_code!==null)!==(receipt.action==='create'&&!replayed))return bad();return{protocol:'agent_internal_share_reply_v1' as const,receipt,share_code,replayed}})}
export function parseInternalShareRecovery(raw:unknown){return parse(()=>{const v=O(raw,['status'],['request_id','receipt']);if(v.status==='not_recorded'){O(raw,['status','request_id']);return{status:'not_recorded' as const,request_id:ID(v.request_id)}}if(v.status==='recorded'){O(raw,['status','receipt']);return{status:'recorded' as const,receipt:parseInternalShareReceipt(v.receipt)}}return bad()})}
