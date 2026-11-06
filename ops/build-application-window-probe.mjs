import fs from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
import {APPLICATION_WINDOW_EXECUTABLE_CODE,APPLICATION_OBSERVER_EXECUTABLE_CODE,APPLICATION_ACTION_EXECUTABLE_CODE} from '../local-executor/application-native.mjs'
import {APPLICATION_VISION_EXECUTABLE_CODE} from '../local-executor/application-vision-native.mjs'
const run=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex')
export async function buildApplicationWindowProbe(packageRoot){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('build_on_windows_x64_required')
 const directory=path.join(packageRoot,'native');await fs.mkdir(directory,{recursive:true})
 const source=path.join(directory,'application-window-probe.cs'),binary=path.join(directory,'application-window-probe.exe')
 await fs.writeFile(source,APPLICATION_WINDOW_EXECUTABLE_CODE)
 const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe')
 await run(compiler,['/nologo','/codepage:65001','/target:exe','/platform:x64','/optimize+','/reference:System.Web.Extensions.dll','/out:'+binary,source],{windowsHide:true,shell:false,timeout:120000,maxBuffer:1024*1024})
 const metadata={format:'agent-studio-window-probe-v1',policySha256:sha(APPLICATION_WINDOW_EXECUTABLE_CODE),sha256:sha(await fs.readFile(binary)),platform:'win32-x64'}
 await fs.writeFile(path.join(directory,'application-window-probe.json'),JSON.stringify(metadata,null,2))
 const observerSource=path.join(directory,'application-observer.cs'),observerBinary=path.join(directory,'application-observer.exe')
 await fs.writeFile(observerSource,APPLICATION_OBSERVER_EXECUTABLE_CODE)
 const framework=path.dirname(compiler),references=['UIAutomationClient.dll','UIAutomationTypes.dll','WindowsBase.dll'].map(name=>'/reference:'+path.join(framework,'WPF',name))
 await run(compiler,['/nologo','/codepage:65001','/target:exe','/platform:x64','/optimize+','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',...references,'/out:'+observerBinary,observerSource],{windowsHide:true,shell:false,timeout:120000,maxBuffer:1024*1024})
 await fs.writeFile(path.join(directory,'application-observer.json'),JSON.stringify({format:'agent-studio-observer-v1',policySha256:sha(APPLICATION_OBSERVER_EXECUTABLE_CODE),sha256:sha(await fs.readFile(observerBinary)),platform:'win32-x64'},null,2))
 const actionSource=path.join(directory,'application-action.cs'),actionBinary=path.join(directory,'application-action.exe')
 await fs.writeFile(actionSource,APPLICATION_ACTION_EXECUTABLE_CODE)
 await run(compiler,['/nologo','/codepage:65001','/target:exe','/platform:x64','/optimize+','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',...references,'/out:'+actionBinary,actionSource],{windowsHide:true,shell:false,timeout:120000,maxBuffer:1024*1024})
 const actionMetadata={format:'agent-studio-application-action-v1',policySha256:sha(APPLICATION_ACTION_EXECUTABLE_CODE),sha256:sha(await fs.readFile(actionBinary)),platform:'win32-x64'}
 await fs.writeFile(path.join(directory,'application-action.json'),JSON.stringify(actionMetadata,null,2))
 const visionSource=path.join(directory,'application-vision.cs'),visionBinary=path.join(directory,'application-vision.exe')
 await fs.writeFile(visionSource,APPLICATION_VISION_EXECUTABLE_CODE)
 await run(compiler,['/nologo','/codepage:65001','/target:exe','/platform:x64','/optimize+','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',...references,'/out:'+visionBinary,visionSource],{windowsHide:true,shell:false,timeout:120000,maxBuffer:1024*1024})
 await fs.writeFile(path.join(directory,'application-vision.json'),JSON.stringify({format:'agent-studio-application-vision-v1',policySha256:sha(APPLICATION_VISION_EXECUTABLE_CODE),sha256:sha(await fs.readFile(visionBinary)),platform:'win32-x64'},null,2))
 return metadata
}
