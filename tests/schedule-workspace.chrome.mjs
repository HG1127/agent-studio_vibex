// Actual Edge + temporary verified-user API. History rows below are explicitly
// seeded fixtures; they do not claim that a real scheduled task was executed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import {randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {chromium,expect} from '@playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-schedule-workspace-'))
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await freePort(),apiOrigin='http://127.0.0.1:'+port,secret=randomBytes(24).toString('hex'),password='Fixture-schedules-2026!'
const out=path.join(root,'.tmp/schedule-workspace');fs.mkdirSync(out,{recursive:true})
let pb,ui,browser,logs='',checks=0
const errors=[],requests=[],pause=ms=>new Promise(r=>setTimeout(r,ms)),passed=name=>{checks++;console.log('PASS '+name)}
async function api(route,method='GET',body,token,setup=false){
  const response=await fetch(apiOrigin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...(setup?{'X-Agent-Studio-Setup-Key':secret}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})
  const data=await response.json().catch(()=>({}));assert.ok(response.ok,route+' HTTP '+response.status+' '+JSON.stringify(data));return data
}
try{
  pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http=127.0.0.1:'+port,'--dir='+tmp,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:secret,AGENT_STUDIO_BACKGROUND_WORKER:'false',AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex')}})
  pb.stdout.on('data',d=>logs=(logs+String(d)).slice(-2000));pb.stderr.on('data',d=>logs=(logs+String(d)).slice(-2000))
  let ready=false;for(let i=0;i<140;i++){try{if((await fetch(apiOrigin+'/api/health')).ok){ready=true;break}}catch{}await pause(100)}assert.ok(ready)
  await api('/api/studio/bootstrap','POST',{email:'schedule-owner@example.test',password,display_name:'计划体验验收'},null,true)
  const auth=await api('/api/collections/studio_users/auth-with-password','POST',{identity:'schedule-owner@example.test',password}),token=auth.token
  const wf=await api('/api/workflow-studio/create','POST',{name:'隔离验证工作流',graph:{nodes:[{id:'s',type:'start',data:{title:'开始'},position:{x:0,y:0}},{id:'e',type:'end',data:{title:'结束',output_template:'{{input}}'},position:{x:200,y:0}}],edges:[{id:'edge',source:'s',target:'e'}]}},token)
  const future=Date.now()+86400000
  const payload={target_kind:'workflow',target_id:wf.id,instruction:'仅验证计划管理，不执行任务',recurrence_kind:'interval',interval_minutes:60,time_zone:'Asia/Singapore',local_time:'09:00',weekday:1,start_at_ms:future,next_at_ms:future}
  const a=await api('/api/schedules/manage','POST',{...payload,action:'create',name:'Alpha 暂停计划',enabled:false},token)
  const b=await api('/api/schedules/manage','POST',{...payload,action:'create',name:'Beta 启用计划',enabled:true},token)
  const db=new DatabaseSync(path.join(tmp,'data.db'),{timeout:5000})
  try{
    const insert=db.prepare('INSERT INTO agent_studio_schedule_occurrences (id,schedule_id,rh_user_id,scheduled_for_ms,schedule_revision,run_id,status,attempts,locked_until_ms,next_retry_ms,error,created_ms,updated_ms) VALUES (?,?,?,?,1,?, ?,1,0,0,?,?,?)')
    for(let i=0;i<65;i++)insert.run('abf0'+i.toString(16).padStart(16,'0'),a.id,auth.record.id,future+i,'','failed_start','A_RECORD_'+i,future+i,future+i)
    insert.run('b'.repeat(20),b.id,auth.record.id,future,'','failed_start','B_RECORD_ONLY',future,future)
  }finally{db.close()}
  process.env.AGENT_STUDIO_PB_ORIGIN=apiOrigin
  const {preview}=await import('vite');ui=await preview({configFile:path.join(root,'vibex-local/vite.local.config.ts'),preview:{port:0,host:'127.0.0.1',strictPort:false,open:false},logLevel:'error'})
  const origin='http://127.0.0.1:'+ui.httpServer.address().port
  browser=await chromium.launch({channel:'msedge',headless:true})
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/__pb'))requests.push({path:u.pathname,method:r.method(),body:r.postData()})})
  await page.goto(origin+'/login?next='+encodeURIComponent('/scheduled-tasks'))
  await page.getByLabel('工作邮箱',{exact:true}).fill('schedule-owner@example.test');await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click()
  const list=page.getByRole('region',{name:'定时计划列表'}),nav=page.getByRole('navigation',{name:'定时任务工作视图'})
  await expect(list.getByRole('article',{name:'计划：Alpha 暂停计划',exact:true})).toBeVisible()
  await expect(page.locator('#schedule-editor')).toHaveCount(0)
  assert.equal(requests.some(r=>/\/model-connections|\/workflow-studio\/list|\/agent_specs/.test(r.path)),false,'list does not prefetch editing catalogs')
  await expect(page.getByRole('button',{name:'调整 Agent 方案',exact:true})).toHaveCount(0)
  await expect(page.getByRole('link',{name:'查看运行监控 →'})).toHaveAttribute('href','/tool-hub?view=monitor')
  passed('list-first workspace has no long form or unrelated editor/model calls; monitoring route is exact')
  await page.getByLabel('搜索定时计划').fill('Alpha');await expect(list.getByRole('article')).toHaveCount(1)
  await page.getByRole('button',{name:'编辑定时计划：Alpha 暂停计划',exact:true}).click()
  const editor=page.getByRole('dialog',{name:'编辑定时计划',exact:true})
  await expect(editor).toBeVisible();await expect(editor.getByLabel('执行对象')).toHaveValue(wf.id)
  await editor.getByLabel('计划名称',{exact:true}).fill('Alpha 已编辑仍暂停')
  for(const width of [390,768,1440,1780]){
    await page.setViewportSize({width,height:950})
    const m=await editor.evaluate(e=>({w:e.clientWidth,s:e.scrollWidth}));assert.ok(m.s<=m.w+4,'editor overflow '+width)
    await expect(editor.getByRole('button',{name:'保存修改',exact:true})).toBeVisible()
  }
  await editor.getByRole('button',{name:'保存修改',exact:true}).click();await expect(editor).toHaveCount(0)
  const edited=(await api('/api/schedules','GET',undefined,token)).items.find(t=>t.id===a.id)
  assert.equal(edited.enabled,false);assert.equal(edited.start_at_ms,future);assert.equal(edited.next_at_ms,future)
  await expect(page.getByLabel('搜索定时计划')).toHaveValue('Alpha')
  await expect(list).toContainText('Alpha 已编辑仍暂停')
  passed('editing preserves paused state, exact scheduling anchor and list filters across four viewport sizes')
  await page.setViewportSize({width:1440,height:1000})
  await page.getByRole('button',{name:'新建计划',exact:true}).click()
  const create=page.getByRole('dialog',{name:'新建定时计划',exact:true})
  await create.getByLabel('计划名称',{exact:true}).fill('不要丢失的草稿')
  await create.getByRole('button',{name:'取消',exact:true}).click()
  const confirm=page.locator('[data-studio-dialog]')
  await confirm.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(create.getByLabel('计划名称',{exact:true})).toHaveValue('不要丢失的草稿')
  await create.getByRole('button',{name:'取消',exact:true}).click();await confirm.getByRole('button',{name:'放弃修改并离开',exact:true}).click();await expect(create).toHaveCount(0)
  passed('closing dirty editor preserves inputs on cancel and discards only after explicit confirmation')
  await page.getByLabel('搜索定时计划').fill('Beta')
  await page.getByRole('button',{name:'复制定时计划：Beta 启用计划',exact:true}).click()
  await expect(create.getByLabel('保存后启用计划')).not.toBeChecked()
  await expect(create.getByLabel('每次运行的任务指令')).toHaveValue(payload.instruction)
  await create.getByRole('button',{name:'保存为暂停计划',exact:true}).click();await expect(create).toHaveCount(0)
  const copied=(await api('/api/schedules','GET',undefined,token)).items.find(t=>t.name==='Beta 启用计划 · 副本')
  assert.ok(copied);assert.equal(copied.enabled,false)
  passed('copy reuses owned task configuration but never carries over activation')
  await page.getByLabel('搜索定时计划').fill('Alpha')
  await page.getByRole('button',{name:'编辑定时计划：Alpha 已编辑仍暂停',exact:true}).click()
  await editor.getByLabel('计划名称',{exact:true}).fill('本地未保存名称')
  await api('/api/schedules/manage','POST',{...payload,action:'update',id:a.id,expected_revision:edited.revision,preserve_timing:true,name:'Alpha 服务端新版本'},token)
  await editor.getByRole('button',{name:'保存修改',exact:true}).click()
  await expect(editor.getByRole('alert')).toContainText('其他页面修改')
  await expect(editor.getByLabel('计划名称',{exact:true})).toHaveValue('本地未保存名称')
  assert.equal((await api('/api/schedules','GET',undefined,token)).items.find(t=>t.id===a.id).name,'Alpha 服务端新版本')
  await editor.getByRole('button',{name:'取消',exact:true}).click();await confirm.getByRole('button',{name:'放弃修改并离开',exact:true}).click()
  await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(list).toContainText('Alpha 服务端新版本')
  passed('stale revisions are rejected by the real API and unsaved text remains editable')
  await list.getByRole('article',{name:'计划：Alpha 服务端新版本',exact:true}).getByRole('button',{name:'执行记录',exact:true}).click()
  const history=page.getByRole('region',{name:'计划执行历史'})
  await expect(history).toContainText('共 65 条记录');await expect(history.getByRole('article')).toHaveCount(20)
  for(let i=0;i<3;i++){await history.getByRole('button',{name:'下一页',exact:true}).click();await expect(page).toHaveURL(new RegExp('historyPage='+(i+2)));await expect(history.getByRole('article')).toHaveCount(i===2?5:20)}
  await expect(history).toContainText('A_RECORD_0')
  await history.getByRole('button',{name:'返回计划列表',exact:true}).click();await expect(page.getByLabel('搜索定时计划')).toHaveValue('Alpha')
  passed('per-plan server pagination reaches records beyond 60 and returns to the same filtered list')
  await list.getByRole('article',{name:'计划：Alpha 服务端新版本',exact:true}).getByRole('button',{name:'执行记录',exact:true}).click()
  await expect(history).toContainText('共 65 条记录')
  const arrived=Promise.withResolvers(),release=Promise.withResolvers(),finished=Promise.withResolvers()
  await page.route('**/__pb/api/schedules?**',async route=>{const u=new URL(route.request().url());if(u.searchParams.get('id')!==a.id||u.searchParams.get('history_page')!=='2')return route.continue();const response=await route.fetch();arrived.resolve();await release.promise;await route.fulfill({response});finished.resolve()})
  await history.getByRole('button',{name:'下一页',exact:true}).click();await arrived.promise
  await page.getByLabel('筛选执行历史').selectOption(b.id);await expect(history).toContainText('B_RECORD_ONLY')
  release.resolve();await finished.promise
  await expect(history).not.toContainText('A_RECORD_');await expect(history).toContainText('共 1 条记录')
  await page.unroute('**/__pb/api/schedules?**')
  passed('late history responses cannot overwrite another selected plan')
  await page.route('**/__pb/api/schedules?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'fixture_outage'})}),{times:1})
  await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(page.getByRole('alert')).toContainText('不代表计划或记录已删除')
  await expect(history).not.toContainText('暂无执行记录')
  await page.getByRole('button',{name:'重新读取',exact:true}).click();await expect(history).toContainText('B_RECORD_ONLY')
  passed('temporary history outage is explicit and recoverable, not a false empty result')
  await nav.getByRole('button',{name:'我的计划',exact:true}).click();await page.getByLabel('搜索定时计划').fill('Beta 启用计划')
  const beta=list.getByRole('article',{name:'计划：Beta 启用计划',exact:true})
  await beta.getByText('更多操作',{exact:true}).click();const before=requests.filter(r=>r.method==='POST'&&r.body?.includes('run_now')).length
  await beta.getByRole('button',{name:'立即运行一次',exact:true}).click();await expect(confirm).toContainText('可能产生模型或外部服务费用')
  await confirm.getByRole('button',{name:'取消',exact:true}).click()
  assert.equal(requests.filter(r=>r.method==='POST'&&r.body?.includes('run_now')).length,before)
  await beta.getByText('更多操作',{exact:true}).click()
  for(const width of [390,768,1440,1780]){await page.setViewportSize({width,height:950});const m=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));assert.ok(m.s<=m.w+4,'list overflow '+width)}
  await page.setViewportSize({width:1440,height:1000});await page.getByLabel('搜索定时计划').fill('')
  await page.screenshot({path:path.join(out,'schedule-list.png'),fullPage:true,animations:'disabled'})
  await page.getByRole('button',{name:'新建计划',exact:true}).click();await expect(create).toBeVisible();await page.screenshot({path:path.join(out,'schedule-editor.png'),fullPage:true,animations:'disabled'})
  passed('manual run requires explicit cost confirmation; decline sends no action and responsive list fits four widths')
  assert.deepEqual(errors,[])
  console.log('SCHEDULE_WORKSPACE_BROWSER_PASS '+JSON.stringify({checks,realBrowser:true,realPocketBase:true,seededHistory:66,faultInjection:['late history','503'],widths:[390,768,1440,1780],paidModelCalls:0,productionMutated:false}))
}catch(e){console.error('SCHEDULE_WORKSPACE_BROWSER_FAIL',String(e?.stack||e));console.error(logs.slice(-1200));process.exitCode=1}
finally{await browser?.close().catch(()=>{});if(ui)await new Promise(r=>ui.httpServer.close(r));await stopHeadlessPocketBase(pb).catch(()=>{});fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
