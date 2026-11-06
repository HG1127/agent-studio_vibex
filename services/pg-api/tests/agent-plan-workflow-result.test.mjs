// Model topology is preserved as data. These are not paid/source/save/SQL positives.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {agentPlanWorkflowPurpose as purpose,canonicalAgentPlanWorkflowValue as canonical} from '../src/agent-plan-workflow-contract.ts'
import {parseAgentPlanWorkflowModelOutput,parseAgentPlanWorkflowModelJson,parseAgentPlanWorkflowSourceValues,prepareAgentPlanWorkflowInput,deriveAgentPlanWorkflowDraft,agentPlanWorkflowResultValue,normalizeAgentPlanWorkflowCompletion} from '../src/agent-plan-workflow-result.ts'
import {parseWorkflowGraphV2} from '../src/workflow-graph-v2.ts'
const id=n=>String(n).padStart(8,'0')+'-1234-4234-8234-123456789abc',hex=n=>String(n).repeat(64)
const source=()=>({spec_id:id(1),spec_revision:7,source_sha256:hex(1),resources_sha256:hex(2),resource_versions_sha256:hex(3)})
const model=()=>({connection_id:id(2),connection_revision:4,model_id:'owner/model-v1'})
const choice=()=>({action:'preview',purpose,source:source(),instruction:'保留原有资源，设计分支与循环',generation_model:{connection_id:id(3),connection_revision:1,model_id:'design-only'},output_token_limit:8192})
const material=()=>({source:source(),name:'既有员工方案',spec:{goal:'整理资料',task_scope:'指定范围',deliverables:['报告'],task_plan:['先分析','再整理'],done_criteria:['有来源'],tools:['calculate','knowledge_search','http_lookup','mcp_lookup'],knowledge_base_ids:[id(4)],knowledge_retrieval:{mode:'hybrid',profile_id:id(5),profile_revision:2,consent_revision:3},model_binding:model(),http_tools:[{name:'http_lookup',description:'已选择的工具',connection_id:id(6),connection_revision:2}],mcp_tools:[{name:'mcp_lookup',connection_id:id(7),connection_revision:3,tool_name:'lookup',catalog_sha256:hex(7)}],require_approval:true,require_plan_review:true}})
const node=(id,type,data={})=>({id,type,position:{x:100,y:100},data:{title:id,...data}})
const edge=(id,source,target,sourceHandle)=>({id,source,target,...(sourceHandle?{sourceHandle}:{})})
const graph=()=>({version:2,description:'模型设计的草图',nodes:[node('start','start'),node('analysis','model',{prompt:'分析 {{input}}',model_binding:model()}),node('end','end',{output_template:'{{analysis.output}}'})],edges:[edge('a','start','analysis'),edge('b','analysis','end')]})
const output=(g=graph())=>({protocol:'agent_plan_workflow_model_output_v1',name:'模型生成的工作流',graph:g})
const refused=work=>assert.throws(work,/invalid_agent_plan_workflow_value/)

test('model-authored nodes, prompts, positions and edges survive unchanged; source task-plan steps are not a graph algorithm',()=>{
 const raw=output(),first=deriveAgentPlanWorkflowDraft(choice(),material(),raw);assert.deepEqual(first.graph,raw.graph);assert.equal(first.name,raw.name);assert.equal(first.authority,false);assert.equal(first.execution_authorized,false);assert.equal(first.edited,false)
 const changed=material();changed.spec.task_plan=['完全不同但已存储的步骤'];assert.deepEqual(deriveAgentPlanWorkflowDraft(choice(),changed,raw).graph,raw.graph)
 assert.deepEqual(parseWorkflowGraphV2(first.graph),first.graph);assert.ok(Object.isFrozen(first.graph.nodes[1].data));assert.equal(first.graph.nodes.length,3)
})
test('real existing V2 conditional topology and structured loop bodies are retained instead of repaired or linearized',()=>{
 const branch={version:2,nodes:[node('s','start'),node('c','condition',{op:'contains',value:'x'}),node('yes','model',{prompt:'YES'}),node('no','model',{prompt:'NO'}),node('e','end')],edges:[edge('a','s','c'),edge('b','c','yes','true'),edge('c','c','no','false'),edge('d','yes','e'),edge('e','no','e')]}
 assert.deepEqual(deriveAgentPlanWorkflowDraft(choice(),material(),output(branch)).graph,branch)
 const loop={version:2,nodes:[node('s','start'),node('l','loop',{mode:'count',count:3,max_iterations:5}),node('body','model',{prompt:'处理 {{loop.item}}'}),node('e','end')],edges:[edge('a','s','l'),edge('b','l','body'),edge('c','body','l'),edge('d','l','e','done')]}
 assert.deepEqual(deriveAgentPlanWorkflowDraft(choice(),material(),output(loop)).graph,loop)
})
test('model parsing rejects inert fallback, unknown types, missing branch/loop ports, cycles and broken references without filling or dropping data',()=>{
 const inert={version:2,nodes:[node('s','start'),node('e','end')],edges:[edge('a','s','e')]};refused(()=>parseAgentPlanWorkflowModelOutput(output(inert)))
 const bad=graph();bad.nodes[1].type='subworkflow';refused(()=>parseAgentPlanWorkflowModelOutput(output(bad)))
 for(const edit of [g=>g.edges.pop(),g=>g.edges.push(edge('cycle','analysis','analysis')),g=>g.edges[1].target='missing',g=>g.nodes[1].data.title='start',g=>g.nodes[1].data.owner_user_id=id(9),g=>g.execute=true]){const g=graph();edit(g);refused(()=>parseAgentPlanWorkflowModelOutput(output(g)))}
 const cond=graph();cond.nodes[1]=node('analysis','condition',{op:'eq',value:'1'});refused(()=>parseAgentPlanWorkflowModelOutput(output(cond)))
 const count=graph();count.nodes[1]=node('analysis','loop',{mode:'count',count:3});refused(()=>parseAgentPlanWorkflowModelOutput(output(count)))
})
test('generation has a hard12-node bound while explicit local edits reuse the existing40-node graph contract',()=>{
 const chain=count=>({version:2,nodes:[node('s','start'),...Array.from({length:count-2},(_,i)=>node('n'+i,'model',{prompt:'{{input}}'})),node('e','end')],edges:Array.from({length:count-1},(_,i)=>edge('x'+i,i===0?'s':'n'+(i-1),i===count-2?'e':'n'+i))})
 assert.equal(parseAgentPlanWorkflowModelOutput(output(chain(12))).graph.nodes.length,12);refused(()=>parseAgentPlanWorkflowModelOutput(output(chain(13))))
 const value=deriveAgentPlanWorkflowDraft(choice(),material(),output(),{name:'员工编辑后的草稿',graph:chain(13)});assert.equal(value.edited,true);assert.equal(value.graph.nodes.length,13);assert.equal(value.execution_authorized,false)
 const dense=chain(12);for(let from=0;from<10&&dense.edges.length<31;from++)for(let to=from+2;to<11&&dense.edges.length<31;to++){const ids=['s',...Array.from({length:10},(_,i)=>'n'+i),'e'];dense.edges.push(edge('dense'+dense.edges.length,ids[from],ids[to]))}
 assert.equal(dense.edges.length,31);refused(()=>parseAgentPlanWorkflowModelOutput(output(dense)));dense.edges.pop();assert.equal(parseAgentPlanWorkflowModelOutput(output(dense)).graph.edges.length,30)
})
test('strict JSON refuses prose/fences/duplicate escaped keys/trailing data and never executes programmatic getters',()=>{
 const text=JSON.stringify(output());assert.deepEqual(parseAgentPlanWorkflowModelJson(text),parseAgentPlanWorkflowModelOutput(output()))
 for(const raw of ['```json\n'+text+'\n```','说明'+text,text+'\n{}','\ufeff'+text,text.replace('"name":','"na\\u006de":"重复","name":'),text.replace('"prompt":','"prompt":"额外","prompt":'),text.replace('"x":100','"x":-0'),'{"protocol":"agent_plan_workflow_model_output_v1","name":"x","graph":',text+'x'])refused(()=>parseAgentPlanWorkflowModelJson(raw))
 let reads=0;const v=output();Object.defineProperty(v.graph.nodes[1].data,'prompt',{enumerable:true,get(){reads++;return 'fake'}});refused(()=>parseAgentPlanWorkflowModelOutput(v));assert.equal(reads,0)
 refused(()=>parseAgentPlanWorkflowModelJson(' '.repeat(131073)));refused(()=>parseAgentPlanWorkflowModelJson(text.replace('分析','\ud800')))
})
test('paid input preserves complete source descriptions and selected resources as untrusted data; no deterministic graph or model credential is produced',()=>{
 const raw=material(),prepared=prepareAgentPlanWorkflowInput(choice(),raw),payload=JSON.parse(prepared.messages[1].content)
 assert.deepEqual(payload.descriptions.task_plan,raw.spec.task_plan);assert.deepEqual(payload.resource_selection.tools,raw.spec.tools);assert.deepEqual(payload.resource_selection.mcp_tools,raw.spec.mcp_tools);assert.equal(payload.resource_selection.require_approval,true)
 assert.equal(prepared.authority,false);assert.equal(Object.hasOwn(prepared,'graph'),false);assert.equal(Object.hasOwn(prepared,'input_sha256'),false);assert.equal(Object.hasOwn(prepared,'receipt'),false);assert.equal(prepared.choice.generation_model.connection_id,id(3))
 assert.notEqual(canonical(prepared.input_value),canonical(prepareAgentPlanWorkflowInput({...choice(),output_token_limit:4096},raw).input_value))
 refused(()=>prepareAgentPlanWorkflowInput(choice(),{...raw,source:{...raw.source,spec_revision:8}}));refused(()=>parseAgentPlanWorkflowSourceValues({...raw,spec:{...raw.spec,require_approval:false}}));refused(()=>parseAgentPlanWorkflowSourceValues({...raw,spec:{...raw.spec,goal:' '+raw.spec.goal}}))
})
test('all source resource choices and approval/plan-review fields are retained even when a generated graph uses only some of them',()=>{
 const raw=material(),before=canonical(raw),draft=deriveAgentPlanWorkflowDraft(choice(),raw,output())
 for(const key of ['model_binding','tools','http_tools','mcp_tools','knowledge_base_ids','knowledge_retrieval','require_approval','require_plan_review'])assert.equal(canonical(draft.retained_source_resources[key]),canonical(raw.spec[key]))
 assert.equal(canonical(raw),before);assert.notEqual(draft.graph.nodes[1].data.model_binding.connection_id,choice().generation_model.connection_id)
 const noBinding=graph();delete noBinding.nodes[1].data.model_binding;const open=deriveAgentPlanWorkflowDraft(choice(),raw,output(noBinding));assert.equal(Object.hasOwn(open.graph.nodes[1].data,'model_binding'),false);assert.deepEqual(open.unbound_nodes,[{node_id:'analysis',missing:['model_binding']}])
})
test('model/tool/MCP/Agent/KB/retrieval references cannot invent identities, change versions or downgrade protected review policy',()=>{
 for(const binding of [{...model(),connection_revision:5},choice().generation_model,{...model(),connection_id:id(8)}]){const g=graph();g.nodes[1].data.model_binding=binding;refused(()=>deriveAgentPlanWorkflowDraft(choice(),material(),output(g)))}
 const tool=data=>{const g=graph();g.nodes[1]=node('analysis','tool',data);return output(g)}
 assert.ok(deriveAgentPlanWorkflowDraft(choice(),material(),tool({tool_binding:{connection_id:id(6),connection_revision:2},params_template:'{}'})))
 refused(()=>deriveAgentPlanWorkflowDraft(choice(),material(),tool({tool_binding:{connection_id:id(6),connection_revision:3}})))
 assert.ok(deriveAgentPlanWorkflowDraft(choice(),material(),tool({mcp_binding:{connection_id:id(7),connection_revision:3,tool_name:'lookup',catalog_sha256:hex(7)}})))
 refused(()=>deriveAgentPlanWorkflowDraft(choice(),material(),tool({mcp_binding:{connection_id:id(7),connection_revision:3,tool_name:'lookup',catalog_sha256:hex(8)}})))
 refused(()=>deriveAgentPlanWorkflowDraft(choice(),material(),tool({tool:'web_fetch',params_template:'{}'})))
 const retrieval=material().spec.knowledge_retrieval,kb={tool:'knowledge_search',knowledge_base_ids:[id(4)],knowledge_retrieval:retrieval};assert.ok(deriveAgentPlanWorkflowDraft(choice(),material(),tool(kb)))
 for(const patch of [{knowledge_base_ids:[id(9)]},{knowledge_retrieval:{...retrieval,consent_revision:4}},{knowledge_retrieval:undefined}]){const data={...kb,...patch};if(data.knowledge_retrieval===undefined)delete data.knowledge_retrieval;refused(()=>deriveAgentPlanWorkflowDraft(choice(),material(),tool(data)))}
 const agent=graph();agent.nodes[1]=node('analysis','agent',{agent_binding:{spec_id:id(1),spec_revision:7},require_plan_review:true,max_steps:3});assert.ok(deriveAgentPlanWorkflowDraft(choice(),material(),output(agent)));agent.nodes[1].data.require_plan_review=false;refused(()=>deriveAgentPlanWorkflowDraft(choice(),material(),output(agent)))
})
test('edited candidates preserve model output and independently recheck resource scope without editing the source Agent',()=>{
 const original=output(),raw=material(),edited=structuredClone(original.graph);edited.nodes[1].data.prompt='员工修改的提示词'
 const value=deriveAgentPlanWorkflowDraft(choice(),raw,original,{name:'新草图名称',graph:edited});assert.equal(value.edited,true);assert.equal(original.graph.nodes[1].data.prompt,'分析 {{input}}');assert.equal(value.graph.nodes[1].data.prompt,'员工修改的提示词');assert.equal(value.candidate_value.protocol,'agent_plan_workflow_candidate_v1')
 edited.nodes[1].data.model_binding.connection_revision=5;refused(()=>deriveAgentPlanWorkflowDraft(choice(),raw,original,{name:'x',graph:edited}))
})
test('result correlation and terminal completion are separate F05 values, not old F01/review receipts or automatic retry',()=>{
 const ref={request_id:id(8),purpose,source:source(),input_sha256:hex(4),generation_model:choice().generation_model},value=agentPlanWorkflowResultValue(ref,output());assert.equal(value.protocol,'agent_plan_workflow_result_v1');assert.equal(value.authority,false)
 refused(()=>agentPlanWorkflowResultValue({...ref,purpose:'generate'},output()));refused(()=>agentPlanWorkflowResultValue({...ref,lease_token:id(9)},output()))
 assert.deepEqual(normalizeAgentPlanWorkflowCompletion({status:'succeeded',model_json:JSON.stringify(output())}).result,parseAgentPlanWorkflowModelOutput(output()))
 for(const status of ['failed','unknown'])assert.deepEqual(normalizeAgentPlanWorkflowCompletion({status,failure_code:'provider_outcome_unknown'}),{status,failure_code:'provider_outcome_unknown'})
 refused(()=>normalizeAgentPlanWorkflowCompletion({status:'unknown',failure_code:'unknown',retry:true}));refused(()=>normalizeAgentPlanWorkflowCompletion({status:'succeeded',result:output()}))
})
test('new modules contain no Node/SQL/network/runtime/automatic-run dependency or authority factory',()=>{
 for(const name of ['agent-plan-workflow-contract.ts','agent-plan-workflow-result.ts']){
  const source=readFileSync(new URL('../src/'+name,import.meta.url),'utf8');assert.doesNotMatch(source,/from ['"]node:|import\(['"]node:|\brequire\(|\bfetch\(|new (?:Pool|Client)|process\.|Buffer\.|registerBinding|runtimeCap|agent-design-contract/)
 }
})
