import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalHomeAgentApi,OriginalHomeApiError} from '../src/lib/originalHomeAgentApi.ts'
const employee='11111111-1111-4111-8111-111111111111',record='22222222-2222-4222-8222-222222222222'
const draft=()=>({name:'原首页方案',spec:{goal:'保持原界面',task_scope:'完整内容',deliverables:['产物'],tools:['calculate'],task_plan:['一步'],done_criteria:['核对'],knowledge_base_ids:[]},authoring:{format:'agentstudio.home-authoring.v1',source:'template',template_key:'research',tool_requirements:['calculate','尚未连接的需求']}})
const row=(d=draft(),revision=1)=>({id:record,owner_user_id:employee,name:d.name,spec:{...d.spec,require_approval:true},revision,created_at:'2026-10-30T00:00:00.000Z',updated_at:'2026-10-30T00:00:00.000Z',authoring:d.authoring})
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}})
const isCode=(status,code)=>e=>e instanceof OriginalHomeApiError&&e.status===status&&e.code===code

test('Original Home writes use Cookie/CSRF and preserve full draft plus presentation metadata',async()=>{
  const calls=[],d=draft(),api=createOriginalHomeAgentApi({employeeId:employee,transport:async(url,init)=>{calls.push({url,init});return response({item:row(d)},201)}})
  assert.equal((await api.create(d)).id,record);assert.equal(calls.length,1)
  const {url,init}=calls[0];assert.equal(url,'/__pg_native/api/v2/original-ui/agent-specs')
  assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.headers['X-AgentStudio-Request'],'1')
  assert.equal(init.headers.Authorization,undefined);assert.deepEqual(JSON.parse(init.body),d)
  assert.equal(init.headers['X-AgentStudio-Expected-Employee'],employee)
})
test('PostgreSQL JSONB key ordering does not turn a confirmed exact binding into an unknown save',async()=>{
  const d=draft();d.spec.model_binding={connection_id:record,connection_revision:4,model_id:'synthetic-model'}
  const saved=row(d);saved.spec.model_binding={model_id:'synthetic-model',connection_revision:4,connection_id:record}
  const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>response({item:saved})})
  assert.equal((await api.create(d)).revision,1)
})
test('Execution descriptions normalize through the existing validator while pending requirements retain exact text',async()=>{
  const d=draft();d.spec.goal='  保持原界面  ';d.spec.tools=[' calculate ','calculate'];d.authoring.tool_requirements=[' 待连接需求 ',' 待连接需求 ']
  let sent;const api=createOriginalHomeAgentApi({employeeId:employee,transport:async(_url,init)=>{sent=JSON.parse(init.body);return response({item:row(sent)})}})
  await api.create(d);assert.equal(sent.spec.goal,'保持原界面');assert.deepEqual(sent.spec.tools,['calculate']);assert.deepEqual(sent.authoring.tool_requirements,d.authoring.tool_requirements)
})
test('Owner identity comes from the bound server-verified session and crossed-owner results are refused',async()=>{
  const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>response({item:{...row(),owner_user_id:record}})})
  await assert.rejects(api.get(record),isCode(503,'invalid_original_home_response'))
})
test('Revision conflicts retain the exact editing revision and never automatically retry',async()=>{
  const calls=[],api=createOriginalHomeAgentApi({employeeId:employee,transport:async(url,init)=>{calls.push({url,init});return response({error:'revision_conflict'},409)}})
  await assert.rejects(api.update(record,7,draft()),isCode(409,'revision_conflict'))
  assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].init.body).expected_revision,7)
})
test('Reading an owned spec then editing it preserves mandatory approval without posting a permission field',async()=>{
  const calls=[],api=createOriginalHomeAgentApi({employeeId:employee,transport:async(_url,init)=>{calls.push(init);return response({item:init.method==='GET'?row():row(draft(),2)})}})
  const loaded=await api.get(record)
  assert.equal((await api.update(loaded.id,loaded.revision,{name:loaded.name,spec:loaded.spec,authoring:loaded.authoring})).revision,2)
  assert.equal(Object.hasOwn(JSON.parse(calls[1].body).spec,'require_approval'),false)
})
test('An edit cannot request weaker approval before any network write',async()=>{
  let calls=0;const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>{calls++;return response({})}})
  await assert.rejects(api.create({...draft(),spec:{...draft().spec,require_approval:false}}),isCode(400,'original_home_approval_required'));assert.equal(calls,0)
})
test('A lost create response remains unknown and is sent only once',async()=>{
  let calls=0;const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>{calls++;throw Error('disconnected')}})
  await assert.rejects(api.create(draft()),isCode(0,'original_home_outcome_unknown'));assert.equal(calls,1)
})
test('Successful status alone cannot confirm a save with missing or changed original fields',async()=>{
  const altered=row(draft(),2);altered.spec.task_plan=['lost edit'];const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>response({item:altered})})
  await assert.rejects(api.update(record,1,draft()),isCode(503,'unconfirmed_original_home_save'))
})
test('Legacy records may explicitly lack authoring metadata without inventing a source',async()=>{
  const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>response({items:[{...row(),authoring:null}]})})
  assert.equal((await api.list())[0].authoring,null)
})
test('Updating a pre-authoring record omits unknown history rather than inventing a create source',async()=>{
  const d=draft();delete d.authoring
  let sent
  const api=createOriginalHomeAgentApi({employeeId:employee,transport:async(_url,init)=>{sent=JSON.parse(init.body);return response({item:{...row(draft(),2),authoring:null}})}})
  const result=await api.update(record,1,d)
  assert.equal(Object.hasOwn(sent,'authoring'),false)
  assert.equal(sent.expected_revision,1)
  assert.equal(result.authoring,null)
})
test('Missing authoring metadata is permitted only for update; create and explicit null are refused',async()=>{
  let calls=0;const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>{calls++;return response({})}})
  const d=draft();delete d.authoring
  await assert.rejects(api.create(d),isCode(400,'invalid_original_home_input'))
  await assert.rejects(api.update(record,1,{...d,authoring:null}),isCode(400,'invalid_original_home_authoring'))
  assert.equal(calls,0)
})
test('Original catalog forwards real page/filter/sort criteria and validates exact totals',async()=>{
  let call;const api=createOriginalHomeAgentApi({employeeId:employee,transport:async(url,init)=>{call={url,init};return response({items:[{...row(),favorite:true}],totalItems:37,page:3,totalPages:3,perPage:18})}})
  const result=await api.catalog({page:3,perPage:18,q:'名称 & 范围',source:'template',favorite:true,sort:'favorite_desc'})
  assert.equal(result.totalItems,37);assert.equal(result.items.length,1)
  const url=new URL(call.url,'https://studio.example.test');assert.equal(url.pathname,'/__pg_native/api/v2/original-ui/agent-catalog')
  assert.equal(url.searchParams.get('q'),'名称 & 范围');assert.equal(url.searchParams.get('favorite'),'1');assert.equal(url.searchParams.get('source'),'template')
  assert.equal(call.init.credentials,'same-origin');assert.equal(call.init.headers.Authorization,undefined)
})
test('A clipped page or inconsistent count cannot masquerade as the complete catalog',async()=>{
  for(const data of [{items:[],totalItems:37,page:1,totalPages:3,perPage:18},{items:[],totalItems:0,page:1,totalPages:1,perPage:18}]){
    const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>response(data)})
    await assert.rejects(api.catalog(),isCode(503,'invalid_original_home_response'))
  }
})
test('an actual empty catalog retains the server zero-page convention for the original UI to clamp',async()=>{
  const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>response({items:[],totalItems:0,page:1,totalPages:0,perPage:18})})
  assert.deepEqual(await api.catalog(),{items:[],totalItems:0,page:1,totalPages:0,perPage:18})
})
test('Catalog filters never accept cross-owner, unstarred or wrong-source rows',async()=>{
  for(const item of [{...row(),owner_user_id:record,favorite:true},{...row(),favorite:false},{...row(),authoring:null,favorite:true}]){
    const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>response({items:[item],totalItems:1,page:1,totalPages:1,perPage:18})})
    await assert.rejects(api.catalog({source:'template',favorite:true}),isCode(503,'invalid_original_home_response'))
  }
})
test('Favorite uses a separate acknowledged absolute write with the displayed Agent revision',async()=>{
  let call;const api=createOriginalHomeAgentApi({employeeId:employee,transport:async(url,init)=>{call={url,init};return response({agent_spec_id:record,favorite:true,revision:7})}})
  assert.deepEqual(await api.favorite(record,7,true),{agent_spec_id:record,favorite:true,revision:7})
  assert.equal(call.url,'/__pg_native/api/v2/original-ui/agent-catalog/'+record+'/favorite')
  assert.deepEqual(JSON.parse(call.init.body),{favorite:true,expected_revision:7});assert.equal(call.init.headers['X-AgentStudio-Request'],'1')
})
test('Favorite conflicts and lost acknowledgements are never automatically replayed',async()=>{
  for(const status of ['conflict','lost']){
    let calls=0;const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>{calls++;if(status==='lost')throw Error('connection lost');return response({error:'revision_conflict'},409)}})
    await assert.rejects(api.favorite(record,7,true),status==='lost'?isCode(0,'original_home_outcome_unknown'):isCode(409,'revision_conflict'));assert.equal(calls,1)
  }
})
test('Invalid catalog identity/query injection and cancelled reads fail before fetch',async()=>{
  let calls=0;const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>{calls++;return response({})}})
  for(const query of [{page:0},{perPage:51},{sort:'name;DELETE'},{q:'x'.repeat(101)},{owner_user_id:record}])await assert.rejects(api.catalog(query),isCode(400,'invalid_original_home_catalog_query'))
  const controller=new AbortController();controller.abort();await assert.rejects(api.get(record,controller.signal),isCode(0,'original_home_unavailable'));assert.equal(calls,0)
})
test('Invalid identifiers, secret fields and foreign API roots fail before any request',async()=>{
  let calls=0;const transport=async()=>{calls++;return response({})},api=createOriginalHomeAgentApi({employeeId:employee,transport})
  assert.throws(()=>createOriginalHomeAgentApi({employeeId:employee,rootPath:'https://foreign.example',transport}))
  await assert.rejects(api.get('pocketbase-id'))
  await assert.rejects(api.create({...draft(),owner_user_id:record}))
  await assert.rejects(api.create({...draft(),spec:{...draft().spec,api_key:'never-send'}}))
  assert.equal(calls,0)
})
test('Malformed, redirected, oversized and duplicate record responses cannot enter the original list',async()=>{
  const cases=[()=>new Response('<html/>',{headers:{'content-type':'text/html'}}),()=>response({items:[row(),row()]}),()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'1048577'}})]
  for(const factory of cases){const api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>factory()});await assert.rejects(api.list(),isCode(503,'invalid_original_home_response'))}
  const redirected=response({items:[]});Object.defineProperty(redirected,'redirected',{value:true})
  await assert.rejects(createOriginalHomeAgentApi({employeeId:employee,transport:async()=>redirected}).list(),isCode(503,'invalid_original_home_response'))
})
