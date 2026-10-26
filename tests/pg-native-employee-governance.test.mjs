import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativePilotApi} from '../src/lib/pgNativePilotApi.ts'
const choice={request_id:'33333333-3333-4333-8333-333333333333',target_id:'22222222-2222-4222-8222-222222222222',expected_revision:1,is_admin:false,enabled:false,share_enabled:false,confirm:true}
const result={request_id:choice.request_id,target_id:choice.target_id,is_admin:false,enabled:false,status:'disabled',share_enabled:false,revision:2,replayed:true}
test('governance SDK retains original choice after response loss and binds returned actor request, target, revision and complete state',async()=>{
  const calls=[];let drop=true
  const api=createPgNativePilotApi(async(route,init)=>{calls.push({route,init});if(drop){drop=false;throw Error('Synthetic lost response')}
    return new Response(JSON.stringify(result),{status:200})})
  await assert.rejects(api.changeEmployee(choice))
  assert.equal((await api.confirmEmployeeChange(choice)).revision,2)
  assert.equal(calls[0].init.body,calls[1].init.body)
  assert.ok(calls[1].route.endsWith('/employees/confirm'));assert.equal(calls[0].init.credentials,'same-origin')
  assert.equal(Object.hasOwn(calls[0].init.headers,'Authorization'),false)
  for(const change of [{request_id:choice.target_id},{target_id:choice.request_id},{revision:3},{enabled:true},{is_admin:true},{status:'active'},{share_enabled:true},{password_record:'secret'}]){
    const client=createPgNativePilotApi(async()=>new Response(JSON.stringify({...result,...change}),{status:200}))
    await assert.rejects(client.confirmEmployeeChange(choice),/invalid_employee_governance_response/)
  }
  const n=calls.length;for(const extra of [{owner_id:choice.target_id},{expected_revision:0},{confirm:false}])await assert.rejects(api.changeEmployee({...choice,...extra}))
  assert.equal(calls.length,n)
})
test('governance capability needs installed schema and write gate; password success requires a forced re-login acknowledgement',async()=>{
  const cap={mode:'native_pg18',config_writes_enabled:true,model_probe_enabled:false,run_execution_enabled:false,employee_governance_available:true,employee_governance_enabled:true}
  for(const extra of [{config_writes_enabled:false},{employee_governance_available:false},{employee_governance_enabled:'true'}]){
    const api=createPgNativePilotApi(async()=>new Response(JSON.stringify({...cap,...extra}),{status:200}))
    await assert.rejects(api.getConfigCapabilities(),e=>e.status===503)
  }
  const api=createPgNativePilotApi(async()=>new Response(JSON.stringify({ok:true,reauthenticate:false}),{status:200}))
  await assert.rejects(api.changePassword('SyntheticOldPassword#2026','SyntheticNewPassword#2026'),e=>e.status===503)
})
