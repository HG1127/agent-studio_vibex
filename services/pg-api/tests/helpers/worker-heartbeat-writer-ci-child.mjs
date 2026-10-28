// Hosted CI child only. No target/Pool/driver/clock injection, no DB credential
// and no successful production capability is constructed from descriptor data.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {spawn,execFileSync} from 'node:child_process'
import {performance} from 'node:perf_hooks'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const kinds=['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment']
const units={prepare:'prepare',model:'model',workflow_safe:'workflow',workflow_v2:'workflow',agent_autonomous:'agent',knowledge_index:'knowledge-index',knowledge_query:'knowledge-index',assessment:'review-worker'}
const entry={prepare:'worker-loop.ts',model:'model-worker-loop.ts',workflow_safe:'workflow-worker-loop.ts',workflow_v2:'workflow-v2-worker-loop.ts',agent_autonomous:'autonomous-agent-worker-loop.ts',knowledge_index:'knowledge-index-service.ts',knowledge_query:'knowledge-index-service.ts',assessment:'agent-assessment-service.ts'}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'),sha=b=>createHash('sha256').update(b).digest('hex')
const refuse=()=>{throw Error('writer_ci_child_refused')},emit=value=>process.send?.(value)
const credential=kind=>'/run/credentials/agentstudio-pg18-'+units[kind]+'.service/telemetry-'+kind.replaceAll('_','-')+'.boot.json'
function safeChildEnv(env){for(const key of Object.keys(env))if(key.startsWith('NODE_')||/^PG[A-Z_]/.test(key)||/PROXY|TLS_REJECT|EXTRA_CA|DATABASE_URL/.test(key))refuse();return env}
async function launch(){
 // This is the unchanged real hosted-process fixture gate, not a replacement
 // Root controller capability. It precedes plan reads, mounts or UID changes.
 const {requireWorkerHeartbeatActivationControlCi,workerHeartbeatActivationControlCiDescriptor}=await import('./worker-heartbeat-activation-control-ci-guard.mjs')
 const proof=requireWorkerHeartbeatActivationControlCi(),ci=workerHeartbeatActivationControlCiDescriptor(proof),file=process.argv[3]
 const directory='/root/agentstudio-telemetry-writer-ci-'+ci.run+'-'+ci.attempt+'-',resolved=path.resolve(file??'')
 if(!resolved.startsWith(directory)||!/^plan-[a-f0-9-]{36}\.json$/.test(path.basename(resolved)))refuse()
 const st=fs.lstatSync(resolved),parent=fs.lstatSync(path.dirname(resolved))
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o600||st.nlink!==1||st.size>32768||parent.uid!==0||(parent.mode&0o7777)!==0o700||fs.realpathSync(resolved)!==resolved)refuse()
 const p=JSON.parse(fs.readFileSync(resolved,'utf8'))
 if(p.protocol!=='worker_heartbeat_writer_ci_launch_v1'||p.run!==ci.run||p.attempt!==ci.attempt||p.revision!==ci.source_revision||p.stage!==root||!['entry','component','access','plan'].includes(p.mode)||!p.kinds?.length||p.kinds.some(k=>!kinds.includes(k))||!Number.isSafeInteger(p.uid)||p.uid<=0||!p.groups.every(g=>Number.isSafeInteger(g)&&g>0)||sha(fs.readFileSync(fileURLToPath(import.meta.url)))!==p.child_sha256)refuse()
 // Separate private mount namespace is mandatory, never a host /run rewrite.
 if(fs.readlinkSync('/proc/self/ns/mnt')===p.parent_mount_namespace)refuse()
 const execute=(command,args)=>execFileSync(command,args,{env:{PATH:'/usr/sbin:/usr/bin:/bin',LANG:'C.UTF-8'},timeout:10000,stdio:['ignore','pipe','pipe'],windowsHide:true})
 execute('/usr/bin/mount',['--make-rprivate','/'])
 execute('/usr/bin/mount',['-t','tmpfs','-o','mode=0755,nosuid,nodev,noexec','writer-ci-credentials','/run/credentials'])
 for(const item of p.mounts){
  if(typeof item.source!=='string'||!item.source.startsWith('/var/lib/agentstudio-telemetry-control/worker-boots/')&&!item.source.startsWith(path.dirname(resolved)+'/business/')||!item.target.startsWith('/run/credentials/agentstudio-pg18-')||item.target.split('/').some(v=>v==='..'))refuse()
  const source=fs.lstatSync(item.source)
  const owner=item.owner_uid??p.uid
  if(!Number.isSafeInteger(owner)||owner<=0||!source.isFile()||source.isSymbolicLink()||source.uid!==owner||source.gid!==0||(source.mode&0o7777)!==0o400||source.nlink!==1||sha(fs.readFileSync(item.source))!==item.sha256)refuse()
  fs.mkdirSync(path.dirname(item.target),{mode:0o755,recursive:true});fs.writeFileSync(item.target,'',{mode:0o600,flag:'wx'})
  execute('/usr/bin/mount',['--bind',item.source,item.target]);execute('/usr/bin/mount',['-o','remount,bind,ro,nosuid,nodev,noexec',item.target])
  const current=fs.lstatSync(item.target);if(current.ino!==source.ino||current.dev!==source.dev||current.uid!==owner||(current.mode&0o7777)!==0o400)refuse()
 }
 const selected=p.kinds[0],env=safeChildEnv(p.env),args=p.mode==='entry'||p.mode==='plan'?[root+'/services/pg-api/src/'+entry[selected],...(p.mode==='plan'?['--plan']:['--serve',...(['knowledge_index','assessment'].includes(selected)?['worker']:[])])]:[fileURLToPath(import.meta.url),'--nonroot']
 if(!Number.isSafeInteger(p.gid)||p.gid<=0)refuse()
 const options=['--reuid='+p.uid,'--regid='+p.gid,...(p.groups.length?['--groups='+p.groups.join(',')]:['--clear-groups']),'--no-new-privs','--inh-caps=-all','--ambient-caps=-all','--bounding-set=-all',process.execPath,'--experimental-strip-types',...args]
 const child=spawn('/usr/bin/setpriv',options,{cwd:root,env,stdio:['pipe','pipe','pipe','ipc'],windowsHide:true})
 let bytes=0,stdout='';const capture=stream=>chunk=>{bytes+=chunk.length;if(bytes>65536){child.kill('SIGTERM');return}if(stream==='stdout'){stdout+=chunk.toString('utf8');const lines=stdout.split('\n');stdout=lines.pop();for(const line of lines)try{const v=JSON.parse(line);if(v.ready===true||v.state==='ready'||v.mode==='plan')emit({event:'entry_metadata',ready:v.ready===true||v.state==='ready',plan:v.mode==='plan',worker_started:v.worker_started===true,production_cutover_allowed:v.production_cutover_allowed})}catch{}}}
 child.stdout.on('data',capture('stdout'));child.stderr.on('data',capture('stderr'));child.on('message',m=>emit(m));process.on('message',m=>child.send?.(m));child.on('error',()=>emit({event:'child_failed'}))
 for(const signal of ['SIGTERM','SIGINT','SIGUSR1'])process.on(signal,()=>child.kill(signal))
 child.once('spawn',()=>{emit({event:'kernel_child_started',pid:child.pid,uid:p.uid,groups:p.groups,mode:p.mode});if(p.mode==='component'||p.mode==='access')child.send({mode:p.mode,kinds:p.kinds,access:p.access})})
 child.once('close',(code,signal)=>{emit({event:'kernel_child_exited',code,signal});process.exitCode=code??1;process.disconnect?.()})
}
async function nonroot(){
 if(process.platform!=='linux'||!process.getuid||process.getuid()<=0||process.getgroups().includes(0))refuse()
 const status=fs.readFileSync('/proc/self/status','utf8')
 for(const name of ['CapInh','CapPrm','CapEff','CapBnd','CapAmb'])if(!new RegExp('^'+name+':\\s+0+$','m').test(status))refuse()
 if(!/^NoNewPrivs:\s+1$/m.test(status))refuse()
 const initial=await new Promise(resolve=>process.once('message',resolve)),selected=initial.kinds
 if(!selected?.length||selected.some(k=>!kinds.includes(k)))refuse()
 if(initial.mode==='access'){
  const result=[]
  for(const kind of kinds){let readable=false;try{fs.accessSync(credential(kind),fs.constants.R_OK);readable=true}catch{}
   const connected=await new Promise(resolve=>{const socket=net.createConnection({path:'/run/agentstudio-telemetry-writers/'+kind+'/report.sock'}),finish=value=>{socket.destroy();resolve(value)};socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1000,()=>finish(false))})
   result.push({kind,readable,connected})
  }
  emit({event:'kernel_access',uid:process.getuid(),groups:process.getgroups(),result,no_new_privs:true,capabilities_zero:true});process.disconnect?.();return
 }
 const binding=await import('../../src/worker-heartbeat-worker-binding.ts'),life=await import('../../src/worker-heartbeat-worker-lifecycle.ts'),handles=new Map(),lifecycles=new Map()
 emit({event:'component_boot',uid:process.getuid(),groups:process.getgroups(),capabilities_zero:true,no_new_privs:true})
 process.on('message',async command=>{
  const id=command?.id
  try{
   if(command.op==='open_lifecycle'){
    const start=performance.now();for(const kind of selected)lifecycles.set(kind,await life.openWorkerHeartbeatWorkerLifecycle(kind))
    emit({event:'component_result',id,ok:true,elapsed_ms:Math.round(performance.now()-start),disabled_count:[...lifecycles.values()].filter(v=>v===null).length,component_only:true})
   }else if(command.op==='open_binding'){
    for(const kind of selected)handles.set(kind,await binding.openWorkerHeartbeatWorkerBinding(kind));emit({event:'component_result',id,ok:true,component_only:true})
   }else if(['startup','unavailable','drain','close'].includes(command.op)){
    for(const value of lifecycles.values())if(value){if(command.op==='startup')value.startupChecksComplete();if(command.op==='unavailable')value.loopUnavailable();if(command.op==='drain')value.newClaimsClosed();if(command.op==='close')value.close()}
    emit({event:'component_result',id,ok:true,component_only:true})
   }else if(command.op==='report'||command.op==='late_report'){
    const kind=command.kind??selected[0];if(!selected.includes(kind))refuse();const handle=handles.get(kind),generation=binding.describeWorkerHeartbeatWorkerBinding(handle).generation,abort=new AbortController(),start=performance.now()
    const work=binding.sendWorkerHeartbeatBoundReport(handle,{protocol:'native_worker_heartbeat_report_v1',generation,sequence:command.sequence,state:'ready',reason:'startup_checks_complete'},{signal:abort.signal,timeoutMs:5000,deadlineMonotonicMs:start+5000})
    let settled=false,accepted=false;void work.then(()=>{settled=true;accepted=true},()=>{settled=true})
    if(command.op==='late_report'){const end=performance.now()+6500;while(performance.now()<end){};await new Promise(r=>setTimeout(r,100));emit({event:'component_result',id,ok:true,settled,accepted,snapshot:binding.snapshotWorkerHeartbeatWorkerBinding(handle),actual_block_ms:Math.round(performance.now()-start),component_only:true})}
    else{await work;emit({event:'component_result',id,ok:true,snapshot:binding.snapshotWorkerHeartbeatWorkerBinding(handle),component_only:true})}
   }else if(command.op==='kernel_credential'){
    const kind=selected[0],file=credential(kind),st=fs.lstatSync(file);let readable=false;try{fs.accessSync(file,fs.constants.R_OK);readable=true}catch{}
    const mounts=fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').map(v=>v.split(' ')),mounted=mounts.find(v=>v[4]===file)
    emit({event:'component_result',id,ok:true,readable,owner_matches:st.uid===process.getuid(),mode0400:(st.mode&0o7777)===0o400,readonly:mounted?.[5].split(',').includes('ro')===true,component_only:true})
   }else if(command.op==='snapshot'){emit({event:'component_result',id,ok:true,snapshot:binding.snapshotWorkerHeartbeatWorkerBinding(handles.get(selected[0])),component_only:true})}
   else if(command.op==='rebind'){await binding.openWorkerHeartbeatWorkerBinding(selected[0]);emit({event:'component_result',id,ok:true,component_only:true})}
   else if(command.op==='exit'){for(const h of handles.values())binding.closeWorkerHeartbeatWorkerBinding(h);for(const l of lifecycles.values())l?.close();emit({event:'component_result',id,ok:true});process.disconnect?.()}
   else refuse()
  }catch(error){const code=Object.getOwnPropertyDescriptor(error??{},'code')?.value;emit({event:'component_result',id,ok:false,code:typeof code==='string'&&/^writer_/.test(code)?code:'refused'})}
 })
 emit({event:'component_ready'})
}
try{if(process.argv[2]==='--launch'&&process.argv.length===4)await launch();else if(process.argv[2]==='--nonroot'&&process.argv.length===3)await nonroot();else refuse()}catch{emit({event:'child_failed'});process.stderr.write('WRITER_CI_CHILD_REFUSED\n');process.exitCode=1;process.disconnect?.()}
