import {test,expect,chromium} from "@playwright/test"
import {spawn} from "node:child_process"
import {fileURLToPath} from "node:url"
import path from "node:path"
import {requireNativeBrowserCi} from "./ci-guard.mjs"

test("owner-bound employee Run: lost response, charge consent, private mTLS, logout fence and revoked capability",async({},testInfo)=>{
  const approved=requireNativeBrowserCi() // FIRST: no file/browser/child/network before this.
  const root=path.resolve(fileURLToPath(new URL("../../",import.meta.url)))
  const helper=path.join(root,"services/pg-api/tests/helpers/native-run-browser-fixture.mjs")
  const childEnv=Object.fromEntries(["PATH","HOME","TMPDIR","TEMP","TMP","LANG"]
    .filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  childEnv.AGENT_STUDIO_PG_BROWSER_FIXTURE="SYNTHETIC_LOCAL_ONLY"
  const child=spawn(process.execPath,["--experimental-strip-types",helper],{
    cwd:root,env:childEnv,stdio:["ignore","pipe","pipe"],windowsHide:true})
  let output="",timer,browser,context,page,info,control,heldRead,releaseRead
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error("synthetic_fixture_start_timeout")),45000)
    const onChunk=chunk=>{
      output=(output+chunk.toString()).slice(-32768)
      for(const line of output.split(/\r?\n/)){
        if(!line.startsWith('{"synthetic_only":true,'))continue
        try{resolve(JSON.parse(line))}catch{}
      }
    }
    child.stdout.on("data",onChunk);child.stderr.on("data",onChunk)
    child.once("error",reject)
    child.once("exit",code=>reject(Error("synthetic_fixture_early_exit_"+code)))
  })
  try{
    info=await ready;clearTimeout(timer)
    expect(info.synthetic_only).toBe(true)
    expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536).toBe(true)
    control=async(name,method="POST")=>{
      const res=await fetch("http://127.0.0.1:"+info.apiPort+"/__fixture/"+name,{method,
        headers:{"X-AgentStudio-Synthetic-Fixture":"1"},signal:AbortSignal.timeout(15000)})
      expect(res.status).toBe(200);return res.json()
    }
    browser=await chromium.launch({headless:true})
    context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"})
    context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(20000)
    const external=[]
    await context.route("**/*",async route=>{
      const url=new URL(route.request().url())
      if(url.origin!==approved.origin){external.push(url.origin);await route.abort();return}
      await route.continue()
    })
    page=await context.newPage()
    await page.goto(info.url,{waitUntil:"domcontentloaded"})
    const login=async(who)=>{
      await page.getByRole("textbox",{name:"员工邮箱",exact:true}).fill(who+"@example.com")
      await page.getByLabel("密码",{exact:true}).fill(who==="alice"?"SyntheticAlicePassword#2026":"SyntheticBobPassword#2026")
      await page.getByRole("button",{name:"登录独立工作台",exact:true}).click()
      await expect(page.getByRole("button",{name:"运行 Agent",exact:true})).toBeVisible()
    }
    await test.step("native Cookie login and owner-only model selection",async()=>{
      await login("alice")
      await page.getByRole("button",{name:"运行 Agent",exact:true}).click()
      await expect(page.getByRole("combobox",{name:"选择 Agent",exact:true})).toContainText("Alice Browser Agent")
      await expect(page.getByRole("combobox",{name:"选择 Agent",exact:true})).not.toContainText("Bob Browser Agent")
    })
    const instruction="Alice private CI task"
    await test.step("committed response loss survives workspace navigation with one durable task",async()=>{
      await control("drop-next")
      await page.getByRole("combobox",{name:"选择 Agent",exact:true}).selectOption({label:"Alice Browser Agent · gpt-4.1-mini"})
      await page.getByRole("textbox",{name:"任务要求",exact:true}).fill(instruction)
      await page.getByRole("button",{name:"提交任务",exact:true}).click()
      await expect(page.getByRole("button",{name:"确认上次提交",exact:true})).toBeEnabled()
      await expect(page.getByRole("textbox",{name:"任务要求",exact:true})).toBeDisabled()
      expect((await control("state","GET")).runs).toBe(1)
      await page.getByRole("button",{name:"知识库 0",exact:true}).click()
      await page.getByRole("button",{name:"运行 Agent",exact:true}).click()
      await page.getByRole("button",{name:"确认上次提交",exact:true}).click()
      await expect(page.getByText("已确认上次提交，未创建重复任务。",{exact:true})).toBeVisible()
      const recovered=await control("state","GET")
      expect(recovered.runs).toBe(1);expect(recovered.submissions).toBe(2)
      expect(recovered.submitHashes).toHaveLength(2)
      expect(recovered.submitHashes[0]).toBe(recovered.submitHashes[1])
    })
    await test.step("model approval requires charge acknowledgement",async()=>{
      expect((await control("prepare")).status).toBe("prepared")
      await page.getByRole("button",{name:"刷新任务",exact:true}).click()
      const approve=page.getByRole("button",{name:"批准模型调用",exact:true})
      await expect(approve).toBeVisible();await expect(approve).toBeDisabled()
      await expect(page.getByText("模型：Alice synthetic model · gpt-4.1-mini",{exact:true})).toBeVisible()
      await page.getByRole("checkbox",{name:"我已核对任务与模型，确认调用可能产生费用。",exact:true}).check()
      await approve.click()
      await expect(page.getByText("已批准模型步骤，后台处理可能产生费用。",{exact:true})).toBeVisible()
    })
    await test.step("private mTLS Worker returns exactly one synthetic result",async()=>{
      expect((await control("model")).status).toBe("succeeded")
      expect((await control("model")).status).toBe("idle")
      await page.getByRole("button",{name:"刷新任务",exact:true}).click()
      await expect(page.getByText("Browser synthetic bound result",{exact:true})).toBeVisible()
      expect((await control("state","GET")).generated).toBe(1)
      await page.screenshot({path:testInfo.outputPath("employee-run-desktop.png"),fullPage:true})
      await page.setViewportSize({width:390,height:844})
      await expect(page.getByRole("button",{name:"刷新任务",exact:true})).toBeVisible()
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
      await page.screenshot({path:testInfo.outputPath("employee-run-mobile.png"),fullPage:true})
      await page.setViewportSize({width:1280,height:900})
    })
    await test.step("a delayed Alice detail response cannot rehydrate Bob's workspace",async()=>{
      const readReached=new Promise(resolve=>{heldRead=resolve})
      const released=new Promise(resolve=>{releaseRead=resolve})
      let intercepted=false
      await page.route("**/__pg_native/api/v2/runs/*",async route=>{
        if(intercepted||route.request().method()!=="GET"){await route.continue();return}
        intercepted=true
        const response=await route.fetch()
        heldRead();await released;await route.fulfill({response})
      })
      await page.getByRole("button",{name:"刷新任务",exact:true}).click()
      await readReached
      await page.getByRole("button",{name:"退出",exact:true}).click()
      await expect(page.getByRole("button",{name:"登录独立工作台",exact:true})).toBeVisible()
      await login("bob")
      releaseRead();releaseRead=null
      await page.getByRole("button",{name:"运行 Agent",exact:true}).click()
      await expect(page.getByRole("combobox",{name:"选择 Agent",exact:true})).toContainText("Bob Browser Agent")
      await expect(page.getByRole("combobox",{name:"选择 Agent",exact:true})).not.toContainText("Alice Browser Agent")
      await expect(page.getByText(instruction,{exact:true})).toHaveCount(0)
      await expect(page.getByText("Browser synthetic bound result",{exact:true})).toHaveCount(0)
      await expect(page.getByRole("textbox",{name:"任务要求",exact:true})).toHaveValue("")
    })
    await test.step("revoked server admission removes controls without changing history permissions",async()=>{
      await control("deny-runs")
      await page.getByRole("button",{name:"刷新",exact:true}).click()
      await expect(page.getByRole("button",{name:"运行 Agent",exact:true})).toHaveCount(0)
      await expect(page.getByText("当前环境未授权提交模型任务。已有记录可在运行历史中查看。",{exact:true})).toBeVisible()
      await expect(page.getByRole("button",{name:"Agent 运行历史（只读）",exact:true})).toBeVisible()
      expect(external).toEqual([])
      const final=await control("state","GET")
      expect(final.runs).toBe(1);expect(final.generated).toBe(1)
    })
  }finally{
    clearTimeout(timer)
    if(releaseRead)releaseRead()
    if(context)await context.close()
    if(browser)await browser.close()
    if(control)await control("stop").catch(()=>undefined)
    if(child.exitCode===null){
      const exited=new Promise(resolve=>child.once("exit",resolve))
      const forced=setTimeout(()=>child.kill("SIGTERM"),5000)
      await exited;clearTimeout(forced)
    }
  }
})
