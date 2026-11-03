import {fork} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'

export async function parseInChild(input){
  return new Promise(resolve=>{
    let settled=false
    // Deliberately omit all model, tool, database and Worker secrets from the
    // parser environment. This child only sees original bytes and a filename.
    const child=fork(fileURLToPath(new URL('./material-parser-child.mjs',import.meta.url)),[],{
      windowsHide:true,silent:true,execArgv:['--max-old-space-size=384','--v8-pool-size=1'],
      env:{SYSTEMROOT:process.env.SYSTEMROOT||'',TEMP:process.env.TEMP||'',TMP:process.env.TMP||''},
    })
    function finish(value){if(settled)return;settled=true;clearTimeout(timer);resolve(value);try{child.kill()}catch{}}
    const timer=setTimeout(()=>finish({ok:false,error:'material_parser_timeout'}),45000)
    child.stdout.resume();child.stderr.resume()
    child.once('error',()=>finish({ok:false,error:'material_parser_unavailable'}))
    child.once('exit',()=>finish({ok:false,error:'material_parser_terminated'}))
    child.once('message',value=>finish(value&&typeof value==='object'?value:{ok:false,error:'invalid_parser_result'}))
    child.send({filename:input.filename,base64:input.base64},error=>{if(error)finish({ok:false,error:'material_parser_unavailable'})})
  })
}
export async function advanceMaterialJob(endpoint,token){
  async function post(path,body){
    return fetch(endpoint+path,{method:'POST',headers:{'Content-Type':'application/json','X-Agent-Studio-Worker-Token':token},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
  }
  const response=await post('/api/internal/worker/material-jobs/claim',{})
  if(response.status===404)return {idle:true}
  if(!response.ok){const error=new Error('Material job authorization/claim failed: '+response.status);error.fatal=response.status===401||response.status===403;throw error}
  const claimed=await response.json(),job=claimed.job
  if(claimed.ok!==true||!job)throw Error('Invalid material job claim response')
  if(job.idle||job.failed)return job
  let parsed
  if(createHash('sha256').update(job.base64).digest('hex')!==job.storage_hash)parsed={ok:false,error:'material_integrity_error'}
  else parsed=await parseInChild(job)
  const completed=await post('/api/internal/worker/material-jobs/complete',{job_id:job.job_id,lease_token:job.lease_token,...parsed})
  // Cancellation or revocation while parsing never authorizes a stale receipt.
  if(completed.status===409||completed.status===403)return {idle:false,job_id:job.job_id,status:'completion_rejected'}
  if(!completed.ok)throw Error('Material job completion failed: '+completed.status)
  const result=await completed.json()
  if(result.ok!==true)throw Error('Invalid material completion response')
  return {idle:false,...result.job}
}
