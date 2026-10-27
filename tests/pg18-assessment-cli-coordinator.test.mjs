// Pure container metadata policy and offline/refusal probes. Never runs Docker.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {captureFreshRuntimeSources} from '../services/pg-api/src/pg18-fresh-runtime-source.mjs'
import {assessmentCliCoordinatorPlan,assessmentCliLabels,assessmentCliPostgresArgv,inspectAssessmentCliContainer,assessmentCliContainedPath,finishAssessmentCliResources,verifyAssessmentCliFreshSources,assessmentCliSourceInventory} from '../ops/pg18-assessment-cli-ci.mjs'
const target={runId:'123456',runAttempt:'1',containerId:'a'.repeat(64),nonce:'b'.repeat(64)},expected={name:'synthetic-owned-container',imageId:'sha256:'+'c'.repeat(64)}
function metadata(){return {Id:target.containerId,Name:'/'+expected.name,Image:expected.imageId,Created:new Date().toISOString(),State:{Running:true},HostConfig:{NetworkMode:'none',Privileged:false,PidMode:'',IpcMode:'private',PublishAllPorts:false,PortBindings:{},Binds:null,VolumesFrom:null,Devices:[],DeviceRequests:null,CapAdd:null,Tmpfs:{'/run':'rw,nosuid,nodev,noexec,size=32m,mode=0755','/var/lib/postgresql':'rw,nosuid,nodev,noexec,size=512m,mode=0755'}},NetworkSettings:{Ports:{}},Mounts:[],Config:{Labels:assessmentCliLabels(target),Cmd:assessmentCliPostgresArgv(target),Env:['POSTGRES_USER=postgres','POSTGRES_DB=agent_studio','POSTGRES_PASSWORD=synthetic-agentstudio-review-cli-123456-1','PGDATA=/var/lib/postgresql/assessment-cli-ci']}}}
test('owned image/container/run labels and exact isolated postgres arguments produce only safe attestation metadata',()=>{
  const observed=metadata(),receipt=inspectAssessmentCliContainer(observed,target,expected)
  assert.deepEqual(receipt,{createdAt:observed.Created,labels:assessmentCliLabels(target)})
  assert.equal(Object.keys(receipt).length,2)
  observed.NetworkSettings.Ports={'5432/tcp':null};observed.HostConfig.PortBindings={'5432/tcp':[]}
  assert.deepEqual(inspectAssessmentCliContainer(observed,target,expected),receipt,'an unpublished EXPOSE from the base image is not a host endpoint')
  assert.deepEqual(assessmentCliPostgresArgv(target),['postgres','-p','5333','-c','listen_addresses=127.0.0.1','-c','cluster_name=ci-review-'+target.nonce.slice(0,48)])
})
test('other containers, reused identities and stale/stopped instances cannot supply ownership or fresh proof',()=>{
  for(const mutate of [v=>{v.Id='d'.repeat(64)},v=>{v.Name='/unrelated'},v=>{v.Image='sha256:'+'d'.repeat(64)},v=>{v.Config.Labels['org.agentstudio.assessment-cli.nonce']='d'.repeat(64)},v=>{v.Config.Labels['org.agentstudio.assessment-cli.run']='999'},v=>{v.Created=new Date(Date.now()-600000).toISOString()},v=>{v.Created=new Date(Date.now()+600000).toISOString()},v=>{v.State.Running=false}]){const value=metadata();mutate(value);assert.throws(()=>inspectAssessmentCliContainer(value,target,expected),/assessment_cli_coordinator_refused/)}
})
test('host network/ports/data, broader privileges, volume reuse and alternative postgres targets are rejected',()=>{
  for(const mutate of [
    v=>{v.HostConfig.NetworkMode='host'},v=>{v.HostConfig.Privileged=true},v=>{v.HostConfig.PidMode='host'},v=>{v.HostConfig.IpcMode='host'},v=>{v.HostConfig.PublishAllPorts=true},
    v=>{v.HostConfig.PortBindings={'5333/tcp':[{HostIp:'127.0.0.1',HostPort:'5333'}]}},v=>{v.NetworkSettings.Ports={'5333/tcp':[{HostPort:'5333'}]}},v=>{v.HostConfig.Binds=['/host:/var/lib/postgresql']},
    v=>{v.HostConfig.VolumesFrom=['unrelated']},v=>{v.HostConfig.Devices=[{PathOnHost:'/dev/sda'}]},v=>{v.HostConfig.DeviceRequests=[{Capabilities:[['gpu']]}]},v=>{v.HostConfig.CapAdd=['SYS_ADMIN']},
    v=>{delete v.HostConfig.Tmpfs['/run']},v=>{v.HostConfig.Tmpfs['/host']='rw'},v=>{v.Mounts=[{Type:'volume',Destination:'/var/lib/postgresql'}]},v=>{v.Mounts=[{Type:'bind',Destination:'/run'}]},
    v=>{v.Config.Cmd[2]='5432'},v=>{v.Config.Cmd.push('-c','listen_addresses=*')},v=>{v.Config.Env[1]='POSTGRES_DB=unrelated'},v=>{v.Config.Env[3]='PGDATA=/host/production'}
  ]){const value=metadata();mutate(value);assert.throws(()=>inspectAssessmentCliContainer(value,target,expected),/assessment_cli_coordinator_refused/)}
})
test('plan is offline and actual --run refuses an ordinary checkout before creating any container context',()=>{
  const plan=assessmentCliCoordinatorPlan()
  for(const key of ['services_started','credentials_read','network_used','production_cutover_allowed'])assert.equal(plan[key],false)
  const entry=fileURLToPath(new URL('../ops/pg18-assessment-cli-ci.mjs',import.meta.url)),env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR'].filter(key=>typeof process.env[key]==='string').map(key=>[key,process.env[key]]))
  Object.assign(env,{GITHUB_ACTIONS:'false',CI:'false',DATABASE_URL:'postgres://forbidden-prod'})
  for(const mode of ['--plan','--run']){
    const result=spawnSync(process.execPath,[entry,mode],{env,encoding:'utf8',timeout:15000,windowsHide:true})
    assert.equal(result.error,undefined)
    if(mode==='--plan'){assert.equal(result.status,0);assert.deepEqual(JSON.parse(result.stdout),plan);assert.equal(result.stderr,'')}
    else{assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'ASSESSMENT_CLI_COORDINATOR_REFUSED\n')}
  }
  const debug=spawnSync(process.execPath,[entry,'--run'],{env:{...env,GITHUB_ACTIONS:'true',CI:'true',GITHUB_REPOSITORY:'synthetic-private-repository',NODE_OPTIONS:undefined},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.equal(debug.status,1);assert.equal(debug.stdout,'')
  const lines=debug.stderr.trim().split('\n');assert.equal(lines.at(-1),'ASSESSMENT_CLI_COORDINATOR_REFUSED')
  const failure=JSON.parse(lines[0]);assert.equal(failure.error,'ASSESSMENT_CLI_STAGE_FAILURE');assert.ok(['host_profile','ci_gate'].includes(failure.phase));assert.ok(Object.values(failure.gates).every(value=>typeof value==='boolean'))
  assert.doesNotMatch(debug.stderr,/synthetic-private|forbidden-prod|postgres:\/\//)
})
test('canonical source, dependency-root and Dockerfile boundaries refuse parent and final symlink escapes',()=>{
  const parent=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(parent,'assessment-cli-path-policy-'))
  assert.equal(path.dirname(directory),parent)
  try{
    const repository=path.join(directory,'repo'),outside=path.join(directory,'outside')
    fs.mkdirSync(repository);fs.mkdirSync(outside);fs.writeFileSync(path.join(repository,'safe.mjs'),'export const safe=true')
    fs.writeFileSync(path.join(outside,'outside.mjs'),'never read this')
    assert.equal(assessmentCliContainedPath(repository,'safe.mjs'),fs.realpathSync(path.join(repository,'safe.mjs')))
    fs.symlinkSync(outside,path.join(repository,'parent-escape'),process.platform==='win32'?'junction':'dir')
    assert.throws(()=>assessmentCliContainedPath(repository,'parent-escape/outside.mjs'),/source_path_link/)
    fs.symlinkSync(outside,path.join(repository,'node_modules'),process.platform==='win32'?'junction':'dir')
    assert.throws(()=>assessmentCliContainedPath(repository,'node_modules','directory'),/source_path_link/)
    // Windows junctions exercise the same final-component link rejection
    // without requiring the host's optional file-symlink privilege.
    fs.symlinkSync(process.platform==='win32'?outside:path.join(outside,'outside.mjs'),path.join(repository,'Dockerfile'),process.platform==='win32'?'junction':'file')
    assert.throws(()=>assessmentCliContainedPath(repository,'Dockerfile'),/source_path_link/)
    for(const relative of ['../outside/outside.mjs',path.join(outside,'outside.mjs')])assert.throws(()=>assessmentCliContainedPath(repository,relative),/source_path_escape/)
  }finally{assert.equal(path.dirname(directory),parent);assert.ok(path.basename(directory).startsWith('assessment-cli-path-policy-'));fs.rmSync(directory,{recursive:true,force:true})}
})
test('owned staging cleanup still runs when container ownership check or removal fails',()=>{
  for(const reason of ['ownership','docker-removal']){
    const events=[];assert.throws(()=>finishAssessmentCliResources(()=>{events.push('container');throw Error(reason)},()=>{events.push('staging')}),{message:reason})
    assert.deepEqual(events,['container','staging'])
  }
  const events=[];finishAssessmentCliResources(()=>events.push('container'),()=>events.push('staging'));assert.deepEqual(events,['container','staging'])
})
test('fresh050 pins accept only verified Windows/Git-LF bytes and refuse changed source, order or checksum',()=>{
  const repository=fileURLToPath(new URL('../',import.meta.url)),sha=raw=>createHash('sha256').update(raw).digest('hex'),snapshot=captureFreshRuntimeSources()
  const manifest=new Map(snapshot.sources.map(item=>[item.path,sha(fs.readFileSync(assessmentCliContainedPath(repository,item.path)))]))
  assert.equal(verifyAssessmentCliFreshSources(snapshot,manifest),undefined)
  const normalized=snapshot.sources.map(item=>({...item,sha256:sha(fs.readFileSync(assessmentCliContainedPath(repository,item.path),'utf8').replace(/\r\n/g,'\n'))}))
  const lf={sources:normalized,source_sha256:sha(JSON.stringify({format:'pg18_fresh_runtime_sources_v1',sources:normalized}))}
  assert.equal(lf.source_sha256,'0a3baa8dd28309b5b133c10be944f803d10a71fc5bef1805d26153c69e813a13')
  assert.equal(verifyAssessmentCliFreshSources(lf,new Map(normalized.map(item=>[item.path,item.sha256]))),undefined)
  const changed=new Map(manifest);changed.set(snapshot.sources[0].path,'0'.repeat(64))
  assert.throws(()=>verifyAssessmentCliFreshSources(snapshot,changed),/fresh_baseline_drift/)
  const missing=new Map(manifest);missing.delete(snapshot.sources[0].path);assert.throws(()=>verifyAssessmentCliFreshSources(snapshot,missing),/fresh_baseline_drift/)
  assert.throws(()=>verifyAssessmentCliFreshSources({...snapshot,sources:[...snapshot.sources].reverse()},manifest),/fresh_baseline_drift/)
  assert.throws(()=>verifyAssessmentCliFreshSources({...snapshot,source_sha256:'0'.repeat(64)},manifest),/fresh_baseline_drift/)
})
test('literal SQL assets required by imported Worker helpers are packaged without becoming fresh migration steps',()=>{
  const files=assessmentCliSourceInventory(),snapshot=captureFreshRuntimeSources()
  assert.ok(files.has('db/postgres/008_claim_workflow_v2.sql'))
  assert.ok(!snapshot.sources.some(item=>item.path==='db/postgres/008_claim_workflow_v2.sql'))
  for(const name of files)assert.ok(/^(?:services\/pg-api\/(?:src|tests)\/|shared\/).+\.(?:ts|mts|mjs|js)$/.test(name)||/^db\/postgres\/[A-Za-z0-9_/-]+\.sql$/.test(name),name)
})
