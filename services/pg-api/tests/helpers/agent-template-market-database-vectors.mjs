// Pure fixture values only. No pg, authority, source pin creation or SQL.
// Genuine callers compare these values with the actual installed SQL helpers.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import * as contract from '../../src/agent-template-market-contract.ts'
import * as result from '../../src/agent-template-market-result.ts'

const id='11111111-1111-4111-8111-111111111111'
const tid='22222222-2222-4222-8222-222222222222'
const rid='33333333-3333-4333-8333-333333333333'
const base=()=>({goal:'Reviewed synthetic goal 😀',task_scope:'Synthetic scope',deliverables:['Report'],task_plan:['Step one'],done_criteria:['Done'],tools:['calculate','summarize','knowledge_search','web_search','web_fetch'],knowledge_base_ids:[],require_approval:true,require_plan_review:false})
const sha=value=>createHash('sha256').update(contract.agentTemplateMarketCanonicalJson(value)).digest('hex')
const source=(revision=3)=>({spec_id:id,revision,source_sha256:'a'.repeat(64)})

export async function agentTemplateMarketDatabaseGoldenVectors(){
  const sources=[
    {name:'JS trim and UTF16',source_name:'  Reviewed source 😀  ',raw:{...base(),goal:'\u00a0  Reviewed 😀 goal\u3000',task_scope:'\ufeff\tScope\r\n',deliverables:['\tReport\n']}},
    {name:'private bindings, assertions, unknown fields and shadowed builtin aliases',source_name:'Private resource source',raw:{...base(),tools:['CALCULATE','数学计算','private_mcp','web_search','网页搜索','summarize','mcp_private','未知工具'],model_binding:{connection_id:id,connection_revision:7,model_id:'F07_PRIVATE_MARKER_model'},http_tools:[{name:'calculate',connection_id:id}],mcp_tools:[{name:'private_mcp',connection_id:tid,tool_name:'F07_PRIVATE_MARKER_tool',catalog_sha256:'b'.repeat(64)}],knowledge_base_ids:[id],quality_checks:[{expected_text:'F07_PRIVATE_MARKER_assertion'}],knowledge_retrieval:{profile_id:id},F07_PRIVATE_MARKER_extra:'private',require_approval:false,require_plan_review:true}},
    {name:'Unicode control escaping, line separators and numeric property names',source_name:'Unicode 😀',raw:{...base(),goal:'中文 😀 \\" quote\nline\u2028middle\u2029end',deliverables:['\ufeff\u3000trim\u3000'],tools:['网页抓取','内容摘要','计算器','calculate'],extra:{'2':'F07_PRIVATE_MARKER_two','10':'F07_PRIVATE_MARKER_ten','😀':true}}},
    {name:'minimal optional flags',source_name:'Minimal source',raw:{goal:'Goal',task_scope:'',deliverables:[],task_plan:[],done_criteria:[],tools:[]}},
    {name:'complete maximum Native description capacities',source_name:'Full description source',raw:{...base(),goal:'😀'.repeat(1500),task_scope:'界'.repeat(4000),deliverables:Array.from({length:30},()=> '😀'.repeat(250)),task_plan:Array.from({length:30},()=> '步'.repeat(500)),done_criteria:Array.from({length:30},()=> '验'.repeat(500))}},
  ]
  const projection=[]
  for(let index=0;index<sources.length;index++){
    const item=sources[index],expected=result.deriveAgentTemplateMarketSnapshot(item.raw),snapshot=expected.snapshot
    assert.equal(JSON.stringify(snapshot).includes('F07_PRIVATE_MARKER'),false)
    assert.deepEqual(snapshot.spec.knowledge_base_ids,[]);assert.deepEqual(snapshot.spec.quality_checks,[]);assert.equal(snapshot.spec.require_approval,true)
    for(const key of ['model_binding','http_tools','mcp_tools','knowledge_retrieval'])assert.equal(Object.hasOwn(snapshot.spec,key),false)
    const choice=contract.parseAgentTemplateMarketPublishChoice({action:'preview_publish',source:source(),name:index%2?'Custom public name 😀':'',description:'Reviewed public summary',category:contract.agentTemplateMarketCategories[index%4]})
    const preview=await result.deriveAgentTemplateMarketPublishPreview(choice,item.source_name,item.raw)
    assert.deepEqual(preview.snapshot,snapshot);assert.equal(preview.snapshot_sha256,sha(snapshot))
    const copies=[]
    for(const copyName of ['', 'Explicit copy 😀']){
      const copy=result.deriveAgentTemplateMarketCopy(snapshot,preview.name,copyName),copy_sha256=await result.agentTemplateMarketCopyDigest(snapshot,preview.name,copyName)
      const payload={protocol:'agent_template_market_copy_candidate_v1',name:copy.name,spec:copy.spec}
      assert.equal(copy_sha256,sha(payload))
      copies.push({copy_name:copyName,published_name:preview.name,expected:{...copy,copy_sha256},payload})
    }
    projection.push({...item,expected,snapshot_sha256:sha(snapshot),choice,preview,copies})
  }
  const intents=[]
  for(const revision of [1,Number.MAX_SAFE_INTEGER])for(const vector of projection){
    const template={template_id:tid,revision,snapshot_sha256:vector.snapshot_sha256}
    const publish=contract.parseAgentTemplateMarketPublishIntent({...vector.choice,source:source(revision),action:'publish',request_id:rid,expected_snapshot_sha256:vector.snapshot_sha256,confirm:true,acknowledgement:contract.agentTemplateMarketPublishAcknowledgement})
    const use=contract.parseAgentTemplateMarketUseIntent({action:'use',request_id:rid,template,copy_name:vector.copies[1].expected.name,expected_copy_sha256:vector.copies[1].expected.copy_sha256,confirm:true})
    const selected=[publish,use,...['unpublish','republish','delete'].map(action=>contract.parseAgentTemplateMarketLifecycleIntent({action,request_id:rid,template,confirm:true}))]
    for(const intent of selected){
      const payload={protocol:'agent_template_market_intent_v1',operation:intent.action,intent},expected=await result.agentTemplateMarketIntentDigest(intent.action,intent)
      assert.equal(expected,sha(payload));intents.push({name:vector.name+' '+intent.action+' revision '+revision,intent,payload,expected})
    }
  }
  const rejectedSources=[
    {...base(),goal:'bad\bcontrol'}, {...base(),goal:'😀'.repeat(1501)}, {...base(),task_scope:'x'.repeat(4001)},
    {...base(),deliverables:Array(31).fill('x')}, {...base(),deliverables:['x'.repeat(501)]},
    {...base(),tools:[42]}, {...base(),require_plan_review:'yes'}, {...base(),http_tools:[{name:7}]},
  ]
  for(const value of rejectedSources)assert.throws(()=>result.deriveAgentTemplateMarketSnapshot(value),contract.AgentTemplateMarketValueError)
  const integers=[0,1,Number.MAX_SAFE_INTEGER,-1,1.5,Number.MAX_SAFE_INTEGER+1,1e21].map(value=>({value,min:1,expected:Number.isSafeInteger(value)&&value>=1}))
  const canonical=[{nested:{'10':1,'2':2,'😀':'astral','\ue000':'BMP'},numbers:[0,1e-7,0.000001,1e20,1e21,-1e-7,Number.MAX_SAFE_INTEGER],text:'中文😀\t\n\r\u2028\u2029\\"'},[],{},true,false,null].map(value=>({value,compact:contract.agentTemplateMarketCanonicalJson(value),expected:sha(value)}))
  return {projection,intents,rejectedSources,integers,canonical}
}
