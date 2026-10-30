import test from 'node:test'
import assert from 'node:assert/strict'
import {buildToolExecutionTrace} from '../src/lib/agentToolExecutionTrace.ts'
const event=(event_type,step_index,content)=>({event_type,step_index,content})
test('only real persisted tool calls appear; planned capabilities never become fabricated trace rows',()=>{
 assert.deepEqual(buildToolExecutionTrace([event('thinking',1,{thought:'will search'})]),[])
})
test('tool calls are pending until a matching result event is saved',()=>{
 const trace=buildToolExecutionTrace([event('tool_call',1,{tool:'web_search',input:'AI OS'})])
 assert.equal(trace[0].status,'running');assert.match(trace[0].detail,/等待真实结果事件/)
})
test('a tool result must match both tool name and step before being marked successful',()=>{
 const trace=buildToolExecutionTrace([
  event('tool_call',1,{tool:'web_search',input:'AI OS'}),
  event('tool_result',1,{tool:'calculate',output:'123'}),
 ])
 assert.equal(trace[0].status,'running')
})
test('saved result and failure events are reflected exactly',()=>{
 const trace=buildToolExecutionTrace([
  event('tool_call',1,{tool:'web_search',input:'AI OS'}),
  event('tool_result',1,{tool:'web_search',output:'3 sources found'}),
  event('tool_call',2,{tool:'files.update',input:'report.md'}),
  event('error',2,{tool:'files.update',message:'permission_denied'}),
 ])
 assert.equal(trace.length,2);assert.equal(trace[0].status,'failed');assert.match(trace[0].detail,/permission_denied/)
 assert.equal(trace[1].status,'succeeded');assert.match(trace[1].detail,/3 sources found/)
})
test('a pending approval event marks the matching unresolved call as waiting approval',()=>{
 const trace=buildToolExecutionTrace([
  event('tool_call',3,{tool:'files.update',input:'report.md'}),
  event('approval_pending',3,{tool_name:'files.update'}),
 ])
 assert.equal(trace[0].status,'waiting_approval')
})
test('trace is bounded to the most recent calls and preserves reverse chronological order',()=>{
 const events=Array.from({length:12},(_,i)=>event('tool_call',i+1,{tool:'tool_'+i}))
 const trace=buildToolExecutionTrace(events,5)
 assert.equal(trace.length,5);assert.equal(trace[0].step,12);assert.equal(trace[4].step,8)
})
