// Actual independent CLI process. Only called after the dedicated purpose
// guard, on disposable Linux CI and a newly owned synthetic directory.
import {requireNativeLocalDeviceGenuineCi} from './native-local-device-genuine-guard.mjs'
export async function nativeLocalChainCli(f,formOrigin){
 requireNativeLocalDeviceGenuineCi()
 const [fs,path,os,url,cp,{createRequire}]=await Promise.all([import('node:fs/promises'),import('node:path'),import('node:os'),import('node:url'),import('node:child_process'),import('node:module')])
 const repo=path.resolve(url.fileURLToPath(new URL('../../../../',import.meta.url))),parent=await fs.realpath(os.tmpdir()),dir=await fs.mkdtemp(path.join(parent,'native-local-chain-')),work=path.join(dir,'work'),children=new Set()
 const {chromium}=createRequire(import.meta.resolve('@playwright/mcp'))('playwright')
 await fs.mkdir(work);const ca=path.join(dir,'credentials-native-chain-ca.pem'),config=path.join(dir,'config.json'),credentials=path.join(dir,'credentials-native-chain.json')
 await fs.writeFile(ca,f.childTlsCa(),{flag:'wx',mode:0o600})
 await fs.writeFile(config,JSON.stringify({server:f.nativeOrigin,credentialsFile:path.basename(credentials),roots:[{name:'work',path:work}],office:{enabled:true},browser:{enabled:true,images:true,headless:true,executablePath:chromium.executablePath(),allowedOrigins:[formOrigin]}}),{flag:'wx',mode:0o600})
 const env={};for(const key of ['PATH','HOME','LANG','LC_ALL','TMPDIR','TEMP','TMP'])if(process.env[key]!==undefined)env[key]=process.env[key]
 env.NODE_EXTRA_CA_CERTS=ca // only this disposable CA; certificate verification remains enabled
 async function bounded(p,ms=30000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native_chain_owned_process_timeout')),ms)})])}finally{clearTimeout(timer)}}
 function start(command,input){const child=cp.spawn(process.execPath,[path.join(repo,'local-executor/native-run.mjs'),command,config],{cwd:repo,env,stdio:['pipe','pipe','pipe'],windowsHide:true});children.add(child);let outputBytes=0;for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{outputBytes+=b.length;if(outputBytes>65536)child.kill('SIGTERM')});const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{children.delete(child);resolve({code,signal})})});child.stdin.end(input);return{child,exited}}
 let online,deviceId
 return {dir,work,credentials,
  async pair(code){const p=start('pair',code+'\n'),result=await bounded(p.exited);if(result.code!==0)throw Error('native_chain_actual_pair_failed');const auth=JSON.parse(await fs.readFile(credentials,'utf8'));if(auth.stage!=='paired'||typeof auth.id!=='string')throw Error('native_chain_actual_pair_not_committed');deviceId=auth.id;online=start('run');return deviceId},
  deviceId:()=>deviceId,
  async assertOnline(){if(!online||!children.has(online.child))throw Error('native_chain_actual_cli_exited')},
  async localCredentialToken(){return JSON.parse(await fs.readFile(credentials,'utf8')).device_token},
  async close(){for(const child of children)child.kill('SIGTERM');await bounded(Promise.all([...children].map(child=>new Promise(resolve=>child.once('exit',resolve)))),10000).catch(()=>{});if(children.size){for(const child of children)child.kill('SIGKILL');await bounded(Promise.all([...children].map(child=>new Promise(resolve=>child.once('exit',resolve)))),5000)}if(children.size)throw Error('native_chain_owned_children_not_closed');if(path.dirname(await fs.realpath(dir))!==parent||!path.basename(dir).startsWith('native-local-chain-'))throw Error('native_chain_owned_directory_changed');await fs.rm(dir,{recursive:true,force:true})}
 }
}
