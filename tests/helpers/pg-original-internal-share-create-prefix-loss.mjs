import assert from 'node:assert/strict'
import {parseAgentDesignTransportJson} from '../../services/pg-api/src/agent-design-value-contract.ts'
import {parseInternalShareIntent,parseInternalShareReply,matchInternalShareReceipt,internalShareCanonical,internalShareId} from '../../shared/agent-internal-share-contract.ts'
// Actual request/afterBusiness/upstream/ledger observations only. Never creates a
// reply or receipt, authorizes a caller or dispatches an original POST again.
export function createOriginalShareCreatePrefixLoss({afterBusinessBefore,readCommitted}){
 assert(Number.isSafeInteger(afterBusinessBefore)&&afterBusinessBefore>=0&&typeof readCommitted==='function')
 let intent=null,employee=null,committed=null,written=false,destroyed=false
 return{
  recorded:false,after_business_before:afterBusinessBefore,prefix_destroyed:false,
  bindOriginalRequest(bytes,expectedEmployee){
   assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=32768)
   const raw=parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
   if(raw?.action!=='create')return null
   const next=parseInternalShareIntent(raw),who=internalShareId(expectedEmployee)
   assert.equal(next.action,'create');assert.equal(intent,null,'one armed fault cannot bind another original request');intent=next;employee=who;return next
  },
  async afterBusiness({operation,input,identity,result}){
   if(operation!=='record'||input?.action!=='create'||!intent||input.request_id!==intent.request_id)return
   assert.equal(internalShareCanonical(parseInternalShareIntent(input)),internalShareCanonical(intent),'afterBusiness belongs to the captured original intent')
   assert.equal(committed,null,'duplicate afterBusiness for original request')
   const reply=parseInternalShareReply(result);assert.equal(reply.replayed,false);assert.equal(reply.receipt.action,'create');await matchInternalShareReceipt(reply.receipt,intent)
   assert(identity&&typeof identity.issuer==='string'&&typeof identity.subject==='string');committed={identity:structuredClone(identity),reply};this.recorded=true
  },
  async verifyResponse(actual,original,completedAfterBusinessCreates){
   assert(intent&&original&&committed&&this.recorded&&!written&&!destroyed)
   assert.equal(internalShareCanonical(original),internalShareCanonical(intent));assert.equal(completedAfterBusinessCreates,afterBusinessBefore+1)
   const reply=parseInternalShareReply(parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(actual)))
   assert.equal(reply.replayed,false);assert.equal(reply.receipt.action,'create');await matchInternalShareReceipt(reply.receipt,intent)
   assert.equal(internalShareCanonical(reply),internalShareCanonical(committed.reply),'same actual record result and Native HTTP response required')
   const read=await readCommitted({identity:committed.identity,intent,expectedEmployee:employee}),receipt=await matchInternalShareReceipt(parseInternalShareReply(read).receipt,intent)
   assert.equal(read.replayed,true);assert.equal(read.share_code,null);assert.equal(internalShareCanonical(receipt),internalShareCanonical(reply.receipt),'actual original owner ledger must match the complete200 ACK')
   return Object.freeze({actual_after_business_and_http_receipt_match:true,actual_owner_ledger_matches:true})
  },
  onWritten(){assert(committed&&this.recorded&&!written&&!destroyed);written=true},
  consumeDestroyed(socket){assert(written&&!destroyed&&socket.destroyed===true,'count only actual write callback followed by actual socket destruction');destroyed=true;this.prefix_destroyed=true;intent=null;employee=null;committed=null;return true},
 }
}
