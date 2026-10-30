// Opt-in interactive native-shell acceptance. Never changes file associations.
// Leaves only this sentinel document and its Explorer window for visual QA.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {invokeFileApplication} from '../../local-executor/file-application.mjs'
if(process.platform!=='win32')throw Error('windows_required')
const base=path.join(process.cwd(),'.tmp');await fs.mkdir(base,{recursive:true})
const directory=await fs.mkdtemp(path.join(base,'AgentStudio-File-Application-'))
const file=path.join(directory,'AgentStudio 中文 & $ 文件, 打开定位验收.md')
const content='# Agent Studio native file application acceptance\n\nNATIVE-FILE-APPLICATION-ONLY-20261030\n'
await fs.writeFile(file,content)
const opened=await invokeFileApplication(file,false),notepad=await invokeFileApplication(file,false,undefined,{application:'notepad'}),revealed=await invokeFileApplication(file,true)
assert.equal(opened.accepted,true);assert.equal(revealed.accepted,true)
await assert.rejects(invokeFileApplication(path.join(directory,'missing.txt'),false),/file_application_not_found/)
assert.equal(await fs.readFile(file,'utf8'),content)
assert.equal(notepad.handler,'notepad')
const report={status:'PASS',directory,file,opened,notepad,revealed,missingFileDenied:true,fileUnchanged:true,visualConfirmationRequired:true}
await fs.writeFile(path.join(directory,'native-acceptance.json'),JSON.stringify(report,null,2))
console.log('NATIVE_FILE_APPLICATION_ACCEPTANCE '+JSON.stringify(report))
if(process.argv.includes('--keep-open')){
 const textFile=path.join(directory,'AgentStudio-native-open-acceptance.txt');await fs.writeFile(textFile,content)
 console.log('NATIVE_TEXT_ACCEPTANCE '+JSON.stringify(await invokeFileApplication(textFile,false)))
 for(let i=0;i<1200;i++){try{await fs.access(path.join(directory,'finish'));break}catch{}await new Promise(r=>setTimeout(r,1000))}
}
