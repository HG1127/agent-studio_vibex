import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const read=x=>readFileSync(path.join(root,x),"utf8").replace(/\r\n/g,"\n")

test("pnpm 11 build lifecycle approvals are explicit, not auto-approved",()=>{
  const settings=read("pnpm-workspace.yaml")
  const reviewed=[
    "'@parcel/watcher'","'@swc/core'","core-js","less","protobufjs",
  ]
  assert.match(settings,/^allowBuilds:\s*$/m)
  for(const name of reviewed){
    assert.ok(settings.includes("  "+name+": false"),
      name+" must be explicitly disallowed pending package review")
  }
  assert.doesNotMatch(settings,/set this to true or false/)
  assert.doesNotMatch(settings,/dangerouslyAllowAllBuilds:\s*true/)
  assert.doesNotMatch(settings,/strictDepBuilds:\s*false/)
})
test("CI uses audited lockfile installs rather than implicit pnpm reinstall",()=>{
  const settings=read("pnpm-workspace.yaml")
  const ci=read(".github/workflows/agent-studio-quality.yml")
  assert.match(settings,/^verifyDepsBeforeRun: warn$/m)
  assert.match(ci,/version: 11\.23\.0/)
  assert.match(ci,/pnpm install --frozen-lockfile/)
  assert.match(ci,/services\/pg-api install --ignore-workspace --frozen-lockfile --ignore-scripts/)
  assert.match(ci,/'pnpm-workspace\.yaml'/)
  assert.doesNotMatch(ci,/\bdangerouslyAllowAllBuilds\b/)
})
