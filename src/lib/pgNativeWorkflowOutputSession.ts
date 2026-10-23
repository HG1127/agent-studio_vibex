// Owner-view lifetime for explicit, read-only node output requests.
import {PgNativePilotError,type createPgNativePilotApi,type WorkflowLatestOutputs,type WorkflowHistoricalNodeOutput} from "./pgNativePilotApi.ts"
import {parseWorkflowLatestOutputs,parseWorkflowOutputHistory} from "../../services/pg-api/src/workflow-v2-output-contract.ts"
export type WorkflowOutputView={latest:WorkflowLatestOutputs|null;history:WorkflowHistoricalNodeOutput[];historyLoaded:boolean;total:number;nextAfter:string|null;busy:boolean;historyBusy:boolean;error:string}
export const emptyWorkflowOutputView:WorkflowOutputView={latest:null,history:[],historyLoaded:false,total:0,nextAfter:null,busy:false,historyBusy:false,error:""}
type Api=Pick<ReturnType<typeof createPgNativePilotApi>,"getWorkflowV2Outputs"|"getWorkflowV2OutputHistory">
function describe(error:unknown){
  if(error instanceof PgNativePilotError){if(error.status===401)return "登录已失效，请重新登录。";if([403,404].includes(error.status))return "运行不存在，或当前员工无权读取这些输出。"}
  return error instanceof Error&&error.message==="workflow_output_progress_changed"?"执行进度已更新，请刷新节点输出后继续查看。":"暂时无法读取节点输出，请重试。"
}
export function createPgNativeWorkflowOutputSession(api:Api,runId:string,workflowId:string,onExpired:()=>void){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(workflowId))throw Error("invalid_output_view_identity")
  runId=runId.toLowerCase();workflowId=workflowId.toLowerCase()
  let state:WorkflowOutputView={...emptyWorkflowOutputView},active=false,closed=false,epoch=0
  let latestFlight:{epoch:number;promise:Promise<void>}|null=null,historyFlight:{epoch:number;promise:Promise<void>}|null=null
  const listeners=new Set<()=>void>(),update=(patch:Partial<WorkflowOutputView>)=>{if(!closed){state={...state,...patch};for(const listener of listeners)listener()}}
  const accepts=(ticket:number)=>!closed&&active&&ticket===epoch
  const failed=(error:unknown)=>{
    update({...emptyWorkflowOutputView,error:describe(error)})
    if(error instanceof PgNativePilotError&&error.status===401){closed=true;active=false;++epoch;listeners.clear();onExpired()}
  }
  function latest():Promise<void>{
    if(closed||!active)return Promise.resolve()
    if(latestFlight?.epoch===epoch)return latestFlight.promise
    const ticket=++epoch;update({...emptyWorkflowOutputView,busy:true})
    const promise=Promise.resolve().then(async()=>{
      try{const result=parseWorkflowLatestOutputs(await api.getWorkflowV2Outputs(runId),runId)
        if(!accepts(ticket))return;if(result.run.workflow_id!==workflowId)throw Error("wrong_output_workflow")
        update({latest:result})
      }catch(error){if(accepts(ticket))failed(error)}
      finally{if(latestFlight?.epoch===ticket)latestFlight=null;if(accepts(ticket))update({busy:false})}
    });latestFlight={epoch:ticket,promise};return promise
  }
  async function history():Promise<void>{
    if(closed||!active||state.busy)return
    if(!state.latest){await latest();if(!state.latest||closed||!active)return}
    if(state.historyLoaded&&!state.nextAfter)return
    if(historyFlight?.epoch===epoch)return historyFlight.promise
    const source=state.latest,ticket=epoch,after=state.historyLoaded?state.nextAfter??"":""
    update({historyBusy:true,error:""})
    const promise=Promise.resolve().then(async()=>{
      try{const page=parseWorkflowOutputHistory(await api.getWorkflowV2OutputHistory(runId,after,25),runId)
        if(!accepts(ticket))return
        if(page.run.workflow_id!==workflowId||page.run.workflow_revision!==source.run.workflow_revision||page.run.graph_sha256!==source.run.graph_sha256||page.run.output_version!==source.run.output_version||
          page.run.instruction!==source.run.instruction||page.run.node_debug_id!==source.run.node_debug_id||state.latest?.run.output_version!==source.run.output_version)throw Error("workflow_output_progress_changed")
        if(page.items.some(item=>!source.nodes.some(node=>node.node_id===item.node_id&&node.node_type===item.node_type&&node.title===item.title)||
          item.loop_path?.some(loop=>loop.node_id===item.node_id||!source.nodes.some(node=>node.node_id===loop.node_id&&node.node_type==="loop"))))throw Error("invalid_output_history_node")
        if(page.items.some(item=>item.step_key<=after)||page.items.length>25||state.history.length+page.items.length>page.total)throw Error("invalid_output_history_page")
        update({history:[...state.history,...page.items],historyLoaded:true,total:page.total,nextAfter:page.next_after})
      }catch(error){if(accepts(ticket))failed(error)}
      finally{if(historyFlight?.epoch===ticket)historyFlight=null;if(accepts(ticket))update({historyBusy:false})}
    });historyFlight={epoch:ticket,promise};return promise
  }
  return {snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener)}},
    setActive(value:boolean){if(closed||active===value)return;active=value;++epoch;update({...emptyWorkflowOutputView})},
    latest,history,dispose(){closed=true;active=false;++epoch;state={...emptyWorkflowOutputView};listeners.clear()},
  }
}
