import type {IncomingMessage,ServerResponse} from 'node:http'
import {HttpError,type Identity} from './contracts.ts'
import {verifyNativeOrigin} from './native-auth-http.mjs'
import {optionalExpectedOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {parseAgentDesignTransportJson} from './agent-design-value-contract.ts'
import {ModelConfigReceiptError,receiptId} from '../../../shared/model-config-receipt-contract.ts'
import type {PreparedModelConfigReceipts075} from './model-config-receipt-runtime.ts'
const collection='/api/v2/model-config-operations'
function reply(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value))}
function clearRaw(raw:unknown){if(raw&&typeof raw==='object'){const value=raw as {input?:{api_key?:unknown};key_binding?:{blind?:unknown}};if(value.input&&typeof value.input==='object'&&Object.hasOwn(value.input,'api_key'))value.input.api_key='';if(value.key_binding&&typeof value.key_binding==='object'&&Object.hasOwn(value.key_binding,'blind'))value.key_binding.blind=''}}
async function body(req:IncomingMessage):Promise<unknown>{const type=req.headers['content-type'],length=req.headers['content-length'],transfer=req.headers['transfer-encoding'];if(typeof type!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type)||req.headers['content-encoding']!==undefined)throw new HttpError(415,'json_content_type_required');if(length!==undefined&&(typeof length!=='string'||!/^(0|[1-9][0-9]*)$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>262144))throw new HttpError(413,'request_too_large');if(transfer!==undefined&&(transfer!=='chunked'||length!==undefined))throw new HttpError(400,'invalid_model_config_request');const chunks:Buffer[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined;const read=async()=>{for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>262144)throw new HttpError(413,'request_too_large');chunks.push(bytes)}if(length!==undefined&&Number(length)!==size)throw new HttpError(400,'invalid_model_config_request');const combined=Buffer.concat(chunks);try{return parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(combined))}catch{throw new HttpError(400,'invalid_model_config_request')}finally{combined.fill(0)}};try{return await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new HttpError(408,'model_config_request_timeout'));req.destroy()},8000)})])}finally{clearTimeout(timer);for(const chunk of chunks)chunk.fill(0);chunks.length=0}}
export function createModelConfigReceiptHttp(options:{component:PreparedModelConfigReceipts075;allowedOrigin:string;authenticateRequest:(req:IncomingMessage)=>Promise<Identity>}){
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const rawRoute=typeof req.url==='string'?req.url:'',rawPath=rawRoute.split(/[?#]/,1)[0]??''
  let url:URL|undefined,decodedPath='',decodedRawPath=''
  try{url=new URL(rawRoute,'http://127.0.0.1');decodedPath=decodeURIComponent(url.pathname)}catch{}
  try{decodedRawPath=decodeURIComponent(rawPath)}catch{}
  const scoped=(value:string)=>value===collection||value.startsWith(collection+'/')
  // Claim recognizable aliases only to refuse them; never normalize a target
  // into an authorized075 route or pass one to another business handler.
  if(![rawPath,url?.pathname??'',decodedPath,decodedRawPath].some(value=>scoped(value)||scoped(value.replace(/\\/g,'/').replace(/\/+/g,'/'))))return false
  let raw:unknown
  try{
   if(!url||rawRoute!==url.pathname||url.search||url.hash||rawRoute.includes('#')||url.pathname.includes('%')||url.pathname.includes('//'))throw new HttpError(400,'model_config_receipt_route_refused')
   const method=req.method??'',id=url.pathname.slice(collection.length+1);if(!(method==='POST'&&url.pathname===collection||method==='GET'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)))throw new HttpError(405,'model_config_receipt_route_refused')
   if(['authorization','x-rh-user-id','x-forwarded-user','x-agentstudio-identity'].some(key=>req.headers[key]!==undefined))throw new HttpError(400,'model_config_identity_header_refused')
   verifyNativeOrigin(req,options.allowedOrigin,method==='POST');const identity=await options.authenticateRequest(req),expected=optionalExpectedOriginalUiEmployee(req);if(expected===undefined)throw new HttpError(400,'invalid_original_ui_employee_precondition')
   if(method==='GET'){receiptId(id);if(req.headers['transfer-encoding']!==undefined||req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')throw new HttpError(400,'model_config_receipt_get_body_refused');for await(const chunk of req)if(Buffer.byteLength(chunk)>0)throw new HttpError(400,'model_config_receipt_get_body_refused');reply(res,200,{receipt:await options.component.get(identity,id,expected),mode:'read_only_exact_model_config_receipt'});return true}
   if(!options.component.writes)throw new HttpError(405,'model_config_receipt_writes_disabled');raw=await body(req);reply(res,200,await options.component.submit(identity,raw,expected))
  }catch(error){const safe=error instanceof HttpError||error instanceof ModelConfigReceiptError;reply(res,safe?error.status:503,{error:safe?error.code:'model_config_receipt_unavailable'})}finally{clearRaw(raw)}return true
 }
}
