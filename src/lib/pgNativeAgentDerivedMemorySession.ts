import {PgNativePilotError,type createPgNativePilotApi,type PgNativeDerivedMemoryChoice,type PgNativeDerivedMemoryItem,type PgNativeDerivedMemoryPreview} from "./pgNativePilotApi.ts"
import {agentDerivedMemoryChoice} from "./pgNativeAgentDerivedMemory.ts"
import type {MemoryRole} from "./pgNativeAgentMemorySession.ts"
type Api=Pick<ReturnType<typeof createPgNativePilotApi>,"listAgentDerivedMemories"|"previewAgentDerivedMemory"|"changeAgentDerivedMemory"|"confirmAgentDerivedMemory"|"listAutonomousAgentRuns">
type SourceRun={id:string;status:"succeeded"|"failed";label:string}
export type DerivedMemoryView={role:MemoryRole|null;runs:SourceRun[];selectedRun:string;preview:PgNativeDerivedMemoryPreview|null;items:PgNativeDerivedMemoryItem[];loading:boolean;busy:boolean;canWrite:boolean;
  pending:{action:PgNativeDerivedMemoryChoice["action"];request_id:string;role_name:string}|null;error:string;notice:string}
export const emptyDerivedMemoryView=():DerivedMemoryView=>({role:null,runs:[],selectedRun:"",preview:null,items:[],loading:false,busy:false,canWrite:false,pending:null,error:"",notice:""})
export function createPgNativeDerivedMemorySession(api:Api,{onExpired=()=>{}}:{onExpired?:()=>void}={}){
  let active=false,disposed=false,writable=false,epoch=0,reads=0,writing=false
  let role:MemoryRole|null=null,runs:SourceRun[]=[],selectedRun="",preview:PgNativeDerivedMemoryPreview|null=null,items:PgNativeDerivedMemoryItem[]=[]
  let loading=false,busy=false,error="",notice="",pending:{body:PgNativeDerivedMemoryChoice;name:string}|null=null
  const listeners=new Set<()=>void>(),emit=()=>{for(const listener of listeners)listener()}
  const current=(scope:number)=>active&&!disposed&&scope===epoch
  const snapshot=():DerivedMemoryView=>!active||disposed?emptyDerivedMemoryView():structuredClone({role,runs,selectedRun,preview,items,loading,busy,canWrite:writable,
    pending:pending?{action:pending.body.action,request_id:pending.body.request_id,role_name:pending.name}:null,error,notice})
  const clear=()=>{runs=[];selectedRun="";preview=null;items=[];loading=false;busy=false;error="";notice=""}
  const dispose=()=>{if(disposed)return;disposed=true;active=false;epoch++;reads++;writing=false;role=null;pending=null;clear();emit();listeners.clear()}
  const report=(cause:unknown)=>{
    if(cause instanceof PgNativePilotError&&cause.status===401){dispose();onExpired();return}
    error=cause instanceof PgNativePilotError&&cause.status===409?"原任务或来源已变化，请刷新并重新核对。":
      cause instanceof PgNativePilotError&&[403,405].includes(cause.status)?"当前仅可查看和核对原请求，保存与忘记尚未开放。":
      cause instanceof PgNativePilotError&&cause.status===404?"未找到本人记录。结果未知时请继续核对原请求。":"暂未收到确认，请核对原请求结果。"
  }
  const load=async(afterMutation=false)=>{
    if(!active||disposed||!role||writing&&!afterMutation||pending)return
    const scope=epoch,ticket=++reads,id=role.id;loading=true;error="";selectedRun="";preview=null;emit()
    try{
      const [page,recent]=await Promise.all([api.listAgentDerivedMemories(id),api.listAutonomousAgentRuns()])
      if(!current(scope)||ticket!==reads||role?.id!==id)return
      if(page.spec_id!==id)throw new PgNativePilotError(503,"invalid_agent_derived_memory_projection")
      items=page.items;runs=recent.filter(row=>row.agent_spec_id===id&&(row.status==="succeeded"||row.status==="failed")).map(row=>({id:row.id,status:row.status as SourceRun["status"],label:row.instruction_preview.slice(0,180)}))
    }catch(cause){if(current(scope)&&ticket===reads){items=[];runs=[];report(cause)}}
    finally{if(current(scope)&&ticket===reads){loading=false;emit()}}
  }
  const execute=async(confirmOnly:boolean)=>{
    if(!active||disposed||!pending||writing||!confirmOnly&&!writable)return
    const scope=epoch,value=pending;writing=true;busy=true;reads++;loading=false;preview=null;items=[];error="";notice="";emit()
    try{
      await(confirmOnly?api.confirmAgentDerivedMemory(value.body):api.changeAgentDerivedMemory(value.body))
      if(!current(scope)||pending!==value)return
      pending=null;notice=value.body.action==="forget"?"已忘记这条任务记忆。":"已保存这份任务记忆。";await load(true)
    }catch(cause){if(current(scope)&&pending===value){
      if(!confirmOnly&&cause instanceof PgNativePilotError&&[400,403,404,405,409].includes(cause.status))pending=null
      report(cause)
    }}finally{if(current(scope)){writing=false;busy=false;emit()}}
  }
  const start=async(raw:PgNativeDerivedMemoryChoice)=>{
    if(!active||disposed||!writable||writing||loading||pending||!role)return
    let body:PgNativeDerivedMemoryChoice;try{body=agentDerivedMemoryChoice(structuredClone(raw))}catch{error="请重新核对原任务与确认选项。";emit();return}
    pending={body,name:role.name};await execute(false)
  }
  return {
    snapshot,dispose,
    subscribe(listener:()=>void){if(!disposed)listeners.add(listener);return()=>{listeners.delete(listener)}},
    setActive(value:boolean){if(disposed||active===value)return;active=value;epoch++;reads++;writing=false;clear();emit()},
    setWritable(value:boolean){if(disposed||writable===value)return;writable=value;emit()},
    async select(next:MemoryRole|null){
      if(!active||disposed||writing||pending)return
      reads++;role=next?{id:next.id,name:next.name,revision:next.revision}:null;clear();emit();await load()
    },
    refresh:()=>load(),
    async previewRun(id:string){
      if(!active||disposed||!role||writing||loading||pending)return
      if(!id){reads++;selectedRun="";preview=null;error="";emit();return}
      if(!runs.some(row=>row.id===id))return
      const scope=epoch,ticket=++reads,spec=role.id;selectedRun=id;preview=null;loading=true;error="";notice="";emit()
      try{const value=await api.previewAgentDerivedMemory(spec,id);if(current(scope)&&ticket===reads&&role?.id===spec&&selectedRun===id)preview=value}
      catch(cause){if(current(scope)&&ticket===reads)report(cause)}
      finally{if(current(scope)&&ticket===reads){loading=false;emit()}}
    },
    async save(confirmed:boolean){
      if(!confirmed||!role||!preview||preview.spec_id!==role.id||preview.run_id!==selectedRun)return
      await start({action:preview.kind==="fact"?"save_success":"save_failure",request_id:crypto.randomUUID(),spec_id:role.id,source_run_id:preview.run_id,expected_source_sha256:preview.source_sha256,confirm:true})
    },
    async forget(id:string,confirmed:boolean){
      if(!confirmed||!role)return
      const item=items.find(row=>row.id===id);if(!item)return
      await start({action:"forget",request_id:crypto.randomUUID(),spec_id:role.id,memory_id:item.id,expected_content_sha256:item.content_sha256,expected_tools_sha256:item.tools_sha256,confirm:true})
    },
    confirm:()=>execute(true),retrySameRequest:()=>execute(false),
  }
}
