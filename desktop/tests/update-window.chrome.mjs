// Rendering/interaction acceptance for the actual updater HTML/CSS/JS. The
// bridge is an explicit display fixture; real update integrity has separate tests.
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {chromium,expect} from 'playwright/test'
const root=process.cwd(),out=await fs.mkdtemp(path.join(root,'.tmp/update-window-'))
const releases=JSON.parse(await fs.readFile('desktop/release-history.json','utf8'))
let state={phase:'available',currentVersion:'0.1.0-preview.13',version:'0.1.0-preview.14',notes:releases[0].notes,publishedAt:'2026-11-02T08:30:00Z',checkedAt:'2026-11-02T08:32:00Z',size:217423082,progress:0,releases,feed:'https://company.test/desktop-updates/stable/latest.json',message:'发现新版本 0.1.0-preview.14'}
const latest=releases[0],previous=releases[1],groupCount=latest.notes.match(/^\[.+\]$/gm).length
state={...state,currentVersion:previous.version,version:latest.version,notes:latest.notes,message:'发现新版本 '+latest.version}
const calls=[],errors=[],checks=[];let blockedInstall=false
const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(!['updates.html','updates.css','updates.js','icon.png'].includes(name))throw Error('missing');const bytes=await fs.readFile(path.join(root,'desktop/ui',name));res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'image/png'});res.end(bytes)}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu','--renderer-process-limit=2']})
 const context=await browser.newContext({viewport:{width:1000,height:748},timezoneId:'Asia/Shanghai'}),page=await context.newPage()
 page.on('pageerror',e=>errors.push(e.message))
 await page.exposeFunction('__updateAction',async(action,input)=>{calls.push({action,input});if(action==='install'&&blockedInstall)throw Error('请先完成或取消本机操作和授权确认，再更新');if(action==='feed')state={...state,phase:'available',feed:input,message:'发现新版本 0.1.0-preview.14'};return structuredClone(state)})
 await page.addInitScript(()=>{window.desktopUpdates={request:(action,input)=>window.__updateAction(action,input),onState:callback=>{window.__pushUpdate=callback}}})
 const push=async patch=>{state={...state,...patch};await page.evaluate(s=>window.__pushUpdate(s),state)}
 const screenshot=async name=>{await page.locator('.main').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(out,name+'.png'),fullPage:true})}
 await page.goto('http://127.0.0.1:'+server.address().port+'/updates.html')
 await expect(page.locator('#current')).toHaveText(state.currentVersion);await expect(page.locator('#latest-version')).toHaveText(state.version)
 await expect(page.locator('#release-title')).toHaveText(latest.title);await expect(page.locator('#notes .change-group')).toHaveCount(groupCount)
 await expect(page.locator('#download')).toBeVisible();await expect(page.locator('#install')).toBeHidden();assert.deepEqual(calls.map(c=>c.action),['state'])
 await screenshot('overview');checks.push('overview shows distinct installed/latest versions, release title/date, grouped notes and download action without automatically checking/downloading')
 await page.getByRole('button',{name:'版本历史',exact:false}).click();await expect(page.locator('#history-list details')).toHaveCount(releases.length)
 await expect(page.getByText('当前安装',{exact:true})).toHaveCount(2)
 await page.locator('details').filter({hasText:'0.1.0-preview.12'}).locator('summary').click();await expect(page.getByText('更新签名与文件完整性校验。',{exact:true})).toBeVisible()
 await screenshot('history');checks.push('version history expands real curated release notes and identifies the installed version')
 await page.getByRole('button',{name:'更新概览',exact:true}).click()
 await push({phase:'downloading',progress:43,downloaded:93491925,message:'正在下载并校验更新…'})
 await expect(page.locator('#progress-value')).toHaveText('43%');await expect(page.locator('#check')).toBeDisabled();await expect(page.locator('#install')).toBeHidden();await screenshot('downloading')
 await push({phase:'ready',progress:100,message:'更新已就绪，可以重启更新'});await expect(page.locator('#install')).toBeVisible();await screenshot('ready');await page.locator('#install').click();assert.equal(calls.filter(c=>c.action==='install').length,1)
 checks.push('download, verification-ready and restart actions are separate; only an explicit click invokes installation')
 blockedInstall=true;await page.locator('#install').click();await expect(page.locator('#status')).toContainText('请先完成或取消');await expect(page.locator('#install')).toBeVisible();blockedInstall=false
 checks.push('a pending-computer-operation rejection keeps the verified download available for an explicit later retry')
 await push({phase:'current',currentVersion:latest.version,version:latest.version,message:'当前已是最新版本'})
 await expect(page.locator('#headline')).toHaveText('已安装最新版本');await expect(page.locator('#notes')).toContainText(latest.notes.match(/^- (.+)$/m)[1]);await expect(page.locator('#install')).toBeHidden();await screenshot('current')
 await push({phase:'error',message:'更新签名验证失败，未下载或运行'});await expect(page.locator('#status')).toContainText('签名验证失败');await expect(page.locator('#download')).toBeHidden();await expect(page.locator('#install')).toBeHidden()
 checks.push('already-current clients retain notes; integrity failures never show install/download actions')
 await page.getByRole('button',{name:'更新设置',exact:true}).click();const feed=page.getByLabel('更新服务地址');await feed.fill('https://updates.company.test/latest.json')
 await push({phase:'checking',feed:'https://old.company.test/latest.json',message:'正在检查更新…'});await expect(feed).toHaveValue('https://updates.company.test/latest.json');await expect(page.locator('#save')).toBeDisabled()
 await push({phase:'error',message:'网络暂时不可用'});await page.locator('#save').click();await expect(page.locator('#view-overview')).toBeVisible();assert.equal(calls.at(-1).input,'https://updates.company.test/latest.json')
 checks.push('editing an update address survives background state events and saves through the fixed bridge action')
 const unsafe='<img src=x onerror="window.__xss=1">'
 await push({phase:'current',releases:[{...releases[0],title:unsafe,notes:unsafe+'\n[问题修复]\n- '+('长说明'.repeat(900))},...releases.slice(1)]})
 await expect(page.locator('#notes img')).toHaveCount(0);assert.equal(await page.evaluate(()=>window.__xss),undefined)
 for(const width of [1000,780,560]){await page.setViewportSize({width,height:748});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1&&document.querySelector('.main').scrollWidth<=document.querySelector('.main').clientWidth+1),true,'no horizontal overflow at '+width)}
 checks.push('release text is rendered without HTML execution; long notes and small windows have no horizontal overflow')
 await page.setViewportSize({width:780,height:640});await push({phase:'available',currentVersion:previous.version,releases,notes:releases[0].notes});await screenshot('compact')
 assert.deepEqual(errors,[])
 await fs.writeFile(path.join(out,'acceptance.json'),JSON.stringify({status:'PASS',checks,uiErrors:errors,realUpdaterAssets:true,bridge:'display-fixture',productionData:false},null,2));console.log('UPDATE_WINDOW_ACCEPTANCE '+out)
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
