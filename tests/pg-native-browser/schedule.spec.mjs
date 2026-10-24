import {test,expect,chromium} from "@playwright/test"
import {spawn} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {requireNativeBrowserCi} from "./ci-guard.mjs"
test("native schedule: owner grant, exact activation recovery, once-per-minute queue, completion and pause",async({},testInfo)=>{
  const approved=requireNativeBrowserCi() // FIRST effectful gate; never run on a developer workstation.
  const root=path.resolve(fileURLToPath(new URL("../../",import.meta.url)))
  const env=Object.fromEntries(["PATH","HOME","TMPDIR","TEMP","TMP","LANG"].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))
  Object.assign(env,{AGENT_STUDIO_PG_BROWSER_FIXTURE:"SYNTHETIC_LOCAL_ONLY",AGENT_STUDIO_PG_BROWSER_WORKFLOW:"true",AGENT_STUDIO_PG_BROWSER_SCHEDULE:"true"})
  const child=spawn(process.execPath,["--experimental-strip-types",path.join(root,"services/pg-api/tests/helpers/native-run-browser-fixture.mjs")],{cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true})
  let browser,context,page,control,timer,output=""
  const ready=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error("synthetic_fixture_timeout")),45000)
    const consume=chunk=>{output=(output+chunk.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on("data",consume);child.stderr.on("data",consume);child.once("error",reject);child.once("exit",code=>reject(Error("synthetic_fixture_exit_"+code)))
  })
  try{
    const info=await ready;clearTimeout(timer);expect(new URL(info.url).origin).toBe(approved.origin)
    control=async(name,method="POST")=>{const r=await fetch("http://127.0.0.1:"+info.apiPort+"/__fixture/"+name,{method,headers:{"X-AgentStudio-Synthetic-Fixture":"1"},signal:AbortSignal.timeout(15000)});expect(r.status).toBe(200);return r.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"})
    const external=[];await context.route("**/*",async route=>{if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()})
    page=await context.newPage();const activations=[]
    page.on("request",request=>{if(request.method()==="POST"&&request.url().endsWith("/activate"))activations.push(request.postDataJSON())})
    await page.goto(info.url,{waitUntil:"domcontentloaded"})
    const login=async who=>{await page.getByRole("textbox",{name:"员工邮箱",exact:true}).fill(who+"@example.com");await page.getByLabel("密码",{exact:true}).fill(who==="alice"?"SyntheticAlicePassword#2026":"SyntheticBobPassword#2026");await page.getByRole("button",{name:"登录独立工作台",exact:true}).click();await expect(page.getByRole("button",{name:"定时计划草稿",exact:true})).toBeVisible()}
    await login("alice")
    await page.getByRole("button",{name:/^Workflow \d+$/}).click();await page.getByRole("textbox",{name:"新工作流名称",exact:true}).fill("Alice schedule flow")
    await page.getByRole("button",{name:"新建画布草稿",exact:true}).click()
    await page.getByRole("button",{name:"保存工作流",exact:true}).click()
    await expect.poll(async()=>(await control("state","GET")).workflows).toBe(1)
    await page.getByRole("button",{name:"定时计划草稿",exact:true}).click();await page.getByRole("button",{name:"新建草稿",exact:true}).click()
    await page.getByRole("textbox",{name:"计划名称",exact:true}).fill("Alice recurring task")
    await page.getByRole("combobox",{name:"关联类型",exact:true}).selectOption("workflow")
    await page.getByRole("combobox",{name:"本人目标配置",exact:true}).selectOption({label:"Alice schedule flow"})
    await page.getByRole("combobox",{name:"重复类型",exact:true}).selectOption("interval")
    await page.getByRole("button",{name:"保存停用草稿",exact:true}).click()
    const inspect=()=>page.getByRole("button",{name:/Alice recurring task/}).click()
    await inspect();await expect(page.getByText("尚未授予后台运行权限",{exact:false})).toBeVisible()
    await page.getByRole("textbox",{name:"每次运行的任务说明",exact:true}).fill("Synthetic recurring browser instruction")
    await expect(page.getByRole("button",{name:"确认授权并启用",exact:true})).toBeDisabled()
    await page.getByRole("checkbox",{name:/持续执行直至暂停/}).check()
    const effectiveDate=new Date(Date.now()+2*86400000).toISOString().slice(0,10)
    await page.getByRole("checkbox",{name:/从指定时间生效/}).check()
    await page.getByLabel("首次生效日期",{exact:true}).fill(effectiveDate)
    await page.getByLabel("首次生效时间",{exact:true}).fill("11:20")
    await page.getByRole("checkbox",{name:/我授权当前目标和连接版本/}).check()
    await page.getByRole("region",{name:"计划执行授权",exact:true}).screenshot({path:testInfo.outputPath("native-schedule-future-consent.png")})
    await control("drop-next-schedule");await page.getByRole("button",{name:"确认授权并启用",exact:true}).click()
    await expect(page.getByRole("button",{name:"用原请求重试启用",exact:true})).toBeEnabled()
    await page.getByRole("button",{name:"用原请求重试启用",exact:true}).click()
    await expect(page.getByRole("button",{name:"立即运行",exact:true})).toBeEnabled()
    const recovered=await control("state","GET");expect(recovered.scheduleHashes).toHaveLength(2);expect(recovered.scheduleHashes[0]).toBe(recovered.scheduleHashes[1]);expect(recovered.runs).toBe(0)
    expect(activations).toHaveLength(2);expect(activations[0]).toEqual(activations[1])
    expect(activations[0].anchor_at).toBe(effectiveDate+"T03:20:00.000Z") // Asia/Shanghai plan timezone.
    await page.getByText("重新授予后台权限",{exact:true}).click()
    await expect(page.getByRole("checkbox",{name:/从指定时间生效/})).toBeChecked()
    await expect(page.getByLabel("首次生效日期",{exact:true})).toHaveValue(effectiveDate)
    await expect(page.getByLabel("首次生效时间",{exact:true})).toHaveValue("11:20")
    expect((await control("schedule")).status).toBe("idle")
    const queuedResponse=page.waitForResponse(response=>response.url().endsWith("/run-now")&&response.status()===200)
    await page.getByRole("button",{name:"立即运行",exact:true}).click();await queuedResponse;await control("schedule");await control("workflow")
    await inspect();await expect(page.getByText(/运行完成/)).toBeVisible()
    await page.getByRole("button",{name:"立即运行",exact:true}).click();await expect(page.getByRole("alert")).toContainText("本分钟已经排队")
    expect((await control("state","GET")).runs).toBe(1)
    const pausedResponse=page.waitForResponse(response=>response.url().endsWith("/pause")&&response.status()===200)
    await page.getByRole("button",{name:"暂停并撤销授权",exact:true}).click();await pausedResponse;await expect(page.getByRole("button",{name:"立即运行",exact:true})).toBeDisabled()
    await page.screenshot({path:testInfo.outputPath("native-schedule-paused.png"),fullPage:true})
    await page.getByRole("button",{name:"退出",exact:true}).click();await login("bob");await page.getByRole("button",{name:"定时计划草稿",exact:true}).click()
    await expect(page.getByText("Alice recurring task",{exact:false})).toHaveCount(0);expect(external).toHaveLength(0)
  }catch(error){if(page)await page.screenshot({path:testInfo.outputPath("native-schedule-failure.png"),fullPage:true}).catch(()=>{});throw error}
  finally{clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control("stop").catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once("exit",resolve)),kill=setTimeout(()=>child.kill("SIGTERM"),5000);await exited;clearTimeout(kill)}}
})
