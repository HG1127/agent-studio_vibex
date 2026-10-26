import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentCollaborationFixture} from './helpers/agent-collaboration-fixture.mjs'
import {inspectEmployeeGovernance} from '../src/native-employee-governance-audit.mjs'
import {employeeChangeChoice} from '../src/native-employee-governance.mjs'
import {withActor,AgentSpecRepository} from '../src/repository.ts'
import {safeAgentSpec} from '../src/contracts.ts'

test('governance accepts closed full-state choices, not caller identity, passwords or arbitrary patches',()=>{
  const choice={request_id:randomUUID(),target_id:randomUUID(),expected_revision:1,is_admin:false,enabled:true,share_enabled:true,confirm:true}
  assert.deepEqual(employeeChangeChoice(choice),choice)
  for(const change of [{owner_id:randomUUID()},{password:'secret'},{expected_revision:0},{expected_revision:Number.MAX_SAFE_INTEGER-1},{confirm:false},{enabled:1},{target_id:'alice'}])
    assert.throws(()=>employeeChangeChoice({...choice,...change}),/invalid_employee_governance_input/)
})

test('native governance: admin CAS/receipts, disabled listing, session invalidation, private audit and self password lifecycle',async()=>{
  const f=await agentCollaborationFixture(),store=f.store
  try{
    assert.equal(await inspectEmployeeGovernance(f.api),true)
    const created=await store.createGovernedEmployee(f.session.token,{email:'manager@example.test',password:'SyntheticManagerPassword#2026',display_name:'Second manager',is_admin:true,share_enabled:false})
    assert.equal(created.is_admin,true);assert.equal(created.share_enabled,false);assert.equal(created.revision,1)
    const manager=await store.login('manager@example.test','SyntheticManagerPassword#2026')
    const bob=await store.login('collaborator@example.test','SyntheticCollaborator#2026')
    const role=await new AgentSpecRepository(f.pool).create(f.bob,'Private role',safeAgentSpec({goal:'Private owner task'}))
    const choice={request_id:randomUUID(),target_id:f.recipient.id,expected_revision:1,is_admin:false,enabled:false,share_enabled:false,confirm:true}
    await assert.rejects(store.changeEmployee(bob.token,choice),/admin_session_required/)
    const disabled=await store.changeEmployee(f.session.token,choice)
    assert.equal(disabled.status,'disabled');assert.equal(disabled.revision,2)
    assert.equal(await store.verifySession(bob.token),null)
    assert.ok((await store.listEmployees(f.session.token)).some(e=>e.id===f.recipient.id&&!e.enabled&&e.status==='disabled'&&e.revision===2))
    await assert.rejects(new AgentSpecRepository(f.pool).get(f.bob,role.id),/employee_not_provisioned/)
    assert.equal((await store.changeEmployee(f.session.token,choice)).replayed,true)
    assert.equal((await store.confirmEmployeeChange(f.session.token,choice)).revision,2)
    await assert.rejects(store.confirmEmployeeChange(f.session.token,{...choice,request_id:randomUUID()}),/employee_receipt_not_found/)
    await assert.rejects(store.changeEmployee(f.session.token,{...choice,enabled:true}),/employee_request_conflict/)
    await assert.rejects(store.changeEmployee(f.session.token,{...choice,request_id:randomUUID(),enabled:true}),/employee_revision_changed/)
    const enable={...choice,request_id:randomUUID(),expected_revision:2,enabled:true}
    await store.changeEmployee(manager.token,enable)
    assert.equal(await store.verifySession(bob.token),null)
    const bobNew=await store.login('collaborator@example.test','SyntheticCollaborator#2026')
    // A template sharing flag must not disable own private role access.
    assert.equal((await new AgentSpecRepository(f.pool).get(f.bob,role.id)).id,role.id)
    assert.equal((await store.getSessionProfile(bobNew.token)).share_enabled,false)
    for(const field of [{enabled:false},{is_admin:false}])await assert.rejects(store.changeEmployee(f.session.token,{...enable,target_id:f.owner.id,expected_revision:1,...field,request_id:randomUUID()}),/cannot_disable_self_admin/)
    const demote={...enable,request_id:randomUUID(),target_id:created.id,expected_revision:1,is_admin:false,share_enabled:false}
    await store.changeEmployee(f.session.token,demote)
    assert.equal(await store.verifySession(manager.token),null)
    // A second actor cannot replay another administrator's private receipt.
    const promoted=await store.changeEmployee(f.session.token,{...demote,request_id:randomUUID(),expected_revision:2,is_admin:true})
    assert.equal(promoted.revision,3)
    const managerNew=await store.login('manager@example.test','SyntheticManagerPassword#2026')
    await assert.rejects(store.confirmEmployeeChange(managerNew.token,choice),/employee_receipt_not_found/)
    const before=(await f.db.query('SELECT count(*)::int AS n FROM agentstudio_auth.employee_governance_events')).rows[0].n
    await assert.rejects(store.changePassword(bobNew.token,{old_password:'WrongCurrentPassword#2026',new_password:'NewSyntheticBobPassword#2026'}),/invalid_current_password/)
    assert.ok(await store.verifySession(bobNew.token))
    const second=await store.login('collaborator@example.test','SyntheticCollaborator#2026')
    assert.deepEqual(await store.changePassword(bobNew.token,{old_password:'SyntheticCollaborator#2026',new_password:'NewSyntheticBobPassword#2026'}),{ok:true,reauthenticate:true})
    assert.equal(await store.verifySession(bobNew.token),null);assert.equal(await store.verifySession(second.token),null)
    await assert.rejects(store.login('collaborator@example.test','SyntheticCollaborator#2026'),/invalid_employee_credentials/)
    assert.ok((await store.login('collaborator@example.test','NewSyntheticBobPassword#2026')).authenticated)
    const events=(await f.db.query('SELECT action,request_id,before_state,after_state FROM agentstudio_auth.employee_governance_events')).rows
    assert.equal(events.length,before+1);assert.doesNotMatch(JSON.stringify(events),/Password|scrypt|email|token_digest/)
    for(const drift of ["GRANT SELECT ON agentstudio_auth.employee_governance_events TO agentstudio_api","GRANT UPDATE ON agentstudio_auth.employee_governance_events TO agentstudio_native_auth","ALTER TABLE agentstudio_auth.employee_governance_events NO FORCE ROW LEVEL SECURITY","GRANT UPDATE(display_name) ON agentstudio.users TO agentstudio_native_auth","GRANT SELECT(share_enabled) ON agentstudio_auth.accounts TO agentstudio_collaboration"])
      await f.rollback(async db=>{await db.query(drift);await assert.rejects(inspectEmployeeGovernance(db),/unsafe_employee_governance_privileges/)})
    await withActor(f.pool,f.alice,async db=>{await assert.rejects(db.query('SELECT * FROM agentstudio_auth.employee_governance_events'),/permission denied/) }).catch(error=>{
      // A denied SQL statement aborts this read-only test transaction.
      assert.match(error.message,/current transaction is aborted/)
    })
  }finally{await f.close()}
})
