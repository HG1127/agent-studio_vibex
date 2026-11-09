import assert from 'node:assert/strict'

/** Conformance CASE, not an admission factory or a runtime attestation.
 * Root/B must invoke it only inside their original independently gated, fresh
 * synthetic genuine071 fixture. requestAs must perform actual Native HTTP
 * with each real employee Cookie; auditCount must query the same actual DB.
 * This helper does not start services, mint trust, accept a URL or make a
 * standalone claim that supplied transports are genuine. It is not run by
 * the pure tests, and has not been executed locally by A. */
export async function verifyNativeCatalogCookieSwitchCase({requestAs,employeeA,employeeB,agentB,auditCount}){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
 assert.equal(typeof requestAs,'function');assert.equal(typeof auditCount,'function')
 assert(uuid.test(employeeA?.profile?.id));assert(uuid.test(employeeB?.profile?.id));assert.notEqual(employeeA.profile.id,employeeB.profile.id);assert(uuid.test(agentB?.id));assert.equal(agentB.owner_user_id,employeeB.profile.id);assert(Number.isSafeInteger(agentB.revision)&&agentB.revision>0)
 const base='/api/v2/original-ui/agent-catalog',get=async actor=>{
  const response=await requestAs(actor,{method:'GET',path:base+'?perPage=50&sort=updated_desc'});assert.equal(response.status,200);const body=await response.json();assert(body.items.every(row=>row.owner_user_id===actor.profile.id));const row=body.items.find(row=>row.id===agentB.id);assert(row,'The fresh synthetic B Agent must appear in the controlled fixture page');return row
 }
 const before=await get(employeeB),events=await auditCount(employeeB.profile.id,agentB.id);assert.equal(typeof before.favorite,'boolean');assert.equal(before.revision,agentB.revision)
 // A's still-open UI sends its old verified /me UUID, but the shared browser
 // Cookie has changed to B. Choose B's valid owned Agent so ordinary owner
 // lookup alone would not reject the mutation: the concurrency guard must.
 const switched=await requestAs(employeeB,{method:'POST',path:base+'/'+agentB.id+'/favorite',headers:{'X-AgentStudio-Expected-Employee':employeeA.profile.id},body:{favorite:!before.favorite,expected_revision:agentB.revision}})
 assert.equal(switched.status,409);assert.equal((await switched.json()).error,'employee_session_changed')
 // Conversely, a B header cannot authorize A's Cookie as employee B.
 const forgedHeader=await requestAs(employeeA,{method:'POST',path:base+'/'+agentB.id+'/favorite',headers:{'X-AgentStudio-Expected-Employee':employeeB.profile.id},body:{favorite:!before.favorite,expected_revision:agentB.revision}})
 assert.equal(forgedHeader.status,409);assert.equal((await forgedHeader.json()).error,'employee_session_changed')
 for(const expected of[undefined,'invalid']){const response=await requestAs(employeeB,{method:'POST',path:base+'/'+agentB.id+'/favorite',headers:expected===undefined?{}:{'X-AgentStudio-Expected-Employee':expected},body:{favorite:!before.favorite,expected_revision:agentB.revision}});assert.equal(response.status,400);assert.equal((await response.json()).error,'expected_employee_required')}
 const after=await get(employeeB);assert.equal(after.favorite,before.favorite);assert.equal(after.revision,before.revision);assert.equal(await auditCount(employeeB.profile.id,agentB.id),events)
 return Object.freeze({case:'catalog_cookie_switch_precondition',assertions_completed:true,standalone_genuine_admission_claim:false,mutating_requests_refused:4,favorite_changed:false,spec_revision_changed:false,audit_events_added:0})
}
