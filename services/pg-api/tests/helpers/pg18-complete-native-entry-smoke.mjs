// Hosted synthetic CI only: launch the UNMODIFIED native-server.ts --serve as
// non-root with its exact credential directory. This harness supplies TLS only;
// it cannot replace authentication, repositories, catalog audits or handlers.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import {spawn,execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {requireCompleteProfileFixtureCi} from './pg18-complete-install-ci-guard.mjs'
import {assertVerifiedCompleteProfileStage} from './pg18-complete-install-ci-stage.mjs'
const fail=code=>{throw Error('complete_service_native_entry_'+code)},sha=b=>createHash('sha256').update(b).digest('hex')
const credentials='/run/credentials/agentstudio-pg18-native.service',uid=65534,gid=65534,port=17403,tlsPort=17443,origin='https://127.0.0.1:'+tlsPort
const privateMode=(file,mode)=>{const s=fs.lstatSync(file);if(s.isSymbolicLink()||s.uid!==0||s.gid!==0||(s.mode&0o022)!==0||(s.mode&0o7777)!==mode)fail('private_root_path')}
export async function runOriginalNativeEntrySmoke(loaded,inputs){
 requireCompleteProfileFixtureCi();assertVerifiedCompleteProfileStage(loaded)
 if(!/^[a-f0-9]{64}$/.test(loaded.stageNonce)||!inputs||Object.keys(inputs).sort().join(',')!=='api,auth,employeePassword,modelKey'||!['api','auth'].every(k=>/^[a-f0-9]{80}$/.test(inputs[k]))||!/^[a-f0-9]{64}$/.test(inputs.modelKey)||typeof inputs.employeePassword!=='string')fail('inputs')
 const dest='/var/lib/agentstudio-complete-service-'+loaded.stageNonce,cert=loaded.stageInput+'/native-entry.crt',key=loaded.stageInput+'/native-entry.key'
 if(fs.existsSync(dest)||fs.existsSync(credentials)||fs.existsSync(key)||fs.existsSync(cert))fail('existing_runtime_or_credentials')
 // Both absolute destinations are fixed new CI-owned paths, not user input.
 for(const parent of ['/','/var','/var/lib','/run'])privateMode(parent,0o755)
 if(!fs.existsSync('/run/credentials'))fs.mkdirSync('/run/credentials',{mode:0o755})
 privateMode('/run/credentials',0o755)
 let app,proxy,createdRuntime=false,createdCredentials=false,closed=false,resolveClose,stdout='',bytes=0,listening=false,startRefused=false
 const closePromise=new Promise(done=>{resolveClose=done})
 try{
  fs.mkdirSync(dest,{mode:0o755});createdRuntime=true
  const copy=(from,to)=>{for(const name of fs.readdirSync(from).sort()){
   const source=path.join(from,name),target=path.join(to,name),s=fs.lstatSync(source)
   if(s.isSymbolicLink()||s.uid!==0||s.gid!==0||(s.mode&0o022)!==0)fail('source_metadata')
   if(s.isDirectory()){fs.mkdirSync(target,{mode:0o755});copy(source,target);fs.chmodSync(target,0o555)}
   else if(s.isFile()&&s.nlink===1){const b=fs.readFileSync(source);fs.writeFileSync(target,b,{flag:'wx',mode:0o444});if(sha(fs.readFileSync(target))!==sha(b))fail('source_copy')}
   else fail('source_kind')
  }};copy(loaded.tree,dest);fs.chmodSync(dest,0o555)
  for(const p of loaded.complete.manifest.sources)if(sha(fs.readFileSync(dest+'/'+p.path))!==p.sha256)fail('source_binding')
  fs.mkdirSync(credentials,{mode:0o700});createdCredentials=true
  fs.chownSync(credentials,uid,gid)
  for(const [name,value]of Object.entries({'api.secret':inputs.api,'native-auth.secret':inputs.auth,'model-encryption.secret':inputs.modelKey})){
   const file=credentials+'/'+name,fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,0o400)
   try{fs.writeFileSync(fd,value);fs.fchownSync(fd,uid,gid);fs.fchmodSync(fd,0o400);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  }
  const childEnv={PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',HOME:'/nonexistent',CREDENTIALS_DIRECTORY:credentials,AGENT_STUDIO_PG_NATIVE_PILOT_ENABLED:'true',AGENT_STUDIO_PG_NATIVE_REVIEWED:'true',AGENT_STUDIO_PG_PILOT_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:'true',AGENT_STUDIO_PG_HOST:'127.0.0.1',AGENT_STUDIO_PG_PORT:'5333',AGENT_STUDIO_PG_DATABASE:'agent_studio',AGENT_STUDIO_PG_USER:'agentstudio_stage_login',AGENT_STUDIO_PG_NATIVE_AUTH_USER:'agentstudio_native_login',AGENT_STUDIO_PG_PASSWORD_FILE:credentials+'/api.secret',AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE:credentials+'/native-auth.secret',AGENT_STUDIO_PG_MODEL_ENCRYPTION_KEY_FILE:credentials+'/model-encryption.secret',AGENT_STUDIO_INTERNAL_APP_ORIGIN:origin,AGENT_STUDIO_PG_NATIVE_API_PORT:String(port)}
  app=spawn(process.execPath,['--experimental-strip-types',dest+'/services/pg-api/src/native-server.ts','--serve'],{cwd:dest+'/services/pg-api',env:childEnv,uid,gid,detached:true,stdio:['ignore','pipe','pipe'],windowsHide:true})
  app.once('error',()=>{closed=true;startRefused=true;resolveClose()});app.once('close',()=>{closed=true;resolveClose()})
  app.stdout.on('data',b=>{bytes+=b.length;if(bytes>65536){startRefused=true;app.kill('SIGTERM');return}stdout+=b;for(const line of stdout.split('\n')){let r;try{r=JSON.parse(line)}catch{continue}if(r.service==='agentstudio-pg18-native-pilot'&&r.state==='listening'&&r.bind==='127.0.0.1'&&r.port===port&&r.workers_started===false&&r.production_cutover_allowed===false&&r.config_uat_write_enabled===false&&r.employee_uat_enabled===false)listening=true}})
  // Retain only a closed startup result. Never echo stderr/driver messages.
  app.stderr.on('data',b=>{bytes+=b.length;if(bytes>65536){startRefused=true;app.kill('SIGTERM')}if(b.toString('utf8').includes('native_server_start_refused'))startRefused=true})
  const until=Date.now()+45000
  while(Date.now()<until&&!listening&&!closed&&!startRefused)await new Promise(done=>setTimeout(done,100))
  if(!listening||closed||startRefused)fail('actual_serve_start_refused')
  execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},timeout:20000,stdio:'ignore',windowsHide:true})
  fs.chmodSync(key,0o600);fs.chmodSync(cert,0o600)
  const ca=fs.readFileSync(cert)
  proxy=https.createServer({key:fs.readFileSync(key),cert:ca,minVersion:'TLSv1.2'},(req,res)=>{
   const upstream=http.request({host:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers,agent:false,timeout:10000},remote=>{res.writeHead(remote.statusCode,remote.headers);remote.pipe(res)})
   upstream.once('timeout',()=>upstream.destroy());upstream.once('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(upstream)
  })
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(tlsPort,'127.0.0.1',resolve)})
  const request=(method,p,body,cookie,extra={})=>new Promise((resolve,reject)=>{
   const bytes=body===undefined?null:Buffer.from(JSON.stringify(body)),headers={Origin:origin,'X-AgentStudio-Request':'1',...extra,...(bytes?{'Content-Type':'application/json','Content-Length':String(bytes.length)}:{}),...(cookie?{Cookie:cookie}:{})}
   const req=https.request(origin+p,{method,headers,ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,timeout:10000},res=>{const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>131072){res.destroy();return}chunks.push(b)});res.once('end',()=>{let value;try{value=JSON.parse(Buffer.concat(chunks))}catch{return reject(Error('complete_service_native_entry_response_shape'))}resolve({status:res.statusCode,headers:res.headers,value})});res.once('error',reject)})
   req.once('timeout',()=>req.destroy());req.once('error',reject);req.end(bytes??undefined)
  })
  let r=await request('GET','/api/native-auth/me');if(r.status!==401)fail('anonymous_refusal')
  r=await request('POST','/api/native-auth/login',{email:'full069-synthetic@example.invalid',password:inputs.employeePassword},null,{Origin:'https://untrusted.invalid'});if(r.status!==403)fail('origin_refusal')
  r=await request('POST','/api/native-auth/login',{email:'full069-synthetic@example.invalid',password:inputs.employeePassword})
  if(r.status!==200||r.value.authenticated!==true||r.value.role!=='admin')fail('original_login')
  const line=r.headers['set-cookie']?.find(v=>v.startsWith('__Host-agentstudio_session='))
  if(typeof line!=='string'||!/; Secure(?:;|$)/i.test(line)||!/; HttpOnly(?:;|$)/i.test(line)||!/; SameSite=Strict(?:;|$)/i.test(line)||!/; Path=\/(?:;|$)/i.test(line))fail('session_cookie_policy')
  const cookie=line.split(';')[0]
  r=await request('GET','/api/native-auth/me',undefined,cookie);if(r.status!==200||r.value.authenticated!==true||r.value.user?.is_admin!==true)fail('original_profile')
  r=await request('GET','/api/native-auth/capabilities',undefined,cookie);if(r.status!==200||r.value.run_execution_enabled!==false)fail('original_capabilities')
  r=await request('POST','/api/native-auth/logout',{},cookie);if(r.status!==200||r.value.ok!==true)fail('original_logout')
  r=await request('GET','/api/native-auth/me',undefined,cookie);if(r.status!==401)fail('original_revocation')
  return {original_native_server_cli:true,mode:'--serve',nonroot_uid:uid,real_api_and_native_auth_logins_consumed:true,real_first_admin_https_login:true,secure_host_cookie:true,original_logout_revoked:true,configuration_writes_enabled:false,other_five_logins_proven_by_separate_actual_preparation_checks:true,other_five_runtimes_started:false,workers_started:false,production_GO:false}
 }finally{
  if(proxy)await new Promise(done=>proxy.close(done))
  if(app&&!closed){app.kill('SIGTERM');await Promise.race([closePromise,new Promise(done=>setTimeout(done,5000))]);if(!closed){app.kill('SIGKILL');await closePromise}}
  // Only directories this invocation created; the exact fixed credential path
  // was required absent. No pre-existing file, account or service is removed.
  if(createdCredentials)fs.rmSync(credentials,{recursive:true})
  if(createdRuntime)fs.rmSync(dest,{recursive:true})
 }
}
