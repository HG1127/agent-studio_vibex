// Root-private copies of ACTUAL original CLI stdout, captured at its original
// stage. Provenance only. No SQL, preparation retry, callback or runtime proof.
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {requireCompleteProfileFixtureCi,completeProfileCiBinding} from './pg18-complete-install-ci-guard.mjs'
import {completeProfileStageDescriptor,assertVerifiedCompleteProfileStage} from './pg18-complete-install-ci-stage.mjs'
import {readLivePrivate} from '../../src/pg18-full069-worker-live-trust.mjs'
import {parseWorkerHeartbeatControlJson} from '../../src/worker-heartbeat-activation-control-contract.ts'
import {finalBusinessLogins,finalPreparationKeys} from '../../src/pg18-full069-final-login-contract.mjs'
import {cActions,freeze,hex} from '../../src/pg18-full069-worker-live-contract.mjs'
import {finalPathCiPurpose,finalPathCiFail as fail} from './pg18-full069-final-path-ci-contract.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex'),files=new Set(['pg18-complete-service-cli.mjs','pg18-complete-review-worker-cli.mjs','pg18-complete-executor-cli.mjs','pg18-complete-review-stack-cli.mjs','pg18-complete-plan-workflow-cli.mjs','native-local-executor-service-preflight-cli.mjs','agent-assessment-service.ts','agent-plan-workflow-service.ts','bound-dispatch-server.ts','knowledge-index-service.ts'])
export function finalPathCiSidecarsEnabled(){const v=process.env.AGENT_STUDIO_FINAL13_PATH_CI_PURPOSE;if(v===undefined)return false;if(v!==finalPathCiPurpose)fail('new_purpose_required');requireCompleteProfileFixtureCi();return true}
function root(){if(!finalPathCiSidecarsEnabled())fail('sidecars_disabled');const permit=requireCompleteProfileFixtureCi(),b=completeProfileCiBinding(permit);if(b.kind!=='fixture')fail('fixture_required');return completeProfileStageDescriptor(permit).input}
function write(file,bytes){const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
function identity(file,args,env){const name=path.basename(file);if(!files.has(name)||!Array.isArray(args)||args.some(a=>typeof a!=='string'||a.length>256||/[\u0000-\u001f]/.test(a)))fail('capture_command');let key,operationId=null
 if(name==='pg18-complete-service-cli.mjs'){const action=args[args.indexOf('--action')+1];if(!cActions.includes(action))fail('capture_action');key='C8:'+action}
 else if(name==='pg18-complete-review-worker-cli.mjs')key='review_worker'
 else if(name==='pg18-complete-executor-cli.mjs')key='executor'
 else if(name==='pg18-complete-review-stack-cli.mjs')key='review_stack'
 else if(name==='pg18-complete-plan-workflow-cli.mjs')key='plan_workflow'
 else if(name==='native-local-executor-service-preflight-cli.mjs')key='executor_preflight'
 else if(name==='agent-assessment-service.ts')key=env.AGENT_STUDIO_PG18_DESIGN_EXECUTION_ENABLED==='true'?'design_'+args[1]+'_preflight':'review_'+args[1]+'_preflight'
 else if(name==='agent-plan-workflow-service.ts')key='plan_workflow_'+args[1]+'_preflight'
 else if(name==='bound-dispatch-server.ts')key='bound_broker_preflight'
 else key='knowledge_broker_preflight'
 if(finalPreparationKeys.includes(key)){const at=args.indexOf('--operation-id');operationId=args[at+1];if(at<0||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(operationId)||!['--prepare','--inspect-operation'].includes(args[0]))fail('capture_operation')}
 else if(args[0]!=='--preflight'&&args[0]!=='--service-preflight')fail('capture_mode')
 return {entry:name,key,operation_id:operationId,mode:args[0]}
}
export function classifyFinalPathCiCommand(file,args,env={}){return freeze({...identity(file,args,env),record_only:true,runtime_authorization:false,qualifies_run:false})}
export function captureFinalPathCiCommand(file,args,env,exit,stdout,discarded=false){
 if(!finalPathCiSidecarsEnabled()||exit!==0||!files.has(path.basename(file)))return null
 const item=identity(file,args,env),input=root(),dir=input+'/final-path-observations';if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o700||fs.realpathSync(dir)!==dir)fail('capture_directory')
 const metadata=fs.readdirSync(dir).filter(n=>/^[0-9]{5}\.metadata\.json$/.test(n)).sort(),sequence=metadata.length;if(sequence>127||metadata.some((n,i)=>n!==String(i).padStart(5,'0')+'.metadata.json'))fail('capture_sequence');const previous=sequence?readLivePrivate(dir+'/'+metadata.at(-1),{max:16384}).sha256:'0'.repeat(64),prefix=dir+'/'+String(sequence).padStart(5,'0');let output=null
 if(!discarded){const bytes=Buffer.isBuffer(stdout)?stdout:Buffer.from(stdout??'');if(bytes.length<2||bytes.length>16384||!bytes.toString('utf8').endsWith('\n')||!Buffer.from(bytes.toString('utf8')).equals(bytes))fail('capture_stdout');parseWorkerHeartbeatControlJson(bytes,16384);write(prefix+'.stdout.json',bytes);output={file:prefix+'.stdout.json',sha256:sha(bytes)}}else if(stdout!==null)fail('discarded_stdout_recovered')
 const record={format:'full069_final_path_original_cli_capture_v1',sequence,previous_sha256:previous,...item,exit_code:0,stdout:output,output_deliberately_discarded:discarded,captured_at:new Date().toISOString(),record_only:true,runtime_authorization:false,qualifies_run:false};write(prefix+'.metadata.json',Buffer.from(JSON.stringify(record)+'\n'));const fd=fs.openSync(dir,fs.constants.O_DIRECTORY|fs.constants.O_RDONLY);try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}return freeze(record)
}
export function readFinalPathCiSidecars(loaded){assertVerifiedCompleteProfileStage(loaded);if(root()!==loaded.stageInput)fail('sidecar_stage');const dir=root()+'/final-path-observations',names=fs.readdirSync(dir).filter(n=>n.endsWith('.metadata.json')).sort(),rows=[];let previous='0'.repeat(64)
 for(const[name,i]of names.map((n,i)=>[n,i])){if(name!==String(i).padStart(5,'0')+'.metadata.json')fail('sidecar_sequence');const r=readLivePrivate(dir+'/'+name,{max:16384}),v=parseWorkerHeartbeatControlJson(r.bytes,16384);if(v.format!=='full069_final_path_original_cli_capture_v1'||v.sequence!==i||v.previous_sha256!==previous||v.record_only!==true||v.runtime_authorization!==false||v.qualifies_run!==false||v.exit_code!==0)fail('sidecar_chain');if(v.stdout&&readLivePrivate(v.stdout.file,{max:16384}).sha256!==v.stdout.sha256)fail('sidecar_stdout_changed');previous=r.sha256;rows.push(v)}
 const choose=(key,mode)=>rows.filter(r=>r.key===key&&r.mode===mode).at(-1),prepared=finalPreparationKeys.map(key=>{const found=rows.filter(r=>r.key===key&&r.mode==='--prepare');if(found.length!==1)fail('twelve_original_preparations');return found[0]}),directories={review_worker:'review-worker-operation-records',executor:'executor-operation-records',review_stack:'review-stack-operation-records',plan_workflow:'plan-workflow-operation-records'}
 const preparations=prepared.map((r,i)=>{const journal=loaded.stageInput+'/'+(i<8?'service-operation-records':directories[r.key]),ref=suffix=>{const file=journal+'/'+r.operation_id+'.'+suffix+'.json';return {file,sha256:readLivePrivate(file,{max:16384}).sha256}},intent=ref('intent'),result=ref('result'),iv=parseWorkerHeartbeatControlJson(readLivePrivate(intent.file,{max:16384}).bytes,16384),rv=parseWorkerHeartbeatControlJson(readLivePrivate(result.file,{max:16384}).bytes,16384),observation=i>=7?choose(r.key,'--inspect-operation'):null;if(i>=7&&(!observation?.stdout||observation.operation_id!==r.operation_id))fail('original_observation_missing');return {key:r.key,operation_id:r.operation_id,source_sha256:iv.source_sha256,extension_source_sha256:r.key==='plan_workflow'?iv.plan_workflow_source_sha256:null,intent,result,observation:observation?.stdout??null,started_at:iv.started_at,completed_at:rv.completed_at,observation_completed_at:observation?.captured_at??null}})
 const preflights={};for(const key of['executor_preflight','design_worker_preflight','design_broker_preflight','plan_workflow_worker_preflight','plan_workflow_broker_preflight','bound_broker_preflight','knowledge_broker_preflight']){const r=rows.filter(r=>r.key===key&&r.stdout!==null).at(-1);if(!r)fail('original_preflight_missing');preflights[key]=r.stdout}
 const logins=Object.fromEntries(finalBusinessLogins.map(d=>[d.key,d.login]));if(Object.keys(logins).length!==14||preparations.length!==12)fail('sidecar_shape');return freeze({preparations,preflights,metadata_sha256:previous,source_only_record_provenance:true,runtime_authorization:false,qualifies_run:false})
}
