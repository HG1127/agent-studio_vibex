/** Account preconditions are never authentication credentials. No secret,
 * instruction, note, reason or snapshot is persisted in an uncertain intent. */
export const originalVersionReleaseProtocol='native_original_version_release_v1' as const
export const originalVersionReleaseBase='/api/v2/original-ui/agent-releases'
export class OriginalVersionReleaseError extends Error{
 readonly status:number;readonly code:string;readonly outcomeUnknown:boolean
 constructor(status:number,code:string,outcomeUnknown=false){super(code);this.name='OriginalVersionReleaseError';this.status=status;this.code=code;this.outcomeUnknown=outcomeUnknown}
}
export function releaseFail(status=503,code='invalid_original_release_response',unknown=false):never{throw new OriginalVersionReleaseError(status,code,unknown)}
export function releaseObject(raw:unknown,keys?:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return releaseFail()
 const out:Record<string,unknown>={};for(const key of Reflect.ownKeys(raw)){const d=Object.getOwnPropertyDescriptor(raw,key);if(typeof key!=='string'||!d?.enumerable||!Object.hasOwn(d,'value')||['__proto__','prototype','constructor'].includes(key))return releaseFail();out[key]=d.value}
 if(keys&&(Object.keys(out).length!==keys.length||keys.some(k=>!Object.hasOwn(out,k))))return releaseFail();return out
}
export function releaseId(raw:unknown):string{if(typeof raw!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw))return releaseFail(400,'invalid_original_release_id');return raw}
export function releaseHash(raw:unknown):string{if(typeof raw!=='string'||!/^[a-f0-9]{64}$/.test(raw))return releaseFail();return raw}
export function releaseRevision(raw:unknown):number{if(!Number.isSafeInteger(raw)||Number(raw)<1||Number(raw)>=Number.MAX_SAFE_INTEGER)return releaseFail();return Number(raw)}
export type OriginalReleaseAction='acceptance'|'snapshot'|'publish'|'restore'|'delete_draft'
export type OriginalReleaseIntent={format:typeof originalVersionReleaseProtocol;employee_id:string;spec_id:string;action:OriginalReleaseAction;request_id:string;request_sha256:string;created_at:number;
 expected_spec_revision:number|null;source_sha256:string|null;version_id:string|null;version_sha256:string|null;expected_version_revision:number|null;expected_release_revision:number|null;test_linked:boolean}
const intentKeys=['format','employee_id','spec_id','action','request_id','request_sha256','created_at','expected_spec_revision','source_sha256','version_id','version_sha256','expected_version_revision','expected_release_revision','test_linked'] as const
export function parseOriginalReleaseIntent(raw:unknown,employee:string,now=Date.now()):OriginalReleaseIntent{
 const v=releaseObject(raw,intentKeys);if(v.format!==originalVersionReleaseProtocol||releaseId(v.employee_id)!==releaseId(employee)||!['acceptance','snapshot','publish','restore','delete_draft'].includes(String(v.action))||!Number.isSafeInteger(v.created_at)||Number(v.created_at)<0||Number(v.created_at)>now+60000||typeof v.test_linked!=='boolean')return releaseFail(503,'invalid_original_release_pending')
 const action=v.action as OriginalReleaseAction,current=action!=='delete_draft',version=['publish','restore','delete_draft'].includes(action)
 for(const k of ['expected_spec_revision','source_sha256'] as const)if((v[k]!==null)!==current)return releaseFail()
 for(const k of ['version_id','version_sha256','expected_version_revision'] as const)if((v[k]!==null)!==version)return releaseFail()
 if((v.expected_release_revision!==null)!==(action==='publish')||action!=='snapshot'&&v.test_linked)return releaseFail()
 return Object.freeze({format:originalVersionReleaseProtocol,employee_id:employee,spec_id:releaseId(v.spec_id),action,request_id:releaseId(v.request_id),request_sha256:releaseHash(v.request_sha256),created_at:Number(v.created_at),
 expected_spec_revision:current?releaseRevision(v.expected_spec_revision):null,source_sha256:current?releaseHash(v.source_sha256):null,version_id:version?releaseId(v.version_id):null,version_sha256:version?releaseHash(v.version_sha256):null,expected_version_revision:version?releaseRevision(v.expected_version_revision):null,expected_release_revision:action==='publish'?releaseRevision(v.expected_release_revision):null,test_linked:v.test_linked})
}
export type OriginalReleaseRoute={spec:string;action:'workspace'|'version'|'acceptance_status'|'receipt'|'change'|'acceptance';selected:string|null}
export function parseOriginalReleaseRoute(raw:string,method:string):OriginalReleaseRoute{
 if(typeof raw!=='string'||raw.length>500||raw.includes('%')||raw.includes('?')||raw.includes('#')||raw.includes('//'))return releaseFail(400,'invalid_original_release_route')
 const match=new RegExp('^'+originalVersionReleaseBase+'/([a-f0-9-]{36})(?:/(change|acceptance|versions|receipts)(?:/([a-f0-9-]{36}))?)?$').exec(raw)
 if(!match)return releaseFail(400,'invalid_original_release_route');const spec=releaseId(match[1]),part=match[2],selected=match[3]?releaseId(match[3]):null
 if(method==='GET'&&!part)return{spec,action:'workspace',selected:null}
 if(method==='GET'&&selected&&part==='versions')return{spec,action:'version',selected}
 if(method==='GET'&&selected&&part==='acceptance')return{spec,action:'acceptance_status',selected}
 if(method==='GET'&&selected&&part==='receipts')return{spec,action:'receipt',selected}
 if(method==='POST'&&!selected&&(part==='change'||part==='acceptance'))return{spec,action:part,selected:null}
 return releaseFail(405,'original_release_method_refused')
}
