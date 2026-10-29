// Pure contract/replay tests only. No database, listener, provider or runtime.
import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAgentSpec,safeWorkflowGraph} from '../src/contracts.ts'
import {parseWorkflowNodeDataV2} from '../src/workflow-graph-v2.ts'
import {safeNativeLocalAgentSpec,parseNativeLocalEffectConfiguration} from '../src/native-local-agent-contract.ts'
import {workflowAgentSpec,createWorkflowAgentState,inspectWorkflowAgentState,recordWorkflowAgentResult} from '../src/workflow-v2-agent-machine.ts'
import {prepareWorkflowTool} from '../src/workflow-v2-tool-plan.ts'
import {localDigest} from '../../../shared/native-local-device-contract.mjs'
const id='11111111-1111-4111-8111-111111111111',model={connection_id:id,connection_revision:1,model_id:'synthetic.model'}
const input={goal:'Synthetic Native Office contract',tools:['local_computer'],knowledge_base_ids:[],model_binding:model}
const parent={step_key:'wf2_00002_agent',node_id:'agent',kind:'agent',input:'Synthetic pure Office task',input_sha256:'a'.repeat(64),configuration:{title:'Native Office',agent_binding:{spec_id:id,spec_revision:1},max_steps:3},missing:[]}
const args={tool:'office.table_summary',arguments:{root:'work',source_path:'synthetic.csv',group_by:'department',amount_column:'amount',decimal_places:2}}
const catalog=[{name:'office.table_summary',description:'Synthetic contract data only; runtime not invoked',inputSchema:{type:'object',properties:{root:{type:'string'}}}}]
const local={device_id:id,version:1,catalog,catalog_sha256:await localDigest(catalog)}
test('frozen Agent validator still rejects local_computer and unknown names',()=>{assert.throws(()=>safeAgentSpec(input),/unknown_tool/);assert.throws(()=>safeAgentSpec({...input,tools:['unknown']}),/unknown_tool/)})
test('Native opt-in is explicit and only the exact local marker is added',()=>{
 assert.throws(()=>safeNativeLocalAgentSpec(input));assert.deepEqual(safeNativeLocalAgentSpec(input,true).tools,['local_computer'])
 assert.throws(()=>safeNativeLocalAgentSpec({...input,tools:['local_computer','unknown']},true),/unknown_tool/)
 assert.throws(()=>safeNativeLocalAgentSpec({...input,tools:['local_computer'],provider_url:'https://invalid.test'},true),/unsafe_agent_spec_field/)
})
test('Native normalization retains original list/string and resource bounds',()=>{
 assert.throws(()=>safeNativeLocalAgentSpec({...input,tools:Array(21).fill('local_computer')},true))
 assert.throws(()=>safeNativeLocalAgentSpec({...input,tools:['local_computer','calculate\0']},true))
 assert.throws(()=>safeNativeLocalAgentSpec({...input,knowledge_base_ids:[id]},true))
 assert.deepEqual(safeNativeLocalAgentSpec({...input,tools:[' calculate ',' local_computer ','calculate']},true).tools,['calculate','local_computer'])
 const ordinary={goal:'Ordinary',tools:['calculate']};assert.deepEqual(safeNativeLocalAgentSpec(ordinary),safeAgentSpec(ordinary))
})
test('persisted role parser rejects Native tool without an explicit Native context',()=>{
 const stored=safeNativeLocalAgentSpec(input,true);assert.throws(()=>workflowAgentSpec(stored));assert.deepEqual(workflowAgentSpec(stored,true),stored)
 assert.throws(()=>workflowAgentSpec({...stored,require_approval:false},true))
})
test('global Workflow node/graph contracts still reject local tool and any arbitrary new enum',()=>{
 for(const tool of ['local_computer','unknown']){
  assert.throws(()=>parseWorkflowNodeDataV2({title:'Untrusted global tool',tool,params_template:'{}'},'tool'))
  assert.throws(()=>safeWorkflowGraph({version:2,nodes:[{id:'start',type:'start',data:{title:'Start'},position:{x:0,y:0}},{id:'tool',type:'tool',data:{title:'Tool',tool,params_template:'{}'},position:{x:1,y:0}},{id:'end',type:'end',data:{title:'End'},position:{x:2,y:0}}],edges:[{id:'a',source:'start',target:'tool'},{id:'b',source:'tool',target:'end'}]}))
 }
})
test('Native effect schema requires exact local data and rejects credentials/bindings/duplicate JSON fields',()=>{
 const value={title:'Native',tool:'local_computer',params_template:JSON.stringify(args)};assert.deepEqual(parseNativeLocalEffectConfiguration(value),value)
 for(const patch of [{tool:'unknown'},{tool_binding:{connection_id:id,connection_revision:1}},{token:'forbidden'},{params_template:'{"tool":"files.read","tool":"files.write","arguments":{}}'},{params_template:'{"tool":"office.table_summary","arguments":{},"command":"bad"}'}])assert.throws(()=>parseNativeLocalEffectConfiguration({...value,...patch}))
})
test('actual Agent machine requires a bound device before Native role initialization',()=>{
 const stored=safeNativeLocalAgentSpec(input,true);assert.throws(()=>createWorkflowAgentState(parent,stored));assert.ok(createWorkflowAgentState(parent,stored,undefined,{localDevice:local}).local_device)
})
test('actual deterministic Agent replay preserves Office proposal/hash and requires original approval handoff',()=>{
 let state=createWorkflowAgentState(parent,safeNativeLocalAgentSpec(input,true),undefined,{localDevice:local}),view=inspectWorkflowAgentState(state,parent)
 assert.equal(view.pending.kind,'model');const modelRequest=view.pending
 state=recordWorkflowAgentResult(state,parent,{step_key:modelRequest.step_key,input_sha256:modelRequest.input_sha256,output:JSON.stringify({action:'tool',tool:'local_computer',params:args})})
 view=inspectWorkflowAgentState(state,parent);assert.equal(view.status,'waiting');assert.equal(view.pending.kind,'tool');assert.equal(view.pending.configuration.tool,'local_computer');assert.equal(view.pending.agent_context.parent_step_key,parent.step_key)
 assert.deepEqual(prepareWorkflowTool(view.pending),{kind:'local_computer',input:args})
 const replay=inspectWorkflowAgentState(JSON.parse(JSON.stringify(state)),parent);assert.equal(replay.pending.input_sha256,view.pending.input_sha256)
 assert.throws(()=>recordWorkflowAgentResult(state,parent,{step_key:view.pending.step_key,input_sha256:'b'.repeat(64),output:'not executed'}))
 assert.throws(()=>inspectWorkflowAgentState({...state,local_device:{...local,version:2}},parent))
})
