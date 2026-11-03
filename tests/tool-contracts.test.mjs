import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const context={module:{exports:{}}}
vm.runInNewContext(fs.readFileSync('pocketbase/pb_hooks/modules/tool_contracts.js','utf8'),context)
const schema=context.module.exports

test('validates required, bounds, Unicode, nested arrays, local references and unions',()=>{
  const contract={type:'object',required:['query','rows'],additionalProperties:false,
    $defs:{row:{type:'object',required:['count'],properties:{count:{type:'integer',minimum:1,maximum:5}},additionalProperties:false}},
    properties:{query:{type:'string',minLength:1,maxLength:2},rows:{type:'array',items:{$ref:'#/$defs/row'},minItems:1,uniqueItems:true},
      optional:{anyOf:[{type:'null'},{type:'string',enum:['yes']}]}}}
  assert.equal(schema.validate(contract,{query:'😀',rows:[{count:2}],optional:null}),true)
  for(const value of [{rows:[{count:2}]},{query:'abc',rows:[]},{query:'q',rows:[{count:1},{count:1}]},{query:'q',rows:[{count:1.5}]},{query:'q',rows:[{count:2}],extra:true}])
    assert.throws(()=>schema.validate(contract,value),{code:'tool_schema_validation_failed'})
})

test('unsupported constraints and remote references fail closed with bounded recursion',()=>{
  for(const keyword of ['pattern','format','if','unevaluatedProperties'])
    assert.throws(()=>schema.inspect({[keyword]:'unsupported'}),{code:'unsupported_tool_schema_keyword'})
  assert.throws(()=>schema.inspect({$ref:'https://fixture.invalid/schema'}),{code:'unsupported_tool_schema_reference'})
  assert.throws(()=>schema.inspect({title:'not a schema',$ref:'#/title'}),{code:'invalid_tool_schema_reference'})
  assert.throws(()=>schema.inspect({default:{pattern:'unsupported'},$ref:'#/default'}),{code:'unsupported_tool_schema_keyword'})
  assert.throws(()=>schema.validate({$defs:{cycle:{$ref:'#/$defs/cycle'}},$ref:'#/$defs/cycle'},{}),{code:'tool_validation_complexity_limit'})
})

test('output contracts require actual structured values, never treat JSON fragments as valid',()=>{
  const contract=schema.external({type:'object'},{type:'object',required:['answer'],properties:{answer:{type:'string'}},additionalProperties:false})
  assert.throws(()=>schema.checkOutput(contract,{text:'{"answer":'},'{"answer":'),{code:'structured_tool_output_required'})
  assert.throws(()=>schema.checkOutput(contract,{structuredContent:{answer:3}},''),{code:'tool_schema_validation_failed'})
  assert.equal(schema.checkOutput(contract,{structuredContent:{answer:'evidence'}},'').status,'valid')
  assert.equal(contract.effect,'untrusted_external');assert.equal(contract.idempotency,'not_guaranteed')
  contract.max_input_chars=3;assert.throws(()=>schema.checkInput(contract,{query:'too large'}),{code:'tool_input_size_limit'})
  const textContract=schema.external({type:'object'},null);textContract.max_output_chars=100
  assert.throws(()=>schema.checkOutput(textContract,{},'x'.repeat(200)),{code:'tool_output_size_limit'})
})

test('malicious JSON keys are data and cannot satisfy missing required fields through prototypes',()=>{
  const value=JSON.parse('{"__proto__":{"allowed":true},"constructor":"data"}')
  assert.equal(schema.validate({type:'object',properties:{__proto__:{type:'string'}},additionalProperties:true},value),true)
  assert.throws(()=>schema.validate({required:['toString']},{}),{code:'tool_schema_validation_failed'})
  assert.equal({}.allowed,undefined)
})
