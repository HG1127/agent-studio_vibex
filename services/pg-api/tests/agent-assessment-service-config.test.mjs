import test from 'node:test'
import assert from 'node:assert/strict'
import {constants,readFileSync} from 'node:fs'
import {agentAssessmentApproval} from '../src/agent-assessment-contract.ts'
import {agentAssessmentServiceConfig,agentAssessmentCredentialDirectory,agentAssessmentServiceOrigin,parseAgentAssessmentServiceArgs,agentAssessmentServiceOfflinePlan,agentAssessmentServiceHelp,agentAssessmentDatabasePassword,assertAgentAssessmentServiceTls,readAgentAssessmentCredential} from '../src/agent-assessment-service-config.ts'
const base=kind=>({AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:agentAssessmentApproval,AGENT_STUDIO_PG_REVIEW_SERVICE_REVIEWED:'true',CREDENTIALS_DIRECTORY:agentAssessmentCredentialDirectory(kind),AGENT_STUDIO_PG_REVIEW_ORIGIN:agentAssessmentServiceOrigin,AGENT_STUDIO_PG_REVIEW_SERVER_FINGERPRINT:'AB'.repeat(32),AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT:'CD'.repeat(32),AGENT_STUDIO_PG_PILOT_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:'true',AGENT_STUDIO_PG_HOST:'127.0.0.1',AGENT_STUDIO_PG_PORT:'5333',AGENT_STUDIO_PG_DATABASE:'agent_studio',AGENT_STUDIO_PG_USER:'agentstudio_stage_login'})
test('service command grammar is explicit; plan/help are offline and never inspect environment',()=>{
  assert.deepEqual(parseAgentAssessmentServiceArgs(['--plan']),{mode:'plan'});assert.deepEqual(parseAgentAssessmentServiceArgs(['--help']),{mode:'help'})
  for(const mode of ['preflight','serve'])for(const kind of ['worker','broker'])assert.deepEqual(parseAgentAssessmentServiceArgs([`--${mode}`,kind]),{mode,kind})
  for(const args of [[],['--serve'],['--preflight'],['worker','--serve'],['--serve','api'],['--plan','worker'],['--serve','worker','--force'],['--serve','worker','--preflight']])assert.throws(()=>parseAgentAssessmentServiceArgs(args),/explicit_mode_required/)
  const plan=agentAssessmentServiceOfflinePlan();assert.equal(plan.default_enabled,false);for(const key of ['network_used','credentials_read','db_writes_performed','workers_started','external_model_calls','production_cutover_allowed'])assert.equal(plan[key],false);assert.equal(agentAssessmentServiceHelp().preflight_read_only,true)
})
test('both preflight and serve require exact independent review consent before reading any other config',()=>{
  for(const mode of ['preflight','serve'])for(const kind of ['worker','broker'])for(const patch of [{AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:undefined},{AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'false'},{AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:undefined},{AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:'APPROVE_DISPOSABLE_PG18_OWNER_BOUND_GENERATION_UAT_ONLY'}]){
    const values={...base(kind),...patch};let later=0;Object.defineProperty(values,'CREDENTIALS_DIRECTORY',{get(){later++;throw Error('credential path read before approval')}});assert.throws(()=>agentAssessmentServiceConfig(values,kind,mode,'linux',1001),/agent_assessment_service_not_approved/);assert.equal(later,0)
  }
})
test('approved config fixes nonroot Linux PG18 loopback target, separate credential mounts/pins and new login names',()=>{
  for(const kind of ['worker','broker']){const cfg=agentAssessmentServiceConfig(base(kind),kind,'preflight','linux',1001);assert.equal(cfg.target.mode,'baota_pg18');assert.equal(cfg.target.host,'127.0.0.1');assert.equal(cfg.target.port,5333);assert.equal(cfg.target.database,'agent_studio');assert.equal(cfg.origin,'https://127.0.0.1:7459');assert.notEqual(cfg.serverFingerprint,cfg.clientFingerprint);assert.equal(cfg.directory,`/run/credentials/agentstudio-pg18-review-${kind}.service`);assert.equal(cfg.knowledgeSharing,false);assert.equal(cfg.knowledgeTools,false)}
  const custom=agentAssessmentServiceConfig({...base('worker'),AGENT_STUDIO_PG_REVIEW_WORKER_LOGIN:'synthetic_assessment_worker',AGENT_STUDIO_PG_REVIEW_DISPATCH_LOGIN:'synthetic_assessment_dispatch'},'worker','serve','linux',1001);assert.equal(custom.workerLogin,'synthetic_assessment_worker')
  for(const [platform,uid] of [['win32',1001],['darwin',1001],['linux',0],['linux',-1],['linux',NaN],['linux',1.5]])assert.throws(()=>agentAssessmentServiceConfig(base('worker'),'worker','serve',platform,uid))
})
test('ambient targets, bypass flags, foreign origins/credentials and reused cert/login identities fail closed',()=>{
  for(const patch of [{DATABASE_URL:'postgres://synthetic-forbidden-elsewhere/db'},{PGHOST:'elsewhere'},{PGPASSWORD:'synthetic-secret'},{AGENT_STUDIO_PG_HOST:'localhost'},{AGENT_STUDIO_PG_PORT:'5432'},{AGENT_STUDIO_PG_DATABASE:'production'},{AGENT_STUDIO_PG_BAOTA18_ENABLED:'false'},{AGENT_STUDIO_PG_REVIEW_SERVICE_REVIEWED:'false'},{AGENT_STUDIO_PG_REVIEW_ORIGIN:'http://127.0.0.1:7459'},{AGENT_STUDIO_PG_REVIEW_ORIGIN:'https://127.0.0.1:7453'},{CREDENTIALS_DIRECTORY:'/tmp/review'},{CREDENTIALS_DIRECTORY:agentAssessmentCredentialDirectory('broker')},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{NODE_EXTRA_CA_CERTS:'/tmp/foreign.pem'},{AGENT_STUDIO_PG_REVIEW_SERVER_FINGERPRINT:'bad'},{AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT:'AB'.repeat(32)},{AGENT_STUDIO_PG_REVIEW_WORKER_LOGIN:'postgres'},{AGENT_STUDIO_PG_REVIEW_WORKER_LOGIN:'agentstudio_model_worker_login'},{AGENT_STUDIO_PG_REVIEW_WORKER_LOGIN:'escape; SET ROLE postgres'},{AGENT_STUDIO_PG_REVIEW_WORKER_LOGIN:'agentstudio_review_dispatch_login'}])assert.throws(()=>agentAssessmentServiceConfig({...base('worker'),...patch},'worker','preflight','linux',1001))
})
test('password policy rejects placeholders/whitespace/overlong/reused-character secrets without echoing values',()=>{
  const password='abcdef0123456789'.repeat(5);assert.equal(agentAssessmentDatabasePassword(Buffer.from(password+'\n')),password)
  for(const raw of ['secret','x'.repeat(80),'abc def'.repeat(10),'abc\n'.repeat(20),'abc\0'.repeat(20),'abcd'.repeat(129),password+'\n\n'])assert.throws(()=>agentAssessmentDatabasePassword(Buffer.from(raw)),{message:'unsafe_agent_assessment_credential'})
})
test('TLS material checker rejects malformed CA/leaf/key before any client or listener construction',()=>{
  for(const kind of ['worker','broker']){const cfg=agentAssessmentServiceConfig(base(kind),kind,'serve','linux',1001);assert.throws(()=>assertAgentAssessmentServiceTls(cfg,Buffer.from('synthetic CA'),Buffer.from('synthetic certificate'),Buffer.from('synthetic key')),{message:'unsafe_agent_assessment_tls_material'})}
})
function credentialFiles(cfg,fault){
  const data=Buffer.from('synthetic-owned-key'),stat={dev:1,ino:2,size:data.length,mode:0o100400,uid:cfg.uid,gid:cfg.uid,mtimeMs:123,isFile(){return true},isSymbolicLink(){return false}},folder={uid:cfg.uid,mode:0o40500,isDirectory(){return true},isSymbolicLink(){return false}},events=[];let fstats=0,pathReads=0
  const files={lstatSync(path){events.push('lstat');if(path===cfg.directory)return folder;pathReads++;if(pathReads>1&&fault==='path-throw')throw Error('private filesystem metadata');return pathReads>1&&fault==='path-replaced'?{...stat,ino:3}:stat},realpathSync(path){return path},accessSync(){},openSync(path,flags){events.push('open');assert.equal(path,cfg.directory+'/worker.secret');assert.equal(flags,constants.O_RDONLY|constants.O_NOFOLLOW);return 42},fstatSync(fd){events.push('fstat');assert.equal(fd,42);fstats++;if(fstats>1&&fault==='fstat-throw')throw Error('private post-read failure');return fstats>1&&fault==='mtime-changed'?{...stat,mtimeMs:124}:stat},readFileSync(fd){events.push('read');assert.equal(fd,42);return data},closeSync(fd){events.push('close');assert.equal(fd,42);if(fault==='close-throw')throw Error('private close failure')}}
  return {data,events,files}
}
test('credential reads wipe newly allocated data on every post-read integrity/metadata/close failure and keep errors generic',()=>{
  const cfg=agentAssessmentServiceConfig(base('worker'),'worker','preflight','linux',1001)
  for(const fault of ['mtime-changed','fstat-throw','path-replaced','path-throw','close-throw']){const fake=credentialFiles(cfg,fault);assert.throws(()=>readAgentAssessmentCredential(cfg,'worker.secret',fake.files),{message:'unsafe_agent_assessment_credential'});assert.ok(fake.events.includes('read'));assert.equal(fake.events.at(-1),'close');assert.ok(fake.data.every(byte=>byte===0))}
})
test('successful credential read closes descriptor and transfers its nonzero buffer to the service owner',()=>{
  const cfg=agentAssessmentServiceConfig(base('worker'),'worker','preflight','linux',1001),fake=credentialFiles(cfg)
  assert.equal(readAgentAssessmentCredential(cfg,'worker.secret',fake.files),fake.data);assert.equal(fake.data.toString(),'synthetic-owned-key');assert.equal(fake.events.at(-1),'close')
})
test('rollback-only login example checks complete group attributes and no parent memberships without granting an old login',()=>{
  const source=readFileSync(new URL('../../../ops/agent-assessment-logins.sql.example',import.meta.url),'utf8')
  for(const attribute of ['rolcanlogin','rolinherit','rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication'])assert.ok(source.includes('NOT '+attribute))
  assert.match(source,/NOT EXISTS\(SELECT 1 FROM pg_catalog\.pg_auth_members parent WHERE parent\.member=r\.oid\)/)
  assert.match(source,/ROLLBACK;\s*$/);assert.doesNotMatch(source,/^\s*COMMIT;/m)
  const grants=source.split('\n').filter(line=>/^GRANT /.test(line));assert.equal(grants.length,2);for(const grant of grants)assert.match(grant,/ TO agentstudio_review_(?:worker|dispatch)_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;/)
})
