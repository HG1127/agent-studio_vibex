'use strict'
const fs=require('node:fs'),path=require('node:path')
const barrierName='.studio-update-in-progress'
function blockedUpdate(root,{updated,failed,version}={}){
 const file=path.join(root,barrierName)
 let stat
 try{stat=fs.lstatSync(file)}catch(error){return error.code!=='ENOENT'}
 try{
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128)return true
  const id=fs.readFileSync(file,'utf8').trim();if(!/^[a-f0-9-]{36}$/.test(id))return true
  if(updated!==id&&failed!==id)return true
  const result=JSON.parse(fs.readFileSync(path.join(root,'temp/desktop-updates',id,'result.json'),'utf8'))
  return result.version!==version || (updated===id?result.phase!=='starting':result.phase!=='rolled_back')
 }catch{return true}
}
async function waitForWorkbench(contents,{timeout=30000,interval=100}={}){
 const end=Date.now()+timeout
 while(Date.now()<end){
  if(contents.isDestroyed())throw Error('工作台窗口已关闭')
  try{
   let timer
   const ready=await Promise.race([contents.executeJavaScript("(()=>{const root=document.getElementById('root');return !!root&&root.childElementCount>0&&root.textContent.trim().length>0&&window.studioDesktop?.version===2})()"),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1000)})]).finally(()=>clearTimeout(timer))
   if(ready)return
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,interval))
 }
 throw Error('工作台页面未能加载。请检查安装文件和网络，或通过版本更新修复。账号与授权会保留。')
}
module.exports={barrierName,blockedUpdate,waitForWorkbench}
