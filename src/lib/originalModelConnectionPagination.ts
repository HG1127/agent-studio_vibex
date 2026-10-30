import {modelConnectionPaginationProtocol,modelConnectionPaginationMode,parseModelConnectionPage,modelPageObject,modelPageId,ModelConnectionPaginationError,invalidModelPage} from '../../shared/model-connection-pagination-contract.ts'
export type OriginalModelConnectionSnapshot<T>={items:T[];complete:boolean}
/** Publish only a fully validated walk. Old bounded reads stay explicitly partial. */
export async function readOriginalModelConnectionSnapshot<T extends {id:string}>(options:{employee:string;read:(route:string,signal:AbortSignal,expectedEmployee:boolean)=>Promise<unknown>;parseRow:(raw:unknown)=>T;budgetMs?:number},signal?:AbortSignal):Promise<OriginalModelConnectionSnapshot<T>>{
 const employee=modelPageId(options.employee),budget=options.budgetMs??30000;if(!Number.isSafeInteger(budget)||budget<1||budget>30000)throw new ModelConnectionPaginationError(400,'invalid_model_page_budget')
 const abort=new AbortController(),cancel=()=>abort.abort();let timer:ReturnType<typeof setTimeout>|undefined;signal?.addEventListener('abort',cancel,{once:true})
 const check=()=>{if(abort.signal.aborted||signal?.aborted)throw new ModelConnectionPaginationError(0,'model_connection_list_cancelled')}
 const work=async()=>{
  check();const cap=await options.read('/api/native-auth/capabilities',abort.signal,false);if(!cap||typeof cap!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(cap)))return invalidModelPage();const mode=Object.getOwnPropertyDescriptor(cap,'mode');if(!mode?.enumerable||!Object.hasOwn(mode,'value')||mode.value!=='native_pg18')return invalidModelPage()
  const descriptor=Object.getOwnPropertyDescriptor(cap,'original_model_pagination_protocol');if(descriptor&&(!Object.hasOwn(descriptor,'value')||!descriptor.enumerable))return invalidModelPage()
  if(descriptor?.value!==modelConnectionPaginationProtocol){
   // No new-contract claim from owner_cas_v1, draft-probe or config-write flags.
   check();const value=modelPageObject(await options.read('/api/v2/model-connections?limit=50',abort.signal,false),['items']);if(!Array.isArray(value.items)||Object.getPrototypeOf(value.items)!==Array.prototype||value.items.length>50||Reflect.ownKeys(value.items).length!==value.items.length+1)return invalidModelPage();const rows:unknown[]=[];for(let i=0;i<value.items.length;i++){const d=Object.getOwnPropertyDescriptor(value.items,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))return invalidModelPage();rows.push(d.value)}const items=rows.map(options.parseRow);if(new Set(items.map(v=>v.id)).size!==items.length)return invalidModelPage();check();return{items,complete:false}
  }
  const items:T[]=[],ids=new Set<string>(),cursors=new Set<string>();let cursor:string|null=null,snapshot:string|undefined,total:number|undefined,collectedBytes=0
  while(true){
   check();const query=new URLSearchParams({paging:modelConnectionPaginationMode,limit:'50'});if(cursor)query.set('cursor',cursor)
   const page=parseModelConnectionPage(await options.read('/api/v2/model-connections?'+query.toString(),abort.signal,true),employee,50,options.parseRow);check()
   if(snapshot!==undefined&&(snapshot!==page.snapshot_id||total!==page.total))throw new ModelConnectionPaginationError(409,'model_connection_snapshot_changed');snapshot=page.snapshot_id;total=page.total
   collectedBytes+=new TextEncoder().encode(JSON.stringify(page.items)).byteLength;if(collectedBytes>32*1024*1024)throw new ModelConnectionPaginationError(413,'model_connection_list_too_large')
   for(const row of page.items){if(ids.has(row.id))return invalidModelPage();ids.add(row.id);items.push(row)}if(items.length>total)return invalidModelPage()
   if(page.complete){if(items.length!==total)return invalidModelPage();return{items,complete:true}}
   if(items.length>=total||page.next_cursor===null||cursors.has(page.next_cursor))return invalidModelPage();cursor=page.next_cursor;cursors.add(cursor)
  }
 }
 try{if(signal?.aborted)cancel();return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new ModelConnectionPaginationError(408,'model_connection_list_budget_exceeded'));abort.abort()},budget)})])}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);abort.abort()}
}
