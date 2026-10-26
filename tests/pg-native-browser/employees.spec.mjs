import {test,expect,chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {requireNativeBrowserCi} from './ci-guard.mjs'

test('native employee governance: scoped admin changes, lost response recovery and self password logout',async({},testInfo)=>{
  const approved=requireNativeBrowserCi() // FIRST effectful gate: disposable hosted CI only.
  const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)))
  const env=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))
  Object.assign(env,{AGENT_STUDIO_PG_BROWSER_FIXTURE:'SYNTHETIC_LOCAL_ONLY',AGENT_STUDIO_PG_BROWSER_AUTONOMOUS:'true',AGENT_STUDIO_PG_BROWSER_RELEASES:'true',AGENT_STUDIO_PG_BROWSER_GOVERNANCE:'true'})
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let browser,timer,output=''
  try{
    const info=await new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(Error('synthetic_fixture_timeout')),45000)
      const consume=chunk=>{output=(output+chunk.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
      child.stdout.on('data',consume);child.stderr.on('data',consume);child.once('error',reject);child.once('exit',()=>reject(Error('fixture_exited_before_ready '+output.slice(-1000))))
    });clearTimeout(timer)
    expect(info.url.startsWith(approved.origin)).toBe(true)
    browser=await chromium.launch({headless:true})
    const context=await browser.newContext({viewport:{width:1280,height:1100}}),page=await context.newPage()
    const login=async(who,password)=>{await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(who+'@example.com');await page.getByLabel('密码',{exact:true}).fill(password)
      await page.getByRole('button',{name:'登录独立工作台',exact:true}).click()}
    const open=async()=>{await page.getByRole('button',{name:'员工管理',exact:true}).click();await expect(page.getByRole('region',{name:'员工账号治理',exact:true})).toBeVisible()}
    const edit=async(email,{enabled,sharing}={})=>{
      await page.getByRole('button',{name:'编辑员工 '+email,exact:true}).click()
      const form=page.getByRole('form',{name:'修改员工设置',exact:true})
      if(enabled!==undefined)await form.getByRole('checkbox',{name:'启用账号',exact:true}).setChecked(enabled)
      if(sharing!==undefined)await form.getByRole('checkbox',{name:'允许内部 Agent 模板分享',exact:true}).setChecked(sharing)
      await form.getByRole('checkbox',{name:'我已核对该员工和上述权限变化。',exact:true}).check()
      await form.getByRole('button',{name:'准备账号修改',exact:true}).click()
    }
    const send=()=>page.getByRole('button',{name:'发送账号原请求',exact:true}).click()
    const changed=()=>expect(page.getByRole('status').filter({hasText:/^账号设置已确认/})).toBeVisible()
    await page.goto(info.url,{waitUntil:'domcontentloaded'});await login('alice','SyntheticAlicePassword#2026');await open()
    await page.getByRole('button',{name:'编辑员工 alice@example.com',exact:true}).click()
    const self=page.getByRole('form',{name:'修改员工设置',exact:true});await expect(self.getByRole('checkbox',{name:'管理员权限',exact:true})).toBeDisabled();await expect(self.getByRole('checkbox',{name:'启用账号',exact:true})).toBeDisabled();await self.getByRole('button',{name:'取消',exact:true}).click()
    let lost=true;const requests=[],confirmations=[]
    page.on('request',request=>{if(request.method()!=='POST')return;if(request.url().endsWith('/employees/change'))requests.push(request.postDataJSON());if(request.url().endsWith('/employees/confirm'))confirmations.push(request.postDataJSON())})
    await page.route('**/api/native-auth/employees/change',async route=>{if(lost){lost=false;await route.fetch();await route.abort('failed')}else await route.continue()})
    await edit('bob@example.com',{sharing:false});await send();await expect(page.getByRole('alert')).toBeVisible()
    await page.getByRole('button',{name:/^Agent 配置/}).click();await open()
    await page.getByRole('button',{name:'核对账号原请求',exact:true}).click();await changed();expect(confirmations[0]).toEqual(requests[0])
    await edit('bob@example.com',{enabled:false});await send();await changed()
    await expect(page.getByRole('article').filter({hasText:'bob@example.com'})).toContainText('已停用')
    await edit('bob@example.com',{enabled:true});await send();await changed()
    const create=page.getByRole('form',{name:'创建员工账号',exact:true})
    await create.getByLabel('新员工邮箱',{exact:true}).fill('manager@example.test');await create.getByLabel('员工姓名',{exact:true}).fill('Synthetic manager')
    await create.getByLabel('初始密码',{exact:true}).fill('SyntheticManagerPassword#2026');await create.getByRole('checkbox',{name:'创建为管理员',exact:true}).check()
    await create.getByRole('button',{name:'创建员工账号',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'员工账号已创建。'})).toBeVisible();await expect(create.getByLabel('初始密码',{exact:true})).toHaveValue('')
    await page.screenshot({path:testInfo.outputPath('native-employee-governance-owner.png'),fullPage:true})
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob','SyntheticBobPassword#2026');await open()
    await expect(page.getByRole('form',{name:'创建员工账号',exact:true})).toHaveCount(0)
    const passwordForm=page.getByRole('form',{name:'修改本人密码',exact:true})
    await passwordForm.getByLabel('当前密码',{exact:true}).fill('SyntheticBobPassword#2026');await passwordForm.getByLabel('新密码',{exact:true}).fill('ChangedSyntheticBobPassword#2026')
    await passwordForm.getByRole('button',{name:'修改本人密码并退出',exact:true}).click()
    await expect(page.getByRole('button',{name:'登录独立工作台',exact:true})).toBeVisible()
    await login('bob','ChangedSyntheticBobPassword#2026');await open()
    await expect(page.getByLabel('当前密码',{exact:true})).toHaveValue('');await expect(page.getByLabel('新密码',{exact:true})).toHaveValue('')
  }finally{clearTimeout(timer);await browser?.close();child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,3000)})}
})
