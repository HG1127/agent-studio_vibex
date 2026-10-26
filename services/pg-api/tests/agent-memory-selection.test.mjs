import test from "node:test"
import assert from "node:assert/strict"
import {explicitAgentMemory,sanitizeAgentMemoryText,selectAgentMemoryHints} from "../src/agent-memory-selection.ts"
const id=n=>"11111111-1111-4111-8111-"+String(n).padStart(12,"0")
const memory=(n,fact,kind="fact",tools_used="")=>({id:id(n),fact,kind,tools_used})

test("explicit remember preserves the bounded remaining task, sanitizes before storage and never writes scheduled directives",()=>{
  assert.deepEqual(explicitAgentMemory("请帮我记住：报告用中文。整理本月报告"),{fact:"报告用中文",task:"整理本月报告"})
  assert.deepEqual(explicitAgentMemory("记住：报告用中文"),{fact:"报告用中文",task:"报告用中文"})
  const task="记住：报告用中文。整理本月报告"
  assert.deepEqual(explicitAgentMemory(task,true),{fact:null,task})
  assert.deepEqual(explicitAgentMemory("讨论如何记住资料"),{fact:null,task:"讨论如何记住资料"})
  const bounded=explicitAgentMemory("记住："+"字".repeat(600)+"。继续任务")
  assert.equal(bounded.fact.length,500);assert.equal(bounded.task,"继续任务")
  const result=explicitAgentMemory("记住：token=synthetic-token-value。完成任务")
  assert.equal(result.fact,"token=***");assert.equal(result.task,"完成任务")
  for(const value of ["",null,"字".repeat(2001),"nul\0task"])assert.throws(()=>explicitAgentMemory(value),/invalid_agent_memory_input/)
})

test("memory secrets are removed before facts, previews or tool hints can be reused",()=>{
  const raw="report sk-synthetic_only_12345 Bearer syntheticBearer123 token=syntheticToken api_key=syntheticApiKey"
  const clean=sanitizeAgentMemoryText(raw)
  for(const secret of ["sk-synthetic_only_12345","syntheticBearer123","syntheticToken","syntheticApiKey"])assert.equal(clean.includes(secret),false)
  const selected=selectAgentMemoryHints("report",[memory(1,raw,"user","Bearer toolSecret0123")])
  assert.equal(selected.length,1);assert.equal(selected[0].kind,"user")
  assert.equal(JSON.stringify(selected).includes("toolSecret0123"),false);assert.match(selected[0].hint,/用户指令/)
})

test("latest50 verified rows retain stable top3 lexical matches and keep user instructions distinct from derived lessons",()=>{
  const rows=[memory(1,"报告只使用已核对的财务事实","user"),memory(2,"报告只使用已核对的财务事实","lesson"),memory(3,"报告只使用已核对的财务事实"),memory(4,"报告只使用已核对的财务事实"),memory(5,"weather forecasting")]
  const selected=selectAgentMemoryHints("请整理财务报告并核对事实",rows)
  assert.deepEqual(selected.map(item=>item.id),[id(1),id(2),id(3)])
  assert.deepEqual(selected.map(item=>item.kind),["user","lesson","fact"])
  assert.deepEqual(selectAgentMemoryHints("unrelated",rows),[])
  assert.deepEqual(selectAgentMemoryHints("a",[memory(6,"a")]),[])
  for(const malformed of [[...rows,...Array.from({length:46},(_,i)=>memory(i+6,"report"))],[memory(1,"report"),memory(1,"report")],[memory(1,"report","provider_instruction")],[{...memory(1,"report"),owner_user_id:id(99)}]])
    assert.throws(()=>selectAgentMemoryHints("report",malformed),/invalid_agent_memory_input/)
})
