// Actual existing editor + new draft port, with no transport implementation.
// No fake saved Workflow is returned and no database/save authorization is proved.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativeWorkflowGeneratedDraftEditor,agentPlanWorkflowEditorResources,scopedPgWorkflowMcpConnections} from '../src/lib/pgNativeWorkflowGeneratedDraft.ts'
import {browserValues,id,hex,deferred,canonical} from './helpers/agent-plan-workflow-browser-values.mjs'
async function fixture(){
  const f=await browserValues(),writes=[],previews=[];let edited=0,locked=false
  const api=Object.fromEntries(['getWorkflow','createWorkflowGraph','updateWorkflowGraph'].map(name=>[name,async()=>{writes.push(name);throw Error('ordinary_workflow_api_must_not_be_called')}]))
  const port={key:'current-login:result',name:f.modelOutput.name,graph:f.graph,disabled:false,policy:{builtinTools:['web_search'],requirePlanReview:true,lockKnowledgeRetrieval:true,mcpBindings:[]},onEdited(){edited++},async onPreviewSave(fields){previews.push(structuredClone(fields))}}
  const editor=createPgNativeWorkflowGeneratedDraftEditor(api,()=>{throw Error('unexpected_expiry')},()=>({...port,disabled:locked}))
  return {f,editor,port,writes,previews,edited:()=>edited,lock:value=>{locked=value}}
}
test('the same existing editor loads exact model topology and routes first save only to the F05 preview callback',async()=>{
  const x=await fixture();assert.equal(x.editor.snapshot().draft.id,'');assert.equal(x.editor.snapshot().draft.revision,0);assert.equal(canonical(x.editor.snapshot().draft.graph),canonical(x.f.graph))
  await x.editor.save();assert.equal(x.previews.length,1);assert.deepEqual(x.previews[0],{name:x.f.modelOutput.name,graph:x.f.graph});assert.deepEqual(x.writes,[]);assert.equal(x.editor.snapshot().dirty,true);x.editor.dispose()
})
test('normal edge editing may remain temporarily incomplete, clears confirmation and can be undone without inventing edges',async()=>{
  const x=await fixture(),broken=structuredClone(x.editor.snapshot().draft.graph);broken.edges.pop();x.editor.edit('员工修改',broken)
  assert.equal(x.editor.snapshot().draft.graph.edges.length,x.f.graph.edges.length-1);assert.equal(x.edited(),1)
  await x.editor.save();assert.equal(x.previews.length,0);assert.match(x.editor.snapshot().error,/修正/)
  x.editor.undo();assert.equal(canonical(x.editor.snapshot().draft.graph),canonical(x.f.graph));await x.editor.save();assert.equal(x.previews.length,1);assert.deepEqual(x.writes,[]);x.editor.dispose()
})
test('saving preview locks editing and duplicate gestures; ordinary open/new/import cannot discard the source-bound draft',async()=>{
  const x=await fixture(),d=deferred();x.port.onPreviewSave=async fields=>{x.previews.push(fields);await d.promise}
  const flight=x.editor.save();assert.equal(x.editor.snapshot().busy,true);await x.editor.save();x.editor.edit('wrong',x.f.graph);x.editor.fresh('wrong');await x.editor.open(id(999));x.editor.importDraft('wrong',x.f.graph)
  assert.equal(x.editor.snapshot().draft.name,x.f.modelOutput.name);assert.equal(x.previews.length,1);assert.deepEqual(x.writes,[]);d.resolve();await flight;x.editor.dispose()
})
test('disabled/disposed generated controller cannot edit or save, including late preview completion',async()=>{
  const x=await fixture();x.lock(true);x.editor.edit('wrong',x.f.graph);await x.editor.save();assert.equal(x.previews.length,0)
  x.lock(false);const d=deferred();x.port.onPreviewSave=()=>d.promise;let notices=0;x.editor.subscribe(()=>{notices++});const flight=x.editor.save();x.editor.dispose();const before=notices;d.resolve();await flight
  assert.equal(notices,before);assert.equal(x.editor.snapshot().draft,null);assert.deepEqual(x.writes,[])
})
test('resource choices use source-selected exact versions and never the independent generation model',async()=>{
  const x=await fixture(),source={...x.f.source_values,authority:false},binding=x.f.execution_model
  const rows=agentPlanWorkflowEditorResources(source,{agents:[{id:x.f.source.spec_id,revision:x.f.source.spec_revision},{id:id(99),revision:1}],models:[{id:binding.connection_id,revision:binding.connection_revision,models:[binding.model_id,'unselected']},{id:x.f.generation_model.connection_id,revision:x.f.generation_model.connection_revision,models:[x.f.generation_model.model_id]}],tools:[{id:id(77),revision:1}],bases:[{id:id(88)}]})
  assert.equal(rows.agents.length,1);assert.equal(rows.models.length,1);assert.deepEqual(rows.models[0].models,['execution-only']);assert.equal(rows.tools.length,0);assert.equal(rows.bases.length,0);assert.deepEqual(rows.policy.builtinTools,['web_search']);assert.equal(rows.policy.requirePlanReview,true)
})
test('MCP options preserve exact revision/catalog/tool subset and cannot expose another catalog choice',()=>{
  const binding={name:'selected',connection_id:id(5),connection_revision:2,tool_name:'allowed',catalog_sha256:hex(7)},policy={builtinTools:[],requirePlanReview:false,lockKnowledgeRetrieval:true,mcpBindings:[binding]}
  const row={id:id(5),revision:2,catalog_sha256:hex(7),catalog:{tools:[{name:'allowed'},{name:'unselected'}]}},other={...row,id:id(6)},rotated={...row,revision:3}
  const selected=scopedPgWorkflowMcpConnections([row,other,rotated],policy);assert.equal(selected.length,1);assert.deepEqual(selected[0].catalog.tools,[{name:'allowed'}]);assert.equal(row.catalog.tools.length,2);assert.equal(selected[0].catalog_sha256,hex(7))
})
