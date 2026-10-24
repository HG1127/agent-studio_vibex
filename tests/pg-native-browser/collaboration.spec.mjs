import {test,expect,chromium} from "@playwright/test"
import {spawn} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {requireNativeBrowserCi} from "./ci-guard.mjs"
test("native collaboration: actor isolation, exact request recovery, private-source fences and safe owner restoration",async({},testInfo)=>{
  const approved=requireNativeBrowserCi() // FIRST effectful gate; hosted synthetic runner only.
  const root=path.resolve(fileURLToPath(new URL("../../",import.meta.url)))
  const env=Object.fromEntries(["PATH","HOME","TMPDIR","TEMP","TMP","LANG"].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))
  Object.assign(env,{AGENT_STUDIO_PG_BROWSER_FIXTURE:"SYNTHETIC_LOCAL_ONLY",AGENT_STUDIO_PG_BROWSER_WORKFLOW:"true",AGENT_STUDIO_PG_BROWSER_SCHEDULE:"true",AGENT_STUDIO_PG_BROWSER_COLLABORATION:"true"})
  const child=spawn(process.execPath,["--experimental-strip-types",path.join(root,"services/pg-api/tests/helpers/native-run-browser-fixture.mjs")],{cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true})
  let browser,context,page,control,timer,output=""
  const ready=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error("synthetic_fixture_timeout")),45000)
    const consume=chunk=>{output=(output+chunk.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on("data",consume);child.stderr.on("data",consume);child.once("error",reject);child.once("exit",code=>reject(Error("synthetic_fixture_exit_"+code)))
  })
  try{
    const info=await ready;clearTimeout(timer);expect(new URL(info.url).origin).toBe(approved.origin)
    control=async(name,method="POST")=>{const response=await fetch("http://127.0.0.1:"+info.apiPort+"/__fixture/"+name,{method,headers:{"X-AgentStudio-Synthetic-Fixture":"1"},signal:AbortSignal.timeout(15000)});expect(response.status).toBe(200);return response.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"})
    const external=[];await context.route("**/*",async route=>{if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()})
    page=await context.newPage();const grants=[],confirmations=[]
    page.on("request",request=>{if(request.method()!=="POST"||!request.url().includes("/agent-collaboration/"))return
      const body=request.postDataJSON();if(body?.action==="grant"){if(request.url().endsWith("/confirm"))confirmations.push(body);else grants.push(body)}})
    await page.goto(info.url,{waitUntil:"domcontentloaded"})
    const login=async who=>{await page.getByRole("textbox",{name:"员工邮箱",exact:true}).fill(who+"@example.com");await page.getByLabel("密码",{exact:true}).fill(who==="alice"?"SyntheticAlicePassword#2026":"SyntheticBobPassword#2026")
      await page.getByRole("button",{name:"登录独立工作台",exact:true}).click();await expect(page.getByRole("button",{name:"Agent 协作",exact:true})).toBeVisible()}
    const open=async()=>{await page.getByRole("button",{name:"Agent 协作",exact:true}).click();const select=page.getByRole("combobox",{name:"选择协作 Agent",exact:true})
      await expect(select).toBeEnabled();await select.selectOption(await select.getByRole("option",{name:/^Alice Browser Agent/}).getAttribute("value"));await expect(page.getByRole("heading",{name:"Alice Browser Agent · 当前描述",exact:true})).toBeVisible()}
    const logout=()=>page.getByRole("button",{name:"退出",exact:true}).click()
    await login("alice");await open()
    const goal="目".repeat(2998)+"🚀",scope="域".repeat(4000)
    await page.getByRole("textbox",{name:/^描述目标/}).fill(goal);await page.getByRole("textbox",{name:/^描述范围/}).fill(scope)
    await expect(page.getByRole("textbox",{name:/^描述目标/})).toHaveAttribute("maxlength","3000")
    await page.getByRole("button",{name:"保存描述字段",exact:true}).click()
    await expect(page.getByRole("status").filter({hasText:/^操作已确认。/})).toContainText("操作已确认")
    await page.getByRole("textbox",{name:"协作者员工邮箱",exact:true}).fill("bob@example.com")
    await page.getByRole("combobox",{name:"协作权限",exact:true}).selectOption("editor")
    await control("drop-next-collaboration");await page.getByRole("button",{name:"授予协作权限",exact:true}).click()
    await expect(page.getByRole("button",{name:"核对原请求",exact:true})).toBeVisible()
    await page.getByRole("button",{name:/^Agent 配置/}).click();await page.getByRole("button",{name:"Agent 协作",exact:true}).click()
    await expect(page.getByRole("button",{name:"核对原请求",exact:true})).toBeVisible();await page.getByRole("button",{name:"核对原请求",exact:true}).click()
    await expect(page.getByRole("button",{name:"核对原请求",exact:true})).toHaveCount(0)
    expect(grants).toHaveLength(1);expect(confirmations).toHaveLength(1);expect(grants[0]).toEqual(confirmations[0])
    await logout();await login("bob");await open()
    await expect(page.getByRole("textbox",{name:/^描述目标/})).toHaveValue(goal)
    await expect(page.getByRole("textbox",{name:/^描述范围/})).toHaveValue(scope)
    await expect(page.getByRole("heading",{name:"协作授权",exact:true})).toHaveCount(0)
    await expect(page.getByRole("heading",{name:"描述版本历史",exact:true})).toHaveCount(0)
    await page.getByRole("textbox",{name:/^描述目标/}).fill("Bob's first safe proposal")
    await page.getByRole("textbox",{name:/^修改说明/}).fill("Improve the role description after reviewing the shared text")
    await control("drop-next-collaboration");await page.getByRole("button",{name:"提交修改提案",exact:true}).click()
    await expect(page.getByRole("button",{name:"核对原请求",exact:true})).toBeVisible()
    await logout();await login("alice");await open()
    await expect(page.getByRole("button",{name:"核对原请求",exact:true})).toHaveCount(0)
    await expect(page.getByText("基于版本 2 · 待审核",{exact:true})).toBeVisible()
    await control("collaboration-change-model");await page.getByRole("button",{name:"刷新协作",exact:true}).click()
    await expect(page.getByText(/来源或授权已变化/)).toBeVisible();await expect(page.getByRole("button",{name:"采纳提案",exact:true})).toHaveCount(0)
    await logout();await login("bob");await open()
    await page.getByRole("textbox",{name:/^描述目标/}).fill("Bob's rebased safe description")
    await page.getByRole("textbox",{name:/^修改说明/}).fill("Rebase the wording against the newly reviewed role version")
    await page.getByRole("button",{name:"提交修改提案",exact:true}).click();await expect(page.getByRole("status").filter({hasText:/^操作已确认。/})).toContainText("操作已确认")
    await logout();await login("alice");await open()
    await page.getByRole("checkbox",{name:"我已核对该提案，确认本次审核决定。",exact:true}).check()
    await page.getByRole("button",{name:"采纳提案",exact:true}).click();await expect(page.getByRole("status").filter({hasText:/^操作已确认。/})).toContainText("操作已确认")
    await expect(page.getByRole("textbox",{name:/^描述目标/})).toHaveValue("Bob's rebased safe description")
    const versions=page.getByRole("heading",{name:"描述版本历史",exact:true}).locator("..")
    const before=versions.locator("details").filter({hasText:/编辑前 · 版本 1 ·/}).first()
    await before.locator("summary").first().click();await before.getByRole("button",{name:"准备恢复此描述",exact:true}).click()
    await page.getByRole("textbox",{name:/^恢复原因/}).fill("Restore the original safe wording while retaining the current model")
    await page.getByRole("checkbox",{name:"我已核对描述版本及当前配置，确认恢复描述字段。",exact:true}).check()
    await page.getByRole("button",{name:"确认恢复描述",exact:true}).click();await expect(page.getByRole("status").filter({hasText:/^操作已确认。/})).toContainText("操作已确认")
    await expect(page.getByRole("textbox",{name:/^描述目标/})).toHaveValue("Synthetic local browser task")
    expect((await control("state","GET")).collaborationModelPreserved).toBe(true)
    await page.screenshot({path:testInfo.outputPath("native-collaboration-safe-restore.png"),fullPage:true})
    await control("deny-config");await page.reload({waitUntil:"domcontentloaded"});await open()
    await expect(page.getByRole("button",{name:"保存描述字段",exact:true})).toBeDisabled()
    await expect(page.getByRole("button",{name:"授予协作权限",exact:true})).toHaveCount(0)
    await page.getByRole("button",{name:"撤销协作权限",exact:true}).click();await expect(page.getByText(/已撤销/)).toBeVisible()
    await logout();await login("bob");await page.getByRole("button",{name:"Agent 协作",exact:true}).click()
    await expect(page.getByRole("combobox",{name:"选择协作 Agent",exact:true}).getByRole("option",{name:/^Alice Browser Agent/})).toHaveCount(0)
    const state=await control("state","GET");expect(state.generated).toBe(0);expect(state.runs).toBe(0);expect(external).toHaveLength(0)
  }catch(error){if(page)await page.screenshot({path:testInfo.outputPath("native-collaboration-failure.png"),fullPage:true}).catch(()=>{});throw error}
  finally{clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control("stop").catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once("exit",resolve)),kill=setTimeout(()=>child.kill("SIGTERM"),5000);await exited;clearTimeout(kill)}}
})
