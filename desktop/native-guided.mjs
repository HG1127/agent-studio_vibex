import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {localId,localObject,localDigest} from '../shared/native-local-device-contract.mjs'
import {guidedScope,guidedServer,guidedIntent,guidedReply,guidedPublicTicket,publicGuidedTicket} from '../shared/native-guided-contract.mjs'
import {privateDirectory,privateRead,privateSave} from '../local-executor/native-private.mjs'
/** Only this private service writes pairing codes. Public tickets carry a local
 * reference, never a code, token, owner credential or caller-selected path. */
export function createNativeGuidedStore({home=os.homedir(),serverOrigin,ownerCall,clock=Date.now,apiFactory}){
 const server=guidedServer(serverOrigin+'/__pg_native'),serverKey=createHash('sha256').update(server).digest('hex')
 const directory=owner=>privateDirectory(home,['.agent-studio','native-guided',serverKey,localId(owner)],{create:true})
 const filename=(dir,rid)=>path.join(dir,'credentials-native-guided-'+localId(rid)+'.json')
 const locks=new Set()
 function validate(raw,owner){const v=localObject(raw,['protocol','owner','server','handle','scope','intent','reply']);if(v.protocol!=='native_guided_private_v1'||v.owner!==owner||v.server!==server)throw Error('native_guided_source_mismatch');localId(v.handle);guidedScope(v.scope);guidedIntent(v.intent);if(v.scope.name!==v.intent.name)throw Error('native_guided_source_mismatch');return v}
 async function records(owner){const dir=await directory(owner),names=(await fs.readdir(dir)).filter(n=>/^credentials-native-guided-[a-f0-9-]{36}\.json$/.test(n)).sort();if(names.length>100)throw Error('native_guided_private_record_limit');const rows=[];for(const name of names){const v=validate(await privateRead(path.join(dir,name)),owner);if(filename(dir,v.intent.request_id)!==path.join(dir,name))throw Error('native_guided_source_mismatch');if(v.reply!==null)v.reply=await guidedReply(v.reply,v.intent);rows.push(v)}return {dir,rows}}
 async function confirmation(record,ctx){ctx.check();const r=await ownerCall('confirm',record.intent,ctx.owner);ctx.check();if(r.owner!==ctx.owner)throw Error('native_guided_owner_changed');record.reply=await guidedReply(r.value,record.intent);await privateSave(filename(await directory(ctx.owner),record.intent.request_id),record);ctx.check();return record}
 async function create(raw,ctx){const value=localObject(raw,['name','mode','origins'],['id']),scope=guidedScope({name:value.name,mode:value.mode,origins:value.origins}),id=value.id===undefined?null:localId(value.id);if(locks.has(ctx.owner))throw Error('native_guided_request_in_progress');locks.add(ctx.owner)
  try{ctx.check();const {dir,rows}=await records(ctx.owner);ctx.check();const pending=rows.filter(r=>r.reply===null);if(pending.length){if(pending.length!==1)throw Error('native_guided_ambiguous_pending_request');const r=pending[0];if(JSON.stringify(r.scope)!==JSON.stringify(scope)||(r.intent.id??null)!==id)throw Error('native_guided_original_request_requires_confirmation');return publicGuidedTicket(await confirmation(r,ctx))}
   const prior=rows.filter(r=>r.reply!==null&&(id?r.reply.receipt.id===id:JSON.stringify(r.scope)===JSON.stringify(scope))).sort((a,b)=>a.reply.receipt.expires_ms-b.reply.receipt.expires_ms).at(-1)
   if(prior&&clock()<prior.reply.receipt.expires_ms)return publicGuidedTicket(await confirmation(prior,ctx))
   const target=id??prior?.reply.receipt.id??null
   if(target){const profile=await privateDirectory(home,['.agent-studio','connections',target]).then(dir=>privateRead(path.join(dir,'.local-device-credentials.json'))).catch(e=>{if(e.code==='ENOENT')return null;throw e});if(profile)throw Error('native_guided_existing_pair_requires_read_only_confirmation')}
   const intent=guidedIntent({action:target?'renew':'create',request_id:randomUUID(),name:scope.name,pairing_code:randomBytes(24).toString('hex'),...(target?{id:target}:{})}),record={protocol:'native_guided_private_v1',owner:ctx.owner,server,handle:randomUUID(),scope,intent,reply:null}
   await privateSave(filename(dir,intent.request_id),record,{fresh:true});ctx.check()
   // Durable request+code precede the only owner mutation. ACK loss never removes
   // this record and later generate/create calls invoke confirmation only.
   const response=await ownerCall('record',intent,ctx.owner);ctx.check();if(response.owner!==ctx.owner)throw Error('native_guided_owner_changed');record.reply=await guidedReply(response.value,intent);await privateSave(filename(dir,intent.request_id),record);ctx.check();return publicGuidedTicket(record)
  }finally{locks.delete(ctx.owner)}
 }
 async function resolve(raw,ctx,{allowExpired=false}={}){const ticket=guidedPublicTicket(raw,clock(),{allowExpired});if(ticket.server!==server)throw Error('native_guided_source_mismatch');const {rows}=await records(ctx.owner);ctx.check();const matches=rows.filter(r=>r.handle===ticket.pairing.code);if(matches.length!==1)throw Error('native_guided_unverified_import');const record=await confirmation(matches[0],ctx);if(JSON.stringify(publicGuidedTicket(record))!==JSON.stringify(ticket))throw Error('native_guided_source_mismatch');return {...ticket,private:{owner:record.owner,owner_request_id:record.intent.request_id,pairing_code:record.intent.pairing_code,receipt_sha256:await localDigest(record.reply.receipt)}}}
 async function recover(id,ctx){const {rows}=await records(ctx.owner);ctx.check();const matches=rows.filter(r=>r.reply?.receipt.id===id);if(!matches.length)return false;const profile=await privateDirectory(home,['.agent-studio','connections',id]).then(dir=>privateRead(path.join(dir,'.local-device-credentials.json'))).catch(e=>{if(e.code==='ENOENT')return null;throw e});ctx.check();if(!profile||profile.stage!=='pair_pending')return false;const record=matches.find(r=>r.intent.request_id===profile.owner_request_id);if(!record)throw Error('native_guided_unverified_import');const ticket=await resolve(publicGuidedTicket(record),ctx,{allowExpired:true});const {confirmNativeGuidedPair}=await import('../local-executor/native-guided-setup.mjs');await confirmNativeGuidedPair(ticket,{home,clock,apiFactory,signal:ctx.signal});ctx.check();return true}
 return Object.freeze({create,resolve,recover})
}

