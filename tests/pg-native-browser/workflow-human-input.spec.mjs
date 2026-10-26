import {test,expect,chromium} from "@playwright/test"
import {spawn} from "node:child_process"
import {fileURLToPath} from "node:url"
import path from "node:path"
import {requireNativeBrowserCi} from "./ci-guard.mjs"

test("nested Workflow Agent: per-node plan review, exact lost revision recovery, history and safe cancellation",async({},testInfo)=>{
  const approved=requireNativeBrowserCi() // FIRST: no child/browser/files/network before this.
  const root=path.resolve(fileURLToPath(new URL("../../",import.meta.url)))
  const env=Object.fromEntries(["PATH","HOME","TMPDIR","TEMP","TMP","LANG"].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  Object.assign(env,{AGENT_STUDIO_PG_BROWSER_FIXTURE:"SYNTHETIC_LOCAL_ONLY",AGENT_STUDIO_PG_BROWSER_WORKFLOW:"true",AGENT_STUDIO_PG_BROWSER_HUMAN:"true"})
  const child=spawn(process.execPath,["--experimental-strip-types",path.join(root,"services/pg-api/tests/helpers/native-run-browser-fixture.mjs")],{cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true})
  let output="",timer,browser,context,page,control
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error("synthetic_workflow_human_fixture_start_timeout")),45000)
    const chunk=data=>{output=(output+data.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on("data",chunk);child.stderr.on("data",chunk);child.once("error",reject);child.once("exit",code=>reject(Error("synthetic_workflow_human_fixture_exit_"+code+" "+output.slice(-1500))))
  })
  try{
    const info=await ready;clearTimeout(timer);expect(info.synthetic_only).toBe(true);expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536).toBe(true)
    control=async(name,method="POST")=>{const response=await fetch("http://127.0.0.1:"+info.apiPort+"/__fixture/"+name,{method,headers:{"X-AgentStudio-Synthetic-Fixture":"1"},signal:AbortSignal.timeout(15000)});expect(response.status).toBe(200);return response.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"});const external=[]
    await context.route("**/*",async route=>{if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()})
    page=await context.newPage();await page.goto(info.url,{waitUntil:"domcontentloaded"})
    await page.getByRole("textbox",{name:"员工邮箱",exact:true}).fill("alice@example.com");await page.getByLabel("密码",{exact:true}).fill("SyntheticAlicePassword#2026")
    await page.getByRole("button",{name:"登录独立工作台",exact:true}).click();await page.getByRole("button",{name:"Workflow 运行与审批",exact:true}).click()
    await page.getByRole("combobox",{name:"运行工作流",exact:true}).selectOption({label:"Synthetic owner-reviewed Workflow · 修订 1"})
    const submit=async instruction=>{await page.getByRole("textbox",{name:"工作流运行要求",exact:true}).fill(instruction);await page.getByRole("button",{name:"提交工作流任务",exact:true}).click();await expect(page.getByText("工作流任务已提交，外部操作将逐步请求审批。",{exact:true})).toBeVisible()}
    const refresh=()=>page.getByRole("button",{name:"刷新工作流任务",exact:true}).click()
    const advance=async wanted=>{for(let i=0;i<24;i++){
      const tick=await control("workflow");await refresh();if(tick.status===wanted)return
      expect(["failed","paused","cancelled","succeeded"].includes(tick.status)).toBe(false)
      if(tick.status==="awaiting_approval"){
        const approve=page.getByRole("button",{name:"批准工作流当前步骤",exact:true});await expect(approve).toBeDisabled()
        await page.getByRole("checkbox",{name:/^我已核对本次/}).check();await approve.click();await expect(page.getByText("已批准当前步骤。",{exact:true})).toBeVisible()
      }
    }throw Error("synthetic_workflow_human_transition_limit")}
    await submit("嵌套Agent：修改并批准本节点方案。")
    await advance("awaiting_input");const plan=page.getByRole("region",{name:"Agent 方案审核",exact:true})
    await expect(plan).toContainText("初稿：按本人截止日整理证据。")
    await plan.getByRole("textbox").fill("仅包括已核对证据。");await plan.getByRole("checkbox").check();await control("drop-next-human")
    await plan.getByRole("button",{name:"提交修改意见",exact:true}).click();await expect(page.getByRole("button",{name:"核对上次人工回复",exact:true})).toBeEnabled()
    await page.getByRole("button",{name:/^知识库 /}).click();await page.getByRole("button",{name:"Workflow 运行与审批",exact:true}).click()
    await page.getByRole("button",{name:"核对上次人工回复",exact:true}).click();await expect(page.getByRole("button",{name:"核对上次人工回复",exact:true})).toHaveCount(0)
    let proof=await control("state","GET");expect(proof.humanHashes).toHaveLength(1);expect(proof.humanConfirms).toBe(1);expect(proof.humanModelCalls).toBe(1)
    await advance("awaiting_input");await expect(plan).toContainText("修订稿：仅包括已核对证据。")
    await expect(plan.getByRole("checkbox")).not.toBeChecked();await plan.getByRole("checkbox").check();await plan.getByRole("button",{name:"批准此方案",exact:true}).click()
    await advance("succeeded")
    const bounded="已核对本人方案，交付完整合成报告。\n".repeat(400).slice(0,4000)
    await expect(page.getByRole("region",{name:"Workflow 执行结果",exact:true}).locator("pre")).toHaveText(bounded)
    await page.getByRole("button",{name:"读取本人回复记录",exact:true}).click();const history=page.getByRole("region",{name:"本人回复记录",exact:true})
    await expect(history.locator("details")).toHaveCount(2);await history.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath("native-workflow-human-history-viewport.png")})
    proof=await control("state","GET");expect(proof.humanModelCalls).toBe(3);expect(proof.humanReceipts).toBe(2);expect(proof.humanHashes).toHaveLength(2)
    await submit("等待本人时取消，不再调用模型。")
    await advance("awaiting_input");await expect(plan).toBeVisible();expect((await control("state","GET")).humanModelCalls).toBe(4)
    await page.getByRole("button",{name:"取消工作流任务",exact:true}).click();await page.getByRole("button",{name:"确认取消此工作流任务",exact:true}).click()
    await expect(page.getByText("任务已取消。",{exact:true})).toBeVisible();await expect(plan).toHaveCount(0)
    expect((await control("workflow")).status).toBe("idle");proof=await control("state","GET");expect(proof.humanModelCalls).toBe(4);expect(proof.humanReceipts).toBe(2);expect(proof.runs).toBe(2);expect(external).toEqual([])
  }finally{
    clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control("stop").catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once("exit",resolve)),forced=setTimeout(()=>child.kill("SIGTERM"),5000);await exited;clearTimeout(forced)}
  }
})
