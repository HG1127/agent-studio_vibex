const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http')
const {serverOrigin,childEnvironment,readSettings,saveSettings}=require('../policy.cjs')
test('cancelled renderer requests do not stop the desktop proxy',async()=>{
 const {createGateway}=await import('../gateway.mjs')
 const upstream=http.createServer((req,res)=>{if(req.url.endsWith('/slow'))setTimeout(()=>{if(!res.destroyed)res.end('late')},100);else res.end('alive')})
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const gateway=await createGateway({serverOrigin:'http://127.0.0.1:'+upstream.address().port,webRoot:__dirname})
 try{
  const controller=new AbortController(),pending=fetch(gateway.origin+'/__pb/slow',{signal:controller.signal});controller.abort();await assert.rejects(pending)
  await new Promise(r=>setTimeout(r,150));assert.equal(await(await fetch(gateway.origin+'/__pb/health')).text(),'alive')
 }finally{await gateway.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r))}
})
test('copy and fullscreen work only for owned main frames; sensitive permissions stay denied',()=>{
  const {rendererPermission}=require('../policy.cjs'),origins=['http://127.0.0.1:24567']
  assert.equal(rendererPermission('clipboard-sanitized-write',origins[0]+'/agent-run',origins),true)
  assert.equal(rendererPermission('fullscreen',origins[0],origins),true)
  for(const permission of ['clipboard-read','media','fileSystem','display-capture','geolocation'])assert.equal(rendererPermission(permission,origins[0],origins),false)
  assert.equal(rendererPermission('clipboard-sanitized-write','https://foreign.example',origins),false)
  assert.equal(rendererPermission('clipboard-sanitized-write',origins[0],origins,false),false)
})
test('server settings reject token-bearing URLs and insecure remote origins',()=>{
  assert.equal(serverOrigin('https://example.com:8443/'),'https://example.com:8443')
  assert.equal(serverOrigin('http://127.0.0.1:7000'),'http://127.0.0.1:7000')
  for(const value of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?key=private','file:///C:/data'])assert.throws(()=>serverOrigin(value))
  const env=childEnvironment({PATH:'ok',SystemRoot:'system',OPENAI_API_KEY:'secret',NODE_OPTIONS:'unsafe',NODE_PATH:'injection',ELECTRON_RUN_AS_NODE:'1'})
  assert.deepEqual(env,{PATH:'ok',SystemRoot:'system',NODE_USE_SYSTEM_CA:'1'})
})
test('settings persist without resetting the stable desktop origin',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'studio-desktop-settings-'))
  try{await saveSettings(directory,{server:'https://example.com',port:21000});assert.deepEqual(await readSettings(directory),{server:'https://example.com',port:21000})}finally{await fs.rm(directory,{recursive:true})}
})
test('all production SPA routes, authenticated API streaming and origin guards work through desktop gateway',async()=>{
  const {createGateway}=await import('../gateway.mjs')
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'studio-desktop-gateway-'))
  const calls=[]
  const upstream=http.createServer(async(req,res)=>{
    let body='';for await(const b of req)body+=b
    calls.push({path:req.url,auth:req.headers.authorization,origin:req.headers.origin,body})
    if(req.url.includes('redirect')){res.writeHead(302,{Location:'https://foreign.example/'});res.end();return}
    if(req.url.includes('download')){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="report.txt"'});res.end('report result');return}
    res.writeHead(200,{'Content-Type':'application/json'});res.write('{"accepted":');res.end('true}')
  })
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve))
  const origin='http://127.0.0.1:'+upstream.address().port
  await fs.writeFile(path.join(directory,'index.html'),'<!doctype html><html><head></head><body>complete React application</body></html>')
  const gateway=await createGateway({webRoot:directory,serverOrigin:origin})
  try{
    const appSource=await fs.readFile(path.join(__dirname,'../../src/App.tsx'),'utf8')
    const routes=[...appSource.matchAll(/<Route path="(\/[^"*]*)"/g)].map(m=>m[1])
    assert.ok(routes.length>=20)
    for(const route of routes){const r=await fetch(gateway.origin+route);assert.equal(r.status,200,route);assert.match(await r.text(),/complete React application/)}
    const runtime=await fetch(gateway.origin+'/__desktop/runtime.js');assert.match(await runtime.text(),new RegExp(origin.replaceAll('.','\\.')))
    const r=await fetch(gateway.origin+'/__pb/api/tasks?value=1',{method:'POST',headers:{Authorization:'synthetic-employee','Content-Type':'application/json',Origin:gateway.origin},body:'{"task":1}'})
    assert.deepEqual(await r.json(),{accepted:true});assert.deepEqual(calls.at(-1),{path:'/__pb/api/tasks?value=1',auth:'synthetic-employee',origin,body:'{"task":1}'})
    const before=calls.length
    assert.equal((await fetch(gateway.origin+'/__pb/api/tasks',{headers:{Origin:'https://foreign.example',Authorization:'must-not-leak'}})).status,403)
    const hostileHost=await new Promise((resolve,reject)=>{const request=http.get(gateway.origin+'/__pb/api/tasks',{headers:{Host:'attacker.example'}},response=>{response.resume();resolve(response.statusCode)});request.on('error',reject)})
    assert.equal(hostileHost,403)
    assert.equal(calls.length,before)
    const download=await fetch(gateway.origin+'/__pb/download');assert.match(download.headers.get('content-disposition'),/report.txt/);assert.equal(await download.text(),'report result')
    assert.equal((await fetch(gateway.origin+'/__pb/redirect')).status,502)
    assert.equal((await fetch(gateway.origin+'/__pg/api')).status,404)
    assert.equal((await fetch(gateway.origin+'/%2e%2e%2fdesktop.json')).status,404)
  }finally{await gateway.close();await new Promise(resolve=>upstream.close(resolve));await fs.rm(directory,{recursive:true})}
})
