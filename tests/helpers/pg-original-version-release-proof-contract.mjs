import assert from 'node:assert/strict'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,sha=/^[a-f0-9]{64}$/
const actions=['acceptance','snapshot','publish','restore','delete_draft']
const semantic=v=>{const{replayed,...rest}=v;return JSON.stringify(Object.fromEntries(Object.entries(rest).sort(([a],[b])=>a.localeCompare(b))))}
export function verifyReleaseCommitEvidence({ack,expected,receipt,before,after,audit,nativeOwner}){
 assert(actions.includes(expected.action));for(const key of ['owner','spec','request'])assert(uuid.test(expected[key]));assert(sha.test(expected.request_sha256))
 assert.equal(nativeOwner,expected.owner,'actual original Cookie /me owner required')
 assert.equal(ack.protocol,'native_original_version_release_v1');assert.equal(ack.owner_user_id,expected.owner)
 assert.equal(ack.item.spec_id,expected.spec);assert.equal(ack.item.request_id,expected.request);assert.equal(ack.item.replayed,false)
 assert.equal(receipt.actor_user_id,expected.owner);assert.equal(receipt.spec_id,expected.spec);assert.equal(receipt.request_id,expected.request);assert.equal(receipt.action,expected.action);assert.equal(receipt.request_sha256,expected.request_sha256);assert.equal(semantic(receipt.result),semantic(ack.item))
 assert.equal(after.receipts,before.receipts+1);assert.equal(after.audits,before.audits+1)
 assert.equal(audit.owner_user_id,expected.owner);assert.equal(audit.actor_user_id,expected.owner);assert.equal(audit.target_kind,'agent_spec');assert.equal(audit.target_id,expected.spec);assert.equal(audit.result,'succeeded');assert.equal(audit.action,'agent.release.'+expected.action)
 for(const key of ['version_id','run_id'])if(ack.item[key]!==undefined)assert.equal(audit.metadata[key],ack.item[key])
 return Object.freeze({action:expected.action,request_id:expected.request,request_sha256:expected.request_sha256,spec_id:expected.spec,owner_user_id:expected.owner,actual_native_cookie_owner:true,actual_exact_receipt_row:true,actual_owner_actor_audit:true,receipt_delta:1,audit_delta:1})
}
export const versionReleaseGaps=Object.freeze(['Current succeeded acceptance through an actual approved model/private dispatch/provider remains unverified; this story stops at a real Worker-created approval.','The original run-detail model fee-preview/approval contract remains separate.','Nonempty MCP resource restore, waiting-input and real employee UAT remain separate acceptance.','No complete publication-event ledger or all historical versions are claimed.'])
export const versionReleaseStepKeys=Object.freeze(['actual_original_page_and_partial_history','actual_cookie_owner_and_CAS_rollback','actual_snapshot_publish_restore_delete','actual_committed_prefix_and_browser_requestfailed','actual_GET_only_exact_receipt_recovery','current_source_and_confirmation_refresh','actual_worker_pending_approval_and_original_return','actual_owner_change_and_late_initialization_fence'])
export function assertVersionReleaseObservation(o){
 assert.deepEqual(Object.keys(o).sort(),['story','head','steps','zero','actual_worker_ticks','acceptance_status','test_current','http','actual_owner_audit','receipts','contract_gaps','story_completed','current_worker_pass','provider_network_acceptance','full_page_complete','production_GO','cleanup_failures'].sort())
 assert.deepEqual(Object.keys(o.http).sort(),['requestfailed_after_actual_commit','GET_receipt_queries','POST_replays','committed_prefixes'].sort());assert.equal(o.http.committed_prefixes,o.http.requestfailed_after_actual_commit);assert.equal(o.actual_owner_audit,true)
 assert(Array.isArray(o.receipts)&&o.receipts.length===5&&new Set(o.receipts.map(r=>r.request_id)).size===5);for(const r of o.receipts){assert.deepEqual(Object.keys(r).sort(),['request_id','action','request_sha256'].sort());assert(uuid.test(r.request_id));assert(sha.test(r.request_sha256));assert(actions.includes(r.action))}assert.deepEqual(o.receipts.map(r=>r.action).sort(),[...actions].sort())
 assert.deepEqual(Object.keys(o.zero).sort(),['provider_calls','external_effects','model_material_reads','extra_model_probes','inherited_seed_probes'].sort());assert.equal(o.zero.inherited_seed_probes,2)
 assert.equal(o.story,'original-version-release');assert(/^[a-f0-9]{40}$/.test(o.head));assert.equal(o.provider_network_acceptance,false);assert.equal(o.full_page_complete,false);assert.equal(o.current_worker_pass,false);assert.equal(o.production_GO,false)
 assert.deepEqual(Object.keys(o.steps).sort(),[...versionReleaseStepKeys].sort());assert(versionReleaseStepKeys.every(k=>o.steps[k]===true));assert.equal(o.story_completed,true)
 assert.equal(o.zero.provider_calls,0);assert.equal(o.zero.external_effects,0);assert.equal(o.zero.model_material_reads,0);assert.equal(o.zero.extra_model_probes,0)
 assert(Number.isInteger(o.actual_worker_ticks)&&o.actual_worker_ticks>=1&&o.actual_worker_ticks<=2);assert.equal(o.acceptance_status,'awaiting_approval');assert.equal(o.test_current,false);assert.equal(o.http.requestfailed_after_actual_commit,5);assert.equal(o.http.GET_receipt_queries,5);assert.equal(o.http.POST_replays,0);assert.deepEqual(o.cleanup_failures,[]);assert.deepEqual(o.contract_gaps,[...versionReleaseGaps]);return true
}
