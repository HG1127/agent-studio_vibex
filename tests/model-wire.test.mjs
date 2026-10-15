import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

// PocketBase JSVM uses Goja CommonJS. Load in a sandbox rather than asking Node
// to import the .js file from a package with "type":"module".
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const file = path.join(root, "pocketbase/pb_hooks/modules/model_wire.js")
const scope = { module: { exports: {} } }
vm.runInNewContext(fs.readFileSync(file,"utf8"),scope,{filename:"model_wire.js",timeout:1000})
const wire = scope.module.exports

test("model wire UTF-8 handles mixed Latin, Chinese and Unicode astral text", () => {
  const text = "AI 原生模型 UTF-8 ✓ — 🚀"
  const bytes = new TextEncoder().encode(text)
  assert.equal(wire.utf8ToStr(bytes),text)
  assert.equal(wire.bytesToStr({body:bytes}),text)
  assert.equal(wire.bytesToStr({body:text}),text)
  assert.equal(wire.bytesToStr(null),"")
  assert.equal(wire.bytesToStr({body:null}),"")
})

test("model wire preserves provider extraction contracts", () => {
  assert.equal(wire.extractContent("openai",{choices:[{message:{content:"结果 A"}}]}),"结果 A")
  assert.equal(wire.extractContent("anthropic",{content:[
    {type:"thinking",text:"not answer"}, {type:"text",text:"内容 A"},
    {type:"text",text:"内容 B"},
  ]}),"内容 A内容 B")
  assert.equal(wire.extractContent("gemini",{candidates:[{content:{parts:[
    {text:"甲"}, {inline_data:"ignore"}, {text:"乙"},
  ]}}]}),"甲乙")
  assert.equal(wire.extractContent("openai",{}),"")
  assert.equal(wire.extractContent("gemini",null),"")
})
