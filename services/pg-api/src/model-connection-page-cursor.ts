import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto'
import {HttpError} from './contracts.ts'
import {modelPageObject,modelPageCursor,modelPageId,modelPageTotal} from '../../../shared/model-connection-pagination-contract.ts'
export type ModelPagePosition={owner:string;snapshot:string;fingerprint:string;total:number;offset:number;limit:number;expires_at:number;after_updated_at:string;after_id:string}
 const fail=():never=>{throw new HttpError(400,'invalid_model_connection_cursor')}
function position(raw:unknown):ModelPagePosition{
 try{const v=modelPageObject(raw,['owner','snapshot','fingerprint','total','offset','limit','expires_at','after_updated_at','after_id']);if(typeof v.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(v.fingerprint)||!Number.isSafeInteger(v.limit)||Number(v.limit)<1||Number(v.limit)>50||!Number.isSafeInteger(v.expires_at)||Number(v.expires_at)<1||typeof v.after_updated_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v.after_updated_at)||!Number.isFinite(Date.parse(v.after_updated_at)))return fail();const total=modelPageTotal(v.total),offset=modelPageTotal(v.offset);if(offset<1||offset>=total)return fail();return{owner:modelPageId(v.owner),snapshot:modelPageId(v.snapshot),fingerprint:v.fingerprint,total,offset,limit:Number(v.limit),expires_at:Number(v.expires_at),after_updated_at:v.after_updated_at,after_id:modelPageId(v.after_id)}}catch{return fail()}
}
export function createModelConnectionPageCursor(secret:Buffer){
 if(!Buffer.isBuffer(secret)||secret.length!==32)throw Error('invalid_model_page_cursor_key')
 // Separate key/purpose from encryption of model credentials; no shared nonce.
 const key=createHmac('sha256',secret).update('agent-studio:model-connections:owner-pagination:v1').digest(),aad=Buffer.from('native_model_connections_paging_v1')
 return{
  seal(raw:ModelPagePosition):string{const value=position(raw),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);return'mcpg1.'+Buffer.concat([iv,cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64url')},
  open(raw:string,owner:string,limit:number,now=Date.now()):ModelPagePosition{
   let value:ModelPagePosition;try{modelPageCursor(raw);const encoded=raw.slice(6),bytes=Buffer.from(encoded,'base64url');if(bytes.toString('base64url')!==encoded||bytes.length<29||bytes.length>1500)return fail();const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(aad);decipher.setAuthTag(bytes.subarray(-16));const text=Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]);value=position(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(text)))}catch{return fail()}
   if(value.owner!==owner)throw new HttpError(409,'employee_session_changed');if(value.limit!==limit)return fail();if(value.expires_at<=now||value.expires_at>now+300000)throw new HttpError(410,'model_connection_cursor_expired');return value
  },
 }
}
