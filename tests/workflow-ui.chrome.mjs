/**
 * Opt-in REAL Chromium smoke for workflow UX. No Playwright installation.
 * Starts a fresh company-authenticated PocketBase and a Vite dev server on
 * ephemeral loopback ports. Uses the Chrome DevTools Protocol via Node WebSocket.
 * NEVER connects to production, existing employee accounts or paid model providers.
 *
 * Run: node --test tests/workflow-ui.chrome.mjs
 * Requires Chrome/Edge and the project's PocketBase development binary.
 */
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root = process.cwd()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const chromeCandidates = [
  process.env.AGENT_STUDIO_UI_CHROME_BIN,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean)

async function port() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const assigned = server.address().port
      server.close(() => resolve(assigned))
    })
  })
}
async function waitForHttp(url, child, logs, timeoutMs = 25000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (child.exitCode !== null)
      throw new Error("test service exited before ready: " + logs().slice(-1200))
    try {
      const res = await fetch(url, {signal:AbortSignal.timeout(1100)})
      if (res.status < 500) return
    } catch {}
    await sleep(170)
  }
  throw new Error("test service startup timed out: " + logs().slice(-1500))
}

class BrowserProtocol {
  constructor(socket) {
    this.socket = socket
    this.next = 1
    this.pending = new Map()
    socket.addEventListener("message", event => {
      try {
        const message = JSON.parse(String(event.data))
        if (!message.id) {
          if (message.method === "Page.javascriptDialogOpening" && this.onDialog)
            void this.onDialog(message)
          return
        }
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        clearTimeout(pending.timeout)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result || {})
      } catch {}
    })
  }
  command(method, params = {}, sessionId) {
    const id = this.next++
    return new Promise((resolve,reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error("CDP timeout: " + method))
      },13000)
      this.pending.set(id,{resolve,reject,timeout})
      this.socket.send(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})}))
    })
  }
  close() {
    for(const item of this.pending.values()) {
      clearTimeout(item.timeout)
      item.reject(new Error("browser protocol closed"))
    }
    this.pending.clear()
    this.socket.close()
  }
}

async function launchChrome(profile) {
  const binary = chromeCandidates.find(fs.existsSync)
  assert.ok(binary,"Headless Chrome/Edge not installed; set AGENT_STUDIO_UI_CHROME_BIN")
  const child=spawn(binary, [
    "--headless=new", "--disable-gpu", "--disable-extensions",
    "--disable-background-networking", "--disable-sync", "--no-first-run",
    "--no-default-browser-check", "--remote-debugging-port=0",
    "--remote-allow-origins=*", "--user-data-dir=" + profile,
    "--window-size=1440,900","about:blank",
  ], {windowsHide:true,stdio:"ignore"})
  const marker=path.join(profile,"DevToolsActivePort")
  let content=""
  for(let attempt=0;attempt<130;attempt++){
    if(fs.existsSync(marker)){content=fs.readFileSync(marker,"utf8");break}
    if(child.exitCode!==null)break
    await sleep(120)
  }
  assert.ok(content,"Isolated Chrome CDP did not become ready")
  const [remotePort] = content.split(/\r?\n/)
  const targets = await fetch("http://127.0.0.1:" + remotePort + "/json/version",{
    signal:AbortSignal.timeout(3000),
  }).then(r=>r.json())
  const ws = new WebSocket(targets.webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("CDP websocket connection timed out")),6000)
    ws.addEventListener("open",()=>{clearTimeout(timer);resolve()},{once:true})
    ws.addEventListener("error",()=>{clearTimeout(timer);reject(new Error("CDP websocket error"))},{once:true})
  })
  const client = new BrowserProtocol(ws)
  const target = await client.command("Target.createTarget",{url:"about:blank"})
  const session = await client.command("Target.attachToTarget",{
    targetId:target.targetId,flatten:true,
  })
  await client.command("Page.enable",{},session.sessionId)
  await client.command("Runtime.enable",{},session.sessionId)
  return {child,client,sessionId:session.sessionId}
}

test("independent-workflow-browser desktop + mobile smoke", {timeout:135000}, async () => {
  const pbBinary=process.env.POCKETBASE_BIN ||
    path.join(root,"vibex-local/bin/windows/pocketbase.exe")
  const viteBin=path.join(root,"node_modules/vite/bin/vite.js")
  assert.ok(fs.existsSync(pbBinary),"missing local PocketBase binary")
  assert.ok(fs.existsSync(viteBin),"missing local Vite installation")
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-ui-"))
  const chromeProfile=fs.mkdtempSync(path.join(path.dirname(root),"agentstudio-chrome-ui-"))
  const bootKey=randomBytes(32).toString("hex")
  const workerKey=randomBytes(48).toString("hex")
  const secret=randomBytes(16).toString("hex")
  const pbPort=await port()
  const vitePort=await port()
  const modelPort=await port()
  const pbOrigin="http://127.0.0.1:"+pbPort
  const webOrigin="http://127.0.0.1:"+vitePort
  let backend
  let frontend
  let browser
  let provider
  const mockModelCalls=[]
  const smitheryTestKey="test-browser-smithery-"+randomBytes(12).toString("hex")
  let mockSmitheryAuthorized=false
  let browserModelSelection=""
  let pbLogs=""
  let viteLogs=""
  try {
    backend=spawnHeadlessPocketBase(pbBinary,[
      "serve","--http=127.0.0.1:"+pbPort,"--dir="+temp,
      "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
    ],{cwd:path.join(root,"pocketbase"),stdio:["ignore","pipe","pipe"],env:{
      AGENT_STUDIO_AUTH_MODE:"standalone",
      AGENT_STUDIO_ALLOW_ANON:"false",
      AGENT_STUDIO_BOOTSTRAP_SECRET:bootKey,
      AGENT_STUDIO_WORKER_TOKEN:workerKey,
      AGENT_STUDIO_SECRET_KEY:secret,
      AGENT_STUDIO_STRICT_SECRETS:"true",
      AGENT_STUDIO_BACKGROUND_WORKER:"true",
      AGENT_STUDIO_SMITHERY_ALLOW_LOOPBACK:"true",
      AGENT_STUDIO_SMITHERY_TEST_ORIGIN:"http://127.0.0.1:"+modelPort,
    }})
    backend.stdout.on("data",chunk=>pbLogs=(pbLogs+chunk).slice(-8000))
    backend.stderr.on("data",chunk=>pbLogs=(pbLogs+chunk).slice(-8000))
    await waitForHttp(pbOrigin+"/api/health",backend,()=>pbLogs)
    // All model-debug browser tests use a loopback mock, with no API spend.
    provider=createServer(async (req,res) => {
      let body=""
      for await (const part of req) body+=part.toString()
      let payload={}
      try {payload=JSON.parse(body||"{}")} catch {}
      const smitheryPath=String(req.url||"").split("?")[0]
      if (smitheryPath==="/servers"||smitheryPath==="/namespaces"||
          smitheryPath.startsWith("/connect/")||smitheryPath.startsWith("/studio-sandbox/")) {
        const bearer=req.headers.authorization
        const good=bearer==="Bearer "+smitheryTestKey
        const response=(status,payload)=>{
          res.writeHead(status,{"Content-Type":"application/json"})
          res.end(JSON.stringify(payload))
        }
        if(!good)return response(401,{error:"invalid_token"})
        if (smitheryPath==="/servers")return response(200,{
          servers:[{qualifiedName:"github",displayName:"GitHub",
            description:"Search GitHub repositories and manage issues",
            isVerified:true}],pagination:{totalPages:1,totalCount:1},
        })
        if (smitheryPath==="/namespaces")return response(200,{
          namespaces:[{name:"studio-sandbox"}],
        })
        if(req.method==="PUT"&&/^\/connect\/studio-sandbox\/[-_a-zA-Z0-9]+$/.test(smitheryPath))
          return response(201,{connectionId:smitheryPath.split("/").at(-1),
            status:{state:"auth_required",
              setupUrl:"https://auth.smithery.ai/authorize/mock"}})
        if(req.method==="GET"&&smitheryPath.endsWith("/.tools"))
          return response(200,{tools:mockSmitheryAuthorized?[{
            name:"github_search",description:"Search repositories",
            inputSchema:{type:"object",properties:{query:{type:"string"}}},
            annotations:{readOnlyHint:true},
          }]:[]})
        if(req.method==="GET"&&/^\/connect\/studio-sandbox\/[-_a-zA-Z0-9]+$/.test(smitheryPath))
          return response(200,{status:mockSmitheryAuthorized?{state:"connected"}:
            {state:"auth_required",setupUrl:"https://auth.smithery.ai/authorize/mock"}})
        return response(404,{error:"not_found"})
      }
      if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
        res.writeHead(404).end("not found")
        return
      }
      mockModelCalls.push({
        model:payload.model,max_tokens:payload.max_tokens,
        messages:payload.messages,
      })
      const promptText=JSON.stringify(payload.messages||[])
      const isAgentProposal=promptText.includes("助手方案设计器")
      const reply=isAgentProposal?JSON.stringify({
        name:"浏览器验收 Agent",
        goal:"对企业公开资料形成可核查的研究简报",
        task_scope:"仅公开和授权资料，不执行外部写操作",
        deliverables:["一份带来源引用的研究简报"],
        tools:["calculate"],
        task_plan:["收集公开事实","验证关键信息","撰写结论"],
        done_criteria:["事实来源可核查","内容完成结构化输出"],
      }):"node-debug-local-mock-success"
      res.writeHead(200,{"Content-Type":"application/json"})
      res.end(JSON.stringify({choices:[{
        message:{role:"assistant",content:reply},
      }]}))
    })
    await new Promise((resolve,reject)=>{
      provider.once("error",reject)
      provider.listen(modelPort,"127.0.0.1",resolve)
    })

    const browserPassword="Ui-"+randomBytes(18).toString("hex")+"!"
    const bootstrap=await fetch(pbOrigin+"/api/studio/bootstrap",{
      method:"POST",
      headers:{"Content-Type":"application/json","X-Agent-Studio-Setup-Key":bootKey},
      body:JSON.stringify({email:"uitest@example.test",password:browserPassword,
        display_name:"浏览器冒烟测试"}),
      signal:AbortSignal.timeout(7000),
    })
    assert.equal(bootstrap.status,201,"isolated test admin creation failed")
    const setup=await bootstrap.json()
    assert.ok(setup.user?.id)
    // One fresh, valid Studio JWT. Never reused and never logged.
    const loggedIn=await fetch(pbOrigin+"/api/collections/studio_users/auth-with-password",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({identity:"uitest@example.test",password:browserPassword}),
      signal:AbortSignal.timeout(7000),
    })
    assert.equal(loggedIn.status,200,"isolated employee login failed")
    const credentials=await loggedIn.json()
    assert.ok(credentials.token && credentials.record?.id)
    const restList=await fetch(pbOrigin+"/api/workflow-studio/list",{
      headers:{Authorization:credentials.token},signal:AbortSignal.timeout(7000),
    })
    assert.equal(restList.status,200,"valid Studio JWT could not list workflows via direct PocketBase API")
    const mockConnection=await fetch(pbOrigin+"/api/model-connections",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:credentials.token},
      body:JSON.stringify({
        name:"UI browser mock",provider:"openai",
        base_url:"http://127.0.0.1:"+modelPort+"/v1",
        api_key:"mock-browser-key-not-real",
        models:["mock-browser"],
      }),
      signal:AbortSignal.timeout(7000),
    })
    assert.equal(mockConnection.status,200,"could not create isolated browser model connection")
    const mockConn=await mockConnection.json()
    assert.ok(mockConn.item?.id)
    browserModelSelection="custom:"+mockConn.item.id+":mock-browser"
    const denied=await fetch(pbOrigin+"/api/studio/users",{
      method:"POST",headers:{"Content-Type":"application/json"},body:"{}",
    })
    assert.equal(denied.status,401,"anonymous company administration must be denied")

    frontend=spawn(process.execPath,[
      viteBin,"--config","vibex-local/vite.local.config.ts",
      "--host","127.0.0.1","--port",String(vitePort),"--strictPort",
    ],{cwd:root,windowsHide:true,env:{...process.env,
      AGENT_STUDIO_PB_ORIGIN:pbOrigin,
      VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED:"false",
    },stdio:["ignore","pipe","pipe"]})
    frontend.stdout.on("data",chunk=>viteLogs=(viteLogs+chunk).slice(-8000))
    frontend.stderr.on("data",chunk=>viteLogs=(viteLogs+chunk).slice(-8000))
    await waitForHttp(webOrigin+"/login",frontend,()=>viteLogs)

    browser=await launchChrome(chromeProfile)
    const {client,sessionId}=browser
    const command=(method,params)=>client.command(method,params,sessionId)
    const evaluate=async expression=>{
      const res=await command("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})
      if(res.exceptionDetails)throw new Error("Browser script failed: "+
        String(res.exceptionDetails.text||"unknown").slice(0,240))
      return res.result?.value
    }
    const waitFor=async (expression,reason)=>{
      let lastError=null
      for(let tries=0;tries<160;tries++){
        try{if(await evaluate(expression))return}
        catch(error){lastError=error}
        await sleep(150)
      }
      throw new Error("UI element not ready: "+reason+
        (lastError ? " (browser exception: "+String(lastError.message).slice(0,130)+")" : ""))
    }

    // Test-only network metadata. Do not record auth values or request bodies.
    await command("Page.addScriptToEvaluateOnNewDocument",{source:`
      (() => {
        const nativeFetch = window.fetch.bind(window)
        const recent=[]
        window.__workflowUiRequestStatuses = recent
        window.fetch = async (...args) => {
          const url = String(typeof args[0] === "string" ? args[0] : args[0]?.url || "")
          const requestHeaders=new Headers(args[1]?.headers || (args[0] instanceof Request ? args[0].headers : undefined))
          const authPresent=requestHeaders.has("Authorization")
          const method=String(args[1]?.method || (args[0] instanceof Request ? args[0].method : "GET"))
          try {
            const response = await nativeFetch(...args)
            if (url.includes("/__pb/")) {
              const pathname = new URL(url,location.origin).pathname
              recent.push({method,path:pathname,status:response.status,authPresent})
              if (recent.length > 36)recent.shift()
            }
            return response
          } catch(error) {
            if(url.includes("/__pb/")){
              recent.push({path:new URL(url,location.origin).pathname,status:"network_error",authPresent})
              if(recent.length > 36)recent.shift()
            }
            throw error
          }
        }
      })()`
    })
    // Exercise the ACTUAL company login UI with real keyboard input rather
    // than writing PocketBase authStore internals to localStorage.
    await command("Page.navigate",{url:webOrigin+"/login?next=%2Fworkflow-canvas"})
    await waitFor('document.querySelector("input[type=email]") !== null',"login form")
    await waitFor('document.querySelector("button[type=submit]")?.disabled === false',"account login ready")
    await evaluate('document.querySelector("input[type=email]").focus()')
    await command("Input.insertText",{text:"uitest@example.test"})
    await evaluate('document.querySelector("input[type=password]").focus()')
    await command("Input.insertText",{text:browserPassword})
    assert.equal(await evaluate('document.querySelector("input[type=email]").value'),"uitest@example.test")
    assert.equal(await evaluate('document.querySelector("input[type=password]").value.length'),browserPassword.length)
    await evaluate('document.querySelector("button[type=submit]").click()')
    try {
      await waitFor('document.querySelectorAll(".react-flow__node").length >= 1',"authenticated editor")
    } catch (error) {
      const diagnostic=await evaluate(`(async () => {
        const stored=localStorage.getItem("agent_studio_employee_auth")||""
        let payload=null
        try{payload=JSON.parse(stored)}catch{}
        const headers=payload?.token ? {Authorization:payload.token} : {}
        const routes=["/__pb/api/studio/me","/__pb/api/workflow-studio/list"]
        const responses=await Promise.all(routes.map(async route=>{
          try{
            const r=await fetch(route,{headers})
            return {route,status:r.status}
          }catch{return {route,status:"network_failure"}}
        }))
        return {
          route:location.pathname,
          title:document.title,
          body:String(document.body?.innerText||"").slice(0,450),
          localAuthPresent:!!stored,
          localAuthBytes:stored.length,
          active:payload?.record?.active===true,
          tokenPresent:!!payload?.token,
          responses,
          networkStatuses:window.__workflowUiRequestStatuses||[],
        }
      })()`).catch(()=>({error:"unable_to_read_document"}))
      console.error("BROWSER_UI_SAFE_DIAGNOSTIC",JSON.stringify(diagnostic))
      throw error
    }
    if(process.env.STUDIO_CHROME_NAV_ONLY==="1"){
      await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true})
      await command("Page.navigate",{url:webOrigin+"/agent-create"})
      await waitFor('document.querySelector("#agent-requirement")!==null',"standalone navigation input")
      const nav=(href)=>`(() => {
        const a=document.querySelector('nav[aria-label="移动端主要工作空间"] a[href="${href}"]')
        if(!a)return false
        a.click()
        return true
      })()`
      assert.ok(await evaluate(nav("/model-connections")))
      await waitFor('location.pathname==="/model-connections"',"navigation route model")
      await waitFor('document.querySelector(\'nav[aria-label="移动端主要工作空间"] a[href="/agent-create"]\')!==null',
        "model layout sidebar navigation ready")
      assert.ok(await evaluate(nav("/agent-create")))
      await waitFor('location.pathname==="/agent-create"',"navigation route wizard")
      await waitFor('document.querySelector("#agent-requirement")!==null',"requirement available")
      await evaluate('document.querySelector("#agent-requirement").focus()')
      await command("Input.insertText",{text:"导航历史保护测试"})
      await waitFor('document.querySelector("#agent-requirement")?.value==="导航历史保护测试"',
        "input persisted in focus smoke")
      const before=await evaluate('({path:location.pathname,history:history.state,len:history.length})')
      let dialogs=0
      client.onDialog=()=>{dialogs++;void command("Page.handleJavaScriptDialog",{accept:false})}
      const sidebar=await evaluate(nav("/"))
      await sleep(180)
      const cancelledClick=await evaluate('({path:location.pathname,history:history.state,len:history.length})')
      await evaluate("history.back()")
      await sleep(850)
      const after=await evaluate('({path:location.pathname,history:history.state,len:history.length,input:document.querySelector("#agent-requirement")?.value||"",content:document.body.textContent?.slice(0,180)})')
      console.log("FOCUSED_BROWSER_HISTORY_DIAGNOSTIC",JSON.stringify({before,sidebar,cancelledClick,dialogs,after}))
      assert.equal(after.path,"/agent-create","browser Back cancel should return to editor route")
      assert.equal(dialogs,2)
      assert.equal(after.input,"导航历史保护测试")
      client.onDialog=()=>{
        dialogs++
        void command("Page.handleJavaScriptDialog",{accept:true})
      }
      await evaluate("history.back()")
      await waitFor('location.pathname==="/model-connections"',
        "accepted Back should navigate away")
      await waitFor(`Object.keys(sessionStorage).some(k=>k.includes("agent-draft:v1:"))`,
        "accepted navigation preserves in-tab draft")
      await evaluate("history.forward()")
      await waitFor('location.pathname==="/agent-create"',
        "accepted Forward returns to draft editor route")
      await waitFor(`document.querySelector('[role="dialog"][aria-label="恢复未保存的 Agent 草稿"]')!==null`,
        "returning to editor offers recovery")
      assert.ok(await evaluate(`(() => {
        const button=[...document.querySelectorAll('[role="dialog"] button')]
          .find(b=>b.textContent?.trim()==="恢复草稿")
        if(!button)return false
        button.click()
        return true
      })()`))
      await waitFor('document.querySelector("#agent-requirement")?.value==="导航历史保护测试"',
        "restored draft matches the original input")
      assert.ok(await evaluate(nav("/")))
      await waitFor('location.pathname==="/"',"accept sidebar leave")
      await evaluate("history.back()")
      await waitFor('location.pathname==="/agent-create"',
        "return to previously opened editor")
      await waitFor(`document.querySelector('[role="dialog"][aria-label="恢复未保存的 Agent 草稿"]')!==null`,
        "draft can be recovered after accepted sidebar leave")
      assert.ok(await evaluate(`(() => {
        const button=[...document.querySelectorAll('[role="dialog"] button')]
          .find(b=>b.textContent?.trim()==="恢复草稿")
        if(!button)return false
        button.click()
        return true
      })()`))
      await waitFor('document.querySelector("#agent-requirement")?.value==="导航历史保护测试"',
        "restore draft before forward guard")
      client.onDialog=()=>{
        dialogs++
        void command("Page.handleJavaScriptDialog",{accept:false})
      }
      await evaluate("history.forward()")
      await waitFor('location.pathname==="/agent-create"',
        "cancelled Forward restores editor URL")
      await sleep(320)
      assert.equal(await evaluate("location.pathname"),"/agent-create")
      assert.equal(await evaluate('document.querySelector("#agent-requirement")?.value'),
        "导航历史保护测试")
      console.log("CHROME_STUDIO_NAV_HISTORY_PASS",
        JSON.stringify({backCancel:true,backAccept:true,forwardAccept:true,
          forwardCancel:true,restoredDraft:true,dialogs}))
      // Workflow dirty graph must use the same Back guard as the Agent
      // requirement editor; cancelling keeps all graph nodes and edges.
      await evaluate('document.querySelector("#agent-requirement").focus()')
      await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"a",code:"KeyA",
        windowsVirtualKeyCode:65,modifiers:2})
      await command("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",
        windowsVirtualKeyCode:65})
      await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Backspace",
        code:"Backspace",windowsVirtualKeyCode:8})
      await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Backspace",
        code:"Backspace",windowsVirtualKeyCode:8})
      await waitFor('document.querySelector("#agent-requirement")?.value===""',
        "requirement cleared before workflow navigation")
      client.onDialog=()=>{
        dialogs++
        void command("Page.handleJavaScriptDialog",{accept:true})
      }
      await evaluate('document.querySelector(\'button[aria-label="打开全部导航"]\').click()')
      await waitFor(`document.querySelector('[role="dialog"][aria-label="全部工作空间与功能"]')!==null`,
        "mobile navigation drawer visible")
      assert.ok(await evaluate(`(() => {
        const target=document.querySelector(
          '[role="dialog"][aria-label="全部工作空间与功能"] a[href="/workflow-canvas"]')
        if(!target)return false
        target.click()
        return true
      })()`))
      await waitFor('location.pathname==="/workflow-canvas"',
        "navigate to workflow from menu")
      await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent?.trim()==="基础问答")',
        "workflow sample editor available")
      assert.ok(await evaluate(`(() => {
        const action=[...document.querySelectorAll("button")]
          .find(b=>b.textContent?.trim()==="基础问答")
        if(!action)return false
        action.click()
        return true
      })()`))
      await waitFor('document.querySelectorAll(".react-flow__node").length===3',
        "unsaved sample workflow created")
      await waitFor('document.body.textContent?.includes("未保存更改")',
        "workflow unsaved state displayed")
      let workflowCancelled=0
      client.onDialog=()=>{
        workflowCancelled++
        void command("Page.handleJavaScriptDialog",{accept:false})
      }
      await evaluate("history.back()")
      await sleep(550)
      assert.equal(await evaluate("location.pathname"),"/workflow-canvas",
        "rejected Back must keep Workflow route")
      assert.equal(await evaluate('document.querySelectorAll(".react-flow__node").length'),3,
        "rejected Back must keep unsaved Workflow graph")
      assert.equal(workflowCancelled,1,"Workflow Back should prompt once")
      console.log("CHROME_WORKFLOW_HISTORY_GUARD_PASS",
        JSON.stringify({blockedBack:true,unsavedNodesRetained:3,dialogCount:workflowCancelled}))
      return
    }
    await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent?.trim()==="基础问答")',"blank graph example")
    assert.equal(await evaluate('document.querySelectorAll(".react-flow__node").length'),1)
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="基础问答")
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await waitFor('document.querySelectorAll(".react-flow__node").length === 3',"sample nodes created")
    assert.equal(await evaluate('document.querySelector(".react-flow__minimap")===null'),true,
      "mini-map should not consume resources before user requests it")
    assert.equal(await evaluate(`(() => {
      const button=document.querySelector('button[aria-label="显示画布缩略图"]')
      if(!button)return false
      button.click()
      return true
    })()`),true)
    await waitFor('document.querySelector(".react-flow__minimap")!==null',
      "on-demand mini-map opens")
    assert.equal(await evaluate(`(() => {
      const button=document.querySelector('button[aria-label="隐藏画布缩略图"]')
      if(!button)return false
      button.click()
      return true
    })()`),true)
    await waitFor('document.querySelector(".react-flow__minimap")===null',
      "mini-map hides and releases extra rendering")
    console.log("CHROME_WORKFLOW_MINIMAP_ONDEMAND_PASS",
      JSON.stringify({defaultHidden:true,toggleOpen:true,toggleClose:true}))
    const authAudit=await evaluate(`(() => {
      const calls=window.__workflowUiRequestStatuses || []
      return {
        unauthorized:calls.filter(x=>x.status===401 &&
          x.path.startsWith("/__pb/api/")).map(x=>x.path),
        refreshCancelled:calls.filter(x=>x.status==="network_error" &&
          x.path.includes("/auth-refresh")).length,
      }
    })()`)
    assert.deepEqual(authAudit.unauthorized,[],
      "valid employee session must not make unauthorized workflow API calls")
    assert.equal(authAudit.refreshCancelled,0,
      "coalesced auth refresh must not cancel valid session verification")

    // Shift+drag marquee should select graph cards, not pan the canvas.
    // Keep this distinct from the Shift+click multiselection test below.
    await evaluate(`document.querySelector('button[title="适应画布"]').click()`)
    await sleep(520)
    const marquee=await evaluate(`(() => {
      const pane=document.querySelector(".react-flow__pane")
      const nodes=[...document.querySelectorAll(".react-flow__node")]
      if(!pane||nodes.length!==3)return null
      const p=pane.getBoundingClientRect(),rs=nodes.map(n=>n.getBoundingClientRect())
      const left=Math.min(...rs.map(r=>r.left)), top=Math.min(...rs.map(r=>r.top))
      const right=Math.max(...rs.map(r=>r.right)), bottom=Math.max(...rs.map(r=>r.bottom))
      const from={x:Math.round(Math.max(p.left+8,left-16)),
        y:Math.round(Math.max(p.top+8,top-16))}
      const to={x:Math.round(Math.min(p.right-8,right+16)),
        y:Math.round(Math.min(p.bottom-8,bottom+16))}
      return {from,to,width:p.width,
        startTarget:document.elementFromPoint(from.x,from.y)?.className?.baseVal
          ||String(document.elementFromPoint(from.x,from.y)?.className||"")}
    })()`)
    assert.ok(marquee?.from&&marquee?.to,"marquee source/target unavailable")
    assert.ok(marquee.to.x-marquee.from.x>60 && marquee.to.y-marquee.from.y>30,
      "marquee bounds insufficient: "+JSON.stringify(marquee))
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Shift",
      code:"ShiftLeft",windowsVirtualKeyCode:16,nativeVirtualKeyCode:16,modifiers:8})
    await command("Input.dispatchMouseEvent",{type:"mouseMoved",
      x:marquee.from.x,y:marquee.from.y,modifiers:8})
    await command("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,
      x:marquee.from.x,y:marquee.from.y,modifiers:8})
    for(let step=1;step<=10;step++){
      const ratio=step/10
      await command("Input.dispatchMouseEvent",{type:"mouseMoved",button:"left",buttons:1,
        x:Math.round(marquee.from.x+(marquee.to.x-marquee.from.x)*ratio),
        y:Math.round(marquee.from.y+(marquee.to.y-marquee.from.y)*ratio),modifiers:8})
      await sleep(13)
    }
    await command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",
      x:marquee.to.x,y:marquee.to.y,modifiers:8})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Shift",
      code:"ShiftLeft",windowsVirtualKeyCode:16,nativeVirtualKeyCode:16})
    await sleep(240)
    const marqueeCount=await evaluate(
      'document.querySelectorAll(".react-flow__node.selected").length')
    console.log("CHROME_WORKFLOW_MARQUEE_DIAGNOSTIC",
      JSON.stringify({selected:marqueeCount,...marquee}))
    assert.ok(marqueeCount>=2,
      "Shift+drag marquee should select multiple nodes, not pan the graph")

    const selected=await evaluate(`(() => {
      const n=[...document.querySelectorAll(".react-flow__node")].find(x=>x.textContent?.includes("生成回答"))
      if(!n)return false
      n.dispatchEvent(new MouseEvent("dblclick",{bubbles:true,cancelable:true,view:window}))
      return true
    })()`)
    assert.equal(selected,true)
    await waitFor('document.querySelector("[data-workflow-node-preview]") !== null',"node sandbox attached")
    const opened=await evaluate(`(() => {
      const d=document.querySelector("[data-workflow-node-preview]")
      if(!d)return false
      d.open=true
      return !!d.querySelector("textarea")
    })()`)
    assert.ok(opened)
    assert.ok((await evaluate('document.body.textContent')).includes("节点沙盒"))
    const defaultModelDebug = await evaluate(`(() => {
      const panel=document.querySelector('[data-workflow-node-preview]')
      if(!panel)return null
      const button=[...panel.querySelectorAll("button")]
        .find(b=>b.textContent?.includes("确认费用并试运行当前模型"))
      return {present:!!button,disabled:button?.disabled===true,
        label:button?.textContent?.trim()||""}
    })()`)
    assert.ok(defaultModelDebug?.present,"real model debug requires an explicit visible action")
    assert.equal(defaultModelDebug.disabled,true,
      "an unconfigured model node must not allow charge-bearing calls")
    assert.equal(await evaluate(`(window.__workflowUiRequestStatuses||[])
      .filter(x=>x.path.includes("/api/llm/chat")).length`),0,
      "opening the sandbox must never send a paid model request")
    // Verify a real Chrome keystroke updates the React-controlled sandbox input.
    await evaluate('document.querySelector("[data-workflow-node-preview] textarea").focus()')
    await command("Input.insertText",{text:"浏览器沙盒任务"})
    await waitFor('document.querySelector("[data-workflow-node-preview]")?.textContent?.includes("浏览器沙盒任务")',
      "node preview input rendering")

    // Real UI model-node debug against an isolated loopback mock provider.
    // This is not a paid API call. The employee explicitly chooses an owned
    // model and approves the browser confirmation dialog.
    const modelSelected=await evaluate(`(() => {
      const select=document.querySelector("#wf-model-select")
      const wanted=${JSON.stringify(browserModelSelection)}
      if(!select || ![...select.options].some(option=>option.value===wanted))return false
      select.value=wanted
      select.dispatchEvent(new Event("change",{bubbles:true}))
      return select.value===wanted
    })()`)
    assert.ok(modelSelected,"isolated authorized model not available in node picker")
    await waitFor(`(() => {
      const b=[...document.querySelectorAll('[data-workflow-node-preview] button')]
        .find(x=>x.textContent?.includes("确认费用并试运行当前模型"))
      return !!b && !b.disabled
    })()`,"authorized model node live-test enabled")
    let debugConfirmations=0
    client.onDialog=()=>{
      debugConfirmations++
      void command("Page.handleJavaScriptDialog",{accept:true})
    }
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll('[data-workflow-node-preview] button')]
        .find(x=>x.textContent?.includes("确认费用并试运行当前模型"))
      if(!b||b.disabled)return false
      b.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('[data-workflow-node-preview]')
      ?.textContent?.includes("node-debug-local-mock-success")`,
      "approved model single-node debug result")
    client.onDialog=null
    assert.equal(debugConfirmations,1,"live model debugging must require explicit cost confirmation")
    assert.equal(mockModelCalls.length,1,"one debug click must issue only one provider call")
    assert.equal(mockModelCalls[0].model,"mock-browser")
    assert.equal(mockModelCalls[0].max_tokens,512)
    assert.equal(mockModelCalls[0].messages[0].content.includes("浏览器沙盒任务"),true)
    const debugQueries=await evaluate(`(window.__workflowUiRequestStatuses||[])
      .filter(x=>x.path.endsWith("/api/llm/chat")).length`)
    assert.equal(debugQueries,1)
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll('[data-workflow-node-preview] button')]
        .find(x=>x.textContent?.includes("查询本次结果"))
      if(!b||b.disabled)return false
      b.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('[data-workflow-node-preview]')
      ?.textContent?.includes("结果来自后端模型任务账本")`,
      "model-job status polling")
    assert.equal(mockModelCalls.length,1,"poll must not re-invoke model")
    console.log("CHROME_WORKFLOW_MODEL_DEBUG_PASS",
      JSON.stringify({chargedCalls:0,mockedProviderCalls:1,confirmations:1,
        strictModel:true,pollNoDuplicate:true}))

    // Native Chromium mouse event delivered to the actual ReactFlow pane.
    assert.equal(await evaluate(`(() => {
      const pane=document.querySelector(".react-flow__pane")
      if(!pane)return false
      const r=pane.getBoundingClientRect()
      pane.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,detail:2,
        clientX:r.left+20,clientY:r.top+30,view:window}))
      return true
    })()`),true)
    await waitFor('document.querySelector("[role=menu][aria-label=添加节点]") !== null',"double-click node picker")
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll("[role=menu] button")].find(x=>x.textContent?.trim()==="工具")
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await waitFor('document.querySelectorAll(".react-flow__node").length === 4',"quick add node")
    // One undo should revert the quick-add transaction; redo restores it.
    assert.equal(await evaluate(`(() => {
      const button=document.querySelector('button[title^="撤销"]')
      if(!button || button.disabled) return false
      button.click()
      return true
    })()`),true)
    await waitFor('document.querySelectorAll(".react-flow__node").length === 3',"undo quick add")
    assert.equal(await evaluate(`(() => {
      const button=document.querySelector('button[title^="重做"]')
      if(!button || button.disabled) return false
      button.click()
      return true
    })()`),true)
    await waitFor('document.querySelectorAll(".react-flow__node").length === 4',"redo quick add")


    // Refit the canvas after quick-add before testing a real drag; a handle
    // outside the visible pane cannot receive a physical mouse press.
    assert.equal(await evaluate(`(() => {
      const b=document.querySelector('button[title="适应画布"]')
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await sleep(680)
    // Real CDP pointer drag from a rendered source Handle into empty canvas.
    // This covers ReactFlow's native connection lifecycle, not just the
    // insertConnectedNode() unit tests.
    const dragGeometry=await evaluate(`(() => {
      const source=[...document.querySelectorAll(".react-flow__node")]
        .find(n=>n.textContent?.includes("生成回答"))
        ?.querySelector(".react-flow__handle.source")
      const pane=document.querySelector(".react-flow__pane")
      if(!source || !pane) return null
      const a=source.getBoundingClientRect(), p=pane.getBoundingClientRect()
      const from={x:Math.round(a.left+a.width/2),y:Math.round(a.top+a.height/2)}
      const nodes=[...document.querySelectorAll(".react-flow__node")]
      const options=[]
      for(let x=Math.floor(p.left)+40;x<Math.floor(p.right)-45;x+=48){
        for(let y=Math.floor(p.top)+95;y<Math.floor(p.bottom)-54;y+=45){
          if(Math.hypot(x-from.x,y-from.y)<110) continue
          const el=document.elementFromPoint(x,y)
          if(!el?.classList?.contains("react-flow__pane")) continue
          if(nodes.some(n=>{
            const r=n.getBoundingClientRect()
            return x>r.left-25&&x<r.right+25&&y>r.top-25&&y<r.bottom+25
          })) continue
          options.push({x,y,score:Math.hypot(x-from.x,y-from.y)})
        }
      }
      options.sort((a,b)=>b.score-a.score)
      return {from,to:options[0]||null,srcId:source.closest(".react-flow__node")?.getAttribute("data-id")||"",
        sourceVisible:from.x>8 && from.y>8 && from.x<window.innerWidth-8 && from.y<window.innerHeight-8,
        width:window.innerWidth}
    })()`)
    assert.ok(dragGeometry?.from && dragGeometry?.to && dragGeometry.sourceVisible,
      "native drag source is offscreen or no empty drop point: "+JSON.stringify(dragGeometry))
    await command("Input.dispatchMouseEvent",{type:"mouseMoved",
      x:dragGeometry.from.x,y:dragGeometry.from.y})
    await command("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,
      x:dragGeometry.from.x,y:dragGeometry.from.y})
    for(let step=1;step<=12;step++){
      const t=step/12
      await command("Input.dispatchMouseEvent",{type:"mouseMoved",button:"left",buttons:1,
        x:Math.round(dragGeometry.from.x+(dragGeometry.to.x-dragGeometry.from.x)*t),
        y:Math.round(dragGeometry.from.y+(dragGeometry.to.y-dragGeometry.from.y)*t)})
      await sleep(13)
    }
    await command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",
      x:dragGeometry.to.x,y:dragGeometry.to.y})
    try {
      await waitFor(`document.querySelector('[role="menu"][aria-label="添加节点"]')
        ?.textContent?.includes("创建并连接节点")`,"drag-to-empty picker")
    } catch (error) {
      console.error("DRAG_UI_SAFE_DIAGNOSTIC",JSON.stringify({
        from:dragGeometry.from,to:dragGeometry.to,
        nodeCount:await evaluate('document.querySelectorAll(".react-flow__node").length'),
        menuText:await evaluate('document.querySelector("[role=menu]")?.textContent?.slice(0,100) || ""'),
      }))
      throw error
    }
    const nodeIdsBeforeConnect=await evaluate(
      '[...document.querySelectorAll(".react-flow__node")].map(n=>n.getAttribute("data-id"))')
    const countBeforeConnect=await evaluate('document.querySelectorAll(".react-flow__edge").length')
    assert.equal(await evaluate(`(() => {
      const button=[...document.querySelectorAll('[role="menu"][aria-label="添加节点"] button')]
        .find(x=>x.textContent?.trim()==="模型")
      if(!button)return false
      button.click()
      return true
    })()`),true,"drag picker model option should exist")
    await waitFor('document.querySelectorAll(".react-flow__node").length === 5',"atomic drag-created node")
    await waitFor('document.querySelectorAll(".react-flow__edge").length === '+(countBeforeConnect+1),
      "atomic drag-created edge")
    const dragConnected=await evaluate(`(() => {
      const prior=new Set(${JSON.stringify(nodeIdsBeforeConnect)})
      const nodes=[...document.querySelectorAll(".react-flow__node")]
      const created=nodes.find(n=>!prior.has(n.getAttribute("data-id")))
      return {nodeId:created?.getAttribute("data-id")||"",
        totalNodes:nodes.length,edges:document.querySelectorAll(".react-flow__edge").length}
    })()`)
    assert.ok(dragConnected.nodeId,"drag-created node ID not identified")

    // Nodes/edges must be one undo record: no half-connected draft.
    await evaluate(`document.querySelector('button[title^="撤销"]').click()`)
    await waitFor('document.querySelectorAll(".react-flow__node").length === 4',
      "undo connected node and edge atomically")
    await waitFor('document.querySelectorAll(".react-flow__edge").length === '+countBeforeConnect,
      "undo edge atomically")
    await evaluate(`document.querySelector('button[title^="重做"]').click()`)
    await waitFor('document.querySelectorAll(".react-flow__node").length === 5',
      "redo connected node and edge atomically")
    await waitFor('document.querySelectorAll(".react-flow__edge").length === '+(countBeforeConnect+1),
      "redo edge atomically")
    console.log("CHROME_WORKFLOW_DRAG_CONNECTED_PASS",
      JSON.stringify({nodes:5,edges:countBeforeConnect+1,undoRedoAtomic:true}))
    // Workflow editing shares the unsaved-route guard with Agent creation.
    // A rejected workspace switch must preserve every node and connection.
    const originalWorkflowDialog=client.onDialog
    let workflowNavigationRejects=0
    client.onDialog=()=>{
      workflowNavigationRejects++
      void command("Page.handleJavaScriptDialog",{accept:false})
    }
    assert.equal(await evaluate(`(() => {
      const a=document.querySelector('aside[aria-label="Agent Studio 主导航"] a[href="/"]')
      if(!a)return false
      a.click()
      return true
    })()`),true)
    await sleep(145)
    assert.equal(await evaluate("location.pathname"),"/workflow-canvas",
      "cancelled navigation must keep the Workflow editor open")
    assert.equal(workflowNavigationRejects,1,
      "unsaved Workflow must request confirmation once")
    assert.equal(await evaluate('document.querySelectorAll(".react-flow__node").length'),5)
    assert.equal(await evaluate('document.querySelectorAll(".react-flow__edge").length'),countBeforeConnect+1)
    client.onDialog=originalWorkflowDialog
    console.log("CHROME_WORKFLOW_UNSAVED_NAV_PASS",
      JSON.stringify({cancelled:true,nodesRetained:5}))

    // Right-click copy and pane paste are exercised through native Chromium
    // mouse events. Clipboard is in-memory only (no system clipboard access).
    await evaluate(`document.querySelector('button[title="适应画布"]').click()`)
    await sleep(520)
    const copyRect=await evaluate(`(() => {
      const node=[...document.querySelectorAll(".react-flow__node")].find(n=>n.getAttribute("data-id")===${JSON.stringify(dragConnected.nodeId)})
      if(!node)return null
      const r=node.getBoundingClientRect()
      return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}
    })()`)
    assert.ok(copyRect?.x>0 && copyRect?.x<1440,"copied node must be on screen")
    await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:copyRect.x,y:copyRect.y})
    await command("Input.dispatchMouseEvent",{type:"mousePressed",button:"right",clickCount:1,
      x:copyRect.x,y:copyRect.y})
    await command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"right",
      x:copyRect.x,y:copyRect.y})
    await waitFor(`document.querySelector('[role="menu"][aria-label="画布操作"]')
      ?.textContent?.includes("复制节点")`,"node context menu")
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll('[role="menu"] button')]
        .find(x=>x.textContent?.trim()==="复制节点")
      if(!b)return false
      b.click()
      return true
    })()`),true)
    const pasteXY=await evaluate(`(() => {
      const pane=document.querySelector(".react-flow__pane")
      if(!pane)return null
      const r=pane.getBoundingClientRect()
      const nodes=[...document.querySelectorAll(".react-flow__node")]
      for(let x=Math.floor(r.left)+40;x<r.right-35;x+=41){
        for(let y=Math.floor(r.top)+80;y<r.bottom-45;y+=37){
          if(!document.elementFromPoint(x,y)?.classList.contains("react-flow__pane"))continue
          if(nodes.some(n=>{
            const nr=n.getBoundingClientRect()
            return x>nr.left-20&&x<nr.right+20&&y>nr.top-20&&y<nr.bottom+20
          }))continue
          return {x,y}
        }
      }
      return null
    })()`)
    assert.ok(pasteXY,"a blank canvas location must exist for paste")
    await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:pasteXY.x,y:pasteXY.y})
    await command("Input.dispatchMouseEvent",{type:"mousePressed",button:"right",clickCount:1,
      x:pasteXY.x,y:pasteXY.y})
    await command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"right",
      x:pasteXY.x,y:pasteXY.y})
    await waitFor(`document.querySelector('[role="menu"][aria-label="画布操作"]')
      ?.textContent?.includes("粘贴到此处")`,"pane paste menu")
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll('[role="menu"] button')]
        .find(x=>x.textContent?.trim()==="粘贴到此处")
      if(!b || b.disabled)return false
      b.click()
      return true
    })()`),true)
    await waitFor('document.querySelectorAll(".react-flow__node").length === 6',
      "right-click paste creates a unique node")
    const copiedIds=await evaluate(
      '[...document.querySelectorAll(".react-flow__node")].map(n=>n.getAttribute("data-id"))')
    assert.equal(new Set(copiedIds).size,6,"pasted node IDs must be unique")
    await evaluate(`document.querySelector('button[title^="撤销"]').click()`)
    await waitFor('document.querySelectorAll(".react-flow__node").length === 5',
      "paste undo restores original node set")
    console.log("CHROME_WORKFLOW_CONTEXT_COPY_PASS",
      JSON.stringify({copied:1,pasted:1,uniqueIds:true,undoRestored:true}))

    // Conditional branches: actual Chrome drags from the separate true/false
    // source handles. The editor must accept exactly one connection per port.
    const idsBeforeBranch=await evaluate(
      '[...document.querySelectorAll(".react-flow__node")].map(n=>n.getAttribute("data-id"))')
    assert.equal(await evaluate(`(() => {
      const b=document.querySelector('button[title="添加节点"]')
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('[role="menu"][aria-label="添加节点"]')
      ?.textContent?.includes("条件分支")`,"condition quick-add picker")
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll('[role="menu"] button')]
        .find(x=>x.textContent?.trim()==="条件分支")
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await waitFor('document.querySelectorAll(".react-flow__node").length === 6',
      "condition node added")
    const conditionId=await evaluate(`(() => {
      const prior=new Set(${JSON.stringify(idsBeforeBranch)})
      const n=[...document.querySelectorAll(".react-flow__node")]
        .find(x=>!prior.has(x.getAttribute("data-id")))
      return n?.getAttribute("data-id")||""
    })()`)
    assert.ok(conditionId,"new condition node ID missing")
    const dragFromPort=async (sourceId,port)=>{
      await evaluate(`document.querySelector('button[title="适应画布"]').click()`)
      await sleep(500)
      const geometry=await evaluate(`(() => {
        const source=[...document.querySelectorAll(".react-flow__node")]
          .find(n=>n.getAttribute("data-id")===${JSON.stringify(sourceId)})
        const handle=source?.querySelector('.react-flow__handle.source[data-handleid="${port}"]')
        const pane=document.querySelector(".react-flow__pane")
        if(!handle||!pane)return null
        const h=handle.getBoundingClientRect(),p=pane.getBoundingClientRect()
        const from={x:Math.round(h.left+h.width/2),y:Math.round(h.top+h.height/2)}
        const nodes=[...document.querySelectorAll(".react-flow__node")]
        const options=[]
        for(let x=Math.floor(p.left)+30;x<p.right-40;x+=42){
          for(let y=Math.floor(p.top)+95;y<p.bottom-45;y+=39){
            if(Math.hypot(x-from.x,y-from.y)<100)continue
            if(!document.elementFromPoint(x,y)?.classList.contains("react-flow__pane"))continue
            if(nodes.some(n=>{
              const r=n.getBoundingClientRect()
              return x>r.left-20&&x<r.right+20&&y>r.top-20&&y<r.bottom+20
            }))continue
            options.push({x,y,score:Math.hypot(x-from.x,y-from.y)})
          }
        }
        options.sort((a,b)=>b.score-a.score)
        return {from,to:options[0]||null}
      })()`)
      assert.ok(geometry?.from && geometry?.to &&
        geometry.from.x>0 && geometry.from.x<1440,port+" source handle offscreen")
      const x1=geometry.from.x,y1=geometry.from.y
      const x2=geometry.to.x,y2=geometry.to.y
      await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:x1,y:y1})
      await command("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,x:x1,y:y1})
      for(let step=1;step<=12;step++){
        const t=step/12
        await command("Input.dispatchMouseEvent",{type:"mouseMoved",button:"left",buttons:1,
          x:Math.round(x1+(x2-x1)*t),y:Math.round(y1+(y2-y1)*t)})
        await sleep(12)
      }
      await command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",x:x2,y:y2})
      await waitFor(`document.querySelector('[role="menu"][aria-label="添加节点"]')
        ?.textContent?.includes("创建并连接节点")`,port+" branch picker")
      const nodeCountBefore=await evaluate('document.querySelectorAll(".react-flow__node").length')
      const nodesBefore=await evaluate(
        '[...document.querySelectorAll(".react-flow__node")].map(n=>n.getAttribute("data-id"))')
      const edgeCountBefore=await evaluate('document.querySelectorAll(".react-flow__edge").length')
      assert.equal(await evaluate(`(() => {
        const b=[...document.querySelectorAll('[role="menu"] button')]
          .find(x=>x.textContent?.trim()==="模型")
        if(!b)return false
        b.click()
        return true
      })()`),true)
      await waitFor("document.querySelectorAll('.react-flow__node').length === "+(nodeCountBefore+1),
        port+" created new node")
      await waitFor("document.querySelectorAll('.react-flow__edge').length === "+(edgeCountBefore+1),
        port+" created new connection")
      return await evaluate(`(() => {
        const existing=new Set(${JSON.stringify(nodesBefore)})
        return [...document.querySelectorAll(".react-flow__node")]
          .find(n=>!existing.has(n.getAttribute("data-id")))?.getAttribute("data-id")||""
      })()`)
    }
    await dragFromPort(conditionId,"true")
    await dragFromPort(conditionId,"false")
    assert.equal(await evaluate('document.querySelectorAll(".react-flow__node").length'),8)
    assert.equal(await evaluate('document.querySelectorAll(".react-flow__edge").length'),5)
    console.log("CHROME_WORKFLOW_CONDITION_HANDLES_PASS",
      JSON.stringify({trueConnected:true,falseConnected:true,nodes:8,edges:5}))

    // Loop handles have distinct meanings: body is the repeat subgraph, done
    // continues after the loop. Exercise both through actual CDP mouse drags.
    const idsBeforeLoop=await evaluate(
      '[...document.querySelectorAll(".react-flow__node")].map(n=>n.getAttribute("data-id"))')
    assert.equal(await evaluate(`(() => {
      const b=document.querySelector('button[title="添加节点"]')
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('[role="menu"][aria-label="添加节点"]')
      ?.textContent?.includes("循环")`,"loop node type picker")
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll('[role="menu"] button')]
        .find(x=>x.textContent?.trim()==="循环")
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await waitFor('document.querySelectorAll(".react-flow__node").length === 9',
      "loop node created")
    const loopId=await evaluate(`(() => {
      const prior=new Set(${JSON.stringify(idsBeforeLoop)})
      return [...document.querySelectorAll(".react-flow__node")]
        .find(n=>!prior.has(n.getAttribute("data-id")))?.getAttribute("data-id")||""
    })()`)
    assert.ok(loopId,"loop node ID missing")
    const loopBodyId=await dragFromPort(loopId,"body")
    const loopDoneId=await dragFromPort(loopId,"done")
    assert.ok(loopBodyId&&loopDoneId&&loopBodyId!==loopDoneId)
    const loopCounts=await evaluate(`({
      nodes:document.querySelectorAll(".react-flow__node").length,
      edges:document.querySelectorAll(".react-flow__edge").length
    })`)
    assert.deepEqual(loopCounts,{nodes:11,edges:7})
    console.log("CHROME_WORKFLOW_LOOP_HANDLES_PASS",
      JSON.stringify({bodyConnected:true,doneConnected:true,...loopCounts}))

    // Drag-created branches may crowd the loop header at different zoom
    // levels. Organize once before the direct body-return gesture so the
    // hit target is unambiguously the intended handle.
    await evaluate(`document.querySelector('button[title^="自动整理"]').click()`)
    await sleep(180)
    const dragNodeToNode=async (sourceId,targetId)=>{
      await evaluate(`document.querySelector('button[title="适应画布"]').click()`)
      await sleep(450)
      const points=await evaluate(`(() => {
        const src=[...document.querySelectorAll(".react-flow__node")]
          .find(n=>n.getAttribute("data-id")===${JSON.stringify(sourceId)})
        const dst=[...document.querySelectorAll(".react-flow__node")]
          .find(n=>n.getAttribute("data-id")===${JSON.stringify(targetId)})
        const fromEl=src?.querySelector(".react-flow__handle.source")
        const toEl=dst?.querySelector(".react-flow__handle.target")
        if(!fromEl||!toEl)return null
        const f=fromEl.getBoundingClientRect(),t=toEl.getBoundingClientRect()
        return {from:{x:Math.round(f.left+f.width/2),y:Math.round(f.top+f.height/2)},
          to:{x:Math.round(t.left+t.width/2),y:Math.round(t.top+t.height/2)}}
      })()`)
      assert.ok(points,"native connection requires visible source/target handles")
      for (const p of [points.from,points.to])
        assert.ok(p.x>3 && p.x<1440 && p.y>3 && p.y<900,
          "a connection handle is outside the Chrome viewport")
      const hit=await evaluate(`(() => {
        const target=document.elementFromPoint(${points.to.x},${points.to.y})
        const source=document.elementFromPoint(${points.from.x},${points.from.y})
        return {source:source?.closest(".react-flow__handle")?.getAttribute("data-handleid")||"",
          sourceHandle:!!source?.closest(".react-flow__handle.source"),
          targetHandle:!!target?.closest(".react-flow__handle.target"),
          targetNode:target?.closest(".react-flow__node")?.getAttribute("data-id")||""}
      })()`)
      assert.ok(hit.sourceHandle&&hit.targetHandle,
        "workflow connection handles obstructed: "+JSON.stringify({hit,points}))
      await command("Input.dispatchMouseEvent",{type:"mouseMoved",...points.from})
      await command("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...points.from})
      for(let k=1;k<=12;k++){
        const ratio=k/12
        await command("Input.dispatchMouseEvent",{type:"mouseMoved",button:"left",buttons:1,
          x:Math.round(points.from.x+(points.to.x-points.from.x)*ratio),
          y:Math.round(points.from.y+(points.to.y-points.from.y)*ratio)})
        await sleep(12)
      }
      await command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",...points.to})
    }
    // Only the body branch may return to its own loop header. This is an
    // actual node-to-node drag, not a test-only invocation of the graph hook.
    await dragNodeToNode(loopBodyId,loopId)
    await waitFor('document.querySelectorAll(".react-flow__edge").length === 8',
      "legal loop body return edge")
    await evaluate(`document.querySelector('button[title^="撤销"]').click()`)
    await waitFor('document.querySelectorAll(".react-flow__edge").length === 7',
      "one-step undo loop return")
    await dragNodeToNode(loopDoneId,loopId)
    await sleep(400)
    assert.equal(await evaluate('document.querySelectorAll(".react-flow__edge").length'),7,
      "a loop done successor must not return to its loop header")
    const rejectedMessage=await evaluate(
      'document.body.textContent?.includes("只有从当前循环")||false')
    assert.ok(rejectedMessage,"illegal return must explain which loop path is permitted")
    console.log("CHROME_WORKFLOW_LOOP_RETURN_PASS",
      JSON.stringify({bodyReturnAccepted:true,doneReturnRejected:true,undoPreserved:true}))

    // Arrange before testing precise Shift-click targeting: newly added
    // unconnected nodes initially overlap, so a click on one card could
    // legitimately hit a different card above it.
    assert.equal(await evaluate(`(() => {
      const b=document.querySelector('button[title^="自动整理"]')
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await sleep(200)
    // Real Shift multi-select and layout toolbar, using CDP mouse modifiers.
    await evaluate(`document.querySelector('button[title="适应画布"]').click()`)
    await sleep(600)
    const selectableIds=[dragConnected.nodeId,conditionId,loopId]
    const selectionResetPoint=await evaluate(`(() => {
      const pane=document.querySelector(".react-flow__pane")
      if(!pane)return null
      const rect=pane.getBoundingClientRect()
      for(let x=Math.round(rect.left+20);x<rect.right-20;x+=37){
        for(let y=Math.round(rect.top+72);y<rect.bottom-28;y+=41){
          if(document.elementFromPoint(x,y)?.classList.contains("react-flow__pane"))
            return {x,y}
        }
      }
      return null
    })()`)
    assert.ok(selectionResetPoint,"blank point required to clear previous selection")
    await command("Input.dispatchMouseEvent",{
      type:"mouseMoved",...selectionResetPoint,
    })
    await command("Input.dispatchMouseEvent",{
      type:"mousePressed",button:"left",clickCount:1,...selectionResetPoint,
    })
    await command("Input.dispatchMouseEvent",{
      type:"mouseReleased",button:"left",...selectionResetPoint,
    })
    await waitFor('document.querySelectorAll(".react-flow__node.selected").length === 0',
      "previous selection cleared")
    for(let index=0;index<selectableIds.length;index++){
      const id=selectableIds[index]
      const rect=await evaluate(`(() => {
        const n=[...document.querySelectorAll(".react-flow__node")]
          .find(x=>x.getAttribute("data-id")===${JSON.stringify(id)})
        if(!n)return null
        const r=n.getBoundingClientRect()
        return {x:Math.round(r.left+r.width*.42),y:Math.round(r.top+r.height*.48)}
      })()`)
      assert.ok(rect?.x>0 && rect?.x<1440 && rect?.y>0 && rect?.y<900,
        "multiselect node not visible: "+id)
      if(index===1) await command("Input.dispatchKeyEvent",{
        type:"rawKeyDown",key:"Shift",code:"ShiftLeft",
        windowsVirtualKeyCode:16,nativeVirtualKeyCode:16,modifiers:8,
      })
      const modifiers=index===0?0:8
      await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:rect.x,y:rect.y,modifiers})
      await command("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,
        x:rect.x,y:rect.y,modifiers})
      await command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",
        x:rect.x,y:rect.y,modifiers})
    }
    await sleep(150)
    await command("Input.dispatchKeyEvent",{
      type:"keyUp",key:"Shift",code:"ShiftLeft",
      windowsVirtualKeyCode:16,nativeVirtualKeyCode:16,
    })

    const shiftInfo=await evaluate(`(() => ({
      selected:[...document.querySelectorAll(".react-flow__node.selected")]
        .map(n=>n.getAttribute("data-id")),
      toolbar:!!document.querySelector('[role="toolbar"][aria-label="节点对齐和分布"]'),
      nodes:[...document.querySelectorAll(".react-flow__node")]
        .filter(n=>${JSON.stringify(selectableIds)}.includes(n.getAttribute("data-id")))
        .map(n=>({id:n.getAttribute("data-id"),classes:n.className,selected:n.classList.contains("selected")})),
    }))()`)
    console.log("CHROME_SHIFT_SELECTION_DIAGNOSTIC",JSON.stringify(shiftInfo))
    await waitFor('document.querySelectorAll(".react-flow__node.selected").length === 3',
      "Shift multi-select")
    assert.deepEqual([...shiftInfo.selected].sort(),[...selectableIds].sort(),
      "exactly the intended three nodes should be selected for batch layout")
    await waitFor(`document.querySelector('[role="toolbar"][aria-label="节点对齐和分布"]') !== null`,
      "multi-node layout toolbar")
    assert.equal(await evaluate(`(() => {
      const b=document.querySelector('button[aria-label="左对齐"]')
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await sleep(220)
    const alignedLeft=await evaluate(`(() => {
      const ids=${JSON.stringify(selectableIds)}
      return ids.map(id=>{
        const n=[...document.querySelectorAll(".react-flow__node")]
          .find(x=>x.getAttribute("data-id")===id)
        return n?.getBoundingClientRect().left ?? -1
      })
    })()`)
    assert.ok(alignedLeft.every(x=>x>=0) &&
      Math.max(...alignedLeft)-Math.min(...alignedLeft)<2,
      "left-align should affect all Shift-selected nodes: "+alignedLeft.join(","))
    console.log("CHROME_WORKFLOW_SHIFT_ALIGN_PASS",
      JSON.stringify({selected:selectableIds.length,alignment:"left",maxDeltaPx:
        Math.max(...alignedLeft)-Math.min(...alignedLeft)}))

    // Distribute the same three selected nodes on the vertical axis.
    // Compare actual rendered gaps; this catches incorrect measured-height
    // calculations and verifies the layout toolbar is not merely decorative.
    assert.equal(await evaluate(`(() => {
      const b=document.querySelector('button[aria-label="垂直分布"]')
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await sleep(210)
    const distributed=await evaluate(`(() => {
      const ids=${JSON.stringify(selectableIds)}
      return ids.map(id=>{
        const node=[...document.querySelectorAll(".react-flow__node")]
          .find(x=>x.getAttribute("data-id")===id)
        const rect=node?.getBoundingClientRect()
        return rect ? {id,top:rect.top,bottom:rect.bottom} : null
      }).filter(Boolean).sort((a,b)=>a.top-b.top)
    })()`)
    assert.equal(distributed.length,3)
    const gapOne=distributed[1].top-distributed[0].bottom
    const gapTwo=distributed[2].top-distributed[1].bottom
    assert.ok(Math.abs(gapOne-gapTwo)<3,
      "vertical distribution should yield equal rendered gaps: "+
      JSON.stringify({gapOne,gapTwo,distributed}))
    await evaluate(`document.querySelector('button[title^="撤销"]').click()`)
    await sleep(130)
    await evaluate(`document.querySelector('button[title^="重做"]').click()`)
    await sleep(130)
    console.log("CHROME_WORKFLOW_DISTRIBUTION_PASS",
      JSON.stringify({selected:3,verticalGaps:[gapOne,gapTwo],undoRedo:true}))

    // Persist the 11-node draft with aligned positions, reload the complete
    // authenticated route, and verify the serialized graph survives.
    const unsavedWarning=await evaluate(`(() => {
      const event=new Event("beforeunload",{cancelable:true})
      window.dispatchEvent(event)
      return event.defaultPrevented
    })()`)
    assert.equal(unsavedWarning,true,
      "unsaved workflow must warn before a browser reload or tab close")
    const saveButton=await evaluate(`(() => {
      const b=[...document.querySelectorAll("button")]
        .find(x=>x.textContent?.trim()==="保存工作流")
      if(!b || b.disabled)return false
      b.click()
      return true
    })()`)
    assert.ok(saveButton,"save button must be available after alignment")
    await waitFor(`![...document.querySelectorAll("span")]
      .some(e=>e.textContent?.trim()==="未保存更改")`,"workflow save completion")
    const savedWarning=await evaluate(`(() => {
      const event=new Event("beforeunload",{cancelable:true})
      window.dispatchEvent(event)
      return event.defaultPrevented
    })()`)
    assert.equal(savedWarning,false,
      "successful save must clear unsaved-navigation warning")
    const originalGraph=await evaluate(`(async () => {
      const stored=JSON.parse(localStorage.getItem("agent_studio_employee_auth")||"{}")
      const headers={Authorization:stored.token}
      const listing=await fetch("/__pb/api/workflow-studio/list",{headers}).then(r=>r.json())
      const id=listing.items?.[0]?.id
      if(!id)return null
      const row=await fetch("/__pb/api/workflow-studio/get?id="+encodeURIComponent(id),{headers})
        .then(r=>r.json())
      return {id,name:row.workflow?.name||"",graph:row.workflow?.graph}
    })()`)
    assert.ok(originalGraph?.id && originalGraph?.graph,"original saved graph missing")
    assert.equal(originalGraph.graph.nodes.length,11)
    assert.equal(originalGraph.graph.edges.length,7)
    const xVals=selectableIds.map(id=>originalGraph.graph.nodes.find(n=>n.id===id)?.position?.x)
    assert.ok(xVals.every(v=>Number.isFinite(v)) && Math.max(...xVals)-Math.min(...xVals)<.01,
      "aligned node graph positions were not serialized")
    await command("Page.navigate",{url:webOrigin+"/workflow-canvas"})
    await waitFor('document.querySelectorAll(".react-flow__node").length===11',
      "saved nodes reloaded after full browser navigation")
    await waitFor('document.querySelectorAll(".react-flow__edge").length===7',
      "saved edges reloaded after full browser navigation")
    assert.deepEqual(await evaluate(
      '[...document.querySelectorAll(".react-flow__node")].map(n=>n.getAttribute("data-id")).sort()'),
      originalGraph.graph.nodes.map(n=>n.id).sort(),"reload must preserve IDs")
    console.log("CHROME_WORKFLOW_SAVE_RESTORE_PASS",
      JSON.stringify({savedNodes:11,savedEdges:7,alignedNodes:3,fullNavigation:true}))

    // Export through the visible UI, capture only the sanitized Blob, then
    // import via an actual File input into a NEW employee-owned workflow.
    await evaluate(`(() => {
      const original=URL.createObjectURL.bind(URL)
      window.__workflowExportBlob=null
      URL.createObjectURL=(blob)=> {
        window.__workflowExportBlob=blob
        return original(blob)
      }
    })()`)
    let exportApprovals=0
    client.onDialog=()=>{
      exportApprovals++
      void command("Page.handleJavaScriptDialog",{accept:true})
    }
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll("button")]
        .find(x=>x.textContent?.trim()==="导出 JSON")
      if(!b || b.disabled)return false
      b.click()
      return true
    })()`),true)
    await waitFor('!!window.__workflowExportBlob',"export JSON blob")
    client.onDialog=null
    assert.equal(exportApprovals,1,"sensitive-data export warning must ask for confirmation")
    const portableText=await evaluate('window.__workflowExportBlob.text()')
    const portable=JSON.parse(portableText)
    assert.equal(portable.kind,"agent-studio-workflow")
    assert.equal(portable.version,1)
    assert.equal(portable.graph.nodes.length,11)
    assert.equal(portable.graph.edges.length,7)
    assert.equal(portableText.includes("mock-browser-key-not-real"),false)
    assert.equal(portableText.includes(browserModelSelection),false,
      "portable graph must not carry source employee model bindings")
    assert.ok(portable.graph.nodes.filter(n=>n.type==="model")
      .every(n=>!n.data.model),"exported model nodes must not transfer model binding")
    assert.equal(await evaluate(`(() => {
      const fileInput=document.querySelector('input[aria-label="导入工作流 JSON 文件"]')
      if(!fileInput)return false
      const text=${JSON.stringify(portableText)}
      const dt=new DataTransfer()
      dt.items.add(new File([text],"source-workflow.json",{type:"application/json"}))
      fileInput.files=dt.files
      fileInput.dispatchEvent(new Event("change",{bubbles:true}))
      return true
    })()`),true)
    await waitFor(`document.body.textContent?.includes("导入成功：已创建独立工作流")`,
      "import success banner")
    await waitFor('document.querySelectorAll(".react-flow__node").length===11',
      "imported nodes rendered")
    await waitFor('document.querySelectorAll(".react-flow__edge").length===7',
      "imported edges rendered")
    const imported=await evaluate(`(async () => {
      const token=JSON.parse(localStorage.getItem("agent_studio_employee_auth")||"{}").token
      const headers={Authorization:token}
      const list=await fetch("/__pb/api/workflow-studio/list",{headers}).then(r=>r.json())
      const owned=list.items||[]
      const id=owned.find(x=>x.name?.includes("导入"))?.id
      if(!id)return {count:owned.length}
      const result=await fetch("/__pb/api/workflow-studio/get?id="+encodeURIComponent(id),{headers})
        .then(r=>r.json())
      return {id,count:owned.length,name:result.workflow?.name,
        graph:result.workflow?.graph}
    })()`)
    assert.ok(imported?.id && imported.id!==originalGraph.id)
    assert.ok(imported.count>=2)
    assert.equal(imported.graph.nodes.length,11)
    assert.equal(imported.graph.edges.length,7)
    assert.ok(imported.graph.nodes.every(n=>!n.data?.model && !n.data?.spec_id),
      "imported graph must not inherit model or Agent bindings")
    assert.ok(imported.graph.nodes.every(n=>n.type!=="tool" || !n.data.tool),
      "imported tool nodes must require explicit authorized rebinding")
    assert.equal(new Set(imported.graph.nodes.map(n=>n.id)).size,11)
    assert.ok(imported.graph.nodes.every(n=>!originalGraph.graph.nodes.some(old=>old.id===n.id)),
      "import must regenerate node IDs")
    console.log("CHROME_WORKFLOW_TRANSFER_PASS",
      JSON.stringify({exportedNodes:11,exportedEdges:7,importedNodes:11,
        importIntoNewWorkflow:true,exportConfirmations:exportApprovals,bindingsStripped:true}))

    // Malformed imports must show an error and must never create an extra flow.
    const beforeInvalid=await evaluate(`(async () => {
      const token=JSON.parse(localStorage.getItem("agent_studio_employee_auth")||"{}").token
      const res=await fetch("/__pb/api/workflow-studio/list",{headers:{Authorization:token}})
      return (await res.json()).items?.length||0
    })()`)
    assert.equal(await evaluate(`(() => {
      const input=document.querySelector('input[aria-label="导入工作流 JSON 文件"]')
      if(!input)return false
      const payload=${JSON.stringify(JSON.stringify({
        kind:"agent-studio-workflow",version:999,
        name:"malicious-payload",graph:{nodes:[],edges:[]},
      }))}
      const dt=new DataTransfer()
      dt.items.add(new File([payload],"invalid-workflow.json",{type:"application/json"}))
      input.files=dt.files
      input.dispatchEvent(new Event("change",{bubbles:true}))
      return true
    })()`),true)
    await waitFor(`document.body.textContent?.includes("不支持的工作流格式或版本")`,
      "rejected invalid JSON version")
    const afterInvalid=await evaluate(`(async () => {
      const token=JSON.parse(localStorage.getItem("agent_studio_employee_auth")||"{}").token
      const res=await fetch("/__pb/api/workflow-studio/list",{headers:{Authorization:token}})
      return (await res.json()).items?.length||0
    })()`)
    assert.equal(afterInvalid,beforeInvalid,"rejected import must not create a workflow")
    assert.equal(await evaluate('document.querySelectorAll(".react-flow__node").length'),11)
    console.log("CHROME_WORKFLOW_INVALID_IMPORT_PASS",
      JSON.stringify({rejectsUnknownVersion:true,workflowCountUnchanged:true}))
    // Hold the first PATCH while the user edits again. The first response
    // must not mark the newer draft as saved.
    await evaluate(`(() => {
      const pane=document.querySelector(".react-flow__pane")
      if(!pane)return false
      const r=pane.getBoundingClientRect()
      pane.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,
        clientX:r.left+22,clientY:r.top+42,view:window}))
      return true
    })()`)
    await waitFor('!!document.querySelector("#wf-info-name")',"workflow info")
    const setFlowName=async value=>{
      await evaluate('document.querySelector("#wf-info-name").focus()')
      await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"a",
        code:"KeyA",windowsVirtualKeyCode:65,modifiers:2})
      await command("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",
        windowsVirtualKeyCode:65})
      await command("Input.insertText",{text:value})
      await waitFor('document.querySelector("#wf-info-name")?.value==='+JSON.stringify(value),
        "draft title updated")
    }
    const readImportedName=async()=>await evaluate(`(async()=>{
      const token=JSON.parse(localStorage.getItem("agent_studio_employee_auth")||"{}").token
      const url="/__pb/api/workflow-studio/get?id="+${JSON.stringify(imported.id)}
      const r=await fetch(url,{headers:{Authorization:token}}).then(r=>r.json())
      return r.workflow?.name||""
    })()`)
    await setFlowName("慢速保存：旧稿")
    await evaluate(`(() => {
      const original=window.fetch.bind(window)
      window.__slowSaveStarted=false
      window.__releaseSlowSave=null
      window.fetch=(url,options={})=>{
        if(!window.__slowSaveStarted && String(url).includes("/workflow-studio/update")
          && String(options.method||"").toUpperCase()==="PATCH"){
          window.__slowSaveStarted=true
          return new Promise((resolve,reject)=>{
            window.__releaseSlowSave=()=>original(url,options).then(resolve,reject)
          })
        }
        return original(url,options)
      }
    })()`)
    await evaluate('document.querySelector(\'button[title^="保存工作流"]\').click()')
    await waitFor('window.__slowSaveStarted===true',"slow save held")
    await setFlowName("慢速保存：新稿")
    await evaluate('window.__releaseSlowSave()')
    await waitFor('document.body.textContent?.includes("保存期间又进行了修改")',
      "late changes not falsely saved")
    await waitFor('document.querySelector(\'button[title^="保存工作流"]\')?.disabled===false',
      "second save enabled")
    assert.equal(await readImportedName(),"慢速保存：旧稿")
    await evaluate('document.querySelector(\'button[title^="保存工作流"]\').click()')
    await waitFor(`(() => {
      const button=document.querySelector('button[title^="保存工作流"]')
      return button?.disabled && button.textContent?.includes("保存工作流") &&
        !document.body.textContent?.includes("保存中…")
    })()`,"second save completes")
    assert.equal(await readImportedName(),"慢速保存：新稿")
    console.log("CHROME_WORKFLOW_SLOW_SAVE_PASS",
      JSON.stringify({oldSnapshotSaved:true,newDraftStillDirty:true,retrySaved:true}))
    await setFlowName("失败保存：保留草稿")
    await evaluate(`(() => {
      const original=window.fetch.bind(window)
      window.__saveFailureTest=false
      window.fetch=(url,options={})=>{
        if(!window.__saveFailureTest && String(url).includes("/workflow-studio/update")
          && String(options.method||"").toUpperCase()==="PATCH"){
          window.__saveFailureTest=true
          return Promise.resolve(new Response(JSON.stringify({message:"模拟服务端故障"}),
            {status:503,headers:{"Content-Type":"application/json"}}))
        }
        return original(url,options)
      }
    })()`)
    await evaluate('document.querySelector(\'button[title^="保存工作流"]\').click()')
    await waitFor('window.__saveFailureTest && document.body.textContent?.includes("模拟服务端故障")',
      "500 failure message")
    assert.equal(await evaluate('document.querySelector("#wf-info-name")?.value'),
      "失败保存：保留草稿")
    assert.equal(await readImportedName(),"慢速保存：新稿")
    await evaluate('document.querySelector(\'button[title^="保存工作流"]\').click()')
    await waitFor(`(() => {
      const button=document.querySelector('button[title^="保存工作流"]')
      return button?.disabled && button.textContent?.includes("保存工作流") &&
        !document.body.textContent?.includes("保存中…")
    })()`,"503 retry complete")
    assert.equal(await readImportedName(),"失败保存：保留草稿")
    console.log("CHROME_WORKFLOW_FAILED_SAVE_PASS",
      JSON.stringify({draftRetained:true,serverUnchangedOn503:true,retrySucceeded:true}))


    await command("Emulation.setDeviceMetricsOverride",{
      width:768,height:1024,deviceScaleFactor:1,mobile:true,
    })
    await sleep(440)
    const tablet=await evaluate(`(() => {
      const root=document.documentElement
      const flow=document.querySelector(".react-flow")
      const rect=flow?.getBoundingClientRect()
      return {
        viewport:root.clientWidth,scroll:root.scrollWidth,
        graphWidth:rect?.width||0,graphHeight:rect?.height||0,
        nodeCount:document.querySelectorAll(".react-flow__node").length,
      }
    })()`)
    assert.equal(tablet.viewport,768)
    assert.ok(tablet.scroll<=772,"tablet layout caused horizontal scroll: "+JSON.stringify(tablet))
    assert.ok(tablet.graphWidth>320 && tablet.graphHeight>300,
      "tablet editing viewport too small: "+JSON.stringify(tablet))
    assert.equal(tablet.nodeCount,11)
    console.log("CHROME_WORKFLOW_TABLET_PASS",JSON.stringify(tablet))
    await command("Emulation.setTouchEmulationEnabled",{
      enabled:true,maxTouchPoints:5,
    })
    await sleep(160)
    const touchTarget=await evaluate(`(() => {
      const flow=document.querySelector(".agent-workflow-flow")
      const handle=flow?.querySelector(".react-flow__handle")
      return {scoped:!!flow,coarse:matchMedia("(pointer: coarse)").matches,
        width:Math.round(handle?.getBoundingClientRect().width||0),
        height:Math.round(handle?.getBoundingClientRect().height||0),
        handles:flow?.querySelectorAll(".react-flow__handle").length||0}
    })()`)
    assert.equal(touchTarget.scoped,true)
    assert.ok(touchTarget.handles>=8)
    if(touchTarget.coarse) {
      assert.ok(touchTarget.width>=25&&touchTarget.height>=25,
        "touch connection handle too small: "+JSON.stringify(touchTarget))
    }
    await command("Emulation.setTouchEmulationEnabled",{enabled:false})
    console.log("CHROME_WORKFLOW_TOUCH_TARGET_PASS",JSON.stringify(touchTarget))

    await command("Emulation.setDeviceMetricsOverride",{
      width:390,height:844,deviceScaleFactor:1,mobile:true,
    })
    await sleep(400)
    const mobile=await evaluate(`({
      viewport:document.documentElement.clientWidth,
      scroll:document.documentElement.scrollWidth,
      width:window.innerWidth,
      nodeCount:document.querySelectorAll(".react-flow__node").length,
    })`)
    assert.equal(mobile.viewport,390,"mobile viewport should reflect emulation")
    assert.ok(mobile.scroll <= mobile.viewport + 4,
      "mobile document overflows horizontal viewport: "+JSON.stringify(mobile))
    assert.equal(mobile.nodeCount,11)
    const fullscreen=await evaluate(`(() => {
      const button=[...document.querySelectorAll("button")].find(b=>b.textContent?.trim()==="全屏")
      if(!button)return false
      button.click()
      return true
    })()`)
    assert.ok(fullscreen,"mobile fullscreen button missing")
    await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent?.includes("退出全屏"))',"mobile fullscreen overlay")
    const drawer=await evaluate(`(() => {
      const b=document.querySelector('button[title*="配置面板"]')
      if(!b)return false
      b.click()
      return true
    })()`)
    assert.ok(drawer,"mobile configuration drawer toggle missing")
    await waitFor(`document.querySelector('aside[aria-label="节点配置抽屉"]') !== null`,"mobile node configuration drawer")
    // Mobile drawer is dismissible and can be reopened without losing the graph.
    assert.equal(await evaluate(`(() => {
      const close=document.querySelector('button[aria-label="关闭配置面板"]')
      if(!close)return false
      close.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('aside[aria-label="节点配置抽屉"]') === null`,
      "mobile drawer close")
    assert.equal(await evaluate(`(() => {
      const opener=document.querySelector('button[title="展开配置面板"]')
      if(!opener)return false
      opener.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('aside[aria-label="节点配置抽屉"]') !== null`,
      "mobile drawer reopen")
    const picture=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false})
    const screenshot=Buffer.from(picture.data,"base64")
    assert.ok(screenshot.length>2500,"mobile screenshot was not rendered")
    // Screenshots stay inside the uniquely-created test profile and are cleaned
    // with it; no chat data, production records or credentials are exported.
    fs.writeFileSync(path.join(chromeProfile,"workflow-mobile-smoke.png"),screenshot)
    console.log("CHROME_WORKFLOW_UI_PASS",
      JSON.stringify({desktopNodes:3,quickAddedNodes:4,dragConnectedNodes:5,branchGraphNodes:8,loopGraphNodes:11,mobileViewport:mobile.viewport,
        mobileDocumentWidth:mobile.scroll,screenshotBytes:screenshot.length}))
    // Five-space information architecture and the globally accessible
    // Ctrl/Cmd+K search are tested on an actual 390px Chrome viewport.
    assert.equal(await evaluate(`document.querySelectorAll(
      'nav[aria-label="移动端主要工作空间"] a').length`),5)
    assert.equal(await evaluate(`document.querySelector(
      'button[aria-label="打开全部导航"]')!==null`),true)
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"k",code:"KeyK",
      windowsVirtualKeyCode:75,modifiers:2})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"k",code:"KeyK",
      windowsVirtualKeyCode:75})
    await waitFor(`!!document.querySelector('[role="dialog"][aria-label="搜索 Agent Studio 功能"]')`,
      "Ctrl+K global command search opens")
    await evaluate('document.querySelector(\'input[aria-label="搜索页面和功能"]\').focus()')
    await command("Input.insertText",{text:"知识库"})
    await waitFor(`document.querySelector('[role="listbox"]')?.textContent?.includes("知识库")`,
      "command palette finds KB")
    const searchValues=await evaluate(`({
      results:[...document.querySelectorAll('[role="listbox"] [role="option"]')]
        .map(n=>n.textContent?.trim()),
      width:document.documentElement.scrollWidth,
    })`)
    assert.ok(searchValues.results.some(x=>x.includes("知识库")))
    // Keyboard focus must stay inside the modal. Shift+Tab from the first
    // input moves to the last result instead of entering the page behind it.
    await evaluate('document.querySelector(\'input[aria-label="搜索页面和功能"]\').focus()')
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Tab",
      code:"Tab",windowsVirtualKeyCode:9,modifiers:8})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",
      code:"Tab",windowsVirtualKeyCode:9})
    await waitFor(`document.activeElement?.getAttribute("role")==="option"`,
      "command search traps Shift+Tab")
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Tab",
      code:"Tab",windowsVirtualKeyCode:9})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",
      code:"Tab",windowsVirtualKeyCode:9})
    await waitFor(`document.activeElement?.getAttribute("aria-label")==="搜索页面和功能"`,
      "command search returns Tab to search input")
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",
      code:"Escape",windowsVirtualKeyCode:27})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",
      code:"Escape",windowsVirtualKeyCode:27})
    await waitFor('!document.querySelector(\'[role="dialog"][aria-label="搜索 Agent Studio 功能"]\')',
      "command palette Escape closes")
    await evaluate(`document.querySelector('button[aria-label="打开全部导航"]').click()`)
    await waitFor(`document.querySelector('[role="dialog"][aria-label="全部工作空间与功能"]')!==null`,
      "mobile full navigation opens")
    await waitFor(`document.activeElement?.getAttribute("aria-label")==="关闭全部导航"`,
      "mobile drawer begins with keyboard focus on close")
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",
      code:"Escape",windowsVirtualKeyCode:27})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",
      code:"Escape",windowsVirtualKeyCode:27})
    await waitFor(`document.querySelector('[role="dialog"][aria-label="全部工作空间与功能"]')===null`,
      "Escape closes mobile full navigation")
    console.log("CHROME_STUDIO_NAV_SEARCH_PASS",
      JSON.stringify({mobileWorkspaces:5,commandSearch:true,documentWidth:searchValues.width}))

    // The guide uses the real Home model generation, AgentSpec save endpoint,
    // model-connection ACL and trial-run history. This mock never calls a
    // paid provider. Publishing MUST remain locked before successful run.
    await command("Page.navigate",{url:webOrigin+"/agent-create"})
    await waitFor(`document.querySelectorAll('ol[aria-label="Agent 创建步骤"] button').length===5`,
      "Agent create wizard has five steps")
    // Verify the wizard truly occupies its *available* viewport on desktop,
    // not a fixed 1152px centered island, and remains horizontally scroll-free.
    const wizardViewports=[]
    for(const width of [390,768,1440,1780]){
      await command("Emulation.setDeviceMetricsOverride",{
        width,height:width===390?844:width===768?1024:900,
        deviceScaleFactor:1,mobile:width<900,
      })
      await sleep(260)
      const metrics=await evaluate(`(() => {
        const main=document.querySelector('[data-studio-fluid-page="agent-create"]')
        const composer=document.querySelector('[data-agent-requirement-composer]')
        const a=main?.getBoundingClientRect(),b=composer?.getBoundingClientRect()
        const rail=document.querySelector('aside[aria-label="任务描述示例"]')
        return {viewport:document.documentElement.clientWidth,
          scroll:document.documentElement.scrollWidth,
          mainWidth:Math.round(a?.width||0),
          composerWidth:Math.round(b?.width||0),
          railVisible:rail?getComputedStyle(rail).display!=="none":false,
          stepButtons:document.querySelectorAll('ol[aria-label="Agent 创建步骤"] button').length}
      })()`)
      assert.equal(metrics.viewport,width)
      assert.ok(metrics.scroll<=width+4,
        "wizard horizontal overflow at "+width+": "+JSON.stringify(metrics))
      assert.equal(metrics.stepButtons,5)
      if(width>=1440){
        assert.ok(metrics.mainWidth>=width-350,
          "wizard not using available desktop width: "+JSON.stringify(metrics))
        assert.ok(metrics.composerWidth>=metrics.mainWidth*.53,
          "requirements editor remains too narrow: "+JSON.stringify(metrics))
        assert.equal(metrics.railVisible,true)
      }else{
        assert.ok(metrics.composerWidth>=metrics.mainWidth*.79,
          "small-screen requirement input did not expand: "+JSON.stringify(metrics))
        assert.equal(metrics.railVisible,false)
      }
      wizardViewports.push(metrics)
    }
    // Keep the remaining browser workflow at the original mobile breakpoint.
    await command("Emulation.setDeviceMetricsOverride",{
      width:390,height:844,deviceScaleFactor:1,mobile:true,
    })
    console.log("CHROME_STUDIO_FLUID_WIZARD_PASS",JSON.stringify(wizardViewports))


    assert.equal(await evaluate(`([...document.querySelectorAll('ol[aria-label="Agent 创建步骤"] button')]
      .find(b=>b.textContent?.includes("发布"))?.disabled)`),true)
    await waitFor('document.querySelector("#agent-requirement")!==null',"wizard requirement field")
    await evaluate('document.querySelector("#agent-requirement").focus()')
    // Build two real same-document history entries before editing so that
    // browser back/forward exercise React Router, not cross-document unload.
    const historySetupNav=await evaluate(`(() => ({
      pathname:location.pathname,
      viewWidth:innerWidth,
      bottomNavs:document.querySelectorAll('nav[aria-label="移动端主要工作空间"]').length,
      links:[...document.querySelectorAll('nav[aria-label="移动端主要工作空间"] a')].map(a=>({
        label:a.textContent?.trim(),href:a.getAttribute("href")
      })),
      steps:document.querySelectorAll('ol[aria-label="Agent 创建步骤"] button').length,
    }))()`)
    console.log("CHROME_HISTORY_SETUP_NAV",JSON.stringify(historySetupNav))
    assert.equal(await evaluate(`(() => {
      const link=[...document.querySelectorAll(
        'nav[aria-label="移动端主要工作空间"] a'
      )].find(a=>a.getAttribute("href")==="/model-connections")
      if(!link)return false
      link.click()
      return true
    })()`),true)
    await waitFor('location.pathname==="/model-connections"',"SPA history source route")
    await waitFor(`document.querySelector(
      'nav[aria-label="移动端主要工作空间"] a[href="/agent-create"]')!==null`,
      "model center mounted its responsive navigation")
    assert.equal(await evaluate(`(() => {
      const link=[...document.querySelectorAll(
        'nav[aria-label="移动端主要工作空间"] a'
      )].find(a=>a.getAttribute("href")==="/agent-create")
      if(!link)return false
      link.click()
      return true
    })()`),true)
    await waitFor('location.pathname==="/agent-create"',"return to clean wizard")
    await waitFor('document.querySelector("#agent-requirement")!==null',
      "requirement available after router navigation")
    await evaluate('document.querySelector("#agent-requirement").focus()')
    await command("Input.insertText",{text:"未生成方案的需求也需要保护"})
    await waitFor(`document.querySelector("#agent-requirement")?.value==="未生成方案的需求也需要保护"`,
      "unsubmitted requirement typed")
    const priorHistoryHandler=client.onDialog
    let requirementRejects=0
    client.onDialog=()=>{
      requirementRejects++
      void command("Page.handleJavaScriptDialog",{accept:false})
    }
    assert.equal(await evaluate(`(() => {
      const link=[...document.querySelectorAll(
        'nav[aria-label="移动端主要工作空间"] a'
      )].find(a=>a.getAttribute("href")==="/")
      if(!link)return false
      link.click()
      return true
    })()`),true)
    await sleep(170)
    assert.equal(await evaluate("location.pathname"),"/agent-create")
    assert.equal(requirementRejects,1,"unsaved requirement sidebar guard must appear")
    await evaluate("history.back()")
    await sleep(390)
    await waitFor('location.pathname==="/agent-create"',
      "cancel browser history navigation and restore URL")
    assert.equal(requirementRejects,2,
      "browser back must request confirmation once, not redirect silently")
    assert.equal(await evaluate('document.querySelector("#agent-requirement")?.value'),
      "未生成方案的需求也需要保护")
    client.onDialog=priorHistoryHandler
    // Clean up so the separate draft-recovery tests start with an empty editor.
    await evaluate('document.querySelector("#agent-requirement").focus()')
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"a",code:"KeyA",
      windowsVirtualKeyCode:65,modifiers:2})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",
      windowsVirtualKeyCode:65})
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Backspace",
      code:"Backspace",windowsVirtualKeyCode:8})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Backspace",
      code:"Backspace",windowsVirtualKeyCode:8})
    await waitFor('document.querySelector("#agent-requirement")?.value===""',
      "clear requirement before draft tests")
    await waitFor(`!Object.keys(sessionStorage).some(k=>k.includes("agent-draft:v1:"))`,
      "requirement backup cleared when input cleared")
    console.log("CHROME_STUDIO_REQUIREMENT_BACK_GUARD_PASS",
      JSON.stringify({sidebarBlocked:true,browserBackBlocked:true,contentPreserved:true}))

    // Draft recovery: the browser's own sessionStorage is populated by the
    // real editor after user typing, and survives a genuine route reload.
    await evaluate('document.querySelector("#agent-requirement").focus()')
    await command("Input.insertText",{text:"草稿：测试舍弃"})
    await waitFor(`Object.keys(sessionStorage).some(k=>k.includes("agent-draft:v1:"))`,
      "requirement temporary backup created")
    const nativeDraftDialog=client.onDialog
    client.onDialog=()=>{void command("Page.handleJavaScriptDialog",{accept:true})}
    await command("Page.navigate",{url:webOrigin+"/agent-create"})
    await waitFor(`document.querySelector('section[aria-label="恢复未保存的 Agent 草稿"]')!==null`,
      "draft recovery offered after reload")
    assert.equal(await evaluate('document.querySelector("#agent-requirement")?.value'),"",
      "old draft must not silently replace current form")
    assert.equal(await evaluate(`(() => {
      const button=[...document.querySelectorAll('section[aria-label="恢复未保存的 Agent 草稿"] button')]
        .find(el=>el.textContent?.trim()==="舍弃")
      if(!button)return false
      button.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('section[aria-label="恢复未保存的 Agent 草稿"]')===null`,
      "discard dismisses backup")

    await evaluate('document.querySelector("#agent-requirement").focus()')
    await command("Input.insertText",{text:"草稿：请恢复此内容"})
    await waitFor(`Object.keys(sessionStorage).some(k=>k.includes("agent-draft:v1:"))`,
      "new requirement backup created")
    await command("Page.navigate",{url:webOrigin+"/agent-create"})
    await waitFor(`document.querySelector('section[aria-label="恢复未保存的 Agent 草稿"]')!==null`,
      "fresh draft recovery offered")
    assert.equal(await evaluate(`(() => {
      const section=document.querySelector('section[aria-label="恢复未保存的 Agent 草稿"]')
      return section?.getAttribute("role")==="dialog" &&
        section.getAttribute("aria-modal")==="true"
    })()`),true,"draft recovery must block editing until restored or discarded")
    await waitFor(`document.activeElement?.textContent?.includes("恢复草稿") &&
      document.activeElement?.tagName==="BUTTON"`,
      "recovery dialog gets keyboard focus")
    assert.equal(await evaluate(`(() => {
      const button=[...document.querySelectorAll('section[aria-label="恢复未保存的 Agent 草稿"] button')]
        .find(el=>el.textContent?.trim()==="恢复草稿")
      if(!button)return false
      button.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector("#agent-requirement")?.value==="草稿：请恢复此内容"`,
      "draft restored into requirement")
    client.onDialog=nativeDraftDialog
    console.log("CHROME_STUDIO_DRAFT_RECOVERY_PASS",
      JSON.stringify({sessionOnly:true,userControlled:true,restore:true,discard:true}))
    await evaluate('document.querySelector("#agent-requirement").focus()')
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"a",code:"KeyA",
      windowsVirtualKeyCode:65,modifiers:2})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",
      windowsVirtualKeyCode:65})
    await command("Input.insertText",{text:"用公开数据对企业做研究并生成带来源的简报"})
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll("button")]
        .find(x=>x.textContent?.trim()==="生成 Agent 方案")
      if(!b||b.disabled)return false
      b.click()
      return true
    })()`),true)
    await waitFor('document.body.textContent?.includes("已生成可编辑方案")',
      "generated Agent proposal available")
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll("button")]
        .find(x=>x.textContent?.includes("进入方案编辑"))
      if(!b)return false
      b.click()
      return true
    })()`),true)
    await waitFor('document.body.textContent?.includes("第二步 · 审核目标")',
      "wizard step 2 plan editor")
    // Unsaved Agent edits must intercept BOTH React Router sidebar links and
    // direct command-palette navigation. Cancel keeps the current editor.
    const previousDialogHandler=client.onDialog
    let cancelledNavigationDialogs=0
    client.onDialog=()=>{
      cancelledNavigationDialogs++
      void command("Page.handleJavaScriptDialog",{accept:false})
    }
    assert.equal(await evaluate(`(() => {
      const home=[...document.querySelectorAll(
        'nav[aria-label="移动端主要工作空间"] a'
      )].find(a=>a.getAttribute("href")==="/")
      if(!home)return false
      home.click()
      return true
    })()`),true)
    await sleep(150)
    assert.equal(await evaluate("location.pathname"),"/agent-create",
      "cancel navigation must retain the editor route")
    assert.equal(cancelledNavigationDialogs,1,
      "unsaved editor must prompt exactly once for sidebar navigation")
    assert.equal(await evaluate(`document.querySelector('input[aria-label="助手名称"]')?.value`),
      "浏览器验收 Agent")
    // Ctrl+K also invokes programmatic navigate rather than an anchor click.
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"k",code:"KeyK",
      windowsVirtualKeyCode:75,modifiers:2})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"k",code:"KeyK",
      windowsVirtualKeyCode:75})
    await waitFor(`document.querySelector('input[aria-label="搜索页面和功能"]')!==null`,
      "command menu opens from unsaved Agent editor")
    await evaluate(`document.querySelector('input[aria-label="搜索页面和功能"]').focus()`)
    await command("Input.insertText",{text:"知识库"})
    await waitFor(`[...document.querySelectorAll('[role="listbox"] [role="option"]')]
      .some(el=>el.textContent?.includes("知识库"))`,
      "command palette can find route while editing")
    await evaluate(`(() => {
      const option=[...document.querySelectorAll('[role="listbox"] [role="option"]')]
        .find(el=>el.textContent?.includes("知识库"))
      option?.click()
    })()`)
    await sleep(130)
    assert.equal(await evaluate("location.pathname"),"/agent-create",
      "cancelled command navigation must retain current Agent")
    assert.equal(cancelledNavigationDialogs,2)
    await command("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Escape",
      code:"Escape",windowsVirtualKeyCode:27})
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",
      code:"Escape",windowsVirtualKeyCode:27})
    client.onDialog=previousDialogHandler
    console.log("CHROME_STUDIO_UNSAVED_SPA_GUARD_PASS",
      JSON.stringify({sidebarCancelled:true,commandCancelled:true,editorPreserved:true}))
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll("button")]
        .find(x=>x.textContent?.trim()==="保存到我的助手")
      if(!b||b.disabled)return false
      b.click()
      return true
    })()`),true)
    await waitFor('document.body.textContent?.includes("已保存进")',
      "wizard first Agent spec saved")
    const createdAgent=await evaluate(`(async()=>{
      const token=JSON.parse(localStorage.getItem("agent_studio_employee_auth")||"{}").token
      const res=await fetch("/__pb/api/agent_specs",{headers:{Authorization:token}})
      const data=await res.json()
      const row=(data.items||[]).find(r=>r.name==="浏览器验收 Agent")
      return row?{id:row.id,name:row.name,tools:row.spec?.tools||[]}:null
    })()`)
    assert.ok(createdAgent?.id,"wizard must create a durable agent spec")
    assert.ok(createdAgent.tools.includes("calculate"))
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll("button")]
        .find(x=>x.textContent?.trim().includes("下一步：连接资源"))
      if(!b||b.disabled)return false
      b.click()
      return true
    })()`),true)
    await waitFor('document.body.textContent?.includes("第三步 · 核实模型")',
      "wizard step 3 resources")
    await waitFor('document.body.textContent?.includes("已发现 1 个可选模型")',
      "authorized current employee model detected")
    assert.equal(await evaluate(`(() => {
      const b=[...document.querySelectorAll("button")]
        .find(x=>x.textContent?.trim().includes("下一步：试跑验证"))
      if(!b||b.disabled)return false
      b.click()
      return true
    })()`),true)
    await waitFor('document.body.textContent?.includes("第四步 · 在真实执行引擎")',
      "wizard step 4 requires real execution")
    assert.equal(await evaluate(`([...document.querySelectorAll('ol[aria-label="Agent 创建步骤"] button')]
      .find(b=>b.textContent?.includes("发布"))?.disabled)`),true,
      "publish stage must remain locked with no succeeded run")
    const trialLink=await evaluate(`[...document.querySelectorAll("a")]
      .find(a=>a.textContent?.includes("前往试跑当前 Agent"))?.getAttribute("href")||""`)
    assert.ok(trialLink.includes(createdAgent.id))
    await evaluate(`[...document.querySelectorAll("a")]
      .find(a=>a.textContent?.includes("前往试跑当前 Agent")).click()`)
    await waitFor('document.body.textContent?.includes("配置与试跑")',
      "wizard hands off to authenticated Agent run")
    await waitFor(`[...document.querySelectorAll("a")]
      .some(a=>a.textContent?.includes("返回创建向导"))`,
      "run page loads selected Agent before showing return to wizard")
    // A user-defined quality assertion must persist in the owned Agent spec,
    // but it must NOT pretend the model was verified before a real run.
    await waitFor('document.querySelector(\'section[aria-label="可验证的运行质量断言"]\')!==null',
      "quality checks panel on Agent trial page")
    const addQuality=await evaluate(`(() => {
      const pane=document.querySelector('section[aria-label="可验证的运行质量断言"]')
      const button=[...pane.querySelectorAll("button")].find(b=>b.textContent?.trim()==="添加断言")
      if(!button)return false
      button.click()
      return true
    })()`)
    assert.equal(addQuality,true)
    await waitFor(`document.querySelector('section[aria-label="可验证的运行质量断言"] input[placeholder^="例如"]')!==null`,
      "editable quality assertion")
    await evaluate(`document.querySelector('section[aria-label="可验证的运行质量断言"] input[placeholder^="例如"]').focus()`)
    await command("Input.insertText",{text:"核心结论"})
    assert.equal(await evaluate(`(() => {
      const button=[...document.querySelectorAll('section[aria-label="可验证的运行质量断言"] button')]
        .find(b=>b.textContent?.includes("保存检查条件"))
      if(!button||button.disabled)return false
      button.click()
      return true
    })()`),true)
    await waitFor('document.body.textContent?.includes("质量断言已保存到 Agent 方案")',
      "owner-scoped quality checks saved")
    const savedChecks=await evaluate(`(async()=>{
      const token=JSON.parse(localStorage.getItem("agent_studio_employee_auth")||"{}").token
      const url="/__pb/api/agent_specs/"+${JSON.stringify(createdAgent.id)}
      const resp=await fetch(url,{headers:{Authorization:token}})
      const json=await resp.json()
      return json.spec?.quality_checks||[]
    })()`)
    assert.deepEqual(savedChecks,[{type:"contains",expected:"核心结论"}],
      "agent quality checks must persist under the authorized spec")
    console.log("CHROME_STUDIO_QUALITY_ASSERTIONS_PASS",
      JSON.stringify({rulesSaved:savedChecks.length,ownerScoped:true,
        noAutomaticQualityPass:true}))

    await evaluate(`[...document.querySelectorAll("a")]
      .find(a=>a.textContent?.includes("返回创建向导")).click()`)
    await waitFor('document.body.textContent?.includes("第四步 · 在真实执行引擎")',
      "wizard resumes saved Agent spec by URL")
    await waitFor('document.body.textContent?.includes("已配置 1 条可执行质量断言")',
      "wizard loads persisted quality checks")
    assert.equal(await evaluate(`([...document.querySelectorAll('ol[aria-label="Agent 创建步骤"] button')]
      .find(b=>b.textContent?.includes("发布"))?.disabled)`),true,
      "quality checks may not unlock publication before a successful verified run")
    console.log("CHROME_STUDIO_AGENT_JOURNEY_PASS",
      JSON.stringify({steps:5,saved:true,modelsReady:true,trialHandoff:true,
        releaseBlockedWithoutSuccess:true}))

    // Smithery marketplace is verified through the real UI against an
    // isolated fake vendor. No production account or real vendor OAuth.
    await command("Page.navigate",{url:webOrigin+"/plugin-market"})
    try {
      await waitFor(`document.querySelector('section[aria-label="Smithery 插件探索和连接"]')!==null`,
        "Smithery marketplace main section")
    } catch (error) {
      const diagnostic=await evaluate(`(() => ({
        path:location.pathname,title:document.title,
        body:String(document.body?.textContent||"").slice(0,600),
        sections:[...document.querySelectorAll('section[aria-label]')].map(x=>x.getAttribute("aria-label")),
      }))()`)
      console.error("CHROME_SMITHERY_UI_DIAGNOSTIC",JSON.stringify(diagnostic))
      throw error
    }
    await waitFor(`document.querySelector('input[placeholder="粘贴你的 Smithery API Key"]')!==null`,
      "Smithery key field")
    await evaluate(`document.querySelector('input[placeholder="粘贴你的 Smithery API Key"]').focus()`)
    await command("Input.insertText",{text:smitheryTestKey})
    assert.equal(await evaluate(`(() => {
      const button=[...document.querySelectorAll("button")]
        .find(item=>item.textContent?.trim()==="验证并保存")
      if(!button||button.disabled)return false
      button.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('#smithery-namespace')?.value==="studio-sandbox"`,
      "Smithery owner namespace loaded")
    await waitFor(`[...document.querySelectorAll('section[aria-label="Smithery 插件探索和连接"] h3')]
      .some(el=>el.textContent?.includes("GitHub"))`,
      "Smithery vendor search card loaded")
    assert.equal(await evaluate(`(() => {
      const button=[...document.querySelectorAll('section[aria-label="Smithery 插件探索和连接"] button')]
        .find(item=>item.textContent?.trim()==="查看并连接")
      if(!button)return false
      button.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('[role="dialog"][aria-label^="连接插件"]')!==null`,
      "Smithery plugin details opens")
    assert.equal(await evaluate(`(() => {
      const button=[...document.querySelectorAll('[role="dialog"][aria-label^="连接插件"] button')]
        .find(item=>item.textContent?.includes("创建托管连接"))
      if(!button||button.disabled)return false
      button.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('[role="dialog"][aria-label^="连接插件"]')
      ?.textContent?.includes("需要先完成 Smithery 官方账号授权")`,
      "Smithery OAuth pending state displayed")
    assert.equal(await evaluate(`(() => {
      const link=[...document.querySelectorAll('[role="dialog"][aria-label^="连接插件"] a')]
        .find(item=>item.textContent?.includes("打开 Smithery 官方授权页面"))
      return !!link&&link.href.startsWith("https://auth.smithery.ai/")
    })()`),true)
    const pendingUi=await evaluate(`(async () => {
      const token=JSON.parse(localStorage.getItem("agent_studio_employee_auth")||"{}").token
      const reply=await fetch("/__pb/api/market/connections",{headers:{Authorization:token}})
      const data=await reply.json()
      const row=(data.items||[]).find(item=>item.server_name==="github")
      return row?{enabled:row.enabled,count:row.tool_count,status:row.last_probe_status}:null
    })()`)
    assert.deepEqual(pendingUi,{enabled:false,count:0,status:"auth_required"})
    mockSmitheryAuthorized=true // Simulated external user's successful OAuth
    assert.equal(await evaluate(`(() => {
      const button=[...document.querySelectorAll('[role="dialog"][aria-label^="连接插件"] button')]
        .find(item=>item.textContent?.includes("授权完成，检查工具"))
      if(!button||button.disabled)return false
      button.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('[role="dialog"][aria-label^="连接插件"]')
      ?.textContent?.includes("已通过工具发现")`,
      "Smithery tool discovery enabled")
    const readyUi=await evaluate(`(async () => {
      const token=JSON.parse(localStorage.getItem("agent_studio_employee_auth")||"{}").token
      const reply=await fetch("/__pb/api/market/connections",{headers:{Authorization:token}})
      const data=await reply.json()
      const row=(data.items||[]).find(item=>item.server_name==="github")
      return row?{enabled:row.enabled,count:row.tool_count,status:row.last_probe_status,
        url:row.url,tools:row.tools?.map(t=>t.name)}:null
    })()`)
    assert.equal(readyUi.enabled,true)
    assert.equal(readyUi.count,1)
    assert.deepEqual(readyUi.tools,["github_search"])
    assert.equal(readyUi.url.includes("api_key="),false)
    assert.equal(readyUi.url.includes("/connect/"),false,
      "ready Smithery MCP tool must use per-connection runtime gateway")
    console.log("CHROME_STUDIO_SMITHERY_CONNECT_PASS",
      JSON.stringify({pendingNeverEnabled:true,verifiedTools:1,noApiKeyInUrl:true}))
    // Plugin detail is a true responsive dialog; desktop assumptions must not
    // cause horizontal overflow on the two supported mobile/tablet widths.
    const smitheryMobile=await evaluate(`(() => ({
      viewport:document.documentElement.clientWidth,
      scroll:document.documentElement.scrollWidth,
      cards:document.querySelectorAll('section[aria-label="Smithery 插件探索和连接"] li').length,
      modal:!!document.querySelector('[role="dialog"][aria-label^="连接插件"]'),
    }))()`)
    assert.equal(smitheryMobile.viewport,390)
    assert.ok(smitheryMobile.scroll<=394,
      "Smithery mobile content overflows: "+JSON.stringify(smitheryMobile))
    assert.equal(smitheryMobile.modal,true)
    await command("Emulation.setDeviceMetricsOverride",{
      width:768,height:1024,deviceScaleFactor:1,mobile:true,
    })
    await sleep(260)
    const smitheryTablet=await evaluate(`({
      viewport:document.documentElement.clientWidth,
      scroll:document.documentElement.scrollWidth,
    })`)
    assert.equal(smitheryTablet.viewport,768)
    assert.ok(smitheryTablet.scroll<=772,
      "Smithery tablet content overflows: "+JSON.stringify(smitheryTablet))
    console.log("CHROME_STUDIO_SMITHERY_RESPONSIVE_PASS",
      JSON.stringify({mobile:smitheryMobile,tablet:smitheryTablet}))

    // Human-friendly API tools UX: preset, method mismatch and local preflight
    // must work without contacting any external weather provider.
    await command("Page.navigate",{url:webOrigin+"/tool-connections"})
    await waitFor('document.querySelector("[data-studio-fluid-page=tools]")!==null',"tool editor workspace")
    const addToolClicked=await evaluate('(() => {const b=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="添加工具"&&!x.disabled);if(!b)return false;b.click();return true})()')
    assert.equal(addToolClicked,true,"tool editor Add button must be reachable")
    await waitFor('document.querySelector("input[placeholder=\\"https://api.example.com/v1/query\\"]")!==null',"add tool form")
    const presetClicked=await evaluate('(() => {const b=[...document.querySelectorAll("button")].find(x=>x.textContent?.includes("填入天气查询示例"));if(!b)return false;b.click();return true})()')
    assert.equal(presetClicked,true,"weather preset action missing")
    await waitFor('document.querySelector("input[placeholder=\\"https://api.example.com/v1/query\\"]")?.value.includes("api.open-meteo.com")',"weather preset filled")
    const toolPresetState=await evaluate('(() => {const url=document.querySelector("input[placeholder=\\"https://api.example.com/v1/query\\"]")?.value||"";const panel=document.querySelector("section[aria-label=\\"请求配置检查\\"]");const test=[...document.querySelectorAll("button")].find(b=>b.textContent?.trim()==="测试调用");return {methodButtons:[...document.querySelectorAll("button")].filter(b=>["GET","POST"].includes(b.textContent?.trim())).map(b=>({method:b.textContent.trim(),active:b.className.includes("bg-primary/10")})),urlOk:url.includes("latitude={{latitude}}"),checkOk:panel?.textContent?.includes("格式检查通过"),queryKeys:panel?.textContent?.includes("latitude")&&panel?.textContent?.includes("longitude"),testEnabled:!!test&&!test.disabled,previewHidesValues:!panel?.textContent?.includes("30.2741")}})()')
    assert.equal(toolPresetState.urlOk,true)
    assert.equal(toolPresetState.checkOk,true)
    assert.equal(toolPresetState.queryKeys,true)
    assert.equal(toolPresetState.testEnabled,true)
    assert.equal(toolPresetState.previewHidesValues,true)
    assert.ok(toolPresetState.methodButtons.some(v=>v.method==="GET"&&v.active))
    assert.equal(await evaluate('(() => {const b=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="POST");if(!b)return false;b.click();return true})()'),true)
    await waitFor('document.body.innerText.includes("Open-Meteo /v1/forecast 应使用 GET")',"POST method warning")
    const badMethodState=await evaluate('(() => ({fix:[...document.querySelectorAll("button")].some(b=>b.textContent?.includes("切换为 GET")),testDisabled:[...document.querySelectorAll("button")].find(b=>b.textContent?.trim()==="测试调用")?.disabled}))()')
    assert.deepEqual(badMethodState,{fix:true,testDisabled:true})
    assert.equal(await evaluate('(() => {const b=[...document.querySelectorAll("button")].find(x=>x.textContent?.trim()==="切换为 GET");if(!b)return false;b.click();return true})()'),true)
    await waitFor('document.querySelector("section[aria-label=\\"请求配置检查\\"]")?.textContent?.includes("格式检查通过")',"GET quick fix")
    console.log("CHROME_STUDIO_TOOL_UX_PASS",JSON.stringify({preset:true,localValidation:true,postBlocked:true,oneClickFix:true,previewRedacted:true}))

    // Cross-workspace responsive layout regression. Every key product space
    // should expand to the available desktop width without horizontal overflow.
    const responsiveRoutes=[
      ["/","workbench"],["/model-connections","models"],
      ["/tool-connections","tools"],["/knowledge-bases","knowledge"],
      ["/plugin-market","plugins"],["/agent-run","run-center"],
    ]
    const widthResults=[]
    for(const width of [390,768,1780]){
      await command("Emulation.setDeviceMetricsOverride",{
        width,height:width===390?844:width===768?1024:950,
        deviceScaleFactor:1,mobile:width<1024,
      })
      for(const [route,marker] of responsiveRoutes){
        await command("Page.navigate",{url:webOrigin+route})
        await waitFor(`document.querySelector('[data-studio-fluid-page=${JSON.stringify(marker)}]')!==null`,
          "fluid workspace "+route)
        await sleep(95)
        const metrics=await evaluate(`(() => {
          const main=document.querySelector('[data-studio-fluid-page=${JSON.stringify(marker)}]')
          const rect=main?.getBoundingClientRect()
          return {windowWidth:window.innerWidth,
            contentWidth:document.documentElement.clientWidth,
            scroll:document.documentElement.scrollWidth,
            mainWidth:Math.round(rect?.width||0),
            mobileNavVisible:getComputedStyle(
              document.querySelector('nav[aria-label="移动端主要工作空间"]')
            ).display!=="none"}
        })()`)
        assert.equal(metrics.windowWidth,width,"unexpected emulated width in "+route)
        assert.ok(metrics.contentWidth>=width-18,
          "content width unexpectedly narrow in "+route+": "+JSON.stringify(metrics))
        assert.ok(metrics.scroll<=metrics.contentWidth+4,
          "horizontal overflow on "+route+" at "+width+": "+JSON.stringify(metrics))
        assert.ok(metrics.mainWidth>=metrics.contentWidth-(width<1024?6:310),
          "page still narrow centered on "+route+" at "+width+": "+JSON.stringify(metrics))
        assert.equal(metrics.mobileNavVisible,width<1024,
          "wrong responsive navigation on "+route+" at "+width)
        widthResults.push({route,width,mainWidth:metrics.mainWidth})
      }
    }
    console.log("CHROME_STUDIO_FULLWIDTH_WORKSPACES_PASS",JSON.stringify(widthResults))
    // "My Agents" must require explicit destructive confirmation, and deleting
    // the currently open Agent must retain its unsaved editor content.
    await command("Page.navigate",{url:webOrigin+"/"})
    await waitFor(`[...document.querySelectorAll("#my-specs li")]
      .some(item=>item.textContent?.includes("浏览器验收 Agent"))`,
      "saved Agent visible on workbench")
    const rowSelector='#my-specs li'
    const openSaved=await evaluate(`(() => {
      const row=[...document.querySelectorAll(${JSON.stringify(rowSelector)})]
        .find(el=>el.textContent?.includes("浏览器验收 Agent"))
      const button=[...row?.querySelectorAll("button")||[]]
        .find(el=>el.textContent?.trim()==="打开")
      if(!button)return false
      button.click()
      return true
    })()`)
    assert.equal(openSaved,true)
    await waitFor(`document.querySelector('#spec-editor input[aria-label="助手名称"]')
      ?.value==="浏览器验收 Agent"`,"loaded saved Agent in editor")
    assert.equal(await evaluate(`(() => {
      const row=[...document.querySelectorAll(${JSON.stringify(rowSelector)})]
        .find(el=>el.textContent?.includes("浏览器验收 Agent"))
      const button=row?.querySelector('button[aria-label^="删除 "]')
      if(!button)return false
      button.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('[role="group"][aria-label^="确认删除"]')!==null`,
      "Agent deletion requires explicit confirmation")
    assert.equal(await evaluate(`(() => {
      const dialog=document.querySelector('[role="group"][aria-label^="确认删除"]')
      const cancel=[...dialog?.querySelectorAll("button")||[]].find(b=>b.textContent?.includes("取消"))
      if(!cancel)return false
      cancel.click()
      return true
    })()`),true)
    await waitFor(`document.querySelector('[role="group"][aria-label^="确认删除"]')===null`,
      "cancel restores normal Agent row")
    assert.equal(await evaluate(`(() => {
      const row=[...document.querySelectorAll(${JSON.stringify(rowSelector)})]
        .find(el=>el.textContent?.includes("浏览器验收 Agent"))
      const button=row?.querySelector('button[aria-label^="删除 "]')
      if(!button)return false
      button.click()
      return true
    })()`),true)
    assert.equal(await evaluate(`(() => {
      const dialog=document.querySelector('[role="group"][aria-label^="确认删除"]')
      const confirm=[...dialog?.querySelectorAll("button")||[]]
        .find(b=>b.textContent?.trim()==="确认删除")
      if(!confirm)return false
      confirm.click()
      return true
    })()`),true)
    await waitFor(`document.body.textContent?.includes("当前编辑器内容仍保留")`,
      "deleted Agent remains editable but UNSAVED")
    await waitFor(`document.querySelector('#spec-editor button')!==null`,
      "unsaved editor remains present")
    const deletedOwnerRecord=await evaluate(`(async()=>{
      const token=JSON.parse(localStorage.getItem("agent_studio_employee_auth")||"{}").token
      const response=await fetch("/__pb/api/agent_specs/"+${JSON.stringify(createdAgent.id)},
        {headers:{Authorization:token}})
      return response.status
    })()`)
    assert.equal(deletedOwnerRecord,404)
    assert.equal(await evaluate(`(() => {
      const button=[...document.querySelectorAll('#spec-editor button')]
        .find(el=>el.textContent?.includes("保存到我的助手"))
      return !!button&&!button.disabled
    })()`),true,"deleted Agent editor must allow creating a new record")
    console.log("CHROME_STUDIO_SAFE_AGENT_DELETE_PASS",
      JSON.stringify({confirmation:true,cancel:true,serverDeleted:true,editorRetained:true}))
  } finally {
    if(browser){
      try{browser.client.close()}catch{}
      try {
        if(browser.child?.pid)spawnSync("taskkill",["/PID",String(browser.child.pid),"/T","/F"],{
          windowsHide:true,stdio:"ignore",
        })
      }catch{}
    }
    if(frontend && frontend.exitCode===null)frontend.kill()
    if(backend)await stopHeadlessPocketBase(backend)
    await sleep(250)
    if(provider) await new Promise(resolve=>provider.close(resolve))
    try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:4,retryDelay:200})}catch{}
    try{fs.rmSync(chromeProfile,{recursive:true,force:true,maxRetries:4,retryDelay:200})}catch{}
  }
})
