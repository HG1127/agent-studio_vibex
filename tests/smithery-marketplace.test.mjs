import test from "node:test"
import assert from "node:assert/strict"
import {
  SMITHERY_CATEGORIES,connectionForSmithery,
  smitheryConnectionStatus,smitheryStatusLabel,safeSmitherySetupUrl,
} from "../src/lib/smitheryMarketplace.ts"

const row=(patch={})=>({
  id:"conn1",server_name:"github",title:"GitHub",
  url:"https://smithery.run/company/user123",is_smithery:true,
  headers_count:1,enabled:false,tool_count:0,tools:[],
  last_probe_status:"auth_required",last_probe_msg:"waiting OAuth",
  ...patch,
})
test("marketplace categories expose user-friendly discovery shortcuts",()=>{
  assert.deepEqual(SMITHERY_CATEGORIES.map(c=>c.label),[
    "全部","代码研发","搜索研究","办公协作","数据分析","金融信息",
  ])
  assert.ok(SMITHERY_CATEGORIES.find(c=>c.id==="dev").query==="github")
})
test("pending, empty and old-style connections never appear as usable",()=>{
  assert.equal(smitheryConnectionStatus(), "none")
  assert.equal(smitheryConnectionStatus(row()),"action")
  assert.equal(smitheryConnectionStatus(row({enabled:true,tool_count:0,
    last_probe_status:"ok"})),"inactive")
  assert.equal(smitheryConnectionStatus(row({last_probe_status:"error"})),"error")
  assert.equal(smitheryConnectionStatus(row({last_probe_status:"needs_revoke"})),"revoke")
  assert.equal(smitheryConnectionStatus(row({enabled:true,tool_count:4,
    last_probe_status:"ok"})),"ready")
  assert.equal(smitheryConnectionStatus(row({
    url:"https://server.smithery.ai/github/mcp?api_key=secret",enabled:true,
    tool_count:4,last_probe_status:"ok",
  })),"legacy")
  assert.equal(smitheryStatusLabel("ready"),"可使用")
})
test("OAuth setup links are restricted to exact official hosts",()=>{
  assert.equal(safeSmitherySetupUrl("https://auth.smithery.ai/authorize?id=123"),
    "https://auth.smithery.ai/authorize?id=123")
  assert.equal(safeSmitherySetupUrl("https://smithery.ai/account"),"https://smithery.ai/account")
  for (const value of [
    "http://auth.smithery.ai/setup", "https://smithery.ai.evil.test/start",
    "https://evil@auth.smithery.ai/continue", "javascript:alert(1)",
  ]) assert.equal(safeSmitherySetupUrl(value),"")
})

test("catalog match must be managed proxy and same qualified server name",()=>{
  const item={slug:"github",title:"GitHub",desc:""}
  assert.equal(connectionForSmithery(item,[row()]).id,"conn1")
  assert.equal(connectionForSmithery(item,[row({server_name:"notion"})]),undefined)
  assert.equal(connectionForSmithery(item,[row({
    url:"https://server.smithery.ai/github/mcp?api_key=private",
    is_smithery:false,
  })]),undefined)
})
