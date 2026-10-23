import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = fs.readFileSync(path.join(root, "pocketbase/pb_hooks/modules/model_request.js"),"utf8")
const scope = { module: { exports: {} } }
vm.runInNewContext(source, scope, {filename:"model_request.js", timeout:1000})
const { buildRequest } = scope.module.exports
const roundtrip = value => JSON.parse(JSON.stringify(value))
const examples = [
  {role:"system",content:"Safety"},
  {role:"system",content:"Evidence"},
  {role:"user",content:"你好，🚀"},
  {role:"assistant",content:"以前的回答"},
  {role:"tool",content:"旧工具"},
]

test("model HTTP timeout is finite and capped to the fenced synchronous dispatch window", () => {
  assert.equal(buildRequest("openai", { timeout: 999999 }).timeout, 240)
  assert.equal(buildRequest("anthropic", { timeout: 240 }).timeout, 240)
  assert.equal(buildRequest("gemini", { timeout: 240.99 }).timeout, 240)
  assert.equal(buildRequest("openai", { timeout: 239 }).timeout, 239)
  assert.equal(buildRequest("openai", { timeout: 0 }).timeout, 120)
  assert.equal(buildRequest("openai", { timeout: -5 }).timeout, 120)
  assert.equal(buildRequest("openai", { timeout: Infinity }).timeout, 120)
  assert.equal(buildRequest("openai", { timeout: NaN }).timeout, 120)
  assert.equal(buildRequest("openai", { timeout: 0.25 }).timeout, 1)
  assert.equal(buildRequest("openai", { timeout: 1e100 }).timeout, 240)
  assert.equal(buildRequest("openai", { timeout: 999999 }).timeout <= 240, true,
    "No provider adapter may dispatch an HTTP request beyond the lease safety window")
})

test("OpenAI request preserves exact existing REST shape and user messages", () => {
  const out = roundtrip(buildRequest("openai",{
    baseUrl:"https://api.test/v1///",apiKey:"secret-test",model:"gpt-x",
    messages:examples,maxTokens:355,timeout:120,
  }))
  assert.equal(out.url,"https://api.test/v1/chat/completions")
  assert.equal(out.method,"POST")
  assert.equal(out.headers.Authorization,"Bearer secret-test")
  assert.equal(out.headers["Content-Type"],"application/json")
  assert.equal(out.timeout,120)
  assert.deepEqual(JSON.parse(out.body),{
    model:"gpt-x",messages:examples,max_tokens:355,stream:false,
  })
  assert.equal(JSON.stringify(out).includes("secret-test"),true,"request object contains secret; never log it")
})
test("OpenAI protocol preserves legacy 4096 fallback and unknown-provider fallback", () => {
  const out = buildRequest("unknown",{
    baseUrl:"https://api.test/v1",apiKey:"a",model:"m",messages:[],maxTokens:0,timeout:25,
  })
  assert.equal(JSON.parse(out.body).max_tokens,4096)
  assert.equal(out.url,"https://api.test/v1/chat/completions")
})
test("Anthropic collapses system roles, maps non-assistant to user, preserves 4096 max", () => {
  const out=roundtrip(buildRequest("anthropic",{
    baseUrl:"https://api.anthropic.com/v1",apiKey:"anth-secret",model:"claude-test",
    messages:examples,maxTokens:89,timeout:25,
  }))
  assert.equal(out.url,"https://api.anthropic.com/v1/messages")
  assert.equal(out.headers["x-api-key"],"anth-secret")
  assert.equal(out.headers["anthropic-version"],"2023-06-01")
  assert.equal(out.timeout,25)
  assert.deepEqual(JSON.parse(out.body),{
    model:"claude-test",max_tokens:4096,
    messages:[
      {role:"user",content:"你好，🚀"},
      {role:"assistant",content:"以前的回答"},
      {role:"user",content:"旧工具"},
    ],
    system:"Safety\n\nEvidence",
  })
})
test("Anthropic inserts user fallback when all messages are system", () => {
  const req=buildRequest("anthropic",{
    baseUrl:"https://anthropic.test/v1",apiKey:"a",model:"m",
    messages:[{role:"system",content:"Only system"}],timeout:120,
  })
  assert.deepEqual(JSON.parse(req.body),{
    model:"m",max_tokens:4096,
    messages:[{role:"user",content:"请继续。"}],system:"Only system",
  })
})
test("Gemini uses safe URL-encoding for key/model and maps assistant to model", () => {
  const out=roundtrip(buildRequest("gemini",{
    baseUrl:"https://generativelanguage.googleapis.com/v1beta",apiKey:"a+/&?=key",
    model:"models/gemini experiment",messages:examples,timeout:25,
  }))
  assert.equal(out.url,"https://generativelanguage.googleapis.com/v1beta/models/models%2Fgemini%20experiment:generateContent?key=a%2B%2F%26%3F%3Dkey")
  assert.equal(out.headers.Authorization,undefined)
  assert.equal(out.headers["Content-Type"],"application/json")
  assert.equal(out.timeout,25)
  assert.deepEqual(JSON.parse(out.body),{
    contents:[
      {role:"user",parts:[{text:"你好，🚀"}]},
      {role:"model",parts:[{text:"以前的回答"}]},
      {role:"user",parts:[{text:"旧工具"}]},
    ],
    system_instruction:{parts:[{text:"Safety\n\nEvidence"}]},
  })
})
test("Gemini sends fallback user when no non-system messages", () => {
  const req=buildRequest("gemini",{
    baseUrl:"https://gemini.test",apiKey:"key",model:"m",messages:[],timeout:25,
  })
  assert.deepEqual(JSON.parse(req.body),{
    contents:[{role:"user",parts:[{text:"请继续。"}]}],
  })
})
