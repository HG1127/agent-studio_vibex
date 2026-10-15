import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

const source=fs.readFileSync("pocketbase/pb_hooks/modules/studio_auth_helpers.js","utf8")
function authGuardEnabled(env){
 const mod={exports:{}}
 vm.runInNewContext(source,{module:mod,$os:{getenv:key=>env[key]||""}},{timeout:1500})
 return mod.exports.config()
}

test("independent auth cannot be disabled by legacy mode in non-test environments",()=>{
 assert.equal(authGuardEnabled({}),true)
 assert.equal(authGuardEnabled({AGENT_STUDIO_AUTH_MODE:"standalone"}),true)
 assert.equal(authGuardEnabled({AGENT_STUDIO_AUTH_MODE:"legacy"}),true)
 assert.equal(authGuardEnabled({AGENT_STUDIO_AUTH_MODE:"legacy",AGENT_STUDIO_LEGACY_TEST_ONLY:"true"}),true)
 assert.equal(authGuardEnabled({AGENT_STUDIO_AUTH_MODE:"legacy",AGENT_STUDIO_LEGACY_TEST_ONLY:"true",NODE_ENV:"production"}),true)
 assert.equal(authGuardEnabled({AGENT_STUDIO_AUTH_MODE:"legacy",AGENT_STUDIO_LEGACY_TEST_ONLY:"true",NODE_ENV:"test"}),false)
})
