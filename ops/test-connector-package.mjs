#!/usr/bin/env node
/** Verify the exact downloadable ZIP, then run its own Node in an external
 * temporary directory with no developer PATH/NODE_PATH/NODE_OPTIONS. */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import JSZip from 'jszip'
import {APP_FILES,CONNECTOR_VERSION} from './build-connector.mjs'
const root=process.cwd(),download=path.join(root,'public','downloads')
const release=JSON.parse(await fs.readFile(path.join(download,'connector-release.json'),'utf8'))
assert.equal(release.file,'agent-studio-connector-win-x64.zip')
assert.equal(release.version,CONNECTOR_VERSION,'download metadata must match current connector source')
const bytes=await fs.readFile(path.join(download,release.file)),hash=createHash('sha256').update(bytes).digest('hex')
assert.equal(hash,release.sha256);assert.equal(bytes.length,release.bytes)
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'studio-colleague-package-'))
try{
 const zip=await JSZip.loadAsync(bytes);let count=0
 for(const [name,entry] of Object.entries(zip.files)){
  assert.ok(name.startsWith('AgentStudio-Connector/')&&!name.includes('..')&&!name.includes('\\')&&!name.includes(':'))
  if(entry.dir)continue
  const dest=path.join(temp,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,await entry.async('nodebuffer'));count++
 }
 const bundle=path.join(temp,'AgentStudio-Connector'),integrity=JSON.parse(await fs.readFile(path.join(bundle,'integrity.json'),'utf8'))
 for(const file of integrity.files){assert.ok(!path.isAbsolute(file.path)&&!file.path.split('/').includes('..'));const data=await fs.readFile(path.join(bundle,file.path));assert.equal(data.length,file.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256)}
 const files=integrity.files.map(f=>f.path)
  for(const file of APP_FILES){const actual=await fs.readFile(path.join(bundle,'app','local-executor',file)),source=await fs.readFile(path.join(root,'local-executor',file));assert.ok(actual.equals(source),'stale bundled source: '+file)}
  const launcher=await fs.readFile(path.join(bundle,'Start-Connector.cmd'),'utf8'),manage=await fs.readFile(path.join(bundle,'Manage-Connector.cmd'),'utf8')
  assert.ok(launcher.includes('desktop.mjs" %*\r\n'),'launcher must forward the explicit management switch')
  assert.equal(manage,'@echo off\r\nsetlocal\r\ncall "%~dp0Start-Connector.cmd" --manage\r\n','management launcher requires actual CRLF lines')
  assert.ok(files.includes('app/local-executor/workbench-control.mjs'),'portable worker must include embedded permission-control module')
 assert.ok(files.includes('app/local-executor/version.mjs'),'portable manager and worker share one packaged version')
 for(const forbidden of ['.local-device-credentials.json','computer.local.json','agent-studio-connect.json','pb_data','data.db','pnpm-lock.yaml','.git/','.env'])assert.ok(!files.some(f=>f.split('/').includes(forbidden)||f.startsWith(forbidden)),forbidden)
 assert.ok(files.includes('runtime/NODE-LICENSE.txt'))
 assert.ok(!files.some(f=>f.startsWith('app/src/pages/')||f.startsWith('app/pocketbase/')||f.startsWith('app/node_modules/react/')))
 const env={...process.env,PATH:path.join(process.env.SystemRoot||'C:\\Windows','System32'),NODE_PATH:'',NODE_OPTIONS:''}
 const stdout=await new Promise((resolve,reject)=>{
  const child=spawn(path.join(bundle,'runtime','node.exe'),[path.join(bundle,'app','local-executor','self-test.mjs')],{cwd:temp,env,windowsHide:true,stdio:['ignore','pipe','pipe']})
  let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('portable_smoke_timeout'))},120000)
  child.stdout.on('data',b=>out=(out+String(b)).slice(-10000));child.stderr.on('data',b=>err=(err+String(b)).slice(-10000))
  child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',code=>{clearTimeout(timer);code===0?resolve(out):reject(Error('portable_smoke_failed '+code+' '+err))})
 })
 assert.match(stdout,/PORTABLE_CONNECTOR_SMOKE_PASS/)
 const smoke=JSON.parse(stdout.split('\n').find(line=>line.startsWith('PORTABLE_CONNECTOR_SMOKE_PASS ')).slice('PORTABLE_CONNECTOR_SMOKE_PASS '.length))
 assert.equal(smoke.version,release.version);assert.equal(smoke.realChild401,true);assert.equal(smoke.stickyFailure,true);assert.equal(smoke.realChildOnline,true);assert.equal(smoke.dailyManagerWindows,0);assert.equal(smoke.blankReadBlocked,true);assert.equal(smoke.navigationReceipt,true)
 console.log(stdout.trim())
 console.log('COLLEAGUE_PACKAGE_ACCEPTANCE_PASS '+JSON.stringify({version:release.version,files:count,sha256:hash,externalTempDirectory:true,developerPathRemoved:true,includesNode:true,realFiles:true,realOffice:true,realChrome:true,realCleanWindowsMachine:false,codeSigned:false}))
}finally{await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
