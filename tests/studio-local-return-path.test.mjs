import test from "node:test"
import assert from "node:assert/strict"
import {getStudioLocalReturnPath} from "../src/lib/studioLocalReturnPath.ts"

const origin="https://studio.example.test"

test("normal original-page routes retain their query and hash exactly",()=>{
  for(const value of ["/","/agent-run?id=run-1#approval","/run-detail?id=run-1&view=trace#step-2","/knowledge-bases?search=%E4%B8%AD%E6%96%87#document","/agent-run?text=a%2Fb&next=https%3A%2F%2Fexample.test#result","/a/b/../c?q=a%2Fb#fragment"]){
    assert.equal(getStudioLocalReturnPath(value,origin),value)
    assert.equal(new URL(value,origin).origin,origin)
  }
})

test("URL-normalized foreign origins, backslashes and controls are rejected",()=>{
  for(const value of [undefined,null,42,"","agent-run","https://foreign.example/path","javascript:alert(1)","//foreign.example/path","///foreign.example/path","/\\foreign.example","/\\\\foreign.example","\\\\foreign.example","/safe\\path","/\t/foreign.example","/\n/foreign.example","/\r/foreign.example","/\u0000/foreign.example","/safe\u007f","/safe\u0085","/safe\u2028","/safe\u2029"," /agent-run"])
    assert.equal(getStudioLocalReturnPath(value,origin),"/",String(value))
  assert.equal(new URL("/\\foreign.example",origin).origin,"https://foreign.example")
})

test("the already-decoded next parameter is validated before navigation",()=>{
  for(const query of ["next=%2F%5Cforeign.example","next=%2F%09%2Fforeign.example","next=%2F%0A%2Fforeign.example","next=%2F%2Fforeign.example"])
    assert.equal(getStudioLocalReturnPath(new URLSearchParams(query).get("next"),origin),"/")
  const local="/run-detail?id=one&view=trace#approval"
  assert.equal(getStudioLocalReturnPath(new URLSearchParams({next:local}).get("next"),origin),local)
})

test("only an exact HTTP or HTTPS browser origin can be the validation base",()=>{
  for(const base of ["","null","file:///tmp","data:text/html,test","javascript:alert(1)","https://user:pass@studio.example.test","https://studio.example.test/path","https://studio.example.test/","https://studio.example.test?query=1"])
    assert.equal(getStudioLocalReturnPath("/agent-run",base),"/")
  assert.equal(getStudioLocalReturnPath("/agent-run?view=trace#top","http://localhost:8090"),"/agent-run?view=trace#top")
})
