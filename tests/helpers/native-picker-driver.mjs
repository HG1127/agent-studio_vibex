// Test driver only. Never pairs, writes permissions or opens user profiles.
import fs from 'node:fs'
import {execFile} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {createInterface} from 'node:readline'
const [marker,modulePath,kind]=process.argv.slice(2)
const {pickNative}=await import(pathToFileURL(modulePath).href)
const controller=new AbortController(),input=createInterface({input:process.stdin})
input.on('line',line=>{if(line==='cancel')controller.abort()})
try{
 const selected=await pickNative(kind,{signal:controller.signal,execute:(...args)=>{
  const child=execFile(...args);fs.writeFileSync(marker,JSON.stringify({pid:child.pid}));return child
 }})
 if(selected)throw Error('test_must_not_select_a_user_path')
 console.log(JSON.stringify({cancelled:true,method:'window',pathReturned:false}))
}catch(error){
 if(error.message!=='picker_cancelled')throw error
 console.log(JSON.stringify({cancelled:true,method:'abort',pathReturned:false}))
}finally{input.close()}
