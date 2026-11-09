// Called only by the independently admitted fresh original-page F08 fixture.
// Real Native Cookies/SQL/repository mappings; no pool or actor substitution.
export async function assertOriginalShareExpectedEmployeeRefused(fixture,actualShareCode){
 const {default:assert}=await import('node:assert/strict'),{randomUUID}=await import('node:crypto')
 assert.match(actualShareCode,/^[A-Za-z0-9]{48}$/)
 const before=await fixture.counts(),header={'X-AgentStudio-Expected-Employee':fixture.users.alice}
 const preview=await fixture.request('alice','/api/v2/internal-templates',{action:'preview',id:fixture.resources.alice.spec.id});assert.equal(preview.status,200)
 const listed=await fixture.request('alice','/api/v2/internal-templates');assert.equal(listed.status,200);const invite=listed.body.invites.find(v=>v.status==='active');assert(invite)
 const intents=[{action:'create',request_id:randomUUID(),source:preview.body.source,preview_hash:preview.body.preview_hash,confirm_safe:true,acknowledgement:'SHARE_REVIEWED_AGENT_TEMPLATE_ONCE'},
  {action:'redeem',request_id:randomUUID(),share_code:actualShareCode,confirm:true},{action:'revoke',request_id:randomUUID(),id:invite.id,confirm:true}]
 for(const intent of intents)for(const confirm of [false,true]){
  const response=await fixture.request('bob','/api/v2/internal-templates'+(confirm?'/confirm':''),confirm?{intent}:intent,{headers:header})
  assert.equal(response.status,409);assert.equal(response.body.error,'agent_internal_share_employee_changed');assert.deepEqual(await fixture.counts(),before)
 }
 return Object.freeze({actual_Bob_Cookie_expected_Alice_refusals:6,status:409,ledgers_unchanged:true,actual_repository_actor_mapping:true,observed_data_only:true})
}
