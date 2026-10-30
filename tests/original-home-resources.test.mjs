// Pure DTO/interaction-contract tests. No database, network, browser or Worker.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {parseOriginalHomeResources} from '../src/lib/originalHomeResources.ts'
import {createOriginalHomeAgentApi} from '../src/lib/originalHomeAgentApi.ts'
import {resolveAgentToolRequirements} from '../src/lib/agentToolMatcher.ts'
const employee='11111111-1111-4111-8111-111111111111',httpId='22222222-2222-4222-8222-222222222222',mcpId='33333333-3333-4333-8333-333333333333',baseId='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555'
const instant='2026-10-30T00:00:00.000Z',httpAlias='http_c'+httpId.replaceAll('-',''),mcpAlias='mcp_t'+createHash('sha256').update(mcpId+'\0read_data').digest('hex').slice(0,40)
function dto(){return {format:'agentstudio.original-home-resources.v1',employee_id:employee,knowledge_sharing_enabled:false,
  http_connections:[{id:httpId,owner_user_id:employee,revision:3,name:'员工自己的 HTTP',description:'',enabled:true,status:'ok',last_checked_at:instant,method:'GET',alias:httpAlias,binding:{name:httpAlias,description:'员工自己的 HTTP',connection_id:httpId,connection_revision:3}}],
  mcp_connections:[{id:mcpId,owner_user_id:employee,revision:4,name:'员工自己的 MCP',description:'元数据',enabled:true,status:'ok',last_checked_at:instant,catalog_sha256:'a'.repeat(64),tools:[{alias:mcpAlias,tool_name:'read_data',description:'实际目录说明',read_only:true,destructive:false,binding:{name:mcpAlias,connection_id:mcpId,connection_revision:4,catalog_sha256:'a'.repeat(64),tool_name:'read_data'}}]}],
  knowledge_bases:[{id:baseId,owner_user_id:employee,revision:2,name:'资料库',description:'真实统计',created_at:instant,updated_at:instant,access_role:'owner',semantic_allowed:null,document_count:123,chunk_count:456}]
}}
test('resource mapping preserves actual counts, human labels and immutable tool references',()=>{
  const value=parseOriginalHomeResources(dto(),employee)
  assert.equal(value.connectedHttp[0].name,httpAlias);assert.equal(value.connectedHttp[0].display_name,'员工自己的 HTTP');assert.equal(value.connectedHttp[0].description,'')
  assert.equal(value.bindings.http[0].connection_revision,3);assert.equal(value.bindings.mcp[0].catalog_sha256,'a'.repeat(64))
  assert.equal(value.verifiedMarket[0].readOnly,true);assert.equal(value.verifiedMarket[0].destructive,false)
  assert.equal(value.knowledgeBases[0].document_count,123);assert.equal(value.knowledgeBases[0].chunk_count,456)
  assert.equal(Object.hasOwn(value.knowledgeBases[0],'semantic_allowed'),false)
})
test('crossed employee identities, revisions and missing counts reject the whole resource view',()=>{
  for(const alter of [d=>d.employee_id=other,d=>d.http_connections[0].owner_user_id=other,d=>d.mcp_connections[0].tools[0].binding.connection_revision=5,d=>delete d.knowledge_bases[0].chunk_count,d=>d.knowledge_bases[0].document_count='123']){
    const d=dto();alter(d);assert.throws(()=>parseOriginalHomeResources(d,employee))
  }
})
test('a shared library requires the real sharing flag and ACL role and keeps actual shared statistics',()=>{
  const d=dto();d.knowledge_bases[0]={...d.knowledge_bases[0],owner_user_id:other,access_role:'viewer',semantic_allowed:false,document_count:9,chunk_count:27}
  assert.throws(()=>parseOriginalHomeResources(d,employee));d.knowledge_sharing_enabled=true
  const shared=parseOriginalHomeResources(d,employee).knowledgeBases[0]
  assert.equal(shared.owner_uid,other);assert.equal(shared.access_role,'viewer');assert.equal(shared.semantic_allowed,false);assert.equal(shared.chunk_count,27)
  d.knowledge_bases[0].access_role='owner';assert.throws(()=>parseOriginalHomeResources(d,employee))
})
test('secret fields, invalid readiness and unverified MCP annotations cannot enter the original controls',()=>{
  for(const alter of [d=>d.http_connections[0].url='https://private.example.test',d=>d.http_connections[0].binding.headers=[],d=>d.mcp_connections[0].tools[0].read_only='true',d=>d.mcp_connections[0].enabled=false,d=>d.mcp_connections[0].tools[0].input_schema={type:'object'}]){
    const d=dto();alter(d);assert.throws(()=>parseOriginalHomeResources(d,employee))
  }
})
test('native resource reads remain Cookie-only and a real refusal is not converted to an empty success',async()=>{
  let call;const api=createOriginalHomeAgentApi({employeeId:employee,transport:async(url,init)=>{call={url,init};return new Response(JSON.stringify(dto()),{headers:{'content-type':'application/json'}})}})
  assert.equal((await api.resources()).knowledgeBases[0].chunk_count,456)
  assert.equal(call.url,'/__pg_native/api/v2/original-ui/home-resources');assert.equal(call.init.credentials,'same-origin');assert.equal(call.init.headers.Authorization,undefined)
  const denied=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>new Response(JSON.stringify({error:'original_home_knowledge_statistics_unavailable'}),{status:503,headers:{'content-type':'application/json'}})})
  await assert.rejects(denied.resources(),e=>e.status===503&&e.code==='original_home_knowledge_statistics_unavailable')
})
test('native tool matching keeps unavailable original capabilities pending while PB retains its existing behavior',()=>{
  const spec={goal:'保存结构化事实到正式业务记录',task_scope:'正式事实库',tools:['business_record_write'],task_plan:[],deliverables:[],done_criteria:[]}
  assert(resolveAgentToolRequirements('',spec).resolvedTools.includes('business_record_write'))
  const native=resolveAgentToolRequirements('',spec,[],[],[],new Set(['calculate','summarize','web_search','web_fetch','knowledge_search']))
  assert(!native.resolvedTools.includes('business_record_write'));assert(native.gaps.some(v=>v.name==='business_record_write'))
})
