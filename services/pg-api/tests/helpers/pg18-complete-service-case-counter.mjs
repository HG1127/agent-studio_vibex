// Fixed assertion groups, not a declared pass total. The fixture calls pass()
// only after its existing real assertions; finish() refuses an incomplete run.
const original=Object.freeze([
 'independently_owned_fresh_full069_53_sources_inert_and_exact57_ledger',
 'inert_worker_missing_approval_wrong_source_and_physical_target_refused_without_record_or_mutation',
 'earlier_trust_and_inherit_refused_original_api_scram_seed_real_catalog_then_replay_refused',
 'separate_native_auth_real_login_output_ack_loss_read_only_observation_no_reenrollment',
 'unchanged_original_whole_first_admin_cli_real_native_login_exclusive_enrollment_and_original_kdf',
 'five_successor_fixed_accounts_actual_scram_login_exact_membership_and_full_api_catalog',
 'external_root_only_records_no_raw_credentials_or_old_receipts_exact131_other_table_images_preserved',
 'original_native_server_serve_nonroot_exact_credential_directory_real_https_admin_cookie_logout_and130_other_images',
])
const review='independent_review_login_actual_preparer_original_nonroot_preflight_and_all133_images_preserved'
const fail=()=>{throw Error('complete_service_actual_case_set_refused')}
export function completeServiceActualCaseSet(includeReview=false){if(typeof includeReview!=='boolean')fail();return Object.freeze(includeReview?[...original,review]:[...original])}
export function createCompleteServiceActualCaseCounter(includeReview=false){
 const expected=completeServiceActualCaseSet(includeReview),completed=[]
 return Object.freeze({
  pass(name){if(completed.length>=expected.length||name!==expected[completed.length])fail();completed.push(name);return Object.freeze({event:'complete069_service_actual_pass',case:name,production_GO:false})},
  finish(){if(completed.length!==expected.length||completed.some((name,i)=>name!==expected[i]))fail();return completed.length},
 })
}
