// Browser-safe source descriptor. No stored output text or runtime access.
export type WorkflowSampleProvenance={kind:"manual"}|{kind:"history";run_id:string;workflow_id:string;workflow_revision:number;
  output_version:string;input:boolean;nodes:string[]}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function safeWorkflowSampleProvenance(raw:unknown):WorkflowSampleProvenance{
  const invalid=():never=>{throw Error("invalid_workflow_sample_provenance")}
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))invalid()
  const p=raw as Record<string,unknown>
  if(p.kind==="manual"&&Object.keys(p).length===1)return {kind:"manual"}
  const keys=["kind","run_id","workflow_id","workflow_revision","output_version","input","nodes"]
  if(p.kind!=="history"||Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k))||
    typeof p.run_id!=="string"||!uuid.test(p.run_id)||typeof p.workflow_id!=="string"||!uuid.test(p.workflow_id)||
    !Number.isSafeInteger(p.workflow_revision)||Number(p.workflow_revision)<1||typeof p.output_version!=="string"||!/^[a-f0-9]{64}$/.test(p.output_version)||
    typeof p.input!=="boolean"||!Array.isArray(p.nodes)||p.nodes.length>40||p.nodes.some(x=>typeof x!=="string"||!/^[A-Za-z0-9_-]{1,80}$/.test(x))||
    new Set(p.nodes).size!==p.nodes.length||!p.input&&!p.nodes.length)invalid()
  return {kind:"history",run_id:(p.run_id as string).toLowerCase(),workflow_id:(p.workflow_id as string).toLowerCase(),
    workflow_revision:p.workflow_revision as number,output_version:p.output_version as string,input:p.input as boolean,nodes:[...p.nodes as string[]].sort()}
}
