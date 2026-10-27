// Source packaging only: no SQL, dependency install, credentials or listener.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const builder=path.join(repo,'ops/build-pg18-native-api-preflight-bundle.mjs')
const env=Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE'].filter(key=>typeof process.env[key]==='string').map(key=>[key,process.env[key]]))
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
function tar(args){const r=spawnSync('tar',args,{cwd:repo,timeout:30000,maxBuffer:16*1024*1024});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr.toString());return r.stdout}
function contents(archive){
  const names=tar(['-tzf',archive]).toString('utf8').split(/\r?\n/).filter(name=>name&&!name.endsWith('/')).map(name=>name.replace(/^\.\//,''))
  assert.equal(new Set(names).size,names.length)
  for(const name of names){assert.ok(!path.posix.isAbsolute(name)&&!name.split('/').includes('..'));assert.doesNotMatch(name,/(?:^|\/)(?:\.env[^/]*|pb_data|node_modules|secrets?|credentials?)(?:\/|$)|\.(?:db|sqlite|wal|exe|dll|pem|key)$/i)}
  const read=name=>tar(['-xOf',archive,'./'+name])
  const manifest=read('SHA256SUMS').toString('utf8').trim().split('\n').map(line=>{const m=/^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(line);assert.ok(m);return {sha:m[1],name:m[2]}})
  assert.deepEqual(names.slice().sort(),[...manifest.map(item=>item.name),'SHA256SUMS'].sort())
  for(const item of manifest)assert.equal(digest(read(item.name)),item.sha,item.name)
  return {names,read}
}
function withOutput(body){
  const parent=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(parent,'agentstudio-assessment-source-'))
  assert.equal(path.dirname(directory),parent)
  try{return body(directory)}finally{assert.equal(path.dirname(directory),parent);assert.ok(path.basename(directory).startsWith('agentstudio-assessment-source-'));fs.rmSync(directory,{recursive:true,force:true})}
}
function build(directory,flags=[]){
  const r=spawnSync(process.execPath,[builder,'--output-dir',directory,...flags],{cwd:repo,env,encoding:'utf8',timeout:90000,maxBuffer:2*1024*1024})
  assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr)
  const report=JSON.parse(r.stdout);assert.equal(digest(fs.readFileSync(report.archive)),report.sha256);assert.equal(report.manifest_verified,true)
  return {report,...contents(report.archive)}
}
test('explicit assessment source bundle contains complete independent runtime and only default-off operator assets',()=>withOutput(directory=>{
  const {report,names,read}=build(path.join(directory,'assessment'),['--with-knowledge-index','--with-agent-assessment'])
  assert.equal(report.assessment_service_source_included,true);assert.equal(report.assessment_default_enabled,false);assert.equal(report.assessment_offline_plan_verified,true);assert.equal(report.assessment_unapproved_modes_refused,true)
  assert.equal(report.knowledge_index_service_included,true);assert.equal(report.contains_secrets,false)
  for(const name of ['agent-assessment-service.ts','agent-assessment-service-config.ts','agent-assessment-worker.ts','agent-assessment-client.ts','agent-assessment-broker.ts','agent-assessment-role.ts','agent-assessment-audit.ts','agent-assessment-audit-core.ts','agent-review-source.ts','model-broker-actor.ts','model-connection-crypto.ts'])assert.ok(names.includes('services/pg-api/src/'+name),name)
  for(const kind of ['worker','broker']){
    const text=read('ops/templates/agent-assessment-'+kind+'.service.example').toString('utf8')
    assert.match(text,/AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED=false/);assert.match(text,/--preflight /);assert.match(text,/DynamicUser=yes/);assert.match(text,/LoadCredential=/);assert.doesNotMatch(text,/^\[Install\]$|^ExecStart=.*--serve/m)
  }
  const sql=read('ops/agent-assessment-logins.sql.example').toString('utf8');assert.match(sql,/ROLLBACK;\s*$/);assert.match(sql,/WITH ADMIN FALSE, INHERIT FALSE, SET TRUE/)
  assert.ok(names.includes('ops/agent-assessment-pg-hba.conf.example'));assert.ok(names.includes('ops/agent-assessment-operator-plan.txt'))
  assert.ok(!names.some(name=>name.startsWith('db/postgres/migrations/')),'source preflight package must not become a schema installer')
  const ordinary=build(path.join(directory,'default'))
  assert.equal(ordinary.report.assessment_service_source_included,undefined)
  for(const name of ['agent-assessment-service.ts','agent-assessment-service-config.ts','agent-assessment-worker.ts','agent-assessment-client.ts','agent-assessment-broker.ts'])assert.ok(!ordinary.names.includes('services/pg-api/src/'+name),name)
  assert.ok(!ordinary.names.some(name=>name.startsWith('ops/agent-assessment-')||name.startsWith('ops/templates/agent-assessment-')))
}))
test('ambiguous source-package options refuse before creating any output',()=>withOutput(directory=>{
  for(const flags of [['--with-agent-assessment','--with-agent-assessment'],['--activate-review'],['--with-agent-assessment','--with-knowledge-index','--serve']]){
    const output=path.join(directory,'must-not-exist'),r=spawnSync(process.execPath,[builder,'--output-dir',output,...flags],{cwd:repo,env,encoding:'utf8',timeout:15000})
    assert.equal(r.error,undefined);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/exact_output_arguments_required/);assert.equal(fs.existsSync(output),false)
  }
}))
