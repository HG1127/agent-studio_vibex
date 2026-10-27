import {PgNativePilotError,type PgNativeMcpInput,type PgNativeMcpConnection,type createPgNativePilotApi} from "./pgNativePilotApi.ts"
type Api=Pick<ReturnType<typeof createPgNativePilotApi>,"listMcpConnections"|"getMcpConnection"|"createMcpConnection"|"updateMcpConnection"|"deleteMcpConnection"|"discoverMcpConnection">
type Pending={kind:"create"|"update"|"delete"|"discover";id:string;revision:number;input?:PgNativeMcpInput}
export type McpView={items:PgNativeMcpConnection[];selected:string;loaded:boolean;busy:boolean;pending:{kind:Pending["kind"];id:string}|null;canRetryCreate:boolean;error:string;notice:string;formVersion:number}
export const emptyMcpView:McpView={items:[],selected:"",loaded:false,busy:false,pending:null,canRetryCreate:false,error:"",notice:"",formVersion:0}
export function createPgNativeMcpSession(api:Api,options:{onExpired?:()=>void;uuid?:()=>string}={}){
  let state=structuredClone(emptyMcpView),alive=true,locked=false,pending:Pending|null=null
  const listeners=new Set<()=>void>()
  const publish=(patch:Partial<McpView>)=>{if(alive){state={...state,...patch};listeners.forEach(fn=>fn())}}
  const merge=(row:PgNativeMcpConnection)=>[row,...state.items.filter(item=>item.id!==row.id)].slice(0,50)
  function failed(error:unknown,uncertain:boolean){
    if(!alive)return
    if(error instanceof PgNativePilotError&&error.status===401){pending=null;publish({...structuredClone(emptyMcpView),error:"登录已失效，请重新登录。"});options.onExpired?.();return}
    if(error instanceof PgNativePilotError&&[400,403,404,405,409,429].includes(error.status)){
      if(!uncertain)pending=null
      publish({error:error.status===429?"工具发现过于频繁，请稍后刷新核对。":"连接、权限或版本已变化，请刷新核对。",pending:pending?{kind:pending.kind,id:pending.id}:null});return
    }
    publish({error:uncertain?"请求结果尚未确认，请读取当前连接核对后再操作。":"暂时无法读取 MCP 连接，请稍后重试。",
      pending:pending?{kind:pending.kind,id:pending.id}:null})
  }
  async function busy(work:()=>Promise<void>){
    if(!alive||locked)return
    locked=true;publish({busy:true,error:"",notice:""})
    try{await work()}finally{locked=false;publish({busy:false})}
  }
  async function execute(){
    const operation=pending!
    try{
      if(operation.kind==="delete"){
        await api.deleteMcpConnection(operation.id,operation.revision)
        if(!alive)return
        pending=null;publish({items:state.items.filter(item=>item.id!==operation.id),selected:"",pending:null,formVersion:state.formVersion+1,notice:"MCP 连接已移除。"});return
      }
      const row=operation.kind==="create"?await api.createMcpConnection(operation.input!,operation.id):
        operation.kind==="update"?await api.updateMcpConnection(operation.id,operation.revision,operation.input!):await api.discoverMcpConnection(operation.id,operation.revision)
      if(!alive)return
      pending=null;publish({items:merge(row),selected:row.id,pending:null,canRetryCreate:false,formVersion:state.formVersion+1,
        notice:operation.kind==="discover"?(row.status==="ok"?"工具发现完成，未执行任何工具。":"工具发现未通过，请核对服务配置和请求头。"):
          "连接已保存，尚未发起工具发现。"})
    }catch(error){
      const known=error instanceof PgNativePilotError&&[400,403,404,405,409,429].includes(error.status)
      if(known)pending=null
      failed(error,!known)
    }
  }
  return {
    snapshot:()=>state,subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn)}},
    select(id:string){if(!locked&&!pending)publish({selected:id,error:"",notice:"",formVersion:state.formVersion+1})},
    refresh:()=>busy(async()=>{
      if(pending)return
      try{const items=await api.listMcpConnections();publish({items,loaded:true,formVersion:state.formVersion+1})}catch(error){failed(error,false)}
    }),
    save:(row:PgNativeMcpConnection|null,input:PgNativeMcpInput)=>busy(async()=>{
      if(pending)return
      pending={kind:row?"update":"create",id:row?.id??(options.uuid??(()=>crypto.randomUUID()))(),revision:row?.revision??1,input:structuredClone(input)}
      await execute()
    }),
    discover:(row:PgNativeMcpConnection)=>busy(async()=>{if(pending)return;pending={kind:"discover",id:row.id,revision:row.revision};await execute()}),
    remove:(row:PgNativeMcpConnection)=>busy(async()=>{if(pending)return;pending={kind:"delete",id:row.id,revision:row.revision};await execute()}),
    reconcile:()=>busy(async()=>{
      if(!pending)return
      const operation=pending
      try{const row=await api.getMcpConnection(operation.id)
        if(!alive)return
        pending=null;publish({items:merge(row),selected:row.id,pending:null,canRetryCreate:false,formVersion:state.formVersion+1,notice:"已读取当前连接，请核对最新配置。加密请求头值不会显示。"})
      }catch(error){
        if(error instanceof PgNativePilotError&&error.status===404&&alive){
          if(operation.kind==="create")publish({canRetryCreate:true,notice:"尚未找到该连接。可用原请求重试保存，不会创建第二个连接。"})
          else{pending=null;publish({items:state.items.filter(item=>item.id!==operation.id),selected:"",pending:null,canRetryCreate:false,formVersion:state.formVersion+1,notice:"当前连接已不存在。"})}
        }else failed(error,true)
      }
    }),
    retryCreate:()=>busy(async()=>{if(pending?.kind==="create"&&state.canRetryCreate)await execute()}),
    dispose(){alive=false;pending=null;state=structuredClone(emptyMcpView);listeners.clear()},
  }
}
