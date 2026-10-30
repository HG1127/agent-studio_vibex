import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const packaged=path.resolve(process.argv[2]||path.join(root,'.tmp/desktop-output/win-unpacked'))
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex')
const list=async directory=>{
  const files=[]
  for(const item of await fs.readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name)
    assert.equal(item.isSymbolicLink(),false,'release must not reference external directories')
    if(item.isDirectory())files.push(...(await list(file)).map(x=>item.name+'/'+x))
    else files.push(item.name)
  }
  return files
}
const resources=path.join(packaged,'resources'),files=await list(resources)
for(const file of files)assert.doesNotMatch(file,/(^|\/)(?:\.env[^/]*|pb_data|\.git|\.agent-studio)(\/|$)|\.(?:db|sqlite|sqlite3|db-wal|db-shm)$|(^|\/)agent-studio-connect[^/]*\.json$|(^|\/)\.local-device-credentials\.json$/i)
const web=await list(path.join(root,'dist'))
for(const file of web)assert.equal(await hash(path.join(root,'dist',file)),await hash(path.join(resources,'web',file)),'frontend source mismatch: '+file)
for(const name of ['gateway.mjs','services.mjs','pairing.mjs'])assert.equal(await hash(path.join(root,'desktop',name)),await hash(path.join(resources,'connector/app/desktop',name)))
await fs.access(path.join(resources,'connector/runtime/node.exe'))
const meta=JSON.parse(await fs.readFile(path.join(root,'desktop/build-info.json'),'utf8'))
const routes=[...(await fs.readFile(path.join(root,'src/App.tsx'),'utf8')).matchAll(/<Route path="(\/[^"*]*)"/g)].map(x=>x[1]).filter(x=>x!=='/pg-pilot')
const report={status:'PASS',...meta,webFiles:web.length,resources:files.length,webRoutes:routes,bundledRuntime:'Node 24.14.1',privateConfigurationIncluded:false}
console.log('DESKTOP_RELEASE_AUDIT '+JSON.stringify(report))
