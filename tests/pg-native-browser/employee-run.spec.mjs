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
  childEnv.AGENT_STUDIO_PG_BROWSER_OWN_OPERATIONS="true"
  const child=spawn(process.execPath,["--experimental-strip-types",helper],{
    cwd:root,env:childEnv,stdio:["ignore","pipe","pipe"],windowsHide:true})
  let output="",timer,browser,context,page,info,control,heldRead,releaseRead,settleHeldRead,primaryFailure
  const cleanupErrors=[]
  const cleanupStep=async(name,work)=>{try{await work()}catch(error){cleanupErrors.push({name,error})}}
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
      await page.getByRole("button",{name:"我的概览与待办",exact:true}).click()
      const pendingOriginal=page.locator('[aria-label="最近运行与结果"] li').filter({hasText:"Alice Browser Agent"}).getByRole("button",{name:"打开原任务",exact:true})
      await expect(pendingOriginal).toBeVisible();await expect(pendingOriginal).toBeDisabled()
      expect((await control("state","GET")).submissions).toBe(1)
      await page.getByRole("button",{name:"运行 Agent",exact:true}).click()
      // Commit the recovery POST, then deliver its old response only after
      // navigation. Hidden workspaces must retain the request, not its data.
      let postReached,postRelease,postDone
      const reached=new Promise(resolve=>{postReached=resolve}),gate=new Promise(resolve=>{postRelease=resolve}),done=new Promise(resolve=>{postDone=resolve})
      const postUrl="**/__pg_native/api/v2/agent-specs/*/runs"
      const holdPost=async route=>{
        if(route.request().method()!=="POST"){await route.continue();return}
        try{const response=await route.fetch();postReached();await gate;await route.fulfill({response})}finally{postDone()}
      }
      await page.route(postUrl,holdPost)
      try{
        await page.getByRole("button",{name:"确认上次提交",exact:true}).click();await reached
        await page.getByRole("button",{name:"知识库 0",exact:true}).click()
        postRelease();await done
        await expect(page.getByRole("button",{name:"确认上次提交",exact:true})).toHaveCount(0)
        await expect(page.locator('section[aria-label="运行 Agent"] article[aria-label="任务详情"]')).toHaveCount(0)
        await page.getByRole("button",{name:"运行 Agent",exact:true}).click()
      }finally{postRelease();await page.unroute(postUrl,holdPost)}
      await expect(page.getByText("已确认上次提交，未创建重复任务。",{exact:true})).toBeVisible()
      const recovered=await control("state","GET")
      expect(recovered.runs).toBe(1);expect(recovered.submissions).toBe(2)
      expect(recovered.submitHashes).toHaveLength(2)
      expect(recovered.submitHashes[0]).toBe(recovered.submitHashes[1])
    })
    await test.step("model approval requires charge acknowledgement",async()=>{
      expect((await control("prepare")).status).toBe("prepared")
      await page.getByRole("button",{name:"刷新任务",exact:true}).click()
      const response=await page.request.get(new URL("/__pg_native/api/v2/own-overview",info.url).href)
      expect(response.status()).toBe(200)
      const record=(await response.json()).recent.find(row=>row.kind==="agent_single")
      expect(record?.status).toBe("awaiting_approval")
      const before=await control("state","GET")
      await page.getByRole("button",{name:"我的概览与待办",exact:true}).click()
      await page.locator('[aria-label="最近运行与结果"] li').filter({hasText:record.run_id}).getByRole("button",{name:"打开原任务",exact:true}).click()
      await expect(page.getByText("已重新核对并打开原任务。处理操作仍需在原任务中另行确认。",{exact:true})).toBeVisible()
      const approve=page.getByRole("button",{name:"批准模型调用",exact:true})
      await expect(approve).toBeVisible();await expect(approve).toBeDisabled()
      await expect(page.getByText("模型：Alice synthetic model · gpt-4.1-mini",{exact:true})).toBeVisible()
      await expect(page.getByRole("checkbox",{name:"我已核对任务与模型，确认调用可能产生费用。",exact:true})).not.toBeChecked()
      expect((await control("state","GET")).generated).toBe(before.generated)
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
    await test.step("actual own metadata opens the exact single task without submitting or granting consent",async()=>{
      const before=await control("state","GET")
      const response=await page.request.get(new URL("/__pg_native/api/v2/own-overview",info.url).href)
      expect(response.status()).toBe(200)
      const own=await response.json(),record=own.recent.find(row=>row.kind==="agent_single")
      expect(record?.resource_name).toBe("Alice Browser Agent")
      await page.getByRole("button",{name:"我的概览与待办",exact:true}).click()
      const row=page.locator('[aria-label="最近运行与结果"] li').filter({hasText:record.run_id})
      await row.getByRole("button",{name:"打开原任务",exact:true}).click()
      await expect(page.getByText("已重新核对并打开原任务。处理操作仍需在原任务中另行确认。",{exact:true})).toBeVisible()
      const detail=page.locator('section[aria-label="运行 Agent"] article[aria-label="任务详情"]')
      await expect(detail).toContainText(instruction);await expect(detail).toContainText(record.run_id)
      await expect(detail).toContainText("Browser synthetic bound result")
      await expect(page.getByRole("checkbox",{name:"我已核对任务与模型，确认调用可能产生费用。",exact:true})).toHaveCount(0)
      const after=await control("state","GET")
      expect(after.submissions).toBe(before.submissions);expect(after.runs).toBe(before.runs);expect(after.generated).toBe(before.generated)
    })
    await test.step("returning to the Agent tab cannot display its old result before a fresh read",async()=>{
      await page.getByRole("button",{name:"知识库 0",exact:true}).click()
      await expect(page.getByText("Browser synthetic bound result",{exact:true})).toHaveCount(0)
      let reached,release,done
      const readReached=new Promise(resolve=>{reached=resolve}),gate=new Promise(resolve=>{release=resolve}),completed=new Promise(resolve=>{done=resolve})
      const detailUrl="**/__pg_native/api/v2/runs/*"
      const holdDetail=async route=>{
        if(route.request().method()!=="GET"){await route.continue();return}
        try{const response=await route.fetch();reached();await gate;await route.fulfill({response})}finally{done()}
      }
      await page.route(detailUrl,holdDetail)
      try{
        await page.getByRole("button",{name:"运行 Agent",exact:true}).click();await readReached
        await expect(page.getByText("Browser synthetic bound result",{exact:true})).toHaveCount(0)
        release();await completed
        await expect(page.getByText("Browser synthetic bound result",{exact:true})).toBeVisible()
        expect((await control("state","GET")).generated).toBe(1)
      }finally{release();await page.unroute(detailUrl,holdDetail)}
    })
    await test.step("delayed real Alice detail and own metadata responses cannot rehydrate Bob's workspace",async()=>{
      const readReached=new Promise(resolve=>{heldRead=resolve})
      const released=new Promise(resolve=>{releaseRead=resolve})
      let intercepted=false,readDone
      const settledRead=new Promise(resolve=>{readDone=resolve})
      settleHeldRead=()=>intercepted?settledRead:Promise.resolve()
      const detailUrl="**/__pg_native/api/v2/runs/*",holdLateDetail=async route=>{
        if(intercepted||route.request().method()!=="GET"){await route.continue();return}
        intercepted=true
        try{const response=await route.fetch();heldRead();await released;await route.fulfill({response})}finally{readDone()}
      }
      await page.route(detailUrl,holdLateDetail)
      await page.getByRole("button",{name:"刷新任务",exact:true}).click()
      await readReached;await page.unroute(detailUrl,holdLateDetail)
      let ownReached,ownRelease,ownDone
      const reachedOwn=new Promise(resolve=>{ownReached=resolve}),ownGate=new Promise(resolve=>{ownRelease=resolve}),doneOwn=new Promise(resolve=>{ownDone=resolve})
      const ownUrl="**/__pg_native/api/v2/own-overview"
      let ownIntercepted=false
      const holdOwn=async route=>{
        if(ownIntercepted||route.request().method()!=="GET"){await route.continue();return}
        ownIntercepted=true
        try{const response=await route.fetch();ownReached();await ownGate;await route.fulfill({response})}finally{ownDone()}
      }
      await page.route(ownUrl,holdOwn)
      try{
        await page.getByRole("button",{name:"我的概览与待办",exact:true}).click();await reachedOwn
        // Only this already-fetched Alice response is delayed. Bob's fresh
        // reads must never enter the old gate or outlive its route handler.
        await page.unroute(ownUrl,holdOwn)
        await page.getByRole("button",{name:"退出",exact:true}).click()
        await expect(page.getByRole("button",{name:"登录独立工作台",exact:true})).toBeVisible()
        await login("bob")
        releaseRead();releaseRead=null;await settledRead
        ownRelease();await doneOwn
        await page.getByRole("button",{name:"我的概览与待办",exact:true}).click()
        const bobOwn=page.getByRole("region",{name:"我的运行概览与待办",exact:true})
        await expect(bobOwn.getByText("暂无最近运行。",{exact:true})).toBeVisible()
        await expect(bobOwn).not.toContainText("Alice Browser Agent");await expect(bobOwn).not.toContainText(instruction)
        await expect(bobOwn).not.toContainText("Browser synthetic bound result")
        await page.getByRole("button",{name:"运行 Agent",exact:true}).click()
        await expect(page.getByRole("combobox",{name:"选择 Agent",exact:true})).toContainText("Bob Browser Agent")
        await expect(page.getByRole("combobox",{name:"选择 Agent",exact:true})).not.toContainText("Alice Browser Agent")
        await expect(page.getByText(instruction,{exact:true})).toHaveCount(0)
        await expect(page.getByText("Browser synthetic bound result",{exact:true})).toHaveCount(0)
        await expect(page.getByRole("textbox",{name:"任务要求",exact:true})).toHaveValue("")
      }finally{
        ownRelease()
        await cleanupStep("unroute delayed own response",()=>page.unroute(ownUrl,holdOwn))
        if(ownIntercepted)await cleanupStep("settle delayed own response",()=>doneOwn)
      }
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
  }catch(error){primaryFailure=error;throw error}
  finally{
    clearTimeout(timer)
    if(releaseRead)releaseRead()
    if(settleHeldRead)await cleanupStep("settle delayed task response",settleHeldRead)
    if(context)await cleanupStep("close browser context",()=>context.close())
    if(browser)await cleanupStep("close browser",()=>browser.close())
    if(control)await cleanupStep("stop synthetic fixture",()=>control("stop"))
    if(child.exitCode===null)await cleanupStep("wait for synthetic child exit",async()=>{
      const exited=new Promise(resolve=>child.once("exit",resolve))
      const forced=setTimeout(()=>child.kill("SIGTERM"),5000)
      try{await exited}finally{clearTimeout(forced)}
    })
    if(cleanupErrors.length){
      const failure=new AggregateError(cleanupErrors.map(({name,error})=>new Error(name,{cause:error})),"employee_browser_cleanup_failed")
      if(primaryFailure)console.error(failure)
      else throw failure
    }
  }
})
