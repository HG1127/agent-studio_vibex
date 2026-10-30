// Root-only private mount supervisor. The application has no IPC descriptor,
// privileged groups/caps or other companion credential directory.
import fs from 'node:fs'
import path from 'node:path'
import {spawn,execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {openFull069FinalTrust,finalContext,assertFinalStable} from './pg18-full069-final-trust.mjs'
import {readLivePrivate,livePaths} from './pg18-full069-worker-live-trust.mjs'
import {finalCompanionDefinitions,finalCompanionBudgets,finalCompanionOwnData,finalCompanionFail as fail,checkFinalCompanionSpecs} from './pg18-full069-final-companion-contract.mjs'
import {readFinalCompanionKernelProcess} from './pg18-full069-final-companion-kernel.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex')
export const finalCompanionChildFile='pg18-full069-final-companion-child.mjs'
async function launch(){
 if(process.argv.length!==7||process.argv[2]!=='--launch'||!process.send||process.getuid?.()!==0||process.getgid?.()!==0||process.platform!=='linux')fail('child_entry')
 const[id,mode,nonce,recordSha]=process.argv.slice(3);if(!finalCompanionDefinitions.some(e=>e.id===id)||!['preflight','serve'].includes(mode)||!/^[-a-f0-9]{36}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(recordSha))fail('child_entry')
 const trust=await openFull069FinalTrust(true),ctx=finalContext(trust);assertFinalStable(trust);checkFinalCompanionSpecs(ctx.companions,ctx.base)
 const spec=ctx.companions.find(e=>e.id===id),file=path.join(livePaths.store,ctx.base.profile.run_id,'companion-'+id+'.json'),bound=readLivePrivate(file,{max:16384}),p=finalCompanionOwnData(JSON.parse(bound.bytes.toString('utf8')),['format','run_id','profile_sha256','source_sha256','id','spec_sha256','parent_pid','parent_start_ticks','parent_mount_namespace','nonce','allowed_modes']),parent=readFinalCompanionKernelProcess(process.ppid)
 if(bound.sha256!==recordSha||p.format!=='pg18_full069_final_companion_launch_v1'||p.run_id!==ctx.base.profile.run_id||p.profile_sha256!==ctx.profileSha256||p.source_sha256!==ctx.source.source_sha256||p.id!==id||p.spec_sha256!==sha(JSON.stringify(spec))||p.parent_pid!==process.ppid||p.parent_start_ticks!==parent.start_ticks||p.parent_mount_namespace!==parent.mount_namespace||p.parent_mount_namespace===fs.readlinkSync('/proc/self/ns/mnt')||p.nonce!==nonce||JSON.stringify(p.allowed_modes)!==JSON.stringify(['preflight','serve']))fail('child_binding')
 const command=(exe,args)=>execFileSync(exe,args,{env:{PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8'},timeout:10000,stdio:'ignore',windowsHide:true})
 command('/usr/bin/mount',['--make-rprivate','/']);command('/usr/bin/mount',['-t','tmpfs','-o','mode=0755,nosuid,nodev,noexec','full069-final-companion-credentials','/run/credentials']);fs.mkdirSync(spec.credential_directory,{mode:0o755});fs.chmodSync(spec.credential_directory,0o755)
 for(const m of spec.mounts){const source=readLivePrivate(m.source,{owner:spec.uid,mode:[0o400],max:2097152});if(source.sha256!==m.sha256)fail('child_mount_changed');const target=spec.credential_directory+'/'+m.leaf;fs.writeFileSync(target,'',{flag:'wx',mode:0o600});command('/usr/bin/mount',['--bind',m.source,target]);command('/usr/bin/mount',['-o','remount,bind,ro,nosuid,nodev,noexec',target]);const a=fs.lstatSync(m.source),b=fs.lstatSync(target);if(a.dev!==b.dev||a.ino!==b.ino||b.uid!==spec.uid||b.gid!==0||(b.mode&0o7777)!==0o400)fail('child_mount')}
 assertFinalStable(trust)
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',HOME:'/nonexistent',...spec.environment,CREDENTIALS_DIRECTORY:spec.credential_directory},filename=ctx.root+'/services/pg-api/src/'+spec.entry,args=mode==='preflight'?spec.preflight_args:spec.args
 const child=spawn('/usr/bin/setpriv',['--reuid='+spec.uid,'--regid='+spec.gid,'--clear-groups','--no-new-privs','--inh-caps=-all','--ambient-caps=-all','--bounding-set=-all',process.execPath,'--experimental-strip-types',filename,...args],{cwd:ctx.root+'/services/pg-api',env,stdio:['ignore','pipe','pipe'],windowsHide:true})
 let stdout=[],used=0,failed=false,closing=false,deadline
 const emit=value=>process.send?.({...value,id,mode,nonce})
 const stop=()=>{if(closing)return;closing=true;child.kill('SIGTERM');deadline=setTimeout(()=>child.kill('SIGKILL'),finalCompanionBudgets.drain_ms+finalCompanionBudgets.force_ms);deadline.unref()}
 const bad=()=>{if(failed)return;failed=true;emit({event:'companion_failed'});stop()}
 child.once('error',bad);child.once('spawn',()=>emit({event:'companion_started',pid:child.pid}))
 child.stdout.on('data',b=>{used+=b.length;if(used>finalCompanionBudgets.max_output_bytes)return bad();stdout.push(b);if(mode==='serve'&&id==='plan_workflow_worker')emit({event:'companion_worker_output',text:Buffer.concat(stdout).toString('utf8')})})
 child.stderr.on('data',b=>{used+=b.length;if(used>finalCompanionBudgets.max_output_bytes)bad()})
 process.on('SIGTERM',stop);process.on('SIGINT',stop);process.on('disconnect',stop)
 child.once('close',(code,signal)=>{if(deadline)clearTimeout(deadline);emit({event:'companion_closed',code,signal,stdout:Buffer.concat(stdout).toString('utf8'),failed});process.exitCode=!failed&&code===0&&signal===null?0:1;process.disconnect?.()})
}
if(process.argv[1]?.endsWith('/pg18-full069-final-companion-child.mjs'))try{await launch()}catch{process.send?.({event:'companion_failed'});process.stderr.write('FULL069_FINAL_COMPANION_CHILD_REFUSED\n');process.exitCode=1;process.disconnect?.()}
