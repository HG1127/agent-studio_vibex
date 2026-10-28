import {test,expect,chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {requireNativeBrowserCi} from './ci-guard.mjs'
import {workerHeartbeatKinds,parseWorkerHeartbeatSnapshot} from '../../services/pg-api/src/worker-heartbeat-contract.ts'

// UI-only controlled wire responses; NOT a real telemetry controller, H3,
// Worker, SQL authority or liveness test. Actual Cookie/login/company SQL are
// supplied by the existing synthetic browser fixture. Genuine telemetry HTTP
// and controller evidence belongs to the separate actual PG18 control suite.
test('company Worker UI: synthetic wire projection, expiry, denial and late employee isolation',async({},testInfo)=>{
  const approved=requireNativeBrowserCi() // First effectful gate; never run locally.
  const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)))
  const env=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))
  env.AGENT_STUDIO_PG_BROWSER_FIXTURE='SYNTHETIC_LOCAL_ONLY'
  for(const name of ['AUTONOMOUS','HUMAN','MEMORY','OUTCOME_MEMORY','DERIVED_MEMORY','FAILURE_SOURCE','FEEDBACK','OPTIMIZATION','REVIEW','GENERATED_ACCEPTANCE','DESCRIPTIVE_PATCH','COMPANY_OVERVIEW'])
    env['AGENT_STUDIO_PG_BROWSER_'+name]='true'
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let browser,context,page,control,timer,held,output='',hints=false,mode='valid'
  const external=[],writes=[],workerRequests=[]
  const endpoint='/__pg_native/api/v2/company-worker-heartbeats',caps='/__pg_native/api/native-auth/capabilities'
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('synthetic_worker_ui_fixture_timeout')),45000)
    const consume=chunk=>{output=(output+chunk.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on('data',consume);child.stderr.on('data',consume);child.once('error',reject)
    child.once('exit',code=>reject(Error('synthetic_worker_ui_fixture_exit_'+code+' '+output.slice(-1500))))
  })
  function projection(nearExpiry=false){
    const at=Date.now(),as_of=new Date(at).toISOString(),fresh=new Date(at-(nearExpiry?89000:0)).toISOString()
    return parseWorkerHeartbeatSnapshot({protocol:'native_company_worker_heartbeats_v1',scope:'company_worker_metadata_only',as_of,stale_after_ms:90000,
      workers:workerHeartbeatKinds.map((kind,index)=>index===0?{kind,state:'ready',last_seen_at:fresh,reason:'fresh_ready_report'}:
        index===1?{kind,state:'draining',last_seen_at:fresh,reason:'fresh_draining_report'}:
        index===2?{kind,state:'stale',last_seen_at:new Date(at-90000).toISOString(),reason:'heartbeat_expired'}:
        {kind,state:'unknown',last_seen_at:null,reason:'not_observed'})})
  }
  async function settleHeld(){
    const current=held;if(!current)return
    current.release();let deadline
    try{await Promise.race([current.done,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('synthetic_worker_ui_held_route_unsettled')),10000)})])}
    finally{clearTimeout(deadline)}
    held=null
  }
  try{
    const info=await ready;clearTimeout(timer)
    expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536).toBe(true)
    control=async(name,method='POST')=>{
      const response=await fetch('http://127.0.0.1:'+info.apiPort+'/__fixture/'+name,{method,headers:{'X-AgentStudio-Synthetic-Fixture':'1'},signal:AbortSignal.timeout(15000)})
      expect(response.status).toBe(200);return response.json()
    }
    browser=await chromium.launch({headless:true})
    context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'})
    await context.route('**/*',async route=>{
      if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}
      else await route.continue()
    })
    page=await context.newPage()
    page.on('request',request=>{
      const url=new URL(request.url())
      if(url.origin!==approved.origin)external.push(url.origin)
      if(url.pathname.startsWith('/__pg_native/api/v2/')&&!['GET','HEAD'].includes(request.method()))writes.push({path:url.pathname,method:request.method()})
      if(url.pathname===endpoint)workerRequests.push({method:request.method(),search:url.search})
    })
    await page.route('**'+caps,async route=>{
      expect(new URL(route.request().url()).origin).toBe(approved.origin)
      const response=await route.fetch()
      if(response.status()!==200){await route.fulfill({response});return}
      const value=await response.json()
      // A hint can expose the widget, but it never supplies its data or grants
      // an employee a real backend permission. Keep Bob's actual denial intact.
      if(hints&&value.company_overview_available===true)value.company_worker_heartbeats_available=true
      const headers={...response.headers()};delete headers['content-length'];delete headers['content-encoding']
      await route.fulfill({status:response.status(),headers,body:JSON.stringify(value)})
    })
    await page.route('**'+endpoint,async route=>{
      expect(new URL(route.request().url()).origin).toBe(approved.origin)
      expect(route.request().method()).toBe('GET')
      const selected=mode
      if(selected==='held'){
        let release,complete,reached
        const gate=new Promise(resolve=>{release=resolve}),done=new Promise(resolve=>{complete=resolve})
        const claimed=new Promise(resolve=>{reached=resolve})
        held={release,done,claimed};reached()
        await gate
        try{await route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(projection())});complete({cancelled:false})}
        catch{complete({cancelled:true})}
        return
      }
      if(selected==='unavailable'||selected==='forbidden'){
        await route.fulfill({status:selected==='forbidden'?403:503,contentType:'application/json',body:JSON.stringify({error:selected==='forbidden'?'admin_required':'company_worker_heartbeats_unavailable'})});return
      }
      const value=structuredClone(projection(selected==='near_expiry'))
      if(selected==='invalid')value.workers[0].password='UI_ONLY_PRIVATE_MARKER'
      await route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(value)})
    })
    const login=async who=>{
      await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(who+'@example.com')
      await page.getByLabel('密码',{exact:true}).fill(who==='alice'?'SyntheticAlicePassword#2026':'SyntheticBobPassword#2026')
      await page.getByRole('button',{name:'登录独立工作台',exact:true}).click()
      await expect(page.getByRole('button',{name:/^Agent 配置/})).toBeVisible()
    }
    const refreshCapabilities=async()=>{
      const response=page.waitForResponse(value=>new URL(value.url()).pathname===caps&&value.request().method()==='GET')
      await page.getByRole('button',{name:'刷新',exact:true}).first().click();expect((await response).status()).toBe(200)
    }
    const panel=page.getByRole('region',{name:'公司 Worker 心跳快照',exact:true})
    const noRetainedData=async()=>{
      await expect(panel.locator('time')).toHaveCount(0)
      await expect(panel.getByText('就绪（快照时点）',{exact:true})).toHaveCount(0)
      await expect(panel.getByRole('cell',{name:'未知',exact:true})).toHaveCount(8)
    }
    await page.goto(info.url,{waitUntil:'domcontentloaded'});await login('alice')
    const before=await control('state','GET')
    await page.getByRole('button',{name:'公司概览',exact:true}).click()
    await expect(page.getByText('Worker 心跳暂不可用（尚未接入真实遥测）。',{exact:true})).toBeVisible()
    expect(workerRequests).toEqual([]);await expect(panel).toHaveCount(0)

    hints=true;await refreshCapabilities()
    await expect(panel).toBeVisible();await expect(panel.getByRole('row')).toHaveCount(9)
    await expect(panel.getByText('就绪（快照时点）',{exact:true})).toBeVisible()
    await expect(panel.getByText('停止接收新任务（报告状态）',{exact:true})).toBeVisible()
    await expect(panel.getByText('心跳已过期',{exact:true})).toBeVisible()
    await page.screenshot({path:testInfo.outputPath('worker-ui-synthetic-desktop.png'),fullPage:true})
    await page.setViewportSize({width:390,height:844})
    await expect(panel.getByRole('button',{name:'重新读取心跳快照',exact:true})).toBeVisible()
    await page.screenshot({path:testInfo.outputPath('worker-ui-synthetic-mobile.png'),fullPage:true})
    await page.setViewportSize({width:1280,height:1000})
    const responseForWorker=()=>page.waitForResponse(value=>new URL(value.url()).pathname===endpoint&&value.request().method()==='GET')
    mode='near_expiry';let reading=responseForWorker();await panel.getByRole('button',{name:'重新读取心跳快照',exact:true}).click()
    expect((await reading).status()).toBe(200)
    await expect(panel.getByText('就绪（快照时点）',{exact:true})).toBeVisible()
    await noRetainedData();await expect(panel.getByRole('alert')).toContainText('已过有效期')
    for(const selected of ['invalid','unavailable']){
      mode=selected;reading=responseForWorker();await panel.getByRole('button',{name:'重新读取心跳快照',exact:true}).click()
      expect((await reading).status()).toBe(selected==='invalid'?200:503)
      await expect(panel.getByRole('alert')).toContainText('当前状态未知');await noRetainedData()
      await expect(page.locator('body')).not.toContainText('UI_ONLY_PRIVATE_MARKER')
    }
    mode='forbidden';reading=responseForWorker();await panel.getByRole('button',{name:'重新读取心跳快照',exact:true}).click()
    expect((await reading).status()).toBe(403)
    await expect(panel.getByRole('alert')).toContainText('管理员权限已变化');await noRetainedData()
    await expect(panel.getByRole('button',{name:'重新读取心跳快照',exact:true})).toBeDisabled()
    await page.screenshot({path:testInfo.outputPath('worker-ui-synthetic-denied.png'),fullPage:true})

    hints=false;await refreshCapabilities();await expect(panel).toHaveCount(0)
    mode='valid';hints=true;await refreshCapabilities();await expect(panel.getByText('就绪（快照时点）',{exact:true})).toBeVisible()
    mode='held';await panel.getByRole('button',{name:'重新读取心跳快照',exact:true}).click()
    await expect.poll(()=>Boolean(held)).toBe(true)
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob');await settleHeld()
    await expect(page.getByRole('button',{name:'公司概览',exact:true})).toHaveCount(0)
    await expect(panel).toHaveCount(0)
    await expect(page.getByText('就绪（快照时点）',{exact:true})).toHaveCount(0)
    await expect(page.getByText('Bob Browser Agent',{exact:true}).first()).toBeVisible()
    const after=await control('state','GET')
    expect(after.companyBusinessSnapshot).toEqual(before.companyBusinessSnapshot)
    expect(after.runs).toBe(before.runs)
    for(const key of ['submissions','configRequests','generated','httpCalls','mcpCalls','mcpDiscoveries','smitheryWrites','reviewSyntheticCompletions'])expect(after[key]).toBe(0)
    expect(writes).toEqual([]);expect(external).toEqual([])
    expect(workerRequests.length).toBeGreaterThanOrEqual(7)
    expect(workerRequests.every(value=>value.method==='GET'&&value.search==='')).toBe(true)
    const evidence={scope:'UI_only_mocked_telemetry_wire',synthetic_only:true,
      actual_telemetry_authority_exercised:false,real_Worker_instrumentation_exercised:false,exact_eight_rows:true,local_expiry_cleared:true,
      malformed_and_unavailable_cleared:true,forbidden_cleared:true,late_employee_response_suppressed:true,business_snapshot_unchanged:true,requests:workerRequests}
    console.log(JSON.stringify({event:'worker_ui_synthetic_browser_pass',...evidence}))
    await testInfo.attach('worker-ui-synthetic-evidence.json',{body:Buffer.from(JSON.stringify(evidence,null,2)),contentType:'application/json'})
  }finally{
    clearTimeout(timer)
    const errors=[],cleanup=async action=>{try{await action()}catch(error){errors.push(error)}}
    await cleanup(settleHeld)
    if(context)await cleanup(()=>context.close())
    if(browser)await cleanup(()=>browser.close())
    if(control)await cleanup(()=>control('stop'))
    if(typeof child.pid==='number'&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{
      let forced,deadline;const done=()=>{clearTimeout(forced);clearTimeout(deadline);child.off('exit',done);resolve()}
      child.once('exit',done);forced=setTimeout(()=>child.kill('SIGTERM'),5000);deadline=setTimeout(()=>{child.kill('SIGKILL');done()},10000)
    })
    if(errors.length)throw new AggregateError(errors,'synthetic_worker_ui_owned_cleanup_failed')
  }
})
