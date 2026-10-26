import test from "node:test"
import assert from "node:assert/strict"
import {exportPgWorkflowJson,importPgWorkflowJson,selectedPgWorkflowFragment,pastePgWorkflowFragment,alignPgWorkflowNodes} from "../src/lib/pgNativeWorkflowTransfer.ts"
import {newPgWorkflowGraph,addPgWorkflowNode,patchPgWorkflowNode,parseWorkflowGraphV2,workflowExecutionIssues} from "../src/lib/pgNativeWorkflowGraph.ts"
import {previewWorkflowV2Node,workflowPreviewDependencies,safeWorkflowPreviewSamples} from "../services/pg-api/src/workflow-v2-preview.ts"
import {workflowNodeDebugGraph,safeWorkflowNodeDebugRequest} from "../services/pg-api/src/workflow-v2-node-debug.ts"
import {createWorkflowV2Checkpoint,advanceWorkflowV2Checkpoint} from "../services/pg-api/src/workflow-v2-machine.ts"
import {preparedWorkflowNodeDebugRequest,createIsolatedWorkflowNodeDebugExecutor} from "../services/pg-api/src/model-connection-executor.ts"
import {pgWorkflowTemplate,pgWorkflowTemplates} from "../src/lib/pgNativeWorkflowTemplates.ts"
const binding={connection_id:"11111111-1111-4111-8111-111111111111",connection_revision:1,model_id:"synthetic"}
const ids=()=>{let n=0;return ()=>String(++n)}
function modelGraph(){let graph=addPgWorkflowNode(newPgWorkflowGraph(),"model","start-end",ids());graph.description="Synthetic private description";return patchPgWorkflowNode(graph,"node_1",{title:"Model",model_binding:binding,prompt:"Task {{input}}"})}
function pending(graph,input){let state=createWorkflowV2Checkpoint(graph,input);for(let i=0;i<10;i++){const next=advanceWorkflowV2Checkpoint(graph,state);state=next.checkpoint;if(next.view.pending||["failed","succeeded"].includes(next.view.status))return next.view}throw Error("no transition")}

test("portable v2 and legacy v1 retain text, topology and description while stripping every access binding",()=>{
  let graph=modelGraph();graph=addPgWorkflowNode(graph,"tool",graph.edges.find(edge=>edge.target==="end").id,(()=>{let n=100;return ()=>String(++n)})())
  const tool=graph.nodes.find(node=>node.type==="tool");tool.data={title:"HTTP",tool_binding:{connection_id:binding.connection_id,connection_revision:1},params_template:'{"value":"{{Model.output}}"}'}
  const raw=exportPgWorkflowJson("Synthetic",graph),parsed=importPgWorkflowJson(raw,ids())
  assert.equal(raw.includes(binding.connection_id),false);assert.equal(raw.includes("connection_revision"),false)
  assert.equal(parsed.graph.description,graph.description);assert.equal(parsed.graph.nodes.find(node=>node.type==="tool").data.tool_binding_required,true)
  assert.ok(workflowExecutionIssues(parsed.graph).length);assert.equal(parsed.graph.nodes.some(node=>graph.nodes.some(old=>old.id===node.id)),false)
  const legacy=JSON.parse(raw);legacy.version=1;legacy.description="Legacy description";delete legacy.graph.description
  for(const node of legacy.graph.nodes){node.data.model="custom:foreign";node.data.spec_id="foreign-spec";node.data.knowledge_base_ids=[binding.connection_id];node.data.api_key="private-credential-must-strip"}
  const imported=importPgWorkflowJson(JSON.stringify(legacy),ids());assert.equal(imported.graph.description,"Legacy description")
  assert.equal(JSON.stringify(imported).includes("foreign"),false);assert.equal(JSON.stringify(imported).includes("private-credential"),false)
})
test("untrusted portable input cannot bypass canonical topology, bounds, field types or ID regeneration",()=>{
  const raw=JSON.parse(exportPgWorkflowJson("Synthetic",modelGraph()))
  for(const wrong of [{...raw,version:99},{...raw,graph:{...raw.graph,nodes:[...raw.graph.nodes,raw.graph.nodes[1]]}},
    {...raw,graph:{...raw.graph,edges:[{id:"forged",source:"node_1",target:"node_1"}]}},
    {...raw,graph:{...raw.graph,nodes:raw.graph.nodes.map(node=>node.type==="model"?{...node,data:{...node.data,prompt:{url:"https://evil.invalid"}}}:node)}}])assert.throws(()=>importPgWorkflowJson(JSON.stringify(wrong),ids()))
  assert.throws(()=>importPgWorkflowJson("x".repeat(512*1024+1)));assert.throws(()=>importPgWorkflowJson(JSON.stringify(raw),()=>"collision"))
  const original=JSON.stringify(raw);importPgWorkflowJson(JSON.stringify(raw),ids());assert.equal(JSON.stringify(raw),original)
})
test("memory-only fragment copies retain owner bindings, mint IDs, rename only internal references and preserve literal text",()=>{
  let graph=modelGraph();graph=patchPgWorkflowNode(graph,"end",{title:"End",output_template:"{{Model.output}}"})
  const fragment=selectedPgWorkflowFragment(graph,["start","node_1","end"]);assert.equal(fragment.nodes.length,2)
  const pasted=pastePgWorkflowFragment(graph,fragment,ids());assert.equal(pasted.graph.nodes.length,5)
  const model=pasted.graph.nodes.find(node=>node.data.title==="Model 2"),end=pasted.graph.nodes.find(node=>node.data.title==="End 2")
  assert.deepEqual(model.data.model_binding,binding);assert.equal(end.data.output_template,"{{Model 2.output}}")
  assert.equal(graph.nodes.length,3);assert.notDeepEqual(model.position,graph.nodes[1].position)
  const literal=structuredClone(fragment),literalModel=literal.nodes.find(node=>node.type==="model");literalModel.data={...literalModel.data,prompt:"{{Model.output}}",prompt_format:"literal"}
  assert.equal(pastePgWorkflowFragment(graph,literal,ids()).graph.nodes.find(node=>node.data.title==="Model 2").data.prompt,"{{Model.output}}")
  const renamed=patchPgWorkflowNode({...graph,nodes:graph.nodes.map(node=>node.type==="model"?{...node,data:{...node.data,prompt_format:"literal",prompt:"{{Model.output}}"}}:node)},"node_1",{...graph.nodes.find(node=>node.type==="model").data,title:"Renamed",prompt_format:"literal",prompt:"{{Model.output}}"})
  assert.equal(renamed.nodes.find(node=>node.type==="model").data.prompt,"{{Model.output}}")
  assert.throws(()=>pastePgWorkflowFragment({...graph,nodes:Array.from({length:40},(_,i)=>({...graph.nodes[1],id:String(i)}))},fragment,ids()))
})
test("alignment changes only selected positions and distributes three nodes without changing references or bindings",()=>{
  const graph=modelGraph(),selected=graph.nodes.map(node=>node.id),before=structuredClone(graph)
  const aligned=alignPgWorkflowNodes(graph,selected,"left");assert.equal(new Set(aligned.nodes.map(node=>node.position.x)).size,1)
  const dist=alignPgWorkflowNodes(graph,selected,"distributeX").nodes.map(node=>node.position.x).sort((a,b)=>a-b)
  assert.equal(dist[1]-dist[0],dist[2]-dist[1]);assert.deepEqual(aligned.nodes[1].data,before.nodes[1].data);assert.deepEqual(graph,before)
})
test("final output preview can combine bounded node samples up to20000 without widening model input previews",()=>{
  const graph=patchPgWorkflowNode(modelGraph(),"end",{title:"End",output_template:"{{Model.output}}".repeat(6)})
  const model=graph.nodes.find(item=>item.type==="model")
  const preview=previewWorkflowV2Node(graph,"end",{input:"Synthetic final output",outputs:{[model.id]:"字".repeat(4000)}})
  assert.equal(preview.output,"字".repeat(20000));assert.deepEqual(preview.missing,[])
  const paid=patchPgWorkflowNode(graph,model.id,{...model.data,prompt:"{{input}}".repeat(7)})
  assert.throws(()=>previewWorkflowV2Node(paid,model.id,{input:"字".repeat(2000),outputs:{}}),error=>error.code==="workflow_rendered_input_too_large")
})

test("preview and actual replay share exact JSON-string substitution, condition and bounded nested-loop rules",()=>{
  let graph=addPgWorkflowNode(newPgWorkflowGraph(),"loop","start-end",ids())
  const tool=graph.nodes.find(node=>node.type==="tool"),samples={input:'quoted "text"\nline',outputs:{},loop:{item:'x"\\y',index:2}}
  tool.data.params_template='{"expression":"{{input}} / {{loop.item}} / {{loop.index}}"}'
  const preview=previewWorkflowV2Node(graph,tool.id,samples)
  assert.equal(preview.parameters.expression,'quoted "text"\nline / x"\\y / 2');assert.deepEqual(preview.missing,[])
  const runtime=pending(graph,samples.input);assert.equal(runtime.pending.input,previewWorkflowV2Node(graph,tool.id,{...samples,loop:{item:"1",index:1}}).input)
  const loop=graph.nodes.find(node=>node.type==="loop");loop.data={title:loop.data.title,mode:"list",list_source:"{{input}}",delimiter:"json_array",max_iterations:2}
  assert.deepEqual(previewWorkflowV2Node(graph,loop.id,{input:'["a", {"b":2}, "c"]',outputs:{}}).items,["a",'{"b":2}'])
  const condition=addPgWorkflowNode(newPgWorkflowGraph(),"condition","start-end",ids()),choice=condition.nodes.find(node=>node.type==="condition")
  choice.data.op="gt";choice.data.value="10"
  assert.equal(previewWorkflowV2Node(condition,choice.id,{input:"value 12.5",outputs:{}}).branch,"true")
  assert.throws(()=>safeWorkflowPreviewSamples({input:"x",outputs:{foreign:"forged"}},graph,tool.id))
})
test("model debug graph contains exactly one frozen literal Model and cannot inherit Tool/Agent execution",()=>{
  const graph=modelGraph(),samples={input:"literal {{unknown}}",outputs:{}}
  const debug=workflowNodeDebugGraph(graph,{node_id:"node_1",samples})
  assert.deepEqual(debug.nodes.map(node=>node.type),["start","model","end"])
  assert.equal(pending(debug,samples.input).pending.input,"Task literal {{unknown}}")
  assert.deepEqual(pending(debug,samples.input).pending.missing,[])
  assert.throws(()=>workflowNodeDebugGraph(graph,{node_id:"start",samples}))
  assert.throws(()=>safeWorkflowNodeDebugRequest({node_id:"node_1",samples,expected_revision:1,idempotency_key:"synthetic-key",graph:debug}))
  assert.equal(workflowPreviewDependencies(graph,"node_1").length,0)
  const broken=structuredClone(graph);broken.nodes.find(node=>node.type==="model").data.prompt="{{Missing.output}}";assert.throws(()=>workflowNodeDebugGraph(broken,{node_id:"node_1",samples}))
  const imported=importPgWorkflowJson(exportPgWorkflowJson("Synthetic",graph),ids()).graph
  assert.ok(parseWorkflowGraphV2(imported));assert.equal(pending(imported,"x").error_code,"workflow_model_binding_missing")
  const unboundTool={...newPgWorkflowGraph(),nodes:[...newPgWorkflowGraph().nodes,{id:"unbound",type:"tool",data:{title:"Unbound",tool_binding_required:true,params_template:"{}"},position:{x:200,y:0}}],edges:[{id:"a",source:"start",target:"unbound"},{id:"b",source:"unbound",target:"end"}]}
  assert.equal(pending(unboundTool,"x").error_code,"workflow_tool_binding_missing")
})
test("single-node provider request has an 8000-character input and fixed 512-token output cap for each protocol",()=>{
  const paths={openai:"https://api.openai.com/v1",anthropic:"https://api.anthropic.com/v1",gemini:"https://generativelanguage.googleapis.com/v1beta"}
  for(const [provider,base_url] of Object.entries(paths)){
    const payload=JSON.parse(preparedWorkflowNodeDebugRequest({provider,base_url,model_id:"synthetic",api_key:"synthetic-dummy-key"},"literal {{data}}").body)
    assert.equal(provider==="openai"?payload.max_completion_tokens:provider==="anthropic"?payload.max_tokens:payload.generationConfig.maxOutputTokens,512)
  }
  assert.throws(()=>preparedWorkflowNodeDebugRequest({provider:"openai",base_url:paths.openai,model_id:"synthetic",api_key:"synthetic-dummy-key"},"x".repeat(8001)))
  assert.throws(()=>createIsolatedWorkflowNodeDebugExecutor({},"https://synthetic.invalid",true,{},()=>{},1001))
})
test("all starter graphs preserve canonical topology and require explicit owner bindings before running",()=>{
  for(const kind of Object.keys(pgWorkflowTemplates)){
    const {graph}=pgWorkflowTemplate(kind);assert.ok(parseWorkflowGraphV2(graph));assert.ok(workflowExecutionIssues(graph).length)
    assert.equal(graph.nodes.some(node=>node.data.model_binding||node.data.agent_binding||node.data.tool_binding),false)
  }
  assert.throws(()=>pgWorkflowTemplate("untrusted"))
})
