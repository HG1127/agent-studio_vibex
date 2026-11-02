// Actual packaged preload/windows; offline disposable profile, no employee data.
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {_electron as electron,expect} from 'playwright/test'
const root=process.cwd(),executable=path.resolve(process.argv[2]||''),home=await fs.mkdtemp(path.join(root,'.tmp/native-settings-'))
const server=http.createServer((_req,res)=>{res.writeHead(401,{'Content-Type':'application/json'});res.end('{}')})
await new Promise(r=>server.listen(0,'127.0.0.1',r));let client
try{
 client=await electron.launch({executablePath:executable,args:['--desktop-test-home='+home,'--desktop-test-server=http://127.0.0.1:'+server.address().port],timeout:60000})
 const main=await client.firstWindow();await expect.poll(()=>main.evaluate(()=>typeof window.studioDesktop?.openSettings).catch(()=>''),{timeout:30000}).toBe('function')
 await main.evaluate(()=>window.studioDesktop.openSettings())
 const settings=client.windows().find(p=>p!==main&&p.url().endsWith('/ui/settings.html'));assert.ok(settings)
 const version=await settings.evaluate(()=>window.desktopSettings.read().then(s=>s.version));assert.equal(version,'0.1.0-preview.13')
 await settings.close();await expect.poll(()=>client.windows().length).toBe(1)
 await main.evaluate(()=>window.studioDesktop.openUpdates())
 const update=client.windows().find(p=>p!==main&&p.url().endsWith('/ui/updates.html'));assert.ok(update)
 const state=await update.evaluate(()=>window.desktopUpdates.request('state'));assert.equal(state.phase,'idle');assert.equal(state.currentVersion,version)
 await main.evaluate(()=>window.studioDesktop.openUpdates());assert.equal(client.windows().length,2,'reuse the existing updater')
 await update.close();await expect.poll(()=>client.windows().length).toBe(1)
 await fs.writeFile(path.join(home,'acceptance.json'),JSON.stringify({status:'PASS',version,realNativeSettings:true,realNativeUpdates:true,bridgeEntries:true,noAutomaticDownload:true,closeEventuallyLeavesMain:true,productionData:false},null,2))
 console.log('NATIVE_SETTINGS_ACCEPTANCE '+home)
}finally{await client?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
