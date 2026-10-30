const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const {workbenchSender}=require('../policy.cjs')
test('native bridge rejects settings, popup, subframe, foreign-origin and destroyed senders',()=>{
 const origin='http://127.0.0.1:25700',frame={url:origin+'/tool-hub'},contents={mainFrame:frame,isDestroyed:()=>false}
 const event={sender:contents,senderFrame:frame}
 assert.equal(workbenchSender(event,contents,origin),true)
 assert.equal(workbenchSender({...event,sender:{}},contents,origin),false)
 assert.equal(workbenchSender({...event,senderFrame:{url:frame.url}},contents,origin),false)
 frame.url='file:///settings.html';assert.equal(workbenchSender(event,contents,origin),false)
 frame.url='https://foreign.example';assert.equal(workbenchSender(event,contents,origin),false)
 contents.isDestroyed=()=>true;assert.equal(workbenchSender(event,contents,origin),false)
})
test('bundled service accepts an immediate private pairing handoff and still leaves consent pending',async()=>{
 const {fork}=require('node:child_process'),http=require('node:http')
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-desktop-ipc-'))
 const site=http.createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end('{}')})
 await new Promise(r=>site.listen(0,'127.0.0.1',r));const serverOrigin='http://127.0.0.1:'+site.address().port
 const child=fork(path.join(__dirname,'../services.mjs'),[JSON.stringify({profileHome:home,webRoot:path.join(__dirname,'../../dist'),serverOrigin})],{silent:true,windowsHide:true})
 child.stdout.resume();child.stderr.resume()
 let ready
 try{
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('private_pairing_handoff_timeout')),15000)
   child.on('message',m=>{
    if(m.type==='ready'){
     ready=m
     child.send({type:'prepare-pairing',requestId:'isolated-fixture',ticket:{format:'agent-studio-connect-v1',server:serverOrigin+'/__pb',name:'Immediate IPC fixture',mode:'files',origins:[],pairing:{id:'c'.repeat(24),code:'d'.repeat(48),expiresAt:Date.now()+280000}}})
    }
    if(m.type==='pairing-result'){clearTimeout(timeout);try{assert.equal(m.ok,true);assert.equal(m.requestId,'isolated-fixture');resolve()}catch(e){reject(e)}}
   })
   child.once('error',reject)
  })
  const token=new URL(ready.managerUrl).hash.slice(1)
  const snapshot=await(await fetch(ready.managerOrigin+'/api/state',{headers:{'X-Connector-Session':token}})).json()
  assert.equal(snapshot.review.name,'Immediate IPC fixture');assert.deepEqual(await fs.readdir(home),[])
 }finally{
  await new Promise(resolve=>{const timeout=setTimeout(()=>{child.kill();resolve()},8000);child.once('exit',()=>{clearTimeout(timeout);resolve()});child.send({type:'stop'})})
  site.closeAllConnections();await new Promise(r=>site.close(r));await fs.rm(home,{recursive:true,force:true})
 }
})
test('direct pairing prepares existing native consent UI without downloading files or binding a device',async()=>{
 const {prepareDesktopPairing}=await import('../pairing.mjs')
 const {createConnectorManager}=await import('../../local-executor/desktop.mjs')
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-desktop-direct-'))
 let prepared=0
 const progressReporter={start(){},stop(){},close(){},stage(){},finish(){},snapshot(){return null}}
 const manager=await createConnectorManager({home,checkBrowser:async()=>true,prepare:async()=>{prepared++;throw Error('unexpected_binding')},progressReporter})
 const origin='http://127.0.0.1:25701'
 const ticket={format:'agent-studio-connect-v1',server:origin+'/__pb',name:'Native consent fixture',mode:'files',origins:[],pairing:{id:'a'.repeat(24),code:'b'.repeat(48),expiresAt:Date.now()+280000}}
 const state=async()=>(await fetch(manager.origin+'/api/state',{headers:{'X-Connector-Session':manager.token}})).json()
 try{
  assert.deepEqual(await prepareDesktopPairing(ticket,{serverOrigin:origin,manager}),{ok:true})
  const draft=await state();assert.equal(draft.review.name,ticket.name);assert.equal(draft.review.mode,'files');assert.equal(prepared,0)
  assert.deepEqual(await fs.readdir(home),[])
  const denied=await fetch(manager.origin+'/api/connect',{method:'POST',headers:{Origin:manager.origin,'X-Connector-Session':manager.token,'Content-Type':'application/json'},body:JSON.stringify({reviewId:draft.review.reviewId,consent:false})})
  assert.equal(denied.status,400);assert.equal(prepared,0)
  assert.equal((await fetch(manager.origin+'/api/state')).status,403)
  for(const changed of [{server:'http://127.0.0.1:25702/__pb'},{pairing:{...ticket.pairing,expiresAt:Date.now()-1}},{command:'cmd.exe'}])await assert.rejects(()=>prepareDesktopPairing({...ticket,...changed},{serverOrigin:origin,manager}))
  assert.equal((await state()).review.name,ticket.name);assert.equal(prepared,0)
 }finally{await manager.close();await fs.rm(home,{recursive:true,force:true})}
})
