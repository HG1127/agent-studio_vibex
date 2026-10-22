import {PgNativePilotError,type createPgNativePilotApi,type PgNativeSmitheryKey,type PgNativeSmitheryConnection,type PgNativeSmitheryCatalog} from "./pgNativePilotApi.ts"
import {parseSmitherySelection,type SmitherySelection} from "../../services/pg-api/src/smithery-contracts.ts"
type Api=ReturnType<typeof createPgNativePilotApi>
type Pending={kind:"key_save";id:string;expected:number;key:string}|{kind:"key_remove";id:string;expected:number}|
  {kind:"connect";id:string;selection:SmitherySelection}|{kind:"operation";id:string;expected:number;action:"refresh"|"revoke"|"retry"|"pause"}
export type SmitheryView={key:PgNativeSmitheryKey|null;connections:PgNativeSmitheryConnection[];namespaces:string[];catalog:PgNativeSmitheryCatalog|null;catalogQuery:string;
  busy:boolean;loading:boolean;pending:{kind:Pending["kind"];id:string}|null;canRetry:boolean;canRecoverRemote:boolean;error:string;notice:string}
const empty=():SmitheryView=>({key:null,connections:[],namespaces:[],catalog:null,catalogQuery:"",busy:false,loading:false,pending:null,canRetry:false,canRecoverRemote:false,error:"",notice:""})
export function smitheryError(cause:unknown){
  if(cause instanceof PgNativePilotError){
    if(cause.status===401)return "登录已失效，请重新登录。"
    if(cause.status===403||cause.status===405)return "当前账号或环境未授权 Smithery 管理。"
    if(cause.status===404)return "此连接不存在或不属于当前员工。"
    if(cause.status===409)return "密钥或连接版本已变化，请读取当前配置核对。"
    if(cause.status===429)return "Smithery 请求过于频繁，请稍后再试。"
    if(cause.status===400)return "输入未通过检查，请核对密钥、工作空间和插件。"
  }
  return "操作结果尚未确认，请读取当前记录核对，避免重复建立连接。"
}
export function createPgNativeSmitherySession(api:Api,{onExpired=()=>{},key=()=>crypto.randomUUID()}:{onExpired?:()=>void;key?:()=>string}={}){
  let view=empty(),pending:Pending|null=null,alive=true,active=false,readTicket=0
  const listeners=new Set<()=>void>()
  const emit=()=>{for(const listener of listeners)listener()}
  const set=(patch:Partial<SmitheryView>)=>{if(!alive)return;view={...view,...patch};emit()}
  const publishPending=()=>set({pending:pending?{kind:pending.kind,id:pending.id}:null,canRetry:false,canRecoverRemote:false})
  const fail=(cause:unknown)=>{
    if(cause instanceof PgNativePilotError&&cause.status===401){pending=null;view=empty();emit();onExpired();return}
    set({error:smitheryError(cause)})
  }
  const upsert=(row:PgNativeSmitheryConnection)=>set({connections:[row,...view.connections.filter(item=>item.id!==row.id)].slice(0,50)})
  const accept=(operation:Pending,result:PgNativeSmitheryConnection|PgNativeSmitheryKey)=>{
    if(operation.kind==="key_save"||operation.kind==="key_remove")set({key:result as PgNativeSmitheryKey,namespaces:[],catalog:null,connections:[]})
    else upsert(result as PgNativeSmitheryConnection)
    pending=null;publishPending();set({notice:"操作记录已读取，请核对当前状态。"})
  }
  const execute=async(operation:Pending)=>{
    if(!alive||!active||view.busy||view.loading)return
    pending=operation;readTicket++;publishPending();set({busy:true,error:"",notice:""})
    try{
      const result=operation.kind==="key_save"?await api.saveSmitheryKey(operation.key,operation.expected,operation.id):
        operation.kind==="key_remove"?await api.removeSmitheryKey(operation.expected,operation.id):
        operation.kind==="connect"?await api.connectSmithery(operation.selection,operation.id):await api.operateSmithery(operation.id,operation.expected,operation.action)
      if(alive&&pending===operation)accept(operation,result)
    }catch(cause){if(!alive||pending!==operation)return
      if(cause instanceof PgNativePilotError&&[400,403,404,405,409,413,429].includes(cause.status)){pending=null;publishPending()}
      fail(cause)
    }finally{if(alive)set({busy:false})}
  }
  const read=async<T>(action:()=>Promise<T>,accept:(result:T)=>void)=>{
    if(!alive||!active||view.busy||view.loading)return
    const ticket=++readTicket;set({loading:true,error:"",notice:""})
    try{const result=await action();if(alive&&active&&ticket===readTicket)accept(result)}
    catch(cause){if(alive&&active&&ticket===readTicket)fail(cause)}
    finally{if(alive&&ticket===readTicket)set({loading:false})}
  }
  return {
    snapshot:()=>structuredClone(view),subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener)}},
    setActive(value:boolean){if(!alive)return;active=value;readTicket++;set({loading:false,namespaces:[],catalog:null})},
    dispose(){alive=false;active=false;readTicket++;pending=null;view=empty();listeners.clear()},
    load(){if(pending)return Promise.resolve();return read(()=>Promise.all([api.getSmitheryKey(),api.listSmitheryConnections()]),([key,connections])=>set({key,connections,notice:"已读取本人 Smithery 配置。"}))},
    namespaces(){if(pending||!view.key?.has_key)return Promise.resolve();return read(()=>api.readSmitheryNamespaces(),namespaces=>set({namespaces}))},
    search(query:string,page=1){if(pending||!view.key?.has_key)return Promise.resolve();return read(()=>api.searchSmitheryCatalog(query,page),catalog=>set({catalog,catalogQuery:query}))},
    saveKey(value:string){if(pending||!view.key)return Promise.resolve();return execute({kind:"key_save",id:key(),expected:view.key.revision,key:value})},
    removeKey(){if(pending||!view.key?.has_key)return Promise.resolve();return execute({kind:"key_remove",id:key(),expected:view.key.revision})},
    connect(raw:SmitherySelection){
      if(pending||!view.key?.has_key)return Promise.resolve()
      let selection:SmitherySelection;try{selection=parseSmitherySelection(raw)}catch{set({error:"请选择工作空间和插件，并填写连接名称与用途。"});return Promise.resolve()}
      if(!view.namespaces.includes(selection.namespace)){set({error:"请先读取本人 Smithery 工作空间，再选择连接目标。"});return Promise.resolve()}
      return execute({kind:"connect",id:key(),selection:structuredClone(selection)})
    },
    operate(id:string,action:"refresh"|"revoke"|"retry"|"pause"){
      if(pending)return Promise.resolve();const row=view.connections.find(item=>item.id===id)
      if(!row)return Promise.resolve();return execute({kind:"operation",id,expected:row.revision,action})
    },
    retry(){return pending&&view.canRetry?execute(pending):Promise.resolve()},
    reconcile(){
      const operation=pending;if(!operation)return Promise.resolve()
      return read(async()=>{
        if(operation.kind==="key_save"||operation.kind==="key_remove")return {key:await api.getSmitheryKey()}
        try{return {connection:await api.getSmitheryConnection(operation.id)}}catch(cause){if(cause instanceof PgNativePilotError&&cause.status===404)return {absent:true};throw cause}
      },result=>{
        if(pending!==operation)return
        if("key" in result&&result.key){
          set({key:result.key})
          if(result.key.last_request_id===operation.id){accept(operation,result.key);return}
          if(result.key.revision!==("expected" in operation?operation.expected:-1)){
            pending=null;publishPending();set({notice:"服务器已有较新的密钥记录，已停止旧请求，请核对当前状态。"});return
          }
          set({canRetry:true,notice:"当前记录尚未确认该请求；仅可使用原请求重试。"});return
        }
        if("connection" in result&&result.connection){
          const row=result.connection;upsert(row)
          if(operation.kind==="connect"||!row.operation_in_flight&&operation.kind==="operation"&&row.revision>operation.expected){accept(operation,row);return}
          set({canRecoverRemote:row.operation_in_flight,notice:row.operation_in_flight?"服务器保留了待核对操作，可仅刷新远端状态；不会重发建立或撤销请求。":"当前操作尚未确认，请稍后再次读取。"});return
        }
        set({canRetry:operation.kind==="connect",notice:"尚未读到此连接；如重试，将沿用同一请求编号与选择。"})
      })
    },
    recoverRemote(){
      if(!pending||!view.canRecoverRemote||pending.kind!=="operation"&&pending.kind!=="connect")return Promise.resolve()
      const row=view.connections.find(item=>item.id===pending!.id)
      if(!row)return Promise.resolve();return execute({kind:"operation",id:row.id,expected:row.revision,action:"refresh"})
    },
  }
}
