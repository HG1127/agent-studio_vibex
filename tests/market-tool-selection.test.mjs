import test from "node:test"
import assert from "node:assert/strict"
import { getVerifiedMarketTools, toMarketToolId } from "../src/lib/marketToolSelection.ts"

const ownerId="abcdefghijklmno"
const tool=(name="github_search")=>({name,description:"Verified mock capability"})
const conn=(partial={})=>({
  id:ownerId,title:"GitHub",enabled:true,
  tool_count:2,last_probe_status:"ok",tools:[tool(),tool("issue_write")],
  ...partial,
})
test("verified, enabled MCP tools retain exact executable runtime identifiers",()=>{
  const list=getVerifiedMarketTools([conn()])
  assert.deepEqual(list.map(item=>item.id),[
    toMarketToolId(ownerId,"github_search"),toMarketToolId(ownerId,"issue_write"),
  ])
  assert.equal(list[0].label,"GitHub · github_search")
  assert.equal(list[0].connectionTitle,"GitHub")
})
test("pending, disconnected, unprobed, malformed and duplicate snapshots are not offered",()=>{
  const list=getVerifiedMarketTools([
    conn({enabled:false}),conn({last_probe_status:"needs_refresh"}),
    conn({tool_count:0}),conn({id:"invalid!"}),
    conn({tools:[tool("query"),tool("query")]}),
    conn({tools:[tool("query"),tool("query")]}),
  ])
  assert.deepEqual(list.map(item=>item.name),["query"])
})
test("untrusted tool names and oversized names never enter Agent selection",()=>{
  const list=getVerifiedMarketTools([
    conn({tools:[tool("safe_name"),tool("x <script>"),tool("a".repeat(121)),tool("search.github/v1:test")]}),
  ])
  assert.deepEqual(list.map(item=>item.name),["safe_name","search.github/v1:test"])
})
test("malformed API bodies and excessively large responses fail closed",()=>{
  assert.deepEqual(getVerifiedMarketTools({items:[conn()]}),[])
  assert.deepEqual(getVerifiedMarketTools(null),[])
  const huge=Array.from({length:80},(_,i)=>conn({id:String(i).padStart(15,"0"),tools:[tool("x")]}))
  assert.ok(getVerifiedMarketTools(huge).length<=50)
})
