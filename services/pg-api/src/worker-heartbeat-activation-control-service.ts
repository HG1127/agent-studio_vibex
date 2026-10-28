// Dedicated fixed-path entry. Importing this module performs no service I/O.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {openWorkerHeartbeatActivationControl,serveWorkerHeartbeatActivationControl,closeWorkerHeartbeatActivationControl} from './worker-heartbeat-activation-control.ts'
import {sendWorkerHeartbeatOperatorCommand} from './worker-heartbeat-activation-control-client.ts'
import {parseWorkerHeartbeatControlCommand,WorkerHeartbeatControlError} from './worker-heartbeat-activation-control-contract.ts'

export async function runWorkerHeartbeatActivationControlService():Promise<void>{
 const args=process.argv.slice(2)
 if(args.length===1&&args[0]==='serve'){
  const control=await openWorkerHeartbeatActivationControl();let stopping=false
  const stop=()=>{if(stopping)return;stopping=true;void closeWorkerHeartbeatActivationControl(control).catch(()=>{process.exitCode=1})}
  process.once('SIGTERM',stop);process.once('SIGINT',stop)
  try{await serveWorkerHeartbeatActivationControl(control)}catch(error){process.off('SIGTERM',stop);process.off('SIGINT',stop);await closeWorkerHeartbeatActivationControl(control).catch(()=>{});throw error}
  return
 }
 const op=args[0],command=parseWorkerHeartbeatControlCommand(op==='inspect'||op==='stop'?args.length===1?{op}:{}:op==='resume_publication'?args.length===3?{op,action_id:args[1],recovered_action_id:args[2]}:{}:args.length===2?{op,action_id:args[1]}:{})
 const result=await sendWorkerHeartbeatOperatorCommand(command);process.stdout.write(JSON.stringify(result)+'\n')
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 void runWorkerHeartbeatActivationControlService().catch(error=>{process.stderr.write(JSON.stringify({error:error instanceof WorkerHeartbeatControlError?error.code:'control_io_failed',automatic_retry_authorized:false})+'\n');process.exitCode=1})
}
