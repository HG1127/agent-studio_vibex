export type ToolTraceEvent = {event_type:string;step_index:number;created?:string;content:Record<string,unknown>}
export type ToolTraceStatus = 'waiting_approval'|'running'|'succeeded'|'failed'
export type ToolTraceRow = {key:string;step:number;tool:string;status:ToolTraceStatus;detail:string;input:string;created:string}
const value=(event:ToolTraceEvent,key:string)=>typeof event.content?.[key]==='string'?String(event.content[key]):''
/** Derive only from persisted runtime events; never from a proposed dispatch plan. */
export function buildToolExecutionTrace(events:readonly ToolTraceEvent[],limit=8):ToolTraceRow[]{
 const rows:ToolTraceRow[]=[]
 for(let i=0;i<events.length;i++){
  const event=events[i]
  if(event.event_type!=='tool_call')continue
  const tool=value(event,'tool')||'未指定工具'
  const step=Number.isFinite(event.step_index)?event.step_index:0
  const later=events.slice(i+1).find(candidate=>candidate.step_index===step&&
   value(candidate,'tool')===tool&&['tool_result','error'].includes(candidate.event_type))
  const approval=events.slice(i+1).some(candidate=>candidate.step_index===step&&
   candidate.event_type==='approval_pending'&&
   (value(candidate,'tool_name')===tool||value(candidate,'tool')===tool))
  const status:ToolTraceStatus=later?.event_type==='tool_result'?'succeeded':
   later?.event_type==='error'?'failed':approval?'waiting_approval':'running'
  const detail=status==='succeeded'?value(later!,'output').slice(0,360):
   status==='failed'?value(later!,'message').slice(0,360):
   status==='waiting_approval'?'执行前正在等待本人批准。':'已记录调用请求，等待真实结果事件。'
  rows.push({key:String(step)+':'+tool+':'+i,step,tool,status,detail,input:value(event,'input').slice(0,180),created:event.created||''})
 }
 return rows.slice(-Math.max(1,Math.min(limit,20))).reverse()
}
