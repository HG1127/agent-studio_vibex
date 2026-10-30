import type {RunStateKey} from '@/pages/AgentRun/useAgentRun'
export type ArchiveStatus='all'|'active'|'attention'|'succeeded'|'failed'|'cancelled'
export type ArchiveDays='all'|'7'|'30'|'90'
export type ArchiveQuery={q:string;status:ArchiveStatus;days:ArchiveDays;page:number}
export type ArchiveRow={id:string;spec_id:string;spec_name:string;instruction:string;status:RunStateKey;current_step:number;max_steps:number;model:string;source:string;created:string}
export type ArchiveData={items:ArchiveRow[];page:number;perPage:number;totalItems:number|null;totalPages:number;legacy:boolean}
export const ARCHIVE_STATUSES:readonly {value:ArchiveStatus;label:string}[]=[{value:'all',label:'全部状态'},{value:'active',label:'执行中 / 已暂停'},{value:'attention',label:'待我处理'},{value:'succeeded',label:'已完成'},{value:'failed',label:'失败'},{value:'cancelled',label:'已取消'}]
export function archiveQuery(params:URLSearchParams):ArchiveQuery{
 const page=Number(params.get('page')||1)
 return {q:(params.get('q')||'').replace(/[\x00-\x1f]/g,'').slice(0,120),status:ARCHIVE_STATUSES.some(s=>s.value===params.get('status'))?params.get('status') as ArchiveStatus:'all',days:['7','30','90'].includes(params.get('days')||'')?params.get('days') as ArchiveDays:'all',page:Number.isSafeInteger(page)&&page>=1&&page<=10000?page:1}
}
export function archiveParams(current:URLSearchParams,patch:Partial<ArchiveQuery>):URLSearchParams{
 const next=new URLSearchParams(current),query={...archiveQuery(current),...patch}
 if(patch.q!==undefined||patch.status!==undefined||patch.days!==undefined)query.page=1
 next.delete('run');next.delete('view')
 for(const key of ['q','status','days','page'] as const){const value=String(query[key]);if(!value||value==='all'||key==='page'&&value==='1')next.delete(key);else next.set(key,value)}
 return next
}
export function archiveRequest(query:ArchiveQuery):string{
 const params=new URLSearchParams({archive:'1',limit:'20',page:String(query.page),status:query.status,days:query.days})
 if(query.q.trim())params.set('q',query.q.trim())
 return '/api/agent-runs/recent?'+params
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function parseArchive(value:unknown,query:ArchiveQuery,now=Date.now()):ArchiveData{
 if(!record(value)||!Array.isArray(value.items)||value.items.length>20)throw Error('运行记录格式异常，请重新加载')
 const ids=new Set<string>(),items=value.items.map(item=>{
  if(!record(item)||typeof item.id!=='string'||!/^[A-Za-z0-9]{15}$/.test(item.id)||ids.has(item.id)||
    ['spec_id','spec_name','instruction','status','model','source','created'].some(k=>typeof item[k]!=='string')||
    !Number.isFinite(item.current_step)||!Number.isFinite(item.max_steps))throw Error('运行记录不完整，请重新加载')
  ids.add(item.id);return item as ArchiveRow
 })
 if(value.archive_version===1){
  if(!Number.isSafeInteger(value.page)||Number(value.page)<1||value.perPage!==20||!Number.isSafeInteger(value.totalItems)||Number(value.totalItems)<0||
     value.totalPages!==Math.max(1,Math.ceil(Number(value.totalItems)/20))||Number(value.page)>Number(value.totalPages)||items.length>Number(value.totalItems))throw Error('运行记录分页信息异常，请重新加载')
  return {items,page:Number(value.page),perPage:20,totalItems:Number(value.totalItems),totalPages:Number(value.totalPages),legacy:false}
 }
 if(value.archive_version!==undefined)throw Error('运行记录接口版本尚不支持')
 // Older preview servers only expose a recent-20 snapshot. Never call it full history.
 const groups:Record<ArchiveStatus,readonly string[]>={all:[],active:['queued','running','paused'],attention:['awaiting_input','awaiting_approval'],succeeded:['succeeded'],failed:['failed'],cancelled:['cancelled']}
 const q=query.q.trim().toLocaleLowerCase()
 return {items:items.filter(row=>(!q||[row.id,row.spec_name,row.instruction].join(' ').toLocaleLowerCase().includes(q))&&
   (query.status==='all'||groups[query.status].includes(row.status))&&(query.days==='all'||Date.parse(row.created.replace(' ','T'))>=now-Number(query.days)*86400000)),
  page:1,perPage:20,totalItems:null,totalPages:1,legacy:true}
}
export async function fetchRunArchive({base,query,headers,signal,fetcher=fetch}:{base:string;query:ArchiveQuery;headers:Record<string,string>;signal?:AbortSignal;fetcher?:typeof fetch}):Promise<ArchiveData>{
 const res=await fetcher(base+archiveRequest(query),{headers,signal,method:'GET'})
 if(res.status===401||res.status===412)throw Error('登录已过期，请重新登录')
 if(!res.ok)throw Error('暂时无法读取运行记录，请重试；这不代表没有历史记录')
 const value:unknown=await res.json();signal?.throwIfAborted();return parseArchive(value,query)
}
