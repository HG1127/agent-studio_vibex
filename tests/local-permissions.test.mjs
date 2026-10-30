import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {prepareGuidedConnection} from '../local-executor/setup.mjs'
import {permissionDraft,permissionSites,savePermissions,validatePermissionFile,pickPermissionFile,applyWorkbenchSiteControl,pickWorkbenchGrant,applyWorkbenchGrantControl} from '../local-executor/permissions.mjs'
import {readGuidedProfile} from '../local-executor/profiles.mjs'
import {createRuntime} from '../local-executor/runtime.mjs'
import {createConnectorManager} from '../local-executor/desktop.mjs'
import {acquireConnectionLock} from '../local-executor/workspace.mjs'
const id='a'.repeat(24),token='x'.repeat(64)
async function fixture(single=false){
 const base=path.join(process.cwd(),'.tmp','permission-unit');await fs.mkdir(base,{recursive:true})
 const home=await fs.mkdtemp(path.join(base,'home-')),folder=path.join(home,'reports');await fs.mkdir(folder)
 const file=path.join(folder,'selected.txt');await fs.writeFile(file,'only this file');await fs.writeFile(path.join(folder,'neighbour.txt'),'must stay private')
 const ticket={format:'agent-studio-connect-v1',server:'https://studio.example',name:'可视授权测试',mode:'files',origins:[],pairing:{id,code:'a'.repeat(48),expiresAt:Date.now()+300000}}
 const installed=await prepareGuidedConnection(ticket,{home,chooseWorkspace:async()=>({path:single?file:folder,kind:single?'file':'folder',readOnly:true}),confirm:async()=>true,pair:async()=>({device_id:id,token})})
 return {home,folder,file,ticket,installed,close:()=>fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
}
test('single-file initial authorization exposes only the chosen file, not siblings or writes',async()=>{
 const f=await fixture(true);let runtime
 try{
  const config=JSON.parse(await fs.readFile(f.installed.configFile,'utf8'));runtime=await createRuntime(config)
  const listed=JSON.parse(await runtime.execute({tool:'files.list',arguments:{root:'work',path:'.'}}))
  assert.deepEqual(listed.entries,[{name:'selected.txt',directory:false}])
  assert.equal(await runtime.execute({tool:'files.read',arguments:{root:'work',path:'selected.txt'}}),'only this file')
  await assert.rejects(runtime.execute({tool:'files.read',arguments:{root:'work',path:'neighbour.txt'}}),/file_not_authorized/)
  await assert.rejects(runtime.execute({tool:'files.list',arguments:{root:'work',path:'selected.txt'}}),/file_not_authorized/)
  assert.ok(!runtime.tools.some(t=>t.name==='files.write'||t.name==='office.create_report_bundle'))
 }finally{await runtime?.close();await f.close()}
})
test('website edits are explicit, cancel-safe, locked, preserve identity, and can revoke all sites',async()=>{
 const f=await fixture()
 try{
  const before=await fs.readFile(f.installed.configFile,'utf8'),credentials=await fs.readFile(path.join(path.dirname(f.installed.configFile),'.local-device-credentials.json'),'utf8')
  const d=await permissionDraft(id,{home:f.home});d.origins=permissionSites('https://example.com/path\nhttps://other.example:8443/')
  assert.equal((await savePermissions(d,{home:f.home,confirm:async()=>false,checkBrowser:async()=>true})).cancelled,true)
  assert.equal(await fs.readFile(f.installed.configFile,'utf8'),before)
  const release=await acquireConnectionLock(f.installed.configFile)
  try{await assert.rejects(savePermissions(d,{home:f.home,confirm:async()=>true,checkBrowser:async()=>true}),/connection_running_or_locked/)}finally{await release()}
  await savePermissions(d,{home:f.home,confirm:async()=>true,checkBrowser:async()=>true})
  const changed=JSON.parse(await fs.readFile(f.installed.configFile,'utf8'));assert.deepEqual(changed.browser.allowedOrigins,['https://example.com','https://other.example:8443']);assert.equal(changed.browser.enabled,true)
  assert.equal(changed.server,JSON.parse(before).server);assert.match(changed.permissionRevision,/^[a-f0-9]{24}$/)
  assert.equal(await fs.readFile(path.join(path.dirname(f.installed.configFile),'.local-device-credentials.json'),'utf8'),credentials)
  await assert.rejects(savePermissions(d,{home:f.home,confirm:async()=>true,checkBrowser:async()=>true}),/local_config_changed/)
  const fresh=await permissionDraft(id,{home:f.home});fresh.origins=[];await savePermissions(fresh,{home:f.home,confirm:async()=>true})
  assert.equal(JSON.parse(await fs.readFile(f.installed.configFile,'utf8')).browser.enabled,false)
 }finally{await f.close()}
})
test('workbench site control requires exact revision and local consent; cancellation preserves config and credentials',async()=>{
 const f=await fixture();try{
  const configFile=f.installed.configFile,initial=JSON.parse(await fs.readFile(configFile,'utf8'));initial.permissionRevision='a'.repeat(24);initial.permissionManagementRevision=initial.permissionRevision;initial.browser={...initial.browser,allowedOrigins:['https://old.example'],enabled:true};await fs.writeFile(configFile,JSON.stringify(initial,null,2));const before=await fs.readFile(configFile,'utf8'),config=JSON.parse(before),credentialFile=path.join(path.dirname(configFile),'.local-device-credentials.json'),credentials=await fs.readFile(credentialFile,'utf8')
  const control={action:'sites-save',payload:{permission_revision:config.permissionRevision,origins:['https://example.com','https://research.example:8443']}}
  const cancelled=await applyWorkbenchSiteControl(configFile,control,{confirm:async()=>false});assert.equal(cancelled.cancelled,true);assert.equal(await fs.readFile(configFile,'utf8'),before)
  await assert.rejects(applyWorkbenchSiteControl(configFile,{...control,payload:{...control.payload,permission_revision:'0'.repeat(24)}},{confirm:async()=>true}),/local_config_changed/)
  const saved=await applyWorkbenchSiteControl(configFile,control,{confirm:async()=>true});assert.equal(saved.ok,true);const after=JSON.parse(await fs.readFile(configFile,'utf8'));assert.deepEqual(after.browser.allowedOrigins,control.payload.origins);assert.notEqual(after.permissionRevision,config.permissionRevision);assert.equal(after.server,config.server);assert.equal(await fs.readFile(credentialFile,'utf8'),credentials)
 }finally{await f.close()}
})
test('workbench file picker returns only an opaque grant id; local confirmation applies exact file scope',async()=>{
 const f=await fixture();try{
  const configFile=f.installed.configFile,config=JSON.parse(await fs.readFile(configFile,'utf8'));config.permissionManagementRevision='b'.repeat(24);await fs.writeFile(configFile,JSON.stringify(config,null,2));const credentialFile=path.join(path.dirname(configFile),'.local-device-credentials.json'),credentials=await fs.readFile(credentialFile,'utf8'),before=await fs.readFile(configFile,'utf8'),pending=new Map()
  const picked=await pickWorkbenchGrant({action:'file-pick',payload:{kind:'file',permission_revision:config.permissionManagementRevision}},pending,{configFile,home:f.home,pickFile:async()=>f.file})
  assert.equal(picked.ok,true);const ticket=JSON.parse(picked.result);assert.equal(ticket.label,'selected.txt');assert.equal(ticket.kind,'file');assert.equal('path' in ticket,false);assert.match(ticket.grant_id,/^[a-f0-9]{24}$/);assert.equal(await fs.readFile(configFile,'utf8'),before)
  const control={action:'grant-save',payload:{grant_id:ticket.grant_id,read_only:false,permission_revision:config.permissionManagementRevision}}
  const cancelled=await applyWorkbenchGrantControl(configFile,control,pending,{home:f.home,confirm:async()=>false});assert.equal(cancelled.cancelled,true);assert.equal(await fs.readFile(configFile,'utf8'),before)
  const saved=await applyWorkbenchGrantControl(configFile,control,pending,{home:f.home,confirm:async g=>g.kind==='file'&&g.readOnly===true});assert.equal(saved.ok,true);const after=JSON.parse(await fs.readFile(configFile,'utf8'));assert.equal(after.permissionRevision,after.permissionManagementRevision);assert.ok(after.roots.some(r=>r.allowedFiles?.includes('selected.txt')&&r.readOnly===true));assert.equal(await fs.readFile(credentialFile,'utf8'),credentials)
 }finally{await f.close()}
})
test('an older execution revision cannot authorize management; reject before any local confirmation',async()=>{
 const f=await fixture();let prompts=0
 try{
  const configFile=f.installed.configFile,c=JSON.parse(await fs.readFile(configFile,'utf8'))
  c.permissionRevision='a'.repeat(24);c.permissionManagementRevision='b'.repeat(24)
  await fs.writeFile(configFile,JSON.stringify(c,null,2))
  const before=await fs.readFile(configFile,'utf8')
  const control={action:'sites-save',payload:{permission_revision:c.permissionRevision,origins:['https://example.com']}}
  await assert.rejects(applyWorkbenchSiteControl(configFile,control,{confirm:async()=>{prompts++;return true}}),/local_config_changed/)
  assert.equal(prompts,0);assert.equal(await fs.readFile(configFile,'utf8'),before)
 }finally{await f.close()}
})
test('updated file scopes require their exact permission revision; old requests cannot borrow new grants',async()=>{
 const f=await fixture();let runtime
 try{
  const d=await permissionDraft(id,{home:f.home});d.grants=[{key:'f',kind:'file',path:f.file,label:'selected.txt',readOnly:true}]
  await savePermissions(d,{home:f.home,confirm:async()=>true})
  const config=JSON.parse(await fs.readFile(f.installed.configFile,'utf8'));runtime=await createRuntime(config)
  const root=config.roots[0].name,input={tool:'files.read',arguments:{root,path:'selected.txt'}}
  await assert.rejects(runtime.execute(input),/permission_scope_changed/)
  await assert.rejects(runtime.execute({...input,permission_revision:'0'.repeat(24)}),/permission_scope_changed/)
  assert.equal(await runtime.execute({...input,permission_revision:config.permissionRevision}),'only this file')
  await assert.rejects(runtime.execute({...input,permission_revision:config.permissionRevision,arguments:{root,path:'neighbour.txt'}}),/file_not_authorized/)
  assert.ok(runtime.tools.every(t=>t.inputSchema['x-studio-permission-revision']===config.permissionRevision))
  const p=await readGuidedProfile(id,{home:f.home});assert.equal(p.roots[0].kind,'file');assert.equal(p.roots[0].readOnly,true)
 }finally{await runtime?.close();await f.close()}
})
test('graphical permission routes never accept raw file paths, cross-profile saves or unreviewed changes',async()=>{
 const f=await fixture();let manager,picks=0
 try{
  manager=await createConnectorManager({home:f.home,filePicker:async()=>{picks++;return f.file},picker:async()=>'',checkBrowser:async()=>true})
  const api=async(route,body)=>{const r=await fetch(manager.origin+route,{method:body?'POST':'GET',headers:{'X-Connector-Session':manager.token,Origin:manager.origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
  const profile=(await api('/api/state')).data.profiles[0],before=await fs.readFile(f.installed.configFile,'utf8')
  let d=(await api('/api/permissions/open',{id,fingerprint:profile.fingerprint})).data.permissions
  const selector=()=>({id,fingerprint:d.fingerprint,reviewId:d.reviewId})
  assert.equal((await api('/api/permissions/pick',{...selector(),kind:'file',path:'C:\\Windows'})).status,400);assert.equal(picks,0)
  assert.equal((await api('/api/permissions/sites',{...selector(),text:'https://*.example.com'})).status,400)
  assert.equal((await api('/api/permissions/sites',{...selector(),text:'https://example.com?token=secret'})).status,400)
  d=(await api('/api/permissions/pick',{...selector(),kind:'file'})).data.permissions;assert.equal(picks,1);assert.equal(d.grants[1].kind,'file')
  const selected=d.grants[1];assert.equal((await api('/api/permissions/grant',{...selector(),key:selected.key,readOnly:false})).status,400)
  assert.equal((await api('/api/permissions/save',{...selector(),id:'b'.repeat(24),consent:true})).status,400)
  assert.equal((await api('/api/permissions/save',{...selector(),consent:false})).status,400)
  assert.equal(await fs.readFile(f.installed.configFile,'utf8'),before)
  await api('/api/permissions/discard',selector());assert.equal(await fs.readFile(f.installed.configFile,'utf8'),before)
 }finally{await manager?.close();await f.close()}
})
test('file picker uses a constant script; private and linked files are rejected',async()=>{
 const f=await fixture()
 try{
  let argv
  const picked=await pickPermissionFile({platform:'win32',execute:(cmd,args,opts,cb)=>{assert.equal(cmd,'powershell.exe');argv=args;cb(null,f.file)}})
  assert.equal(picked,f.file);assert.ok(argv.includes('-STA'));assert.ok(!argv.join(' ').includes(f.file))
  const secret=path.join(f.folder,'.env');await fs.writeFile(secret,'secret')
  await assert.rejects(validatePermissionFile(secret,{home:f.home}),/private_file_denied/)
  await assert.rejects(validatePermissionFile('\\\\server\\share\\file.txt',{home:f.home}),/invalid_permission_file/)
  const hard=path.join(f.folder,'linked.txt');await fs.link(f.file,hard)
  await assert.rejects(validatePermissionFile(hard,{home:f.home}),/linked_path_denied/)
 }finally{await f.close()}
})
