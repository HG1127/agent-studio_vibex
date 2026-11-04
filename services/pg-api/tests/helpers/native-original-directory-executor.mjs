// Executed only by the dedicated CI-owned child. The original journal, pairing,
// poll/lease/check/completion/recovery protocol and real filesystem runtime run.
import {requireOriginalDirectoryCi} from './native-original-directory-policy.mjs'
import {installOriginalDirectoryNetworkGuard} from './native-original-directory-network.mjs'
// Only the dedicated owned child releases its IPC, after Native/journal cleanup.
async function finishOriginalDirectoryExecutor(network,channel=process){
 try{
  if(!channel.connected||typeof channel.send!=='function')throw Error('original_directory_executor_ipc_required')
  await new Promise((resolve,reject)=>channel.send({event:'original_directory_executor_network',counts:network.snapshot()},failure=>failure?reject(Error('original_directory_executor_network_report_failed')):resolve()))
 }finally{try{network.restore()}finally{if(channel.connected)channel.disconnect()}}
}
function originalDirectoryExecutorStage(phase){try{process.send?.({event:'original_directory_executor_stage',phase},()=>{})}catch{}}
let network,phase='admission'
try{
 requireOriginalDirectoryCi()
 phase='network';network=installOriginalDirectoryNetworkGuard()
 phase='imports';originalDirectoryExecutorStage('imports')
const [{runNativeConnection},{nativeRequestPlan,readNativeResponse},{createRuntime},https,fs,path]=await Promise.all([import('../../../../local-executor/native-run.mjs'),import('../../../../local-executor/native-connection.mjs'),import('../../../../local-executor/runtime.mjs'),import('node:https'),import('node:fs/promises'),import('node:path')])
phase='argv'
const args=process.argv.slice(2);if(args.length!==2)throw Error('original_directory_child_exact_arguments_required');const [command,file]=args
if(!['pair','run','recover','commit-result'].includes(command)||!path.isAbsolute(file))throw Error('original_directory_child_command_refused')
phase='config'
const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o077)!==0||stat.size>8192)throw Error('original_directory_child_config_refused')
phase='scope'
const config=JSON.parse(await fs.readFile(file,'utf8')),server=new URL(config.server)
if(server.protocol!=='https:'||server.hostname!=='localhost'||!server.port||server.username||server.password||config.browser?.enabled!==false||config.office?.enabled!==false||config.mcpServers!==undefined||!Array.isArray(config.roots)||config.roots.length!==2)throw Error('original_directory_child_scope_refused')
phase='ca'
const ca=await fs.readFile(path.join(path.dirname(file),'credentials-directory-ca.pem')),stop=new AbortController()
process.once('SIGTERM',()=>stop.abort());process.once('SIGINT',()=>stop.abort())
const connectionFactory=(base,token)=>async(operation,body,signal)=>{
 phase='request-plan';const plan=nativeRequestPlan(base,operation,body,token,signal);if(plan.url.origin!==server.origin)throw Error('original_directory_child_origin_changed')
 phase='request';return new Promise((resolve,reject)=>{const req=https.request(plan.url,{...plan.options,ca,servername:'localhost',rejectUnauthorized:true,minVersion:'TLSv1.2'},res=>{phase='response';void readNativeResponse(res).then(resolve,reject)});req.once('error',reject);req.end(plan.bytes)})
}
phase='native';originalDirectoryExecutorStage('native')
 await runNativeConnection(command,file,{signal:stop.signal,connectionFactory,onState:state=>{if(state==='online')process.send?.({event:'original_directory_executor_online'})},runtimeFactory:async options=>{
  const real=await createRuntime(options),tools=real.tools.filter(t=>t.name==='files.list');if(tools.length!==1)throw Error('original_directory_actual_catalog_missing')
  return {tools,close:real.close,async execute(input,signal){if(input.tool!=='files.list')throw Error('original_directory_tool_refused');const result=await real.execute(input,signal);process.send?.({event:'original_directory_actual_list_completed'});return result}}
 }})
 originalDirectoryExecutorStage('settled')
}catch{try{process.send?.({event:'original_directory_executor_failure',phase},()=>{})}catch{}process.stderr.write('original_directory_owned_executor_failed:'+phase+'\n');process.exitCode=1}
finally{if(network){try{await finishOriginalDirectoryExecutor(network)}catch{process.stderr.write('original_directory_owned_executor_network_report_failed\n');process.exitCode=1}}}
