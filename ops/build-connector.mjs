#!/usr/bin/env node
/** Build an employee portable bundle. Build-time tools stay on the developer PC.
 * No credentials, .env, DB, worktree, Git, npm installer or browser profile shipped. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import JSZip from 'jszip'
import {CONNECTOR_VERSION} from '../local-executor/version.mjs'
export {CONNECTOR_VERSION}
export const NODE_VERSION='24.14.1'
export const APP_FILES=['connect.mjs','setup.mjs','run.mjs','runtime.mjs','file-actions.mjs','file-capabilities.mjs','result.mjs','office.mjs','office-table.mjs','office-worker.mjs','connection.mjs','connection-feedback.mjs','version.mjs','profiles.mjs','native-picker.mjs','setup-progress.mjs','workspace.mjs','browser-settings.mjs','permissions.mjs','workbench-control.mjs','native-confirmation.mjs','permission-entry.mjs','browser-server.mjs','browser-feedback.mjs','desktop.mjs','self-test.mjs','ui/index.html','ui/app.js','ui/workbench-home.js','ui/permission-panel.js','ui/style.css']
const sha=data=>createHash('sha256').update(data).digest('hex')
const packageName=/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export async function locatePackage(name,from){
 if(!packageName.test(name))throw Error('invalid_dependency_name')
 const require=createRequire(path.join(from,'package.json'))
 for(const directory of require.resolve.paths(name)||require.resolve.paths('__studio_package_probe__')||[]){
  try{const target=await fs.realpath(path.join(directory,name));const meta=JSON.parse(await fs.readFile(path.join(target,'package.json'),'utf8'));if(meta.name===name)return {directory:target,meta}}catch{}
 }
 throw Error('installed_dependency_missing:'+name)
}
async function officialRuntime(cache){
 const filename=`node-v${NODE_VERSION}-win-x64.zip`,base=`https://nodejs.org/dist/v${NODE_VERSION}/`
 await fs.mkdir(cache,{recursive:true})
 const checksumResponse=await fetch(base+'SHASUMS256.txt',{redirect:'error',signal:AbortSignal.timeout(30000)})
 if(!checksumResponse.ok)throw Error('official_node_checksums_unavailable')
 const lines=(await checksumResponse.text()).split('\n'),expected=lines.find(line=>line.trim().endsWith(' '+filename))?.trim().split(/\s+/)[0]
 if(!/^[a-f0-9]{64}$/.test(expected||''))throw Error('official_runtime_checksum_missing')
 const target=path.join(cache,filename)
 let bytes;try{bytes=await fs.readFile(target)}catch{}
 if(!bytes||sha(bytes)!==expected){
  const response=await fetch(base+filename,{redirect:'error',signal:AbortSignal.timeout(180000)})
  if(!response.ok||Number(response.headers.get('content-length')||0)>85000000)throw Error('official_runtime_download_failed')
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>85000000)throw Error('runtime_archive_too_large');chunks.push(chunk)}
  bytes=Buffer.concat(chunks);if(sha(bytes)!==expected)throw Error('official_runtime_checksum_mismatch');await fs.writeFile(target,bytes)
 }
 const zip=await JSZip.loadAsync(bytes),prefix=`node-v${NODE_VERSION}-win-x64/`
 const executable=zip.file(prefix+'node.exe'),license=zip.file(prefix+'LICENSE')
 if(!executable||!license)throw Error('official_runtime_files_missing')
 return {executable:await executable.async('nodebuffer'),license:await license.async('nodebuffer'),archiveSha256:expected}
}
export async function buildConnector({destination=path.join(root,'public','downloads')}={}){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('build_on_windows_x64_required')
 const stageBase=path.join(root,'.tmp','connector-build');await fs.mkdir(stageBase,{recursive:true})
 const stage=await fs.mkdtemp(path.join(stageBase,'stage-'))
 const packageRoot=path.join(stage,'AgentStudio-Connector'),app=path.join(packageRoot,'app')
 const packages=new Map(),records=[];let copiedBytes=0
 const seeds=['@modelcontextprotocol/sdk','@playwright/mcp','exceljs','docx']
 const collect=async pkg=>{
  if(packages.has(pkg.directory))return packages.get(pkg.directory)
  if(packages.size>400)throw Error('dependency_graph_limit')
  const node={...pkg,dependencies:[]};packages.set(pkg.directory,node)
  const declarations={...pkg.meta.dependencies,...pkg.meta.optionalDependencies}
  for(const name of Object.keys(declarations).sort()){
   let dep;try{dep=await locatePackage(name,pkg.directory)}catch(e){if(Object.hasOwn(pkg.meta.optionalDependencies||{},name))continue;throw e}
   if(dep.meta.os&&!(dep.meta.os.includes('win32')||dep.meta.os.every(x=>x.startsWith('!'))&&!dep.meta.os.includes('!win32')))continue
   if(dep.meta.cpu&&!dep.meta.cpu.includes('x64')&&!dep.meta.cpu.every(x=>x.startsWith('!')))continue
   node.dependencies.push(await collect(dep))
  }
  return node
 }
 for(const name of seeds)await collect(await locatePackage(name,root))
 const global=new Map();for(const node of packages.values())if(!global.has(node.meta.name))global.set(node.meta.name,node)
 const copyTree=async(src,dest)=>{
  await fs.mkdir(dest,{recursive:true})
  for(const item of await fs.readdir(src,{withFileTypes:true})){
   if(['node_modules','.git','.DS_Store'].includes(item.name)||/^\.env(?:\.|$)/i.test(item.name)||/\.(?:ttf|otf|woff2?|eot)$/i.test(item.name))continue
   if(item.isSymbolicLink())throw Error('linked_package_content_denied')
   const a=path.join(src,item.name),b=path.join(dest,item.name)
   if(item.isDirectory())await copyTree(a,b)
   else if(item.isFile()){const bytes=await fs.readFile(a);copiedBytes+=bytes.length;if(copiedBytes>700000000)throw Error('package_size_limit');await fs.writeFile(b,bytes)}
  }
 }
 const installed=new Set()
 const install=async(node,dest,available)=>{
  if(installed.has(dest))return;installed.add(dest)
  if(installed.size>500)throw Error('dependency_copy_limit')
  await copyTree(node.directory,dest)
  records.push({name:node.meta.name,version:node.meta.version,license:node.meta.license||'SEE PACKAGE LICENSE',path:path.relative(packageRoot,dest).replaceAll('\\','/')})
  const resolution=new Map(available);resolution.set(node.meta.name,node)
  for(const dep of node.dependencies)if(resolution.get(dep.meta.name)?.directory!==dep.directory){
   const next=new Map(resolution);next.set(dep.meta.name,dep)
   await install(dep,path.join(dest,'node_modules',dep.meta.name),next)
  }
 }
 for(const node of global.values())await install(node,path.join(app,'node_modules',node.meta.name),global)
 for(const file of APP_FILES){const target=path.join(app,'local-executor',file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,'local-executor',file),target)}
 await fs.mkdir(path.join(app,'src','lib'),{recursive:true});await fs.copyFile(path.join(root,'src','lib','localConnectionSetup.ts'),path.join(app,'src','lib','localConnectionSetup.ts'))
 await fs.writeFile(path.join(app,'package.json'),JSON.stringify({name:'agent-studio-connector',version:CONNECTOR_VERSION,type:'module',private:true}))
 const node=await officialRuntime(path.join(stageBase,'official-runtime'))
 await fs.mkdir(path.join(packageRoot,'runtime'),{recursive:true});await fs.writeFile(path.join(packageRoot,'runtime','node.exe'),node.executable);await fs.writeFile(path.join(packageRoot,'runtime','NODE-LICENSE.txt'),node.license)
 const launcher='@echo off\r\nsetlocal\r\nchcp 65001 >nul\r\nset "NODE_OPTIONS="\r\nset "NODE_PATH="\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0app\\local-executor\\desktop.mjs" %*\r\nif errorlevel 1 pause\r\n'
 await fs.writeFile(path.join(packageRoot,'Start-Connector.cmd'),launcher)
 await fs.writeFile(path.join(packageRoot,'Manage-Connector.cmd'),'@echo off\r\nsetlocal\r\ncall "%~dp0Start-Connector.cmd" --manage\r\n'); await fs.writeFile(path.join(packageRoot,'README.txt'),'Agent Studio 电脑连接器 '+CONNECTOR_VERSION+'\r\nWindows x64 预览便携版（尚未代码签名）\r\n\r\n1. 将整个压缩包解压到普通本地文件夹，不要在压缩包内直接运行。\r\n2. 双击 Start-Connector.cmd；无需 Node.js、pnpm、Git 或项目源码。\r\n3. 只有一条已保存连接且恢复成功时，在后台恢复连接，不弹出独立管理窗口；首次连接、多条连接或恢复失败时才显示本机设置。\r\n4. 日常文件、浏览器和授权操作均在 Agent Studio 工作台内完成。需要主动打开本机设置时，可双击 Manage-Connector.cmd。首次配对仍需本人导入连接文件并确认。\r\n5. 本机需要已安装 Google Chrome；本包不包含Chrome，不修改系统默认浏览器。\r\n\r\n本包不包含员工账号、密钥、配对文件或数据库，可同版本分发。每位同事必须独立绑定本人账号。\r\n关闭程序会离线，不安装系统服务，不自动启动；完整本机路径及凭据留在当前用户目录。\r\n公司工作台必须为可达的受信任HTTPS地址；localhost只能在服务器本机使用。\r\n这是未签名预览包，不应跳过企业终端管控；正式分发需IT安全审查。\r\n')
 const manifest={format:'agent-studio-connector-bundle-v1',version:CONNECTOR_VERSION,platform:'win32',arch:'x64',nodeVersion:NODE_VERSION,nodeArchiveSha256:node.archiveSha256,codeSigned:false,packages:records,createdAt:new Date().toISOString()}
 await fs.writeFile(path.join(packageRoot,'THIRD-PARTY.json'),JSON.stringify(manifest,null,2))
 const files=[];async function inventory(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('bundle_link_denied');if(item.isDirectory())await inventory(file);else{const bytes=await fs.readFile(file);files.push({path:path.relative(packageRoot,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)})}}}
 await inventory(packageRoot);await fs.writeFile(path.join(packageRoot,'integrity.json'),JSON.stringify({files},null,2))
 const zip=new JSZip();for(const file of files)zip.file('AgentStudio-Connector/'+file.path,await fs.readFile(path.join(packageRoot,file.path)))
 zip.file('AgentStudio-Connector/integrity.json',await fs.readFile(path.join(packageRoot,'integrity.json')))
 const archive=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:5},platform:'DOS'})
 const filename='agent-studio-connector-win-x64.zip',checksum=sha(archive)
 await fs.mkdir(destination,{recursive:true});await fs.writeFile(path.join(destination,filename),archive)
 const release={format:'agent-studio-connector-release-v1',version:CONNECTOR_VERSION,platform:'win32',arch:'x64',file:filename,bytes:archive.length,sha256:checksum,codeSigned:false,requires:['Windows x64','Google Chrome'],createdAt:manifest.createdAt}
 await fs.writeFile(path.join(destination,'connector-release.json'),JSON.stringify(release,null,2))
 await fs.writeFile(path.join(stageBase,'latest-build.json'),JSON.stringify({packageRoot,release,files:files.length}))
 console.log('CONNECTOR_PACKAGE_BUILT '+JSON.stringify({version:CONNECTOR_VERSION,zip:path.relative(root,path.join(destination,filename)),bytes:archive.length,packages:records.length,files:files.length,sha256:checksum,codeSigned:false}))
 return {packageRoot,release,files}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildConnector()
