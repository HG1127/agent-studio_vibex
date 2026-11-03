'use strict'
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto')
const {blockedUpdate,barrierName,waitForWorkbench}=require('../startup-health.cjs')
test('incomplete updates block manual startup; only the verified restart transaction may render',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-startup-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 assert.equal(blockedUpdate(root),false)
 const id=randomUUID();await fs.writeFile(path.join(root,barrierName),id)
 assert.equal(blockedUpdate(root),true);assert.equal(blockedUpdate(root,{updated:id,version:'21'}),true)
 const dir=path.join(root,'temp/desktop-updates',id);await fs.mkdir(dir,{recursive:true})
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({phase:'installing',version:'21'}));assert.equal(blockedUpdate(root,{updated:id,version:'21'}),true)
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({phase:'starting',version:'21'}));assert.equal(blockedUpdate(root,{updated:id,version:'21'}),false);assert.equal(blockedUpdate(root,{updated:randomUUID(),version:'21'}),true);assert.equal(blockedUpdate(root,{updated:id,version:'20'}),true)
 await fs.writeFile(path.join(root,barrierName),'../../outside');assert.equal(blockedUpdate(root),true)
})
test('an HTML load alone cannot confirm update health; a rendered workbench is required',async()=>{
 let calls=0;await waitForWorkbench({isDestroyed:()=>false,executeJavaScript:async()=>++calls>=3},{timeout:1000,interval:1});assert.equal(calls,3)
 await assert.rejects(waitForWorkbench({isDestroyed:()=>false,executeJavaScript:async()=>false},{timeout:15,interval:1}),/页面未能加载/)
 await assert.rejects(waitForWorkbench({isDestroyed:()=>true},{timeout:15}),/窗口已关闭/)
})
