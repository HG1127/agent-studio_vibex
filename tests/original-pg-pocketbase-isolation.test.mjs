import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import PocketBase,{BaseAuthStore} from 'pocketbase'
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../src/lib/pb.ts',import.meta.url),'utf8')).replace(/^import[^\r\n]*[\r\n]+/gm,'').replace(/^export /gm,'')
function load(native,{realSdk=false,windowEnabled=true}={}){
  const stores=[],events=[]
  class LocalStore{constructor(key){stores.push(key);this.token='synthetic-existing-pb-token'}}
  class FakeSdk{constructor(url,authStore){this.baseURL=url;this.authStore=authStore}}
  class Event{constructor(type,options){this.type=type;this.detail=options.detail}}
  const window=windowEnabled?{dispatchEvent:event=>events.push(event)}:undefined
  const factory=vm.runInNewContext('(function(PocketBase,BaseAuthStore,LocalAuthStore,ORIGINAL_PG_UI_ENABLED,window,CustomEvent){'+source+';return {pb,getPocketBaseUrl,pbAuthHeader,getBasename}})')
  return {api:factory(realSdk?PocketBase:FakeSdk,BaseAuthStore,LocalStore,native,window,Event),stores,events}
}
test('normal PB mode preserves the exact independent persisted credential store and API prefix',()=>{
  const {api,stores,events}=load(false)
  assert.deepEqual(stores,['agent_studio_employee_auth']);assert.equal(api.pb.authStore.token,'synthetic-existing-pb-token')
  assert.equal(api.getPocketBaseUrl(),'/__pb');assert.equal(api.getBasename(),'/');assert.equal(api.pb.beforeSend,undefined)
  assert.equal(api.pbAuthHeader('test-token').Authorization,'test-token');assert.equal(events.length,0)
})
test('PG mode never loads the old PB local store and fails closed before producing legacy URLs or headers',()=>{
  const {api,stores,events}=load(true)
  assert.deepEqual(stores,[]);assert.equal(api.pb.authStore.token,'')
  assert.throws(()=>api.getPocketBaseUrl(),/pocketbase_unavailable_in_pg_runtime/)
  assert.throws(()=>api.pbAuthHeader('synthetic-existing-pb-token'),/pocketbase_unavailable_in_pg_runtime/)
  assert.equal(events.length,2)
  for(const event of events){assert.equal(event.type,'studio:legacy-backend-blocked');assert.deepEqual(JSON.parse(JSON.stringify(event.detail)),{code:'pocketbase_unavailable_in_pg_runtime'})}
})
test('the installed real PocketBase SDK cannot forward even an in-memory token or invoke fetch in PG mode',async()=>{
  const {api,stores,events}=load(true,{realSdk:true});let calls=0
  api.pb.authStore.save('synthetic-memory-token',{id:'test-only-actor'})
  await assert.rejects(api.pb.collection('studio_users').getList(1,1,{fetch:async()=>{calls++;throw Error('fetch must not be invoked')}}))
  assert.equal(calls,0);assert.deepEqual(stores,[]);assert.equal(events.length,1)
  assert(!JSON.stringify(events).includes('token'))
})
test('the native fence remains closed in non-browser imports without an event target',async()=>{
  const {api}=load(true,{realSdk:true,windowEnabled:false});let calls=0
  assert.throws(()=>api.getPocketBaseUrl())
  await assert.rejects(api.pb.send('/api/health',{fetch:async()=>{calls++;throw Error('fetch must not be invoked')}}))
  assert.equal(calls,0)
})
