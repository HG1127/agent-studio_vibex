import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const scope={module:{exports:{}}}
vm.runInNewContext(fs.readFileSync(new URL('../pocketbase/pb_hooks/modules/model_request.js',import.meta.url),'utf8'),scope)
const {buildRequest}=scope.module.exports
const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
const url='data:image/png;base64,'+data
const messages=[{role:'user',content:[{type:'text',text:'Read the fixture'},{type:'image_url',image_url:{url}}]}]
for(const provider of ['openai','anthropic','gemini'])test(provider+' preserves private image bytes and text while retaining timeout cap',()=>{
 const request=buildRequest(provider,{baseUrl:'https://test.invalid/v1',apiKey:'test-only',model:'fixture',timeout:999999,messages})
 const body=JSON.parse(request.body)
 assert.equal(request.timeout,240)
 if(provider==='openai')assert.deepEqual(body.messages,messages)
 if(provider==='anthropic')assert.deepEqual(body.messages[0].content,[{type:'text',text:'Read the fixture'},{type:'image',source:{type:'base64',media_type:'image/png',data}}])
 if(provider==='gemini')assert.deepEqual(body.contents[0].parts,[{text:'Read the fixture'},{inline_data:{mime_type:'image/png',data}}])
})
test('all providers reject remote, SVG and oversized images before network dispatch',()=>{
 for(const provider of ['openai','anthropic','gemini'])for(const bad of ['https://private.invalid/image','data:image/svg+xml;base64,PHN2Zz4=',url+'A'.repeat(1398130)])
  assert.throws(()=>buildRequest(provider,{messages:[{role:'user',content:[{type:'image_url',image_url:{url:bad}}]}]}),/invalid_model_image/)
})
test('interactive low reasoning is explicit and restricted to MiniMax M3.1 Flash',()=>{
 const body=opts=>JSON.parse(buildRequest('openai',opts).body)
 assert.equal(body({model:'MiniMax-M3.1-Flash',reasoningEffort:'low'}).reasoning_effort,'low')
 assert.equal(body({model:'MiniMax-M3.1-Flash'}).reasoning_effort,undefined)
 assert.equal(body({model:'other-model',reasoningEffort:'low'}).reasoning_effort,undefined)
})
