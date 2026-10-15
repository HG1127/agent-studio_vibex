import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const source=fs.readFileSync(path.join(root,"pocketbase/pb_hooks/modules/tool_calculator.js"),"utf8")
const scope={module:{exports:{}}}
vm.runInNewContext(source,scope,{timeout:1000})
const evaluate=scope.module.exports.evaluate

test("shared calculate tool preserves precedence, parentheses and unary operators",()=>{
  assert.equal(evaluate("2+3*4"),14)
  assert.equal(evaluate("(2+3)*4"),20)
  assert.equal(evaluate("-1 + -2*4"),-9)
  assert.equal(evaluate("10 % 4"),2)
  assert.equal(evaluate("1.25 + .75"),2)
  assert.equal(evaluate("1 + +2"),3)
})
test("shared calculator rejects injections, zero divisors and malformed input",()=>{
  assert.throws(()=>evaluate(""),/表达式为空/)
  assert.throws(()=>evaluate("1/0"),/除数为零/)
  assert.throws(()=>evaluate("3%0"),/除数为零/)
  assert.throws(()=>evaluate("1+"),/缺少数字/)
  assert.throws(()=>evaluate("(1+2"),/缺少右括号/)
  assert.throws(()=>evaluate("process.exit(1)"),/仅支持数字/)
  assert.throws(()=>evaluate("2**5"),/缺少数字|多余内容/)
})
