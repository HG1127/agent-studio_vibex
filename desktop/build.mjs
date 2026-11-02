import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import {verifyDesktopReleaseBaseline} from '../ops/verify-desktop-release-baseline.mjs'
const desktop=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(desktop)
async function run(file,args,cwd=root){
  const child=spawn(file,args,{cwd,stdio:'inherit',windowsHide:true,env:process.env})
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
  if(code!==0)throw Error('desktop_build_step_failed:'+path.basename(file)+':'+code)
}
console.log('DESKTOP_BASELINE '+JSON.stringify(await verifyDesktopReleaseBaseline(root)))
await fs.access(path.join(desktop,'node_modules/electron/dist/electron.exe'))
await run(process.execPath,[path.join(desktop,'prepare.mjs')])
await run(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-b'])
await run(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build'])
await run(process.execPath,[path.join(root,'ops/verify-pg-pilot-prod.mjs')])
// Keep compression memory predictable on a workstation used for other apps.
process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ||= '1'
await run(process.execPath,[path.join(desktop,'node_modules/electron-builder/cli.js'),'--win','--x64','--dir'],desktop)
await run(process.execPath,[path.join(desktop,'build-launcher.mjs')],desktop)
