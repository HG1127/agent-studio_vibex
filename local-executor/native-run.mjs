#!/usr/bin/env node
// Explicit local CLI only. Does not start an API, DB or external worker service.
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {createInterface} from 'node:readline/promises'
import {setTimeout as sleep} from 'node:timers/promises'
import {createRuntime} from './runtime.mjs'
import {nativeConnection,nativeServer,pairReply,completionReply} from './native-connection.mjs'
import {localObject,localId,localSha,parseLocalCatalog,parseLocalInput,parseLocalResult} from '../shared/native-local-device-contract.mjs'
const args=process.argv.slice(2)
if(args.length!==2||!['pair','pair-confirm','pair-commit','run','recover','commit-result'].includes(args[0]))throw Error('Usage: node local-executor/native-run.mjs <pair|pair-confirm|pair-commit|run|recover|commit-result> <config.json>')
const configPath=path.resolve(args[1]),config=JSON.parse(await fs.readFile(configPath,'utf8')),server=nativeServer(config.server)
const requestedCredentials=path.resolve(path.dirname(configPath),config.credentialsFile||'.local-device-credentials.json')
const credentialName=path.basename(requestedCredentials)
if(credentialName!=='.local-device-credentials.json'&&!/^credentials[A-Za-z0-9._-]{0,80}$/.test(credentialName))throw Error('native_local_credentials_filename_must_be_protected')
const credentialDirectory=await fs.realpath(path.dirname(requestedCredentials)),credentials=path.join(credentialDirectory,credentialName)
const fileKey=createHash('sha256').update(process.platform==='win32'?credentials.toLowerCase():credentials).digest('hex').slice(0,24)
// Every persistent/temporary secret-bearing filename is globally excluded by
// the runtime protectedPart rule, even across two configured local executors.
const journal=path.join(credentialDirectory,'credentials-native-'+fileKey+'.journal.json'),lockFile=path.join(credentialDirectory,'credentials-native-'+fileKey+'.lock')
if([credentials,journal,lockFile].includes(configPath))throw Error('native_local_configuration_collision')
async function privateFile(file){const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>1500000||process.platform!=='win32'&&(s.mode&0o077)!==0)throw Error('native_local_private_file_required');return s}
async function read(file){await privateFile(file);return JSON.parse(await fs.readFile(file,'utf8'))}
async function save(file,value,{fresh=false}={}){
 const data=JSON.stringify(value);if(Buffer.byteLength(data)>1500000)throw Error('native_local_journal_limit')
 if(fresh){const f=await fs.open(file,'wx',0o600);try{await f.writeFile(data);await f.sync()}finally{await f.close()}return}
 // This fixed prefix is excluded by the ORIGINAL runtime protectedPart rule,
 // including orphan temp files after a crash. Never suffix a custom token
 // filename in a way that makes a leftover readable through files.read.
 await privateFile(file);const temporary=path.join(path.dirname(file),'credentials-native-write-'+randomUUID()+'.tmp'),f=await fs.open(temporary,'wx',0o600)
 try{await f.writeFile(data);await f.sync()}finally{await f.close()}await fs.rename(temporary,file)
}
// A second executor must not use the same local token/journal concurrently.
const lock=await fs.open(lockFile,'wx',0o600);await lock.writeFile(String(process.pid));await lock.sync()
try{
 if(args[0]==='pair'){
  const prompt=createInterface({input:process.stdin,output:process.stdout});let code
  try{code=(await prompt.question('粘贴员工设备页生成的五分钟配对短码：')).trim()}finally{prompt.close()}
  if(!/^[a-f0-9]{48}$/.test(code))throw Error('native_local_pairing_code_invalid')
  const pending={protocol:'native_local_credentials_v1',server,stage:'pair_pending',request_id:randomUUID(),pairing_code:code,device_token:randomBytes(32).toString('hex')}
  // Persist the only device token before any network side effect. Never replace
  // an existing file on pair or after an ambiguous acknowledgement.
  await save(credentials,pending,{fresh:true})
  const r=pairReply(await nativeConnection(server)('pair',{request_id:pending.request_id,pairing_code:code,device_token:pending.device_token}),pending.request_id)
  await save(credentials,{protocol:pending.protocol,server,stage:'paired',id:localId(r.id),device_token:pending.device_token});console.log('已配对。请核对本地目录、应用、网站和桌面范围后运行。')
 }else{
  const auth=await read(credentials);if(auth.protocol!=='native_local_credentials_v1'||auth.server!==server)throw Error('native_local_credentials_mismatch');localSha(auth.device_token)
  if(args[0]==='pair-confirm'||args[0]==='pair-commit'){
   if(auth.stage!=='pair_pending')throw Error('native_local_pair_not_pending')
   const r=pairReply(await nativeConnection(server)(args[0]==='pair-confirm'?'pair-confirm':'pair',{request_id:localId(auth.request_id),pairing_code:auth.pairing_code,device_token:auth.device_token}),auth.request_id)
   await save(credentials,{protocol:auth.protocol,server,stage:'paired',id:localId(r.id),device_token:auth.device_token});console.log('原配对请求已确认。')
  }else{
   if(auth.stage!=='paired')throw Error('native_local_pair_confirmation_required');localId(auth.id);const api=nativeConnection(server,auth.device_token)
   let state;try{state=await read(journal)}catch(e){if(e.code!=='ENOENT')throw e;state={protocol:'native_local_journal_v1',device_id:auth.id,server,stage:'idle'};await save(journal,state,{fresh:true})}
   if(state.protocol!=='native_local_journal_v1'||state.device_id!==auth.id||state.server!==server)throw Error('native_local_journal_mismatch')
   const base={protocol:state.protocol,device_id:state.device_id,server}
   if(args[0]==='recover'||args[0]==='commit-result'){
    if(state.stage!=='completion_pending')throw Error('native_local_no_completion_to_recover')
    const r=completionReply(await api(args[0]==='recover'?'confirm':'complete',state.completion),state.completion)
    await save(journal,{...base,stage:'idle',last_receipt:r});console.log('原任务完成回执已确认；未执行任务。')
   }else{
    if(['executing','completion_pending'].includes(state.stage))throw Error(state.stage==='executing'?'native_local_effect_started_unknown_do_not_replay':'native_local_completion_recovery_required')
    const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort())
    const deniedPaths=await Promise.all([credentials,journal,lockFile,configPath].map(file=>fs.realpath(file)))
    const runtime=await createRuntime({...config,deniedPaths})
    try{
     const catalog=parseLocalCatalog(runtime.tools.map(t=>({...t,description:String(t.description??'').slice(0,600)})));console.log('本机执行器在线；每个动作须经员工确认。Ctrl+C 停止。')
     while(!stop.signal.aborted){
      if(state.stage!=='poll_pending'){state={...base,stage:'poll_pending',claim:randomBytes(32).toString('hex')};await save(journal,state)}
      let reply
      try{reply=await api('poll',{catalog,claim:localSha(state.claim)},stop.signal)}catch(e){if(stop.signal.aborted)break;if(e.status===403||e.status===409)throw e;await sleep(1500,undefined,{signal:stop.signal}).catch(()=>{});continue}
      localObject(reply,['job']);if(reply.job===null){state={...base,stage:'idle'};await save(journal,state);await sleep(1500,undefined,{signal:stop.signal}).catch(()=>{});continue}
      const job=localObject(reply.job,['id','input','deadline_ms']);localId(job.id);parseLocalInput(job.input)
      const remaining=job.deadline_ms-Date.now();if(!Number.isSafeInteger(job.deadline_ms)||remaining<=0||remaining>125000)throw Error('native_local_invalid_deadline')
      const controller=new AbortController(),signal=AbortSignal.any([stop.signal,controller.signal,AbortSignal.timeout(Math.min(65000,remaining))])
      const active=await api('check',{id:job.id,claim:state.claim},signal);localObject(active,['active']);if(active.active!==true)throw Error('native_local_claim_inactive')
      // Once this durable marker exists, process restart will never execute
      // this effect again, even if the previous process died before POSTing.
      state={...base,stage:'executing',claim:state.claim,id:job.id};await save(journal,state)
      let running=true
      const checking=(async()=>{while(running&&!signal.aborted){await sleep(1000,undefined,{signal}).catch(()=>{});if(!running||signal.aborted)break;try{const check=await api('check',{id:job.id,claim:state.claim},signal);localObject(check,['active']);if(check.active!==true)controller.abort()}catch{controller.abort()}}})()
      let result,ok=true
      try{result=parseLocalResult(await runtime.execute(job.input,signal))}catch{ok=false;result={text:'本机工具未返回可确认的成功结果。请检查设备和原任务记录；不要自动重试已开始动作。',images:[]}}finally{running=false;controller.abort();await checking}
      const completion={request_id:randomUUID(),id:job.id,claim:state.claim,ok,result}
      state={...base,stage:'completion_pending',completion};await save(journal,state)
      // Completion transfer is independent of action cancellation. It carries
      // the original journal UUID and NEVER invokes the runtime a second time.
      const r=completionReply(await api('complete',completion),completion)
      state={...base,stage:'idle',last_receipt:r};await save(journal,state)
     }
    }finally{await runtime.close()}
   }
  }
 }
}finally{await lock.close();await fs.unlink(lockFile)}
