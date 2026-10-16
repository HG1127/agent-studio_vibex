import test from "node:test"
import assert from "node:assert/strict"
import {
  exportWorkflowJson, parseWorkflowJson, selectedFragment,
  pasteFragment, alignNodes, insertConnectedNode, renameNodeReferences,
  findAvailableNodePosition, MAX_WORKFLOW_NODES,
} from "../src/lib/workflowGraphTransfer.ts"
import { inspectWorkflowGraph } from "../src/lib/workflowDiagnostics.ts"
import { workflowConnectionIssue } from "../src/lib/workflowConnectionRules.ts"
import { previewWorkflowNode, previewDependencies, isWorkflowNodeInLoopBody,
  suggestedVariablesForNode } from "../src/lib/workflowNodePreview.ts"
import { createWorkflowModelDebugPayload, parseWorkflowDebugModel } from "../src/lib/workflowNodeDebugRequest.ts"

const node = (id, type, title, x = 0, y = 0, data = {}) => ({
  id, type, position: { x, y }, data: { title, ...data },
})
const edge = (source, target, sourceHandle = null) => ({
  id: "e-" + source + "-" + target, source, target, sourceHandle,
})
const start = node("s1", "start", "开始", 0, 50)
const model = node("m1", "model", "分析", 300, 50, {
  model: "custom:private-model", prompt: "请处理 {{input}}",
  account_id: "private-owner-id", api_key: "do-not-export",
})
const end = node("e1", "end", "结束", 600, 50, {
  output_template: "{{分析.output}}",
})
const plainGraph = { nodes: [start, model, end], edges: [edge("s1", "m1"), edge("m1", "e1")] }
const exported = () => JSON.parse(exportWorkflowJson("示例", "", plainGraph))

test("export/import v1 preserves structure, never transfers account or model binding", () => {
  const raw = exportWorkflowJson("示例", "", plainGraph)
  assert.equal(raw.includes("private-owner-id"), false)
  assert.equal(raw.includes("do-not-export"), false)
  assert.equal(raw.includes("custom:private-model"), false)
  const { name, graph } = parseWorkflowJson(raw)
  assert.equal(name, "示例")
  assert.equal(graph.nodes.length, 3)
  assert.equal(graph.edges.length, 2)
  assert.equal(graph.nodes[1].data.model, "")
  assert.equal(graph.nodes[1].data.prompt, "请处理 {{input}}")
  assert.equal(graph.edges[0].source, "s1")
  assert.equal(graph.edges[0].target, "m1")
})

test("import rejects unsupported versions, invalid json, invalid titles, or forged bindings", () => {
  assert.throws(() => parseWorkflowJson("this is not json"), /JSON/)
  const payload = exported()
  payload.version = 15
  assert.throws(() => parseWorkflowJson(JSON.stringify(payload)), /版本/)
  payload.version = 1
  payload.graph.nodes[1].data.title = "开始"
  assert.throws(() => parseWorkflowJson(JSON.stringify(payload)), /标题/)
  payload.graph.nodes[1].data.title = "分析"
  payload.graph.nodes.push({ ...payload.graph.nodes[1] })
  assert.throws(() => parseWorkflowJson(JSON.stringify(payload)), /重复的节点 ID/)
  payload.graph.nodes.pop()
  payload.graph.nodes[1].type = "system_execute_shell"
  assert.throws(() => parseWorkflowJson(JSON.stringify(payload)), /节点类型/)
})

test("import rejects invalid endpoint, condition handles, cycles, and excessive size", () => {
  const payload = exported()
  payload.graph.edges[0].target = "ghost"
  assert.throws(() => parseWorkflowJson(JSON.stringify(payload)), /不存在/)
  payload.graph.edges[0].target = "m1"
  payload.graph.edges.push(edge("m1","s1"))
  assert.throws(() => parseWorkflowJson(JSON.stringify(payload)), /起止节点/)
  payload.graph.edges.pop()
  payload.graph.nodes.push(node("m2","model","分析2"))
  payload.graph.edges.push(edge("m1","m2"))
  payload.graph.edges.push(edge("m2","m1"))
  assert.throws(() => parseWorkflowJson(JSON.stringify(payload)), /非法循环/)
  payload.graph.edges.pop()
  payload.graph.edges.pop()
  payload.graph.nodes.pop()
  payload.graph.nodes[1].type = "condition"
  assert.throws(() => parseWorkflowJson(JSON.stringify(payload)), /条件节点/)
  assert.throws(() => parseWorkflowJson(" ".repeat(512 * 1024 + 1)), /512KB/)
})

test("import permits true loop returns but forbids connecting loop body directly to end", () => {
  const looping = {
    nodes: [start, node("loop1","loop","循环"), model, end],
    edges: [edge("s1","loop1"),edge("loop1","m1","body"),
      edge("m1","loop1"),edge("loop1","e1","done")],
  }
  assert.equal(parseWorkflowJson(exportWorkflowJson("循环", "", looping)).graph.edges.length, 4)
  looping.edges.push(edge("m1","e1"))
  assert.throws(() => parseWorkflowJson(exportWorkflowJson("循环", "", looping)), /循环体/)
})

test("tool import requires explicit authorized rebinding instead of silently changing semantics", () => {
  const tool = node("tool1","tool","原工具",300,10,{
    tool: "private-company-api", params_template: '{"query":"{{input}}"}',
  })
  const raw = exportWorkflowJson("来自同事", "", {
    nodes:[start,tool,end],
    edges:[edge("s1","tool1"),edge("tool1","e1")],
  })
  assert.equal(raw.includes("private-company-api"), false)
  const imported = parseWorkflowJson(raw)
  const importedTool = imported.graph.nodes.find(n=>n.type==="tool")
  assert.equal(importedTool.data.tool, "")
  assert.ok(inspectWorkflowGraph(imported.graph.nodes,imported.graph.edges)
    .some(issue=>issue.code==="tool_missing" && issue.nodeId==="tool1"))
})


test("connection rules explain duplicate ports, direction, illegal cycles and legal loop returns",()=>{
  const l=node("l1","loop","循环",350,50)
  const b=node("b1","model","循环模型",650,50)
  const next=node("n1","model","后续",950,200)
  const c=node("c1","condition","条件",300,250)
  const base={nodes:[start,l,b,next,end,c],
    edges:[edge("s1","l1"),edge("l1","b1","body"),edge("l1","n1","done"),
      edge("c1","e1","true")]}
  const issue=(source,target,sourceHandle=null,graph=base)=>
    workflowConnectionIssue(graph,{source,target,sourceHandle,targetHandle:null})
  assert.equal(issue("b1","l1"),null,"body node may return to the loop")
  assert.match(issue("n1","l1"),/只有从当前循环/)
  assert.match(issue("b1","e1"),/不能从循环体直接/)
  assert.match(issue("c1","n1","true"),/出口已有连线/)
  assert.equal(issue("c1","n1","false"),null)
  assert.match(issue("c1","n1"),/条件节点必须/)
  assert.match(issue("l1","n1","invalid"),/循环节点必须/)
  assert.match(issue("l1","b1","body"),/已经存在|已有连线/)
  assert.match(issue("e1","b1"),/结束节点没有输出/)
  assert.match(issue("b1","s1"),/开始节点不接受输入/)
  assert.match(issue("b1","b1"),/不能把节点直接连接到自己/)
  assert.match(issue("m-removed","n1"),/节点已经被删除/)
  const cycle={nodes:[start,b,next,end],
    edges:[edge("s1","b1"),edge("b1","n1"),edge("n1","e1")]}
  assert.match(issue("n1","b1",null,cycle),/形成非法环路/)
  const back={...base,edges:[...base.edges,edge("b1","l1")]}
  assert.match(issue("b1","l1",null,back),/已经存在/)
  assert.equal(issue("n1","e1",null,back),null,
    "a node after loop.done must still connect to end")
})
test("clipboard excludes start, duplicates only internal edges and updates renamed references", () => {
  const a = { ...model, selected: true }
  const b = { ...end, selected: true }
  const picked = selectedFragment([start, a, b], plainGraph.edges)
  assert.equal(picked.nodes.length, 2)
  assert.equal(picked.edges.length, 1)
  let n = 0
  const pasted = pasteFragment(picked, plainGraph.nodes, t => t + "-" + (++n))
  assert.notEqual(pasted.nodes[0].id, a.id)
  assert.equal(pasted.nodes[0].data.title, "分析 2")
  assert.equal(pasted.nodes[1].data.output_template, "{{分析 2.output}}")
  assert.equal(pasted.edges[0].source, pasted.nodes[0].id)
  assert.equal(pasted.edges[0].target, pasted.nodes[1].id)
  assert.deepEqual(plainGraph.nodes[1].data, model.data)
})

test("atomic connect either inserts both new node and edge or does not mutate source graph", () => {
  const before = { nodes: [start], edges: [] }
  const next = node("m3", "model", "模型", 300)
  const valid = insertConnectedNode(before,next,edge("s1","m3"))
  assert.deepEqual([valid.nodes.length,valid.edges.length],[2,1])
  assert.deepEqual([before.nodes.length,before.edges.length],[1,0])
  assert.throws(() => insertConnectedNode(before,next,edge("missing","m3")), /源节点/)
  assert.throws(() => insertConnectedNode(before,node("s2","start","开始2"),edge("s1","s2")), /源节点/)
  const branch = {nodes:[start,node("c1","condition","条件")],edges:[edge("s1","c1"),edge("c1","m3","true")]}
  assert.throws(()=>insertConnectedNode(branch,node("m4","model","模型"),edge("c1","m4","true")), /已被使用/)
  assert.equal(insertConnectedNode(branch,node("m4","model","模型"),edge("c1","m4","false")).nodes.length,3)
  const full = { nodes: Array.from({length: MAX_WORKFLOW_NODES},(_,i)=>node("n"+i,"model","n"+i)), edges:[]}
  assert.throws(()=>insertConnectedNode(full,next,edge("n0","m3")),/40/)
})

test("align and distribute operate only on selected nodes", () => {
  const nodes = [
    {...node("one","model","一",0,12),selected:true},
    {...node("two","model","二",300,60),selected:true},
    {...node("three","model","三",900,140),selected:true},
    {...node("four","model","四",50,500),selected:false},
  ]
  const aligned = alignNodes(nodes,"left")
  assert.deepEqual(aligned.slice(0,3).map(n=>n.position.x),[0,0,0])
  assert.equal(aligned[3],nodes[3])
  const dist = alignNodes(nodes,"distributeX")
  assert.deepEqual(dist.slice(0,3).map(n=>n.position.x),[0,450,900])
  const twoNodes = nodes.slice(0,2)
  assert.equal(alignNodes(twoNodes,"distributeX"),twoNodes)
})



test("quick-added workflow cards avoid overlap and preserve an empty drop position",()=>{
  const first=node("a","model","A",0,0)
  const second=node("b","model","B",260,0)
  const existing=[first,second]
  const desired={x:0,y:0}
  const placed=findAvailableNodePosition(existing,desired)
  assert.notDeepEqual(placed,desired)
  for (const other of existing){
    assert.ok(placed.x>=other.position.x+208+18 ||
      placed.x+208+18<=other.position.x ||
      placed.y>=other.position.y+122+18 ||
      placed.y+122+18<=other.position.y,
      "new node must not overlap any existing card")
  }
  assert.deepEqual(findAvailableNodePosition(existing,{x:4000,y:4000}),
    {x:4000,y:4000})
})
test("diagnostics accept runnable simple flow and detect missing model/configuration", () => {
  assert.deepEqual(inspectWorkflowGraph(plainGraph.nodes, plainGraph.edges), [])
  const withoutModel = { ...model, data: { ...model.data, model: "", prompt: "" } }
  const diagnostics = inspectWorkflowGraph([start,withoutModel,end], plainGraph.edges)
  assert.ok(diagnostics.some(i => i.code === "model_missing" && i.severity === "error"))
  assert.ok(diagnostics.some(i => i.code === "prompt_empty" && i.severity === "error"))
})

test("diagnostics detect broken variables, unreachable nodes and unreachable finish", () => {
  const changed = { ...model, data: { ...model.data, prompt:"根据 {{不存在.output}} 推断" } }
  const disconnected = node("x1", "tool", "外部工具", 900, 200, { tool: "" })
  const issues = inspectWorkflowGraph([start,changed,end,disconnected],[edge("s1","m1")])
  assert.ok(issues.some(i => i.code === "variable_unknown" && i.nodeId === "m1"))
  assert.ok(issues.some(i => i.code === "end_unreachable"))
  assert.ok(issues.some(i => i.code === "unreachable" && i.nodeId === "x1"))
  assert.ok(issues.some(i => i.code === "tool_missing" && i.nodeId === "x1"))
})

test("diagnostics flag condition branches without each required exit and invalid graph cycles", () => {
  const cond = node("c1","condition","内容判断",500,20,{value:"符合"})
  const issues = inspectWorkflowGraph([start,model,cond,end],[
    edge("s1","m1"),edge("m1","c1"),edge("c1","e1","true"),
  ])
  assert.ok(issues.some(i=>i.code==="condition_false"))
  const cycle = inspectWorkflowGraph([start,model,cond,end],[
    edge("s1","m1"),edge("m1","c1"),edge("c1","m1","true"),edge("c1","e1","false"),
  ])
  assert.ok(cycle.some(i=>i.code==="illegal_cycle"))
})

test("diagnostics permit completed loop with two outlets and a valid return", () => {
  const loop = node("l1","loop","循环",300,50,{count:"2",mode:"count",max_iterations:5})
  const nodes = [start,loop,model,end]
  const edges = [edge("s1","l1"),edge("l1","m1","body"),edge("m1","l1"),edge("l1","e1","done")]
  assert.equal(inspectWorkflowGraph(nodes,edges).filter(i=>i.severity==="error").length,0)
  const withoutReturn = inspectWorkflowGraph(nodes,edges.filter(e=>e.source!=="m1"))
  assert.ok(withoutReturn.some(i=>i.code==="loop_return"))
})

test("renaming a node repairs prompt, output template and condition refs without changing unrelated variables", () => {
  const nodes = [model,
    node("m2","model","后续",600,70,{prompt:"{{分析.output}} + {{input}}",ref_title:"分析"}),
    end,
  ]
  const renamed = renameNodeReferences(nodes,"分析","观察")
  assert.equal(renamed[0].data.title,"分析") // caller updates title as one transaction
  assert.equal(renamed[1].data.prompt,"{{观察.output}} + {{input}}")
  assert.equal(renamed[1].data.ref_title,"观察")
  assert.equal(renamed[2].data.output_template,"{{观察.output}}")
  assert.equal(nodes[1].data.prompt,"{{分析.output}} + {{input}}")
})

test("diagnostics detect non-upstream/self references and out-of-scope loop variables", () => {
  const second = node("m2","model","后续",600,50,{model:"model2",prompt:"{{结束.output}} / {{后续.output}}"})
  const refs = inspectWorkflowGraph([start,model,second,end],
    [edge("s1","m1"),edge("m1","m2"),edge("m2","e1")])
  assert.ok(refs.some(i=>i.code==="variable_not_upstream" && i.nodeId==="m2"))
  assert.equal(refs.some(i=>i.code==="variable_unknown"),false)
  const scope = node("m2","model","不在循环体",500,50,{model:"model2",prompt:"{{loop.item}}"})
  const scopeIssue = inspectWorkflowGraph([start,model,scope,end],
    [edge("s1","m1"),edge("m1","m2"),edge("m2","e1")])
  assert.ok(scopeIssue.some(i=>i.code==="loop_variable_scope" && i.nodeId==="m2"))
  const loop = node("loop1","loop","循环",210,50,{mode:"count",count:"2",max_iterations:2})
  const inBody = node("m2","model","循环体",530,30,{model:"model2",prompt:"{{loop.item}}"})
  const loopGraph = inspectWorkflowGraph([start,loop,inBody,end],[
    edge("s1","loop1"),edge("loop1","m2","body"),edge("m2","loop1"),edge("loop1","e1","done"),
  ])
  assert.equal(loopGraph.some(i=>i.code==="loop_variable_scope"),false)
})

test("loop body membership drives scoped variable preview, not a downstream exit", () => {
  const repeat=node("loop1","loop","循环",240,80,{mode:"count",count:"2"})
  const inside=node("inside","model","循环内",510,90,{
    model:"test",prompt:"研究 {{loop.item}}，第{{loop.index}}轮",
  })
  const outside=node("outside","model","循环外",800,190,{
    model:"test",prompt:"继续完成 {{input}}",
  })
  const graph={nodes:[start,repeat,inside,outside],edges:[
    edge("s1","loop1"),edge("loop1","inside","body"),
    edge("inside","loop1"),edge("loop1","outside","done"),
  ]}
  assert.equal(isWorkflowNodeInLoopBody(graph,"inside"),true)
  assert.equal(isWorkflowNodeInLoopBody(graph,"outside"),false)
  assert.equal(isWorkflowNodeInLoopBody(graph,"loop1"),false)
  const preview=previewWorkflowNode(graph,"inside",{
    input:"研究半导体",outputs:{},loop:{item:"公司A",index:2},
  })
  assert.equal(preview.renderedInput,"研究 公司A，第2轮")
})

test("variable quick-insert suggestions only include upstream nodes and scoped loop variables", () => {
  const follow=node("m2","model","后续",650,20,{model:"test",prompt:"{{分析.output}}"})
  const another=node("m3","model","不相关",650,200,{model:"test",prompt:"{{input}}"})
  const graph={nodes:[start,model,follow,another,end],edges:[
    edge("s1","m1"),edge("m1","m2"),edge("m2","e1"),
  ]}
  assert.deepEqual(suggestedVariablesForNode(graph,"m1"),["input"])
  assert.deepEqual(suggestedVariablesForNode(graph,"m2"),["input","分析.output"])
  assert.deepEqual(suggestedVariablesForNode(graph,"e1"),["input","分析.output","后续.output"])
  assert.deepEqual(suggestedVariablesForNode(graph,"m3"),["input"])
  const loop=node("l1","loop","循环",300,80,{mode:"count",count:"2",max_iterations:2})
  const inside=node("in","model","循环内",650,80,{model:"test",prompt:"{{loop.item}}"})
  const scoped={nodes:[start,loop,inside,end],edges:[
    edge("s1","l1"),edge("l1","in","body"),edge("in","l1"),edge("l1","e1","done"),
  ]}
  assert.deepEqual(suggestedVariablesForNode(scoped,"in"),
    ["input","循环.output","loop.item","loop.index"])
  // The loop's final body output is a possible predecessor before the done edge.
  assert.deepEqual(suggestedVariablesForNode(scoped,"e1"),
    ["input","循环.output","循环内.output"])
})

test("node sandbox renders model and Agent prompts using task and prior outputs without network", () => {
  const follow = node("m2","model","后续",600,50,{model:"custom:mine:test",prompt:"问题={{input}}；研究={{分析.output}}"})
  const graph = {nodes:[start,model,follow],edges:[edge("s1","m1"),edge("m1","m2")]}
  const originals = {input:"请分析",outputs:{m1:"结论A"}}
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error("Unexpected network call in local preview") }
  try {
    const rendered = previewWorkflowNode(graph,"m2",originals)
    assert.equal(rendered.renderedInput,"问题=请分析；研究=结论A")
    assert.equal(rendered.requiresRealExecution,true)
    assert.equal(rendered.errors.length,0)
    assert.equal(rendered.output,"")
    assert.deepEqual(previewDependencies(graph,"m2").map(n=>n.id),["m1"])
    const missing = previewWorkflowNode(graph,"m2",{input:"请分析",outputs:{}})
    assert.deepEqual(missing.missing,["分析.output"])
    assert.ok(missing.warnings.some(w=>w.includes("替换为空")))
  } finally { globalThis.fetch = originalFetch }
})

test("node sandbox validates tool JSON after template substitution without executing tools", () => {
  const tool = node("t1","tool","HTTP工具",300,40,{
    tool:"authorized-api",params_template:'{"query":"{{input}}","summary":"{{分析.output}}"}',
  })
  const graph = {nodes:[start,model,tool],edges:[edge("m1","t1")]}
  const valid = previewWorkflowNode(graph,"t1",{input:"nvidia",outputs:{m1:"GPU"}})
  assert.deepEqual(valid.parsedToolParams,{query:"nvidia",summary:"GPU"})
  assert.equal(valid.errors.length,0)
  assert.equal(valid.requiresRealExecution,true)
  const unsafeQuoted = previewWorkflowNode(graph,"t1",{input:'user"input',outputs:{m1:"GPU"}})
  assert.ok(unsafeQuoted.errors.some(e=>e.includes("JSON")))
  const emptyTool = node("t1","tool","工具",100,20,{tool:"",params_template:""})
  assert.ok(previewWorkflowNode({nodes:[emptyTool],edges:[]}, "t1", {input:"",outputs:{}}).errors.some(e=>e.includes("授权")))
})

test("node sandbox simulates condition text and numeric branches, and refuses to invent missing source", () => {
  const conditional = node("c1","condition","判断",650,50,{op:"gt",value:"12",ref_title:"分析"})
  const graph = {nodes:[start,model,conditional],edges:[edge("m1","c1")]}
  const above = previewWorkflowNode(graph,"c1",{input:"",outputs:{m1:"EPS 13.5"}})
  assert.equal(above.branch,"true")
  assert.ok(above.output.includes("条件满足"))
  const below = previewWorkflowNode(graph,"c1",{input:"",outputs:{m1:"EPS 9"}})
  assert.equal(below.branch,"false")
  const absent = previewWorkflowNode(graph,"c1",{input:"",outputs:{}})
  assert.equal(absent.branch,undefined)
  assert.ok(absent.warnings.some(w=>w.includes("尚未提供")))
  const equality = {...conditional,data:{...conditional.data,op:"eq",value:"利润稳定"}}
  assert.equal(previewWorkflowNode({nodes:[start,model,equality],edges:graph.edges},"c1",
    {input:"",outputs:{m1:"利润稳定"}}).branch,"true")
  assert.equal(previewWorkflowNode({nodes:[start,model,equality],edges:graph.edges},"c1",
    {input:"",outputs:{m1:"其他"}}).branch,"false")
})

test("node sandbox handles end templates and completed predecessor fallback", () => {
  const templated = previewWorkflowNode(plainGraph,"e1",{input:"",outputs:{m1:"证据充分"}})
  assert.equal(templated.output,"证据充分")
  const fallbackGraph = {nodes:[start,model,{...end,data:{title:"结束",output_template:""}}],edges:plainGraph.edges}
  const fallback = previewWorkflowNode(fallbackGraph,"e1",{input:"",outputs:{m1:"已完成"}})
  assert.equal(fallback.output,"已完成")
  assert.ok(fallback.source.includes("分析"))
  assert.ok(previewWorkflowNode(fallbackGraph,"e1",{input:"",outputs:{}}).warnings.length>0)
})

test("node sandbox caps loop rounds and supports comma/JSON list separators", () => {
  const loops = node("l1","loop","循环",300,30,{
    mode:"list",delimiter:"comma",list_source:"{{input}}",max_iterations:"2",
  })
  const graph = {nodes:[start,loops],edges:[edge("s1","l1")]}
  const result = previewWorkflowNode(graph,"l1",{input:"甲,乙,丙",outputs:{}})
  assert.equal(result.estimatedRounds,2)
  assert.deepEqual(result.sampleItems,["甲","乙"])
  const jsonMode = {...loops,data:{...loops.data,delimiter:"json_array"}}
  assert.equal(previewWorkflowNode({nodes:[start,jsonMode],edges:graph.edges},"l1",
    {input:'["一","二"]',outputs:{}}).estimatedRounds,2)
  assert.ok(previewWorkflowNode({nodes:[start,jsonMode],edges:graph.edges},"l1",
    {input:'{"not":"array"}',outputs:{}}).errors.some(e=>e.includes("数组")))
  const byCount = {...loops,data:{...loops.data,mode:"count",count:12,max_iterations:"3"}}
  assert.equal(previewWorkflowNode({nodes:[start,byCount],edges:graph.edges},"l1",
    {input:"",outputs:{}}).estimatedRounds,3)
  assert.ok(previewWorkflowNode({nodes:[start,{...byCount,data:{...byCount.data,max_iterations:33}}],edges:graph.edges},"l1",
    {input:"",outputs:{}}).errors.some(e=>e.includes("1–20")))
})

test("node sandbox provides scoped loop.item and loop.index samples", () => {
  const inside = node("m3","model","循环体节点",500,60,{model:"model",prompt:"{{loop.item}} / {{loop.index}}"})
  const graph = {nodes:[start,inside],edges:[edge("s1","m3")]}
  const miss = previewWorkflowNode(graph,"m3",{input:"",outputs:{}})
  assert.ok(miss.missing.includes("loop.item"))
  const withLoop = previewWorkflowNode(graph,"m3",
    {input:"",outputs:{},loop:{item:"公司A",index:2}})
  assert.equal(withLoop.renderedInput,"公司A / 2")
})

test("real model-node debug payload is explicitly employee-scoped, bounded and cost-marked",()=>{
  const chosen="custom:abcdefghijklmno:research-model-v1"
  const requestId="node-debug-request-000001"
  const payload=createWorkflowModelDebugPayload(chosen,[chosen],"  检查上游财报数据  ",requestId)
  assert.deepEqual(payload,{
    connection_id:"abcdefghijklmno",
    model:"research-model-v1",
    messages:[{role:"user",content:"检查上游财报数据"}],
    page:"workflow_node_debug",max_tokens:512,request_id:requestId,strict_model:true,
  })
  assert.equal(Object.hasOwn(payload,"api_key"),false)
  assert.equal(parseWorkflowDebugModel("custom:abcdefghijklmno:research-model-v1").modelId,"research-model-v1")
  assert.equal(parseWorkflowDebugModel("platform:gpt"),null)
  assert.equal(parseWorkflowDebugModel("custom:missing:model"),null)
  assert.throws(()=>createWorkflowModelDebugPayload(chosen,[],"valid text",requestId),/不在当前账号/)
  assert.throws(()=>createWorkflowModelDebugPayload(chosen,[chosen],"   ",requestId),/提示词为空/)
  assert.throws(()=>createWorkflowModelDebugPayload(chosen,[chosen],"A".repeat(8001),requestId),/8000/)
  assert.throws(()=>createWorkflowModelDebugPayload(chosen,[chosen],"ok","illegal request"),/请求编号/)
})
