import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=b=>createHash('sha256').update(b).digest('hex')
export async function buildDesktopUpdateGuard(){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('build_on_windows_x64_required')
 const source=path.join(root,'desktop/update-guard.cs'),directory=path.join(root,'.tmp/desktop-update-guard'),binary=path.join(directory,'update-guard.exe')
 await fs.mkdir(directory,{recursive:true})
 const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe')
 await promisify(execFile)(compiler,['/nologo','/codepage:65001','/target:exe','/platform:x64','/optimize+','/out:'+binary,source],{windowsHide:true,shell:false,timeout:120000,maxBuffer:1024*1024})
 const metadata={format:'agent-studio-update-guard-v1',sourceSha256:sha(await fs.readFile(source)),sha256:sha(await fs.readFile(binary)),platform:'win32-x64'}
 await fs.writeFile(path.join(directory,'update-guard.json'),JSON.stringify(metadata,null,2))
 return metadata
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('DESKTOP_UPDATE_GUARD '+JSON.stringify(await buildDesktopUpdateGuard()))
