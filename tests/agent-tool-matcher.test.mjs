import test from "node:test"
import assert from "node:assert/strict"
import { resolveAgentToolRequirements,chooseVerifiedAgentTool } from "../src/lib/agentToolMatcher.ts"

const spec=(tools=[],extra={})=>({
  goal:"",task_scope:"",task_plan:[],deliverables:[],done_criteria:[],tools,...extra,
})
const market=(tool="github_search",attrs={})=>({
  id:"mkt__abcdefghijklmno__"+tool,name:tool,label:"GitHub · "+tool,
  description:"Search repositories",connectionTitle:"GitHub",
  readOnly:true,destructive:false,...attrs,
})
test("generic network search maps to real builtin id instead of missing capability",()=>{
  const result=resolveAgentToolRequirements("调研美股公司的最新公开公告",
    spec(["网络搜索","文本摘要","文档解析"]))
  assert.ok(result.safeAutoBindings.includes("web_search"))
  assert.ok(result.safeAutoBindings.includes("summarize"))
  assert.ok(result.gaps.some(x=>x.name==="文档解析"))
  assert.ok(!result.resolvedTools.includes("文档解析"))
})
test("knowledge retrieval uses knowledge_search instead of falsely requiring internet",()=>{
  const result=resolveAgentToolRequirements("基于公司内部知识库回答员工问题，并引用文档",
    spec(["知识库检索"]))
  assert.ok(result.resolvedTools.includes("knowledge_search"))
  assert.ok(!result.resolvedTools.includes("web_search"))
})
test("pre-connected verified, read-only GitHub capability matches explicit user goal",()=>{
  const result=resolveAgentToolRequirements("在 GitHub 上检索代码仓库",
    spec(["代码仓库检索"]),[],[market()])
  assert.ok(result.safeAutoBindings.includes("mkt__abcdefghijklmno__github_search"))
})
test("verified PDF parser can bind a generated document-parser requirement",()=>{
  const verified=market("pdf_extract",{id:"mkt__abcdefghijklmno__pdf_extract",
    label:"Documents · pdf_extract",readOnly:true,destructive:false,
    description:"Extract text from a PDF document"})
  const matched=resolveAgentToolRequirements("把上传的PDF文件解析为可检索的内容",
    spec(["文档解析"]),[],[verified])
  assert.ok(matched.safeAutoBindings.includes(verified.id))
  assert.ok(!matched.gaps.some(row=>row.name==="文档解析"))
  const without=resolveAgentToolRequirements("把上传的PDF文件解析为可检索的内容",
    spec(["文档解析"]),[],[])
  assert.ok(without.gaps.some(row=>row.name==="文档解析"))
})
test("choosing an executable MCP tool replaces the non-executable alias",()=>{
  const conn=market("doc_search",{readOnly:false,destructive:false})
  const chosen=chooseVerifiedAgentTool(["knowledge_search","calculate","doc_search"],conn.id,true,[conn])
  assert.deepEqual(chosen,["knowledge_search","calculate",conn.id])
  assert.deepEqual(chooseVerifiedAgentTool(chosen,conn.id,false,[conn]),
    ["knowledge_search","calculate"])
})
test("unapproved market capability blocks until the exact executable ID is selected",()=>{
  const conn=market("doc_search",{readOnly:false,destructive:false})
  const missing=resolveAgentToolRequirements("从 doc_search 核对需求模板",
    spec(["doc_search"]),[],[conn])
  assert.ok(missing.gaps.some(item=>item.name==="doc_search"))
  assert.ok(!missing.resolvedTools.includes(conn.id))
  const chosen=resolveAgentToolRequirements("从 doc_search 核对需求模板",
    spec(["knowledge_search",conn.id]),[],[conn],[conn.id])
  assert.ok(chosen.resolvedTools.includes(conn.id))
  assert.ok(!chosen.gaps.some(item=>item.name==="doc_search"))
})
test("unknown, writing or untested third-party tools never automatically grant access",()=>{
  const input="需要在 GitHub 创建 issue"
  const tool=market("github_create",{readOnly:false,destructive:true})
  const result=resolveAgentToolRequirements(input,spec(["GitHub创建"]),[],[tool])
  assert.ok(!result.safeAutoBindings.includes(tool.id))
  assert.ok(result.recommendations.some(x=>x.id===tool.id&&!x.autoBind))
})
test("explicit denial does not silently enable web tools",()=>{
  const result=resolveAgentToolRequirements("只用我提供的公司资料，不要联网搜索",
    spec(["知识库检索"]))
  assert.ok(!result.safeAutoBindings.includes("web_search"))
})
test("user's explicit offline constraint overrides mistaken LLM tool suggestions",()=>{
  const result=resolveAgentToolRequirements("只使用上传的文档，不使用网络搜索、不允许联网",
    spec(["网络搜索","知识库检索"]))
  assert.ok(!result.safeAutoBindings.includes("web_search"))
  assert.ok(result.safeAutoBindings.includes("knowledge_search"))
})
test("untested HTTP tools are suggestions rather than automatic remote writes",()=>{
  const http={name:"send_report",description:"Send report",method:"POST",status:"ok"}
  const result=resolveAgentToolRequirements("通过 send_report 发送报告",
    spec(["邮件发送"]),[http],[])
  assert.ok(!result.safeAutoBindings.includes("send_report"))
})
