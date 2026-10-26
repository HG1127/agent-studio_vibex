import {safeWorkflowGraph,type WorkflowGraph,type AgentSpecInput} from "./contracts.ts"
export function autonomousAgentGraph(specId:string,revision:number,maxSteps:number,modelBinding?:AgentSpecInput["model_binding"],requirePlanReview?:boolean):WorkflowGraph{
  return safeWorkflowGraph({version:2,nodes:[
    {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
    {id:"agent",type:"agent",data:{title:"Agent",agent_binding:{spec_id:specId,spec_revision:revision},max_steps:maxSteps,...(modelBinding?{model_binding:modelBinding}:{}),
      ...(requirePlanReview!==undefined?{require_plan_review:requirePlanReview}:{})},position:{x:100,y:0}},
    {id:"end",type:"end",data:{title:"End",output_template:"{{Agent.output}}"},position:{x:200,y:0}},
  ],edges:[{id:"start-agent",source:"start",target:"agent"},{id:"agent-end",source:"agent",target:"end"}]})
}
