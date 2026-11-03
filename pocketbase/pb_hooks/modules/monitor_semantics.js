"use strict"
// Trusted domain adapter: compare fixed relation facts, never webpage dates,
// report wording, record IDs or the absence of a search hit.
var ID="research.relationship-events.v1"
function key(r){var p=r.payload;return JSON.stringify([p.from_id,p.to_id,p.relation_type,p.valid_from])}
function semantic(r){var p=r.payload;return {from_id:p.from_id,to_id:p.to_id,relation_type:p.relation_type,valid_from:p.valid_from,valid_to:p.valid_to,status:p.status}}
function period(value){
  if(!value)return null
  var p=value.split("-"),y=Number(p[0]),m=p.length>1?Number(p[1])-1:0,d=p.length>2?Number(p[2]):1
  var begin=new Date(0);begin.setUTCFullYear(y,m,d);begin.setUTCHours(0,0,0,0)
  var end=new Date(begin.getTime());if(p.length===1)end.setUTCFullYear(y+1);else if(p.length===2)end.setUTCMonth(m+1);else end.setUTCDate(d+1)
  return {start:begin.getTime(),end:end.getTime()}
}
function relations(snapshot,def){return snapshot?snapshot.payload.records.filter(function(r){return r.schema_id==="research.relation.v1"&&def.target_entity_ids.indexOf(r.payload.from_id)>=0&&def.relation_types.indexOf(r.payload.relation_type)>=0}):[]}
function compare(before,after,def,baselineMs,now){
  var prior=relations(before,def),next=relations(after,def),old=Object.create(null),current=Object.create(null),oldIds=Object.create(null),currentIds=Object.create(null),events=[],issues=[]
  function index(rows,target){rows.forEach(function(r){var k=key(r);if(target[k])issues.push({code:"ambiguous_relation_records",record_id:r.record_id});else target[k]=r})}
  index(prior,old);index(next,current)
  prior.forEach(function(r){oldIds[r.record_id]=r});next.forEach(function(r){currentIds[r.record_id]=r})
  var entities=Object.create(null)
  after.payload.records.forEach(function(r){if(r.schema_id==="research.entity.v1")entities[r.record_id]=r})
  function emit(kind,r,notify,reason){events.push({kind:kind,notify:notify,reason:reason,fact_key:key(r),record_id:r.record_id,record_version:r.version,fact:semantic(r)})}
  next.forEach(function(r){
    var p=r.payload,k=key(r),prev=old[k]
    if(r.relation_versions.length!==2)issues.push({code:"relation_endpoints_missing",record_id:r.record_id})
    r.relation_versions.forEach(function(pin){var e=entities[pin.record_id];if(!e||e.version!==pin.version||e.payload.identity_status!=="CONFIRMED")issues.push({code:"relation_identity_or_version_unresolved",record_id:r.record_id})})
    if(!entities[p.from_id]||entities[p.from_id].payload.entity_type!=="PERSON"||!entities[p.to_id]||entities[p.to_id].payload.entity_type==="PERSON")issues.push({code:"relation_endpoint_types_invalid",record_id:r.record_id})
    if(!r.source_refs.length)issues.push({code:"relation_evidence_missing",record_id:r.record_id})
    if(p.status==="CANDIDATE"){issues.push({code:"candidate_relation_pending",record_id:r.record_id});return}
    if(p.status==="CONFLICT"){emit("conflict",r,true,"Conflicting facts require resolution; no employment end is inferred");issues.push({code:"relation_conflict_unresolved",record_id:r.record_id});return}
    if(p.status==="INVALIDATED"||p.status==="SUPERSEDED"){
      if(before&&(!prev||prev.payload.status!==p.status))emit("source_invalidated",r,true,"The fact was explicitly invalidated; this does not establish a role ending")
      return
    }
    if(!before)return
    if(!prev&&oldIds[r.record_id]){emit("fact_corrected",r,true,"The same relation's effective date was corrected; no new role is inferred");return}
    if(!prev){
      var from=period(p.valid_from)
      if(!from){emit("undated_information",r,false,"Effective start is unknown");return}
      if(from.start>now){emit("future_information",r,false,"Future effective date; no current role change");return}
      if(from.end<=baselineMs){emit("historical_information",r,false,"Newly discovered historical fact");return}
      if(from.start<=baselineMs){emit("time_overlap_information",r,false,"Date precision overlaps the previous baseline; no proven new role");return}
      var active=next.some(function(other){return other.record_id!==r.record_id&&other.payload.from_id===p.from_id&&other.payload.status==="SOURCE_SUPPORTED"&&other.payload.valid_to===null&&old[key(other)]})
      emit(active?"additional_role":"role_started",r,true,active?"An additional role is supported; no prior role end is inferred":"Effective start is after the previous baseline")
    }else if(prev.payload.status!=="SOURCE_SUPPORTED")emit("fact_corrected",r,true,"A previously invalid or conflicting fact was explicitly corrected")
    else if(prev.payload.valid_to!==p.valid_to){
      var to=period(p.valid_to)
      if(to&&to.start>baselineMs&&to.start<=now)emit("role_ended",r,true,"Explicit supported end date; never inferred from absence")
      else emit("historical_information",r,false,"Changed or unknown historical end; no proven current role end")
    }
  })
  prior.forEach(function(r){if(!current[key(r)]&&!currentIds[r.record_id])issues.push({code:"prior_fact_not_observed",record_id:r.record_id})})
  if(issues.some(function(i){return i.code!=="relation_conflict_unresolved"}))events=events.filter(function(event){return !event.notify})
  return {adapter_id:ID,scope:"declared_relation_facts_only",strict_path_quality:"unverified",events:events,issues:issues,can_advance:issues.length===0}
}
module.exports={id:ID,compare:compare,relations:relations,key:key,semantic:semantic,period:period}
