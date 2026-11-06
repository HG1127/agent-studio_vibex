import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {APPLICATION_WINDOW_EXECUTABLE_CODE,APPLICATION_OBSERVER_EXECUTABLE_CODE,APPLICATION_ACTION_EXECUTABLE_CODE} from '../local-executor/application-native.mjs'
import {APPLICATION_VISION_EXECUTABLE_CODE} from '../local-executor/application-vision-native.mjs'
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
const require=createRequire(import.meta.url),builderRequire=createRequire(require.resolve('electron-builder/package.json')),libraryRequire=createRequire(builderRequire.resolve('app-builder-lib'))
const asar=libraryRequire('@electron/asar')
for(const name of ['main.cjs','policy.cjs','build-info.json','update-core.cjs','update-controller.cjs','update-helper.cjs','update-trust.json','startup-health.cjs','ui/update-preload.cjs','ui/updates.html','ui/updates.js','ui/preload.cjs','ui/workbench-preload.cjs'])assert.ok(asar.extractFile(path.join(resources,'app.asar'),name).equals(await fs.readFile(path.join(root,'desktop',name))),'packaged desktop source mismatch: '+name)
assert.equal(await hash(path.join(root,'local-executor/ui/app.js')),await hash(path.join(resources,'connector/app/local-executor/ui/app.js')),'embedded authorization UI is stale')
for(const file of ['applications.mjs','application-target.mjs','application-native.mjs','application-vision.mjs','application-vision-native.mjs','application-permissions.mjs','codex-tasks.mjs','run.mjs','setup.mjs','file-actions.mjs','file-application.mjs','connection.mjs','desktop.mjs','managed-confirmation.mjs','version.mjs'])assert.equal(await hash(path.join(root,'local-executor',file)),await hash(path.join(resources,'connector/app/local-executor',file)),'embedded local engine source mismatch: '+file)
assert.equal(await hash(path.join(root,'src/lib/localConnectionSetup.ts')),await hash(path.join(resources,'connector/app/src/lib/localConnectionSetup.ts')),'embedded connection ticket contract is stale')
for(const file of files)assert.doesNotMatch(file,/(^|\/)(?:\.env[^/]*|pb_data|\.git|\.agent-studio)(\/|$)|\.(?:db|sqlite|sqlite3|db-wal|db-shm)$|(^|\/)agent-studio-connect[^/]*\.json$|(^|\/)\.local-device-credentials\.json$/i)
const web=await list(path.join(root,'dist'))
for(const file of web)assert.equal(await hash(path.join(root,'dist',file)),await hash(path.join(resources,'web',file)),'frontend source mismatch: '+file)
for(const name of ['gateway.mjs','services.mjs','pairing.mjs','computer.mjs'])assert.equal(await hash(path.join(root,'desktop',name)),await hash(path.join(resources,'connector/app/desktop',name)))
await fs.access(path.join(resources,'connector/runtime/node.exe'))
const probeDirectory=path.join(resources,'connector/native'),probe=JSON.parse(await fs.readFile(path.join(probeDirectory,'application-window-probe.json'),'utf8'))
assert.equal(probe.format,'agent-studio-window-probe-v1')
assert.equal(probe.policySha256,createHash('sha256').update(APPLICATION_WINDOW_EXECUTABLE_CODE).digest('hex'),'window policy source is stale')
assert.equal(probe.sha256,await hash(path.join(probeDirectory,'application-window-probe.exe')),'compiled window probe mismatch')
const observer=JSON.parse(await fs.readFile(path.join(probeDirectory,'application-observer.json'),'utf8'))
assert.equal(observer.format,'agent-studio-observer-v1');assert.equal(observer.policySha256,createHash('sha256').update(APPLICATION_OBSERVER_EXECUTABLE_CODE).digest('hex'));assert.equal(observer.sha256,await hash(path.join(probeDirectory,'application-observer.exe')))
const action=JSON.parse(await fs.readFile(path.join(probeDirectory,'application-action.json'),'utf8'))
assert.equal(action.format,'agent-studio-application-action-v1');assert.equal(action.policySha256,createHash('sha256').update(APPLICATION_ACTION_EXECUTABLE_CODE).digest('hex'),'application action policy source is stale');assert.equal(action.sha256,await hash(path.join(probeDirectory,'application-action.exe')),'compiled application action mismatch')
const vision=JSON.parse(await fs.readFile(path.join(probeDirectory,'application-vision.json'),'utf8'))
assert.equal(vision.format,'agent-studio-application-vision-v1');assert.equal(vision.policySha256,createHash('sha256').update(APPLICATION_VISION_EXECUTABLE_CODE).digest('hex'),'application vision policy source is stale');assert.equal(vision.sha256,await hash(path.join(probeDirectory,'application-vision.exe')),'compiled application vision mismatch')
const guard=JSON.parse(await fs.readFile(path.join(resources,'update-guard/update-guard.json'),'utf8'))
assert.equal(guard.format,'agent-studio-update-guard-v1');assert.equal(guard.sourceSha256,await hash(path.join(root,'desktop/update-guard.cs')));assert.equal(guard.sha256,await hash(path.join(resources,'update-guard/update-guard.exe')))
const meta=JSON.parse(await fs.readFile(path.join(root,'desktop/build-info.json'),'utf8'))
const routes=[...(await fs.readFile(path.join(root,'src/App.tsx'),'utf8')).matchAll(/<Route path="(\/[^"*]*)"/g)].map(x=>x[1]).filter(x=>x!=='/pg-pilot')
const report={status:'PASS',...meta,webFiles:web.length,resources:files.length,webRoutes:routes,bundledRuntime:'Node 24.14.1',privateConfigurationIncluded:false}
console.log('DESKTOP_RELEASE_AUDIT '+JSON.stringify(report))
