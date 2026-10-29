// Isolated SqlClient response models. No SQL is executed and no audit/current-
// source/ACL/credential authority is claimed by a successful model assertion.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {safeAgentSpec} from '../src/contracts.ts'
import {agentPlanWorkflowPurpose as purpose,canonicalAgentPlanWorkflowValue as canonical} from '../src/agent-plan-workflow-contract.ts'
import {AgentPlanWorkflowSourceRepository,agentPlanWorkflowHash as hash} from '../src/agent-plan-workflow-source.ts'
const id=n=>String(n).padStart(8,'0')+'-1234-4234-8234-123456789abc',hex=n=>String(n).repeat(64),identity={issuer:'urn:agentstudio:local:v1',subject:'employee'},owner=id(1)
function fixture(){
 const calls=[],state={owner_user_id:owner,governance_revision:3,epoch:3},spec=safeAgentSpec({goal:'整理资料',tools:[],knowledge_base_ids:[]}),agent={spec_id:id(2),owner_user_id:owner,name:'已有助手方案',spec,revision:7},binding={connection_id:id(3),connection_revision:4,model_id:'design-model'},model={owner_user_id:owner,revision:4,models:['design-model'],provider:'openai',base_url:'https://api.openai.com/v1',enabled:true,status:'ok'}
 let envelope=hex(5),mutate=v=>v,audits=0,missingAgent=false,deniedKnowledge=false
 const resourceValues=()=>Object.fromEntries(['tools','http_tools','mcp_tools','knowledge_base_ids','knowledge_retrieval','model_binding','require_approval','require_plan_review'].filter(k=>Object.hasOwn(agent.spec,k)).map(k=>[k,agent.spec[k]]))
 function material(){
  const model_snapshot=[{connection_id:binding.connection_id,connection_revision:model.revision,metadata_sha256:hash({protocol:'agent_plan_workflow_model_metadata_v1',connection_id:binding.connection_id,owner_user_id:owner,connection_revision:model.revision,models:model.models,provider:model.provider,base_url:model.base_url,enabled:model.enabled,status:model.status}),encrypted_envelope_sha256:envelope}],resource_snapshot=agent.spec.knowledge_base_ids.flatMap(key=>[{kind:'knowledge_base',id:key,revision:null,sha256:hex(7)},{kind:'membership',id:key,revision:null,sha256:hex(8)}])
  if(agent.spec.knowledge_retrieval)resource_snapshot.push({kind:'knowledge_retrieval',id:agent.spec.knowledge_retrieval.profile_id,revision:agent.spec.knowledge_retrieval.profile_revision,sha256:hex(9)},{kind:'consent',id:owner,revision:agent.spec.knowledge_retrieval.consent_revision,sha256:hex(6)})
  resource_snapshot.sort((a,b)=>(a.kind+':'+a.id)<(b.kind+':'+b.id)?-1:1)
  const source={spec_id:agent.spec_id,spec_revision:agent.revision,source_sha256:hash({protocol:'agent_plan_workflow_source_binding_v1',owner:state,agent}),resources_sha256:hash({protocol:'agent_plan_workflow_resource_values_v1',resources:resourceValues()}),resource_versions_sha256:hash({protocol:'agent_plan_workflow_resource_versions_v1',owner:state,resource_snapshot,model_snapshot})}
  return mutate({protocol:'agent_plan_workflow_source_material_v1',owner:{...state},source_values:{source,name:agent.name,spec:agent.spec},resource_snapshot,model_snapshot})
 }
 const db={query:async(sql,values)=>{calls.push([sql,values]);if(sql.includes('current_user=')&&sql.includes('actor_id()'))return {rows:[{ok:true}]};if(sql.includes('agent_plan_workflow_owner_state'))return {rows:[{value:{...state}}]};if(sql.includes('FROM agentstudio.agent_specs'))return {rows:missingAgent?[]:[{id:agent.spec_id,owner_user_id:agent.owner_user_id,name:agent.name,spec:agent.spec,revision:String(agent.revision)}]};if(sql.includes('FROM agentstudio.model_connections'))return {rows:[{...model}]};if(sql.includes('knowledge_embedding_consent()')){const b=agent.spec.knowledge_retrieval;return {rows:[{value:{profile_id:b.profile_id,profile_revision:b.profile_revision,revision:b.consent_revision,query_enabled:true,profile_valid:true}}]}};if(sql.includes('knowledge_sharing_enabled'))return {rows:[{enabled:false}]};if(sql.includes('FROM agentstudio.knowledge_bases'))return {rows:deniedKnowledge?[]:[{id:id(8)}]};if(sql.includes('agent_plan_workflow_source('))return {rows:[{value:material()}]};throw Error('unexpected_model_query')},release(){}},pool={connect:async()=>{throw Error('model_must_use_original_client')}},auditModel=async client=>{assert.equal(client,db);audits++;return true},repo=new AgentPlanWorkflowSourceRepository(pool,auditModel)
 const selection=()=>({purpose,spec_id:agent.spec_id,generation_model:binding}),choice=()=>({action:'preview',purpose,source:material().source_values.source,instruction:'模型设计拓扑',generation_model:binding,output_token_limit:4096})
 return {calls,state,agent,binding,model,db,pool,repo,material,selection,choice,audits:()=>audits,envelope:value=>{envelope=value},mutate:value=>{mutate=value},missingAgent:()=>{missingAgent=true},deniedKnowledge:()=>{deniedKnowledge=true}}
}
test('Native issuer is required before pool connect; missing real auditor refuses before owner/source RPC',async()=>{
 let connections=0;const pool={connect:async()=>{connections++;throw Error('must_not_connect')}},repo=new AgentPlanWorkflowSourceRepository(pool)
 await assert.rejects(()=>repo.reference({issuer:'external',subject:'employee'},{purpose,spec_id:id(2),generation_model:{connection_id:id(3),connection_revision:4,model_id:'design-model'}}),/native_employee_identity_required/);assert.equal(connections,0)
 const f=fixture();await assert.rejects(()=>new AgentPlanWorkflowSourceRepository(f.pool).contextOnClient(identity,f.db,owner),/actual_auditor_required/);assert.equal(f.calls.length,1)
})
test('original-client model checks owner admission/auditor then current Agent and secretless model before audited snapshot RPC',async()=>{
 const f=fixture(),p=await f.repo.prepareOnClient(identity,f.db,owner,f.choice());assert.equal(p.owner_user_id,owner);assert.equal(p.authority,false);assert.equal(f.audits(),1)
 const sql=f.calls.map(v=>v[0]);assert.ok(sql[0].includes('actor_id()'));assert.ok(sql[1].includes('owner_state()'));assert.ok(sql[2].includes('FROM agentstudio.agent_specs'));assert.ok(sql[2].endsWith('FOR SHARE'));assert.ok(sql.at(-1).includes('agent_plan_workflow_source('));assert.deepEqual(JSON.parse(f.calls.at(-1)[1][0]),f.selection());assert.equal(f.calls.at(-1)[1][1],false)
 assert.ok(sql.filter(s=>s.includes('model_connections')).every(s=>!/(?:api_key|cipher|envelope|secret)/.test(s)))
})
test('encrypted-envelope rotation changes source resource-version and paid input even when metadata/revision are unchanged',async()=>{
 const f=fixture(),first=await f.repo.prepareOnClient(identity,f.db,owner,f.choice()),oldChoice=f.choice();f.envelope(hex(6))
 await assert.rejects(()=>f.repo.prepareOnClient(identity,f.db,owner,oldChoice),/source_changed/)
 const next=await f.repo.prepareOnClient(identity,f.db,owner,f.choice());assert.equal(first.choice.source.source_sha256,next.choice.source.source_sha256);assert.notEqual(first.choice.source.resource_versions_sha256,next.choice.source.resource_versions_sha256);assert.notEqual(first.model_versions_sha256,next.model_versions_sha256);assert.notEqual(first.input_sha256,next.input_sha256)
})
test('saved Agent is owner-scoped and save starts UPDATE rather than upgrading a shared lock',async()=>{
 const f=fixture();await f.repo.currentOnClient(identity,f.db,owner,f.selection(),'update');const row=f.calls.find(([s])=>s.includes('FROM agentstudio.agent_specs'));assert.ok(row[0].endsWith('FOR UPDATE'));assert.deepEqual(row[1],[f.agent.spec_id,owner]);assert.equal(f.calls.at(-1)[1][1],true)
 f.missingAgent();await assert.rejects(()=>f.repo.currentOnClient(identity,f.db,owner,f.selection()),/agent_spec_not_found/)
})
test('actual governance/model/ACL checks refuse before a caller-supplied snapshot can bypass them',async()=>{
 for(const patch of [{owner_user_id:id(9)},{revision:5},{enabled:false},{status:'failed'},{models:['other']},{base_url:'https://attacker.invalid/v1'}]){const f=fixture();Object.assign(f.model,patch);await assert.rejects(()=>f.repo.currentOnClient(identity,f.db,owner,f.selection()));assert.ok(!f.calls.some(([s])=>s.includes('agent_plan_workflow_source(')))}
 const f=fixture();f.state.epoch=4;await assert.rejects(()=>f.repo.currentOnClient(identity,f.db,owner,f.selection()),/source_changed/)
 const a=fixture();a.agent.spec=safeAgentSpec({goal:'读取资料',tools:['knowledge_search'],knowledge_base_ids:[id(8)]});a.deniedKnowledge();await assert.rejects(()=>a.repo.currentOnClient(identity,a.db,owner,a.selection()),/knowledge_base_not_found/);assert.ok(!a.calls.some(([s])=>s.includes('agent_plan_workflow_source(')))
})
test('SQL source projection is closed and must match complete Agent, exact resources and actual model metadata',async()=>{
 const changes=[v=>({...v,owner:{...v.owner,owner_user_id:id(9)}}),v=>({...v,source_values:{...v.source_values,name:'substituted'}}),v=>({...v,model_snapshot:[]}),v=>({...v,model_snapshot:[{...v.model_snapshot[0],metadata_sha256:hex(9)}]}),v=>({...v,resource_snapshot:[{kind:'membership',id:id(8),revision:null,sha256:hex(8)}]}),v=>({...v,authority:true})]
 for(const change of changes){const f=fixture();f.mutate(change);await assert.rejects(()=>f.repo.currentOnClient(identity,f.db,owner,f.selection()))}
 const f=fixture();f.agent.spec={...f.agent.spec,task_plan:['完整步骤'],surprise:'drop-me'};await assert.rejects(()=>f.repo.currentOnClient(identity,f.db,owner,f.selection()),/source_changed/)
})
test('selected KB/profile requires every membership/consent snapshot after real generic scope validation',async()=>{
 const make=()=>{const f=fixture();f.agent.spec=safeAgentSpec({goal:'有边界地检索',tools:['knowledge_search'],knowledge_base_ids:[id(8)],knowledge_retrieval:{mode:'hybrid',profile_id:id(9),profile_revision:2,consent_revision:3}});return f}
 const f=make();await f.repo.prepareOnClient(identity,f.db,owner,f.choice());assert.ok(f.calls.some(([sql])=>sql.includes('knowledge_embedding_consent()')));assert.ok(f.calls.some(([sql])=>sql.includes('FROM agentstudio.knowledge_bases')))
 for(const kind of ['membership','consent','knowledge_retrieval','knowledge_base']){const m=make();m.mutate(v=>({...v,resource_snapshot:v.resource_snapshot.filter(r=>r.kind!==kind)}));await assert.rejects(()=>m.repo.currentOnClient(identity,m.db,owner,m.selection()),/projection_unavailable/)}
})
test('source has no F01 authority imports, secret-column query, source mutation, paid call or fallback auditor',()=>{
 const source=readFileSync(new URL('../src/agent-plan-workflow-source.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/agent-design-|\bfetch\(|\bUPDATE agentstudio\.agent_specs|\bINSERT INTO|SELECT[^\n]*(?:api_key|ciphertext|encrypted_key)/);assert.match(source,/typeof this\.audit!=='function'/)
})
