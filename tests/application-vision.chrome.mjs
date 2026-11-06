// Real browser interaction against the production visual panel. Synthetic image
// and callbacks only: this test cannot send input to a user's desktop apps.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {chromium,expect} from '@playwright/test'

test('visual panel separates point selection from actions and invalidates old coordinates',{timeout:60000},async()=>{
 const root=process.cwd(),parent=path.join(root,'.tmp')
 await fs.mkdir(parent,{recursive:true})
 const fixture=await fs.mkdtemp(path.join(parent,'vision-panel-'))
 let server,browser
 try{
  await fs.writeFile(path.join(fixture,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body><div id="root"></div><script type="module" src="./fixture.tsx"></script></body></html>')
  await fs.writeFile(path.join(fixture,'fixture.tsx'),`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{ApplicationVisionPanel}from'/src/components/tool-hub/ApplicationVisionPanel.tsx';
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eff6ff"/><text x="20" y="40">Synthetic authorized app window</text></svg>');
function Fixture(){const[revision,setRevision]=useState(1),[text,setText]=useState(''),[readOnly,setReadOnly]=useState(false),[expired,setExpired]=useState(false),[calls,setCalls]=useState([]);
return <><button onClick={()=>setRevision(n=>n+1)}>新的窗口截图</button><button onClick={()=>setReadOnly(true)}>只读授权</button><button onClick={()=>setExpired(true)}>观察到期</button><output aria-label="操作回执">{JSON.stringify(calls)}</output><ApplicationVisionPanel image={image} observation={{observation:readOnly?null:'token-'+revision,mode:'vision',imageSize:{width:400,height:300},actionable:!readOnly,window:{id:'fixture-only'}}} text={text} onTextChange={setText} disabled={false} expired={expired} canControl={!readOnly} onAction={(point,action)=>setCalls(rows=>[...rows,{point,...action}])}/></>}
createRoot(document.getElementById('root')).render(<Fixture/>);`)
  server=await createServer({root,cacheDir:path.join(fixture,'cache'),configFile:false,plugins:[react()],optimizeDeps:{entries:[path.join(fixture,'index.html')],include:['react','react-dom/client']},server:{host:'127.0.0.1',port:0}})
  await server.listen()
  const address=server.httpServer.address(),origin='http://127.0.0.1:'+address.port
  const executablePath=process.env.AGENT_STUDIO_UI_CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)
  browser=await chromium.launch({headless:true,executablePath,args:['--disable-background-networking','--disable-sync']})
  const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(origin+'/'+path.relative(root,fixture).split(path.sep).join('/')+'/index.html')
  const selection=page.getByRole('button',{name:'在截图中选择操作位置',exact:true}),click=page.getByRole('button',{name:'点击所选位置',exact:true}),draft=page.getByLabel('追加输入内容')
  const receipts=async()=>JSON.parse(await page.getByLabel('操作回执').innerText())
  await expect(click).toBeDisabled()
  await draft.fill('Preserve the public research draft')
  const bounds=await selection.boundingBox()
  await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2)
  await expect(click).toBeEnabled()
  assert.deepEqual(await receipts(),[],'selecting an image point must never operate the computer')
  await click.click()
  const [firstAction]=await receipts()
  assert.equal(firstAction.action,'click')
  assert.ok(Math.abs(firstAction.point.x-200)<=1&&Math.abs(firstAction.point.y-150)<=1,'browser point maps to the center image pixel within device-pixel rounding')
  await page.getByRole('button',{name:'新的窗口截图',exact:true}).click()
  await expect(click).toBeDisabled()
  await expect(draft).toHaveValue('Preserve the public research draft')
  await selection.click({position:{x:20,y:20}})
  await expect(click).toBeEnabled()
  await page.getByRole('button',{name:'观察到期',exact:true}).click()
  await expect(selection).toBeDisabled()
  await expect(click).toBeDisabled()
  await expect(page.getByRole('button',{name:'向当前焦点输入',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'只读授权',exact:true}).click()
  await expect(page.getByText('当前只允许查看窗口截图。',{exact:true})).toBeVisible()
  await expect(click).toHaveCount(0)
  assert.equal((await receipts()).length,1,'expired or read-only observations cannot issue another action')
  assert.deepEqual(errors,[])
  console.log('VISION_PANEL_BROWSER_PASS '+JSON.stringify({selectionHasNoSideEffect:true,newScreenshotInvalidatesPoint:true,draftPreserved:true,expiredBlocked:true,readOnlyBlocked:true}))
 }finally{
  await browser?.close();await server?.close()
  const actual=await fs.realpath(fixture),intended=await fs.realpath(parent)
  if(path.dirname(actual)!==intended||!path.basename(actual).startsWith('vision-panel-'))throw Error('unsafe_fixture_cleanup')
  await fs.rm(actual,{recursive:true,force:true})
 }
})
