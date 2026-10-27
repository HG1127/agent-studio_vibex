import {test,expect,chromium} from "@playwright/test"
import {spawn} from "node:child_process"
import {fileURLToPath} from "node:url"
import path from "node:path"
import {requireNativeBrowserCi} from "./ci-guard.mjs"

test("native Agent human input: role default, lost reply, revised plan, full delivery, owner history and logout fences",async({},testInfo)=>{
  const approved=requireNativeBrowserCi() // FIRST: no child/browser/files/network before this.
  const root=path.resolve(fileURLToPath(new URL("../../",import.meta.url)))
  const childEnv=Object.fromEntries(["PATH","HOME","TMPDIR","TEMP","TMP","LANG"].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  Object.assign(childEnv,{AGENT_STUDIO_PG_BROWSER_FIXTURE:"SYNTHETIC_LOCAL_ONLY",AGENT_STUDIO_PG_BROWSER_AUTONOMOUS:"true",AGENT_STUDIO_PG_BROWSER_HUMAN:"true"})
  const child=spawn(process.execPath,["--experimental-strip-types",path.join(root,"services/pg-api/tests/helpers/native-run-browser-fixture.mjs")],{cwd:root,env:childEnv,stdio:["ignore","pipe","pipe"],windowsHide:true})
  let output="",timer,browser,context,page,control
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error("synthetic_human_fixture_start_timeout")),45000)
    const chunk=data=>{output=(output+data.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on("data",chunk);child.stderr.on("data",chunk);child.once("error",reject);child.once("exit",code=>reject(Error("synthetic_human_fixture_exit_"+code+" "+output.slice(-1500))))
  })
  try{
    const info=await ready;clearTimeout(timer)
    expect(info.synthetic_only).toBe(true);expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536).toBe(true)
    control=async(name,method="POST")=>{const response=await fetch("http://127.0.0.1:"+info.apiPort+"/__fixture/"+name,{method,headers:{"X-AgentStudio-Synthetic-Fixture":"1"},signal:AbortSignal.timeout(15000)});expect(response.status).toBe(200);return response.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"})
    const external=[]
    await context.route("**/*",async route=>{if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()})
    page=await context.newPage();await page.goto(info.url,{waitUntil:"domcontentloaded"})
    const login=async who=>{await page.getByRole("textbox",{name:"员工邮箱",exact:true}).fill(who+"@example.com");await page.getByLabel("密码",{exact:true}).fill(who==="alice"?"SyntheticAlicePassword#2026":"SyntheticBobPassword#2026");await page.getByRole("button",{name:"登录独立工作台",exact:true}).click();await expect(page.getByRole("button",{name:"多轮 Agent",exact:true})).toBeVisible()}
    await login("alice")
    const setting=page.getByRole("region",{name:"角色默认方案审核",exact:true})
    await setting.getByRole("combobox",{name:"配置审核设置的角色",exact:true}).selectOption({label:"Alice Browser Agent · 修订 1"})
    await setting.getByRole("checkbox",{name:"角色默认需要本人审核方案",exact:true}).check()
    const saved=page.waitForResponse(response=>response.request().method()==="PATCH"&&/\/agent-specs\//.test(new URL(response.url()).pathname))
    await setting.getByRole("button",{name:"保存角色审核设置",exact:true}).click();expect((await saved).status()).toBe(200)
    await expect(setting.getByRole("combobox")).toContainText("Alice Browser Agent · 修订 2")
    await expect(setting.getByRole("checkbox",{name:"角色默认需要本人审核方案",exact:true})).toBeChecked()
    await page.getByRole("button",{name:"多轮 Agent",exact:true}).click()
    await page.getByRole("combobox",{name:"多轮 Agent 角色",exact:true}).selectOption({label:"Alice Browser Agent · gpt-4.1-mini"})
    await expect(page.getByRole("combobox",{name:"本次方案审核",exact:true})).toContainText("沿用角色设置（需审核）")
    await page.getByRole("combobox",{name:"本次方案审核",exact:true}).selectOption("off")
    await page.getByRole("combobox",{name:"最多规划轮数",exact:true}).selectOption("2")
    await page.getByRole("textbox",{name:"多轮任务要求",exact:true}).fill("本人合成报告：先澄清截止日，再审核方案。")
    await page.getByRole("button",{name:"提交多轮任务",exact:true}).click()
    await expect(page.getByText("多轮任务已提交，等待逐步审批。",{exact:true})).toBeVisible()
    const refresh=()=>page.getByRole("button",{name:"刷新多轮任务",exact:true}).click()
    const advance=async wanted=>{for(let i=0;i<20;i++){
      const tick=await control("autonomous");await refresh()
      if(tick.status===wanted)return
      expect(["failed","paused","cancelled","succeeded"].includes(tick.status)).toBe(false)
      if(tick.status==="awaiting_approval"){
        const approval=page.getByRole("region",{name:"当前步骤审批",exact:true})
        await expect(approval.getByRole("button",{name:"批准当前步骤",exact:true})).toBeDisabled()
        await approval.getByRole("checkbox").check();await approval.getByRole("button",{name:"批准当前步骤",exact:true}).click()
        await expect(page.getByText("已批准当前步骤。",{exact:true})).toBeVisible()
      }
    }throw Error("synthetic_human_browser_transition_limit")}
    await advance("awaiting_input")
    const question=page.getByRole("region",{name:"Agent 待你回复",exact:true}),reply="截止日：2030年1月31日。"
    await expect(question).toContainText("合成报告的截止日是哪天？")
    await expect(page.getByText("PRIVATE_HUMAN_PROVIDER_NOTE",{exact:true})).toHaveCount(0)
    expect((await control("state","GET")).humanModelCalls).toBe(1)
    await question.getByRole("textbox",{name:"回复内容",exact:true}).fill(reply)
    await question.getByRole("checkbox").check();await control("drop-next-human")
    await question.getByRole("button",{name:"提交本次回复",exact:true}).click()
    await expect(page.getByRole("button",{name:"核对上次人工回复",exact:true})).toBeEnabled()
    await page.getByRole("button",{name:/^知识库 /}).click();await page.getByRole("button",{name:"多轮 Agent",exact:true}).click()
    await expect(page.getByRole("region",{name:"核对上次人工回复",exact:true})).toContainText(reply)
    await page.getByRole("button",{name:"核对上次人工回复",exact:true}).click()
    await expect(page.getByRole("button",{name:"核对上次人工回复",exact:true})).toHaveCount(0)
    let proof=await control("state","GET");expect(proof.humanHashes).toHaveLength(1);expect(proof.humanConfirms).toBe(1);expect(proof.humanReceipts).toBe(1);expect(proof.humanModelCalls).toBe(1)
    await advance("succeeded")
    const full="已核对本人方案，交付完整合成报告。\n".repeat(400)
    expect(full.length).toBeGreaterThan(4000);await expect(page.getByText(full,{exact:true})).toBeVisible()
    await page.getByRole("button",{name:"读取本人回复记录",exact:true}).click()
    const history=page.getByRole("region",{name:"本人回复记录",exact:true})
    await expect(history.locator("details")).toHaveCount(1);await history.locator("summary").click();await expect(history).toContainText(reply)
    expect((await control("state","GET")).humanModelCalls).toBe(2)
    // Keep the role's required default intact. This second run inherits it;
    // the clarification run above explicitly opted out for this run only.
    await page.getByRole("combobox",{name:"本次方案审核",exact:true}).selectOption("inherit")
    await page.getByRole("combobox",{name:"最多规划轮数",exact:true}).selectOption("3")
    await page.getByRole("textbox",{name:"多轮任务要求",exact:true}).fill("本人合成报告：审核初稿、修改后批准，再交付。")
    await page.getByRole("button",{name:"提交多轮任务",exact:true}).click()
    await expect(page.getByText("多轮任务已提交，等待逐步审批。",{exact:true})).toBeVisible()
    await advance("awaiting_input")
    const plan=page.getByRole("region",{name:"Agent 方案审核",exact:true})
    await expect(plan).toContainText("初稿：按本人截止日整理证据。")
    await plan.getByRole("textbox").fill("仅包括已核对证据。")
    await plan.getByRole("checkbox").check();await plan.getByRole("button",{name:"提交修改意见",exact:true}).click()
    await advance("awaiting_input");await expect(plan).toContainText("修订稿：仅包括已核对证据。")
    await expect(plan.getByRole("checkbox")).not.toBeChecked();await expect(plan.getByRole("button",{name:"批准此方案",exact:true})).toBeDisabled()
    await plan.getByRole("checkbox").check();await plan.getByRole("button",{name:"批准此方案",exact:true}).click()
    await advance("succeeded")
    await expect(page.getByText(full,{exact:true})).toBeVisible()
    await page.getByRole("button",{name:"读取本人回复记录",exact:true}).click()
    await expect(history.locator("details")).toHaveCount(2)
    for(const details of await history.locator("details").all())await details.locator("summary").click()
    await expect(history).toContainText("仅包括已核对证据。");await expect(history).toContainText("已批准方案")
    proof=await control("state","GET");expect(proof.humanHashes).toHaveLength(3);expect(proof.humanReceipts).toBe(3);expect(proof.humanModelCalls).toBe(5);expect(proof.runs).toBe(2)
    await page.screenshot({path:testInfo.outputPath("native-agent-human-input-owner.png"),fullPage:true})
    await page.getByRole("button",{name:"退出",exact:true}).click();await login("bob");await page.getByRole("button",{name:"多轮 Agent",exact:true}).click()
    await expect(page.getByText(full,{exact:true})).toHaveCount(0);await expect(page.getByText(reply,{exact:true})).toHaveCount(0)
    await expect(page.getByRole("region",{name:"Agent 方案审核",exact:true})).toHaveCount(0)
    expect(external).toEqual([])
  }finally{
    clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control("stop").catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once("exit",resolve)),forced=setTimeout(()=>child.kill("SIGTERM"),5000);await exited;clearTimeout(forced)}
  }
})
