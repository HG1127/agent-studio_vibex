import {PgNativePilotError,type PgNativeWorkflow} from "./pgNativePilotApi.ts"
import {editablePgWorkflowGraph,newPgWorkflowGraph,parseWorkflowGraphV2,type WorkflowGraph} from "./pgNativeWorkflowGraph.ts"
type Api={getWorkflow(id:string):Promise<PgNativeWorkflow>;createWorkflowGraph(name:string,graph:unknown,key?:string):Promise<PgNativeWorkflow>;
  updateWorkflowGraph(id:string,revision:number,name:string,graph:unknown):Promise<PgNativeWorkflow>}
export type WorkflowDraft={id:string;revision:number;name:string;graph:WorkflowGraph}
type FrozenWrite=Readonly<{kind:"create"|"update";id:string;revision:number;name:string;graph:WorkflowGraph}>
export type WorkflowEditorState={draft:WorkflowDraft|null;dirty:boolean;loading:boolean;busy:boolean;pending:FrozenWrite|null;error:string;notice:string;undoDepth:number;redoDepth:number}
export const emptyWorkflowEditor:WorkflowEditorState={draft:null,dirty:false,loading:false,busy:false,pending:null,error:"",notice:"",undoDepth:0,redoDepth:0}
const definite=new Set([400,401,403,404,405,409,413,415,422,429])
function describe(error:unknown){
  if(error instanceof PgNativePilotError){
    if(error.status===401)return "登录已失效，请重新登录。"
    if(error.status===409)return "工作流或绑定资源已变化，请核对服务器版本。当前草稿已保留。"
    if(error.status===404)return "工作流或绑定资源不存在，或不属于当前员工。"
    if([403,405].includes(error.status))return "当前环境未授权保存工作流。"
    if(error.status===400)return "请检查节点配置和连线。"
  }
  if(error instanceof Error&&error.message==="旧工作流缺少节点配置，请保留原记录并新建完整画布。")return error.message
  return "保存结果尚未确认，请核对原请求，避免覆盖其他版本。"
}
export function createPgNativeWorkflowEditor(api:Api,onExpired:()=>void,makeId=()=>crypto.randomUUID()){
  let state:WorkflowEditorState={...emptyWorkflowEditor},closed=false,read=0,uncertain=false,flight:Promise<void>|null=null
  let baseline="",gesture:WorkflowDraft|null=null,past:WorkflowDraft[]=[],future:WorkflowDraft[]=[]
  const listeners=new Set<()=>void>()
  const update=(patch:Partial<WorkflowEditorState>)=>{if(!closed){state={...state,...patch};for(const fn of listeners)fn()}}
  const expired=(error:unknown)=>{
    if(error instanceof PgNativePilotError&&error.status===401){update({...emptyWorkflowEditor,error:describe(error)});closed=true;++read;listeners.clear();onExpired();return true}return false
  }
  function draft(row:PgNativeWorkflow):WorkflowDraft{
    if(!row||typeof row.id!=="string"||!Number.isSafeInteger(row.revision)||row.revision<1||typeof row.name!=="string")throw Error("invalid_workflow_record")
    return {id:row.id,revision:row.revision,name:row.name,graph:editablePgWorkflowGraph(row.graph)}
  }
  function reset(next:WorkflowDraft,saved:string){baseline=saved;past=[];future=[];gesture=null;update({draft:next,dirty:JSON.stringify(next)!==baseline,undoDepth:0,redoDepth:0})}
  return {
    snapshot:()=>state,subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn)}},
    dispose(){closed=true;++read;state={...emptyWorkflowEditor};baseline="";gesture=null;past=[];future=[];listeners.clear()},
    async open(id:string,discard=false){
      if(closed||state.busy||state.pending||state.dirty&&!discard)return
      const ticket=++read;update({loading:true,error:"",notice:""})
      try{const row=await api.getWorkflow(id),next=draft(row);if(!closed&&ticket===read){if(next.id!==id)throw Error("workflow_identity_changed");
        reset(next,JSON.stringify({...next,graph:row.graph?.version===2?next.graph:row.graph}))
        update({notice:row.graph?.version!==2?"已将开始/结束结构转换为画布草稿，请保存后运行。":""})}}
      catch(error){if(!closed&&ticket===read&&!expired(error))update({error:describe(error)})}
      finally{if(!closed&&ticket===read)update({loading:false})}
    },
    fresh(name:string,discard=false){
      if(closed||state.busy||state.pending||state.dirty&&!discard)return
      ++read;reset({id:"",revision:0,name:name.trim(),graph:newPgWorkflowGraph()},"");update({loading:false,error:"",notice:""})
    },
    importDraft(name:string,graph:WorkflowGraph,discard=false){
      if(closed||state.busy||state.pending||state.dirty&&!discard)return
      const checked=parseWorkflowGraphV2(graph)
      if(!name.trim()||name.trim().length>120)throw Error("工作流名称不能为空，且不超过 120 字。")
      ++read;reset({id:"",revision:0,name:name.trim(),graph:checked},"");update({loading:false,error:"",notice:"已载入新的本地草稿。请重新绑定资源并保存，尚未创建或运行任务。"})
    },
    edit(name:string,graph:WorkflowGraph){
      if(closed||!state.draft||state.busy||state.loading||state.pending)return
      const next={...state.draft,name,graph:structuredClone(graph)}
      if(JSON.stringify(next)===JSON.stringify(state.draft))return
      if(!gesture){past=[...past,structuredClone(state.draft)].slice(-50);future=[]}
      update({draft:next,dirty:JSON.stringify(next)!==baseline,undoDepth:past.length,redoDepth:future.length,error:"",notice:""})
    },
    beginGesture(){if(!closed&&state.draft&&!state.busy&&!state.pending)gesture=structuredClone(state.draft)},
    endGesture(){if(gesture&&state.draft&&JSON.stringify(gesture)!==JSON.stringify(state.draft)){past=[...past,gesture].slice(-50);future=[];update({undoDepth:past.length,redoDepth:0})}gesture=null},
    undo(){
      if(closed||state.busy||state.loading||state.pending||!state.draft||!past.length)return
      const next=past.pop()!;future=[state.draft,...future];gesture=null
      update({draft:next,dirty:JSON.stringify(next)!==baseline,undoDepth:past.length,redoDepth:future.length,error:"",notice:""})
    },
    redo(){
      if(closed||state.busy||state.loading||state.pending||!state.draft||!future.length)return
      const next=future.shift()!;past=[...past,state.draft].slice(-50);gesture=null
      update({draft:next,dirty:JSON.stringify(next)!==baseline,undoDepth:past.length,redoDepth:future.length,error:"",notice:""})
    },
    save(){
      if(closed)return Promise.resolve()
      if(flight)return flight
      if(!state.pending&&!state.draft)return Promise.resolve()
      if(!state.pending){
        const current=state.draft!
        let graph:WorkflowGraph;try{graph=parseWorkflowGraphV2(current.graph)}catch{update({error:"请先修正节点配置及连线。"});return Promise.resolve()}
        if(!current.name.trim()||current.name.trim().length>120){update({error:"工作流名称不能为空，且不超过 120 字。"});return Promise.resolve()}
        const frozen=structuredClone({kind:current.id?"update":"create",id:current.id||makeId(),revision:current.revision,name:current.name.trim(),graph}) as FrozenWrite
        Object.freeze(frozen);update({pending:frozen})
      }
      const write=state.pending!;++read;update({busy:true,loading:false,error:"",notice:""})
      const matches=(row:PgNativeWorkflow)=>row.id===write.id&&row.name===write.name&&JSON.stringify(editablePgWorkflowGraph(row.graph))===JSON.stringify(write.graph)
      flight=Promise.resolve().then(async()=>{
        try{
          let row:PgNativeWorkflow
          try{row=write.kind==="create"?await api.createWorkflowGraph(write.name,write.graph,write.id):await api.updateWorkflowGraph(write.id,write.revision,write.name,write.graph)}
          catch(error){
            // A repeated CAS update may return 409 because the first response
            // was lost. A read of the exact next revision can confirm it.
            if(!(error instanceof PgNativePilotError)||error.status!==409)throw error
            let current:PgNativeWorkflow
            try{current=await api.getWorkflow(write.id)}catch(lookup){
              if(write.kind==="create"&&error.code==="workflow_create_request_conflict"&&lookup instanceof PgNativePilotError&&lookup.status===404){uncertain=false;update({pending:null});throw error}
              throw lookup
            }
            if(!matches(current)||current.revision!==(write.kind==="create"?1:write.revision+1)){
              if(write.kind==="create"||current.revision>write.revision){uncertain=false;update({pending:null})}
              throw error
            }
            row=current
          }
          if(closed)return
          if(!matches(row)||row.revision!==(write.kind==="create"?1:write.revision+1))throw Error("unconfirmed_workflow_write")
          const next=draft(row);uncertain=false;reset(next,JSON.stringify(next));update({pending:null,notice:"工作流已保存并核对服务器版本。"})
        }catch(error){
          if(closed||expired(error))return
          if(!uncertain&&error instanceof PgNativePilotError&&definite.has(error.status))update({pending:null});else uncertain=true
          update({error:describe(error)})
        }
      }).finally(()=>{flight=null;update({busy:false})})
      return flight
    },
  }
}
