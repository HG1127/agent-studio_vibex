import {safeRunStepMetadata} from '../../services/pg-api/src/run-step-metadata.ts'
import {nativeRunControlView,type NativeRunControlView} from './pgNativeAgentRunControl.ts'
import type {RunDetailRow,RecentRunRow} from '../pages/RunDetail/useRunDetail.ts'
import {originalRunId,type OriginalRunKind} from './originalRunDetailRoute.ts'
export type OriginalPublicStep={step_key:string;status:string;metadata:Record<string,unknown>;created_at?:string;updated_at?:string}
export type OriginalRunDetailMeta={runId:string;ownerId:string;kind:OriginalRunKind;resourceId:string;finishedAt:string|null;steps:OriginalPublicStep[];stepsComplete:boolean;nextAfter:string|null;sourceAvailable:boolean;control:NativeRunControlView|null;revision:number|null;maxRounds:number|null}
const states=new Set(['queued','running','paused','awaiting_approval','awaiting_input','succeeded','failed','cancelled'])
const stepStates=new Set(['pending','running','awaiting_approval','awaiting_input','succeeded','failed','skipped'])
const bad=():never=>{throw Error('unconfirmed_original_run_detail')}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:bad()
const text=(v:unknown,max=262144):string=>typeof v==='string'&&v.length<=max&&!v.includes('\0')?v:bad()
const date=(v:unknown):string=>typeof v==='string'&&v.length<=80&&Number.isFinite(Date.parse(v))?v:bad()
const integer=(v:unknown):number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=10000?Number(v):bad()
export function originalPublicSteps(raw:unknown,available=true):OriginalPublicStep[]{
 if(!Array.isArray(raw)||raw.length>1000)return bad()
 const keys=new Set<string>()
 return raw.map(raw=>{const s=object(raw),key=text(s.step_key,160),status=text(s.status,40);if(!key||keys.has(key)||!stepStates.has(status))return bad();keys.add(key)
  return{step_key:key,status,metadata:available?safeRunStepMetadata(s.metadata):{},...(s.created_at===undefined?{}:{created_at:date(s.created_at)}),...(s.updated_at===undefined?{}:{updated_at:date(s.updated_at)})}
 })
}
/** Only stored run fields and public step DTOs. Never consult current resource names/configuration. */
export function projectOriginalRunDetail(raw:unknown,kind:OriginalRunKind,id:string,employee:string):RunDetailRow{
 const d=object(raw),r=object(d.run),c=object(r.checkpoint),agent=kind.startsWith('agent_')
 if(!originalRunId(id)||r.id!==id||!originalRunId(employee)||r.owner_user_id!==undefined&&r.owner_user_id!==employee||r.kind!==(agent?'agent':'workflow')||!states.has(String(r.status)))return bad()
 const expected=kind==='agent_autonomous'?'agent_native_v2':kind==='workflow_v2'?'workflow_native_v2':kind==='workflow_safe'?'start_end_only':null
 if(expected?d.execution_mode!==expected: c.execution_mode==='agent_native_v2')return bad()
 if(kind==='agent_autonomous'&&r.workflow_id!==null)return bad()
 const resource=r[agent?'agent_spec_id':'workflow_id'];if(!originalRunId(resource))return bad()
 if(d.knowledge_outputs_available!==undefined&&typeof d.knowledge_outputs_available!=='boolean'||r.knowledge_outputs_available!==undefined&&typeof r.knowledge_outputs_available!=='boolean')return bad()
 const available=d.knowledge_outputs_available!==false&&r.knowledge_outputs_available!==false
 const revisionRaw=c[agent?'spec_revision':'workflow_revision'],revision=revisionRaw===undefined?null:Number.isSafeInteger(revisionRaw)&&Number(revisionRaw)>=1?Number(revisionRaw):bad()
 const maxRounds=kind==='agent_autonomous'&&c.max_steps!==undefined?integer(c.max_steps):null
 const binding=c.selected_model_binding as {model_id?:unknown}|undefined,model=typeof binding?.model_id==='string'?text(binding.model_id,120):''
 const steps=originalPublicSteps(d.steps,available),complete=(kind==='agent_single'?steps.length<40:kind==='workflow_safe'?true:d.steps_truncated===false)
 const meta:OriginalRunDetailMeta={runId:id,ownerId:employee,kind,resourceId:resource,finishedAt:r.finished_at===null||r.finished_at===undefined?null:date(r.finished_at),steps,stepsComplete:complete,nextAfter:null,sourceAvailable:available,control:kind==='agent_autonomous'&&d.run_control!==undefined?nativeRunControlView(d.run_control):null,revision,maxRounds}
 return{id,spec_id:agent?resource:'',spec_name:(agent?'Agent':'Workflow')+' ID '+resource+'（历史名称未提供）',instruction:!available||r.instruction===undefined&&kind==='workflow_safe'?'':text(r.instruction,2000),status:r.status as RunDetailRow['status'],current_step:integer(r.step_count),max_steps:0,model:available?model:'',config:null,checkpoint:null,result:available?text(r.result_text):'',error:available?text(r.last_error_code??'',160):'',evaluation:null,feedback:null,created:date(r.created_at),updated:date(r.updated_at),native:meta}
}
export function originalRecentRun(run:RunDetailRow):RecentRunRow{
 return{id:run.id,spec_id:run.spec_id,spec_name:run.spec_name,instruction:run.instruction,status:run.status,current_step:run.current_step,max_steps:run.max_steps,model:run.model,source:'native',created:run.created,nativeKind:run.native!.kind}
}
export function originalRunDetailReport(run:RunDetailRow){
 if(!run.native)throw Error('original_native_report_required')
 const n=run.native,lines=['# 运行报告','运行种类：'+n.kind,'运行编号：'+run.id,'来源：'+run.spec_name,'状态：'+run.status,'任务：'+run.instruction,'创建：'+run.created,'更新：'+run.updated,'公开执行步骤数：'+run.current_step,'历史名称、运行时完整方案/临时覆盖快照和事件流未提供。','## 公开步骤状态快照（非事件时间线）']
 for(const s of n.steps)lines.push(s.step_key+' · '+s.status+(s.updated_at?' · '+s.updated_at:''))
 lines.push(n.stepsComplete?'当前步骤读取已结束。':'步骤读取尚未完成。','## 最终结果',n.sourceAvailable?run.result:'来源或权限已变化，结果暂不可用。')
 if(run.error)lines.push('错误码：'+run.error)
 return lines.join('\n')
}
