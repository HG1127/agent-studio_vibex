import {PgNativePilotError,type createPgNativePilotApi,type PgNativeMemoryChoice,type PgNativeMemoryItem} from "./pgNativePilotApi.ts"
import {agentMemoryChoice} from "./pgNativeAgentMemory.ts"
type Api=Pick<ReturnType<typeof createPgNativePilotApi>,"listAgentMemories"|"changeAgentMemory"|"confirmAgentMemory">
export type MemoryRole={id:string;name:string;revision:number}
export type MemoryView={role:MemoryRole|null;items:PgNativeMemoryItem[];busy:boolean;loading:boolean;canWrite:boolean;
  pending:{action:"remember"|"forget";request_id:string;role_name:string}|null;error:string;notice:string}
export const emptyMemoryView=():MemoryView=>({role:null,items:[],busy:false,loading:false,canWrite:false,pending:null,error:"",notice:""})
export function createPgNativeMemorySession(api:Api,{onExpired=()=>{}}:{onExpired?:()=>void}={}){
  let active=false,writable=false,disposed=false,epoch=0,reads=0,writing=false
  let role:MemoryRole|null=null,items:PgNativeMemoryItem[]=[],pending:{body:PgNativeMemoryChoice;name:string}|null=null
  let busy=false,loading=false,error="",notice=""
  const listeners=new Set<()=>void>()
  const emit=()=>{for(const listener of listeners)listener()}
  const snapshot=():MemoryView=>!active||disposed?emptyMemoryView():structuredClone({role,items,busy,loading,canWrite:writable,
    pending:pending?{action:pending.body.action,request_id:pending.body.request_id,role_name:pending.name}:null,error,notice})
  const current=(scope:number)=>!disposed&&active&&scope===epoch
  const dispose=()=>{if(disposed)return;disposed=true;active=false;epoch++;reads++;role=null;items=[];pending=null;busy=false;loading=false;writing=false;error="";notice="";emit();listeners.clear()}
  const report=(cause:unknown)=>{
    if(cause instanceof PgNativePilotError&&cause.status===401){dispose();onExpired();return}
    error=cause instanceof PgNativePilotError&&cause.status===409?"角色或记忆内容已变化，请刷新后重新核对。":
      cause instanceof PgNativePilotError&&[403,405].includes(cause.status)?"当前不能修改记忆，仍可查看和核对已有请求。":
      cause instanceof PgNativePilotError&&cause.status===404?"未找到本人记录。上次结果未知时，请保留原请求继续核对。":
      "暂未收到确认，请核对原请求结果。"
  }
  const load=async(afterMutation=false)=>{
    if(!active||disposed||!role||writing&&!afterMutation||pending)return
    const scope=epoch,ticket=++reads,id=role.id;loading=true;error="";emit()
    try{const page=await api.listAgentMemories(id);if(current(scope)&&ticket===reads&&role?.id===id)items=page.items}
    catch(cause){if(current(scope)&&ticket===reads){items=[];report(cause)}}
    finally{if(current(scope)&&ticket===reads){loading=false;emit()}}
  }
  const execute=async(confirmOnly:boolean)=>{
    if(!active||disposed||!pending||writing||!confirmOnly&&!writable)return
    const scope=epoch,value=pending;writing=true;busy=true;error="";notice="";reads++;loading=false;emit()
    let recorded=false
    try{
      await(confirmOnly?api.confirmAgentMemory(value.body):api.changeAgentMemory(value.body))
      if(!current(scope)||pending!==value)return
      recorded=true;pending=null;items=[];notice=value.body.action==="forget"?"已忘记这条记忆。":"记忆已保存。"
      await load(true)
    }catch(cause){
      if(current(scope)&&pending===value){
        // A received validation/permission/conflict rejection is definitive.
        // A missing confirmation or transport/projection failure is not.
        if(!confirmOnly&&cause instanceof PgNativePilotError&&[400,403,404,405,409].includes(cause.status))pending=null
        report(cause)
      }else if(current(scope)&&recorded){error="操作已确认，列表刷新尚未完成。请手动刷新记忆。"}
    }finally{if(current(scope)){writing=false;busy=false;emit()}}
  }
  const start=async(body:PgNativeMemoryChoice)=>{
    if(!active||disposed||!writable||writing||loading||pending||!role)return
    let choice:PgNativeMemoryChoice
    try{choice=agentMemoryChoice(structuredClone(body))}catch{error="请检查记忆内容和确认选项。";emit();return}
    pending={body:choice,name:role.name};await execute(false)
  }
  return {
    snapshot,dispose,
    subscribe(listener:()=>void){if(!disposed)listeners.add(listener);return()=>{listeners.delete(listener)}},
    setActive(value:boolean){
      if(disposed||active===value)return
      active=value;epoch++;reads++;loading=false;busy=false;writing=false
      if(!value){items=[];error="";notice=""}emit()
    },
    setWritable(value:boolean){if(disposed||writable===value)return;writable=value;emit()},
    async select(next:MemoryRole|null){
      if(!active||disposed||writing||pending)return
      if(next&&(!next.id||!Number.isSafeInteger(next.revision)||next.revision<1))return
      reads++;role=next?{id:next.id,name:next.name,revision:next.revision}:null;items=[];error="";notice="";emit();await load()
    },
    refresh:()=>load(),
    async remember(fact:string,confirmed:boolean){
      if(!role||!confirmed)return
      await start({action:"remember",request_id:crypto.randomUUID(),spec_id:role.id,expected_revision:role.revision,fact,confirm:true})
    },
    async forget(id:string,confirmed:boolean){
      if(!role||!confirmed)return
      const item=items.find(row=>row.id===id);if(!item)return
      await start({action:"forget",request_id:crypto.randomUUID(),spec_id:role.id,memory_id:item.id,expected_sha256:item.content_sha256,confirm:true})
    },
    confirm:()=>execute(true),
    // Explicit same-body retry only; no request regeneration or automatic send.
    retrySameRequest:()=>execute(false)
  }
}
