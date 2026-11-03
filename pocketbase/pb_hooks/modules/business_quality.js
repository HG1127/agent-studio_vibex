"use strict"
// Trusted validator plugin registry. JSON parsing, headings and model "final"
// never grant business acceptance. Human semantic review is a separate ledger.
function fault(code,status){var e=new Error(code);e.code=code;e.httpStatus=status||400;throw e}
function ensure(app){
  app.db().newQuery("CREATE TABLE IF NOT EXISTS agent_studio_business_reviews (id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,case_id TEXT NOT NULL,record_id TEXT NOT NULL,record_version INTEGER NOT NULL,decision TEXT NOT NULL,rationale TEXT NOT NULL,actor_uid TEXT NOT NULL,created_ms INTEGER NOT NULL)").execute()
  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_business_reviews_record ON agent_studio_business_reviews(owner_uid,case_id,record_id,record_version,created_ms)").execute()
}
function review(app,uid,caseId,input){
  var data=require(__hooks+"/modules/business_data.js"),schema=require(__hooks+"/modules/business_schemas.js")
  schema.object(input,["record_id","record_version","decision","rationale"])
  schema.string(input.rationale,4000)
  if(input.decision!=="accepted"&&input.decision!=="rejected")fault("invalid_review_decision")
  if(!Number.isInteger(input.record_version)||input.record_version<1)fault("invalid_record_version")
  var record=data.get(app,uid,caseId,String(input.record_id),input.record_version)
  if(["research.claim.v1","research.relation.v1"].indexOf(record.schema_id)<0)fault("claim_review_required")
  if(record.payload.status!=="SOURCE_SUPPORTED" || !record.source_refs.length)fault("supported_claim_required",422)
  var current=data.get(app,uid,caseId,record.record_id)
  if(current.version!==record.version)fault("review_version_stale",409)
  var id=$security.randomString(20),now=new Date().getTime()
  app.db().newQuery("INSERT INTO agent_studio_business_reviews (id,owner_uid,case_id,record_id,record_version,decision,rationale,actor_uid,created_ms) VALUES ({:id},{:uid},{:cid},{:rid},{:v},{:decision},{:rationale},{:uid},{:now})")
    .bind({id:id,uid:uid,cid:caseId,rid:record.record_id,v:record.version,decision:input.decision,rationale:input.rationale,now:now}).execute()
  return {review_id:id,record_id:record.record_id,record_version:record.version,decision:input.decision,review_method:"human",actor_uid:uid,created_ms:now}
}
function latestReview(app,uid,caseId,record){
  var rows=arrayOf(new DynamicModel({decision:"",id:"",created_ms:0}))
  app.db().newQuery("SELECT decision,id,created_ms FROM agent_studio_business_reviews WHERE owner_uid={:uid} AND case_id={:cid} AND record_id={:rid} AND record_version={:v} ORDER BY rowid DESC LIMIT 1")
    .bind({uid:uid,cid:caseId,rid:record.record_id,v:record.version}).all(rows)
  return rows.length?String(rows[0].decision):"unreviewed"
}
function researchEvidence(app,uid,caseId){
  var data=require(__hooks+"/modules/business_data.js"),c=data.caseGet(app,uid,caseId),issues=[],answers=[],offset=0,more=true
  // Bound work; don't silently approve an uninspected tail.
  while(more && offset<500){var page=data.query(app,uid,caseId,{schema_id:"research.answer.v1",offset:offset,limit:50});answers=answers.concat(page.items);offset=page.next_offset;more=page.has_more}
  if(more)issues.push({code:"validation_record_limit",severity:"failed"})
  var statuses=[],answered=0,partial=0,unknown=0,unreviewed=0
  for(var i=0;i<c.questions.length;i++){
    var q=c.questions[i],matches=answers.filter(function(a){return a.payload.question_id===q.question_id})
    if(matches.length!==1){issues.push({code:matches.length?"ambiguous_question_answers":"question_unanswered",question_id:q.question_id,severity:"incomplete"});continue}
    var answer=matches[0],state=answer.payload.status
    if(state==="ANSWERED")answered++;else if(state==="PARTIAL")partial++;else unknown++
    if((state==="UNKNOWN"||state==="PARTIAL")&&!answer.payload.missing.length)issues.push({code:"missing_gap_explanation",question_id:q.question_id,severity:"failed"})
    for(var j=0;j<answer.relation_versions.length;j++){
      var link=answer.relation_versions[j],claim=data.get(app,uid,caseId,link.record_id,link.version)
      var current=data.get(app,uid,caseId,link.record_id)
      if(current.version!==link.version)issues.push({code:"answer_claim_version_stale",record_id:claim.record_id,severity:"failed"})
      if(state==="ANSWERED"&&claim.payload.status!=="SOURCE_SUPPORTED")issues.push({code:"answer_claim_not_supported",record_id:claim.record_id,severity:"failed"})
      if(claim.payload.status==="SOURCE_SUPPORTED"){
        for(var k=0;k<claim.relation_versions.length;k++){
          var entityLink=claim.relation_versions[k],entity=data.get(app,uid,caseId,entityLink.record_id,entityLink.version)
          if(entity.schema_id!=="research.entity.v1"||entity.payload.identity_status!=="CONFIRMED")issues.push({code:"claim_identity_unresolved",record_id:claim.record_id,severity:"failed"})
        }
        var reviewState=latestReview(app,uid,caseId,claim)
        if(reviewState==="rejected")issues.push({code:"semantic_review_rejected",record_id:claim.record_id,severity:"failed"})
        else if(reviewState!=="accepted"){unreviewed++;issues.push({code:"semantic_review_required",record_id:claim.record_id,severity:"review"})}
        if(!claim.payload.valid_from)issues.push({code:"fact_time_unknown",record_id:claim.record_id,severity:state==="ANSWERED"?"review":"info"})
      }
    }
    statuses.push({question_id:q.question_id,status:state,record_id:answer.record_id,record_version:answer.version})
  }
  var failed=issues.some(function(issue){return issue.severity==="failed"}),needsReview=issues.some(function(issue){return issue.severity==="review"})
  var complete=statuses.length===c.questions.length && !more
  return {validator_id:"research.evidence.v1",validator_version:1,case_id:caseId,data_space:c.data_space,
    delivery_completeness:complete?"complete":"incomplete",business_quality:failed?"failed":needsReview?"needs_review":complete?(partial||unknown?"qualified_partial":"passed"):"unverified",
    scope:"structured_records_only",free_text_report_quality:"unverified",questions:statuses,issues:issues,
    counts:{answered:answered,partial:partial,unknown:unknown,semantic_review_pending:unreviewed},checked_ms:new Date().getTime()}
}
function researchRelations(app,uid,caseId){
  var data=require(__hooks+"/modules/business_data.js"),c=data.caseGet(app,uid,caseId),relations=[],issues=[],offset=0,more=true
  while(more&&offset<500){var page=data.query(app,uid,caseId,{schema_id:"research.relation.v1",offset:offset,limit:50});relations=relations.concat(page.items);offset=page.next_offset;more=page.has_more}
  if(more)issues.push({code:"validation_record_limit",severity:"failed"})
  relations.forEach(function(r){
    if(r.payload.status!=="SOURCE_SUPPORTED")issues.push({code:"relation_not_supported",record_id:r.record_id,severity:"incomplete"})
    if(!r.payload.valid_from)issues.push({code:"relation_time_unknown",record_id:r.record_id,severity:"review"})
    r.relation_versions.forEach(function(pin){var fixed=data.get(app,uid,caseId,pin.record_id,pin.version),current=data.get(app,uid,caseId,pin.record_id)
      if(current.version!==pin.version)issues.push({code:"relation_entity_version_stale",record_id:r.record_id,severity:"failed"})
      if(fixed.payload.identity_status!=="CONFIRMED")issues.push({code:"relation_identity_unresolved",record_id:r.record_id,severity:"failed"})
    })
    if(r.payload.status==="SOURCE_SUPPORTED"){var review=latestReview(app,uid,caseId,r);if(review!=="accepted")issues.push({code:review==="rejected"?"semantic_review_rejected":"semantic_review_required",record_id:r.record_id,severity:review==="rejected"?"failed":"review"})}
  })
  return {validator_id:"research.relationships.v1",validator_version:1,case_id:caseId,data_space:c.data_space,scope:"declared_relation_records_only",strict_path_quality:"unverified",free_text_report_quality:"unverified",delivery_completeness:!relations.length||more?"incomplete":"complete",business_quality:issues.some(function(i){return i.severity==="failed"})?"failed":issues.some(function(i){return i.severity==="review"})?"needs_review":issues.some(function(i){return i.severity==="incomplete"})||!relations.length?"unverified":"passed",issues:issues,record_count:relations.length,checked_ms:new Date().getTime()}
}
var validators={"research.evidence.v1":researchEvidence,"research.relationships.v1":researchRelations}
function validate(app,uid,caseId,validatorId){
  if(!Object.prototype.hasOwnProperty.call(validators,validatorId))fault("validator_not_registered")
  try{return validators[validatorId](app,uid,caseId)}catch(err){
    if(err.httpStatus===403)return {validator_id:validatorId,case_id:caseId,data_space:require(__hooks+"/modules/business_data.js").caseGet(app,uid,caseId).data_space,scope:"structured_records_only",delivery_completeness:"blocked",business_quality:"blocked",issues:[{code:"source_access_revoked",severity:"failed"}],free_text_report_quality:"unverified",checked_ms:new Date().getTime()}
    throw err
  }
}
module.exports={ensure:ensure,review:review,latestReview:latestReview,validate:validate,validators:Object.keys(validators)}
