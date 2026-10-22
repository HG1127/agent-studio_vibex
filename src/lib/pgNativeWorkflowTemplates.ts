import {parseWorkflowGraphV2,type WorkflowNode,type WorkflowEdge,type WorkflowNodeDataV2} from "../../services/pg-api/src/workflow-graph-v2.ts"
export const pgWorkflowTemplates={basic:"模型处理",branch:"条件分支",loop:"列表循环",agent:"Agent 任务"} as const
export type PgWorkflowTemplate=keyof typeof pgWorkflowTemplates
export function pgWorkflowTemplate(kind:PgWorkflowTemplate){
  if(!Object.hasOwn(pgWorkflowTemplates,kind))throw Error("请选择有效的示例。")
  const node=(id:string,type:WorkflowNode["type"],title:string,x:number,y=100,data:Partial<WorkflowNodeDataV2>={}):WorkflowNode=>({id,type,data:{title,...data},position:{x,y}})
  const edge=(source:string,target:string,sourceHandle?:WorkflowEdge["sourceHandle"]):WorkflowEdge=>({id:source+"_"+target+"_"+(sourceHandle??"default"),source,target,...(sourceHandle?{sourceHandle}:{})})
  const start=node("start","start","开始",0),model=node("model","model","生成回答",240,100,{prompt:"{{input}}"}),end=node("end","end","结束",720,100,{output_template:"{{生成回答.output}}"})
  let nodes:WorkflowNode[]=[start,model,end],edges:WorkflowEdge[]=[edge("start","model"),edge("model","end")]
  if(kind==="branch"){
    nodes=[start,model,node("choice","condition","内容判断",480,100,{ref_title:"生成回答",op:"contains",value:"合格"}),
      node("yes","model","符合条件",720,0,{prompt:"{{生成回答.output}}"}),node("no","model","需要修改",720,220,{prompt:"{{生成回答.output}}"}),{...end,position:{x:960,y:100},data:{title:"结束",output_template:"{{符合条件.output}}\n{{需要修改.output}}"}}]
    edges=[edge("start","model"),edge("model","choice"),edge("choice","yes","true"),edge("choice","no","false"),edge("yes","end"),edge("no","end")]
  }else if(kind==="loop"){
    nodes=[start,node("loop","loop","逐项处理",240,100,{mode:"list",list_source:"{{input}}",delimiter:"line",max_iterations:10}),
      {...model,position:{x:480,y:260},data:{title:"生成回答",prompt:"处理第 {{loop.index}} 项：{{loop.item}}"}},
      {...end,data:{title:"结束",output_template:"{{逐项处理.output}}"}}]
    edges=[edge("start","loop"),edge("loop","model"),edge("model","loop"),edge("loop","end","done")]
  }else if(kind==="agent"){
    nodes=[start,node("agent","agent","执行任务",240,100,{prompt:"{{input}}",max_steps:3}),{...end,data:{title:"结束",output_template:"{{执行任务.output}}"}}]
    edges=[edge("start","agent"),edge("agent","end")]
  }
  return {name:pgWorkflowTemplates[kind]+"示例",graph:parseWorkflowGraphV2({version:2,description:"本地示例草稿，请绑定本人资源并核对后再保存与运行。",nodes,edges})}
}
