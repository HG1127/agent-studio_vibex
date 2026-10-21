/**
 * Real Chrome + independent login + isolated PocketBase review journey.
 * No real credentials, paid providers, deployment, production database or external services.
 */
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { DatabaseSync } from "node:sqlite"
import { spawn } from "node:child_process"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root=process.cwd()
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const chromeChoices=[
  process.env.AGENT_STUDIO_UI_CHROME_BIN,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean)
async function freePort() {
  return new Promise((resolve,reject)=>{
    const socket=net.createServer()
    socket.once("error",reject)
    socket.listen(0,"127.0.0.1",()=>{
      const port=socket.address().port
      socket.close(()=>resolve(port))
    })
  })
}
async function ready(url,child,getLogs) {
  for(let i=0;i<130;i++){
    if(child.exitCode!==null) throw new Error("test_server_exited "+getLogs().slice(-700))
    try{
      const res=await fetch(url,{signal:AbortSignal.timeout(900)})
      if(res.status<500)return
    }catch{}
    await sleep(160)
  }
  throw new Error("test_server_not_ready "+getLogs().slice(-900))
}
class CDP {
  constructor(ws) {
    this.ws=ws;this.next=1;this.pending=new Map()
    ws.addEventListener("message",event=>{
      let msg
      try{msg=JSON.parse(String(event.data))}catch{return}
      if(!msg.id)return
      const item=this.pending.get(msg.id)
      if(!item)return
      this.pending.delete(msg.id)
      clearTimeout(item.timeout)
      if(msg.error)item.reject(new Error(String(msg.error.message)))
      else item.resolve(msg.result||{})
    })
  }
  command(method,params={},sessionId){
    const id=this.next++
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{this.pending.delete(id);reject(new Error("CDP "+method+" timed out"))},36000)
      this.pending.set(id,{resolve,reject,timeout})
      this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))
    })
  }
  close(){
    this.pending.forEach(item=>{clearTimeout(item.timeout);item.reject(new Error("CDP closed"))})
    this.pending.clear()
    this.ws.close()
  }
}
async function launchChrome(profile){
  const bin=chromeChoices.find(file=>fs.existsSync(file))
  assert.ok(bin,"Headless Chrome/Edge not found. Set AGENT_STUDIO_UI_CHROME_BIN")
  const child=spawn(bin,[
    "--headless=new","--disable-gpu","--disable-extensions",
    "--disable-background-networking","--disable-sync","--no-first-run",
    "--no-default-browser-check","--remote-debugging-port=0",
    "--remote-allow-origins=*","--user-data-dir="+profile,
    "--window-size=1400,1000","about:blank",
  ],{windowsHide:true,stdio:"ignore"})
  let marker=""
  const markerFile=path.join(profile,"DevToolsActivePort")
  for(let attempt=0;attempt<135;attempt++){
    if(fs.existsSync(markerFile)){marker=fs.readFileSync(markerFile,"utf8");break}
    if(child.exitCode!==null)break
    await sleep(110)
  }
  assert.ok(marker,"Isolated Chrome could not start")
  const debugPort=marker.split(/\r?\n/)[0]
  const info=await fetch("http://127.0.0.1:"+debugPort+"/json/version").then(res=>res.json())
  const ws=new WebSocket(info.webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error("Chrome CDP connect timeout")),7000)
    ws.addEventListener("open",()=>{clearTimeout(timeout);resolve()},{once:true})
    ws.addEventListener("error",()=>{clearTimeout(timeout);reject(new Error("Chrome CDP connect error"))},{once:true})
  })
  const client=new CDP(ws)
  const target=await client.command("Target.createTarget",{url:"about:blank"})
  const attachment=await client.command("Target.attachToTarget",{targetId:target.targetId,flatten:true})
  await client.command("Page.enable",{},attachment.sessionId)
  await client.command("Runtime.enable",{},attachment.sessionId)
  return {child,client,sessionId:attachment.sessionId}
}

test("real Chrome: review, auto tools, global editing, routing and plugin navigation", {timeout:350000},async()=>{
  const pbBinary=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
  const vite=path.join(root,"node_modules/vite/bin/vite.js")
  assert.ok(fs.existsSync(pbBinary)&&fs.existsSync(vite),"Local PocketBase/Vite required")
  const testDir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-review-browser-"))
  const tmp=path.join(root,".tmp");fs.mkdirSync(tmp,{recursive:true})
  const chromeDir=fs.mkdtempSync(path.join(tmp,"agentstudio-review-chrome-"))
  const [pbPort,vitePort]=await Promise.all([freePort(),freePort()])
  const webOrigin="http://127.0.0.1:"+vitePort
  const apiOrigin="http://127.0.0.1:"+pbPort
  const setupKey=randomBytes(32).toString("hex")
  const secret=randomBytes(16).toString("hex")
  const password="Ui-"+randomBytes(18).toString("hex")+"!"
  const email="review-"+randomBytes(5).toString("hex")+"@example.test"
  let pb, frontend, chrome, mock
  let pbLogs="",viteLogs="",agentModelCalls=0,optimizeModelCalls=0,optimizeSource=""
  let v17PlanCalls=0,v17McpCalls=0,v17ModelToolCalls=0,v17ApprovalQuestions=0
  let userToken=""
  try{
    mock=createServer(async(req,res)=>{
      let raw=""
      for await(const part of req)raw+=part.toString()
      const input=JSON.parse(raw||"{}")
      // Mock an actual MCP transport endpoint, discovered through the same
      // authenticated /api/market/connect request used by the plugin market.
      if(req.method==="POST" && (req.url==="/mcp" || req.url==="/mcp-ui")){
        if(input.method==="tools/call")v17McpCalls++
        const result=input.method==="tools/list"
          ? {tools:[
              {name:"doc_search",description:"Browse approved documents",
                annotations:{readOnlyHint:true,destructiveHint:false},
                inputSchema:{type:"object",properties:{query:{type:"string"}}}},
              {name:"doc_write",description:"Write external file",
                annotations:{readOnlyHint:false,destructiveHint:true},
                inputSchema:{type:"object",properties:{content:{type:"string"}}}},
            ]}
          : {content:[{type:"text",text:"已从MCP模板库核验到需求文档：需要先确认需求范围，再制定实施计划与验收标准"}]}
        res.writeHead(200,{"Content-Type":"application/json"})
        res.end(JSON.stringify({jsonrpc:"2.0",id:input.id,result}))
        return
      }

      const sys=(input.messages||[]).filter(x=>x.role==="system").map(x=>x.content).join("\n")
      const user=(input.messages||[]).filter(x=>x.role==="user").map(x=>x.content).join("\n")
      let content="本次经验：优先明确需求、人工确认并制定分阶段计划。"
      if(sys.includes("助手方案设计器") && user.includes("V17_CREATE_JOURNEY")){
        v17PlanCalls++
        content=JSON.stringify({
          name:"需求落地全链路Agent",
          goal:"将原始需求拆解为规范方案，经过人工确认后生成可执行落地计划",
          task_scope:"接收输入需求，查询授权知识库与模板库，整理范围、优先级、依赖和验收标准。仅生成规划文档，不执行外部写入。",
          deliverables:["结构化需求方案","分阶段实施计划","可核验验收清单"],
          tools:["知识库检索","doc_search","计算器"],
          task_plan:["检索授权知识库的术语规范","计算阶段资源预算","调用已验证MCP模板工具","提交需求方案等待人工确认","产出实施里程碑和验收标准"],
          done_criteria:["需求方案含范围和风险","用户批准需求方案","最终落地计划列出负责人和验收条件"],
          require_plan_review:true,
        })
      } else if(sys.includes("Agent 方案优化顾问")){
        optimizeModelCalls++
        optimizeSource=user
        content=JSON.stringify({
          suggested_prompt:"【优化后目标】优先实现可追溯资料检索及权限隔离",
          suggested_criteria:"支持文件出处引用；确保知识库访问权限正确",
          suggested_tools_note:"保留已授权的检索插件，其他插件继续按需选择",
          rationale:"依据员工反馈和评估建议，补齐权限及来源证据",
        })
      } else if(sys.includes("助手执行引擎") && user.includes("V17_RUN_JOURNEY")){
        v17ModelToolCalls++
        agentModelCalls++
        const marketId=selectedToolId
        let decision
        if(sys.includes("方案确认关卡已通过")){
          decision={thought:"已收到用户批准，基于真实工具证据交付",
            action:"final",
            final_answer:"## 需求落地正式方案\n\n**背景与范围**：团队需要可靠地落地输入需求。\n\n### 核验来源\n- 知识库：内部需求管理规范及优先级说明\n- MCP 工具：已核验需求模板\n\n### 分阶段落地计划\n1. 需求澄清与确认（负责人：产品）\n2. 能力开发及联调（负责人：工程）\n3. 验收测试和交付（负责人：质量负责人）\n\n### 验收标准\n- 需求范围经人工批准\n- 产出有出处、工具调用有审计记录"}
        }else if(user.includes("动作：tool("+marketId+")")){
          v17ApprovalQuestions++
          decision={thought:"工具调用证据已齐，提交方案供人工决策",action:"ask_user",
            question:"【结构化需求方案】目标：自动拆解需求并形成正式方案；范围：内部需求整理，不自动对外写入；验收：包含优先级、依赖和明确负责人。是否批准这份草案，或要求修改？"}
        }else if(user.includes("动作：tool(calculate)")){
          decision={thought:"使用模板查询MCP完善需求规范",action:"tool",
            tool:marketId,tool_input:{query:"需求落地标准模板"}}
        }else if(user.includes("动作：tool(knowledge_search)")){
          decision={thought:"预算预估计算",action:"tool",
            tool:"calculate",tool_input:{expression:"(4+6)*3"}}
        }else {
          decision={thought:"先从当前已授权的知识库查正式术语",action:"tool",
            tool:"knowledge_search",tool_input:{query:"需求验收规范 优先级 风险"}}
        }
        content=JSON.stringify(decision)
      } else if(sys.includes("助手执行引擎")){
        agentModelCalls++
        let answer="【需求方案草案】首版：实现内部资料检索。"
        if(sys.includes("方案确认关卡已通过"))
          answer="## 最终实施计划通过\n\n- **第一阶段**：资料授权\n- **第二阶段**：检索与引用\n\n| 阶段 | 交付物 |\n| --- | --- |\n| 第三阶段 | 验收上线 |"
        else if(user.includes("草案不予批准"))
          answer="【修订方案草案】明确权限隔离，优先内部知识检索。"
        // Always wrongly emit final to verify the backend review gate.
        content=JSON.stringify({thought:"Deliver the current phase",action:"final",final_answer:answer})
      }
      res.writeHead(200,{"Content-Type":"application/json"})
      res.end(JSON.stringify({choices:[{message:{role:"assistant",content}}]}))
    })
    await new Promise(resolve=>mock.listen(0,"127.0.0.1",resolve))
    const modelPort=mock.address().port
    pb=spawnHeadlessPocketBase(pbBinary,[
      "serve","--http=127.0.0.1:"+pbPort,"--dir="+testDir,
      "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
    ],{cwd:path.join(root,"pocketbase"),stdio:["ignore","pipe","pipe"],env:{
      AGENT_STUDIO_AUTH_MODE:"standalone",AGENT_STUDIO_ALLOW_ANON:"false",
      AGENT_STUDIO_BOOTSTRAP_SECRET:setupKey,AGENT_STUDIO_SECRET_KEY:secret,
      AGENT_STUDIO_STRICT_SECRETS:"true",AGENT_STUDIO_BACKGROUND_WORKER:"false",
    }})
    pb.stdout.on("data",chunk=>{pbLogs=(pbLogs+chunk).slice(-5000)})
    pb.stderr.on("data",chunk=>{pbLogs=(pbLogs+chunk).slice(-5000)})
    await ready(apiOrigin+"/api/health",pb,()=>pbLogs)
    const bootstrap=await fetch(apiOrigin+"/api/studio/bootstrap",{
      method:"POST",headers:{"Content-Type":"application/json","X-Agent-Studio-Setup-Key":setupKey},
      body:JSON.stringify({email,password,display_name:"Review Browser Test"}),
    })
    assert.equal(bootstrap.status,201,"isolated employee bootstrap failed")
    const login=await fetch(apiOrigin+"/api/collections/studio_users/auth-with-password",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({identity:email,password}),
    })
    assert.equal(login.status,200,"isolated account login failed")
    userToken=(await login.json()).token
    async function api(method,route,body) {
      const res=await fetch(apiOrigin+route,{
        method,headers:{"Content-Type":"application/json",Authorization:userToken},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(12000),
      })
      const data=await res.json().catch(()=>({}))
      assert.equal(res.status,200,route+" "+JSON.stringify(data).slice(0,550))
      return data
    }
    const connection=await api("POST","/api/model-connections",{
      name:"Review Chrome mock",provider:"openai",
      base_url:"http://127.0.0.1:"+modelPort+"/v1",
      api_key:"review-test-only",models:["review-ui-model"],
    })
    const spec=await api("POST","/api/agent_specs",{
      name:"需求落地方案助手",
      spec:{goal:"生成草案，先人工确认，再给出落地计划",
        task_scope:"只负责需求文档和执行计划，不修改外部系统",
        task_plan:["提出草案","人工确认","给出实施计划"],
        deliverables:["需求方案","落地计划"],
        done_criteria:["需求已经人工确认","明确验收计划"],
        tools:["文档解析"],require_plan_review:true},
    })
    const connectedMarket = await api("POST","/api/market/connect",{
      name:"browser_docs",title:"浏览器检索插件",
      url:"http://127.0.0.1:"+modelPort+"/mcp",headers:[],
    })
    assert.equal(connectedMarket.ok,true,"MCP connection did not pass actual tools/list probe")
    assert.equal(connectedMarket.connection.tool_count,2)
    const selectedToolId="mkt__"+connectedMarket.connection.id+"__doc_search"
    const unrelated=await api("POST","/api/agent_specs",{
      name:"另一个不能误改的 Agent",
      spec:{goal:"【独立目标】不要被别的运行修改",task_scope:"仅用于测试历史运行关联",
        deliverables:["独立成果"],tools:[],task_plan:["输出文本"],
        done_criteria:["目标不被其他 Agent 覆盖"]},
    })
    const unselectedToolId="mkt__"+connectedMarket.connection.id+"__doc_write"
    const autoSpec=await api("POST","/api/agent_specs",{
      name:"自动匹配工具 Agent",
      spec:{goal:"联网搜索最新的美股公开信息，产出有引用的摘要",
        task_scope:"只读取公开网页，不发送消息、不修改文件",
        tools:["网络搜索","文档解析"],deliverables:["资料报告"],
        task_plan:["查询网页","整理出处","形成报告"],
        done_criteria:["报告有出处"]},
    })

    const start=async()=>api("POST","/api/agent-runs/start",{
      spec_id:spec.id,instruction:"把知识检索需求整理成规范方案，审核后规划实施",
      model:"review-ui-model",config:{
        max_steps:7,require_plan_review:true,
        tools:{},custom_model:{connection_id:connection.item.id,model_id:"review-ui-model"},
      },
    })
    const run=await start()
    await api("POST","/api/llm/agent-engine/"+run.run_id+"/tick",{})
    assert.equal((await api("GET","/api/agent_runs/"+run.run_id)).status,"awaiting_input")
    frontend=spawn(process.execPath,[vite,"--config","vibex-local/vite.local.config.ts",
      "--host","127.0.0.1","--port",String(vitePort),"--strictPort"],
      {cwd:root,windowsHide:true,stdio:["ignore","pipe","pipe"],
        env:{...process.env,AGENT_STUDIO_PB_ORIGIN:apiOrigin,
          VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED:"false",
        }})
    frontend.stdout.on("data",chunk=>{viteLogs=(viteLogs+chunk).slice(-5000)})
    frontend.stderr.on("data",chunk=>{viteLogs=(viteLogs+chunk).slice(-5000)})
    await ready(webOrigin+"/login",frontend,()=>viteLogs)
    chrome=await launchChrome(chromeDir)
    const cmd=(name,params)=>chrome.client.command(name,params,chrome.sessionId)
    const evaluate=async expression=>{
      const out=await cmd("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})
      if(out.exceptionDetails)throw new Error("Browser evaluation: "+String(out.exceptionDetails.exception?.description||out.exceptionDetails.text).slice(0,380))
      return out.result?.value
    }
    const wait=async(expression,label)=>{
      let last=""
      for(let i=0;i<180;i++){
        try{if(await evaluate(expression))return}catch(error){last=String(error.message).slice(0,100)}
        await sleep(160)
      }
      const page=await evaluate(`({
        path:location.pathname,ready:document.readyState,
        main:!!document.querySelector('main,[data-studio-fluid-page]'),
        title:document.title,
        body:String(document.body?.innerText||"").slice(0,230),
        errorOverlay:!!document.querySelector('vite-error-overlay')
      })`).catch(()=>({error:"document-unreadable"}))
      console.error("CHROME_UI_SAFE_PAGE_STATE",JSON.stringify({label,page,viteLog:viteLogs.slice(-520)}))
      throw new Error("Chrome UI did not show "+label+". "+last+
        " state="+JSON.stringify(page).slice(0,370))
    }
    const clickText=async text=>{
      const done=await evaluate(`(() => {const b=[...document.querySelectorAll("button")].find(x=>x.textContent?.includes(${JSON.stringify(text)}));if(!b||b.disabled)return false;b.click();return true})()`)
      assert.ok(done,"Missing enabled browser button: "+text)
    }
    await cmd("Page.navigate",{url:webOrigin+"/login?next=%2Fagent-run"})
    try {
      await wait('document.querySelector("input[type=email]")!==null',"login page")
    } catch(error) {
      // Cold Vite/Chromium startup can leave a blank HTML shell without a JS
      // root; explicitly retry navigation once, logging a real failure if persistent.
      console.log("CHROME_LOGIN_COLD_START_RETRY",String(error.message).slice(0,220))
      await cmd("Page.navigate",{url:webOrigin+"/login?next=%2Fagent-run"})
      await wait('document.querySelector("input[type=email]")!==null',"login page after retry")
    }
    await evaluate('document.querySelector("input[type=email]").focus()')
    await cmd("Input.insertText",{text:email})
    await evaluate('document.querySelector("input[type=password]").focus()')
    await cmd("Input.insertText",{text:password})
    await wait('document.querySelector("button[type=submit]")?.disabled===false',"login submit")
    await evaluate('document.querySelector("button[type=submit]").click()')
    await wait('location.pathname==="/agent-run"',"logged-in run center")
    if(process.env.AGENT_STUDIO_UX_PROVENANCE_ONLY==="1"){
      await cmd("Emulation.setDeviceMetricsOverride",{
        width:1440,height:900,deviceScaleFactor:1,mobile:false,
      })
      const source=await api("POST","/api/agent-runs/start",{
        spec_id:spec.id,instruction:"V19_PROVENANCE_SOURCE",
        config:{custom_model:{connection_id:connection.item.id,model_id:"review-ui-model"}},
      })
      const db=new DatabaseSync(path.join(testDir,"data.db"),{timeout:5000})
      try{db.prepare("UPDATE agent_runs SET status='succeeded',result=? WHERE id=?")
        .run("V19 原版输出",source.run_id)}
      finally{db.close()}
      await api("POST","/api/agent-runs/"+source.run_id+"/feedback",{
        rating:"down",tags:["风险缺失"],comment:"请补充责任人和里程碑",
      })
      const original=await api("GET","/api/agent_specs/"+spec.id)
      const edited=await api("PATCH","/api/agent_specs/"+spec.id,{
        expected_updated:original.updated,
        optimization_context:{source_run_id:source.run_id},
        spec:{...original.spec,goal:"V19 反馈明确驱动的目标修改",
          done_criteria:["带出处的需求","明确责任人与里程碑"]},
      })
      assert.match(edited.optimization_lineage_id,/^[A-Za-z0-9]{15}$/)
      const auditId=edited.optimization_lineage_id
      // Reopening the page discards in-memory React state. A real employee
      // must be able to select the EXACT saved, server-verified audit again.
      await cmd("Page.navigate",{url:webOrigin+"/agent-run?spec="+spec.id})
      await wait('[...document.querySelectorAll("section")].some(s=>s.getAttribute("aria-label")==="恢复已保存的反馈优化试跑"&&s.textContent?.includes("当前 Agent 有已确认的反馈改进版本"))',
        "reopen Agent and recover the accepted optimization from the server")
      assert.equal(await evaluate('document.body.innerText.includes("下一次运行将记录这条优化关联")'),false,
        "Recovery must not silently enroll a new run without explicit opt-in")
      await clickText("将下一次试跑关联到此版本")
      await wait('document.body.innerText.includes("下一次运行将记录这条优化关联")',
        "employee opts in to audited retest")
      await clickText("不关联本次运行")
      await wait('document.body.innerText.includes("将下一次试跑关联到此版本")',
        "employee can undo the provenance attachment")
      await clickText("将下一次试跑关联到此版本")
      await evaluate('document.querySelector("#agent-task-instruction").focus()')
      await cmd("Input.insertText",{text:"V19_PROVENANCE_RETEST"})
      await wait('[...document.querySelectorAll("button")].some(b=>b.textContent?.trim()==="运行"&&!b.disabled)',
        "retest model and run launcher are ready after refresh")
      assert.ok(await evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="运行"&&!x.disabled);if(!b)return false;b.click();return true})()'))
      await wait('new URLSearchParams(location.search).has("run")',
        "explicitly approved retest starts from desktop UI")
      const again={run_id:await evaluate('new URLSearchParams(location.search).get("run")')}
      const connectedRun=await api("GET","/api/agent_runs/"+again.run_id)
      assert.equal(connectedRun.config.optimization_lineage_id,auditId,
        "New run must retain the accepted server revision after a reload")
      const secondDb=new DatabaseSync(path.join(testDir,"data.db"),{timeout:5000})
      try{secondDb.prepare("UPDATE agent_runs SET status='succeeded',result=? WHERE id=?")
        .run("V19 改进版输出",again.run_id)}
      finally{secondDb.close()}
      await cmd("Page.navigate",{url:webOrigin+"/agent-run?spec="+spec.id+"&run="+again.run_id})
      await wait('document.body.innerText.includes("V19 改进版输出")',
        "retest saved in backend")
      await wait('document.querySelector("#run-version-compare")?.textContent?.includes("已核验：这次新方案由所选基准运行的用户反馈触发")',
        "audited link is shown for the exact feedback source")
      await wait('document.querySelector("#run-version-compare")?.textContent?.includes('+JSON.stringify(auditId)+')',
        "accepted audit ID visible to employee")
      assert.equal(await evaluate('document.querySelector("#run-version-compare")?.textContent?.includes("完成标准")'),true)
      const audit=await api("GET","/api/agent-specs/"+spec.id+"/optimization-lineage")
      assert.equal(audit.items[0].source_run_id,source.run_id)
      await api("POST","/api/agent-runs/"+source.run_id+"/feedback",{
        rating:"up",comment:"后来又修改过反馈",
      })
      await cmd("Page.reload",{ignoreCache:true})
      await wait('document.querySelector("#run-version-compare")?.textContent?.includes("原反馈后来发生变化")',
        "altered feedback must be clearly labelled instead of falsely verified")
      console.log("CHROME_V19_OPTIMIZATION_AUDIT_PASS",JSON.stringify({
        sourceRunId:source.run_id,retestId:again.run_id,auditId,
        acceptedRevisionId:audit.items[0].accepted_revision_id,
        changedKeys:audit.items[0].changed_keys,
        subsequentFeedbackEditDetected:true,
      }))
      return
    }
    if(process.env.AGENT_STUDIO_UX_HISTORY_ONLY==="1"){
      await cmd("Emulation.setDeviceMetricsOverride",{
        width:1440,height:900,deviceScaleFactor:1,mobile:false,
      })
      const latest=await api("POST","/api/agent-runs/start",{
        spec_id:spec.id,instruction:"V19_RUN_HISTORY_TEST",
      })
      const latestId=latest.run_id
      const ownerId=(await api("GET","/api/agent_specs/"+spec.id)).rh_user_id
      assert.match(latestId,/^[A-Za-z0-9]{15}$/)
      const seeded=new DatabaseSync(path.join(testDir,"data.db"),{timeout:5000})
      try{
        seeded.prepare("UPDATE agent_runs SET status='succeeded',result=? WHERE id=?")
          .run("V19 比较主任务结果",latestId)
        seeded.exec("BEGIN")
        const add=seeded.prepare(
          "INSERT INTO agent_runs(id,rh_user_id,spec_id,spec_name,instruction,status,spec_snapshot,result,created,updated) "+
          "VALUES(?,?,?,?,?,?,?,?,?,?)"
        )
        for(let i=0;i<170;i++){
          const id="z"+String(i).padStart(14,"0")
          const date="2025-01-01 "+String(Math.floor(i/3600)).padStart(2,"0")+":"+
            String(Math.floor(i/60)%60).padStart(2,"0")+":"+
            String(i%60).padStart(2,"0")+".000Z"
          add.run(id,ownerId,spec.id,spec.name,"V19 Private Older Instruction",
            "succeeded",JSON.stringify(spec.spec),
            "历史结果 "+i,date,date)
        }
        seeded.exec("COMMIT")
      }catch(err){try{seeded.exec("ROLLBACK")}catch{}throw err}
      finally{seeded.close()}
      await cmd("Page.navigate",{url:webOrigin+"/agent-run?spec="+spec.id+"&run="+latestId})
      await wait('document.body.innerText.includes("V19 比较主任务结果")',
        "completed run from desktop deep link")
      await wait('document.querySelector("#run-version-compare")?.textContent?.includes("已加载 25 / 172 条")',
        "first owner-scoped history page")
      for(let page=2;page<=7;page++){
        await clickText("加载更早运行")
        const loaded=Math.min(page*25,172)
        await wait('document.querySelector("#run-version-compare")?.textContent?.includes('+
          JSON.stringify("已加载 "+loaded+" / 172 条")+')',
          "loaded history page "+page)
      }
      assert.equal(await evaluate('[...document.querySelectorAll("#compare-run-select option")].length'),171)
      const exactId="z"+String(0).padStart(14,"0")
      await evaluate('document.querySelector("[aria-label=\\"输入要比较的历史运行 ID\\"]").focus()')
      await cmd("Input.insertText",{text:exactId})
      await wait('document.querySelector("[aria-label=\\"输入要比较的历史运行 ID\\"]")?.value==='+JSON.stringify(exactId),
        "exact old run specified")
      await clickText("读取并比较")
      await wait('document.querySelector("#run-version-compare")?.textContent?.includes("查看基准运行与证据")',
        "comparison completed for direct old Run ID")
      const exact=await api("GET","/api/agent_runs/"+exactId)
      assert.equal(exact.spec_id,spec.id)
      assert.equal(await evaluate('document.querySelector("#compare-run-select")?.value'),exactId)
      const presentation=await evaluate('document.querySelector("#run-version-compare")?.innerText||""')
      assert.ok(presentation.includes("不能由此判断修改来自当前基准运行的反馈"),
        "History changes without explicit lineage must not claim feedback causality")
      console.log("CHROME_V19_PAGED_RUN_HISTORY_AND_EXACT_ID_PASS",JSON.stringify({
        total:172,pages:7,pagedOptions:171,exactOldRunId:exactId,
        noInventedProvenance:true,
      }))
      return
    }
    if(process.env.AGENT_STUDIO_UX_CATALOG_ONLY==="1"){
      await cmd("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false})
      const created=[]
      for(let i=0;i<108;i++){
        const tag=i===101||i===107?"V18-GAMMA-SEARCH":"普通业务需求"
        const row=await api("POST","/api/agent_specs",{
          name:"V18 Agent "+String(i).padStart(3,"0"),
          source:i%2===0?"template":"create",
          spec:{goal:tag+" 需求方案",task_scope:"内部研究",
            tools:["calculate"],deliverables:["报告"],task_plan:["提取","验证"],
            done_criteria:["标注来源"]},
        })
        created.push(row)
      }
      const createdRunIds=[]
      for(let i=0;i<26;i++){
        const made=await api("POST","/api/agent-runs/start",{
          spec_id:spec.id,instruction:"V18_PENDING_FIXTURE_"+i,
        })
        createdRunIds.push(made.run_id)
      }
      const fixture=new DatabaseSync(path.join(testDir,"data.db"),{timeout:5000})
      try{
        const stmt=fixture.prepare("UPDATE agent_runs SET status=? WHERE id=?")
        for(let i=0;i<createdRunIds.length;i++)
          stmt.run(i%2===0?"awaiting_input":"awaiting_approval",createdRunIds[i])
      }finally{fixture.close()}
      await cmd("Page.navigate",{url:webOrigin+"/"})
      await wait('[...document.querySelectorAll("section")].some(e=>e.getAttribute("aria-label")==="我的 Agent 搜索、筛选与收藏")',
        "V18 server-paged Agent catalog ready")
      await wait('document.body.innerText.includes("共 111 个")',
        "Agent total count is real and not capped at page size")
      console.log("V18_CATALOG_DOM_DIAG",JSON.stringify(await evaluate(`({
        agentItemLinks:[...document.querySelectorAll("a")].filter(a=>a.getAttribute("aria-label")?.includes("试跑")).map(a=>a.getAttribute("aria-label")).slice(0,5),
        catalogRows:[...document.querySelectorAll("section")].find(x=>x.getAttribute("aria-label")==="我的 Agent 搜索、筛选与收藏")?.querySelectorAll("li").length||0,
        alerts:[...document.querySelectorAll("[role=alert]")].map(x=>x.textContent?.slice(0,100))
      })`)))
      await wait('[...document.querySelectorAll("a")].filter(a=>a.getAttribute("aria-label")?.startsWith("试跑 Agent：")).length===18',
        "server Agent page actually rendered 18 cards")
      const page1=await evaluate('({ids:[...document.querySelectorAll("a")].filter(a=>a.getAttribute("aria-label")?.startsWith("试跑 Agent：")).map(a=>a.getAttribute("href"))})')
      assert.equal(page1.ids.length,18,"Only one server-page of Agent cards should mount")
      await evaluate('[...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")==="Agent 下一页")?.click()')
      await wait('document.body.innerText.includes("第 2/7 页")',"Agent next page")
      const page2=await evaluate('({ids:[...document.querySelectorAll("a")].filter(a=>a.getAttribute("aria-label")?.startsWith("试跑 Agent：")).map(a=>a.getAttribute("href"))})')
      assert.equal(page2.ids.length,18)
      assert.ok(!page2.ids.some(x=>page1.ids.includes(x)),"Two Agent pages may not duplicate cards")
      const searchText="V18-GAMMA-SEARCH"
      await evaluate('[...document.querySelectorAll("input")].find(b=>b.getAttribute("aria-label")==="搜索 Agent 名称和方案内容")?.focus()')
      await cmd("Input.insertText",{text:searchText})
      await wait('document.body.innerText.includes("共 2 个")',
        "Database-backed search includes AgentSpec goal, not just names")
      const chooseFavorite=created[107]
      const favBtn=await evaluate('(()=>{const card=[...document.querySelectorAll("li")].find(el=>el.textContent?.includes("V18 Agent 107"));const b=[...(card?.querySelectorAll("button")||[])].find(x=>x.getAttribute("aria-label")?.startsWith("收藏："));if(!b)return false;b.click();return true})()')
      assert.ok(favBtn,"Server-search result should have a star action")
      await wait('[...document.querySelectorAll("button")].some(b=>b.getAttribute("aria-label")==="取消收藏：V18 Agent 107")',
        "favorite state persisted in loaded catalog")
      const favFromServer=await api("GET","/api/agent_specs/favorites")
      assert.ok(favFromServer.ids.includes(chooseFavorite.id))
      await cmd("Page.reload",{ignoreCache:true})
      await wait('[...document.querySelectorAll("section")].some(e=>e.getAttribute("aria-label")==="我的 Agent 搜索、筛选与收藏")',
        "catalog reload")
      await clickText("仅看收藏")
      await wait('document.body.innerText.includes("共 1 个")',
        "owner's favorite survives page reload")
      assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.getAttribute("aria-label")==="取消收藏：V18 Agent 107")'),true)
      await clickText("仅看收藏")

      // User removes the only favorite on the last results page.
      // The catalog should automatically return to the new valid last page.
      for(let i=0;i<18;i++)await api("POST","/api/agent_specs/"+created[i].id+"/favorite",{favorite:true})
      await clickText("仅看收藏")
      await wait('document.body.innerText.includes("共 19 个") && document.body.innerText.includes("第 1/2 页")',
        "favorite-only result has two server pages")
      await evaluate('[...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")==="Agent 下一页")?.click()')
      await wait('document.body.innerText.includes("第 2/2 页")',
        "one favorite on the last page")
      const lastStar=await evaluate('(()=>{const section=[...document.querySelectorAll("section")].find(x=>x.getAttribute("aria-label")==="我的 Agent 搜索、筛选与收藏");const star=[...section.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")?.startsWith("取消收藏："));if(!star)return "";star.click();return star.getAttribute("aria-label")})()')
      assert.ok(lastStar,"last-page starred Agent should remain actionable")
      await wait('document.body.innerText.includes("共 18 个") && document.body.innerText.includes("第 1/1 页")',
        "unfavoriting last item returns user to the valid previous page")
      assert.equal((await api("GET","/api/agent_specs/favorites")).ids.length,18)
      await clickText("仅看收藏")
      await wait('document.body.innerText.includes("共 111 个")',"all Agents after clearing favorite-only filter")
      const pendingServer=await api("GET","/api/agent-runs/pending?page=1&perPage=10")
      assert.equal(pendingServer.totalItems,27,"Original pending user run plus 26 additional pending")
      await wait('document.body.innerText.includes("共 27 项待处理")',
        "home count includes pending not limited to recent 12")
      await clickText("查看全部待办")
      await wait('document.querySelector("#all-pending-tasks")!==null',
        "expand full pending inbox with server pagination")
      await wait('document.querySelector("#all-pending-tasks")?.textContent?.includes("第 1/3 页")',
        "first pending page total is from server")
      const firstPending=await evaluate('[...document.querySelectorAll("#all-pending-tasks li a")].map(a=>a.href)')
      assert.equal(firstPending.length,10)
      await evaluate('[...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")==="待办下一页")?.click()')
      await wait('document.querySelector("#all-pending-tasks")?.textContent?.includes("第 2/3 页")',
        "second pending page rendered")
      const secondPending=await evaluate('[...document.querySelectorAll("#all-pending-tasks li a")].map(a=>a.href)')
      assert.equal(secondPending.length,10)
      assert.ok(secondPending.every(uri=>!firstPending.includes(uri)))
      const selectChanged=await evaluate('(()=>{const el=[...document.querySelectorAll("select")].find(e=>e.getAttribute("aria-label")==="待办类型筛选");if(!el)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(el,"awaiting_approval");el.dispatchEvent(new Event("change",{bubbles:true}));return true})()')
      assert.ok(selectChanged)
      await wait('document.querySelector("#all-pending-tasks")?.textContent?.includes("共 13 项")',
        "server-scoped pending approval-only filter")

      // Pending actions disappear when handled elsewhere. If that shrinks the
      // server total while the user is on the final page, auto-refresh and
      // clamp rather than showing an apparently empty queue.
      await evaluate('[...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")==="待办下一页")?.click()')
      await wait('document.querySelector("#all-pending-tasks")?.textContent?.includes("第 2/2 页")',
        "approval inbox last page before task handling")
      const processed=await evaluate('([...document.querySelectorAll("#all-pending-tasks li a")].map(a=>new URL(a.href).searchParams.get("run")))')
      assert.equal(processed.length,3)
      const cleanupDb=new DatabaseSync(path.join(testDir,"data.db"),{timeout:5000})
      try{
        const change=cleanupDb.prepare("UPDATE agent_runs SET status='running' WHERE id=?")
        for(const id of processed)change.run(id)
      }finally{cleanupDb.close()}
      await sleep(1350)
      await evaluate('window.dispatchEvent(new Event("focus"))')
      await wait('document.querySelector("#all-pending-tasks")?.textContent?.includes("共 10 项") && document.querySelectorAll("#all-pending-tasks li").length===10 && ![...document.querySelectorAll("button")].some(b=>b.getAttribute("aria-label")==="待办下一页")',
        "focus refreshes processed tasks and removes unnecessary one-page pagination")
      await evaluate('[...document.querySelectorAll("input")].find(b=>b.getAttribute("aria-label")==="按 Agent 名称搜索待办")?.focus()')
      await cmd("Input.insertText",{text:"不存在的 Agent"})
      await wait('document.querySelector("#all-pending-tasks")?.textContent?.includes("当前筛选下没有待办")',
        "search empty state is not an unfiltered false count")
      console.log("CHROME_V18_CATALOG_INBOX_JOURNEY_PASS",JSON.stringify({
        agentCount:111,searchResults:2,favoritePersisted:true,
        agentCardsPerPage:18,independentPendingTotal:27,
        inboxPages:3,pendingApprovals:13,tenantScoped:true,
        lastFavoritePageClamped:true,lastPendingPageClamped:true,focusRefreshAfterApproval:true,
      }))
      return
    }
    if(process.env.AGENT_STUDIO_UX_CONNECT_UI_ONLY==="1"){
      await cmd("Emulation.setDeviceMetricsOverride",{
        width:1440,height:900,deviceScaleFactor:1,mobile:false,
      })
      await cmd("Page.navigate",{url:webOrigin+"/plugin-market"})
      await wait('document.body.innerText.includes("高级：连接自建 / 企业内部 MCP")',
        "plugin marketplace custom MCP entry")
      await clickText("高级：连接自建 / 企业内部 MCP")
      await wait('[...document.querySelectorAll("input")].some(x=>x.placeholder?.includes("内部文档检索"))',
        "custom MCP connector details")
      const customName="V17 自建测试 MCP"
      await evaluate('[...document.querySelectorAll("input")].find(x=>x.placeholder?.includes("内部文档检索"))?.focus()')
      await cmd("Input.insertText",{text:customName})
      await evaluate('[...document.querySelectorAll("input[type=url]")].find(x=>x.placeholder?.includes("mcp.example.com"))?.focus()')
      await cmd("Input.insertText",{text:"http://127.0.0.1:"+modelPort+"/mcp-ui"})
      await wait('document.body.innerText.includes("验证并连接")',
        "custom MCP connection CTA")
      await clickText("验证并连接")
      await wait('[...document.querySelectorAll("input[type=url]")].some(x=>x.placeholder?.includes("mcp.example.com")&&x.value==="")',
        "UI finished saving and cleared custom MCP endpoint form")
      const connData=await api("GET","/api/market/connections")
      await wait('document.body.innerText.includes("真实发现 2 个 MCP 工具")',
        "UI explains connection success and that each Agent needs explicit tool selection")
      const browserConnected=connData.items.find(row=>row.title===customName)
      assert.ok(browserConnected,"Browser-connected MCP must exist on server")
      assert.equal(browserConnected.enabled,true)
      assert.equal(browserConnected.last_probe_status,"ok")
      assert.equal(browserConnected.tool_count,2)
      assert.ok(browserConnected.tools.some(t=>t.name==="doc_search"))
      assert.ok(browserConnected.tools.some(t=>t.name==="doc_write"))
      await cmd("Page.navigate",{url:webOrigin+"/agent-create?spec="+autoSpec.id+"&step=3"})
      await wait('document.body.innerText.includes("已验证的市场插件工具")',
        "MCP can be picked in the newly created Agent resources")
      await wait('document.body.innerText.includes('+JSON.stringify(customName)+')',
        "newly connected MCP appears in Agent tool selection")
      const uiMcpId="mkt__"+browserConnected.id+"__doc_search"
      const selected=await evaluate("(()=>{const button=[...document.querySelectorAll('[role=checkbox]')].find(el=>el.textContent?.includes("+JSON.stringify(customName)+")&&el.textContent?.includes('doc_search'));if(!button)return false;button.click();return true})()")
      assert.equal(selected,true)
      await wait('[...document.querySelectorAll("[role=checkbox]")].some(el=>el.textContent?.includes('+JSON.stringify(customName)+')&&el.textContent?.includes("doc_search")&&el.getAttribute("aria-checked")==="true")',
        "selected plugin must be checked")
      await clickText("保存到我的助手")
      await wait('document.body.innerText.includes("已保存进「我的 Agent」")',
        "Agent tool selector saved new MCP binding")
      const selectedSpec=await api("GET","/api/agent_specs/"+autoSpec.id)
      assert.ok(selectedSpec.spec.tools.includes(uiMcpId))
      assert.ok(!selectedSpec.spec.tools.includes("mkt__"+browserConnected.id+"__doc_write"),
        "Connecting a server cannot silently grant all server tools")
      console.log("CHROME_V17_MARKET_CONNECT_UI_PASS",JSON.stringify({
        connectedFromBrowser:true,discoveredTools:browserConnected.tool_count,
        explicitlyBoundTool:uiMcpId,unsafeToolUnselected:true,
      }))
      return
    }
    if(process.env.AGENT_STUDIO_UX_FULL_CREATION_ONLY==="1"){
      await cmd("Emulation.setDeviceMetricsOverride",{
        width:1440,height:900,deviceScaleFactor:1,mobile:false,
      })
      console.log("V17_STAGE_BEGIN", "knowledge-base-ui")
      // Knowledge base creation and indexing via real employee-facing UI.
      await cmd("Page.navigate",{url:webOrigin+"/knowledge-bases"})
      await wait('document.querySelector("#kb-name")!==null',"V17 knowledge-base creator")
      const kbTitle="V17 需求落地验收资料库"
      await evaluate('document.querySelector("#kb-name").focus()')
      await cmd("Input.insertText",{text:kbTitle})
      await clickText("创建知识库")
      await wait('document.body.innerText.includes("知识库已创建")',"V17 KB saved via UI")
      const existingBases=await api("GET","/api/knowledge-bases")
      const kb=existingBases.items.find(row=>row.name===kbTitle)
      assert.ok(kb?.id,"Employee-created KB not persisted")
      await wait('document.body.innerText.includes("或者直接粘贴一段文本资料")',"KB paste editor")
      const pasteOpened=await evaluate('(()=>{const x=[...document.querySelectorAll("summary")].find(x=>x.textContent?.includes("或者直接粘贴一段文本资料"));if(!x)return false;x.click();return true})()')
      assert.equal(pasteOpened,true)
      await wait('document.querySelector("textarea[aria-label=资料正文]")!==null',"KB paste content")
      await evaluate('document.querySelector("input[aria-label=粘贴文本资料文件名]").focus()')
      await cmd("Input.insertText",{text:"需求管理标准.txt"})
      await evaluate('document.querySelector("textarea[aria-label=资料正文]").focus()')
      await cmd("Input.insertText",{text:"内部需求管理规范：每一份需求方案必须有目标、范围、非目标、优先级、负责人、里程碑、风险、验收标准。先经业务方批准，再进入实施计划阶段。"})
      await clickText("保存并索引")
      await wait('document.body.innerText.includes("需求管理标准.txt")',"KB real source indexed")

      console.log("V17_STAGE_INDEXED",kb.id)
      // Start from a blank wizard: no API pre-created Agent counts as creation.
      await cmd("Page.navigate",{url:webOrigin+"/agent-create"})
      await wait('document.querySelector("#agent-requirement")!==null',"V17 blank creation wizard")
      const requirement="V17_CREATE_JOURNEY：创建需求落地 Agent。当我输入原始需求时，自动检索已授权内部知识库，使用 doc_search MCP 文件模板工具核验需求格式，计算项目规划指标，拆解成标准需求方案；必须由人工确认方案之后才能制定后续落地计划和验收标准。禁止外部写入和发布。"
      await evaluate('document.querySelector("#agent-requirement").focus()')
      await cmd("Input.insertText",{text:requirement})
      await wait('document.querySelector("#agent-requirement")?.value.includes("V17_CREATE_JOURNEY")',
        "real user requirement typed")
      await clickText("生成 Agent 方案")
      await wait('document.body.innerText.includes("已生成可编辑方案")',
        "actual /api/llm/chat auto-generated AgentSpec")
      assert.ok(v17PlanCalls>=1,"Generate button failed to invoke isolated model backend")
      await clickText("进入方案编辑")
      await wait('new URLSearchParams(location.search).get("step")==="2"',
        "review generated structured plan")
      await wait('document.querySelector("input[aria-label=助手名称]")?.value.includes("需求落地全链路Agent")',
        "correct generated Agent name")
      assert.equal(await evaluate('document.querySelector("#spec-editor")?.textContent?.includes("知识库检索")'),true)
      assert.equal(await evaluate('document.querySelector("#spec-editor input[type=checkbox]")!==null'),true)

      // User explicitly grants exact MCP tool; none of the other MCP tools is
      // authorized automatically. The tool identifier must be executable.
      const chooseMcp=await evaluate("(()=>{const row=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('明确选择此工具'));if(!row)return false;row.click();return true})()")
      if(!chooseMcp){
        // Backends that expose explicit readOnly metadata may already select it.
        assert.equal(await evaluate('document.body.innerText.includes("doc_search")'),true)
      }
      await wait('[...document.querySelectorAll("button")].some(b=>b.textContent?.includes("保存到我的助手"))',
        "wizard save available")
      console.log("V17_STAGE_GENERATED",v17PlanCalls)
      await clickText("保存到我的助手")
      await wait('document.body.innerText.includes("已保存进「我的 Agent」")',
        "saved first Agent version via UI")
      let ownerSpecs=await api("GET","/api/agent_specs?perPage=100")
      const created=ownerSpecs.items.find(row=>row.name==="需求落地全链路Agent")
      assert.ok(created?.id,"Created Agent did not reach server")
      assert.equal(created.spec.require_plan_review,true)
      assert.ok(created.spec.tools.includes("knowledge_search"))
      assert.ok(created.spec.tools.includes("calculate"))
      assert.ok(created.spec.tools.includes(selectedToolId),
        "Chosen actual MCP tool must be saved with full connection-qualified ID")
      assert.ok(!created.spec.tools.includes("doc_search"),"Generic tool alias must be replaced by executable MCP ID")
      assert.ok(!created.spec.tools.includes("mkt__"+connectedMarket.connection.id+"__doc_write"))
      console.log("V17_STAGE_PLAN_SAVED",created.id,JSON.stringify(created.spec.tools))
      await clickText("下一步：连接资源")
      await wait('new URLSearchParams(location.search).get("step")==="3"',
        "resource-check stage")
      await wait('document.body.innerText.includes("关联知识库")',"resource-binding UI")
      await wait('[...document.querySelectorAll("label")].some(l=>l.textContent?.includes('+JSON.stringify(kbTitle)+')&&l.querySelector("input[type=checkbox]"))',
        "freshly created employee KB appears in Agent resource picker")
      const selectedKB=await evaluate("(()=>{const l=[...document.querySelectorAll('label')].find(x=>x.textContent?.includes("+JSON.stringify(kbTitle)+")&&x.querySelector('input[type=checkbox]'));if(!l)return false;l.querySelector('input').click();return true})()")
      assert.equal(selectedKB,true,"Cannot attach employee KB from wizard")
      await clickText("保存到我的助手")
      await wait('document.body.innerText.includes("已保存进「我的 Agent」")',"resource binding saved")
      const bound=await api("GET","/api/agent_specs/"+created.id)
      assert.ok(bound.spec.knowledge_base_ids.includes(kb.id))
      assert.ok(bound.spec.tools.includes(selectedToolId))
      console.log("V17_RESOURCE_BLOCKERS",JSON.stringify({
        serverSpecTools:bound.spec.tools,
        serverKbIds:bound.spec.knowledge_base_ids,
        page:await evaluate(`({
          notices:[...document.querySelectorAll('aside[aria-label="创建检查"] p')].map(p=>p.textContent?.trim()).filter(Boolean),
          buttons:[...document.querySelectorAll('button')].filter(b=>b.textContent?.includes('下一步：试跑验证')).map(b=>({disabled:b.disabled,text:b.textContent?.trim()})),
          text:document.querySelector('main')?.innerText?.slice(-1200)
        })`),
      }))
      await wait('[...document.querySelectorAll("button")].some(b=>b.textContent?.includes("下一步：试跑验证")&&!b.disabled)',
        "all required model/tools/knowledge resources checked")
      await clickText("下一步：试跑验证")
      await wait('new URLSearchParams(location.search).get("step")==="4"',
        "trial stage")
      await wait('[...document.querySelectorAll("a")].some(x=>x.textContent?.includes("前往试跑当前 Agent"))',
        "step four renders enabled direct launch after route transition")
      const launch=await evaluate('(()=>{const a=[...document.querySelectorAll("a")].find(x=>x.textContent?.includes("前往试跑当前 Agent"));if(!a)return false;a.click();return true})()')
      assert.ok(launch)
      await wait('location.pathname==="/agent-run" && document.querySelector("#spec-select")?.value==='+JSON.stringify(created.id),
        "exact newly created Agent selected for trial")
      const trialInstruction="V17_RUN_JOURNEY：请从关联知识库提取需求标准，计算 (4+6)*3，调用已授权 doc_search MCP 插件工具核对模板；先输出结构化需求草案待我批准，再交付阶段实施计划和验收清单。"
      await evaluate('document.querySelector("#agent-task-instruction").focus()')
      await cmd("Input.insertText",{text:trialInstruction})
      await wait('[...document.querySelectorAll("button")].some(b=>b.textContent?.trim()==="运行"&&!b.disabled)',
        "trial model ready and run button enabled")
      assert.ok(await evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="运行"&&!x.disabled);if(!b)return false;b.click();return true})()'))
      await wait('new URLSearchParams(location.search).has("run")',"real Agent run started")
      const firstRunId=await evaluate('new URLSearchParams(location.search).get("run")')
      assert.ok(firstRunId)
      try {
        await wait('document.body.innerText.includes("批准并继续执行")',
          "market plugin actual HTTP call requires manual approval")
      } catch (error) {
        const diagnostic=await api("GET","/api/agent-runs/"+firstRunId+"/detail")
        console.log("V17_TOOL_APPROVAL_DIAGNOSTIC",JSON.stringify({
          runStatus:diagnostic.run?.status,
          config:diagnostic.run?.config,
          steps:diagnostic.run?.checkpoint?.steps,
          events:(diagnostic.events||[]).map(ev=>({
            type:ev.event_type,content:ev.content?.message||ev.content?.tool||ev.content?.output||"",
          })),
          modelCalls:v17ModelToolCalls,mcpCalls:v17McpCalls,
        }).slice(0,7600))
        throw error
      }
      assert.equal(v17McpCalls,0,"MCP HTTP call must not fire before approval")
      const beforeApproval=await api("GET","/api/agent_runs/"+firstRunId)
      assert.equal(beforeApproval.status,"awaiting_approval")
      assert.equal(beforeApproval.checkpoint.pending_approval.tool,selectedToolId)
      await clickText("批准并继续执行")
      try{
        await wait('document.body.innerText.includes("需求方案等待你的批准")',
          "Agent requested actual phase review after verified tools")
      }catch(error){
        const detail=await api("GET","/api/agent-runs/"+firstRunId+"/detail")
        console.log("V19_POST_TOOL_APPROVAL_DIAGNOSTIC",JSON.stringify({
          status:detail.run?.status,error:detail.run?.error,
          pendingInput:detail.run?.checkpoint?.pending_input,
          pendingApproval:detail.run?.checkpoint?.pending_approval,
          doneSteps:detail.run?.checkpoint?.done_steps,
          events:(detail.events||[]).map(e=>({type:e.event_type,
            text:JSON.stringify(e.content).slice(0,180)})).slice(-18),
          v17ModelToolCalls,v17McpCalls,v17ApprovalQuestions,
        }).slice(0,8100))
        throw error
      }
      assert.equal(v17McpCalls,1,"MCP tools/call must be executed after approval")
      await clickText("批准方案并继续")
      await wait('document.body.innerText.includes("需求落地正式方案")',
        "full needs->tools->human review->final plan")
      const complete=await api("GET","/api/agent-runs/"+firstRunId+"/detail")
      assert.equal(complete.run.status,"succeeded")
      const events=complete.events||[]
      const actualObservations=events.filter(e=>e.event_type==="tool_result")
      for(const name of ["knowledge_search","calculate",selectedToolId])
        assert.ok(actualObservations.some(e=>JSON.stringify(e.content).includes(name)),
          "Missing persisted actual tool observation: "+name)
      assert.ok(events.some(e=>e.event_type==="approval"))
      assert.ok(events.some(e=>e.event_type==="input_received"))
      assert.match(complete.run.result,/负责人：产品/)
      assert.ok(v17ModelToolCalls>=5 && v17ApprovalQuestions>=1)
      const firstSnapshot=await api("GET","/api/agent_runs/"+firstRunId)
      assert.equal(firstSnapshot.spec_snapshot.goal,bound.spec.goal,
        "Original run must carry immutable approved AgentSpec snapshot")
      console.log("V17_REAL_TOOLS_AND_HUMAN_REVIEW_PASS",JSON.stringify({
        runId:firstRunId,toolResults:actualObservations.length,
        pluginInvokedAfterApproval:v17McpCalls,awaitedHumanReview:v17ApprovalQuestions,
      }))

      // Quality loop with a real scoring and feedback persisted to this run.
      await clickText("生成评估")
      await wait('document.body.innerText.includes("总分")',"completed run evaluated")
      await clickText("结果不理想")
      await evaluate('document.querySelector("textarea[placeholder^=\\"补充一句话\\"]").focus()')
      await cmd("Input.insertText",{text:"需要明确里程碑日期，知识库引用应更具体，并补充质量验收负责人"})
      await clickText("提交反馈")
      await wait('document.body.innerText.includes("你反馈了：结果不理想")',"feedback persisted")
      await clickText("根据反馈优化方案")
      await wait('document.body.innerText.includes("确认写回方案")',"generated improvement diff")
      await clickText("确认写回方案")
      await wait('document.body.innerText.includes("方案优化已保存为当前 Agent 的新版本")',
        "user explicitly saved improved Agent")
      const updated=await api("GET","/api/agent_specs/"+created.id)
      assert.notEqual(updated.spec.goal,created.spec.goal,"Feedback optimization never updated goal")
      assert.ok(updated.spec.tools.includes(selectedToolId),"Feedback optimization must preserve real tool permissions")
      assert.deepEqual(updated.spec.knowledge_base_ids,bound.spec.knowledge_base_ids)
      assert.notEqual(firstSnapshot.spec_snapshot.goal,updated.spec.goal,
        "Earlier run snapshots must remain immutable")
      const auditable=await api("GET","/api/agent-specs/"+created.id+"/optimization-lineage")
      const linkedChange=auditable.items.find(item=>item.source_run_id===firstRunId)
      assert.ok(linkedChange?.id,"The accepted feedback must have a specific audit record")
      assert.ok(linkedChange.changed_keys.includes("goal"))
      assert.equal(linkedChange.feedback_unchanged,true)


      // Verify the optimized version is actually used by the next run.
      await clickText("再次试跑改进版")
      await wait('!new URLSearchParams(location.search).has("run") && document.querySelector("#agent-task-instruction")?.value.includes("V17_RUN_JOURNEY")',
        "direct optimization CTA prepares rerun without auto-executing a paid model")
      assert.ok(!await evaluate('document.body.innerText.includes("运行成果")'),
        "Previous run remains in history, not mistaken for the new trial result")
      const secondInstruction="V17_RUN_JOURNEY_RETEST：请按照优化后的方案再次执行需求落地，重复核验模板及人工确认。"
      await evaluate('document.querySelector("#agent-task-instruction").focus()')
      await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"a",code:"KeyA",windowsVirtualKeyCode:65,modifiers:2})
      await cmd("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",windowsVirtualKeyCode:65})
      await cmd("Input.insertText",{text:secondInstruction})
      await wait('[...document.querySelectorAll("button")].some(b=>b.textContent?.trim()==="运行"&&!b.disabled)',
        "optimized run model ready")
      assert.ok(await evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="运行"&&!x.disabled);if(!b)return false;b.click();return true})()'))
      await wait('Boolean(new URLSearchParams(location.search).get("run")) && new URLSearchParams(location.search).get("run")!=='+JSON.stringify(firstRunId),
        "optimized Agent starts a new run")
      const secondRunId=await evaluate('new URLSearchParams(location.search).get("run")')
      const rerun=await api("GET","/api/agent_runs/"+secondRunId)
      assert.equal(rerun.spec_snapshot.goal,updated.spec.goal,
        "Next run must use the actual improved AgentSpec")
      assert.ok(rerun.spec_snapshot.tools.includes(selectedToolId))
      assert.equal(rerun.config.optimization_lineage_id,linkedChange.id,
        "New run must explicitly carry the verified accepted feedback revision")
      // The revised Agent must run TO COMPLETION, not merely create a run.
      await wait('document.body.innerText.includes("批准并继续执行")',
        "optimized run pauses for MCP approval")
      await clickText("批准并继续执行")
      await wait('document.body.innerText.includes("需求方案等待你的批准")',
        "optimized run pauses for business review")
      await clickText("批准方案并继续")
      await wait('document.body.innerText.includes("需求落地正式方案")',
        "optimized run delivers a real final plan")
      const rerunDetail=await api("GET","/api/agent-runs/"+secondRunId+"/detail")
      assert.equal(rerunDetail.run.status,"succeeded")
      const rerunEventTypes=(rerunDetail.events||[]).map(e=>e.event_type)
      assert.ok(rerunEventTypes.includes("approval"))
      assert.ok(rerunEventTypes.includes("input_received"))
      const secondObservations=(rerunDetail.events||[]).filter(e=>e.event_type==="tool_result")
      assert.ok(secondObservations.some(e=>JSON.stringify(e.content).includes(selectedToolId)))
      assert.equal(v17McpCalls,2,"MCP tool must be invoked in both independently approved runs")
      await clickText("生成评估")
      await wait('document.body.innerText.includes("总分")',"rerun result independently evaluated")
      const assessedRerun=await api("GET","/api/agent_runs/"+secondRunId)
      assert.ok(assessedRerun.evaluation && typeof assessedRerun.evaluation.score==="number",
        "Second run evaluation must persist separately from the old run")
      const originalFinal=await api("GET","/api/agent_runs/"+firstRunId)
      assert.equal(originalFinal.spec_snapshot.goal,bound.spec.goal)
      assert.equal(originalFinal.status,"succeeded")
      assert.equal(originalFinal.feedback.rating,"down")
      await wait('document.querySelector("#run-version-compare")?.textContent?.includes("前后运行与方案变更对比")',
        "saved run comparison loaded on optimized rerun")
      await wait('document.querySelector("#run-version-compare")?.textContent?.includes("基准运行的用户反馈")',
        "baseline feedback shown with newer run comparison")
      await wait('document.querySelector("#run-version-compare")?.textContent?.includes("需要明确里程碑日期")',
        "comparison links to actual previous feedback")
      await wait('document.querySelector("#run-version-compare")?.textContent?.includes("已核验：这次新方案由所选基准运行的用户反馈触发")',
        "comparison shows explicit, server-verified feedback to saved-version lineage")
      await wait('document.querySelector("#run-version-compare")?.textContent?.includes('+JSON.stringify(linkedChange.accepted_revision_id)+')',
        "real accepted revision is shown for user audit")

      const beforeCompare=await evaluate('document.querySelector("#run-version-compare")?.textContent||""')
      assert.ok(beforeCompare.includes("工具结果次数"))
      assert.ok(beforeCompare.includes("实际 API 账单"))
      assert.ok(beforeCompare.includes("模型综合评价") || beforeCompare.includes("规则降级评分"))
      await evaluate('document.querySelector("#run-version-compare details summary").click()')
      await wait('document.querySelector("#run-version-compare details")?.open===true',
        "expand verified AgentSpec differences")
      assert.equal(await evaluate('document.querySelector("#run-version-compare details")?.textContent?.includes("核心目标")'),true)
      console.log("CHROME_V18_AGENT_RUN_VERSION_COMPARISON_PASS",JSON.stringify({
        previousFeedbackShown:true,actualSnapshotFields:true,scoreMethodDisclosed:true,
        actualCostNotInvented:true,oldRunId:firstRunId,newRunId:secondRunId,
        feedbackLineageVerified:true,acceptedRevisionId:linkedChange.accepted_revision_id,
      }))

      // Historical detail page must agree with the immutable run snapshot.
      // Editing today's Agent must not rewrite what the older run claims it used.
      await cmd("Page.navigate",{url:webOrigin+"/run-detail?run="+firstRunId})
      await wait('document.body.innerText.includes("方案配置快照")',
        "first run detail includes original execution snapshot card")
      await clickText("方案配置快照")
      await wait('document.body.innerText.includes('+JSON.stringify(bound.spec.goal.slice(0,42))+')',
        "first run detail renders the original goal, not today's edited goal")
      assert.equal(await evaluate('document.body.innerText.includes('+JSON.stringify(updated.spec.goal.slice(0,45))+')'),false,
        "Historic detail cannot show the new Agent goal as if it existed before optimization")
      const oldDetail=await api("GET","/api/agent-runs/"+firstRunId+"/detail")
      assert.equal(oldDetail.spec_snapshot.goal,bound.spec.goal)
      await cmd("Page.navigate",{url:webOrigin+"/run-detail?run="+secondRunId})
      await wait('document.body.innerText.includes("方案配置快照")',
        "second run detail opened")
      await clickText("方案配置快照")
      await wait('document.body.innerText.includes('+JSON.stringify(updated.spec.goal.slice(0,45))+')',
        "second run detail renders the newer Agent goal")
      console.log("CHROME_HISTORICAL_AGENT_SNAPSHOT_IMMUTABILITY_PASS")
      console.log("CHROME_AGENT_V17_COMPLETE_CREATION_JOURNEY_PASS",JSON.stringify({
        createdSpecId:created.id,knowledgeBaseId:kb.id,firstRunId,secondRunId,
        actualToolObservations:actualObservations.length,
        pluginCalls:v17McpCalls,planGenerationModelCalls:v17PlanCalls,
        toolPlannerCalls:v17ModelToolCalls,phaseReview:v17ApprovalQuestions,
        feedbackPersisted:true,optimizationVersionChanged:true,
        rerunUsesOptimizedSnapshot:true,rerunFullyCompleted:true,
        retestFromOptimizationCTA:true,rerunIndependentlyEvaluated:true,
        secondToolObservations:secondObservations.length,secondUserReview:true,
      }))
      return
    }
    if(process.env.AGENT_STUDIO_UX_DESKTOP_ONLY==="1"){
      await cmd("Emulation.setDeviceMetricsOverride",{
        width:1440,height:900,deviceScaleFactor:1,mobile:false,
      })
      await cmd("Page.navigate",{url:webOrigin+"/"})
      await wait('document.body.innerText.includes("需要我继续处理")' +
        ' && document.querySelector("a[aria-label^=\\\"试跑 Agent：\\\"]")!==null',
        "desktop workspace ready with direct run links")
      await wait('document.querySelector("#waiting-runs a[href*=\\"'+run.run_id+'\\"]")!==null',
        "owned waiting Agent shown with actionable link")
      const home=await evaluate("(()=>{const el=document.querySelector('#waiting-runs');const link=[...el.querySelectorAll('a')].find(a=>a.getAttribute('href')?.includes("+JSON.stringify(run.run_id)+"));const actions=[...document.querySelectorAll('a[aria-label]')];return {actionText:link?.textContent?.trim(),href:link?.getAttribute('href'),pendingText:el?.innerText?.slice(0,220),runLink:actions.find(a=>a.getAttribute('href')==="+JSON.stringify("/agent-run?spec="+spec.id)+")?.getAttribute('href'),grid:document.querySelector('#my-specs ul')?.getBoundingClientRect().width}})()")
      assert.match(home.actionText||"",/去回复/)
      assert.ok(home.href.includes(run.run_id))
      assert.ok(home.runLink==="/agent-run?spec="+spec.id)
      assert.ok(home.grid>600,"Saved Agent grid must use desktop width")
      await evaluate("(()=>{const link=[...document.querySelectorAll('#waiting-runs a')].find(a=>a.getAttribute('href')?.includes("+JSON.stringify(run.run_id)+"));link?.click()})()")
      await wait('location.pathname==="/agent-run" && document.querySelector("#agent-input-review")!==null',
        "dashboard action opens exact waiting Agent")
      const initial=await evaluate("(()=>{const cfg=document.querySelector('#spec-select');const model=document.querySelector('#model-select');const tools=document.querySelector('#run-tool-permissions');const advanced=document.querySelector('#run-advanced-settings');const instruction=document.querySelector('#agent-task-instruction');return {modelSelected:model?.value||'',cfgLeft:cfg?.getBoundingClientRect().left,instructionLeft:instruction?.getBoundingClientRect().left,toolsClosed:tools?.open===false,advancedClosed:advanced?.open===false,switchesBeforeExpand:[...document.querySelectorAll('[role=switch]')].filter(x=>x.getClientRects().length>0).length}})()")
      assert.ok(initial.cfgLeft<initial.instructionLeft,"Desktop config and run area should be side by side")
      assert.equal(initial.toolsClosed,true,"Tool toggles should be collapsed by default")
      assert.equal(initial.advancedClosed,true,"Advanced rules should be collapsed by default")
      assert.equal(Boolean(initial.modelSelected),true)
      await evaluate("document.querySelector('#run-tool-permissions summary').click()")
      await wait('document.querySelector("#run-tool-permissions")?.open===true',"permissions expanded")
      assert.equal(await evaluate("document.querySelector('#run-tool-permissions [role=switch]')!==null"),true)
      await evaluate("document.querySelector('#run-advanced-settings summary').click()")
      await wait('document.querySelector("#run-advanced-settings")?.open===true',"advanced expanded")
      assert.equal(await evaluate("document.querySelector('#max-steps')!==null"),true)
      await clickText("批准方案并继续")
      await wait('document.body.innerText.includes("最终实施计划通过")',
        "approved plan reaches formatted final result")
      const completed=await evaluate("(()=>{const result=[...document.querySelectorAll('h2')].find(h=>h.textContent?.includes('运行成果'));const trace=document.querySelector('#run-execution-trace');const quality=document.querySelector('#run-quality-checks');return {resultFirst:!!(result&&trace&&(result.compareDocumentPosition(trace)&Node.DOCUMENT_POSITION_FOLLOWING)),traceClosed:trace?.open===false,qualityClosed:quality?.open===false}})()")
      assert.equal(completed.resultFirst,true,"Finished result must appear before long trace")
      assert.equal(completed.traceClosed,true,"Completed trace should start collapsed")
      assert.equal(completed.qualityClosed,true,"Quality form should not hide results")
      await evaluate("document.querySelector('#run-execution-trace summary').click()")
      await wait('document.querySelector("#run-execution-trace")?.open===true',
        "execution trace can expand")
      await cmd("Page.navigate",{url:webOrigin+"/"})
      await wait('document.body.innerText.includes("其他最近运行")' +
        ' && document.querySelector("a[aria-label^=\\\"试跑 Agent：\\\"]")!==null',
        "homepage after run finished")
      await wait('document.querySelector("#waiting-runs")?.textContent?.includes("没有待回复或待审批")',
        "completed run no longer shown as waiting")
      const quickRun=await evaluate("(()=>{const link=[...document.querySelectorAll('a')].find(a=>a.getAttribute('href')==="+JSON.stringify("/agent-run?spec="+spec.id)+");if(!link)return false;link.click();return true})()")
      assert.equal(quickRun,true,"Saved card should provide direct run")
      await wait('location.pathname==="/agent-run" && new URLSearchParams(location.search).get("spec")==='+JSON.stringify(spec.id),
        "direct run from saved Agent card")
      // Run toggles must be per-run settings, never an implicit write to AgentSpec.
      await wait('document.querySelector("#run-advanced-settings")!==null && document.querySelector("#spec-select")?.value==='+JSON.stringify(spec.id),
        "original Agent selected for the new trial")
      if(!await evaluate("document.querySelector('#run-advanced-settings')?.open===true"))
        await evaluate("document.querySelector('#run-advanced-settings summary').click()")
      await wait('document.querySelector("#run-advanced-settings")?.open===true',
        "run settings expanded before permission test")
      const beforeConfig=await api("GET","/api/agent_specs/"+spec.id)
      const currentApproval=await evaluate("document.querySelector('[aria-label=\"写操作需我确认开关\"]')?.getAttribute('aria-checked')")
      const toggleApproval=await evaluate("(()=>{const button=document.querySelector('[aria-label=\"写操作需我确认开关\"]');if(!button||button.disabled)return false;button.click();return true})()")
      assert.equal(toggleApproval,true)
      await wait('document.querySelector(\'[aria-label="写操作需我确认开关"]\')?.getAttribute("aria-checked")!=='+JSON.stringify(currentApproval),
        "per-trial approval control toggled")
      const afterConfig=await api("GET","/api/agent_specs/"+spec.id)
      assert.deepEqual(afterConfig.spec,beforeConfig.spec,
        "A trial-only permission switch must never silently modify saved AgentSpec")
      assert.equal(afterConfig.updated,beforeConfig.updated,
        "Temporary trial toggles must not create a new saved Agent version")
      const otherSelected=await evaluate("(()=>{const el=document.querySelector('#spec-select');if(!el)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,"+JSON.stringify(unrelated.id)+");el.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
      assert.equal(otherSelected,true)
      await wait('document.querySelector("#spec-select")?.value==='+JSON.stringify(unrelated.id),
        "sidebar Agent selection changed")
      const launched=await evaluate("(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('调整正式 Agent 方案：'));if(!button)return false;button.click();return true})()")
      assert.equal(launched,true,"Selected Agent should provide direct edit action")
      await wait('document.querySelector("[role=dialog] #quick-agent-select")?.value==='+JSON.stringify(unrelated.id),
        "quick editor loads the currently selected Agent rather than URL's stale spec")
      const edited=await api("GET","/api/agent_specs/"+unrelated.id)
      assert.equal(edited.spec.goal,"【独立目标】不要被别的运行修改")
      await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27})
      await wait('document.querySelector("[role=dialog]")===null',"contextual editor closes")
      // Desktop keyboard command starts exactly one run using the current
      // temporary trial settings, without mutating the saved Agent.
      const selectedBefore=await api("GET","/api/agent_specs/"+unrelated.id)
      if(!await evaluate("document.querySelector('#run-advanced-settings')?.open===true"))
        await evaluate("document.querySelector('#run-advanced-settings summary').click()")
      await wait('document.querySelector("#run-advanced-settings")?.open===true',
        "advanced toggles available for this selected Agent")
      const approvalValue=await evaluate("document.querySelector('[aria-label=\"写操作需我确认开关\"]')?.getAttribute('aria-checked')")
      if(approvalValue!=="true")await evaluate("document.querySelector('[aria-label=\"写操作需我确认开关\"]').click()")
      await wait('document.querySelector(\'[aria-label="写操作需我确认开关"]\')?.getAttribute("aria-checked")==="true"',
        "temporary approval enabled")
      await evaluate("document.querySelector('#agent-task-instruction').focus()")
      await cmd("Input.insertText",{text:"用当前配置直接给出一份简短的验收摘要"})
      await wait('document.querySelector("#agent-task-instruction")?.value.includes("验收摘要")',
        "desktop task instruction entered")
      const beforeKeyboardRuns=await api("GET","/api/agent_runs?perPage=80")
      await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,modifiers:2})
      await cmd("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,modifiers:2})
      // Two user interactions may arrive before React disables the button.
      // The in-flight ref must block duplicate paid runs.
      await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,modifiers:2})
      await cmd("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,modifiers:2})
      await wait('new URLSearchParams(location.search).has("run")',
        "Ctrl+Enter creates an owned Agent run")
      const keyboardRunId=await evaluate('new URLSearchParams(location.search).get("run")')
      const keyboardRun=await api("GET","/api/agent_runs/"+keyboardRunId)
      assert.equal(keyboardRun.spec_id,unrelated.id)
      assert.equal(keyboardRun.config.require_approval,true,
        "Run records the trial-only approval setting")
      const afterKeyboardRuns=await api("GET","/api/agent_runs?perPage=80")
      assert.equal(afterKeyboardRuns.items.length,beforeKeyboardRuns.items.length+1,
        "Rapid repeat of desktop shortcut must start exactly one Agent run")
      const selectedAfter=await api("GET","/api/agent_specs/"+unrelated.id)
      assert.deepEqual(selectedAfter.spec,selectedBefore.spec)
      assert.equal(selectedAfter.updated,selectedBefore.updated)
      console.log("CHROME_DESKTOP_AGENT_TASK_JOURNEY_PASS",JSON.stringify({
        home,initial,completed,desktop:true,windowWidth:1440,
        waitingAction:true,advancedOnDemand:true,resultFirst:true,directRun:true,
        runConfigNoImplicitSave:true,contextualSpecEditor:true,
        keyboardRunCreated:true,trialApprovalRecorded:true,duplicateRunGuard:true,
      }))
      return
    }
    if(process.env.AGENT_STUDIO_UX_NAV_ONLY==="1"){
      await cmd("Emulation.setDeviceMetricsOverride",{
        width:390,height:844,deviceScaleFactor:1,mobile:true,
      })
      const routes=[
        "/","/agent-create","/agent-run","/run-detail","/workflow-canvas",
        "/template-market","/internal-templates","/agent-collaboration",
        "/version-release","/integrate","/model-connections","/knowledge-bases",
        "/tool-connections","/plugin-market","/scheduled-tasks","/tool-hub",
        "/manager","/staff","/internal-overview",
      ]
      const report=[]
      for(const route of routes){
        await cmd("Page.navigate",{url:webOrigin+route})
        await wait('location.pathname==='+JSON.stringify(route)+
          ' && Boolean(document.querySelector("main,[data-studio-fluid-page]"))' +
          ' && Boolean(document.querySelector(\'button[aria-label="随时调整 Agent 方案"]\'))',
          "mobile navigation "+route)
        await sleep(130)
        const state=await evaluate("({path:location.pathname,width:innerWidth,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),title:(document.querySelector('main h1,main h2')?.textContent||'').slice(0,80),globalEditor:!!document.querySelector('button[aria-label=\"随时调整 Agent 方案\"]')})")
        report.push(state)
        assert.equal(state.globalEditor,true,route+" missing quick editor")
        assert.ok(state.overflow<=1,route+" overflow: "+state.overflow)
      }
      console.log("CHROME_NAV_ONLY_PASS",JSON.stringify(report))
      return
    }

    if(process.env.AGENT_STUDIO_UX_TEMPLATES_ONLY==="1"){
      await cmd("Page.navigate",{url:webOrigin+"/template-market"})
      await wait('document.querySelector("[data-studio-fluid-page=templates]")!==null && document.body.innerText.includes("发布我的模板")',
        "template market loaded")
      await clickText("发布我的模板")
      await wait('document.querySelector("#tm-publish-spec")!==null',"publish review dialog")
      await wait('[...document.querySelectorAll("#tm-publish-spec option")].some(o=>o.value==='+JSON.stringify(spec.id)+')',
        "saved Agent available in publishing dialog")
      const selectOk=await evaluate("(()=>{const el=document.querySelector('#tm-publish-spec');if(!el)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,"+JSON.stringify(spec.id)+");el.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
      assert.equal(selectOk,true)
      await wait('document.querySelector("[role=dialog]")?.textContent?.includes("发布前核对：这些任务描述将公开")',
        "visible public text preview")
      const publishedName="UX 公开模板审阅与复制验收"
      await evaluate('document.querySelector("#tm-publish-name").focus()')
      await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"a",code:"KeyA",windowsVirtualKeyCode:65,modifiers:2})
      await cmd("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",windowsVirtualKeyCode:65})
      await cmd("Input.insertText",{text:publishedName})
      await evaluate('document.querySelector("#tm-publish-desc").focus()')
      await cmd("Input.insertText",{text:"从需求草案开始进行人工确认，再整理交付计划。"})
      await wait('document.querySelector("#tm-publish-desc")?.value.includes("人工确认")',
        "template publication description")
      assert.equal(await evaluate('[...document.querySelectorAll("[role=dialog] button")].some(b=>b.textContent?.includes("确认发布")&&!b.disabled)'),false,
        "Publishing before reviewing the public text must be blocked")
      const reviewed=await evaluate('(()=>{const el=[...document.querySelectorAll("[role=dialog] input[type=checkbox]")].find(x=>x.getAttribute("aria-label")?.includes("确认已核查"));if(!el)return false;el.click();return el.checked})()')
      assert.equal(reviewed,true)
      await wait('[...document.querySelectorAll("[role=dialog] button")].some(b=>b.textContent?.includes("确认发布")&&!b.disabled)',
        "publish action after explicit user review")
      await clickText("确认发布")
      await wait('document.body.innerText.includes("发布成功，模板已上架市场")',
        "template published from browser")
      const templates=await api("GET","/api/templates/market")
      const published=templates.items.find(row=>row.name===publishedName)
      assert.ok(published,"Template created through UI is missing from backend")
      assert.deepEqual(published.spec.knowledge_base_ids,[])
      assert.deepEqual(published.spec.quality_checks,[])
      const choose=await evaluate("(()=>{const card=[...document.querySelectorAll('article')].find(a=>a.querySelector('h3')?.textContent==="+JSON.stringify(publishedName)+");const button=[...(card?.querySelectorAll('button')||[])].find(b=>b.textContent?.includes('复制并配置'));if(!button)return false;button.click();return true})()")
      assert.ok(choose,"Published template card must offer a copy-and-configure action")
      await wait('document.querySelector("[role=dialog]")?.textContent?.includes("复制模板到我的 Agent")',
        "template copy confirmation")
      await clickText("复制并配置资源")
      await wait('location.pathname==="/agent-create" && new URLSearchParams(location.search).has("spec")',
        "cloned template opens resource configuration")
      const copiedId=await evaluate('new URLSearchParams(location.search).get("spec")')
      assert.ok(copiedId!==spec.id)
      const clone=await api("GET","/api/agent_specs/"+copiedId)
      assert.deepEqual(clone.spec.knowledge_base_ids,[])
      assert.equal(clone.spec.require_approval,true)
      console.log("CHROME_TEMPLATE_MARKET_USER_JOURNEY_PASS",JSON.stringify({
        reviewRequired:true,publishedRecord:published.id,clonedAgent:copiedId,
        configFirst:true,credentialsNotInherited:true,
      }))
      return
    }
    // Real browser chooses one concrete MCP capability in the Agent editor.
    await cmd("Page.navigate",{url:webOrigin+"/?spec="+encodeURIComponent(spec.id)})
    await wait('document.querySelector("#spec-editor")!==null',"saved Agent editor")
    const chosenLabel="浏览器检索插件 · doc_search"
    const checkboxExpression=(value)=>`[...document.querySelectorAll('[role=checkbox]')]
      .some(element=>element.textContent?.includes(${JSON.stringify(chosenLabel)})
        && element.getAttribute('aria-checked')===${JSON.stringify(value)})`
    await wait(checkboxExpression("false"),"verified MCP tool visible and initially off")
    assert.equal(await evaluate(`[...document.querySelectorAll('[role=checkbox]')]
      .some(element=>element.textContent?.includes('浏览器检索插件 · doc_write'))`),true)
    assert.ok(await evaluate(`(()=>{
      const selected=[...document.querySelectorAll('[role=checkbox]')]
        .find(element=>element.textContent?.includes(${JSON.stringify(chosenLabel)}))
      if(!selected)return false
      selected.click();return true
    })()`),"Selecting the actual MCP tool failed")
    await wait(checkboxExpression("true"),"specific MCP capability selected")
    // OAuth may complete in a second tab: checking connection status on focus
    // must preserve the unsaved Agent spec selection.
    await evaluate("window.dispatchEvent(new Event('focus'))")
    await wait(checkboxExpression("true"),"unsaved MCP tool choice survives focus")
    assert.equal(await evaluate(`[...document.querySelectorAll('a')]
      .some(link=>link.textContent?.includes('管理插件（新标签）')
        && link.getAttribute('target')==='_blank')`),true)
    await clickText("保存到我的助手")
    await wait('document.body.innerText.includes("已保存进「我的 Agent」")',"persisted Agent tool selection")
    const savedWithTool=await api("GET","/api/agent_specs/"+spec.id)
    assert.ok(savedWithTool.spec.tools.includes(selectedToolId),"Agent spec did not persist exact MCP tool ID")
    assert.ok(!savedWithTool.spec.tools.includes(unselectedToolId),"Unselected MCP tool must not be added")
    await cmd("Page.navigate",{url:webOrigin+"/agent-run?spec="+encodeURIComponent(spec.id)})
    await wait('document.body.innerText.includes("浏览器检索插件 · doc_search")',"run panel shows chosen MCP tool")
    await wait('document.body.innerText.includes("已验证插件工具：2 个 · 当前方案已选 1 个")',
      "run panel reflects explicit plugin selection")

    const deepLink=webOrigin+"/agent-run?spec="+encodeURIComponent(spec.id)+"&run="+encodeURIComponent(run.run_id)
    await cmd("Page.navigate",{url:deepLink})
    await wait('document.querySelector("#agent-input-review")!==null',"pending human review")
    assert.equal(await evaluate('document.querySelector("#agent-input-review")?.textContent?.includes("需求方案草案")'),true)
    assert.equal(await evaluate('location.search.includes("run=")'),true)
    assert.equal(await evaluate("Boolean(document.querySelector('a[href^=\"/plugin-market?tool=\"]'))"),true,
      "Unavailable tool should link into the plugin marketplace")

    await cmd("Page.reload",{ignoreCache:true})
    await sleep(550) // Let Chrome detach the old document before testing restored UI.
    await wait('document.querySelector("#agent-input-review")?.textContent?.includes("需求方案草案")===true',"review persisted after Chrome reload")
    assert.equal(await evaluate('location.search.includes("run=")'),true)
    await evaluate('document.querySelector("#agent-reply").focus()')
    await cmd("Input.insertText",{text:"删除无关功能，优先检索并补充权限校验"})
    await wait('document.querySelector("#agent-reply")?.value.includes("权限校验")',"browser edited review feedback")
    await clickText("提出修改意见")
    await wait('document.querySelector("#agent-input-review")?.textContent?.includes("修订方案草案")===true',"revised proposal")
    await clickText("批准方案并继续")
    await wait('document.body.innerText.includes("最终实施计划通过")',"final plan after review")
    assert.equal(await evaluate('document.querySelector("[role=document] h3")?.textContent?.includes("最终实施计划通过")'),true,"Markdown headings should render semantically")
    assert.equal(await evaluate('document.querySelector("[role=document] table")!==null'),true,"Markdown tables should render as accessible tables")
    assert.ok(agentModelCalls>=3,"model must execute again after approval")
    const saved=await api("GET","/api/agent_runs/"+run.run_id)
    assert.equal(saved.status,"succeeded")
    assert.equal(saved.checkpoint.plan_review_confirmed,true)

    // Acceptance release must treat a human-review checkpoint as pending,
    // not a failure, and restore the exact run after the user confirms.
    await cmd("Page.navigate",{url:webOrigin+"/version-release?spec="+encodeURIComponent(spec.id)})
    await wait('document.querySelector("#vr-test-model option[value^=\\\"custom:\\\"]")!==null',
      "acceptance model selection available")
    const acceptanceModelValue="custom:"+connection.item.id+":review-ui-model"
    const selected=await evaluate("(()=>{const el=document.querySelector('#vr-test-model');if(!el)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,"+JSON.stringify(acceptanceModelValue)+");el.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
    assert.equal(selected,true)
    await wait('document.querySelector("#vr-test-model")?.value==='+JSON.stringify(acceptanceModelValue),
      "acceptance test model selected")
    await evaluate('document.querySelector("textarea[placeholder^=\\\"例：帮我算一下\\\"]").focus()')
    await cmd("Input.insertText",{text:"根据确认后的需求输出落地计划并列出验收标准"})
    await clickText("运行测试")
    await wait('document.body.innerText.includes("验收测试等待你的补充")',
      "human review in acceptance pipeline")
    assert.equal(await evaluate('document.body.innerText.includes("验收测试未通过")'),false,
      "A waiting review cannot be misreported as a failed release")
    const acceptanceQuery=await evaluate("location.search")
    const acceptanceRunId=new URLSearchParams(acceptanceQuery).get("testRun")
    assert.ok(acceptanceRunId && /^[a-zA-Z0-9]{15}$/.test(acceptanceRunId),
      "Acceptance run id not persisted in current URL")
    const acceptanceState=await api("GET","/api/agent_runs/"+acceptanceRunId)
    assert.equal(acceptanceState.status,"awaiting_input")
    const approveTarget="/agent-run?spec="+spec.id+"&run="+acceptanceRunId
    assert.equal(await evaluate('[...document.querySelectorAll("a")].some(a=>a.getAttribute("href")==='+JSON.stringify(approveTarget)+')'),true)
    await cmd("Page.navigate",{url:webOrigin+approveTarget})
    await wait('document.querySelector("#agent-input-review")!==null',"original acceptance review restored")
    await clickText("批准方案并继续")
    await wait('document.body.innerText.includes("最终实施计划通过")',
      "human-approved acceptance execution completed")
    await cmd("Page.navigate",{url:webOrigin+"/version-release?spec="+spec.id+"&testRun="+acceptanceRunId})
    await wait('document.body.innerText.includes("验收测试通过")',
      "acceptance status reloads as passed for the same saved Agent version")
    console.log("CHROME_RELEASE_HUMAN_REVIEW_PASS",JSON.stringify({
      pauseAndResume:true,deepLinkRecovery:true,reviewNotMisreportedAsFailure:true,
      acceptanceRunId,
    }))
    // Return to the original run before testing the inline evaluation UI.
    await cmd("Page.navigate",{url:deepLink})
    await wait('location.pathname==="/agent-run" && document.body.innerText.includes("最终实施计划通过")',
      "original run result restored for evaluation")
    // The evaluation -> feedback -> improvement -> compare -> apply loop
    // stays directly below the run result, not in an unrelated sidebar.
    await wait('document.body.innerText.includes("根据反馈优化方案")',"integrated optimization section")
    assert.equal(await evaluate('document.getElementById("spec-optimize")===null'),true,
      "Version improvement must be inline, not hidden in a distant sidebar")
    await clickText("生成评估")
    await wait('document.body.innerText.includes("总分")',"actual model/rule evaluation")
    // Select an unrelated Agent on the left to ensure optimization stays bound
    // to the run's original Agent ID, never the sidebar selection.
    assert.ok(await evaluate(`(()=>{
      const el=document.querySelector("#spec-select")
      if(!el)return false
      const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set
      setter.call(el,${JSON.stringify(unrelated.id)})
      el.dispatchEvent(new Event("change",{bubbles:true}))
      return true
    })()`),"Could not change Agent sidebar selection")
    await wait('document.querySelector("#spec-select")?.value==='+JSON.stringify(unrelated.id),
      "unrelated Agent selected in sidebar")
    await clickText("结果不理想")
    await evaluate('document.querySelector(\'textarea[placeholder^="补充一句话"]\').focus()')
    await cmd("Input.insertText",{text:"需求方案需要补全权限隔离和来源引用"})
    await clickText("提交反馈")
    await wait('document.body.innerText.includes("你反馈了：结果不理想")',"user feedback persisted")
    await clickText("根据反馈优化方案")
    await wait('document.body.innerText.includes("【优化后目标】")',"improvement draft from real backend")
    assert.ok(optimizeModelCalls>=1,"Optimize action never invoked the local mock LLM")
    assert.ok(optimizeSource.includes("需求落地方案助手")&&!optimizeSource.includes("另一个不能误改的 Agent"),
      "Optimization must target the run owner Agent, not the left-hand selection")
    await wait('document.body.innerText.includes("确认写回方案")',"version diff is actionable")
    const beforeConflict=await api("GET","/api/agent_specs/"+spec.id)
    await api("PATCH","/api/agent_specs/"+spec.id,{
      spec:{...beforeConflict.spec,goal:"【其他页面的新目标】保留并行编辑"},
      expected_updated:beforeConflict.updated,
    })
    await clickText("确认写回方案")
    await wait('document.body.innerText.includes("旧优化稿已作废")',"optimistic concurrency conflict handled")
    assert.equal((await api("GET","/api/agent_specs/"+spec.id)).spec.goal,
      "【其他页面的新目标】保留并行编辑","A stale suggestion must not overwrite a newer version")
    await clickText("根据反馈优化方案")
    await wait('document.body.innerText.includes("确认写回方案")',"fresh diff after conflict")
    await clickText("确认写回方案")
    await wait('document.body.innerText.includes("方案优化已保存为当前 Agent 的新版本")',
      "manually applied proposal saved")
    const appliedSpec=await api("GET","/api/agent_specs/"+spec.id)
    assert.match(appliedSpec.spec.goal,/【优化后目标】/)
    assert.ok(appliedSpec.spec.tools.includes(selectedToolId),
      "Applied proposal must retain previously authorized tools")
    const intactUnrelated=await api("GET","/api/agent_specs/"+unrelated.id)
    assert.equal(intactUnrelated.spec.goal,"【独立目标】不要被别的运行修改")
    const runAfterApply=await api("GET","/api/agent_runs/"+run.run_id)
    assert.notEqual(runAfterApply.spec_snapshot.goal,appliedSpec.spec.goal,
      "Historical run snapshots must not change when applying a new version")


    // Global quick editor: open the exact Agent from the current run,
    // save new version without mutating historical run snapshots.
    await clickText("调整 Agent 方案")
    await wait('document.querySelector("[role=dialog] textarea")!==null',"global quick editor")
    const targetGoal="【全局编辑新目标】团队需求落地辅助和审阅"
    await evaluate('document.querySelector("[role=dialog] textarea").focus()')
    await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"a",code:"KeyA",windowsVirtualKeyCode:65,modifiers:2})
    await cmd("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",windowsVirtualKeyCode:65})
    await cmd("Input.insertText",{text:targetGoal})
    await wait('document.querySelector("[role=dialog] textarea")?.value.includes("全局编辑新目标")',"quick editor field updated")
    await clickText("保存方案")
    await wait('document.querySelector("[role=dialog]")?.textContent?.includes("Agent 方案已保存")',
      "saved quick editor revision")
    const globalSaved=await api("GET","/api/agent_specs/"+spec.id)
    assert.equal(globalSaved.spec.goal,targetGoal)
    assert.ok(globalSaved.spec.tools.includes(selectedToolId),"quick edit must retain tool authorization")
    assert.notEqual((await api("GET","/api/agent_runs/"+run.run_id)).spec_snapshot.goal,targetGoal,
      "editing during/after run may not rewrite original run snapshot")
    await clickText("保存并进入试跑")
    await wait('location.pathname==="/agent-run" && location.search.includes('+JSON.stringify(spec.id)+') && !new URLSearchParams(location.search).has("run") && document.querySelector("[role=dialog]")===null',
      "one-click saved quick edit -> trial")
    // Quick editor draft must survive reload without updating the official version.
    await clickText("调整 Agent 方案")
    await wait('document.querySelector("[role=dialog] textarea")!==null',"reopen quick editor")
    const quickUncommitted="【临时草稿】刷新后应显式恢复，尚未保存"
    await evaluate('document.querySelector("[role=dialog] textarea").focus()')
    await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"a",code:"KeyA",windowsVirtualKeyCode:65,modifiers:2})
    await cmd("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",windowsVirtualKeyCode:65})
    await cmd("Input.insertText",{text:quickUncommitted})
    await wait('document.querySelector("[role=dialog] textarea")?.value.includes("临时草稿")',
      "quick editor draft changed")
    await cmd("Page.reload",{ignoreCache:true})
    await sleep(450)
    await wait('location.pathname==="/agent-run" && !!document.querySelector("button[aria-label=\\"随时调整 Agent 方案\\"]")',
      "same Agent run page after refresh")
    assert.equal((await api("GET","/api/agent_specs/"+spec.id)).spec.goal,targetGoal,
      "unsaved quick-editor draft must never mutate official Agent")
    await clickText("调整 Agent 方案")
    await wait('document.body.innerText.includes("发现该 Agent 在本标签页有未提交的修改")',
      "explicitly offer stored session draft, never overwrite silently")
    assert.equal(await evaluate('document.querySelector("[role=dialog] textarea")===null'),true,
      "official editor must remain hidden before restore/discard decision")
    await clickText("恢复我的修改")
    await wait('document.querySelector("[role=dialog] textarea")?.value.includes("临时草稿")',
      "restored quick editor draft")
    await clickText("保存方案")
    await wait('document.querySelector("[role=dialog]")?.textContent?.includes("Agent 方案已保存")',
      "restored draft explicitly committed")
    assert.equal((await api("GET","/api/agent_specs/"+spec.id)).spec.goal,quickUncommitted)
    await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27})
    await wait('document.querySelector("[role=dialog]")===null',"saved quick editor closes")
    // Recovering a draft based on an older server version must fail closed.
    // Another authorized editor updates the original while this employee has
    // a still-unsubmitted local draft.
    await clickText("调整 Agent 方案")
    await wait('document.querySelector("[role=dialog] textarea")!==null',"open editor for stale-draft test")
    const staleGoal="【有旧版本的草稿】只能另存副本，不得覆盖并行编辑"
    await evaluate('document.querySelector("[role=dialog] textarea").focus()')
    await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"a",code:"KeyA",windowsVirtualKeyCode:65,modifiers:2})
    await cmd("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",windowsVirtualKeyCode:65})
    await cmd("Input.insertText",{text:staleGoal})
    await wait('document.querySelector("[role=dialog] textarea")?.value.includes("有旧版本的草稿")',
      "unsaved stale draft")
    await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27})
    await wait('document.querySelector("[role=dialog]")===null',"stale draft cached on close")
    const currentVersion=await api("GET","/api/agent_specs/"+spec.id)
    const colleagueVersion="【协作者更新】保留服务器现有方案"
    await api("PATCH","/api/agent_specs/"+spec.id,{
      spec:{...currentVersion.spec,goal:colleagueVersion},
      expected_updated:currentVersion.updated,
    })
    await clickText("调整 Agent 方案")
    await wait('document.body.innerText.includes("发现该 Agent 在本标签页有未提交的修改")',
      "stale draft recovery offered")
    await clickText("恢复我的修改")
    await wait('document.body.innerText.includes("服务器版本已更新，未覆盖你的草稿")',
      "stale restore requires explicit conflict resolution")
    await clickText("保存方案")
    await wait('document.body.innerText.includes("草稿基于旧版本，不能覆盖服务器的新方案")',
      "original overwrite prevented")
    assert.equal((await api("GET","/api/agent_specs/"+spec.id)).spec.goal,colleagueVersion,
      "outdated local draft must not overwrite concurrent server edit")
    await clickText("另存为新 Agent")
    await wait('document.body.innerText.includes("Agent 方案已保存")',
      "stale draft copied into a separate Agent")
    assert.equal((await api("GET","/api/agent_specs/"+spec.id)).spec.goal,colleagueVersion)
    await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27})
    await wait('document.querySelector("[role=dialog]")===null',"copied draft editor closes")




    // The five-step wizard must expose the same live draft editor even when
    // the user is already at the resource / trial stages.
    await cmd("Page.navigate",{url:webOrigin+"/agent-create?step=3&spec="+encodeURIComponent(autoSpec.id)})
    await wait('document.querySelector("#spec-editor input[aria-label=\\"助手名称\\"]")?.value==="自动匹配工具 Agent"',
      "agent creation wizard recovered saved draft")
    await wait('document.body.innerText.includes("AI 需求识别 · 自动匹配工具")',
      "automatic tool plan visible in creation wizard")
    assert.equal(await evaluate('document.body.innerText.includes("文档解析")'),true,
      "unavailable document parser must remain a visible connection gap")
    await clickText("重新匹配已连接工具")
    await wait('document.body.innerText.includes("网页搜索")',"real builtin matching applied")
    await clickText("保存到我的助手")
    await wait('document.body.innerText.includes("已保存进「我的 Agent」")',
      "recommended tools saved into AgentSpec")
    const afterAuto=await api("GET","/api/agent_specs/"+autoSpec.id)
    assert.ok(afterAuto.spec.tools.includes("web_search"),"generic network tool must become executable builtin")
    assert.ok(afterAuto.spec.tools.includes("文档解析"),"unknown capability must not be silently discarded")
    await clickText("调整 Agent 方案")
    await wait('document.querySelector("[role=dialog] textarea")!==null',
      "always-on creator drawer should open same in-progress Agent")
    assert.equal(await evaluate('document.querySelector("[role=dialog] input[aria-label=\\"助手名称\\"]")?.value==="自动匹配工具 Agent"'),true)
    await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27})
    await wait('document.querySelector("[role=dialog]")===null',"creator quick drawer can close")

    // A second awaiting review run is discoverable from history detail.
    const second=await start()
    await api("POST","/api/llm/agent-engine/"+second.run_id+"/tick",{})
    await cmd("Page.navigate",{url:webOrigin+"/run-detail?run="+encodeURIComponent(second.run_id)})
    await wait('document.body.innerText.includes("打开人工确认并继续")',"actionable run history")
    await evaluate('[...document.querySelectorAll("a")].find(x=>x.textContent?.includes("打开人工确认并继续"))?.click()')
    await wait('location.pathname==="/agent-run"',"history -> exact active run")
    await wait('document.querySelector("#agent-input-review")!==null',"history resume form")
    assert.equal(await evaluate('location.search.includes('+JSON.stringify(second.run_id)+')'),true)
    // Cross-workspace UI/UX audit: render every major employee/admin route
    // under the same verified account at a real narrow mobile viewport.
    // This is a *route/UI smoke*; feature-level behavior is tested separately.
    await cmd("Emulation.setDeviceMetricsOverride",{
      width:390,height:844,deviceScaleFactor:1,mobile:true,
    })
    const uxPaths=[
      "/","/agent-create","/agent-run","/run-detail","/workflow-canvas",
      "/template-market","/internal-templates","/agent-collaboration",
      "/version-release","/integrate","/model-connections","/knowledge-bases",
      "/tool-connections","/plugin-market","/scheduled-tasks","/tool-hub",
      "/manager","/staff","/internal-overview",
    ]
    const mobileAudit=[]
    for(const route of uxPaths){
      await cmd("Page.navigate",{url:webOrigin+route})
      await wait(`location.pathname===${JSON.stringify(route)}
        && Boolean(document.querySelector('main,[data-studio-fluid-page]'))
        && !document.body.innerText.includes('正在验证账号并打开工作台')`,
        "mobile route "+route)
      await sleep(210)
      const check=await evaluate(`({
        pathname:location.pathname,
        bodyError:document.body.innerText.includes("当前页面暂时无法显示"),
        globalEditor:!!document.querySelector('button[aria-label="随时调整 Agent 方案"]'),
        overflow:Math.max(0,document.documentElement.scrollWidth-window.innerWidth),
        viewport:window.innerWidth,
        label:(document.querySelector('main h1, main h2, [data-studio-fluid-page] h1')
          ?.textContent||'').trim().slice(0,55),
        a11y:(()=>{
          const visible=el=>el.getClientRects().length>0 &&
            getComputedStyle(el).visibility!=='hidden'
          const missingButtons=[...document.querySelectorAll('button')].filter(el=>
            visible(el)&&!el.disabled&&!el.getAttribute('aria-label') &&
            !el.getAttribute('aria-labelledby')&&!el.getAttribute('title') &&
            !el.textContent.trim()).slice(0,5)
          const missingFields=[...document.querySelectorAll('input,textarea,select')].filter(el=>{
            if(!visible(el)||el.type==='hidden'||el.disabled)return false
            if(el.getAttribute('aria-label')||el.getAttribute('aria-labelledby'))return false
            if(el.closest('label'))return false
            if(el.id&&document.querySelector('label[for="'+el.id+'"]'))return false
            return true
          }).slice(0,5)
          return {buttons:missingButtons.map(el=>el.outerHTML.slice(0,95)),
            fields:missingFields.map(el=>el.outerHTML.slice(0,95))}
        })()
      })`)
      assert.equal(check.bodyError,false,"render error at "+route)
      assert.equal(check.globalEditor,true,"global quick-edit action missing at "+route)
      mobileAudit.push({route,overflow:check.overflow,view:check.viewport,label:check.label,a11y:check.a11y})
    }
    console.log("CHROME_ALL_MODULE_MOBILE_AUDIT",JSON.stringify(mobileAudit))
    console.log("CHROME_MODULE_A11Y_FINDINGS",JSON.stringify(
      mobileAudit.filter(item=>item.a11y.buttons.length||item.a11y.fields.length)
        .map(({route,a11y})=>({route,...a11y}))))

    // Mobile Agent editor is not only a shortcut: the dialog must remain
    // readable, scrollable and offer real saving/testing actions.
    await cmd("Page.navigate",{url:webOrigin+"/agent-run?spec="+encodeURIComponent(spec.id)})
    await wait('location.pathname==="/agent-run" && !!document.querySelector("button[aria-label=\\\"随时调整 Agent 方案\\\"]")',
      "mobile run workspace ready")
    await clickText("调整 Agent 方案")
    await wait('document.querySelector("[role=dialog] textarea")!==null',"mobile quick editor opens")
    const mobileDialog=await evaluate(`(()=>{
      const el=document.querySelector('[role=dialog]')
      const root=document.documentElement
      const rect=el.getBoundingClientRect()
      return {
        width:rect.width,viewport:window.innerWidth,
        horizontalOverflow:Math.max(0,root.scrollWidth-window.innerWidth),
        scrollable:!!el.querySelector('[class*="overflow-y-auto"]'),
        saveButton:!![...el.querySelectorAll('button')].find(b=>b.textContent?.includes('保存方案')),
        testButton:!![...el.querySelectorAll('button')].find(b=>b.textContent?.includes('保存并进入试跑')),
      }
    })()`)
    assert.ok(mobileDialog.width<=mobileDialog.viewport+1 &&
      mobileDialog.horizontalOverflow<=1,JSON.stringify(mobileDialog))
    assert.equal(mobileDialog.scrollable,true)
    assert.equal(mobileDialog.saveButton,true)
    assert.equal(mobileDialog.testButton,true)
    await cmd("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27})
    await wait('document.querySelector("[role=dialog]")===null',"mobile editor closes via escape")
    console.log("CHROME_AGENT_MOBILE_QUICK_EDITOR_PASS",JSON.stringify(mobileDialog))

    // Tool discovery has a real return path to the originating saved Agent.
    await cmd("Page.navigate",{url:webOrigin+"/plugin-market?tool=pdf&returnSpec="+encodeURIComponent(autoSpec.id)})
    await wait('document.body.innerText.includes("正在为一个 Agent 连接工具")',
      "resource market keeps originating Agent context")
    assert.equal(await evaluate(`[...document.querySelectorAll('a')].some(anchor=>
      anchor.textContent?.includes('返回原 Agent 配置') &&
      anchor.getAttribute('href')===${JSON.stringify("/agent-create?step=3&spec="+autoSpec.id)})`),true)
    await evaluate('[...document.querySelectorAll("a")].find(anchor=>anchor.textContent?.includes("返回原 Agent 配置"))?.click()')
    await wait('location.pathname==="/agent-create" && new URLSearchParams(location.search).get("spec")==='+JSON.stringify(autoSpec.id),
      "resource market -> exact Agent creation state")
    console.log("CHROME_MARKET_RETURN_TO_AGENT_PASS",JSON.stringify({specScoped:true,step:"connect"}))

    // Employee cross-module resource journey, not just route smoke:
    // each model/HTTP-tool/knowledge configuration preserves the exact Agent context.
    const returnPath="/agent-create?spec="+autoSpec.id+"&step=3"
    for (const route of ["/model-connections","/tool-connections","/knowledge-bases"]) {
      await cmd("Page.navigate",{url:webOrigin+route+"?returnSpec="+autoSpec.id})
      await wait('location.pathname==='+JSON.stringify(route)+
        ' && !!document.querySelector(\'[aria-label="返回原 Agent 资源配置"] a\')',
        "resource return action on "+route)
      assert.equal(await evaluate('document.querySelector(\'[aria-label="返回原 Agent 资源配置"] a\')?.getAttribute("href")'),
        returnPath,"Resource link must preserve the intended Agent")
    }
    // Knowledge library: type a name in a real controlled input, submit, and
    // confirm the new library is actually returned by PocketBase.
    await wait('document.querySelector("#kb-name")!==null',"knowledge editor ready")
    await evaluate('document.querySelector("#kb-name").focus()')
    await cmd("Input.insertText",{text:"员工 UX 验收资料库"})
    await wait('document.querySelector("#kb-name")?.value.includes("员工 UX 验收资料库")',
      "knowledge library name entered")
    await clickText("创建知识库")
    await wait('document.body.innerText.includes("知识库已创建")',"knowledge library created")
    const kbRows=await api("GET","/api/knowledge-bases")
    assert.ok(kbRows.items.some(item=>item.name==="员工 UX 验收资料库"),
      "Library form must use a real backend write, not a UI placeholder")
    await clickText("编辑")
    await wait('document.activeElement?.id==="kb-name"',"knowledge edit auto focuses the form")
    assert.equal(await evaluate('document.querySelector("#kb-name")?.value'),"员工 UX 验收资料库")
    // Scheduler: new schedule form identifies real owned Agent & model, then
    // creates a schedule before the list action sends focus back into editor.
    await cmd("Page.navigate",{url:webOrigin+"/scheduled-tasks"})
    await wait('document.querySelector("#schedule-editor input[id=schedule-plan-name]")!==null',
      "scheduled form ready")
    await wait('document.querySelector("#schedule-editor select")!==null',"schedule options loaded")
    const scheduleTargets=await api("GET","/api/agent_specs?perPage=200")
    assert.ok(scheduleTargets.items.some(row=>row.id===spec.id),
      "The schedule target must be present in the current user's authoritative Agent list")
    await wait(`[...document.querySelectorAll('#schedule-editor form select')][1] &&
      [...document.querySelectorAll('#schedule-editor form select')][1].querySelector(
        'option[value="${spec.id}"]')!==null`,"scheduler target options loaded")
    await wait(`[...document.querySelectorAll('#schedule-editor form select')][2]?.querySelector(
      'option[value="${connection.item.id}"]')!==null`,"scheduler model connection options loaded")
    await evaluate('document.querySelector("#schedule-plan-name").focus()')
    await cmd("Input.insertText",{text:"UX 行为验收定时计划"})
    for (const [position,value] of [[1,spec.id],[2,connection.item.id],[3,"review-ui-model"]]) {
      if(position===3) await wait(`[...document.querySelectorAll(\'#schedule-editor form select\')][3]?.querySelector(\'option[value="${connection.item.id}"]\')!==null || [...document.querySelectorAll(\'#schedule-editor form select\')][3]?.querySelector(\'option[value="review-ui-model"]\')!==null`, "model choices loaded")
      const success=await evaluate(`(()=>{
        const el=[...document.querySelectorAll('#schedule-editor form select')][${position}]
        if(!el)return false
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(value)})
        el.dispatchEvent(new Event('change',{bubbles:true}))
        return true
      })()`)
      assert.ok(success)
      await wait(`document.querySelectorAll('#schedule-editor form select')[${position}]?.value===${JSON.stringify(value)}`,
        "schedule select "+position)
    }
    await evaluate('document.querySelector("#schedule-editor textarea").focus()')
    await cmd("Input.insertText",{text:"整理内部知识需求，生成可核验来源的简报"})
    await wait('document.querySelector("#schedule-editor textarea")?.value.includes("整理内部知识需求")',
      "schedule instruction")
    await clickText("创建定时任务")
    await wait('document.body.innerText.includes("计划保存成功")',"scheduled task backend create")
    const scheduleResult=await api("GET","/api/schedules")
    const createdPlan=scheduleResult.items.find(row=>row.name==="UX 行为验收定时计划")
    assert.ok(createdPlan,"Schedule was not created by actual API")
    const editClicked=await evaluate(`(()=>{
      const btn=[...document.querySelectorAll('button')].find(b=>
        b.getAttribute('aria-label')===${JSON.stringify("编辑定时计划：UX 行为验收定时计划")})
      if(!btn)return false
      btn.click();return true
    })()`)
    assert.ok(editClicked,"Schedule list edit action absent")
    await wait('document.activeElement?.id==="schedule-plan-name"',"schedule edit focuses existing form")
    assert.equal(await evaluate('document.querySelector("#schedule-plan-name")?.value'),"UX 行为验收定时计划")
    // The owner-scoped human-input queue should link directly to its Agent.
    const actionOverview=await api("GET","/api/internal/overview")
    assert.ok(actionOverview.counters.awaiting_input>=1)
    assert.ok(actionOverview.action_items.some(item=>
      item.category==="input" && item.id===second.run_id))
    await cmd("Page.navigate",{url:webOrigin+"/internal-overview"})
    await wait('document.body.innerText.includes("待我回复")',
      "human input surfaced in internal overview")
    const directHref="/agent-run?run="+second.run_id
    const navigated=await evaluate("(()=>{const link=[...document.querySelectorAll('a')].find(a=>a.getAttribute('href')==="+JSON.stringify(directHref)+");if(!link)return false;link.click();return true})()")
    assert.ok(navigated,"Dashboard must link directly to original awaiting-input run")
    await wait('location.pathname==="/agent-run" && location.search.includes('+JSON.stringify(second.run_id)+')',
      "dashboard opens exact awaiting-input Agent")
    await wait('document.querySelector("#agent-input-review")!==null',
      "Agent human-response form opens without extra navigation")
    console.log("CHROME_HUMAN_INPUT_DASHBOARD_PASS",JSON.stringify({
      ownerScoped:true,resumeDirect:true,runId:second.run_id,
    }))
    console.log("CHROME_RESOURCE_AND_SCHEDULE_JOURNEY_PASS",JSON.stringify({
      resourceReturn:3,knowledgeCreate:true,knowledgeEditFocus:true,
      scheduleCreate:true,scheduleEditFocus:true,
    }))

    console.log("CHROME_AGENT_REVIEW_PASS",JSON.stringify({
      actualEmployeeLogin:true,deepLinkReload:true,rejectRevision:true,
      approvalContinues:true,historyAction:true,marketplaceLink:true,
      marketToolChoice:true,toolGrantPersisted:true,unsavedDraftSurvivedFocus:true,
      inlineFeedbackOptimization:true,runBoundAgent:true,optimisticConflictProtected:true,
      reviewModelCalls:agentModelCalls,runId:run.run_id,
    }))
  } finally {
    if(chrome){
      try{chrome.client.close()}catch{}
      try{chrome.child.kill()}catch{}
      await sleep(450)
    }
    if(frontend) {try{frontend.kill()}catch{}}
    if(pb) {try{await stopHeadlessPocketBase(pb)}catch{}}
    if(mock)await new Promise(resolve=>mock.close(resolve))
    try{fs.rmSync(chromeDir,{recursive:true,force:true,maxRetries:2,retryDelay:250})}catch{}
    try{fs.rmSync(testDir,{recursive:true,force:true,maxRetries:3,retryDelay:250})}catch{}
  }
})
