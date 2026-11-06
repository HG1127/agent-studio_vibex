export type PlanNodeView={id:string;title:string;objective:string;dependsOn:string[];tools:string[];localTools:string[];inputs:string[];outputs:string[];acceptance:string[];approvalRequired:boolean;status:'review'|'pending'|'active'|'awaiting_approval'|'submitted'|'stopped'|'paused';evidence:{tool:string;step:number}[];output:string}
export type ExecutionPlanView={summary:string;revision:string;approved:boolean;gaps:string[];nodes:PlanNodeView[];runStatus:string}
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((v):v is string=>typeof v==='string').slice(0,32):[]
export function readExecutionPlan(run:{checkpoint?:Record<string,unknown>|null;status?:string}):ExecutionPlanView|null{
 const cp=record(run.checkpoint),plan=record(cp.execution_plan)
 if(plan.version!==1||!Array.isArray(plan.nodes)||!plan.nodes.length||plan.nodes.length>8)return null
 const state=record(cp.role_state),outputs=record(state.outputs),evidence=record(cp.plan_evidence),approved=cp.plan_approved===true
 const completed=strings(state.completed),stopped=['failed','cancelled'].includes(run.status||'')
 const nodes:PlanNodeView[]=plan.nodes.map(raw=>{
  const n=record(raw),id=String(n.id||''),rows=Array.isArray(evidence[id])?(evidence[id] as unknown[]).map(record):[]
  const hasEvidence=strings(n.required_tools).every(tool=>rows.some(row=>row.tool===tool))&&strings(n.local_tools).every(tool=>rows.some(row=>row.tool==='local_computer'&&row.local_tool===tool))
  const output=typeof outputs[id]==='string'?outputs[id] as string:''
  const submitted=approved&&completed.includes(id)&&Boolean(output.trim())&&hasEvidence
  const active=approved&&state.active_role_id===id
  return {id,title:String(n.title||id),objective:String(n.objective||''),dependsOn:strings(n.depends_on),tools:strings(n.tools),localTools:strings(n.local_tools),inputs:strings(n.inputs),outputs:strings(n.outputs),acceptance:strings(n.acceptance),approvalRequired:n.approval_required===true,
   status:submitted?'submitted':stopped?'stopped':!approved?'review':active?(run.status==='paused'?'paused':run.status==='awaiting_approval'?'awaiting_approval':'active'):'pending',
   evidence:rows.map(row=>({tool:String(row.tool||'')+(row.local_tool?' · '+String(row.local_tool):''),step:Number(row.step)||0})),output}
 })
 if(nodes.some(n=>!n.id)||new Set(nodes.map(n=>n.id)).size!==nodes.length)return null
 return {summary:String(plan.summary||''),revision:String(cp.plan_revision||''),approved,gaps:strings(plan.missing_capabilities),nodes,runStatus:run.status||''}
}
