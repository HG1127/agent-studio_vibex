import {parseOriginalToolHubActivityQuery,type OriginalToolHubActivityQuery,type OriginalToolHubActivityPage} from '../../shared/original-toolhub-activity.ts'
import {toolHubInvocations} from './pgNativeToolHub.ts'
export function parseOriginalToolHubActivityPage(raw:unknown,requested:OriginalToolHubActivityQuery):OriginalToolHubActivityPage{
 const invalid=():never=>{throw Error('original_toolhub_activity_response_unavailable')},keys=['protocol','query','items','total','page','pages','page_size','scope','sample_limit','scanned','sampled','retry_count','worker_liveness','automatic_replay_allowed']
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Reflect.ownKeys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)))invalid()
 const r=raw as Record<string,unknown>,query=parseOriginalToolHubActivityQuery(r.query),expected=parseOriginalToolHubActivityQuery(requested)
 if(r.protocol!=='native_original_toolhub_activity_v1'||r.scope!=='owner_only'||r.sample_limit!==500||r.page_size!==20||r.retry_count!==null||r.worker_liveness!=='not_inferred'||r.automatic_replay_allowed!==false||typeof r.sampled!=='boolean'||!Number.isSafeInteger(r.scanned)||Number(r.scanned)<0||Number(r.scanned)>500||!Number.isSafeInteger(r.total)||Number(r.total)<0||Number(r.total)>Number(r.scanned)||!Number.isSafeInteger(r.pages)||r.pages!==Math.max(1,Math.ceil(Number(r.total)/20))||r.page!==query.page||query.page>Number(r.pages)||query.page>expected.page||query.page<expected.page&&query.page!==r.pages)invalid()
 if(r.sampled===true&&r.scanned!==500)invalid()
 for(const key of ['tool','q','status','source','run_id'] as const)if(query[key]!==expected[key])invalid()
 const projected=toolHubInvocations({items:r.items,next_after:null,scope:r.scope,scan_limit:500,scanned:r.scanned,sampled:r.sampled,worker_liveness:r.worker_liveness,automatic_replay_allowed:r.automatic_replay_allowed})
 if(projected.items.length!==Math.min(20,Math.max(0,Number(r.total)-(query.page-1)*20))||new Set(projected.items.map(item=>item.run_id+':'+item.step_key)).size!==projected.items.length)invalid()
 for(const item of projected.items)if(query.tool&&item.tool!==query.tool||query.q&&!item.tool.toLowerCase().includes(query.q.toLowerCase())||query.status&&item.status!==(query.status==='success'?'succeeded':query.status)||query.source&&(item.origin==='trial'?'debug':item.origin==='agent'?'agent_run':'workflow')!==query.source||query.run_id&&item.run_id!==query.run_id)invalid()
 return{...r,query,items:projected.items} as OriginalToolHubActivityPage
}
export function originalToolHubActivityPath(raw:unknown):string{
 const q=parseOriginalToolHubActivityQuery(raw),params=new URLSearchParams({view:'original_page_v1',page:String(q.page)})
 for(const key of ['tool','q','status','source','run_id'] as const)if(q[key])params.set(key,q[key])
 return '/__pg_native/api/v2/tool-hub/invocations?'+params.toString()
}
export function createOriginalToolHubActivityApi(input:{employeeId:string;transport:typeof fetch}){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.employeeId))throw Error('invalid_original_toolhub_employee')
 return{async list(raw:OriginalToolHubActivityQuery):Promise<OriginalToolHubActivityPage>{const query=parseOriginalToolHubActivityQuery(raw),response=await input.transport(originalToolHubActivityPath(query),{method:'GET',credentials:'same-origin',redirect:'error',headers:{Accept:'application/json','X-AgentStudio-Expected-Employee':input.employeeId}});if(!response.ok)throw Object.assign(Error('original_toolhub_activity_read_unavailable'),{status:response.status});return parseOriginalToolHubActivityPage(await response.json(),query)}}
}
