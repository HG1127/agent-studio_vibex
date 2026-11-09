export const modelDraftProbeProtocol='native_model_draft_discovery_v1' as const
export const modelDraftProbeMode='read_only_provider_model_discovery' as const
export const modelDraftProbeErrors=['provider_endpoint_not_allowlisted','provider_dns_unsafe','provider_dns_unavailable','provider_response_too_large','provider_response_invalid','provider_credential_rejected','provider_rate_limited','provider_response_rejected','provider_probe_timeout','provider_transport_failed','provider_models_incomplete'] as const
export type DraftProvider='openai'|'anthropic'|'gemini'
export type ModelDraftProbeInput={protocol:typeof modelDraftProbeProtocol;request_id:string;provider:DraftProvider;base_url:string;credential:{kind:'draft';api_key:string}|{kind:'saved';connection_id:string;expected_revision:number}}
export type ModelDraftProbeResult={protocol:typeof modelDraftProbeProtocol;request_id:string;mode:typeof modelDraftProbeMode;owner_user_id:string;credential_source:'draft'|'saved';connection_id:string|null;connection_revision:number|null;ok:boolean;latency_ms:number;models:string[];complete:boolean;error_code:string}
export class ModelDraftProbeError extends Error{readonly status:number;readonly code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code}}
const invalid=():never=>{throw new ModelDraftProbeError(400,'invalid_model_draft_probe')}
export function draftProbeObject(raw:unknown,keys?:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
 const out:Record<string,unknown>={};for(const key of Reflect.ownKeys(raw)){const d=Object.getOwnPropertyDescriptor(raw,key);if(typeof key!=='string'||!d?.enumerable||!Object.hasOwn(d,'value')||['__proto__','constructor','prototype'].includes(key))return invalid();out[key]=d.value}
 if(keys&&(Object.keys(out).length!==keys.length||keys.some(k=>!Object.hasOwn(out,k))))return invalid();return out
}
export function draftProbeId(raw:unknown):string{if(typeof raw!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw))return invalid();return raw}
export function draftProbeRevision(raw:unknown):number{if(!Number.isSafeInteger(raw)||Number(raw)<1||Number(raw)>=Number.MAX_SAFE_INTEGER)return invalid();return Number(raw)}
export function draftProbeModels(raw:unknown):string[]{if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>300||Reflect.ownKeys(raw).length!==raw.length+1)return invalid();const seen=new Set<string>(),out:string[]=[];for(let i=0;i<raw.length;i++){const d=Object.getOwnPropertyDescriptor(raw,String(i)),v=d?.value;if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof v!=='string'||!/^[A-Za-z0-9._:/-]{1,200}$/.test(v)||seen.has(v))return invalid();seen.add(v);out.push(v)}return out}
export function parseModelDraftProbeInput(raw:unknown):ModelDraftProbeInput{
 const v=draftProbeObject(raw,['protocol','request_id','provider','base_url','credential']),c=draftProbeObject(v.credential)
 if(v.protocol!==modelDraftProbeProtocol||typeof v.provider!=='string'||!['openai','anthropic','gemini'].includes(v.provider)||typeof v.base_url!=='string'||v.base_url.length>2048||/[\u0000-\u0020\u007f]/.test(v.base_url))return invalid()
 let credential:ModelDraftProbeInput['credential'];if(c.kind==='draft'){draftProbeObject(c,['kind','api_key']);if(typeof c.api_key!=='string'||c.api_key.length<8||c.api_key.length>4096||/[\u0000-\u0020\u007f]/.test(c.api_key))return invalid();credential={kind:'draft',api_key:c.api_key}}else if(c.kind==='saved'){draftProbeObject(c,['kind','connection_id','expected_revision']);credential={kind:'saved',connection_id:draftProbeId(c.connection_id),expected_revision:draftProbeRevision(c.expected_revision)}}else return invalid()
 return{protocol:modelDraftProbeProtocol,request_id:draftProbeId(v.request_id),provider:v.provider as DraftProvider,base_url:v.base_url,credential}
}
export function parseModelDraftProbeResult(raw:unknown,request:ModelDraftProbeInput,owner:string):ModelDraftProbeResult{
 const v=draftProbeObject(raw,['protocol','request_id','mode','owner_user_id','credential_source','connection_id','connection_revision','ok','latency_ms','models','complete','error_code']),saved=request.credential.kind==='saved'?request.credential:null
 if(v.protocol!==modelDraftProbeProtocol||v.mode!==modelDraftProbeMode||v.request_id!==request.request_id||draftProbeId(v.owner_user_id)!==draftProbeId(owner)||v.credential_source!==request.credential.kind||v.connection_id!==(saved?.connection_id??null)||v.connection_revision!==(saved?.expected_revision??null)||typeof v.ok!=='boolean'||typeof v.complete!=='boolean'||!Number.isSafeInteger(v.latency_ms)||Number(v.latency_ms)<0||Number(v.latency_ms)>6000||typeof v.error_code!=='string')return invalid()
 const models=draftProbeModels(v.models);if(v.ok?(v.complete!==true||v.error_code!==''):(v.complete!==false||models.length!==0||!(modelDraftProbeErrors as readonly string[]).includes(v.error_code)))return invalid()
 const secret=request.credential.kind==='draft'?request.credential.api_key:null;if(secret&&models.some(id=>id.includes(secret)))return invalid()
 return{protocol:modelDraftProbeProtocol,request_id:request.request_id,mode:modelDraftProbeMode,owner_user_id:owner,credential_source:request.credential.kind,connection_id:saved?.connection_id??null,connection_revision:saved?.expected_revision??null,ok:v.ok,latency_ms:Number(v.latency_ms),models,complete:v.complete,error_code:v.error_code}
}
