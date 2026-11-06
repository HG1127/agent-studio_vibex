import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {APPLICATION_FAILURE_MESSAGES,applicationFailure} from '../local-executor/application-feedback.mjs'
import {executeClaim,localJobExecutionWindowMs} from '../local-executor/connection.mjs'
import {APP_FILES} from '../ops/build-connector.mjs'

test('local app approvals fit inside the server lease and leave completion acknowledgement time',()=>{
 assert.equal(localJobExecutionWindowMs(120000),105000)
 assert.equal(localJobExecutionWindowMs(100000),85000)
 assert.equal(localJobExecutionWindowMs(70000),55000)
 assert.equal(localJobExecutionWindowMs(10000),1)
 assert.equal(localJobExecutionWindowMs(0),0)
 assert.equal(localJobExecutionWindowMs(-1),0)
})
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
test('malformed and unavailable WorkBuddy app tool calls produce safe actionable codes without repeating actions',async()=>{
 for(const tool of ['apps.observe','apps.observe_visual','apps.act_visual'])
 for(const [nativeCode,expected] of [
  ['invalid_application_arguments','application_invalid_arguments'],
  ['tool_denied','application_tool_unavailable'],
  ['mcp_tool_failed','application_tool_failed'],
   ['application_control_denied','application_control_denied'],
   ['application_action_unconfirmed','application_action_unconfirmed'],
   ['permission_confirmation_timeout','application_confirmation_timeout'],
   ['permission_confirmation_unavailable','application_confirmation_unavailable'],
   ['permission_confirmation_cancelled','application_confirmation_cancelled'],
  ]){
  let receipt,calls=0
  await executeClaim(async(route,body)=>{if(route.endsWith('/check'))return {active:true};receipt=body;return {ok:true}},
   {execute:async()=>{calls++;throw Error(nativeCode)}},
   {id:'workbuddy-diagnostic',claim:'test-only',deadline_ms:Date.now()+120000,input:{tool,arguments:{window:'123'}}})
  assert.equal(calls,1,'failed app action must not be replayed')
  assert.equal(receipt.ok,false)
  const failure=applicationFailure({id:'workbuddy-diagnostic',status:'failed',error:'local_execution_failed',result:receipt.result})
  assert.equal(failure.code,expected)
  assert.equal(failure.message,APPLICATION_FAILURE_MESSAGES[expected])
  assert.ok(!failure.receipt.includes('private'))
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
