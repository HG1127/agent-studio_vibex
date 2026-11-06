'use strict'
const fs=require('node:fs'),path=require('node:path')
const protocol='agent-studio-instance-v1'
function normalizedPath(value,platform){
 if(typeof value!=='string'||value.length>32768||/[\x00-\x1f\x7f]/.test(value))return null
 const paths=platform==='win32'?path.win32:path.posix
 if(!paths.isAbsolute(value))return null
 let normalized=paths.normalize(value)
 if(platform==='win32'){
  normalized=normalized.toLowerCase()
  if(normalized.startsWith('\\\\?\\unc\\'))normalized='\\\\'+normalized.slice(8)
  else if(normalized.startsWith('\\\\?\\'))normalized=normalized.slice(4)
 }
 return normalized
}
function validData(value){
 return value&&value.protocol===protocol&&['win32','linux','darwin'].includes(value.platform)&&
  typeof value.version==='string'&&value.version.length<=100&&/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value.version)&&
  normalizedPath(value.executablePath,value.platform)&&normalizedPath(value.applicationPath,value.platform)
}
function instanceData({version,executablePath,applicationPath,platform=process.platform},{realpath=fs.realpathSync.native}={}){
 const canonical=value=>{try{return realpath(value)}catch{return value}}
 const data={protocol,version,platform,executablePath:canonical(executablePath),applicationPath:canonical(applicationPath)}
 if(!validData(data))throw Error('invalid_desktop_instance_identity')
 return data
}
function instanceConflict(running,requested){
 // Older clients supply no metadata. Reveal their requested window without
 // guessing which version is running or probing a caller-supplied path.
 if(!validData(running)||!validData(requested)||running.platform!==requested.platform)return null
 const samePath=normalizedPath(running.executablePath,running.platform)===normalizedPath(requested.executablePath,running.platform)&&
  normalizedPath(running.applicationPath,running.platform)===normalizedPath(requested.applicationPath,running.platform)
 if(samePath&&running.version===requested.version)return null
 const display=value=>value.length>500?value.slice(0,497)+'…':value
 return {
  type:'info',title:'Agent Studio 已在运行',
  message:'已为你打开正在运行的 '+running.version+' 工作台。',
  detail:'本次打开的版本：'+requested.version+'\n正在运行的位置：'+display(running.executablePath)+'\n本次打开的位置：'+display(requested.executablePath)+
   '\n如需切换，请先在现有工作台菜单中选择“退出并停止本机连接”，再打开所需版本。关闭窗口会保留托盘进程。'
 }
}
module.exports={instanceData,instanceConflict}
