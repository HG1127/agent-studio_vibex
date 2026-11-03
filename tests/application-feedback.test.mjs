import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {APPLICATION_FAILURE_MESSAGES,applicationFailure} from '../local-executor/application-feedback.mjs'
import {executeClaim} from '../local-executor/connection.mjs'
import {APP_FILES} from '../ops/build-connector.mjs'

test('connector reasons survive the generic backend failure code and reach the employee UI',async()=>{
 for(const code of Object.keys(APPLICATION_FAILURE_MESSAGES)){
  let receipt,executions=0
  await executeClaim(async(route,body)=>{if(route.endsWith('/check'))return {active:true};receipt=body;return {ok:true}},
   {execute:async()=>{executions++;throw Error(code)}},{id:'diagnostic-job',claim:'test-only',deadline_ms:Date.now()+10000,input:{}})
  assert.equal(receipt.ok,false);assert.equal(executions,1)
  const result=applicationFailure({id:'diagnostic-job',status:'failed',error:'local_execution_failed',result:receipt.result})
  assert.equal(result.code,code);assert.equal(result.message,APPLICATION_FAILURE_MESSAGES[code])
  assert.match(result.receipt,new RegExp(code));assert.doesNotMatch(result.message,/local_execution_failed/)
 }
})

test('unknown and unsafe diagnostic bodies cannot leak private paths, tokens or stacks',()=>{
 for(const result of ['Error: spawn C:\\private\\App.exe EACCES\nBearer private-token','{"error":"application_launch_denied","message":"private-token"}',
   'constructor','toString','__proto__','application_unrecognized']){
  const failure=applicationFailure({id:'bad\nprivate',status:'failed',error:'local_execution_failed',result})
  assert.equal(failure.code,'');assert.doesNotMatch(failure.message+failure.receipt,/private|Bearer|C:\\|local_execution_failed/)
 }
})

test('uncertain, expired and cancelled operations require checking actual effects before retry',()=>{
 for(const status of ['unknown','expired','cancelled']){
  const r=applicationFailure({id:'job-1',status,error:'execution_deadline',result:'[code:application_launch_failed]'})
  assert.match(r.message,/核对|刷新/);assert.notEqual(r.message,APPLICATION_FAILURE_MESSAGES.application_launch_failed)
 }
})

test('legacy exact codes are supported and the packaged connector includes the shared messages',()=>{
 const r=applicationFailure({status:'failed',error:'local_execution_failed',result:'application_binary_changed'})
 assert.match(r.message,/管理应用授权/)
 assert.ok(APP_FILES.includes('application-feedback.mjs'))
 const ui=fs.readFileSync(new URL('../src/components/tool-hub/ApplicationWorkspace.tsx',import.meta.url),'utf8')
 assert.match(ui,/applicationFailure\(next\)/);assert.match(ui,/setReceipt\(failure.receipt\)/)
 assert.doesNotMatch(ui,/setError\(next.error\|\|/)
})
