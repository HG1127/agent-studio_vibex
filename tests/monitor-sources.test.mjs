import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
const schemas={canonical:v=>JSON.stringify(v)},m={exports:{}}
vm.runInNewContext(fs.readFileSync('pocketbase/pb_hooks/modules/business_monitors.js','utf8'),{module:m,require:()=>schemas,__hooks:'', $security:{sha256:s=>createHash('sha256').update(s).digest('hex')}})
const receipt=m.exports.sourceReceipt,source={source_id:'source',adapter_id:'http.json-items.v1',scope_key:'watched-roles'},base={coverage:{stored_complete:true},redacted:false,structuredContent:{scope_key:'watched-roles',complete:true,has_more:false,next_cursor:null,items:[{person:'p',role:'r'}]}}
test('registered response projection ignores transport/update timestamps, with exact scoped complete items',()=>{
  const a=receipt(source,base),b=receipt(source,{...base,structuredContent:{...base.structuredContent,updated_at:'new timestamp',page_title:'changed wording'}})
  assert.equal(a.projection_hash,b.projection_hash);assert.notEqual(a.projection_hash,receipt(source,{...base,structuredContent:{...base.structuredContent,items:[{person:'p',role:'new'}]}}).projection_hash)
  assert.ok(receipt(source,{...base,structuredContent:{...base.structuredContent,items:[]}}).projection_hash)
})
test('missing pages, unknown cursor/coverage, wrong scope and redaction cannot mean no change',()=>{
  for(const patch of [{complete:false},{has_more:true},{next_cursor:'page2'},{next_cursor:undefined},{scope_key:'another'},{items:null}])assert.throws(()=>receipt(source,{...base,structuredContent:{...base.structuredContent,...patch}}))
  for(const patch of [{redacted:true},{coverage:{stored_complete:false}},{usable_as_evidence:false},{validation:{status:'invalid'}}])assert.throws(()=>receipt(source,{...base,...patch}))
})
test('text source requires an actual complete supported HTTP response and every positive marker',()=>{
  const source={source_id:'page',adapter_id:'web.text.v1',required_markers:['Expected person','Original source']},envelope={coverage:{stored_complete:true},redacted:false,http_response:{status:200,complete:true,empty:false,media_type:'text/html; charset=utf-8'},text:'Expected person / Original source / '+'verified text '.repeat(10)}
  assert.ok(receipt(source,envelope).projection_hash)
  for(const patch of [{http_response:null},{http_response:{...envelope.http_response,status:undefined}},{http_response:{...envelope.http_response,status:401}},{http_response:{...envelope.http_response,empty:true}},{http_response:{...envelope.http_response,media_type:'application/pdf'}},{text:'login required'}])assert.throws(()=>receipt(source,{...envelope,...patch}))
})
