// Real provider and production toolbar in Chrome. Only the private native IPC
// boundary is a synthetic fixture; no employee account or desktop action is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {chromium,expect} from 'playwright/test'

test('pending local confirmation is visible, explicit and cannot be approved after expiry',{timeout:90000},async()=>{
 const root=process.cwd(),parent=path.join(root,'.tmp'),baseline=process.argv.includes('--baseline')
 await fs.mkdir(parent,{recursive:true})
 const fixture=await fs.mkdtemp(path.join(parent,'confirmation-ui-'))
 const center=path.join(root,'src/components/tool-hub/DesktopComputerCenter.tsx')
 const evidence=process.env.AGENT_STUDIO_CONFIRMATION_QA_DIR
 let server,browser,previous=null,baselineApplied=false
 try{
  if(baseline)previous=execFileSync('git',['show','ca84207c2b9f4868798640b4ee4d008f4dc55c94:src/components/tool-hub/DesktopComputerCenter.tsx'],{cwd:root,encoding:'utf8',windowsHide:true})
  const desktopVersion=JSON.parse(await fs.readFile(path.join(root,'desktop/package.json'),'utf8')).version
  await fs.writeFile(path.join(fixture,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Agent Studio local confirmation regression</title><link rel="icon" href="data:,"><body><div id="root"></div><script type="module" src="./fixture.tsx"></script></body></html>')
  await fs.writeFile(path.join(fixture,'fixture.tsx'),`
import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import{DesktopComputerProvider}from'/src/components/tool-hub/DesktopComputerContext.tsx';
import{DesktopComputerCenter}from'/src/components/tool-hub/DesktopComputerCenter.tsx';import{pb}from'/src/lib/pb.ts';import'/src/index.css';
import{Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription}from'/src/components/ui/dialog.tsx';
const device='aaaaaaaaaaaaaaaaaaaaaaaa',listeners=new Set(),calls=[];let sequence=0;
const token=btoa('{}')+'.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.synthetic-fixture-only';
pb.authStore.save(token,{id:'employee0000001',email:'confirmation@example.test',display_name:'确认验收',role:'employee',active:true,share_enabled:false});
const state={engine:'ready',owner:'employee0000001',appVersion:${JSON.stringify(desktopVersion)},version:'fixture',selectedId:device,profiles:[{id:device,name:'本机确认验收电脑',server:location.origin,fingerprint:'f'.repeat(64),running:true,state:'online',roots:[{path:'D:\\\\Synthetic\\\\Work',readOnly:true,label:'验收资料'}],origins:[]}],devices:[{id:device,name:'本机确认验收电脑',revoked:false,paired:true,seen_ms:Date.now(),catalog:'[]'}],review:null,permissions:null,applicationPermissions:null,selection:null,busy:false,confirmations:[]};
window.studioDesktop={version:2,prepareConnection:async()=>{throw Error('pairing is outside this UI fixture')},openConnection:async()=>{throw Error('no native windows in this fixture')},computer:async(action,input)=>{
 if(action==='session'){if(input.token!==token)throw Error('unexpected fixture owner');return structuredClone(state)}
 if(action==='state')return structuredClone(state);
 if(action!=='confirm')throw Error('unexpected fixture action '+action);
 calls.push({id:input.id,consent:input.consent});
 const review=state.confirmations[0];if(!review||input.id!==review.id||Date.now()>=review.expiresAt)throw Error('此确认已结束');
 state.confirmations=[];return structuredClone(state);
},onConnectionRequested:cb=>{listeners.add(cb);return()=>listeners.delete(cb)}};
window.confirmationFixture={inject(duration=90000){const review={id:'review-'+(++sequence),deviceId:device,kind:'application',message:'应用：Synthetic WorkBuddy\\n操作：激活已授权窗口并获取截图。仅用于界面验收，不执行真实电脑操作。',expiresAt:Date.now()+duration};state.confirmations=[review];listeners.forEach(cb=>cb({deviceId:device,panel:'confirmation'}));return review},receipts:()=>calls.slice()};
function Fixture(){const[modal,setModal]=useState(false);useEffect(()=>{window.confirmationFixture.openModal=()=>setModal(true)},[]);return <MemoryRouter><DesktopComputerProvider><DesktopComputerCenter/><main style={{paddingTop:2400,paddingBottom:80,paddingLeft:16,paddingRight:16}}><h1>原任务执行过程</h1><label>公开调研草稿<textarea aria-label="公开调研草稿" defaultValue="保留的公开调研草稿" style={{display:'block',width:'100%',height:100}}/></label></main><Dialog open={modal} onOpenChange={setModal}><DialogContent><DialogHeader><DialogTitle>当前设置草稿</DialogTitle><DialogDescription>验证待确认操作会等待当前弹窗关闭，不抢走填写焦点。</DialogDescription></DialogHeader><input aria-label="弹窗内的草稿"/><button type="button" onClick={()=>setModal(false)}>完成当前设置</button></DialogContent></Dialog></DesktopComputerProvider></MemoryRouter>}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
`)
  // This fixture does not edit source after startup. Disable the watcher so a
  // clean Windows CI checkout never watches Chromium's locked temporary DBs.
  server=await createServer({root,cacheDir:path.join(fixture,'cache'),configFile:false,resolve:{alias:{'@':path.join(root,'src')}},plugins:[{name:'pristine-toolbar-comparison',enforce:'pre',transform(code,id){if(previous&&path.normalize(id.split('?')[0])===path.normalize(center)){baselineApplied=true;return {code:previous,map:null}}}},react()],optimizeDeps:{entries:[path.join(fixture,'index.html')],include:['react','react-dom/client','react-router-dom','@radix-ui/react-dialog','clsx','lucide-react','pocketbase','tailwind-merge']},server:{host:'127.0.0.1',port:0,watch:null}})
  await server.listen()
  const origin='http://127.0.0.1:'+server.httpServer.address().port
  const browserTemp=path.join(fixture,'browser-temp');await fs.mkdir(browserTemp)
  browser=await chromium.launch({headless:true,executablePath:process.env.AGENT_STUDIO_UI_CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'),env:{...process.env,TEMP:browserTemp,TMP:browserTemp,TMPDIR:browserTemp},args:['--disable-background-networking','--disable-sync','--renderer-process-limit=1','--disable-gpu']})
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.clock.install()
  await page.goto(origin+'/'+path.relative(root,fixture).split(path.sep).join('/')+'/index.html')
  await expect(page).toHaveTitle('Agent Studio local confirmation regression')
  await expect(page.getByLabel('电脑连接状态')).toContainText('已连接')
  const draft=page.getByRole('textbox',{name:'公开调研草稿',exact:true})
  await draft.fill('用户尚未提交的公开调研内容')
  await page.evaluate(()=>window.confirmationFixture.openModal())
  const modal=page.getByRole('dialog',{name:'当前设置草稿',exact:true}),modalDraft=modal.getByRole('textbox',{name:'弹窗内的草稿',exact:true})
  await modalDraft.fill('保留的设置草稿')
  const first=await page.evaluate(()=>window.confirmationFixture.inject())
  await expect(page.getByRole('heading',{name:'请确认本次应用操作',exact:true,includeHidden:true})).toBeAttached()
  await expect(modalDraft).toBeFocused();await expect(modalDraft).toHaveValue('保留的设置草稿')
  await modal.getByRole('button',{name:'完成当前设置',exact:true}).click();await expect(modal).toHaveCount(0)
  const heading=page.getByRole('heading',{name:'请确认本次应用操作',exact:true})
  await expect(heading).toBeVisible()
  if(baseline){
   assert.ok(baselineApplied,'comparison must load the real pristine production toolbar')
   console.log('CONFIRMATION_BASELINE '+JSON.stringify({commit:'ca84207c2b9f4868798640b4ee4d008f4dc55c94',sha256:createHash('sha256').update(previous).digest('hex')}))
  }
  await expect(heading,'a new local review must be brought into the employee viewport').toBeInViewport({timeout:3000})
  const card=page.getByRole('region',{name:'请确认本次应用操作',exact:true}),check=page.getByLabel('我已核对目标、内容，并同意本次操作。'),approve=card.getByRole('button',{name:'确认应用',exact:true})
  const receipts=()=>page.evaluate(()=>window.confirmationFixture.receipts())
  await expect(card).toBeFocused();await expect(check).not.toBeChecked();await expect(approve).toBeDisabled()
  await page.keyboard.press('Enter');assert.deepEqual(await receipts(),[],'focus and Enter must not grant consent')
  await expect(page.getByLabel('本机确认剩余时间')).toContainText('剩余')
  await draft.scrollIntoViewIfNeeded()
  const locate=page.getByRole('button',{name:'查看待确认本机操作',exact:true})
  await expect(locate).toBeInViewport();await locate.click();await expect(heading).toBeInViewport()
  await expect(draft).toHaveValue('用户尚未提交的公开调研内容');assert.deepEqual(await receipts(),[],'revealing a review must not approve it')
  await page.getByRole('button',{name:'管理连接',exact:false}).click();await expect(card).toHaveCount(0)
  await expect(locate).toBeInViewport();await locate.click();await expect(card).toBeVisible()
  await check.check();await expect(approve).toBeEnabled()
  const second=await page.evaluate(()=>window.confirmationFixture.inject())
  await expect(check).not.toBeChecked();await expect(approve).toBeDisabled()
  await expect(card).toBeFocused()
  assert.notEqual(first.id,second.id)
  await card.getByRole('button',{name:'拒绝',exact:true}).click();await expect(card).toHaveCount(0)
  assert.deepEqual(await receipts(),[{id:second.id,consent:false}])
  const short=await page.evaluate(()=>window.confirmationFixture.inject(3000))
  await expect(card).toBeVisible();await check.check();await expect(approve).toBeEnabled()
  await page.clock.setFixedTime(new Date(short.expiresAt+1))
  await approve.click()
  assert.equal((await receipts()).length,1,'even a stale visible countdown cannot send an expired confirmation')
  await page.clock.fastForward(1200)
  await expect(page.getByLabel('本机确认剩余时间')).toContainText('已到期');await expect(approve).toBeDisabled();await expect(check).toBeDisabled()
  await card.getByRole('button',{name:'刷新确认状态',exact:true}).click()
  await page.clock.setSystemTime(new Date())
  const third=await page.evaluate(()=>window.confirmationFixture.inject())
  await expect(card).toBeVisible();await expect(check).not.toBeChecked();await check.check();await approve.click();await expect(card).toHaveCount(0)
  assert.deepEqual(await receipts(),[{id:second.id,consent:false},{id:third.id,consent:true}])
  await page.setViewportSize({width:390,height:844});await draft.scrollIntoViewIfNeeded();await page.evaluate(()=>window.confirmationFixture.inject())
  await expect(heading).toBeInViewport();await expect(approve).toBeDisabled()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile review must not overflow horizontally')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);assert.deepEqual(errors,[])
  if(evidence){await fs.mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,'confirmation-mobile.png')});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(evidence,'confirmation-desktop.png')})}
  console.log('CONFIRMATION_UI_PASS '+JSON.stringify({offscreenReviewRevealed:true,safeFocus:true,noImplicitConsent:true,collapsedAndScrolledRecovery:true,draftPreserved:true,newRequestClearsConsent:true,expiredDispatchBlocked:true,explicitRepliesOnly:true,mobileNoOverflow:true,productionProvider:true,nativeBoundary:'synthetic private IPC only'}))
 }finally{
  const close=await Promise.allSettled([browser?.close(),server?.close()])
  const actual=await fs.realpath(fixture),intended=await fs.realpath(parent)
  if(path.dirname(actual)!==intended||!path.basename(actual).startsWith('confirmation-ui-'))throw Error('unsafe_fixture_cleanup')
  const rejectLinks=async dir=>{for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('unexpected_fixture_link');if(e.isDirectory())await rejectLinks(path.join(dir,e.name))}}
  await rejectLinks(actual);await fs.rm(actual,{recursive:true,force:true})
  const failure=close.find(r=>r.status==='rejected');if(failure)throw failure.reason
 }
})
