import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const runner=path.join(root,"ops/e2e-parallel.mjs")
const packageData=JSON.parse(readFileSync(path.join(root,"package.json"),"utf8"))
const run=(args)=>spawnSync(process.execPath,[runner,...args],{
 cwd:root,encoding:"utf8",timeout:15000,
})
test("parallel E2E derives all cases from the canonical serial command",()=>{
 const raw=packageData.scripts["test:e2e"]
 const commands=raw.split(/\s+&&\s+/)
 const expected=commands.flatMap(command=>{
  const alias=command.match(/^pnpm (test:[a-z0-9-]+)$/)
  assert.ok(alias,"unsupported canonical alias: "+command)
  const script=packageData.scripts[alias[1]]
  return script.split(/\s+&&\s+/).map(c=>{
   const cmd=c.match(/^node (tests\/[A-Za-z0-9._/-]+\.mjs)$/)
   assert.ok(cmd,"unexpected test command: "+c)
   return cmd[1]
  })
 })
 const result=run(["--list"])
 assert.equal(result.status,0,result.stderr)
 assert.deepEqual(result.stdout.trim().split(/\r?\n/),expected)
 // The canonical script grows as connectors gain integration tests.
 assert.ok(expected.length>=20,"integration inventory unexpectedly small")
 assert.equal(new Set(expected).size,expected.length)
 assert.ok(expected.includes("tests/knowledge-team.integration.mjs"))
 assert.ok(expected.includes("tests/agent-collaboration.integration.mjs"))
 assert.ok(expected.includes("tests/smithery-connect.integration.mjs"))
})
test("unsafe worker counts, filters and CLI shell syntax fail closed",()=>{
 for(const args of [
  ["--workers=0","--list"],["--workers=4","--list"],
  ["--workers=abc","--list"],["--only=../../admin","--list"],
  ["--only=xyz/nope","--list"],["--something","--list"],
 ]){
  const result=run(args)
  assert.notEqual(result.status,0,args.join(" ")+" must fail closed")
 }
 const restricted=run(["--only=knowledge-team","--list"])
 assert.equal(restricted.status,0,restricted.stderr)
 assert.deepEqual(restricted.stdout.trim().split(/\r?\n/),[
  "tests/knowledge-team.integration.mjs",
 ])
})
