import {fork} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
export function renderInChild(input,signal){return new Promise(resolve=>{
  if(signal?.aborted)return resolve({interrupted:true})
  let done=false;const child=fork(fileURLToPath(new URL('./report-renderer-child.mjs',import.meta.url)),[],{windowsHide:true,silent:true,execArgv:['--max-old-space-size=384','--v8-pool-size=1'],env:{SYSTEMROOT:process.env.SYSTEMROOT||'',TEMP:process.env.TEMP||'',TMP:process.env.TMP||'',AGENT_STUDIO_REPORT_FONT:process.env.AGENT_STUDIO_REPORT_FONT||''}})
  const abort=()=>finish({interrupted:true})
  function finish(result){if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(result);try{child.kill()}catch{}}
  const timer=setTimeout(()=>finish({ok:false,error:'report_renderer_timeout'}),90000)
  signal?.addEventListener('abort',abort,{once:true})
  child.stdout.resume();child.stderr.resume();child.once('error',()=>finish({ok:false,error:'report_renderer_unavailable'}));child.once('exit',()=>finish({ok:false,error:'report_renderer_terminated'}));child.once('message',m=>finish(m&&typeof m==='object'?m:{ok:false,error:'invalid_report_result'}))
  child.send(input,e=>{if(e)finish({ok:false,error:'report_renderer_unavailable'})})
})}
export async function advanceReportJob(endpoint,token,signal){
  const post=(path,body)=>fetch(endpoint+path,{method:'POST',headers:{'Content-Type':'application/json','X-Agent-Studio-Worker-Token':token},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)})
  const response=await post('/api/internal/worker/report-jobs/claim',{});if(response.status===404)return {idle:true}
  if(!response.ok){const e=Error('Report job claim failed: '+response.status);e.fatal=response.status===401||response.status===403;throw e}
  const {job}=await response.json();if(!job)throw Error('Invalid report job claim');if(job.idle||job.failed)return job
  const result=await renderInChild(job,signal)
  if(result.interrupted)return {idle:false,job_id:job.job_id,status:'interrupted'} // lease recovery; no false failure/file
  if(result.ok){const bytes=Buffer.from(result.file.base64,'base64');if(bytes.toString('base64')!==result.file.base64||bytes.length!==result.file.byte_count||createHash('sha256').update(bytes).digest('hex')!==result.file.binary_sha256)throw Error('Invalid report child checksum')}
  const completed=await post('/api/internal/worker/report-jobs/complete',{job_id:job.job_id,lease_token:job.lease_token,...result})
  if([403,409].includes(completed.status))return {idle:false,job_id:job.job_id,status:'completion_rejected'}
  if(!completed.ok)throw Error('Report job completion failed: '+completed.status)
  return {idle:false,...(await completed.json()).job}
}
