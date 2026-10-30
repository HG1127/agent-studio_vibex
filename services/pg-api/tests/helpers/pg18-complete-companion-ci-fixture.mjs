// Branded CI deployment. B/Root synthetic setup may use the returned read-only
// view to create signed profiles/Telemetry; only this private handle can run
// or remove our deployed tree/network resources. No setup callback is trusted.
import fs from 'node:fs'
import path from 'node:path'
import {spawn,execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {setTimeout as delay} from 'node:timers/promises'
import {requireCompleteProfileFixtureCi} from './pg18-complete-install-ci-guard.mjs'
import {ownedCompleteProfilePool,assertOwnedCompleteProfileCohort} from './pg18-complete-install-ci-containers.mjs'
import {assertCompleteCompanionCiStage} from './pg18-complete-companion-ci-stage.mjs'
import {companionCiPurpose,companionCiF05Purpose,companionCiSpecs,companionCiAccountLeaves,companionCiReportShape,companionCiFail as fail} from './pg18-complete-companion-ci-contract.mjs'
import {inspectFinalCompanionNetworkPolicy} from '../../src/pg18-full069-final-companion-contract.mjs'
import {finalBusinessLogins} from '../../src/pg18-full069-final-login-contract.mjs'
const contexts=new WeakMap(),sha=b=>createHash('sha256').update(b).digest('hex'),env={PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8'}
function state(handle){const s=contexts.get(handle);if(!s||s.closed)fail('untrusted_deployment');return s}
function admission(loaded,target){const permit=requireCompleteProfileFixtureCi();if(process.env.AGENT_STUDIO_COMPANION_CI_PURPOSE!==companionCiPurpose||process.env.AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE!==companionCiF05Purpose)fail('new_purpose_required');assertOwnedCompleteProfileCohort(permit,loaded,target);assertCompleteCompanionCiStage(loaded.companionCi)}
function write(file,bytes,mode){const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,mode);try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,mode);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
function tool(exe,args){return execFileSync(exe,args,{env,encoding:'utf8',timeout:10000,maxBuffer:1048576,windowsHide:true})}
function uidAbsent(){const uids=new Set(companionCiSpecs.map(s=>s.uid));for(const f of ['/etc/passwd','/etc/group'])for(const line of fs.readFileSync(f,'utf8').split('\n'))if(line&&uids.has(Number(line.split(':')[2])))fail('uid_in_use');for(const p of fs.readdirSync('/proc'))if(/^[1-9][0-9]*$/.test(p))try{const text=fs.readFileSync('/proc/'+p+'/status','utf8'),m=/^Uid:[\t ]*([0-9\t ]+)$/m.exec(text);if(m&&m[1].trim().split(/\s+/).some(v=>uids.has(Number(v))))fail('uid_in_use')}catch(e){if(fs.existsSync('/proc/'+p))throw e}}
async function target(s){admission(s.loaded,s.target);const p=await ownedCompleteProfilePool(s.target,1);try{const core=await s.loaded.from('services/pg-api/src/pg18-complete-service-core.mjs');await core.completeServiceTarget(p,s.binding)}finally{await p.end()}}
function ownedNodeInput(){
 const name=process.execPath,a=fs.lstatSync(name),keys=['dev','ino','size','mtimeMs','ctimeMs','uid','gid','mode','nlink']
 if(!a.isFile()||a.isSymbolicLink()||a.size<4||a.size>268435456||(a.mode&0o111)===0||fs.realpathSync(name)!==name)fail('node_input_file')
 const fd=fs.openSync(name,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const opened=fs.fstatSync(fd);if(keys.some(k=>a[k]!==opened[k]))fail('node_input_changed');const bytes=fs.readFileSync(fd),last=fs.fstatSync(fd),current=fs.lstatSync(name);if(bytes.length!==a.size||keys.some(k=>a[k]!==last[k]||a[k]!==current[k])||!bytes.subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46])))fail('node_input_changed');return {bytes,input:Object.freeze({uid:a.uid,gid:a.gid,mode:(a.mode&0o7777).toString(8),links:a.nlink,stable_read:true})}}finally{fs.closeSync(fd)}
}
function deployed(s){
 admission(s.loaded,s.target);const root=fs.lstatSync(s.root)
 if(!root.isDirectory()||root.isSymbolicLink()||root.dev!==s.directory.dev||root.ino!==s.directory.ino||root.uid!==0||root.gid!==0||(root.mode&0o7777)!==0o555||fs.realpathSync(s.root)!==s.root)fail('deployed_directory_changed')
 for(const r of [...s.records,{path:'node24',sha256:s.nodeSha}]){
  const name=s.root+'/'+r.path,a=fs.lstatSync(name),mode=r.path==='node24'?0o555:0o444
  if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1||a.uid!==0||a.gid!==0||(a.mode&0o7777)!==mode||fs.realpathSync(name)!==name||sha(fs.readFileSync(name))!==r.sha256)fail('deployed_file_changed')
  let dir=path.dirname(name);while(dir!==s.root){const d=fs.lstatSync(dir);if(!d.isDirectory()||d.isSymbolicLink()||d.uid!==0||d.gid!==0||(d.mode&0o7777)!==0o555)fail('deployed_directory_changed');dir=path.dirname(dir)}
 }
}
export async function prepareCompleteCompanionCiDeployment(loaded,ownedTarget){
 admission(loaded,ownedTarget);const handle=Object.freeze(Object.create(null)),s={loaded,target:ownedTarget,binding:{system_identifier:ownedTarget.systemIdentifier,database_oid:ownedTarget.databaseOid},root:'/var/lib/agentstudio-full069-final-companion-ci-'+loaded.stageNonce,node:null,nodeSha:null,records:[],directory:null,network:[],closed:false,running:false,ran:false};contexts.set(handle,s)
 try{
  await target(s);for(const p of ['/','/var','/var/lib']){const a=fs.lstatSync(p);if(!a.isDirectory()||a.isSymbolicLink()||a.uid!==0||a.gid!==0||(a.mode&0o7777)!==0o755)fail('deployment_parent')}
  if(fs.existsSync(s.root))fail('deployment_exists');fs.mkdirSync(s.root,{mode:0o755});fs.chmodSync(s.root,0o755);const a=fs.lstatSync(s.root);s.directory={dev:a.dev,ino:a.ino}
  const runtimeFile=loaded.stageInput+'/runtime-manifest.json',runtime=fs.readFileSync(runtimeFile);if(sha(runtime)!==process.env.AGENT_STUDIO_COMPLETE_PROFILE_CI_RUNTIME_MANIFEST_SHA256)fail('runtime_manifest_changed');const manifest=JSON.parse(runtime),expected=new Map([...loaded.companionCi.manifest.application_files,...loaded.companionCi.manifest.harness_files,...manifest.files].map(r=>[r.path,r.sha256]))
  for(const n of ['package.json','pnpm-lock.yaml'])expected.set('services/pg-api/'+n,sha(fs.readFileSync(loaded.tree+'/services/pg-api/'+n)))
  for(const n of ['package.json','lib/typescript.js','LICENSE.txt','ThirdPartyNoticeText.txt'])expected.set('services/pg-api/node_modules/typescript/'+n,sha(fs.readFileSync(loaded.tree+'/services/pg-api/node_modules/typescript/'+n)))
  const seen=new Set(),copy=(from,to,relative='')=>{for(const name of fs.readdirSync(from).sort()){const rel=relative?relative+'/'+name:name,src=path.join(from,name),dest=path.join(to,name),a=fs.lstatSync(src);if(a.isSymbolicLink()||a.uid!==0||a.gid!==0||(a.mode&0o022)!==0)fail('deployment_source');if(a.isDirectory()){fs.mkdirSync(dest,{mode:0o755});copy(src,dest,rel);fs.chmodSync(dest,0o555)}else if(a.isFile()&&a.nlink===1){const b=fs.readFileSync(src);if(!expected.has(rel)||sha(b)!==expected.get(rel))fail('deployment_inventory');write(dest,b,0o444);s.records.push({path:rel,sha256:sha(b)});seen.add(rel)}else fail('deployment_kind')}};copy(loaded.tree,s.root);if(seen.size!==expected.size)fail('deployment_inventory')
  const input=ownedNodeInput(),bytes=input.bytes;s.nodeInput=input.input;s.nodeSha=sha(bytes);s.node=s.root+'/node24';write(s.node,bytes,0o555);fs.chmodSync(s.root,0o555);deployed(s);return handle
 }catch(error){await closeCompleteCompanionCiDeployment(handle).catch(()=>{});throw error}
}
export function assertCompleteCompanionCiDeploymentBinding(handle,permit,loaded,ownedTarget){
 const s=state(handle)
 if(s.loaded!==loaded||s.target!==ownedTarget)fail('deployment_reference_mismatch')
 assertOwnedCompleteProfileCohort(permit,loaded,ownedTarget)
 deployed(s);return true
}
export function completeCompanionCiDeploymentView(handle){const s=state(handle);deployed(s);return Object.freeze({root:s.root,node:s.node,node_sha256:s.nodeSha,node_input:s.nodeInput,complete_source_sha256:s.loaded.profileSha,final_source_sha256:s.loaded.companionCi.manifest.final_source_sha256,stage_input:s.loaded.stageInput,runtime_manifest_file:s.loaded.stageInput+'/runtime-manifest.json',business_target:Object.freeze({...s.binding}),companions:companionCiSpecs,account_files:Object.freeze(Object.fromEntries(Object.entries(companionCiAccountLeaves).map(([k,v])=>[k,s.loaded.stageInput+'/'+v]))),requires_genuine_signed_B_final_setup:true,setup_is_not_readiness:true,qualifies_run:false})}
export function installCompleteCompanionCiNetwork(handle){
 const s=state(handle);deployed(s);if(s.network.length)fail('network_already_owned');uidAbsent()
 try{for(const[exe,save,family]of [['/usr/sbin/iptables','/usr/sbin/iptables-save',4],['/usr/sbin/ip6tables','/usr/sbin/ip6tables-save',6]]){
  const before=tool(save,['-t','filter']);for(const spec of companionCiSpecs){const chain='ASFC'+spec.uid;if(new RegExp('^:'+chain+' ','m').test(before))fail('network_existing_chain');tool(exe,['-w','5','-N',chain]);const row={exe,chain,uid:spec.uid,jump:false};s.network.push(row)
   if(family===4){tool(exe,['-w','5','-A',chain,'-m','conntrack','--ctstate','ESTABLISHED,RELATED','-j','ACCEPT']);for(const port of [5333,...(spec.id==='plan_workflow_worker'?[Number(new URL(spec.origin).port)]:[])])tool(exe,['-w','5','-A',chain,'-d','127.0.0.1/32','-p','tcp','--dport',String(port),'-j','ACCEPT'])}
   tool(exe,['-w','5','-A',chain,'-j','REJECT']);tool(exe,['-w','5','-I','OUTPUT','1','-m','owner','--uid-owner',String(spec.uid),'-j',chain]);row.jump=true
  }inspectFinalCompanionNetworkPolicy(tool(save,[]),companionCiSpecs,family)
 }}catch(error){removeNetwork(s);throw error}
 return Object.freeze({owned_UID_chains:10,external_provider_egress_denied:true,profile_must_pin_current_policy_after_all_B_rules:true})
}
function removeNetwork(s){uidAbsent();for(const row of [...s.network].reverse()){if(row.jump)tool(row.exe,['-w','5','-D','OUTPUT','-m','owner','--uid-owner',String(row.uid),'-j',row.chain]);tool(row.exe,['-w','5','-F',row.chain]);tool(row.exe,['-w','5','-X',row.chain])}s.network=[]}
async function baseline(s){
 const p=await ownedCompleteProfilePool(s.target,1);let client;try{client=await p.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const roles=(await client.query("SELECT a.oid::text,a.rolname,a.rolcanlogin,a.rolinherit,a.rolsuper,a.rolbypassrls,a.rolcreatedb,a.rolcreaterole,a.rolreplication,a.rolconnlimit,r.rolconfig,a.rolvaliduntil,CASE WHEN a.rolpassword IS NULL THEN NULL ELSE encode(sha256(convert_to(a.rolpassword,'UTF8')),'hex') END AS verifier_sha256 FROM pg_catalog.pg_authid AS a JOIN pg_catalog.pg_roles AS r ON r.oid=a.oid ORDER BY a.rolname")).rows,members=(await client.query('SELECT roleid::text,member::text,grantor::text,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor')).rows
  const dbs=(await client.query('SELECT oid::text,datname,datdba::text,datacl::text FROM pg_database ORDER BY datname')).rows,settings=(await client.query('SELECT setdatabase::text,setrole::text,setconfig FROM pg_db_role_setting ORDER BY setdatabase,setrole')).rows
  const objects=(await client.query("SELECT 'namespace' AS kind,oid::text,nspowner::text AS owner,nspacl::text AS acl FROM pg_namespace UNION ALL SELECT 'relation',oid::text,relowner::text,relacl::text FROM pg_class UNION ALL SELECT 'column',attrelid::text||':'||attnum::text,NULL,attacl::text FROM pg_attribute WHERE attnum>0 AND NOT attisdropped UNION ALL SELECT 'routine',oid::text,proowner::text,proacl::text FROM pg_proc UNION ALL SELECT 'type',oid::text,typowner::text,typacl::text FROM pg_type UNION ALL SELECT 'default',oid::text,defaclrole::text,defaclacl::text FROM pg_default_acl UNION ALL SELECT 'parameter',oid::text,NULL,paracl::text FROM pg_parameter_acl UNION ALL SELECT 'tablespace',oid::text,spcowner::text,spcacl::text FROM pg_tablespace UNION ALL SELECT 'foreign_server',oid::text,srvowner::text,srvacl::text FROM pg_foreign_server UNION ALL SELECT 'foreign_wrapper',oid::text,fdwowner::text,fdwacl::text FROM pg_foreign_data_wrapper ORDER BY kind,oid")).rows
  const rls=(await client.query('SELECT oid::text,polrelid::text,polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid) AS using_expression,pg_get_expr(polwithcheck,polrelid) AS check_expression FROM pg_policy ORDER BY oid')).rows,ledger=(await client.query('SELECT to_jsonb(m) AS row FROM agentstudio.schema_migrations m ORDER BY version')).rows,images=[]
  if(ledger.length!==57||s.loaded.complete.tables.length!==133)fail('baseline_shape');for(const table of s.loaded.complete.tables){if(!/^(agentstudio|agentstudio_auth)\.[a-z_]+$/.test(table))fail('baseline_table');const q=table.split('.').map(x=>'"'+x+'"').join('.');images.push([table,(await client.query("SELECT encode(sha256(convert_to(coalesce(jsonb_agg(j ORDER BY j::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM (SELECT to_jsonb(t) AS j FROM "+q+' t) s')).rows[0]?.hash])}
  return {catalog:sha(JSON.stringify({roles,members,dbs,settings,objects,rls})),ledger:sha(JSON.stringify(ledger)),images:sha(JSON.stringify(images)),tables:images.length,ledger_rows:ledger.length}
 }finally{try{if(client){try{await client.query('ROLLBACK')}finally{client.release()}}}finally{await p.end()}}
}
export async function runCompleteCompanionCiDeployment(handle){
 const s=state(handle);if(s.running||s.ran||s.network.length!==10)fail('run_state');s.running=true;s.ran=true;try{await target(s);deployed(s);const before=await baseline(s),args=['--run','--expected-complete-source-sha256',s.loaded.profileSha,'--expected-final-source-sha256',s.loaded.companionCi.manifest.final_source_sha256,'--expected-system-identifier',s.binding.system_identifier,'--expected-database-oid',s.binding.database_oid]
 const keep=['PATH','HOME','LANG','CI','GITHUB_ACTIONS','RUNNER_OS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_WORKFLOW','GITHUB_JOB','GITHUB_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_EVENT_NAME','AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE','AGENT_STUDIO_COMPANION_CI_PURPOSE','AGENT_STUDIO_COMPANION_CI_SOURCE_MANIFEST_SHA256','AGENT_STUDIO_FINAL13_PATH_CI_PURPOSE'],childEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>keep.includes(k)||k.startsWith('AGENT_STUDIO_PG18_CI_')||k.startsWith('AGENT_STUDIO_COMPLETE_PROFILE_CI_')))
 Object.assign(childEnv,{AGENT_STUDIO_FULL069_WORKER_FINAL_ENABLED:'true',AGENT_STUDIO_FULL069_WORKER_FINAL_APPROVED:'RUN_DISPOSABLE_FULL069_FINAL14_QUALIFICATION_ONLY',AGENT_STUDIO_FULL069_WORKER_LIVE_ENABLED:'true',AGENT_STUDIO_FULL069_WORKER_LIVE_APPROVED:'RUN_DISPOSABLE_FULL069_WORKER_QUALIFICATION_ONLY'})
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(s.node,['--experimental-strip-types',s.root+'/services/pg-api/tests/helpers/pg18-complete-companion-ci-run.mjs',...args],{cwd:s.root,env:childEnv,stdio:['ignore','pipe','pipe'],detached:true,windowsHide:true})
  const group=child.pid;let out='',err='',bytes=0,stopping=false,killer,stopAt=null,settled=false
  // This group/session is created by our own detached spawn, never caller data.
  // A live group reserves its session id until its last process is gone.
  const members=()=>{if(!Number.isSafeInteger(group)||group<1)return [];const rows=[];for(const name of fs.readdirSync('/proc'))if(/^[1-9][0-9]*$/.test(name))try{const raw=fs.readFileSync('/proc/'+name+'/stat','utf8'),a=raw.slice(raw.lastIndexOf(')')+2).split(' ');if(Number(a[2])===group&&Number(a[3])===group)rows.push(Number(name))}catch(error){if(fs.existsSync('/proc/'+name))throw error}return rows}
  const signal=sig=>{if(members().length)try{process.kill(-group,sig)}catch(error){if(error.code!=='ESRCH')throw error}}
  const stop=()=>{if(stopping)return;stopping=true;stopAt=performance.now();signal('SIGTERM');killer=setTimeout(()=>{try{signal('SIGKILL')}catch{}},80000)}
  const timer=setTimeout(stop,1500000),finish=async code=>{
   if(settled)return;settled=true;clearTimeout(timer)
   try{
    if(stopping||code!==0){if(!stopping)stop();while(members().length&&performance.now()-stopAt<85000)await delay(50);if(members().length)fail('emergency_group_remains');const closed=/\b(?:complete_companion_ci_[a-z_]+|full069_final_[a-z0-9_]+|full069_worker_live_[a-z0-9_]+)\b/.exec(err)?.[0]??'complete_companion_ci_actual_child_failed';console.log(JSON.stringify({event:'complete069_companion_actual_failure',exit:code,code:closed,qualifies_run:false,production_GO:false}));throw Error(closed)}
    if(members().length)fail('normal_child_group_remains');const report=JSON.parse(out);companionCiReportShape(report);if(report.complete_source_sha256!==s.loaded.profileSha||report.final_source_sha256!==s.loaded.companionCi.manifest.final_source_sha256||JSON.stringify(report.target)!==JSON.stringify(s.binding))fail('actual_report_binding');resolve(report)
   }catch(error){try{if(members().length){stop();while(members().length&&performance.now()-stopAt<85000)await delay(50);if(members().length)fail('emergency_group_remains')}reject(error)}catch(cleanup){reject(cleanup)}finally{if(killer)clearTimeout(killer)}}
  }
  for(const [stream,kind]of [[child.stdout,'out'],[child.stderr,'err']])stream.on('data',b=>{bytes+=b.length;if(bytes>262144)return stop();if(kind==='out')out+=b;else err+=b})
  child.once('error',()=>{clearTimeout(timer);if(killer)clearTimeout(killer);settled=true;reject(Error('complete_companion_ci_child_start'))});child.once('close',code=>{void finish(code)})
 })
  const after=await baseline(s);if(JSON.stringify(before)!==JSON.stringify(after))fail('business_or_global_catalog_changed');await target(s);deployed(s);uidAbsent()
  const p=await ownedCompleteProfilePool(s.target,1);try{const users=finalBusinessLogins.map(d=>d.login);if(users.length!==14)fail('business_login_matrix');const rows=(await p.query('SELECT usename FROM pg_stat_activity WHERE usename=ANY($1::text[])',[users])).rows;if(rows.length)fail('business_backend_remains')}finally{await p.end()}
  return {...result,all133_table_images_unchanged:true,ledger57_unchanged:true,all_global_roles_memberships_ACLs_unchanged:true,business_backend_count:0,source_deployment_reverified:true,qualified_window_started:false}
 }finally{s.running=false}
}
function ownedNodeUnused(s){if(!s.node||!fs.existsSync(s.node))return;const own=fs.lstatSync(s.node);for(const pid of fs.readdirSync('/proc'))if(/^[1-9][0-9]*$/.test(pid))try{const actual=fs.statSync('/proc/'+pid+'/exe');if(actual.dev===own.dev&&actual.ino===own.ino)fail('cleanup_node_in_use')}catch(error){if(error.code!=='ENOENT'&&error.code!=='ESRCH')throw error}}
export async function closeCompleteCompanionCiDeployment(handle){const s=contexts.get(handle);if(!s||s.closed)return;if(s.running)fail('cleanup_running');uidAbsent();ownedNodeUnused(s);if(s.network.length)removeNetwork(s);if(s.directory){const a=fs.lstatSync(s.root);if(!a.isDirectory()||a.isSymbolicLink()||a.dev!==s.directory.dev||a.ino!==s.directory.ino||path.dirname(s.root)!=='/var/lib'||path.basename(s.root)!=='agentstudio-full069-final-companion-ci-'+s.loaded.stageNonce)fail('cleanup_deployment_identity');fs.rmSync(s.root,{recursive:true})}s.closed=true}
