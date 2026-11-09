"use strict"
// Trusted, versioned extension registry. A model cannot register SQL or schemas.
// Platform objects carry identity/version/ACL; domain extensions define payloads.
function fail(code) { var e=new Error(code);e.code=code;e.httpStatus=400;throw e }
function object(value, keys) {
  if (!value || typeof value!=="object" || Array.isArray(value)) fail("invalid_business_payload")
  Object.keys(value).forEach(function(key){if(keys.indexOf(key)<0)fail("unknown_business_field")})
}
function string(value, max, optional) {
  if(optional && value===undefined)return
  if(typeof value!=="string" || !value.trim() || value.length>max)fail("invalid_business_string")
}
function enumValue(value, values) { if(values.indexOf(value)<0)fail("invalid_business_enum") }
function date(value){
  if(value===null)return
  if(typeof value!=="string"||!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value))fail("invalid_fact_time")
  var parts=value.split("-"),year=Number(parts[0]),month=parts.length>1?Number(parts[1]):1,day=parts.length>2?Number(parts[2]):1
  if(year<1||month<1||month>12||day<1||day>31)fail("invalid_fact_time")
  var days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31]
  if(day>days[month-1])fail("invalid_fact_time")
}
function canonical(value) {
  if(value===null||typeof value!=="object")return JSON.stringify(value)
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]"
  return "{"+Object.keys(value).sort().map(function(key){return JSON.stringify(key)+":"+canonical(value[key])}).join(",")+"}"
}
function strings(value,max) {
  if(!Array.isArray(value)||value.length>max)fail("invalid_business_list")
  value.forEach(function(v){string(v,500,false)})
}
var schemas={
  "research.entity.v1":function(p){
    object(p,["canonical_name","entity_type","aliases","identity_status","identity_basis"])
    string(p.canonical_name,300);enumValue(p.entity_type,["PERSON","ORGANIZATION","FUND","MANAGER"])
    strings(p.aliases,30);enumValue(p.identity_status,["UNRESOLVED","CANDIDATE","CONFIRMED"])
    string(p.identity_basis,4000,true)
  },
  "research.claim.v1":function(p){
    object(p,["subject_id","predicate","object_value","valid_from","valid_to","status","missing"])
    string(p.subject_id,40);string(p.predicate,200);string(p.object_value,4000)
    enumValue(p.status,["CANDIDATE","SOURCE_SUPPORTED","CONFLICT","SUPERSEDED","INVALIDATED"])
    date(p.valid_from);date(p.valid_to)
    if(p.valid_from && p.valid_to && p.valid_from>p.valid_to)fail("invalid_fact_time")
    strings(p.missing,30)
  },
  "research.answer.v1":function(p){
    object(p,["question_id","answer","status","claim_ids","missing","as_of"])
    string(p.question_id,40);string(p.answer,8000)
    enumValue(p.status,["ANSWERED","PARTIAL","UNKNOWN","CONFLICT"])
    strings(p.claim_ids,50);strings(p.missing,30);string(p.as_of,40)
  },
  "research.relation.v1":function(p){
    object(p,["from_id","to_id","relation_type","description","valid_from","valid_to","status","missing"])
    string(p.from_id,40);string(p.to_id,40);if(p.from_id===p.to_id)fail("relation_self_reference")
    enumValue(p.relation_type,["EMPLOYMENT","BOARD","EDUCATION","CO_WORK","INTRODUCTION","OTHER"])
    string(p.description,4000);date(p.valid_from);date(p.valid_to)
    if(p.valid_from&&p.valid_to&&p.valid_from>p.valid_to)fail("invalid_fact_time")
    enumValue(p.status,["CANDIDATE","SOURCE_SUPPORTED","CONFLICT","SUPERSEDED","INVALIDATED"]);strings(p.missing,30)
  },
}
function validate(schema,payload) {
  if(!Object.prototype.hasOwnProperty.call(schemas,schema))fail("business_schema_not_registered")
  schemas[schema](payload)
}
export {validate as validateBusinessSchema,object as businessObject,string as businessString,strings as businessStrings,canonical as businessCanonical}; export const businessSchemaNames=Object.freeze(Object.keys(schemas))
