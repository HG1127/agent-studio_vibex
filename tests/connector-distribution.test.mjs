import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {EventEmitter} from 'node:events'
import {createConnectorManager} from '../local-executor/desktop.mjs'
import {prepareGuidedConnection} from '../local-executor/setup.mjs'
import {parseConnectorRelease} from '../src/lib/connectorRelease.ts'
import {guideResourceAccess,resourceIntent} from '../src/lib/resourceAccessGuide.ts'
const ticket=()=>({format:'agent-studio-connect-v1',server:'https://studio.example',name:'本机隔离测试',mode:'files',origins:[],pairing:{id:'m'.repeat(24),code:'n'.repeat(48),expiresAt:Date.now()+300000}})
async function fixture(options={}){
 const base=path.join(process.cwd(),'.tmp','manager-unit');await fs.mkdir(base,{recursive:true});const home=await fs.mkdtemp(path.join(base,'home-'));const folder=path.join(home,'selected');await fs.mkdir(folder)
 const effects={pairs:0,starts:0,picks:0};const children=[]
 const manager=await createConnectorManager({home,picker:async()=>{effects.picks++;return folder},checkBrowser:async()=>'/fixture/chrome',prepare:(t,o)=>prepareGuidedConnection(t,{...o,pair:async()=>{effects.pairs++;return {device_id:t.pairing.id,token:'p'.repeat(64)}}}),startChild:async()=>{effects.starts++;const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.connected=true;child.send=()=>setImmediate(()=>child.emit('exit',0));children.push(child);return child},...options})
 const api=async(route,body,extra={})=>{const r=await fetch(manager.origin+route,{method:body===undefined?'GET':'POST',headers:{'X-Connector-Session':manager.token,...(body===undefined?{}:{Origin:manager.origin,'Content-Type':'application/json'}),...extra},body:body===undefined?undefined:JSON.stringify(body),redirect:'error'});return {status:r.status,data:await r.json()}}
 return {home,folder,effects,manager,api,close:async()=>{await manager.close();await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100})}}
}
test('portable local UI rejects unknown sessions, foreign origins, remote paths and raw commands',async()=>{
 const f=await fixture();try{
  assert.equal((await fetch(f.manager.origin+'/api/state')).status,403)
  assert.equal((await f.api('/api/state',undefined,{'X-Connector-Session':'g'.repeat(64)})).status,403)
  assert.equal((await f.api('/api/folder',{}, {Origin:'https://foreign.example'})).status,403)
  assert.equal((await f.api('/api/folder',{path:'C:\\Windows'})).status,400)
  assert.equal((await f.api('/api/execute',{command:'anything'})).status,400)
  assert.equal((await f.api('/api/state',undefined,{'X-Connector-Session':'x'.repeat(64)})).status,403)
  assert.deepEqual(f.effects,{pairs:0,starts:0,picks:0})
  const page=await fetch(f.manager.origin+'/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/)
  assert.equal((await page.text()).includes(f.manager.token),false)
 }finally{await f.close()}
})
test('local UI requires reviewed scope, keeps default read-only and never shares credentials with UI',async()=>{
 const f=await fixture();try{
  const read=await f.api('/api/prepare',{ticket:ticket()});assert.equal(read.status,200);assert.equal(read.data.review.readOnly,true)
  assert.equal(f.effects.pairs,0);assert.equal(f.effects.starts,0)
  const old=read.data.review.reviewId
  await f.api('/api/folder',{})
  assert.equal((await f.api('/api/connect',{reviewId:old,consent:true})).status,400)
  const current=(await f.api('/api/state')).data
  assert.equal((await f.api('/api/connect',{reviewId:current.review.reviewId,consent:false})).status,400)
  const connected=await f.api('/api/connect',{reviewId:current.review.reviewId,consent:true})
  assert.equal(connected.status,200);assert.deepEqual(f.effects,{pairs:1,starts:1,picks:1})
  assert.equal(connected.data.profiles[0].roots[0].readOnly,true)
  assert.equal(JSON.stringify(connected.data).includes('p'.repeat(64)),false)
  assert.equal(JSON.stringify(connected.data).includes('n'.repeat(48)),false)
  assert.equal((await f.api('/api/connect',{reviewId:current.review.reviewId,consent:true})).status,400)
  assert.equal(f.effects.pairs,1)
 }finally{await f.close()}
})
test('invalid replacement and expired tickets cannot leave a previous connection approval active',async()=>{
 let now=Date.now();const f=await fixture({clock:()=>now})
 try{
  const first=await f.api('/api/prepare',{ticket:ticket()});const old=first.data.review.reviewId
  const invalid=await f.api('/api/prepare',{ticket:{format:'wrong'}})
  assert.equal(invalid.status,400);assert.equal(invalid.data.state.review,null)
  assert.equal((await f.api('/api/connect',{reviewId:old,consent:true})).status,400)
  const current=await f.api('/api/prepare',{ticket:ticket()})
  now+=310000
  assert.equal((await f.api('/api/state')).data.review.expired,true)
  assert.equal((await f.api('/api/connect',{reviewId:current.data.review.reviewId,consent:true})).status,400)
  assert.equal((await f.api('/api/discard',{reviewId:current.data.review.reviewId})).data.review,null)
  assert.deepEqual(f.effects,{pairs:0,starts:0,picks:0})
 }finally{await f.close()}
})

test('editing an existing directory is isolated from a new connection and cannot transfer to another profile',async()=>{
 const picks=[];const f=await fixture({picker:async()=>picks.shift()})
 try{
  const saved=[]
  for(const id of ['a'.repeat(24),'b'.repeat(24)]){
   const t=ticket();t.pairing.id=id
   saved.push(await prepareGuidedConnection(t,{home:f.home,confirm:async()=>true,pair:async()=>({device_id:id,token:'p'.repeat(64)})}))
  }
  const profiles=(await f.api('/api/state')).data.profiles
  const [a,b]=profiles,secondBefore=await fs.readFile(saved[1].configFile,'utf8')
  const editFolder=path.join(f.home,'edit-only');await fs.mkdir(editFolder)
  await f.api('/api/prepare',{ticket:ticket()});picks.push(f.folder)
  await f.api('/api/folder',{scope:'connect'});await f.api('/api/access',{scope:'connect',readOnly:false})
  const newDraft=(await f.api('/api/state')).data.review
  const selected=(await f.api('/api/edit-select',{id:a.id,fingerprint:a.fingerprint})).data.editing
  picks.push(editFolder)
  const picked=await f.api('/api/folder',{scope:'edit',...selected})
  // Only admitted edit selectors go on the wire, not arbitrary paths or fields.
  assert.equal(picked.status,400)
  const change=await f.api('/api/folder',{scope:'edit',id:a.id,fingerprint:a.fingerprint,reviewId:selected.reviewId})
  assert.equal(change.status,200)
  assert.equal(change.data.editing.folder,await fs.realpath(editFolder))
  assert.equal(change.data.review.reviewId,newDraft.reviewId)
  assert.equal(change.data.review.readOnly,false)
  assert.equal(change.data.review.folder,await fs.realpath(f.folder))
  const edit=change.data.editing
  assert.equal((await f.api('/api/folder-save',{id:b.id,fingerprint:b.fingerprint,reviewId:edit.reviewId,consent:true})).status,400)
  assert.equal(await fs.readFile(saved[1].configFile,'utf8'),secondBefore)
  const savedEdit=await f.api('/api/folder-save',{id:a.id,fingerprint:a.fingerprint,reviewId:edit.reviewId,consent:true})
  assert.equal(savedEdit.status,200);assert.equal(savedEdit.data.editing,null)
  assert.equal(savedEdit.data.review.reviewId,newDraft.reviewId)
  assert.equal(JSON.parse(await fs.readFile(saved[0].configFile,'utf8')).roots[0].readOnly,true)
  assert.equal((await f.api('/api/edit-select',{id:b.id,fingerprint:b.fingerprint})).data.editing.folder,null)
  assert.equal(f.effects.pairs,0);assert.equal(f.effects.starts,0)
 }finally{await f.close()}
})

test('a second manager tab changing permission invalidates the first confirmation, and edit-only changes do not',async()=>{
 const f=await fixture()
 try{
  const t=ticket();t.pairing.id='a'.repeat(24)
  await prepareGuidedConnection(t,{home:f.home,confirm:async()=>true,pair:async()=>({device_id:t.pairing.id,token:'p'.repeat(64)})})
  const p=(await f.api('/api/state')).data.profiles[0]
  const original=(await f.api('/api/prepare',{ticket:ticket()})).data.review
  const changed=(await f.api('/api/access',{readOnly:false})).data.review
  assert.notEqual(changed.reviewId,original.reviewId)
  assert.equal((await f.api('/api/connect',{reviewId:original.reviewId,consent:true})).status,400)
  await f.api('/api/edit-select',{id:p.id,fingerprint:p.fingerprint})
  assert.equal((await f.api('/api/state')).data.review.reviewId,changed.reviewId)
  assert.equal(f.effects.pairs,0)
 }finally{await f.close()}
})

test('release metadata accepts only known same-origin archive with bounded size and checksum',()=>{
 const release={format:'agent-studio-connector-release-v1',platform:'win32',arch:'x64',file:'agent-studio-connector-win-x64.zip',version:'0.1.0-preview.1',bytes:123456,sha256:'a'.repeat(64),codeSigned:false}
 assert.equal(parseConnectorRelease(release).url,'/downloads/agent-studio-connector-win-x64.zip')
 for(const patch of [{file:'https://evil.example/run.exe'},{file:'../../secret.zip'},{bytes:-1},{sha256:'secret'},{platform:'linux'},{version:'<script>'}])assert.equal(parseConnectorRelease({...release,...patch}),null)
})
test('task-first resource routing never demands local installation for files, skills or online services',()=>{
 for(const intent of ['documents','method','model','services','web'])assert.equal(guideResourceAccess(intent,[],0,true).needsLocal,false)
 assert.equal(guideResourceAccess('local',[],1,true).needsLocal,false)
 assert.equal(guideResourceAccess('local',[],0,true).needsLocal,true)
 const candidates=[{id:'abcdefghijklmno',title:'网页读取',kind:'browser',source:'http',state:'tested'}]
 assert.equal(guideResourceAccess('web',candidates,0,true).reuseCount,1)
 assert.match(guideResourceAccess('web',candidates,0,true).routes[0].to,/connection=abcdefghijklmno/)
 assert.equal(guideResourceAccess('web',[{...candidates[0],state:'disabled'}],0,true).reuseCount,0)
 assert.equal(guideResourceAccess('web',candidates,0,false).reuseCount,0)
 assert.equal(resourceIntent('shell-command'),null)
})
