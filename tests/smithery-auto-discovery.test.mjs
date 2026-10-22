import test from "node:test"
import assert from "node:assert/strict"
import { discoverSmitheryCandidates } from "../src/lib/smitheryAutoDiscovery.ts"

const baseUrl = "https://fixture.invalid"
const response = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
})
const statusEndpoint = "/api/market/smithery/status"
const catalogEndpoint = "/api/market/smithery/v2/catalog"

function mockServer({hasKey = true, statusCode = 200, catalogStatus = 200, catalogData} = {}) {
  const requests = []
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname
    requests.push({method: options?.method || "GET", path, query: new URL(url).searchParams.get("q") || ""})
    if (path === statusEndpoint) return response(statusCode, {ok: statusCode === 200, has_key: hasKey})
    if (path === catalogEndpoint) {
      if (catalogStatus === 400) return response(400, {error: "smithery_key_required"})
      return response(catalogStatus, {items: catalogData || [
        {slug:"verified/browser-read",title:"Verified Browser Reader",desc:"Read public pages",verified:true},
        {slug:"unverified/server",title:"Not Verified",desc:"",verified:false},
      ]})
    }
    return response(404, {})
  }
  return {fetcher,requests}
}

test("missing key: one status preflight, zero catalog calls even for three missing capabilities", async () => {
  const server = mockServer({hasKey:false})
  const result = await discoverSmitheryCandidates({baseUrl,searchTerms:["browser","spreadsheet","email"],headers:{Authorization:"fixture"},fetcher:server.fetcher})
  assert.deepEqual(result,{state:"needs_key",items:[]})
  assert.deepEqual(server.requests.map(row=>row.path),[statusEndpoint])
})

test("with a valid key, up to three sanitized generic queries run after one status preflight", async () => {
  const server = mockServer()
  const result = await discoverSmitheryCandidates({baseUrl,
    searchTerms:["browser","browser","spreadsheet","email","Private accounts jane@example.com token=secretvalue"],
    headers: {Authorization:"fixture"},fetcher:server.fetcher})
  assert.equal(result.state,"ok")
  assert.equal(result.items.length,1,"Verified duplicate candidates are deduplicated across queries")
  assert.equal(result.items[0].slug,"verified/browser-read")
  assert.equal(server.requests.filter(row=>row.path===statusEndpoint).length,1)
  const queries = server.requests.filter(row=>row.path===catalogEndpoint).map(row=>row.query)
  assert.ok(queries.length>=2 && queries.length<=3, "At most three terms may be sent to Smithery")
  assert.equal(new Set(queries).size,queries.length)
  assert.equal(queries.some(query=>/jane|secretvalue|accounts/i.test(query)),false,"Private context must never become a marketplace query")
})

test("authorization failure or bad status response cannot trigger catalog calls", async () => {
  for(const statusCode of [401,403,500]) {
    const server=mockServer({statusCode})
    const result=await discoverSmitheryCandidates({baseUrl,searchTerms:["browser"],headers:{},fetcher:server.fetcher})
    assert.deepEqual(result,{state:"unavailable",items:[]})
    assert.deepEqual(server.requests.map(row=>row.path),[statusEndpoint])
  }
  const requests=[]
  const result=await discoverSmitheryCandidates({baseUrl,searchTerms:["browser"],headers:{},fetcher:async url=>{
    requests.push(new URL(url).pathname);return response(200,{ok:true,items:[]})
  }})
  assert.deepEqual(result,{state:"unavailable",items:[]})
  assert.deepEqual(requests,[statusEndpoint])
})

test("a key revoked after preflight clears partially discovered candidates", async () => {
  let catalogCalls=0
  const fetcher=async url=>{
    const parsed=new URL(url)
    if(parsed.pathname===statusEndpoint)return response(200,{ok:true,has_key:true})
    catalogCalls++
    if(parsed.searchParams.get("q")==="browser")return response(200,{items:[{slug:"verified/browser",verified:true}]})
    return response(400,{error:"smithery_key_required"})
  }
  const result=await discoverSmitheryCandidates({baseUrl,searchTerms:["browser","spreadsheet"],headers:{},fetcher})
  assert.equal(catalogCalls,2)
  assert.deepEqual(result,{state:"needs_key",items:[]})
})

test("network failure and empty safe query are explicit, never fabricated market availability", async () => {
  const failed=await discoverSmitheryCandidates({baseUrl,searchTerms:["browser"],headers:{},fetcher:async()=>{throw new Error("offline")}})
  assert.deepEqual(failed,{state:"unavailable",items:[]})
  let calls=0
  const empty=await discoverSmitheryCandidates({baseUrl,searchTerms:[""],headers:{},fetcher:async()=>{calls++}})
  assert.deepEqual(empty,{state:"idle",items:[]})
  assert.equal(calls,0)
})
