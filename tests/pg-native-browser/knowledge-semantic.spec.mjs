import {test,expect,chromium} from "@playwright/test"
import {spawn} from "node:child_process"
import {fileURLToPath} from "node:url"
import path from "node:path"
import {requireNativeBrowserCi} from "./ci-guard.mjs"

for(const runtime of ["workflow","autonomous"])test(`employee semantic UI (${runtime}): exact receipts, approved Tool billing and revocation`,async({},testInfo)=>{
  const approved=requireNativeBrowserCi()
  const root=path.resolve(fileURLToPath(new URL("../../",import.meta.url)))
  const env=Object.fromEntries(["PATH","HOME","TMPDIR","TEMP","TMP","LANG"].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  Object.assign(env,{AGENT_STUDIO_PG_BROWSER_FIXTURE:"SYNTHETIC_LOCAL_ONLY",[runtime==="workflow"?"AGENT_STUDIO_PG_BROWSER_WORKFLOW":"AGENT_STUDIO_PG_BROWSER_AUTONOMOUS"]:"true",AGENT_STUDIO_PG_BROWSER_SEMANTIC:"true"})
  const child=spawn(process.execPath,["--experimental-strip-types",path.join(root,"services/pg-api/tests/helpers/native-run-browser-fixture.mjs")],{cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true})
  let browser,aliceContext,bobContext,control,timer,output=""
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error("synthetic_fixture_start_timeout")),45000)
    const chunk=bytes=>{output=(output+bytes.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on("data",chunk);child.stderr.on("data",chunk);child.once("error",reject);child.once("exit",code=>reject(Error("fixture_exit_"+code)))
  })
  try{
    const info=await ready;clearTimeout(timer);expect(new URL(info.url).origin).toBe(approved.origin)
    control=async(name,method="POST")=>{const response=await fetch("http://127.0.0.1:"+info.apiPort+"/__fixture/"+name,{method,headers:{"X-AgentStudio-Synthetic-Fixture":"1"},signal:AbortSignal.timeout(15000)});expect(response.status).toBe(200);return response.json()}
    const state=()=>control("state","GET"),external=[]
    browser=await chromium.launch({headless:true})
    const context=async()=>{const value=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:"block"});await value.route("**/*",async route=>{
      if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()
    });return value}
    aliceContext=await context();const alice=await aliceContext.newPage()
    const login=async(page,who)=>{
      await page.getByRole("textbox",{name:"员工邮箱",exact:true}).fill(who+"@example.com")
      await page.getByLabel("密码",{exact:true}).fill(who==="alice"?"SyntheticAlicePassword#2026":"SyntheticBobPassword#2026")
      await page.getByRole("button",{name:"登录独立工作台",exact:true}).click();await page.getByRole("button",{name:/^知识库 \d+$/}).click()
    }
    const sharing=page=>page.getByRole("region",{name:"知识库共享与文档",exact:true})
    const settings=page=>page.getByRole("region",{name:"语义检索设置与索引",exact:true})
    const query=page=>page.getByRole("region",{name:"语义与混合查询",exact:true})
    const configure=async(page,who,drop=false)=>{
      const panel=settings(page)
      await panel.getByRole("combobox",{name:"向量模型连接",exact:true}).selectOption({label:who+" semantic model"})
      await panel.getByRole("combobox",{name:"向量模型名称",exact:true}).selectOption("synthetic-embedding")
      if(drop)await control("drop-next-semantic")
      await panel.getByRole("button",{name:"保存语义设置",exact:true}).click()
      if(drop){
        await expect(panel.getByText(/设置或索引启动结果待确认/)).toBeVisible()
        await page.getByRole("button",{name:/^Workflow \d+$/}).click();await page.getByRole("button",{name:/^知识库 \d+$/}).click()
        await expect(panel.getByText(/设置或索引启动结果待确认/)).toBeVisible()
        await panel.getByRole("button",{name:"核对设置回执",exact:true}).click()
      }
      await expect(panel.getByRole("button",{name:"保存语义设置",exact:true})).toBeEnabled()
      await expect(panel.getByText(/设置或索引启动结果待确认/)).toHaveCount(0)
    }
    await alice.goto(info.url,{waitUntil:"domcontentloaded"});await login(alice,"alice")
    await alice.getByPlaceholder("知识库名称").fill("Semantic source KB");await alice.getByRole("button",{name:"创建知识库",exact:true}).click()
    await sharing(alice).getByRole("combobox",{name:/选择知识库/}).selectOption({label:"Semantic source KB · 我的知识库"})
    await sharing(alice).getByLabel("文本文件名",{exact:true}).fill("semantic.txt")
    await sharing(alice).getByLabel("文本内容",{exact:true}).fill("BROWSER_SEMANTIC_SOURCE cedar <script>foreign()</script>")
    await sharing(alice).getByRole("button",{name:"保存文本并建立关键词索引",exact:true}).click()
    await expect(sharing(alice).getByRole("list",{name:"知识库文档",exact:true})).toContainText("semantic.txt")
    await sharing(alice).getByLabel("新增接收人的员工邮箱",{exact:true}).fill("bob@example.com")
    await sharing(alice).getByRole("checkbox",{name:"允许接收人进行语义检索",exact:true}).check()
    await sharing(alice).getByRole("button",{name:"授予新员工权限",exact:true}).click()
    await expect(sharing(alice).getByRole("list",{name:"已有共享授权",exact:true})).toContainText("Browser Bob")
    await configure(alice,"Alice",true)
    await settings(alice).getByRole("checkbox",{name:"允许本人知识内容的索引费用",exact:true}).check()
    await settings(alice).getByRole("checkbox",{name:"我确认承担所选当前模型配置的提供商费用",exact:true}).check()
    await settings(alice).getByRole("button",{name:"保存本人费用授权",exact:true}).click()
    await expect(settings(alice).getByText(/索引已允许/)).toBeVisible()
    expect((await control("index")).status).toBe("idle");expect((await state()).indexEmbeddings).toBe(0)
    await settings(alice).getByRole("checkbox",{name:"同意支付本人全部待索引内容及后续新增内容的提供商费用",exact:true}).check()
    await control("drop-next-semantic");await settings(alice).getByRole("button",{name:"确认启动本人索引",exact:true}).click()
    await expect(settings(alice).getByText(/设置或索引启动结果待确认/)).toBeVisible()
    expect((await control("index")).status).toBe("indexed")
    await settings(alice).getByRole("button",{name:"核对设置回执",exact:true}).click()
    await settings(alice).getByRole("combobox",{name:"查看本人知识库索引",exact:true}).selectOption({label:"Semantic source KB"})
    await expect(settings(alice).getByRole("status",{name:"本人语义索引状态",exact:true})).toContainText("已索引 1 / 1")
    expect((await control("index")).status).toBe("idle");expect((await state()).indexEmbeddings).toBe(1)

    bobContext=await context();const bob=await bobContext.newPage();await bob.goto(info.url,{waitUntil:"domcontentloaded"});await login(bob,"bob")
    await query(bob).getByRole("checkbox",{name:"Semantic source KB · Browser Alice共享 · 可查看",exact:true}).check()
    await query(bob).getByRole("textbox",{name:"查询内容",exact:true}).fill("cedar")
    await expect(query(bob).getByRole("combobox",{name:"查询方式",exact:true})).toHaveValue("lexical")
    await query(bob).getByRole("button",{name:"提交查询",exact:true}).click()
    await expect(query(bob).getByRole("list",{name:"语义查询结果",exact:true})).toContainText("BROWSER_SEMANTIC_SOURCE")
    expect((await state()).queryEmbeddings).toBe(0)
    await configure(bob,"Bob")
    await settings(bob).getByRole("checkbox",{name:"允许使用本人模型的查询费用",exact:true}).check()
    await settings(bob).getByRole("checkbox",{name:"我确认承担所选当前模型配置的提供商费用",exact:true}).check()
    await settings(bob).getByRole("button",{name:"保存本人费用授权",exact:true}).click()
    await expect(settings(bob).getByText(/查询已允许/)).toBeVisible()
    await query(bob).getByRole("combobox",{name:"查询方式",exact:true}).selectOption("semantic")
    await query(bob).getByRole("textbox",{name:"查询内容",exact:true}).fill("unrelated wording")
    await expect(query(bob).getByRole("button",{name:"提交新查询",exact:true})).toBeDisabled()
    await query(bob).getByRole("checkbox",{name:"同意仅为本次查询支付本人模型的提供商费用",exact:true}).check()
    await control("drop-next-query");const before=await state()
    await query(bob).getByRole("button",{name:"提交新查询",exact:true}).click()
    await expect(query(bob).getByText(/提交结果待确认|查询处理中，页面只读取状态/)).toBeVisible()
    await expect(query(bob).getByRole("combobox",{name:"查询方式",exact:true})).toBeDisabled()
    await bob.getByRole("button",{name:/^Workflow \d+$/}).click();await bob.getByRole("button",{name:/^知识库 \d+$/}).click()
    expect((await state()).queryPosts).toBe(before.queryPosts+1)
    expect((await control("query")).status).toBe("retrieved")
    await query(bob).getByRole("button",{name:"核对查询回执",exact:true}).click()
    await expect(query(bob).getByText(/本次检索方式：语义/)).toBeVisible()
    await expect(query(bob).getByRole("list",{name:"语义查询结果",exact:true})).toContainText("<script>foreign()</script>")
    expect(await bob.locator("script").filter({hasText:"foreign()"}).count()).toBe(0)
    let current=await state();expect(current.queryEmbeddings).toBe(1);expect(current.queryInputs).toEqual([["unrelated wording"]])
    await query(bob).getByRole("button",{name:"核对查询回执",exact:true}).click();expect((await state()).queryEmbeddings).toBe(1)

    // Configure the new Tool through actual employee forms. Saving is metadata
    // only; the paid effect still requires a fresh, step-specific fee intent.
    const beforeTool=await state(),sharedName="Semantic source KB · Browser Alice共享 · 可查看"
    if(runtime==="workflow"){
      await bob.getByRole("button",{name:/^Workflow \d+$/}).click()
      await bob.getByRole("textbox",{name:"新工作流名称",exact:true}).fill("Bob approved semantic workflow")
      await bob.getByRole("button",{name:"新建画布草稿",exact:true}).click()
      const edge=label=>bob.getByRole("combobox",{name:"选择连线",exact:true}).selectOption({label}),node=label=>bob.getByRole("combobox",{name:"选择节点",exact:true}).selectOption({label})
      const apply=()=>bob.getByRole("button",{name:"应用节点配置",exact:true}).click()
      await edge("开始 → 结束");await bob.getByRole("button",{name:"添加工具",exact:true}).click();await node("工具")
      await bob.getByRole("combobox",{name:"工具",exact:true}).selectOption("knowledge_search")
      await bob.getByRole("checkbox",{name:sharedName,exact:true}).check()
      await expect(bob.getByRole("combobox",{name:"知识库检索方式",exact:true})).toHaveValue("keyword")
      await bob.getByRole("button",{name:"读取本人检索配置",exact:true}).click()
      await expect.poll(()=>bob.getByRole("combobox",{name:"知识库检索方式",exact:true}).locator('option[value="hybrid"]').evaluate(option=>option.disabled)).toBe(false)
      await bob.getByRole("combobox",{name:"知识库检索方式",exact:true}).selectOption("hybrid")
      await bob.getByRole("textbox",{name:"工具参数模板（JSON）",exact:true}).fill('{"query":"tool wording"}');await apply()
      await edge("工具 → 结束");await bob.getByRole("button",{name:"添加模型",exact:true}).click();await node("模型")
      await bob.getByRole("combobox",{name:"绑定模型",exact:true}).selectOption({label:"Bob synthetic model · gpt-4.1-mini"})
      await bob.getByRole("textbox",{name:"模型提示词",exact:true}).fill("Use {{工具.output}}");await apply()
      await node("结束");await bob.getByRole("textbox",{name:"结果模板",exact:true}).fill("{{模型.output}}");await apply()
      await bob.getByRole("button",{name:"保存工作流",exact:true}).click()
      await expect(bob.getByRole("button",{name:"运行已保存工作流",exact:true})).toBeEnabled()
      expect((await state()).queryEmbeddings).toBe(beforeTool.queryEmbeddings)
      await bob.getByRole("button",{name:"运行已保存工作流",exact:true}).click()
      await bob.getByRole("textbox",{name:"工作流运行要求",exact:true}).fill("Private task must never enter embedding request")
      await bob.getByRole("button",{name:"提交工作流任务",exact:true}).click()
    }else{
      await bob.getByRole("button",{name:/^Agent 配置/}).click()
      const panel=bob.getByRole("region",{name:"Agent 知识库绑定",exact:true})
      await panel.getByRole("combobox",{name:"知识库绑定 Agent",exact:true}).selectOption({label:"Bob Browser Agent"})
      await panel.getByRole("checkbox",{name:sharedName,exact:true}).check()
      await expect(panel.getByRole("combobox",{name:"知识库检索方式",exact:true})).toHaveValue("keyword")
      // Hold the actual metadata request to prove that selection and saving are
      // blocked until this read completes, rather than racing a disabled option.
      const consentUrl=approved.origin+"/__pg_native/api/v2/knowledge-embedding/consent"
      let releaseMetadata,metadataDone;const metadataGate=new Promise(resolve=>{releaseMetadata=resolve}),metadataCompleted=new Promise(resolve=>{metadataDone=resolve})
      const holdMetadata=async route=>{try{if(route.request().method()==="GET")await metadataGate;await route.continue()}finally{metadataDone()}}
      await bob.route(consentUrl,holdMetadata)
      const reading=bob.waitForRequest(request=>request.method()==="GET"&&request.url()===consentUrl)
      try{
        await panel.getByRole("button",{name:"读取本人检索配置",exact:true}).click();await reading
        await expect(panel.getByRole("combobox",{name:"知识库检索方式",exact:true})).toBeDisabled()
        await expect(panel.getByRole("button",{name:"保存知识库绑定",exact:true})).toBeDisabled()
      }finally{releaseMetadata();await metadataCompleted;await bob.unroute(consentUrl,holdMetadata)}
      await expect.poll(()=>panel.getByRole("combobox",{name:"知识库检索方式",exact:true}).locator('option[value="semantic"]').evaluate(option=>option.disabled)).toBe(false)
      await panel.getByRole("combobox",{name:"知识库检索方式",exact:true}).selectOption("semantic")
      await expect(panel.locator('form[data-knowledge-mode]')).toHaveAttribute("data-knowledge-mode","semantic")
      await expect(panel.getByText("已选择语义检索，尚未保存。",{exact:true})).toBeVisible()
      await expect(panel.getByRole("combobox",{name:"知识库检索方式",exact:true})).toHaveValue("semantic")
      const saved=bob.waitForResponse(response=>response.request().method()==="PATCH"&&response.url().includes("/api/v2/agent-specs/"))
      await panel.getByRole("button",{name:"保存知识库绑定",exact:true}).click();const response=await saved;expect(response.status()).toBe(200)
      expect(response.request().postDataJSON().spec.knowledge_retrieval?.mode).toBe("semantic")
      expect((await response.json()).item.spec.knowledge_retrieval?.mode).toBe("semantic")
      await expect(panel.getByRole("combobox",{name:"知识库检索方式",exact:true})).toHaveValue("unavailable")
      await panel.getByRole("button",{name:"读取本人检索配置",exact:true}).click();await expect(panel.getByRole("combobox",{name:"知识库检索方式",exact:true})).toHaveValue("semantic")
      expect((await state()).queryEmbeddings).toBe(beforeTool.queryEmbeddings)
      await bob.getByRole("button",{name:"多轮 Agent",exact:true}).click()
      await bob.getByRole("combobox",{name:"多轮 Agent 角色",exact:true}).selectOption({label:"Bob Browser Agent · gpt-4.1-mini"})
      await bob.getByRole("textbox",{name:"多轮任务要求",exact:true}).fill("Private task must never enter embedding request")
      await bob.getByRole("button",{name:"提交多轮任务",exact:true}).click()
    }
    const refreshRun=()=>bob.getByRole("button",{name:runtime==="workflow"?"刷新工作流任务":"刷新多轮任务",exact:true}).click()
    const region=()=>bob.getByRole("article",{name:runtime==="workflow"?"Workflow 运行详情":"多轮任务详情",exact:true})
    let pendingQuery=false,succeeded=false,feeSteps=0
    for(let i=0;i<22;i++){
      let tick
      if(pendingQuery){
        const running=control(runtime)
        await expect.poll(async()=>(await state()).queryJobs).toBe(beforeTool.queryJobs+1)
        expect((await control("query")).status).toBe("retrieved");tick=await running;pendingQuery=false
      }else tick=await control(runtime)
      if(tick.status==="succeeded"){succeeded=true;break}
      if(tick.status!=="awaiting_approval")continue
      await refreshRun();const detail=region(),approve=detail.getByRole("button",{name:runtime==="workflow"?"批准工作流当前步骤":"批准当前步骤",exact:true})
      await expect(approve).toBeDisabled()
      const fee=detail.getByRole("checkbox",{name:"我确认本次语义查询可能产生费用，使用我自己的检索配置，仅批准当前步骤。",exact:true})
      await detail.getByRole("checkbox",{name:/^我已核对/}).check()
      if(await fee.count()){
        feeSteps++;await expect(approve).toBeDisabled();expect((await state()).queryJobs).toBe(beforeTool.queryJobs)
        await fee.check();await expect(approve).toBeEnabled();await control("drop-next-decision")
        await approve.click();await expect(detail.getByRole("button",{name:"确认上次批准",exact:true})).toBeEnabled()
        const retried=bob.waitForResponse(response=>response.request().method()==="POST"&&response.url().endsWith("/decision"))
        await detail.getByRole("button",{name:"确认上次批准",exact:true}).click();expect((await retried).status()).toBe(200)
        const hashes=(await state()).decisionHashes;expect(hashes.at(-1)).toBe(hashes.at(-2));pendingQuery=true
      }else await approve.click()
      await expect(bob.getByText("已批准当前步骤。",{exact:true})).toBeVisible()
    }
    expect(succeeded).toBe(true);expect(feeSteps).toBe(1);await refreshRun()
    const taskResult=region().getByRole("region",{name:runtime==="workflow"?"Workflow 执行结果":"多轮执行结果",exact:true})
    await expect(taskResult).toContainText(runtime==="workflow"?"Browser synthetic workflow model output":"Browser synthetic semantic Agent answer")
    if(runtime==="workflow"){
      const progress=region().getByRole("region",{name:"Workflow 步骤进度",exact:true});await expect(progress).toHaveCount(1);await expect(progress.getByRole("listitem")).toHaveCount(4)
      const outputs=region().getByRole("region",{name:"已保存节点输出",exact:true});await outputs.getByRole("button",{name:"读取节点输出",exact:true}).click()
      await expect(outputs.getByRole("list",{name:"最近节点输出",exact:true})).toContainText("BROWSER_SEMANTIC_SOURCE")
    }
    const toolResult=await state();expect(toolResult.queryEmbeddings).toBe(2);expect(toolResult.queryInputs).toEqual([["unrelated wording"],["tool wording"]]);expect(toolResult.semanticModelPrompts).toBe(1)
    await bob.screenshot({path:testInfo.outputPath("approved-semantic-tool.png"),fullPage:true})
    await sharing(alice).getByRole("button",{name:"撤销语义许可",exact:true}).click()
    await refreshRun();await expect(taskResult).toHaveCount(0)
    await expect(region().getByText("知识库来源暂不可用，已隐藏相关输出。请核对授权和配置。",{exact:true})).toBeVisible()
    if(runtime==="workflow"){await expect(region().getByRole("region",{name:"Workflow 步骤进度",exact:true})).toHaveCount(1);await expect(region().getByRole("region",{name:"已保存节点输出",exact:true})).toHaveCount(0);await expect(region()).not.toContainText("BROWSER_SEMANTIC_SOURCE")}
    await bob.getByRole("button",{name:/^知识库 \d+$/}).click()
    await expect(sharing(alice).getByRole("button",{name:"允许语义检索",exact:true})).toBeVisible()
    await query(bob).getByRole("button",{name:"核对查询回执",exact:true}).click()
    await expect(query(bob).getByRole("list",{name:"语义查询结果",exact:true})).toHaveCount(0)
    await expect(query(bob).getByText(/原结果不再提供/)).toBeVisible()
    await sharing(alice).getByRole("button",{name:"允许语义检索",exact:true}).click()
    await expect(sharing(alice).getByRole("button",{name:"撤销语义许可",exact:true})).toBeVisible()
    await query(bob).getByRole("button",{name:"核对查询回执",exact:true}).click()
    await expect(query(bob).getByRole("list",{name:"语义查询结果",exact:true})).toHaveCount(0)
    await query(bob).getByRole("combobox",{name:"查询方式",exact:true}).selectOption("auto")
    await query(bob).getByRole("textbox",{name:"查询内容",exact:true}).fill("cedar")
    await query(bob).getByRole("button",{name:"提交新查询",exact:true}).click()
    await expect(query(bob).getByText(/未逐次确认费用，本次使用关键词检索/)).toBeVisible()
    expect((await state()).queryEmbeddings).toBe(2)
    await control("fail-query")
    await query(bob).getByRole("checkbox",{name:"同意仅为本次查询支付本人模型的提供商费用",exact:true}).check()
    await query(bob).getByRole("button",{name:"提交新查询",exact:true}).click()
    await expect(query(bob).getByText(/查询处理中，页面只读取状态/)).toBeVisible()
    expect((await control("query")).status).toBe("retrieved")
    await query(bob).getByRole("button",{name:"核对查询回执",exact:true}).click()
    await expect(query(bob).getByText(/向量服务未能返回可用结果/)).toBeVisible()
    await expect(query(bob).getByText(/本次查询可能已产生提供商费用/)).toBeVisible()
    current=await state();expect(current.queryEmbeddings).toBe(3);expect(current.queryInputs).toEqual([["unrelated wording"],["tool wording"],["cedar"]])
    await control("deny-semantic");await bob.getByRole("button",{name:"刷新",exact:true}).click()
    await expect(query(bob).getByText(/管理员尚未开放语义查询/)).toBeVisible()
    await expect(query(bob).getByRole("list",{name:"语义查询结果",exact:true})).toHaveCount(0)
    expect((await state()).queryEmbeddings).toBe(3);expect((await state()).generated).toBe(runtime==="workflow"?1:2)
    await bob.screenshot({path:testInfo.outputPath("knowledge-semantic-revoked.png"),fullPage:true})
    await bob.getByRole("button",{name:"退出",exact:true}).click();await login(bob,"alice")
    await expect(bob.getByText(/查询回执：/)).toHaveCount(0)
    expect(await bob.evaluate(()=>Object.keys(localStorage))).toEqual([]);expect(external).toEqual([])
  }finally{
    clearTimeout(timer);await Promise.allSettled([aliceContext?.close(),bobContext?.close()]);if(browser)await browser.close().catch(()=>{})
    if(control)await control("stop").catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once("exit",resolve)),forced=setTimeout(()=>child.kill("SIGTERM"),5000);await exited;clearTimeout(forced)}
  }
})
