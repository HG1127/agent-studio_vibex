#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createInterface} from 'node:readline/promises'
import {setTimeout as sleep} from 'node:timers/promises'
import {createRuntime} from './runtime.mjs'
import {connection,executeClaim} from './connection.mjs'
import {acquireConnectionLock} from './workspace.mjs'
import {createWorkbenchControl} from './workbench-control.mjs'
import {connectorFailureCode,connectorFailureMessage} from './connection-feedback.mjs'

/** One worker owns one config lock. Adapters are injected by imported test code,
 * never by environment flags, downloaded tickets, models or server requests. */
export async function runConnection(configPath,{signal,adapters={},runtimeFactory=createRuntime,onState=()=>{}}={}){
 configPath=path.resolve(configPath)
 const release=await acquireConnectionLock(configPath)
 let runtime=null,config,registered=false,controlsSupported=true
 const stop=new AbortController(),abort=()=>stop.abort()
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)stop.abort()
 const report=(state,reasonCode=null)=>{onState(state,reasonCode);if(process.connected)try{process.send?.({type:'studio-local-state',state,reasonCode},()=>{})}catch{}}
 try{
  config=JSON.parse(await fs.readFile(configPath,'utf8'))
  const credentials=path.resolve(path.dirname(configPath),config.credentialsFile||'.local-device-credentials.json')
  const auth=JSON.parse(await fs.readFile(credentials,'utf8'))
  if(auth.server!==config.server)throw Error('credential_server_mismatch')
  const api=connection(config.server,auth.token)
  const controls=createWorkbenchControl({configFile:configPath,api,...adapters,onActivity:()=>report('online')})
  // Keep only the exact completion receipt in memory. Retrying it never executes a control again.
  let pendingCompletion=null
  async function finishPendingCompletion(){
   if(!pendingCompletion)return
   const requestSignal=AbortSignal.any([stop.signal,AbortSignal.timeout(15000)])
   try{
    if(pendingCompletion.needsSummary)await api('/control-poll',{summary:await controls.summary(runtime?'online':'needs-check'),heartbeat_only:true},requestSignal)
    await api('/control-complete',pendingCompletion.body,requestSignal)
    pendingCompletion=null
   }catch(error){
    if(error.status===409){
     // A generic 409 is not proof of rejection; verify the retained terminal state first.
     try{
      const latest=await api('/control-check',{id:pendingCompletion.body.id,claim:pendingCompletion.body.claim},requestSignal)
      if(['succeeded','failed','cancelled','expired'].includes(latest.status))pendingCompletion=null
     }catch{}
    }
    throw error
   }
  }
  async function reload(){
   await runtime?.close();runtime=null
   const next=JSON.parse(await fs.readFile(configPath,'utf8'))
   if(next.server!==config.server||path.resolve(path.dirname(configPath),next.credentialsFile||'.local-device-credentials.json')!==credentials)throw Error('local_config_changed')
   config=next
   runtime=await runtimeFactory({...config,deniedPaths:[credentials,configPath]})
   await controls.markApplied()
  }
  await reload()
  while(!stop.signal.aborted){
   try{
    await finishPendingCompletion()
    let control=null
    if(controlsSupported){
     try{({control}=await api('/control-poll',{summary:await controls.summary(runtime?'online':'needs-check')},stop.signal))}
     catch(error){if(error.status===404)controlsSupported=false;else throw error}
    }
    if(control){
     let result
     try{result=await controls.execute(control,stop.signal)}
     catch(error){result={ok:false,cancelled:stop.signal.aborted||error.name==='AbortError',result:({permission_confirmation_timeout:'本机确认窗口已超时关闭，未保存授权。草稿仍可保留；请核对后重新确认。',permission_confirmation_unavailable:'本机确认窗口未能打开，未保存授权。请检查被连接电脑的桌面会话，并恢复新版连接器。',local_config_changed:'授权版本已变化，请刷新后重新操作。',local_grant_expired:'本机选择已过期，请重新选择。',permission_grant_duplicate:'此文件或文件夹已经授权。',permission_scope_limit:'最多授权20个具体文件或文件夹。',private_file_denied:'不能授权凭据或系统私有文件。',workspace_too_broad_or_private:'请选择具体工作子文件夹，不能选择整盘或用户主目录。',chrome_not_installed:'本机未安装 Google Chrome，尚未保存网站授权。'})[error.message]||'本次授权操作未确认，未自动重试。'}}
     // Reload even when acknowledgement is lost. Never retain an old, broader
     // runtime after the user has removed a grant.
     if(result.changed){
      report('starting')
      try{await reload()}catch{report('needs-check')}
     }
     pendingCompletion={needsSummary:result.changed===true||result.unchanged===true,body:{id:control.id,claim:control.claim,ok:result.ok===true,cancelled:result.cancelled===true,result:String(result.result||'').slice(0,12000)}}
     await finishPendingCompletion()
     continue
    }
    if(!runtime){report('needs-check');await sleep(1000,undefined,{signal:stop.signal}).catch(()=>{});continue}
    const {job}=await api('/poll',{tools:runtime.tools},stop.signal)
    report('online')
    if(!registered){registered=true;console.log('服务器已确认连接。网站和文件授权可直接在工作台管理。')}
    if(job)await executeClaim(api,runtime,job,stop.signal)
   }catch(error){
    if(stop.signal.aborted)break
    const reasonCode=connectorFailureCode(error)
    if(error.status===401){report('failed',reasonCode);throw error}
    report('needs-check',reasonCode==='connector_start_failed'?'connection_needs_check':reasonCode)
   }
   await sleep(750,undefined,{signal:stop.signal}).catch(()=>{})
  }
 }finally{signal?.removeEventListener('abort',abort);await runtime?.close();await release()}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2)
 if(args.length!==2||!['pair','run'].includes(args[0])){console.error('请从工作台下载的 Start-Connector.cmd 启动；高级用法：node run.mjs run <本地配置>');process.exitCode=1}
 else if(args[0]==='pair'){
  const configPath=path.resolve(args[1]),config=JSON.parse(await fs.readFile(configPath,'utf8'))
  const credentials=path.resolve(path.dirname(configPath),config.credentialsFile||'.local-device-credentials.json')
  try{await fs.access(credentials);throw Error('credentials_already_exist_revoke_before_repair')}catch(error){if(error.code!=='ENOENT')throw error}
  const prompt=createInterface({input:process.stdin,output:process.stdout}),code=(await prompt.question('一次性配对凭证：')).trim();prompt.close()
  const paired=await connection(config.server)('/pair',{code})
  await fs.writeFile(credentials,JSON.stringify({...paired,server:config.server}),{flag:'wx',mode:0o600})
 }else{
  const stop=new AbortController()
  for(const name of ['SIGINT','SIGTERM'])process.once(name,()=>stop.abort())
  if(process.send){process.on('message',m=>{if(m?.type==='studio-local-stop')stop.abort()});process.once('disconnect',()=>stop.abort())}
  try{await runConnection(args[1],{signal:stop.signal})}catch(error){const reasonCode=connectorFailureCode(error);if(process.connected)try{process.send?.({type:'studio-local-state',state:'failed',reasonCode},()=>{})}catch{}console.error(connectorFailureMessage(reasonCode));process.exitCode=1}
  finally{if(process.connected)process.disconnect()}
 }
}
