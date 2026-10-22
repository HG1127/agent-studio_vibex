import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeWorkflowEditor} from "../src/lib/pgNativeWorkflowEditor.ts"
import {newPgWorkflowGraph} from "../src/lib/pgNativeWorkflowGraph.ts"
import {PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222"
const row=(revision=1,name="Synthetic",graph=newPgWorkflowGraph())=>({id,revision,name,graph})
const turn=()=>new Promise(resolve=>setImmediate(resolve))
test("new graph recovery freezes its random record identity and body without duplicate POSTs",async()=>{
  let calls=[],finish
  const api={getWorkflow:async()=>row(),createWorkflowGraph:async(...args)=>{calls.push(args);return new Promise((_resolve,reject)=>{finish=reject})}}
  const editor=createPgNativeWorkflowEditor(api,()=>{},()=>id);editor.fresh("Synthetic")
  const first=editor.save(),second=editor.save();assert.equal(first,second);await turn();finish(new PgNativePilotError(0,"lost"));await first
  const frozen=editor.snapshot().pending;editor.fresh("Different",true);assert.equal(editor.snapshot().pending,frozen)
  api.createWorkflowGraph=async(...args)=>{calls.push(args);return row()};await editor.save()
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1][2],id);assert.equal(editor.snapshot().dirty,false);assert.equal(editor.snapshot().pending,null)
  editor.dispose()
})
test("ambiguous CAS update recovers only the exact next server revision and never overwrites a concurrent edit",async()=>{
  let current=row(),updates=0
  const api={getWorkflow:async()=>current,updateWorkflowGraph:async()=>{updates++;if(updates===1){current=row(2,"Changed");throw new PgNativePilotError(0,"lost")}
    throw new PgNativePilotError(409,"revision_conflict")}}
  const editor=createPgNativeWorkflowEditor(api,()=>{});await editor.open(id);editor.edit("Changed",newPgWorkflowGraph())
  await editor.save();assert.ok(editor.snapshot().pending);await editor.save();assert.equal(editor.snapshot().pending,null);assert.equal(editor.snapshot().draft.revision,2)
  editor.edit("Our draft",newPgWorkflowGraph());api.updateWorkflowGraph=async()=>{throw new PgNativePilotError(0,"lost")};await editor.save()
  current=row(3,"Another browser");api.updateWorkflowGraph=async()=>{throw new PgNativePilotError(409,"revision_conflict")};await editor.save()
  assert.equal(editor.snapshot().pending,null);assert.equal(editor.snapshot().draft.name,"Our draft");assert.equal(current.name,"Another browser")
  assert.equal(editor.snapshot().dirty,true);editor.dispose()
})
test("dirty drafts prevent implicit replacement; logout and obsolete reads cannot repopulate another view",async()=>{
  let resolveOld,expired=0
  const api={getWorkflow:async()=>row()},editor=createPgNativeWorkflowEditor(api,()=>{expired++})
  await editor.open(id);editor.edit("Unsaved",newPgWorkflowGraph());await editor.open(other);assert.equal(editor.snapshot().draft.name,"Unsaved")
  api.getWorkflow=()=>new Promise(resolve=>{resolveOld=resolve});const read=editor.open(other,true);await turn();editor.dispose();resolveOld({...row(),id:other});await read
  assert.equal(editor.snapshot().draft,null)
  const next=createPgNativeWorkflowEditor({getWorkflow:async()=>{throw new PgNativePilotError(401,"expired")}},()=>{expired++});await next.open(id)
  assert.equal(expired,1);assert.equal(next.snapshot().draft,null);next.fresh("must not reopen");assert.equal(next.snapshot().draft,null)
})

test("undo groups a drag, returns to the saved baseline and clears redo on a new edit",async()=>{
  const editor=createPgNativeWorkflowEditor({getWorkflow:async()=>row(),updateWorkflowGraph:async(_id,revision,name,graph)=>row(revision+1,name,graph)},()=>{})
  await editor.open(id)
  editor.beginGesture()
  for(const x of [100,120,180]){const graph=structuredClone(editor.snapshot().draft.graph);graph.nodes[0].position.x=x;editor.edit("Synthetic",graph)}
  editor.endGesture()
  assert.equal(editor.snapshot().undoDepth,1);assert.equal(editor.snapshot().dirty,true)
  editor.undo();assert.equal(editor.snapshot().dirty,false);assert.equal(editor.snapshot().redoDepth,1)
  editor.redo();assert.equal(editor.snapshot().draft.graph.nodes[0].position.x,180)
  editor.undo();editor.edit("New name",newPgWorkflowGraph());assert.equal(editor.snapshot().redoDepth,0)
  await editor.save();assert.equal(editor.snapshot().dirty,false);assert.equal(editor.snapshot().undoDepth,0)
  editor.undo();assert.equal(editor.snapshot().draft.name,"New name");editor.dispose()
})
