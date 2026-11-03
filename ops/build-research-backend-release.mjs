// Source-only companion to the desktop client. Never copies live PB data,
// configuration, credentials, fonts, local executables or node_modules.
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import JSZip from 'jszip'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const info=JSON.parse(await fs.readFile(path.join(root,'desktop/build-info.json'),'utf8'))
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'))
const names=['@pdf-lib/fontkit','docx','exceljs','jszip','mammoth','pdf-lib','pdfjs-dist']
const dependencies=Object.fromEntries(names.map(name=>{
  if(typeof pkg.dependencies[name]!=='string')throw Error('runtime_dependency_missing:'+name)
  return [name,pkg.dependencies[name]]
}))
const lock=(await fs.readFile(path.join(root,'pnpm-lock.yaml'),'utf8')).replace(/\r\n/g,'\n')
const entries=new Map()
for(const match of lock.matchAll(/^      (.+):\n(        specifier: .+\n        version: .+\n)/gm)){
  const key=match[1].replace(/^['"]|['"]$/g,'')
  entries.set(key,match[0])
}
const start=lock.indexOf('\npackages:\n')
if(start<0)throw Error('unsupported_lockfile_shape')
const runtimeLock="lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n\n  .:\n    dependencies:\n"+
  names.map(name=>{if(!entries.has(name))throw Error('runtime_lock_missing:'+name);return entries.get(name)}).join('')+lock.slice(start)
const zip=new JSZip(),files=[]
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
function add(name,bytes){
  if(name.includes('..')||name.startsWith('/')||name.includes('\\'))throw Error('unsafe_release_path')
  bytes=Buffer.from(bytes);files.push({path:name,bytes:bytes.length,sha256:sha(bytes)})
  zip.file(name,bytes,{date:new Date('2026-11-02T00:00:00Z'),unixPermissions:0o644})
}
async function copy(directory){
  for(const entry of await fs.readdir(path.join(root,directory),{withFileTypes:true})){
    const file=directory+'/'+entry.name
    if(entry.isSymbolicLink())throw Error('runtime_source_link:'+file)
    if(entry.isDirectory())await copy(file)
    else if(entry.isFile()){
      if(!/\.(?:mjs|js)$/.test(file))throw Error('unexpected_runtime_source:'+file)
      add(file,await fs.readFile(path.join(root,file)))
    }
  }
}
await copy('pocketbase/pb_hooks')
await copy('worker')
add('src/lib/scheduleTime.js',await fs.readFile(path.join(root,'src/lib/scheduleTime.js')))
add('package.json',JSON.stringify({name:'agent-studio-research-backend',version:info.version,private:true,type:'module',
  engines:{node:'>=24.14.1'},packageManager:'pnpm@11.23.0',scripts:{start:'node worker/run.mjs'},dependencies},null,2)+'\n')
add('pnpm-lock.yaml',runtimeLock)
add('README.txt',`Agent Studio ${info.version} — 调研平台配套后端源码更新包

此包配套同版本 Windows EXE。EXE 是公司服务器客户端，不内置 PB/Worker。
本包尚未部署到公司服务器；安装 EXE 不会自动更新后端。

运行前提：PocketBase 0.40.5、Node 24.14.1 或兼容的 Node 24、pnpm 11（本次验证版本 11.23.0）。
本包只含代码与公开依赖锁，不含数据库、凭据、字体或本地二进制。

隔离验证：在新的目录放置此包和可信 PB 二进制；以 --hooksDir 指向
pocketbase/pb_hooks，以 --dir 指向新建临时数据目录；不要指向现有公司数据。
执行 pnpm install --prod --frozen-lockfile 安装锁定依赖，再启动 PB 和 Worker。
生产更新需要另行安排：员工验收、备份 PB/SQLite（含一致性处理）、保留旧代码、
停止旧 Worker、同步完整 hooks/worker/scheduleTime.js 和依赖，最后重启并核验。
勿混用旧 Worker 或把代码覆盖进 pb_data；保留原有认证、密钥与数据目录。

Worker 通过环境设置 AGENT_STUDIO_WORKER_URL 和 AGENT_STUDIO_WORKER_TOKEN；
PB 使用相同 Worker token，启用 AGENT_STUDIO_BACKGROUND_WORKER，并按现有
standalone 配置保留身份认证与网络访问控制。不要将 Worker token 发给客户端。
PDF 中文导出需服务器安装可授权使用的中文字体；可使用环境变量
AGENT_STUDIO_REPORT_FONT 指向字体文件。此包不分发 Windows 系统字体。
Node Worker 启动命令：node worker/run.mjs

源码基线：${info.sourceCommit}
源码状态：${info.sourceState}
每个文件的 SHA256 见 release-manifest.json。不要把基线提交当成此未提交合并的提交号。
生产状态仍为 NO-GO，实际部署需另行授权；本包不执行部署或数据迁移。
`)
const manifest={schema:1,version:info.version,baseCommit:info.sourceCommit,sourceState:info.sourceState,
  runtime:'PocketBase 0.40.5 + SQLite + Node Worker',productionDeployed:false,files:files.sort((a,b)=>a.path.localeCompare(b.path))}
zip.file('release-manifest.json',JSON.stringify(manifest,null,2)+'\n',{date:new Date('2026-11-02T00:00:00Z')})
const output=path.join(root,'.tmp/desktop-output',`AgentStudio-Backend-${info.version}-source.zip`)
await fs.mkdir(path.dirname(output),{recursive:true})
const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}})
await fs.writeFile(output,bytes)
console.log(JSON.stringify({output,bytes:bytes.length,sha256:sha(bytes),files:files.length}))
