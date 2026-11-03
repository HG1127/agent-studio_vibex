import type {ToolHubInvocation} from './tool-hub-public-types.ts'
export type OriginalToolHubActivityQuery={tool:string;q:string;status:''|'success'|'failed'|'started'|'unknown';source:''|'debug'|'agent_run'|'workflow';run_id:string;page:number}
export type OriginalToolHubActivityPage={protocol:'native_original_toolhub_activity_v1';query:OriginalToolHubActivityQuery;items:ToolHubInvocation[];total:number;page:number;pages:number;page_size:20;scope:'owner_only';sample_limit:500;scanned:number;sampled:boolean;retry_count:null;worker_liveness:'not_inferred';automatic_replay_allowed:false}
const keys=['tool','q','status','source','run_id','page'],uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export function parseOriginalToolHubActivityQuery(raw:unknown):OriginalToolHubActivityQuery{
 const bad=():never=>{throw Error('invalid_original_toolhub_activity_query')}
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Reflect.ownKeys(raw).length!==keys.length||keys.some(key=>!Object.hasOwn(raw,key)))bad()
 const q=raw as Record<string,unknown>
 for(const [key,max]of [['tool',120],['q',100],['status',20],['source',20],['run_id',36]] as const)if(typeof q[key]!=='string'||(q[key] as string).length>max||/[\u0000-\u001f\u007f]/.test(q[key] as string))bad()
 if(!['','success','failed','started','unknown'].includes(q.status as string)||!['','debug','agent_run','workflow'].includes(q.source as string)||q.run_id!==''&&!uuid.test(q.run_id as string)||!Number.isSafeInteger(q.page)||Number(q.page)<1||Number(q.page)>25)bad()
 return{tool:q.tool as string,q:(q.q as string).trim(),status:q.status as OriginalToolHubActivityQuery['status'],source:q.source as OriginalToolHubActivityQuery['source'],run_id:q.run_id as string,page:q.page as number}
}
/** Pure projection of the original repository's already-authorized500-row
 * snapshot. This function grants no identity/owner access and executes no SQL. */
export function projectOriginalToolHubActivity(items:readonly ToolHubInvocation[],sampled:boolean,raw:unknown):OriginalToolHubActivityPage{
 const selected=parseOriginalToolHubActivityQuery(raw)
 if(!Array.isArray(items)||items.length>500||typeof sampled!=='boolean'||sampled&&items.length!==500)throw Error('original_toolhub_activity_unavailable')
 const filtered=items.filter(item=>(!selected.tool||item.tool===selected.tool)&&(!selected.q||item.tool.toLowerCase().includes(selected.q.toLowerCase()))&&(!selected.status||item.status===(selected.status==='success'?'succeeded':selected.status))&&(!selected.source||(item.origin==='trial'?'debug':item.origin==='agent'?'agent_run':'workflow')===selected.source)&&(!selected.run_id||item.run_id===selected.run_id)),total=filtered.length,pages=Math.max(1,Math.ceil(total/20)),page=Math.min(selected.page,pages)
 return{protocol:'native_original_toolhub_activity_v1',query:{...selected,page},items:filtered.slice((page-1)*20,page*20),total,page,pages,page_size:20,scope:'owner_only',sample_limit:500,scanned:items.length,sampled,retry_count:null,worker_liveness:'not_inferred',automatic_replay_allowed:false}
}
