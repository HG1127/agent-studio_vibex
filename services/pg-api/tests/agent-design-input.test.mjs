// Synthetic scalar material exercises serialization only. It is explicitly NOT
// a genuine identity/resource/DB permission or provider authorization positive.
import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAgentSpec} from '../src/contracts.ts'
import {prepareAgentDesignInput,prepareAgentDesignSourceValues,agentDesignResourceHash} from '../src/agent-design-input.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),hash='a'.repeat(64)
const binding={connection_id:id(2),connection_revision:3,model_id:'model-a'}
const spec=()=>safeAgentSpec({goal:'旧目标',task_scope:'旧范围',deliverables:['旧交付'],task_plan:['旧步骤'],done_criteria:['旧标准'],tools:['knowledge_search','http_report','mcp_lookup'],
  http_tools:[{name:'http_report',description:'PRIVATE_CONFIG_ONLY',connection_id:id(5),connection_revision:2}],
  mcp_tools:[{name:'mcp_lookup',connection_id:id(6),connection_revision:2,tool_name:'lookup',catalog_sha256:'c'.repeat(64)}],knowledge_base_ids:[id(7)],
  knowledge_retrieval:{mode:'hybrid',profile_id:id(8),profile_revision:1,consent_revision:2},model_binding:{connection_id:id(9),connection_revision:1,model_id:'runtime-model'},require_plan_review:true})
const choice=(revise=false)=>({action:'preview',purpose:revise?'revise':'generate',instruction:'设计或修订完整方案',model_binding:{...binding},output_token_limit:16384,
  source:revise?{spec_id:id(3),revision:4,source_sha256:hash}:null})
const material=(revise=false)=>({owner:{user_id:id(1),governance_revision:2,epoch:3},
  model:{owner_user_id:id(1),binding:{...binding},models:['model-a','model-b'],provider:'openai',base_url:'https://api.openai.com/v1',enabled:true,status:'ok'},
  role:revise?{spec_id:id(3),owner_user_id:id(1),name:'旧助手',spec:spec(),revision:4,source_sha256:hash}:null,
  resources_sha256:agentDesignResourceHash(revise?spec():safeAgentSpec({goal:'value scaffolding only',tools:[],knowledge_base_ids:[]}))})

test('current source calculation uses receipt metadata without a replacement instruction',()=>{
  const c=choice(true),selection={purpose:c.purpose,model_binding:c.model_binding,source:c.source},old=prepareAgentDesignInput(c,material(true)),current=prepareAgentDesignSourceValues(selection,material(true))
  assert.equal(current.source_sha256,old.source_sha256);assert.equal(current.resources_sha256,old.resources_sha256)
  const changed=prepareAgentDesignInput({...c,instruction:'Another private instruction'},material(true));assert.equal(changed.source_sha256,current.source_sha256);assert.notEqual(changed.input_sha256,old.input_sha256)
  assert.throws(()=>prepareAgentDesignSourceValues({...selection,instruction:'invented'},material(true)))
})
test('pure material returns explicit non-authority and does not fake an existing task for generation',()=>{
  const value=prepareAgentDesignInput(choice(),material());assert.equal(value.authority,false);assert.equal(value.purpose,'generate')
  assert.equal(value.output_token_limit,16384);assert.equal(value.messages.length,2);assert.equal(JSON.parse(value.messages[1].content).before,null)
  assert.equal(Object.hasOwn(value,'lease_token'),false);assert.equal(Object.hasOwn(value,'recorded'),false)
})
test('full prior descriptions/tools are available to revision while private binding data never enters messages',()=>{
  const value=prepareAgentDesignInput(choice(true),material(true)),text=JSON.stringify(value.messages),payload=JSON.parse(value.messages[1].content)
  assert.equal(payload.before.goal,'旧目标');assert.equal(payload.before.done_criteria[0],'旧标准');assert.deepEqual(payload.current_tool_names,spec().tools)
  for(const secret of ['PRIVATE_CONFIG_ONLY','api.openai.com',id(1),id(2),id(5),id(6),id(7),'catalog_sha256','knowledge_retrieval'])assert.equal(text.includes(secret),false)
})
test('synthetic pin mismatches reject; matching scalars still do not establish real owner permission',()=>{
  for(const mutate of [v=>v.owner.user_id=id(99),v=>v.model.owner_user_id=id(99),v=>v.model.binding.connection_revision++,v=>v.model.enabled=false,
    v=>v.model.status='error',v=>v.model.models=['not-selected'],v=>v.role.revision++,v=>v.role.source_sha256='b'.repeat(64),v=>v.resources_sha256='b'.repeat(64)]){
    const m=material(true);mutate(m);assert.throws(()=>prepareAgentDesignInput(choice(true),m))
  }
  assert.equal(prepareAgentDesignInput(choice(true),material(true)).authority,false)
})
test('governance/epoch/model inventory/source changes affect input digest without claiming DB enforcement',()=>{
  const old=prepareAgentDesignInput(choice(true),material(true))
  for(const mutate of [v=>v.owner.governance_revision++,v=>v.owner.epoch++,v=>v.model.models.push('model-c')]){
    const m=material(true);mutate(m);const next=prepareAgentDesignInput(choice(true),m);assert.notEqual(next.input_sha256,old.input_sha256);assert.equal(next.authority,false)
  }
})
test('full native descriptions are serialized without reducing to name/goal or low generic output limits',()=>{
  const m=material(true);m.role.spec=safeAgentSpec({...Object.fromEntries(Object.entries(m.role.spec).filter(([k])=>k!=='require_approval')),
    goal:'目'.repeat(3000),task_scope:'域'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('步'.repeat(500)),done_criteria:Array(30).fill('标'.repeat(500))})
  m.resources_sha256=agentDesignResourceHash(m.role.spec)
  const value=prepareAgentDesignInput(choice(true),m),before=JSON.parse(value.messages[1].content).before
  assert.equal(before.task_scope.length,4000);assert.equal(before.deliverables.length,30);assert.equal(before.done_criteria[29].length,500);assert.ok(value.byte_length<=524288)
})
test('credentials/arbitrary actor proof and accessor material are rejected rather than transmitted',()=>{
  for(const extra of [{lease_token:id(1)},{owner_id:id(1)},{secret:'PRIVATE'},{authorized:true}])assert.throws(()=>prepareAgentDesignInput(choice(),{...material(),...extra}))
  let called=0;const m=Object.defineProperty(material(),'model',{enumerable:true,get(){called++;return material().model}})
  assert.throws(()=>prepareAgentDesignInput(choice(),m));assert.equal(called,0)
})
