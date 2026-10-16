import test from "node:test"
import assert from "node:assert/strict"
import { OPEN_METEO_EXAMPLE, inspectToolRequest, toolFailureGuidance } from "../src/lib/toolConnectionUx.ts"
const draft = (changes={}) => ({url:OPEN_METEO_EXAMPLE.url,method:"GET",input:OPEN_METEO_EXAMPLE.input,timeout:"15",bodyTemplate:"",headers:[],...changes})
test("Open-Meteo sample is valid and preview hides values",()=>{
  const p=inspectToolRequest(draft());assert.deepEqual(p.errors,[]);assert.equal(p.host,"api.open-meteo.com");assert.deepEqual(p.placeholders,["latitude","longitude"]);assert.deepEqual(p.queryKeys.slice(0,2),["latitude","longitude"])
})
test("POST to forecast and city-only input are caught before network",()=>{
  const p=inspectToolRequest(draft({method:"POST",input:'{"city":"杭州"}'}));assert.ok(p.errors.some(s=>s.includes("GET")));assert.ok(p.errors.some(s=>s.includes("city")));assert.deepEqual(p.missing,["latitude","longitude"])
})
test("invalid JSON and missing placeholders are blocked",()=>{
  assert.equal(inspectToolRequest(draft({input:"{oops"})).inputValid,false)
  assert.deepEqual(inspectToolRequest(draft({input:'{"latitude":30}'})).missing,["longitude"])
})
test("POST body render checks the actual replacement behavior",()=>{
  const opts={url:"https://example.com/api",method:"POST",input:'{"city":"杭州"}',bodyTemplate:'{"city":{{city}}}'}
  assert.ok(inspectToolRequest(draft(opts)).errors.some(s=>s.includes("不是有效 JSON")))
  assert.deepEqual(inspectToolRequest(draft({...opts,bodyTemplate:"{{input}}"})).errors,[])
  assert.deepEqual(inspectToolRequest(draft({...opts,bodyTemplate:'{"city":"{{city}}"}'})).errors,[])
})
test("invalid timeout and credential URL are identified without echoing secrets",()=>{
  const p=inspectToolRequest(draft({url:"https://user:pass@example.com?q=x&api_key=abc",timeout:"61"}))
  assert.ok(p.errors.some(s=>s.includes("密码")));assert.ok(p.errors.some(s=>s.includes("5–60")));assert.equal(p.host,"example.com")
  assert.ok(!JSON.stringify(p).includes("abc"));assert.ok(!JSON.stringify(p).includes("user:pass"))
})
test("HTTP 400 hint stays cautious and actionable",()=>{
  const s=toolFailureGuidance({ok:false,status_code:400,response_excerpt:'{"reason":"not valid JSON"}'},{method:"POST",url:OPEN_METEO_EXAMPLE.url})
  assert.ok(s.some(x=>x.includes("JSON")));assert.ok(s.some(x=>x.includes("GET")));assert.ok(s.some(x=>x.includes("无法定位")))
  assert.deepEqual(toolFailureGuidance({ok:true,status_code:200}),[])
})

test("GET with fixed coordinates permits unused city but warns it will be ignored", () => {
  const p=inspectToolRequest(draft({url:"https://api.open-meteo.com/v1/forecast?latitude=30.2741&longitude=120.1551",input:'{"city":"杭州"}'}))
  assert.deepEqual(p.errors,[])
  assert.ok(p.warnings.some(s=>s.includes("city")))
})
