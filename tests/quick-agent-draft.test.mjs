import test from "node:test"
import assert from "node:assert/strict"
import {
  quickAgentDraftKey,sanitizeQuickAgentDraft,
  QUICK_AGENT_DRAFT_TTL_MS,QUICK_AGENT_DRAFT_MAX_BYTES,
  readQuickAgentDraft,saveQuickAgentDraft,clearQuickAgentDraft,
} from "../src/lib/quickAgentDraft.ts"

const id="abcdefghijklmnop",other="zyxwvutsrqponmlk",owner="employeeuser1234"
const spec={
  goal:"检索相关企业资料",task_scope:"只读取授权文档",tools:["knowledge_search"],
  deliverables:["报告"],task_plan:["搜索","归纳"],done_criteria:["引用可核验"],
}
const draft=(now=100000000)=>({version:1,ownerId:owner,specId:id,
  name:"检索 Agent",expectedUpdated:"2026-10-20 18:10:00",updatedAt:now,spec})
test("independent tenant, Agent and per-tab keys",()=>{
  assert.notEqual(quickAgentDraftKey(owner,id),quickAgentDraftKey(owner,other))
  assert.notEqual(quickAgentDraftKey(owner,id),quickAgentDraftKey(other,id))
  assert.equal(quickAgentDraftKey("../bad",id),"")
  assert.equal(sanitizeQuickAgentDraft(draft(),other,id,100000001),null)
  assert.equal(sanitizeQuickAgentDraft(draft(),owner,other,100000001),null)
})
test("TTL, invalid versions and future clock values are rejected",()=>{
  assert.ok(sanitizeQuickAgentDraft(draft(),owner,id,100000001))
  assert.equal(sanitizeQuickAgentDraft(draft(),owner,id,100000000+QUICK_AGENT_DRAFT_TTL_MS+1),null)
  assert.equal(sanitizeQuickAgentDraft(draft(100090000),owner,id,100000000),null)
  assert.equal(sanitizeQuickAgentDraft({...draft(),expectedUpdated:""},owner,id,100000001),null)
  assert.equal(sanitizeQuickAgentDraft({...draft(),version:3},owner,id,100000001),null)
})
test("secret-looking extra fields and unrelated Agent fields are excluded",()=>{
  const item=sanitizeQuickAgentDraft({...draft(),api_key:"SECRET",
    spec:{...spec,model_api_token:"PASSWORD",headers:{Authorization:"Bearer SECRET"}}},
    owner,id,100000010)
  assert.ok(item)
  assert.doesNotMatch(JSON.stringify(item),/SECRET|PASSWORD|Authorization/)
  assert.deepEqual(item.spec.tools,["knowledge_search"])
})
test("save/restore/discard is scoped and does not store credentials as unknown fields",()=>{
  const db=new Map()
  const old=globalThis.sessionStorage
  globalThis.sessionStorage={
    getItem:(key)=>db.get(key)??null,
    setItem:(key,val)=>{db.set(key,val)},
    removeItem:(key)=>{db.delete(key)},
  }
  try{
    assert.equal(saveQuickAgentDraft(owner,id,{
      ownerId:owner,specId:id,name:"检索 Agent",expectedUpdated:"2026-10-20 18:10:00",spec,
      // Unknown sensitive data may appear in caller objects but is allowlisted.
      password:"ignore",
    }),true)
    assert.ok(readQuickAgentDraft(owner,id))
    assert.equal(readQuickAgentDraft(other,id),null)
    assert.equal(readQuickAgentDraft(owner,other),null)
    assert.ok([...db.values()][0].length<QUICK_AGENT_DRAFT_MAX_BYTES)
    clearQuickAgentDraft(owner,id)
    assert.equal(readQuickAgentDraft(owner,id),null)
  } finally{globalThis.sessionStorage=old}
})
