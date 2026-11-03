"use strict"
// Bounded JSON Schema dialect for executable tool contracts. Unknown constraints
// are rejected, never silently ignored. No remote references or regex execution.
var DIALECT="studio.tool-schema.v1"
function fault(code,path){var e=new Error(code+(path?" at "+path:""));e.code=code;e.httpStatus=422;throw e}
function own(o,k){return Object.prototype.hasOwnProperty.call(o,k)}
function plain(v){return v!==null&&typeof v==="object"&&!Array.isArray(v)}
function canonical(v){
  if(v===null||typeof v!=="object")return JSON.stringify(v)
  if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]"
  return "{"+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+":"+canonical(v[k])}).join(",")+"}"
}
var annotations=["$schema","$id","title","description","default","examples","deprecated","readOnly","writeOnly","$comment"]
var constraints=["$ref","$defs","definitions","type","properties","required","additionalProperties","items","minItems","maxItems","uniqueItems","minLength","maxLength","minimum","maximum","exclusiveMinimum","exclusiveMaximum","enum","const","anyOf","oneOf","allOf","not","minProperties","maxProperties"]
function resolve(root,ref){
  if(typeof ref!=="string"||ref.indexOf("#/")!==0)fault("unsupported_tool_schema_reference")
  var node=root,parts=ref.slice(2).split("/")
  for(var i=0;i<parts.length;i++){
    var key=parts[i].replace(/~1/g,"/").replace(/~0/g,"~")
    if(!plain(node)||!own(node,key))fault("invalid_tool_schema_reference")
    node=node[key]
  }
  return node
}
function inspect(schema){
  var state={nodes:0},root=schema,referenceTargets=[]
  function walk(s,depth){
    if(++state.nodes>1024||depth>32)fault("tool_schema_complexity_limit")
    if(typeof s==="boolean")return
    if(!plain(s))fault("invalid_tool_schema")
    Object.keys(s).forEach(function(k){if(annotations.indexOf(k)<0&&constraints.indexOf(k)<0)fault("unsupported_tool_schema_keyword",k)})
    if(own(s,"$ref")){
      var target=resolve(root,s.$ref)
      if(typeof target!=="boolean"&&!plain(target))fault("invalid_tool_schema_reference")
      if(referenceTargets.indexOf(target)<0){referenceTargets.push(target);walk(target,depth+1)}
    }
    if(own(s,"type")){
      var types=Array.isArray(s.type)?s.type:[s.type]
      if(!types.length||types.some(function(t){return ["null","boolean","object","array","number","integer","string"].indexOf(t)<0}))fault("invalid_tool_schema_type")
    }
    ;["properties","$defs","definitions"].forEach(function(k){if(own(s,k)){if(!plain(s[k]))fault("invalid_tool_schema");Object.keys(s[k]).forEach(function(key){walk(s[k][key],depth+1)})}})
    if(own(s,"required")&&(!Array.isArray(s.required)||s.required.some(function(k){return typeof k!=="string"})))fault("invalid_tool_schema_required")
    ;["additionalProperties","items","not"].forEach(function(k){if(own(s,k))walk(s[k],depth+1)})
    ;["anyOf","oneOf","allOf"].forEach(function(k){if(own(s,k)){if(!Array.isArray(s[k])||!s[k].length||s[k].length>30)fault("invalid_tool_schema_union");s[k].forEach(function(item){walk(item,depth+1)})}})
    ;["minItems","maxItems","minLength","maxLength","minProperties","maxProperties"].forEach(function(k){if(own(s,k)&&(!Number.isInteger(s[k])||s[k]<0))fault("invalid_tool_schema_bound")})
    ;["minimum","maximum","exclusiveMinimum","exclusiveMaximum"].forEach(function(k){if(own(s,k)&&(typeof s[k]!=="number"||!isFinite(s[k])))fault("invalid_tool_schema_bound")})
    if(own(s,"enum")&&(!Array.isArray(s.enum)||!s.enum.length))fault("invalid_tool_schema_enum")
    if(own(s,"uniqueItems")&&typeof s.uniqueItems!=="boolean")fault("invalid_tool_schema")
  }
  if(JSON.stringify(schema).length>65536)fault("tool_schema_size_limit")
  walk(schema,0);return schema
}
function validate(schema,value){
  inspect(schema)
  var root=schema,visits=0
  function matches(s,v,path,depth){
    if(++visits>20000||depth>40)fault("tool_validation_complexity_limit")
    if(s===true)return true
    if(s===false)return false
    if(own(s,"$ref")&&!matches(resolve(root,s.$ref),v,path,depth+1))return false
    if(own(s,"type")){
      var list=Array.isArray(s.type)?s.type:[s.type]
      var type=v===null?"null":Array.isArray(v)?"array":typeof v
      if(!list.some(function(t){return t===type||(t==="integer"&&typeof v==="number"&&Number.isInteger(v))}))return false
    }
    if(typeof v==="number"&&!isFinite(v))return false
    if(own(s,"const")&&canonical(s.const)!==canonical(v))return false
    if(own(s,"enum")&&!s.enum.some(function(item){return canonical(item)===canonical(v)}))return false
    if(s.allOf&&!s.allOf.every(function(item){return matches(item,v,path,depth+1)}))return false
    if(s.anyOf&&!s.anyOf.some(function(item){return matches(item,v,path,depth+1)}))return false
    if(s.oneOf&&s.oneOf.filter(function(item){return matches(item,v,path,depth+1)}).length!==1)return false
    if(own(s,"not")&&matches(s.not,v,path,depth+1))return false
    if(typeof v==="number"){
      if(own(s,"minimum")&&v<s.minimum||own(s,"maximum")&&v>s.maximum||own(s,"exclusiveMinimum")&&v<=s.exclusiveMinimum||own(s,"exclusiveMaximum")&&v>=s.exclusiveMaximum)return false
    }
    if(typeof v==="string"){
      // JSON Schema string lengths count Unicode code points, not UTF-16 units.
      var length=Array.from(v).length
      if(own(s,"minLength")&&length<s.minLength||own(s,"maxLength")&&length>s.maxLength)return false
    }
    if(Array.isArray(v)){
      if(own(s,"minItems")&&v.length<s.minItems||own(s,"maxItems")&&v.length>s.maxItems)return false
      var seen=Object.create(null)
      for(var i=0;i<v.length;i++){
        if(own(s,"items")&&!matches(s.items,v[i],path+"[]",depth+1))return false
        if(s.uniqueItems){var key=canonical(v[i]);if(own(seen,key))return false;seen[key]=true}
      }
    }
    if(plain(v)){
      var keys=Object.keys(v),props=s.properties||{}
      if(own(s,"minProperties")&&keys.length<s.minProperties||own(s,"maxProperties")&&keys.length>s.maxProperties)return false
      if(s.required&&s.required.some(function(k){return !own(v,k)}))return false
      for(var j=0;j<keys.length;j++){
        var k=keys[j]
        if(own(props,k)){if(!matches(props[k],v[k],path+"."+k,depth+1))return false}
        else if(own(s,"additionalProperties")&&!matches(s.additionalProperties,v[k],path+".*",depth+1))return false
      }
    }
    return true
  }
  if(!matches(schema,value,"$",0))fault("tool_schema_validation_failed")
  return true
}
function external(inputSchema,outputSchema){
  var input=inputSchema===null||inputSchema===undefined?{type:"object"}:inputSchema
  var output=outputSchema===null||outputSchema===undefined?null:outputSchema
  inspect(input);if(output!==null)inspect(output)
  return {dialect:DIALECT,input_schema:input,output_schema:output,effect:"untrusted_external",idempotency:"not_guaranteed",max_input_chars:65536,max_output_chars:4194304}
}
function checkInput(contract,value){
  if(JSON.stringify(value).length>contract.max_input_chars)fault("tool_input_size_limit")
  validate(contract.input_schema,value)
}
function checkOutput(contract,envelope,text){
  if(JSON.stringify({text:String(text||""),envelope:envelope||null}).length>contract.max_output_chars)fault("tool_output_size_limit")
  if(contract.output_schema===null)return {status:"not_declared",dialect:DIALECT}
  if(!envelope||!own(envelope,"structuredContent"))fault("structured_tool_output_required")
  validate(contract.output_schema,envelope.structuredContent)
  return {status:"valid",dialect:DIALECT}
}
module.exports={dialect:DIALECT,inspect:inspect,validate:validate,external:external,checkInput:checkInput,checkOutput:checkOutput,canonical:canonical}
