import {test,expect,chromium} from "@playwright/test"
import {spawn} from "node:child_process"
import {fileURLToPath} from "node:url"
import path from "node:path"
import {requireNativeBrowserCi} from "./ci-guard.mjs"
test("multi-round employee Agent: exact recovery, per-step consent, mTLS, safe cancellation and session isolation",async({},testInfo)=>{
  const approved=requireNativeBrowserCi() // FIRST: no child, file I/O, socket or browser before this guard.
  const root=path.resolve(fileURLToPath(new URL("../../",import.meta.url)))
  const env=Object.fromEntries(["PATH","HOME","TMPDIR","TEMP","TMP","LANG"].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]))
  Object.assign(env,{AGENT_STUDIO_PG_BROWSER_FIXTURE:"SYNTHETIC_LOCAL_ONLY",AGENT_STUDIO_PG_BROWSER_AUTONOMOUS:"true"})
  const child=spawn(process.execPath,["--experimental-strip-types",path.join(root,"services/pg-api/tests/helpers/native-run-browser-fixture.mjs")],{
    cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true})
  let browser,context,page,control,releaseRead,timer,output=""
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error("synthetic_fixture_start_timeout")),45000)
    const chunk=bytes=>{output=(output+bytes.toString()).slice(-32768)
      for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on("data",chunk);child.stderr.on("data",chunk);child.once("error",reject);child.once("exit",code=>reject(Error("fixture_exit_"+code)))
  })
  try{
    const info=await ready;clearTimeout(timer)
    expect(info.synthetic_only).toBe(true);expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536).toBe(true)
    control=async(name,method="POST")=>{const response=await fetch("http://127.0.0.1:"+info.apiPort+"/__fixture/"+name,{method,
      headers:{"X-AgentStudio-Synthetic-Fixture":"1"},signal:AbortSignal.timeout(15000)})
      expect(response.status).toBe(200);return response.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"})
    const external=[]
    await context.route("**/*",async route=>{if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()})
    page=await context.newPage();await page.goto(info.url,{waitUntil:"domcontentloaded"})
    const login=async(who)=>{await page.getByRole("textbox",{name:"员工邮箱",exact:true}).fill(who+"@example.com")
      await page.getByLabel("密码",{exact:true}).fill(who==="alice"?"SyntheticAlicePassword#2026":"SyntheticBobPassword#2026")
      await page.getByRole("button",{name:"登录独立工作台",exact:true}).click();await page.getByRole("button",{name:"多轮 Agent",exact:true}).click()}
    const refresh=()=>page.getByRole("button",{name:"刷新多轮任务",exact:true}).click()
    const approve=async(charged)=>{
      const button=page.getByRole("button",{name:"批准当前步骤",exact:true});await expect(button).toBeDisabled()
      await page.getByRole("checkbox",{name:charged?"我已核对本次模型调用，确认可能产生费用。":"我已核对当前步骤及其数据范围，允许本次操作。",exact:true}).check()
      await button.click();await expect(page.getByText("已批准当前步骤。",{exact:true})).toBeVisible()
    }
    await login("alice")
    await expect(page.getByRole("combobox",{name:"多轮 Agent 角色",exact:true})).not.toContainText("Bob Browser Agent")
    await page.getByRole("combobox",{name:"多轮 Agent 角色",exact:true}).selectOption({label:"Alice Browser Agent · gpt-4.1-mini"})
    await page.getByRole("textbox",{name:"多轮任务要求",exact:true}).fill("Alice private autonomous task")
    await control("drop-next");await page.getByRole("button",{name:"提交多轮任务",exact:true}).click()
    await expect(page.getByRole("button",{name:"确认上次多轮提交",exact:true})).toBeEnabled()
    await expect(page.getByRole("textbox",{name:"多轮任务要求",exact:true})).toBeDisabled()
    await page.getByRole("button",{name:"知识库 0",exact:true}).click();await page.getByRole("button",{name:"多轮 Agent",exact:true}).click()
    await page.getByRole("button",{name:"确认上次多轮提交",exact:true}).click()
    await expect(page.getByText("已确认上次提交，未创建重复任务。",{exact:true})).toBeVisible()
    const recovered=await control("state","GET");expect(recovered.runs).toBe(1);expect(recovered.submissions).toBe(2)
    expect(recovered.submitHashes[0]).toBe(recovered.submitHashes[1])
    expect((await control("autonomous")).status).toBe("awaiting_approval");await refresh();await approve(false)
    expect((await control("autonomous")).status).toBe("progressed")
    expect((await control("autonomous")).status).toBe("awaiting_approval");await refresh();await approve(true)
    expect((await control("autonomous")).status).toBe("progressed")
    expect((await control("autonomous")).status).toBe("awaiting_approval");await refresh()
    await expect(page.getByRole("region",{name:"当前步骤审批"})).toContainText("2+2");await approve(false)
    expect((await control("autonomous")).status).toBe("progressed")
    expect((await control("autonomous")).status).toBe("awaiting_approval");await refresh();await approve(true)
    expect((await control("autonomous")).status).toBe("progressed")
    expect((await control("autonomous")).status).toBe("succeeded");await refresh()
    await expect(page.getByText("Browser synthetic autonomous result 4",{exact:true})).toBeVisible()
    expect((await control("state","GET")).generated).toBe(2)
    await page.screenshot({path:testInfo.outputPath("autonomous-desktop.png"),fullPage:true})
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
    await page.screenshot({path:testInfo.outputPath("autonomous-mobile.png"),fullPage:true});await page.setViewportSize({width:1280,height:900})
    await page.getByRole("button",{name:/^Agent 配置/}).click()
    const httpPanel=page.getByRole("region",{name:"Agent HTTP 工具绑定"})
    await httpPanel.getByRole("combobox",{name:"工具绑定 Agent",exact:true}).selectOption({label:"Alice Browser Agent"})
    await expect(httpPanel).not.toContainText("Bob synthetic HTTP")
    await httpPanel.getByRole("checkbox",{name:/Alice synthetic HTTP/}).check()
    await httpPanel.getByRole("textbox",{name:"Alice synthetic HTTP 用途与参数",exact:true}).fill("Lookup synthetic evidence; params: query")
    const saved=page.waitForResponse(response=>response.request().method()==="PATCH"&&response.url().includes("/api/v2/agent-specs/"))
    await httpPanel.getByRole("button",{name:"保存 HTTP 工具绑定",exact:true}).click();expect((await saved).status()).toBe(200)
    await expect(httpPanel.getByRole("button",{name:"保存 HTTP 工具绑定",exact:true})).toBeEnabled()
    expect((await control("state","GET")).httpCalls).toBe(0)
    await page.getByRole("button",{name:"多轮 Agent",exact:true}).click()
    await page.getByRole("textbox",{name:"多轮任务要求",exact:true}).fill("Run synthetic owner HTTP Tool")
    await page.getByRole("button",{name:"提交多轮任务",exact:true}).click()
    for(const charged of [false,true,false,true]){
      expect((await control("autonomous")).status).toBe("awaiting_approval");await refresh()
      if(!charged&&(await control("state","GET")).generated===3){
        await expect(page.getByRole("region",{name:"当前步骤审批"})).toContainText("Alice synthetic HTTP")
        await expect(page.getByRole("region",{name:"当前步骤审批"})).toContainText("POST https://tools.example.com/lookup")
        expect((await control("state","GET")).httpCalls).toBe(0)
      }
      await approve(charged);expect((await control("autonomous")).status).toBe("progressed")
    }
    expect((await control("autonomous")).status).toBe("succeeded");await refresh()
    expect((await control("state","GET")).httpCalls).toBe(1)
    await page.screenshot({path:testInfo.outputPath("autonomous-http-tool.png"),fullPage:true})
    await page.getByRole("button",{name:/^工具连接/}).click()
    const mcpPanel=page.getByRole("region",{name:"MCP 远程连接"})
    await mcpPanel.getByRole("textbox",{name:"MCP 连接名称",exact:true}).fill("Alice synthetic MCP")
    await mcpPanel.getByRole("textbox",{name:"MCP 连接用途",exact:true}).fill("Synthetic discovery only")
    await mcpPanel.getByRole("textbox",{name:"MCP 服务地址",exact:true}).fill("https://mcp.example.com/server")
    let lostMcp=false
    await page.route("**/__pg_native/api/v2/mcp-connections",async route=>{
      if(lostMcp||route.request().method()!=="POST"){await route.continue();return}
      lostMcp=true;const response=await route.fetch();expect(response.status()).toBe(201);await route.abort("connectionreset")
    })
    await mcpPanel.getByRole("button",{name:"保存 MCP 连接",exact:true}).click()
    await expect(mcpPanel.getByRole("button",{name:"读取当前连接核对上次操作",exact:true})).toBeEnabled()
    await page.getByRole("button",{name:/^Agent 配置/}).click();await page.getByRole("button",{name:/^工具连接/}).click()
    await mcpPanel.getByRole("button",{name:"读取当前连接核对上次操作",exact:true}).click()
    await expect(mcpPanel.getByText("已读取当前连接，请核对最新配置。加密请求头值不会显示。",{exact:true})).toBeVisible()
    expect((await control("state","GET")).mcpConnections).toBe(1)
    expect((await control("state","GET")).mcpDiscoveries).toBe(0)
    await mcpPanel.getByRole("button",{name:"发现此连接的 MCP 工具",exact:true}).click()
    await expect(mcpPanel.getByText("工具发现完成，未执行任何工具。",{exact:true})).toBeVisible()
    await expect(mcpPanel.getByRole("group",{name:"已发现的 MCP 工具"})).toContainText("synthetic_lookup")
    const afterMcp=await control("state","GET");expect(afterMcp.mcpDiscoveries).toBe(1);expect(afterMcp.generated).toBe(4);expect(afterMcp.runs).toBe(2)
    await page.screenshot({path:testInfo.outputPath("mcp-discovery-only.png"),fullPage:true})
    await page.getByRole("button",{name:"多轮 Agent",exact:true}).click()
    await page.getByRole("textbox",{name:"多轮任务要求",exact:true}).fill("Cancel unstarted task")
    await page.getByRole("button",{name:"提交多轮任务",exact:true}).click()
    await page.getByRole("button",{name:"取消任务",exact:true}).click();await page.getByRole("button",{name:"确认取消此任务",exact:true}).click()
    await expect(page.getByText("任务已取消。",{exact:true})).toBeVisible()
    let reached;const held=new Promise(resolve=>{reached=resolve}),release=new Promise(resolve=>{releaseRead=resolve});let intercepted=false
    await page.route("**/__pg_native/api/v2/agent-autonomous-runs/*",async route=>{
      if(intercepted||route.request().method()!=="GET"){await route.continue();return}intercepted=true
      const response=await route.fetch();reached();await release;await route.fulfill({response})
    })
    await refresh();await held;await page.getByRole("button",{name:"退出",exact:true}).click()
    await expect(page.getByRole("button",{name:"登录独立工作台",exact:true})).toBeVisible();await login("bob");releaseRead();releaseRead=null
    await expect(page.getByRole("combobox",{name:"多轮 Agent 角色",exact:true})).toContainText("Bob Browser Agent")
    await expect(page.getByText("Alice private autonomous task",{exact:true})).toHaveCount(0)
    await expect(page.getByText("Cancel unstarted task",{exact:true})).toHaveCount(0)
    await expect(page.getByText("Browser synthetic autonomous result 4",{exact:true})).toHaveCount(0)
    await expect(page.getByRole("textbox",{name:"多轮任务要求",exact:true})).toHaveValue("")
    await control("deny-runs");await page.getByRole("button",{name:"刷新",exact:true}).click()
    await expect(page.getByRole("button",{name:"提交多轮任务",exact:true})).toBeDisabled()
    await expect(page.getByText("当前环境未开放多轮任务提交和审批。已有记录仍可查看，允许取消的任务可取消。",{exact:true})).toBeVisible()
    expect(external).toEqual([]);const final=await control("state","GET");expect(final.runs).toBe(3);expect(final.generated).toBe(4);expect(final.httpCalls).toBe(1)
  }finally{
    clearTimeout(timer);releaseRead?.();if(context)await context.close();if(browser)await browser.close()
    if(control)await control("stop").catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once("exit",resolve)),forced=setTimeout(()=>child.kill("SIGTERM"),5000);await exited;clearTimeout(forced)}
  }
})
