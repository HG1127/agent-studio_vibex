import {safeWorkflowGraph,type WorkflowGraph} from "./contracts.ts"
export function autonomousAgentGraph(specId:string,revision:number,maxSteps:number):WorkflowGraph{
  return safeWorkflowGraph({version:2,nodes:[
    {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
    {id:"agent",type:"agent",data:{title:"Agent",agent_binding:{spec_id:specId,spec_revision:revision},max_steps:maxSteps},position:{x:100,y:0}},
    {id:"end",type:"end",data:{title:"End",output_template:"{{Agent.output}}"},position:{x:200,y:0}},
  ],edges:[{id:"start-agent",source:"start",target:"agent"},{id:"agent-end",source:"agent",target:"end"}]})
}
