import test from "node:test"
import assert from "node:assert/strict"
import {collectRoleSkills,verifyRoleSkillBindings} from "../src/lib/skillRunPreflight.ts"
const ref={id:"skillref1234567",version:2,hash:"a".repeat(64)}
const detail={id:ref.id,version:ref.version,hash:ref.hash,
  approved:true,active:true,content:"# Skill\nSafe",source_url:"",
  name:"approved-skill",description:"Test"}
const role=(name,refs=[])=>({id:name,name,responsibility:"Review",tasks:["Read"],
  inputs:[],deliverables:["Result"],depends_on:[],tools:[],
  done_criteria:["Evidence"],skill_refs:refs})
test("readiness collects only per-role pinned Skill references",()=>{
  const roles=[role("researcher",[ref]),role("reviewer",[])]
  assert.deepEqual(collectRoleSkills(roles),[{roleName:"researcher",ref}])
  assert.deepEqual(collectRoleSkills([]),[])
})
test("approved historical Skill versions remain valid even when newest version changes",async()=>{
  const checks=collectRoleSkills([role("researcher",[ref])])
  assert.deepEqual(await verifyRoleSkillBindings(checks,async()=>detail),[])
})
test("changed hash, disabled, unapproved or missing Skills all block new runs",async()=>{
  const checks=collectRoleSkills([role("researcher",[ref])])
  for(const changed of [{hash:"b".repeat(64)},{active:false},{approved:false},{version:3}]){
    const issues=await verifyRoleSkillBindings(checks,async()=>({...detail,...changed}))
    assert.equal(issues.length,1)
    assert.match(issues[0],/版本未审核、已停用或已变化/)
  }
  assert.match((await verifyRoleSkillBindings(checks,async()=>{throw Error("404")}))[0],
    /无法核验/)
})
test("invalid input cannot trick the client into claiming Skill approval",async()=>{
  const read=async()=>{throw Error("should not make a request")}
  const checks=collectRoleSkills([role("researcher",[{...ref,id:"../evil"}])])
  const issues=await verifyRoleSkillBindings(checks,read)
  assert.equal(issues.length,1)
  assert.match(issues[0],/引用无效/)
})
