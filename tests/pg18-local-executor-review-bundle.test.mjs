// Actual source tar creation/extraction and offline entry probes only.
// No SQL, dependency installation, credentials, network, listener or deployment.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),builder=path.join(repo,'ops/build-pg18-native-api-preflight-bundle.mjs'),digest=bytes=>createHash('sha256').update(bytes).digest('hex'),env=Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]))
const sources=['native-local-executor-service-preflight-cli.mjs','native-local-executor-service-preflight.ts','native-local-executor-operator-plan.mjs','native-local-executor-operator-plan.d.mts'].map(n=>'services/pg-api/src/'+n),assets=['ops/templates/agentstudio-pg18-native-local-executor.conf.example','ops/templates/native-local-executor-pg-hba.conf.example','docs/PG18_NATIVE_LOCAL_EXECUTOR_OPERATOR_REVIEW.md','docs/PG18_NATIVE_LOCAL_EXECUTOR_OPERATOR_PLAN.json']
function withOutput(run){const parent=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(parent,'agentstudio-executor-source-'));assert.equal(path.dirname(directory),parent);try{return run(directory)}finally{assert.equal(path.dirname(fs.realpathSync(directory)),parent);assert.ok(path.basename(directory).startsWith('agentstudio-executor-source-'));assert.equal(fs.lstatSync(directory).isSymbolicLink(),false);fs.rmSync(directory,{recursive:true,force:true})}}
function tar(args){const r=spawnSync('tar',args,{cwd:repo,encoding:'utf8',env,timeout:30000,maxBuffer:16*1024*1024});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);return r.stdout}
function build(directory,flags=[]){
 const r=spawnSync(process.execPath,['--max-old-space-size=128',builder,'--output-dir',directory,...flags],{cwd:repo,env:{...env,TAR_OPTIONS:'--files-from=/never/read/source-review'},encoding:'utf8',timeout:90000,maxBuffer:2*1024*1024});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);assert.equal(digest(fs.readFileSync(report.archive)),report.sha256);assert.equal(report.manifest_verified,true)
 const names=tar(['-tzf',report.archive]).split(/\r?\n/).filter(v=>v&&!v.endsWith('/')).map(v=>v.replace(/^\.\//,''));assert.equal(new Set(names).size,names.length)
 for(const name of names){assert.equal(path.posix.isAbsolute(name),false);assert.equal(name.split('/').includes('..'),false);assert.doesNotMatch(name,/(?:^|\/)(?:\.env[^/]*|pb_data|node_modules|secrets?|credentials?)(?:\/|$)|\.(?:db|sqlite|wal|exe|dll|pem|key)$/i)}
 const extracted=path.join(directory,'review-extracted');fs.mkdirSync(extracted);tar(['-xzf',report.archive,'-C',extracted]);const read=name=>fs.readFileSync(path.join(extracted,name)),manifest=read('SHA256SUMS').toString().trim().split('\n').map(line=>{const m=/^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(line);assert.ok(m);return {sha:m[1],name:m[2]}})
 assert.deepEqual(names.slice().sort(),[...manifest.map(v=>v.name),'SHA256SUMS'].sort());for(const f of manifest)assert.equal(digest(read(f.name)),f.sha,f.name)
 return {report,names,read,extracted}
}
test('explicit Executor operator bundle contains all four modules, four exact review assets and safe actual extracted entry probes',()=>withOutput(directory=>{
 const b=build(path.join(directory,'executor'),['--with-local-executor-operator']);assert.equal(b.report.local_executor_operator_source_included,true);assert.equal(b.report.local_executor_default_enabled,false);assert.equal(b.report.local_executor_offline_plan_verified,true);assert.equal(b.report.local_executor_unapproved_modes_refused,true);assert.equal(b.report.local_executor_activation_authorized,false)
 for(const name of [...sources,...assets]){assert.ok(b.names.includes(name),name);assert.equal(digest(b.read(name)),digest(fs.readFileSync(path.join(repo,name))),name)}
 const unit=b.read(assets[0]).toString();assert.match(unit,/LoadCredential=local-executor\.secret:/);assert.match(unit,/ExecStartPre=.*native-local-executor-service-preflight-cli\.mjs --service-preflight/);assert.doesNotMatch(unit,/^\[Install\]$|^ExecStart=|^Environment=AGENT_STUDIO_PG18_LOCAL_DEVICES_AVAILABLE=true/m)
 const commandPath=/^ExecStartPre=.*?(\/services\/pg-api\/src\/[^ ]+)/m.exec(unit)?.[1];assert.ok(commandPath);assert.ok(b.names.includes(commandPath.slice(1)));assert.match(b.read('README_API_PREFLIGHT.txt').toString(),/no desktop client or secret is bundled/)
 const probe=spawnSync(process.execPath,['--max-old-space-size=64',sources[0],'--plan'],{cwd:b.extracted,env:{...env,DATABASE_URL:'postgres://forbidden-prod',CREDENTIALS_DIRECTORY:'/never/read/source-review'},encoding:'utf8',timeout:18000});assert.equal(probe.status,0,probe.stderr);const plan=JSON.parse(probe.stdout);assert.equal(plan.abi.login,'agentstudio_local_executor_login');assert.equal(plan.network_used,false);assert.equal(plan.secrets_read,false);assert.equal(plan.writes_performed,false);assert.equal(plan.activation_via_this_cli_supported,false)
 const ordinary=build(path.join(directory,'default'));assert.equal(ordinary.report.local_executor_operator_source_included,undefined);for(const name of [...sources,...assets])assert.equal(ordinary.names.includes(name),false,name);assert.equal(ordinary.read('README_API_PREFLIGHT.txt').toString().includes('Executor offline plan:'),false)
}))
test('explicit Executor option composes with original index and assessment choices without activating any service',()=>withOutput(directory=>{
 const b=build(path.join(directory,'combined'),['--with-agent-assessment','--with-local-executor-operator','--with-knowledge-index']);assert.equal(b.report.knowledge_index_service_included,true);assert.equal(b.report.assessment_service_source_included,true);assert.equal(b.report.assessment_default_enabled,false);assert.equal(b.report.local_executor_operator_source_included,true);assert.equal(b.report.local_executor_default_enabled,false);assert.equal(b.report.contains_secrets,false)
 for(const name of [...sources,...assets,'services/pg-api/src/knowledge-index-service.ts','services/pg-api/src/agent-assessment-service.ts'])assert.ok(b.names.includes(name),name)
 assert.equal(b.names.some(n=>n.startsWith('db/postgres/migrations/')),false);assert.match(b.read('ops/agent-assessment-logins.sql.example').toString(),/ROLLBACK;\s*$/)
}))
test('ambiguous, duplicate or activation-looking options refuse before creating an output directory',()=>withOutput(directory=>{
 for(const flags of [['--with-local-executor-operator','--with-local-executor-operator'],['--with-local-executor'],['--activate-executor'],['--with-local-executor-operator','--serve'],['--with-agent-assessment','--with-local-executor-operator','--with-knowledge-index','--apply']]){const output=path.join(directory,'must-not-exist'),r=spawnSync(process.execPath,['--max-old-space-size=128',builder,'--output-dir',output,...flags],{cwd:repo,env,encoding:'utf8',timeout:15000});assert.equal(r.error,undefined);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/exact_output_arguments_required/);assert.equal(fs.existsSync(output),false)}
}))
