import assert from 'node:assert/strict'
// Count-only evidence. No row bodies, credentials or pretend DB authority.
export const toolMutableBusinessTables=Object.freeze(['agentstudio.tool_connections','agentstudio.tool_connection_headers','agentstudio.audit_events','agentstudio_auth.sessions'])
export function assertOriginalToolBusinessBaseline(before,after,{toolDelta,headerDelta,auditDelta}){
 assert(before&&after&&Object.getPrototypeOf(before)===Object.prototype&&Object.getPrototypeOf(after)===Object.prototype)
 assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort())
 for(const key of Object.keys(before)){
  assert(/^(?:agentstudio|agentstudio_auth)\.[a-z_]+$/.test(key));assert(Number.isSafeInteger(before[key])&&before[key]>=0);assert(Number.isSafeInteger(after[key])&&after[key]>=0)
  if(key==='agentstudio_auth.sessions'){assert(after[key]>=before[key]);continue}
  const delta=key==='agentstudio.tool_connections'?toolDelta:key==='agentstudio.tool_connection_headers'?headerDelta:key==='agentstudio.audit_events'?auditDelta:0
  assert(Number.isSafeInteger(delta));assert.equal(after[key],before[key]+delta,key)
 }
 return Object.freeze({all_captured_business_table_counts_checked:true,unrelated_table_count_changes:0,tool_delta:toolDelta,header_delta:headerDelta,business_audit_delta:auditDelta,session_count_growth_disclosed:true,row_content_immutability_claimed:false})
}
export function originalToolInheritedReadinessProof(rows){
 assert(Array.isArray(rows)&&rows.length===2);assert.deepEqual(rows.map(r=>r.owner).sort(),['alice','bob'])
 for(const row of rows){assert.equal(row.status,'ok');assert.equal(row.revision,2);assert.equal(row.actual_probe_audit_count,1);assert.equal(row.synthetic_probe_audit,true)}
 return Object.freeze({original_F01_setup_synthetic_readiness_probes:2,original_F01_setup_model_credential_reads:2,source:'unchanged agentAssessmentTcpFixture models.testConnection callback; no network transport',inherited_status_rows_verified:true,page_model_probe_requests:0,page_tool_execution_requests:0,paid_external_provider_calls:0})
}
