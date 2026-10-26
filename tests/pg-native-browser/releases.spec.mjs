import {test,expect,chromium} from "@playwright/test"
import {spawn} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {requireNativeBrowserCi} from "./ci-guard.mjs"

test("native full versions: owner-only snapshots, exact recovery, full restoration and selected-model acceptance",async({},testInfo)=>{
  const approved=requireNativeBrowserCi() // FIRST effectful gate; hosted synthetic runner only.
  const root=path.resolve(fileURLToPath(new URL("../../",import.meta.url)))
  const env=Object.fromEntries(["PATH","HOME","TMPDIR","TEMP","TMP","LANG"].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))
  Object.assign(env,{AGENT_STUDIO_PG_BROWSER_FIXTURE:"SYNTHETIC_LOCAL_ONLY",AGENT_STUDIO_PG_BROWSER_AUTONOMOUS:"true",AGENT_STUDIO_PG_BROWSER_RELEASES:"true"})
  const child=spawn(process.execPath,["--experimental-strip-types",path.join(root,"services/pg-api/tests/helpers/native-run-browser-fixture.mjs")],{cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true})
  let browser,context,page,control,timer,output=""
  const ready=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error("synthetic_fixture_timeout")),45000)
    const consume=chunk=>{output=(output+chunk.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on("data",consume);child.stderr.on("data",consume);child.once("error",reject);child.once("exit",code=>reject(Error("synthetic_fixture_exit_"+code)))
  })
  try{
    const info=await ready;clearTimeout(timer);expect(new URL(info.url).origin).toBe(approved.origin)
    control=async(name,method="POST")=>{const response=await fetch("http://127.0.0.1:"+info.apiPort+"/__fixture/"+name,{method,headers:{"X-AgentStudio-Synthetic-Fixture":"1"}});expect(response.ok).toBe(true);return response.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1280,height:900}});page=await context.newPage()
    const changes=[],confirmations=[]
    page.on("request",request=>{if(request.method()!=="POST"||!request.url().includes("/api/v2/agent-releases/"))return
      if(request.url().endsWith("/confirm"))confirmations.push(request.postDataJSON());else changes.push(request.postDataJSON())})
    await page.goto(info.url,{waitUntil:"domcontentloaded"})
    const login=async(who)=>{await page.getByRole("textbox",{name:"员工邮箱",exact:true}).fill(who+"@example.com")
      await page.getByLabel("密码",{exact:true}).fill(who==="alice"?"SyntheticAlicePassword#2026":"SyntheticBobPassword#2026")
      await page.getByRole("button",{name:"登录独立工作台",exact:true}).click();await expect(page.getByRole("button",{name:"版本与发布",exact:true})).toBeVisible()}
    const open=async()=>{await page.getByRole("button",{name:"版本与发布",exact:true}).click()
      await page.getByRole("combobox",{name:"版本所属角色",exact:true}).selectOption({label:"Alice Browser Agent"})
      await expect(page.getByRole("button",{name:"保存完整配置版本",exact:true})).toBeEnabled()}
    const confirmed=()=>expect(page.getByRole("status").filter({hasText:/^操作已确认/})).toBeVisible()
    await login("alice");await open()
    await page.getByRole("textbox",{name:"版本说明",exact:true}).fill("Owner full configuration one")
    await control("drop-next-release");await page.getByRole("button",{name:"保存完整配置版本",exact:true}).click()
    await expect(page.getByRole("button",{name:"核对原请求结果",exact:true})).toBeEnabled()
    await page.getByRole("button",{name:/^Agent 配置/}).click();await page.getByRole("button",{name:"版本与发布",exact:true}).click()
    await page.getByRole("button",{name:"核对原请求结果",exact:true}).click();await confirmed()
    expect(changes[0]).toEqual(confirmations[0]);expect((await control("state","GET")).releaseVersions).toEqual([{status:"draft",n:1}])
    await control("release-change-config");await page.getByRole("button",{name:"刷新版本",exact:true}).click()
    await page.getByRole("button",{name:"恢复版本 1",exact:true}).click()
    await page.getByRole("textbox",{name:"恢复说明",exact:true}).fill("Restore the reviewed complete owner configuration")
    await page.getByRole("checkbox",{name:"我已核对目标版本，确认恢复完整配置。",exact:true}).check()
    await page.getByRole("button",{name:"确认版本操作",exact:true}).click();await confirmed()
    const restored=await control("state","GET");expect(restored.releaseCurrent).toEqual({goal:"Synthetic local browser task",default_model:true})
    await control("release-disable-default-model")
    await page.getByRole("textbox",{name:"验收任务",exact:true}).fill("Use the selected tested model for this acceptance")
    await page.getByRole("combobox",{name:"验收模型",exact:true}).selectOption({label:"Alice schedule model B · synthetic-schedule-b"})
    await page.getByRole("combobox",{name:"验收轮数",exact:true}).selectOption("2")
    await page.getByRole("checkbox",{name:"我确认创建此验收任务，并逐步核对后续调用与费用。",exact:true}).check()
    await control("drop-next-release");await page.getByRole("button",{name:"创建验收任务",exact:true}).click()
    await expect(page.getByRole("button",{name:"核对原请求结果",exact:true})).toBeEnabled()
    await page.getByRole("button",{name:"核对原请求结果",exact:true}).click();await confirmed()
    expect(changes.find(c=>c.action==="acceptance")).toEqual(confirmations.find(c=>c.action==="acceptance"))
    await expect(page.getByRole("button",{name:"查看运行与逐步审批",exact:true})).toBeVisible()
    await page.getByRole("button",{name:"查看运行与逐步审批",exact:true}).click()
    const refresh=async()=>{const button=page.getByRole("button",{name:"刷新多轮任务",exact:true});await expect(button).toBeEnabled();await button.click()}
    const approve=async(charged)=>{const section=page.getByRole("region",{name:"当前步骤审批"});await expect(section).toContainText("Alice schedule model B")
      await section.getByRole("checkbox",{name:charged?"我已核对本次模型调用，确认可能产生费用。":"我已核对当前步骤及其数据范围，允许本次操作。",exact:true}).check()
      await section.getByRole("button",{name:"批准当前步骤",exact:true}).click();await expect(page.getByText("已批准当前步骤。",{exact:true})).toBeVisible()}
    expect((await control("autonomous")).status).toBe("awaiting_approval");await refresh();await approve(false)
    expect((await control("autonomous")).status).toBe("progressed")
    expect((await control("autonomous")).status).toBe("awaiting_approval");await refresh();await approve(true)
    expect((await control("autonomous")).status).toBe("progressed")
    expect((await control("autonomous")).status).toBe("awaiting_approval");await refresh();await approve(false)
    expect((await control("autonomous")).status).toBe("progressed")
    expect((await control("autonomous")).status).toBe("awaiting_approval");await refresh();await approve(true)
    expect((await control("autonomous")).status).toBe("progressed")
    expect((await control("autonomous")).status).toBe("succeeded");await refresh()
    await page.getByRole("button",{name:"版本与发布",exact:true}).click()
    await expect(page.getByText("此验收当前可用于保存配置版本。",{exact:true})).toBeVisible()
    await page.getByRole("checkbox",{name:"关联上方当前通过的验收记录",exact:true}).check()
    await page.getByRole("textbox",{name:"版本说明",exact:true}).fill("Accepted configuration with selected model B")
    await page.getByRole("button",{name:"保存完整配置版本",exact:true}).click();await confirmed()
    await page.getByRole("button",{name:"发布版本 2",exact:true}).click()
    await page.getByRole("checkbox",{name:"我确认将此版本设为发布版本。",exact:true}).check()
    await page.getByRole("button",{name:"确认版本操作",exact:true}).click();await confirmed()
    await page.getByRole("button",{name:"删除版本 1",exact:true}).click()
    await page.getByRole("checkbox",{name:"我确认删除此草稿版本。",exact:true}).check()
    await page.getByRole("button",{name:"确认版本操作",exact:true}).click();await confirmed()
    await expect(page.getByRole("region",{name:"完整版本配置",exact:true})).toHaveCount(0)
    await page.getByRole("checkbox",{name:"关联上方当前通过的验收记录",exact:true}).uncheck()
    await control("drop-next-release");await page.getByRole("button",{name:"保存完整配置版本",exact:true}).click()
    await expect(page.getByRole("button",{name:"核对原请求结果",exact:true})).toBeEnabled()
    const privateRole=(await control("state","GET")).releaseRole
    await page.getByRole("button",{name:"退出",exact:true}).click();await login("bob")
    await page.getByRole("button",{name:"版本与发布",exact:true}).click()
    await expect(page.getByRole("combobox",{name:"版本所属角色",exact:true})).not.toContainText("Alice Browser Agent")
    await expect(page.getByRole("button",{name:"核对原请求结果",exact:true})).toHaveCount(0)
    const denied=await page.evaluate(async id=>{const response=await fetch("/__pg_native/api/v2/agent-releases/"+id);return {status:response.status,body:await response.text()}},privateRole)
    expect(denied.status).toBe(404);expect(denied.body).not.toContain("Owner full configuration")
    await page.getByRole("button",{name:"退出",exact:true}).click();await login("alice");await open()
    await expect(page.getByRole("button",{name:"核对原请求结果",exact:true})).toHaveCount(0)
    await expect(page.getByRole("textbox",{name:"版本说明",exact:true})).toHaveValue("")
    await control("drop-next-release");await page.getByRole("button",{name:"保存完整配置版本",exact:true}).click()
    await expect(page.getByRole("button",{name:"核对原请求结果",exact:true})).toBeEnabled();await control("deny-config")
    await page.getByRole("button",{name:"核对原请求结果",exact:true}).click();await confirmed()
    await expect(page.getByRole("button",{name:"保存完整配置版本",exact:true})).toBeDisabled()
    const final=await control("state","GET");expect(final.releaseAcceptances).toBe(1);expect(final.runs).toBe(1);expect(final.generated).toBe(2);expect(final.releaseModelCalls).toBe(2)
    expect(final.releaseVersions).toEqual([{status:"deleted",n:1},{status:"draft",n:2},{status:"published",n:1}])
    await page.screenshot({path:testInfo.outputPath("native-full-versions-owner.png"),fullPage:true})
  }finally{
    clearTimeout(timer)
    if(control)await control("stop").catch(()=>{})
    await context?.close().catch(()=>{});await browser?.close().catch(()=>{})
    if(child.exitCode===null&&!child.killed)child.kill()
    if(output.includes("synthetic_fixture_error"))throw Error(output.slice(-4000))
  }
})
