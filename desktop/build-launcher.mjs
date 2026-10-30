import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
const desktop=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(desktop)
const info=JSON.parse(await fs.readFile(path.join(desktop,'build-info.json'),'utf8'))
const appDir=path.join(root,'.tmp/desktop-output/win-unpacked')
for(const name of ['temp','web-cache','.studio-files.json']){try{await fs.access(path.join(appDir,name));throw Error('runtime_cache_in_staging_rebuild_clean:'+name)}catch(error){if(error.code!=='ENOENT')throw error}}
const output=path.join(root,'.tmp/desktop-output',`AgentStudio-Setup-${info.version}-win-x64.exe`)
const cacheHome=process.env.ELECTRON_BUILDER_CACHE||path.join(root,'.tmp/electron-builder-cache')
async function findCompiler(directory){
  const entries=await fs.readdir(directory,{withFileTypes:true})
  const compiler=entries.find(e=>e.isFile()&&e.name.toLowerCase()==='makensis.exe')
  if(compiler)return path.join(directory,compiler.name)
  for(const entry of entries){
    const file=path.join(directory,entry.name)
    if(entry.isDirectory()){const found=await findCompiler(file);if(found)return found}
    else if(entry.name.toLowerCase()==='makensis.exe')return file
  }
}
let compiler,compilerEnvironment
try{compiler=await findCompiler(cacheHome)}catch(error){if(error.code!=='ENOENT')throw error}
if(!compiler){
  process.env.ELECTRON_BUILDER_CACHE ||= cacheHome
  const require=createRequire(import.meta.url),builderRequire=createRequire(require.resolve('electron-builder/package.json'))
  const toolset=builderRequire('app-builder-lib/out/toolsets/windows')
  // The pinned builder selects its checksum-verified legacy 3.0.4.1 bundle
  // with null. A numeric version here selects the separate modern bundle API.
  const resolved=await toolset.getMakeNsisPath(null);compiler=resolved.path;compilerEnvironment=resolved.env
}
let size=0
const files=[]
async function inventory(directory){
  for(const e of await fs.readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,e.name);if(e.isSymbolicLink())throw Error('runtime_link_not_allowed')
    if(e.isDirectory())await inventory(file)
    else {const bytes=(await fs.stat(file)).size;size+=bytes;const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);files.push({path:path.relative(appDir,file),bytes,sha256:digest.digest('hex')})}
  }
}
await inventory(appDir)
// The legacy NSIS compiler limits source paths; this owned junction shortens
// input names without moving or deleting the staged runtime.
const shortSource=path.join(root,'.tmp','p3')
try {
  const stat=await fs.lstat(shortSource)
  if(!stat.isSymbolicLink()||await fs.realpath(shortSource)!==await fs.realpath(appDir))throw Error('unexpected_launcher_source_alias')
}catch(error){if(error.code!=='ENOENT')throw error;await fs.symlink(appDir,shortSource,'junction')}
const hash=createHash('sha256')
for(const file of ['resources/app.asar','resources/web/index.html','resources/connector/app/local-executor/ui/app.js'])hash.update(await fs.readFile(path.join(appDir,file)))
const cacheId=info.version+'-'+hash.digest('hex').slice(0,12)
const requiredBytes=Math.ceil(size*1.15+64*1024*1024)
async function snapshot(name,contents){
  const digest=createHash('sha256').update(contents).digest('hex').slice(0,16),file=path.join(root,'.tmp',digest+'-'+name)
  await fs.writeFile(file,contents);return file
}
const manifest=await snapshot('install-files.json',JSON.stringify({version:info.version,files}))
const script=await snapshot('installer.nsi',await fs.readFile(path.join(desktop,'installer.nsi')))
const verifier=await snapshot('verify-install.cjs',await fs.readFile(path.join(desktop,'verify-install.cjs')))
const args=['/V2','/INPUTCHARSET','UTF8',`/DVERSION=${info.version}`,`/DCACHE_ID=${cacheId}`,`/DREQUIRED_BYTES=${requiredBytes}`,`/DREQUIRED_MB=${Math.ceil(requiredBytes/1024/1024)}`,`/DAPP_DIR=${shortSource}`,`/DOUTPUT=${output}`,`/DICON_FILE=${path.join(desktop,'ui/icon.ico')}`,`/DVERIFY_SCRIPT=${verifier}`,`/DVERIFY_MANIFEST=${manifest}`,script]
const child=spawn(compiler,args,{cwd:desktop,env:{...process.env,NSISDIR:path.dirname(compiler),...compilerEnvironment},windowsHide:true,stdio:['ignore','pipe','pipe']})
let outputLog=''
for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{outputLog=(outputLog+chunk).slice(-64000);process.stdout.write(chunk)})
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
if(code!==0)throw Error('adjacent_cache_launcher_build_failed:'+code)
if(/warning \d+:/i.test(outputLog))throw Error('launcher_compiler_warning_requires_review')
console.log('DESKTOP_INSTALLER_BUILT '+JSON.stringify({output,unpackedBytes:size,requiredBytes,files:files.length,installationDirectory:'user-selected',defaultSystemDrive:false}))
