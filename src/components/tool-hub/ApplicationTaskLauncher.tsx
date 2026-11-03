import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {decodeRhToken} from '@/lib/studioAuth'
import {localApi} from '@/lib/localDevices'
import {buildApplicationTask} from '@/lib/localApplicationTask'
export function ApplicationTaskLauncher({app,deviceId,disabled,onPreparing}:{app:{id:string;name:string;control:boolean};deviceId:string;disabled:boolean;onPreparing:(busy:boolean)=>void}){
 const navigate=useNavigate(),locked=useRef(false),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const [task,setTask]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const prepare=async()=>{
  if(disabled||locked.current)return
  const owner=decodeRhToken()?.sub;locked.current=true;setBusy(true);onPreparing(true);setError('')
  try{const plan=buildApplicationTask(app,task),row=await localApi<{id:string}>('/api/agent_specs',{name:plan.name,spec:plan.spec,source:'create'});if(!alive.current||decodeRhToken()?.sub!==owner)return;if(!row.id)throw Error('无法核验任务助手是否已保存，请先查看我的 Agent，避免重复创建');navigate('/agent-run?spec='+encodeURIComponent(row.id)+'&device='+encodeURIComponent(deviceId),{state:{applicationTask:{specId:row.id,deviceId,instruction:plan.instruction}}})}catch(e){if(alive.current)setError((e as Error).message)}finally{locked.current=false;onPreparing(false);if(alive.current)setBusy(false)}
 }
 return <section aria-label="应用任务" className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
  <h4 className="font-medium">让 Agent 在 {app.name} 中完成任务</h4>
  <label className="block text-sm">希望应用完成什么任务？<textarea className="mt-2 min-h-24 w-full rounded-lg border bg-background p-3" maxLength={5000} value={task} disabled={disabled||busy} onChange={e=>setTask(e.target.value)} placeholder="写清目标、操作范围和如何判断完成，例如在测试编辑器输入指定文字并保存测试回执。"/></label>
  <p className="text-xs leading-6 text-muted-foreground">下一步会保留当前电脑和任务，选择模型后再运行。Agent 将启动应用、等待窗口、观察并逐步操作；每项操作仍需审批。首次登录、应用更新或无可用控件时会停止说明原因。</p>
  <button type="button" disabled={disabled||busy||!task.trim()} onClick={()=>void prepare()} className="min-h-10 rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-40">{busy?'正在准备任务…':'创建应用任务并进入试跑'}</button>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>
}
