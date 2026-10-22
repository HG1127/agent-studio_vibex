import test from "node:test"
import assert from "node:assert/strict"
import {requireNativeBrowserCi} from "./pg-native-browser/ci-guard.mjs"
const exact={GITHUB_ACTIONS:"true",CI:"true",RUNNER_ENVIRONMENT:"github-hosted",
  GITHUB_RUN_ID:"12345678",AGENT_STUDIO_NATIVE_BROWSER_CI:"SYNTHETIC_GITHUB_ONLY"}
test("native UI browser runner accepts only a non-root hosted Linux synthetic CI job",()=>{
  assert.deepEqual(requireNativeBrowserCi(exact,"linux",1001),{
    synthetic_only:true,origin:"http://localhost:17443"})
  for(const [platform,uid] of [["win32",1001],["darwin",1001],["linux",0],["linux",NaN],["linux",-1]])
    assert.throws(()=>requireNativeBrowserCi(exact,platform,uid),/refuse_non_ephemeral_native_browser_ci/)
  for(const env of [{},...Object.keys(exact).map(name=>({...exact,[name]:"wrong"})),
    {...exact,DATABASE_URL:"postgres://company.invalid/agent_studio"},
    {...exact,PGHOST:"127.0.0.1"},{...exact,PGPASSWORD:"must-not-be-read"}])
    assert.throws(()=>requireNativeBrowserCi(env,"linux",1001),/refuse_non_ephemeral_native_browser_ci/)
})
