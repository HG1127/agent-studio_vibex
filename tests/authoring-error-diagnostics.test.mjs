import assert from "node:assert/strict"
import test from "node:test"
import {authoringRequestErrorText} from "../src/lib/authoringErrorText.ts"

test("authoring diagnostics distinguish missing backend routes from authentication",()=>{
  assert.match(authoringRequestErrorText({status:401,code:"studio_login_required"},"capture"),/登录状态已失效/)
  assert.match(authoringRequestErrorText({status:403,code:"forbidden"},"preview"),/没有需求预览权限/)
  assert.match(authoringRequestErrorText({status:404},"capture"),/原始需求保存.*HTTP 404/)
  assert.match(authoringRequestErrorText({status:404},"preview"),/原始需求已保存.*需求能力预览.*HTTP 404/)
})

test("authoring diagnostics preserve retry guidance for validation and server failures",()=>{
  assert.match(authoringRequestErrorText({status:413,code:"authoring_requirement_size_limit"},"capture"),/超过服务端允许的长度/)
  assert.match(authoringRequestErrorText({status:409,code:"authoring_idempotency_conflict"},"capture"),/需求编号.*冲突/)
  assert.match(authoringRequestErrorText({status:500,code:"authoring_preview_failed"},"preview"),/HTTP 500.*authoring_preview_failed/)
  assert.match(authoringRequestErrorText({name:"TimeoutError"},"preview"),/响应超时/)
  assert.match(authoringRequestErrorText(new TypeError("Failed to fetch"),"capture"),/无法连接 Agent Studio 业务服务/)
  assert.equal(authoringRequestErrorText({name:"AbortError"},"preview"),"")
})
