// Independent optional preflight only. There is deliberately no apply command.
import {localExecutorOperatorPlan,executorOperatorAbi as abi} from './native-local-executor-operator-plan.mjs'
export async function localExecutorServicePreflightMain(argv=process.argv.slice(2),env=process.env){
 if(argv.length!==1||!['--plan','--service-preflight'].includes(argv[0]))throw Error('native_local_executor_operator_mode_refused')
 if(argv[0]==='--plan')return localExecutorOperatorPlan()
 const keys=['AGENT_STUDIO_PG18_LOCAL_DEVICES_AVAILABLE','AGENT_STUDIO_PG18_LOCAL_DEVICES_WRITES_ENABLED','AGENT_STUDIO_PG18_LOCAL_DEVICES_APPROVED']
 if(keys.every(k=>env[k]===undefined))return {scope:'executor_optional_feature_disabled',database_opened:false,secrets_read:false,listener_started:false,production_cutover_allowed:false}
 if(process.platform!=='linux'||process.versions.node.split('.')[0]!=='24'||!Number.isSafeInteger(process.getuid?.())||process.getuid()<=0||env.CREDENTIALS_DIRECTORY!=='/run/credentials/'+abi.unit||env[abi.envKey]!==abi.serviceFile)throw Error('native_local_executor_service_context_refused')
 // Original configuration checks apply to the intended service configuration;
 // passing this pre-start check is never proof that an HTTP listener is live.
 const [{nativePg18ServerConfig},{selectNativePg18UatCapabilities},{selectNativeLocalDevices},{assertNativePg18Credential},fs,path]=await Promise.all([import('./native-server.ts'),import('./native-config-uat-policy.ts'),import('./native-local-device-runtime-policy.ts'),import('./native-credential-policy.ts'),import('node:fs'),import('node:path')])
 const cfg=nativePg18ServerConfig(env,process.platform,true),capabilities=selectNativePg18UatCapabilities(env,true,cfg.allowedOrigin),selection=selectNativeLocalDevices(env,true,cfg.allowedOrigin,capabilities.configurationWrites)
 if(selection.available!==true||!cfg.allowedOrigin.startsWith('https://'))throw Error('native_local_executor_service_context_refused')
 const dir=fs.lstatSync(path.dirname(abi.serviceFile)),before=fs.lstatSync(abi.serviceFile),uid=process.getuid();if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o022)!==0||![0,uid].includes(dir.uid)||before.nlink!==1||fs.realpathSync(abi.serviceFile)!==abi.serviceFile)throw Error('native_local_executor_secret_refused')
 let canRead=false;try{fs.accessSync(abi.serviceFile,fs.constants.R_OK);canRead=true}catch{}
 assertNativePg18Credential({name:abi.secret,file:abi.serviceFile,env,uid,stat:before,canRead})
 for(const name of ['api.secret','native-auth.secret','model-encryption.secret','model-broker.secret']){const file=path.join(path.dirname(abi.serviceFile),name);if(name==='model-broker.secret'&&!fs.existsSync(file))continue;const other=fs.lstatSync(file);if(!other.isFile()||other.isSymbolicLink()||other.dev===before.dev&&other.ino===before.ino)throw Error('native_local_executor_secret_not_independent')}
 const fd=fs.openSync(abi.serviceFile,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let raw
 try{raw=fs.readFileSync(fd);const open=fs.fstatSync(fd),after=fs.lstatSync(abi.serviceFile);if(['dev','ino','uid','gid','mode','size','mtimeMs','ctimeMs','nlink'].some(k=>before[k]!==open[k]||before[k]!==after[k])||raw.length!==before.size)throw Error('native_local_executor_secret_changed')}finally{fs.closeSync(fd)}
 let pool
 try{
  const password=raw.toString('utf8').replace(/\r?\n$/,'');if(!Buffer.from(password).equals(raw)&&!Buffer.from(password+'\n').equals(raw)||password.length<40||password.length>256||/[^!-~]/.test(password))throw Error('native_local_executor_secret_refused')
  const [{default:pg},{inspectNativeLocalExecutorPreflight}]=await Promise.all([import('pg'),import('./native-local-executor-service-preflight.ts')])
  pool=new pg.Pool({host:'127.0.0.1',port:5333,database:'agent_studio',user:abi.login,password,max:1,ssl:false,connectionTimeoutMillis:4000,statement_timeout:10000,query_timeout:12000});pool.on('error',()=>{})
  return await inspectNativeLocalExecutorPreflight({connect:()=>pool.connect()},{database:'agent_studio',port:5333})
 }finally{raw?.fill(0);if(pool)await pool.end()}
}
const {pathToFileURL}=await import('node:url')
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.stdout.write(JSON.stringify(await localExecutorServicePreflightMain())+'\n')}catch{process.stderr.write('native_local_executor_preflight_refused\n');process.exitCode=1}}
