import test from "node:test"
import assert from "node:assert/strict"
import {
  skillAbMessages,SKILL_AB_SCENARIO,SKILL_AB_OUTPUT_MAX_TOKENS,
  SKILL_AB_TOTAL_TOKEN_STOP,skillAbValidTokenCount,
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
  assert.ok(withSkill[1].content.length<7800)
})
test("full oversized Skill is rejected rather than secretly truncated",()=>{
  assert.throws(()=>skillAbMessages("with_skill","long".repeat(3000)),/skill_ab_instruction_too_long/)
  assert.doesNotThrow(()=>skillAbMessages("baseline","long".repeat(3000)))
})
test("AB token constraints reject unmetered and impossible values",()=>{
  assert.equal(SKILL_AB_OUTPUT_MAX_TOKENS,900)
  assert.equal(SKILL_AB_TOTAL_TOKEN_STOP,6000)
  for(const bad of [-1,1.5,NaN,Infinity,"300",null,undefined,10000001])
    assert.equal(skillAbValidTokenCount(bad),null)
  assert.equal(skillAbValidTokenCount(248),248)
  assert.equal(skillAbValidTokenCount(0),0)
})
