import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import {
  skillAbMessages,SKILL_AB_SCENARIO,SKILL_AB_OUTPUT_MAX_TOKENS,
  SKILL_AB_TOTAL_TOKEN_STOP,SKILL_AB_MAX_INSTRUCTION,
  SKILL_AB_MAX_SKILL_CHARS,skillAbValidTokenCount,
} from "../src/lib/skillAbCompare.ts"

const fake="---\nname: first-principles-analysis\ndescription: Evaluate hard constraints.\n---\n" +
  "SYNTHETIC_SKILL_MARKER Find counterexamples and falsifiable tests."
test("Skill A/B keeps the same synthetic objective and SYSTEM policy",()=>{
  const withSkill=skillAbMessages("with_skill",fake)
  const baseline=skillAbMessages("baseline",fake)
  assert.equal(withSkill.length,2)
  assert.equal(baseline.length,2)
  assert.deepEqual(withSkill.map(x=>x.role),["system","user"])
  assert.deepEqual(baseline.map(x=>x.role),["system","user"])
  assert.equal(withSkill[0].content,baseline[0].content)
  assert.ok(withSkill[1].content.includes(fake))
  assert.ok(!baseline[1].content.includes(fake))
  assert.ok(withSkill[1].content.includes(SKILL_AB_SCENARIO))
  assert.ok(baseline[1].content.includes(SKILL_AB_SCENARIO))
  assert.match(withSkill[0].content,/不进行联网或外部操作/)
  assert.ok(withSkill[1].content.length<SKILL_AB_MAX_INSTRUCTION)
})
test("full 15.5K character Skill is included without truncation",()=>{
  const original="方法事实推导反证".repeat(1944).slice(0,15553)
  assert.equal(original.length,15552)
  const full=skillAbMessages("with_skill",original)
  assert.ok(full[1].content.includes(original))
  assert.equal(full[1].content.indexOf(original),full[1].content.lastIndexOf(original))
  assert.equal(SKILL_AB_MAX_SKILL_CHARS,16100)
  assert.equal(SKILL_AB_MAX_INSTRUCTION,20000)
})
test("Skill text exceeding the registered size envelope is rejected explicitly",()=>{
  assert.throws(()=>skillAbMessages("with_skill","x".repeat(16101)),/skill_ab_content_invalid/)
  assert.doesNotThrow(()=>skillAbMessages("baseline","x".repeat(16000)))
})
test("Goja server and React agree on full unmodified A/B prompts",()=>{
  const registry=fs.readFileSync("pocketbase/pb_hooks/modules/skill_ab_prompt.js","utf8")
  const context={module:{exports:{}}}
  vm.runInNewContext(registry,context,{timeout:2000})
  const original="战略聚焦产品取舍用户体验".repeat(1300)
  for(const variant of ["baseline","with_skill"]){
    const browser=skillAbMessages(variant,original)
    const server=context.module.exports.messages(variant,original)
    assert.equal(JSON.stringify(server),JSON.stringify(browser))
  }
})
test("AB token constraints reject unmetered and impossible values",()=>{
  assert.equal(SKILL_AB_OUTPUT_MAX_TOKENS,900)
  assert.equal(SKILL_AB_TOTAL_TOKEN_STOP,40000)
  for(const bad of [-1,1.5,NaN,Infinity,"300",null,undefined,10000001])
    assert.equal(skillAbValidTokenCount(bad),null)
  assert.equal(skillAbValidTokenCount(248),248)
  assert.equal(skillAbValidTokenCount(0),0)
})
