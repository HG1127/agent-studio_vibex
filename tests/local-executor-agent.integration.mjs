/**
 * Runs the REAL Agent Studio engine against the opt-in local MCP executor:
 * isolated Chromium + actual PDF + actual XLSX + approval-gated XLSX export.
 * The model is deterministic; external data never leaves temporary loopback.
 */
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import ExcelJS from "exceljs"
import { createLocalExecutor } from "../ops/local-executor.mjs"
import { evaluateComplexAgentAcceptance } from "../src/lib/complexAgentAcceptance.ts"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function listen(server){
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
  return "http://127.0.0.1:"+server.address().port
}
async function getPort(){
  const s=createServer()
  const origin=await listen(s)
  await new Promise(resolve=>s.close(resolve))
  return Number(new URL(origin).port)
}
function makePdf(text) {
  const content="BT /F1 14 Tf 72 740 Td ("+text.replace(/[()\\]/g,"")+") Tj ET\n"
  const objs=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length "+Buffer.byteLength(content)+" >>\nstream\n"+content+"endstream",
  ]
  let data="%PDF-1.4\n";const offsets=[0]
  objs.forEach((o,i)=>{offsets.push(Buffer.byteLength(data));data+=(i+1)+" 0 obj\n"+o+"\nendobj\n"})
  const xref=Buffer.byteLength(data);data+="xref\n0 "+(objs.length+1)+"\n0000000000 65535 f \n"
  offsets.slice(1).forEach(n=>{data+=String(n).padStart(10,"0")+" 00000 n \n"})
  data+="trailer\n<< /Size "+(objs.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n"
  return Buffer.from(data)
}
function chromeExecutable(){
  return [process.env.AGENT_STUDIO_LOCAL_EXECUTOR_CHROME_BIN,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES,"Google","Chrome","Application","chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"],"Microsoft","Edge","Application","msedge.exe"),
    "/tmp/agentstudio-test-bin/chrome-linux64/chrome",
  ].find(p=>p&&fs.existsSync(p))
}
async function ready(url){
  for(let n=0;n<100;n++){
    try{const res=await fetch(url,{signal:AbortSignal.timeout(600)});if(res.ok)return}catch{}
    await sleep(100)
  }
  throw new Error("Local PocketBase startup failed")
}
const role=(id,name,depends_on,tools)=>({
  id,name,responsibility:"处理隔离来源与证据",tasks:["只用本阶段工具读取实际测试资产"],
  inputs:["任务输入及已审计的前序交付"],deliverables:["可核验阶段记录"],
  done_criteria:["带来源和单元格/页码证据"],depends_on,tools,
})
test("Actual Agent Studio owner-approved five-stage execution uses local Chromium, PDF, XLSX and creates a real reviewed workbook", {timeout:150_000},async()=>{
  const root=process.cwd()
  const binary=process.env.POCKETBASE_BIN || path.join(root,"vibex-local/bin/windows/pocketbase.exe")
  assert.ok(fs.existsSync(binary),"Configure a local PocketBase test binary")
  const chrome=chromeExecutable()
  assert.ok(chrome,"Set AGENT_STUDIO_LOCAL_EXECUTOR_CHROME_BIN to a real Chromium executable")
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),"studio-agent-real-workspace-"))
  const pbDir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-real-pb-"))
  const serverPort=await getPort()
  const apiOrigin="http://127.0.0.1:"+serverPort
  const bootstrapKey=randomBytes(24).toString("hex")
  const bridgeToken=randomBytes(32).toString("hex")
  const email="real-"+randomBytes(6).toString("hex")+"@example.test"
  const password="Fixture-"+randomBytes(20).toString("hex")+"!"
  let server=null,modelServer=null,pb=null,bridge=null,apiToken="",pbLogs=""
  const turns={researcher:0,documenter:0,analyst:0,reviewer:0,exporter:0,submitter:0}
  const names={}
  const websiteHits=[]
  let approvedWebSubmissions=0
  const site=createServer(async(req,res)=>{
    websiteHits.push(req.url)
    if(req.url==="/submit" && req.method==="POST"){
      let body="";for await(const piece of req)body+=piece.toString()
      if(new URLSearchParams(body).get("name")==="approved-demo")approvedWebSubmissions++
      res.writeHead(303,{location:"/receipt"});res.end();return
    }
    if(req.url==="/registered" && req.method==="GET"){
      res.writeHead(200,{"Content-Type":"text/html"})
      res.end('<title>Registered Action</title><form action="/submit" method="POST"><input name="name" id="name"/><button id="submit" type="submit">Submit</button></form>');return
    }
    if(req.url==="/receipt"){
      res.writeHead(200,{"Content-Type":"text/html"})
      res.end("<title>Submitted</title><p>approved-demo received</p>");return
    }
    res.writeHead(200,{"Content-Type":"text/html"})
    res.end('<title>Real Issuer Evidence</title><h1>Issuer revenue 120</h1><p>Risk R1</p>')
  })
  try{
    const siteOrigin=await listen(site)
    await fsp.writeFile(path.join(workspace,"issuer.pdf"),makePdf("Issuer note 7 confirms liabilities 30"))
    const wb=new ExcelJS.Workbook()
    const ws=wb.addWorksheet("Financials")
    ws.getCell("A2").value=120
    ws.getCell("B4").value=30
    await wb.xlsx.writeFile(path.join(workspace,"issuer.xlsx"))
    bridge=await createLocalExecutor({
      enabled:true,workspace,token:bridgeToken,allowedOrigins:[siteOrigin],
      allowedPaths:[{origin:siteOrigin,paths:["/issuer","/registered","/submit","/receipt"]}],
      enableWrites:true,chromeExecutable:chrome,enableBrowserActions:true,
      registeredActions:[{id:"approved_form",url:siteOrigin+"/registered",steps:[
        {kind:"fill",selector:"#name",arg_key:"name"},
        {kind:"click",selector:"#submit"},
      ],write_paths:["/submit"]}],
    })
    modelServer=createServer(async(req,res)=>{
      res.setHeader("Content-Type","application/json")
      let raw="";for await(const part of req)raw+=part.toString()
      const payload=JSON.parse(raw||"{}")
      const system=(payload.messages||[]).filter(m=>m.role==="system").map(m=>m.content).join("\n")
      const id=["researcher","documenter","analyst","reviewer","exporter","submitter"].find(id=>system.includes("（"+id+"）"))
      if(!id){res.writeHead(400);res.end(JSON.stringify({error:"invalid_stage_context"}));return}
      const turn=++turns[id]
      const spec={
        researcher:{tool:names.browser_read_page,args:{url:siteOrigin+"/issuer"},
          output:"REAL_SOURCE: issuer revenue 120 risk R1 from "+siteOrigin+"/issuer"},
        documenter:{tool:names.document_pdf_extract,args:{input_path:"issuer.pdf",pages:[1]},
          output:"REAL_PDF: issuer.pdf page 1 note 7 liabilities 30"},
        analyst:{tool:names.spreadsheet_analyze,args:{input_path:"issuer.xlsx",sheet:"Financials",left_cell:"A2",right_cell:"B4"},
          output:"REAL_XLSX: issuer.xlsx Financials A2=120 minus B4=30 gives 90"},
        reviewer:{output:"REVIEW_PASS: chromium source, PDF page 1 and XLSX cells agree; the approved export may proceed"},
        submitter:{tool:names.browser_registered_action,args:{action_id:"approved_form",arguments:{name:"approved-demo"}},
          output:"FINAL_REGISTERED_BROWSER_ACTION: approved-demo received; only one approved form submission."},
        exporter:{tool:names.spreadsheet_export_report,args:{output_name:"reviewed-report.xlsx",
          title:"Approved Investor Research",rows:[
            {label:"Revenue",value:120},{label:"Liabilities",value:30},{label:"Net",value:90},
          ]},
          output:"FINAL_REAL_DELIVERY: locally exported reviewed-report.xlsx; revenue 120; PDF p.1; Financials A2 and B4; result 90"},
      }[id]
      const content=turn===1 && spec.tool ?
        JSON.stringify({action:"tool",tool:spec.tool,tool_input:spec.args,thought:"Explicitly approved local executor only"}) :
        ["exporter","submitter"].includes(id) ?
        JSON.stringify({action:"final",final_answer:spec.output}) :
        JSON.stringify({action:"role_complete",role_id:id,role_output:spec.output})
      res.end(JSON.stringify({choices:[{message:{role:"assistant",content}}]}))
    })
    const modelOrigin=await listen(modelServer)
    pb=spawnHeadlessPocketBase(binary,["serve","--http=127.0.0.1:"+serverPort,
      "--dir="+pbDir,"--hooksDir="+path.join(root,"pocketbase/pb_hooks")],{
      cwd:path.join(root,"pocketbase"),
      env:{...process.env,AGENT_STUDIO_AUTH_MODE:"standalone",AGENT_STUDIO_ALLOW_ANON:"false",
        AGENT_STUDIO_LEGACY_TEST_ONLY:"false",AGENT_STUDIO_BOOTSTRAP_SECRET:bootstrapKey,
        AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString("hex"),
        AGENT_STUDIO_STRICT_SECRETS:"true",AGENT_STUDIO_BACKGROUND_WORKER:"false"},
    })
    pb.stdout.on("data",b=>{pbLogs=(pbLogs+b).slice(-7000)})
    pb.stderr.on("data",b=>{pbLogs=(pbLogs+b).slice(-7000)})
    await ready(apiOrigin+"/api/health")
    const rawApi=async(method,route,body,token=apiToken,extra={})=>{
      const res=await fetch(apiOrigin+route,{method,
        headers:{"Content-Type":"application/json",...(token?{Authorization:token}:{}),...extra},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)})
      return {status:res.status,data:await res.json().catch(()=>({}))}
    }
    const api=async(method,route,body)=>{
      const res=await rawApi(method,route,body)
      assert.equal(res.status,200,method+" "+route+": "+JSON.stringify(res.data))
      return res.data
    }
    const bootstrap=await rawApi("POST","/api/studio/bootstrap",
      {email,password,display_name:"Real Local Executor Acceptance"},"",
      {"X-Agent-Studio-Setup-Key":bootstrapKey})
    assert.equal(bootstrap.status,201,"Temporary employee bootstrap")
    const login=await rawApi("POST","/api/collections/studio_users/auth-with-password",
      {identity:email,password},"")
    assert.equal(login.status,200)
    apiToken=login.data.token

    const model=await api("POST","/api/model-connections",{
      name:"Real-tools local test model",provider:"openai",base_url:modelOrigin+"/v1",
      api_key:"local-fixture-not-a-secret",models:["local-real-executor-model"]})
    assert.ok(model.item?.id,"Saved model connection")
    const connection=await api("POST","/api/market/connect",{
      name:"local_pilot_execution",title:"Controlled real browser/PDF/Excel",
      url:bridge.origin+"/mcp",headers:[{key:"Authorization",value:"Bearer "+bridgeToken}],
    })
    assert.equal(connection.ok,true,JSON.stringify(connection))
    assert.equal(connection.connection.tool_count,5)
    const id=connection.connection.id
    for(const tool of ["browser_read_page","document_pdf_extract","spreadsheet_analyze","spreadsheet_export_report","browser_registered_action"])
      names[tool]="mkt__"+id+"__"+tool
    assert.equal(JSON.stringify(connection).includes(bridgeToken),false,"MCP credential must not appear in API response")

    const stages=[
      role("researcher","网页研究",[],[names.browser_read_page]),
      role("documenter","PDF研究",["researcher"],[names.document_pdf_extract]),
      role("analyst","财务核对",["documenter"],[names.spreadsheet_analyze]),
      role("reviewer","独立审核",["analyst"],[]),
      role("exporter","审批后导出",["reviewer"],[names.spreadsheet_export_report]),
    ]
    const tools=Object.values(names).filter(item=>item!==names.browser_registered_action)
    const spec=await api("POST","/api/agent_specs",{name:"真实浏览器+PDF+Excel五角色验收",spec:{
      goal:"使用受控真实工具完成隔离发行人研究、核算、独立审核和批准后Excel交付",
      task_scope:"仅测试循环网段网页与临时文件，禁止外部域名与操作系统调用",
      tools,roles:stages,task_plan:["网页","PDF","表格","审核","导出"],
      deliverables:["来源索引","页码","单元格核算","复核","xlsx"],
      done_criteria:["每个真实 MCP 工具执行一次","对外文件需要人工批准"],
      require_approval:true,
      capability_requirements:stages.filter(s=>s.tools.length).map((stage,i)=>({
        id:"cap_"+i,title:"阶段 "+stage.name,purpose:stage.responsibility,
        kind:i===0?"browser":i===3?"document":"document",access:i===3?"write":"read",
        required:true,role_ids:[stage.id],search_terms:[],suggested_tool_ids:stage.tools,
      })),
    }})
    const start=await api("POST","/api/agent-runs/start",{
      spec_id:spec.id,instruction:"REAL_EXECUTOR_ACCEPTANCE: authorized isolated assets only",
      model:"local-real-executor-model",
      config:{max_steps:15,max_model_calls:25,tools:{},require_approval:true,
        market_tool_ids:tools,custom_model:{connection_id:model.item.id,model_id:"local-real-executor-model"}},
    })
    const runId=start.run_id
    assert.ok(runId)
    const state=()=>api("GET","/api/agent_runs/"+runId)
    const tick=()=>api("POST","/api/llm/agent-engine/"+runId+"/tick",{})
    assert.equal(bridge.audit.length,0,"No local tools before execution")
    for(const [stageId,toolName] of [["researcher","browser_read_page"],["documenter","document_pdf_extract"],
      ["analyst","spreadsheet_analyze"],["exporter","spreadsheet_export_report"]]){
      if(stageId==="exporter"){
        // Reviewer finishes without a tool and passes its approved handoff.
        await tick()
        assert.equal((await state()).checkpoint.role_state.active_role_id,"exporter")
      }
      await tick()
      const beforeApproval=await state()
      assert.equal(beforeApproval.status,"awaiting_approval",stageId+" must request approval")
      assert.equal(beforeApproval.checkpoint.role_state.active_role_id,stageId)
      assert.equal(bridge.audit.filter(x=>x.tool===toolName).length,0,"No call before approval: "+toolName)
      const actor=await rawApi("POST","/api/agent-runs/"+runId+"/approve",{decision:"approve"},apiToken)
      assert.equal(actor.status,200,JSON.stringify(actor))
      await tick()
      assert.equal(bridge.audit.filter(x=>x.tool===toolName&&x.success).length,1,
        "Approved real tool executes exactly once: "+toolName)
      if(stageId!=="exporter")await tick()
    }
    // The approved export call is followed by one last model turn that returns final.
    await tick()
    const completed=await state()
    assert.equal(completed.status,"succeeded",JSON.stringify(completed))
    assert.deepEqual(completed.checkpoint.role_state.completed,
      ["researcher","documenter","analyst","reviewer","exporter"])
    assert.match(completed.result,/reviewed-report\.xlsx/)
    const detail=await api("GET","/api/agent-runs/"+runId+"/detail")
    const acceptance=evaluateComplexAgentAcceptance(spec.spec,{
      status:detail.run.status,result:detail.run.result,
      checkpoint:detail.run.checkpoint,events:detail.events,
    })
    assert.equal(acceptance.applicable,true)
    assert.equal(acceptance.verified,true,
      "Actual Chromium/PDF/XLSX/approval evidence must satisfy the complex Agent gate: "+JSON.stringify(acceptance.issues))
    assert.equal(acceptance.stagesVerified,5)
    assert.equal(acceptance.requiredVerified,4)

    const events=detail.events
    assert.equal(events.filter(x=>x.content?.role_phase==="completed").length,5)
    const content=JSON.stringify(events)
    for(const signal of ["Real Issuer Evidence","liabilities 30","real_xlsx_numeric_cells","reviewed-report.xlsx"])
      assert.match(content,new RegExp(signal))
    assert.equal(events.filter(x=>x.event_type==="tool_call"&&x.content?.role_id==="reviewer").length,0)
    assert.deepEqual(bridge.audit.filter(x=>x.success).map(x=>x.tool),
      ["browser_read_page","document_pdf_extract","spreadsheet_analyze","spreadsheet_export_report"])
    const output=path.join(workspace,"artifacts","reviewed-report.xlsx")
    const actual=await fsp.readFile(output)
    const reread=new ExcelJS.Workbook()
    await reread.xlsx.load(actual)
    assert.equal(reread.getWorksheet("Verified Report").getCell("B4").value,90)
    assert.deepEqual(websiteHits,["/issuer"])
    assert.equal(JSON.stringify(events).includes(bridgeToken),false,"No raw MCP token in audit")
    // Separate, owner-scoped action Agent: approval is mandatory for the
    // operator-registered browser POST, and never granted to read-only roles.
    const registeredTool=names.browser_registered_action
    const actionSpec=await api("POST","/api/agent_specs",{name:"受控浏览器表单提交验收",spec:{
      goal:"只允许通过已登记动作提交本地测试表单",
      task_scope:"仅本机已登记 action_id；不允许模型指定 URL 或选择器",
      tools:[registeredTool],
      roles:[role("submitter","网页提交",[],[registeredTool])],
      task_plan:["调用已登记动作","等待人工授权","核验回执"],
      deliverables:["本机测试表单回执"],done_criteria:["明确审批且只执行一次"],
      require_approval:true,
      capability_requirements:[{id:"browser_action",title:"登记动作",purpose:"仅提交允许的本机表单",
        kind:"browser",access:"write",required:true,role_ids:["submitter"],search_terms:[],
        suggested_tool_ids:[registeredTool]}],
    }})
    const actionStart=await api("POST","/api/agent-runs/start",{
      spec_id:actionSpec.id,instruction:"REGISTERED_BROWSER_ACTION_TEST",
      model:"local-real-executor-model",
      config:{max_steps:5,max_model_calls:8,tools:{},require_approval:true,
        market_tool_ids:[registeredTool],
        custom_model:{connection_id:model.item.id,model_id:"local-real-executor-model"}},
    })
    const actionId=actionStart.run_id
    const actionTick=()=>api("POST","/api/llm/agent-engine/"+actionId+"/tick",{})
    const actionState=()=>api("GET","/api/agent_runs/"+actionId)
    await actionTick()
    assert.equal((await actionState()).status,"awaiting_approval")
    assert.equal(approvedWebSubmissions,0,"Form cannot be posted before employee approval")
    assert.equal(bridge.audit.filter(item=>item.tool==="browser_registered_action").length,0)
    const rejectOtherEmployee=await rawApi("POST","/api/agent-runs/"+actionId+"/approve",
      {decision:"approve"},"")
    assert.equal(rejectOtherEmployee.status,401,"Anonymous user cannot approve browser action")
    await api("POST","/api/agent-runs/"+actionId+"/approve",{decision:"approve"})
    await actionTick()
    assert.equal(approvedWebSubmissions,1)
    assert.equal(bridge.audit.filter(item=>item.tool==="browser_registered_action"&&item.success).length,1)
    await actionTick()
    assert.equal((await actionState()).status,"succeeded")
    assert.match((await actionState()).result,/FINAL_REGISTERED_BROWSER_ACTION/)
    assert.equal(JSON.stringify(await api("GET","/api/agent-runs/"+actionId+"/detail")).includes(bridgeToken),false)

    console.log("REAL_LOCAL_EXECUTOR_AGENT",JSON.stringify({passed:true,
      employee_authenticated:true,roles:5,real_tools:5,approved:5,registered_browser_action:true,
      actual_chromium:true,actual_pdf:true,actual_xlsx:true,actual_report:true,
      final_status:completed.status,isolated_loopback:true}))
  }finally{
    if(pb)await stopHeadlessPocketBase(pb)
    if(bridge)await bridge.close()
    if(modelServer)await new Promise(resolve=>modelServer.close(resolve))
    await new Promise(resolve=>site.close(resolve))
    await fsp.rm(workspace,{recursive:true,force:true,maxRetries:4,retryDelay:200})
    await fsp.rm(pbDir,{recursive:true,force:true,maxRetries:4,retryDelay:200})
  }
})
