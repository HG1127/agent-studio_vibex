import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {validateWorkspaceChoice,changeGuidedWorkspace,acquireConnectionLock,pickLocalFolder,pickConnectionFile} from '../local-executor/workspace.mjs'
import {prepareGuidedConnection} from '../local-executor/setup.mjs'
import {createRuntime} from '../local-executor/runtime.mjs'
import {listGuidedProfiles,readGuidedProfile,chooseGuidedProfile} from '../local-executor/profiles.mjs'
import {localDirectorySnapshot,visibleLocalFiles} from '../src/lib/localFileBrowser.ts'
import {localActionName,localRelativePath,localChildPath,localWebAddress,localFileListing,localDefaultArguments,localRootOptions,localToolCatalogKey} from '../src/lib/localDeviceActions.ts'
// AppData is deliberately not a user-selectable work root. Test in ignored scratch.
const temp=async()=>{const base=path.join(process.cwd(),'.tmp','device-scope-tests');await fs.mkdir(base,{recursive:true});return fs.mkdtemp(path.join(base,'case-'))}
const ticket=()=>({format:'agent-studio-connect-v1',server:'http://127.0.0.1:8186/__pb',name:'目录验收',mode:'files',origins:[],pairing:{id:'x'.repeat(24),code:'c'.repeat(48),expiresAt:Date.now()+300000}})
const pair=async()=>({device_id:'x'.repeat(24),token:'t'.repeat(64)})
test('plain actions are Chinese and reject folder-as-file, traversal, absolute paths and secret URLs',()=>{
 assert.equal(localActionName('files.read'),'查看文本文件')
 assert.equal(localDefaultArguments('files.read'),JSON.stringify({root:'work',path:''},null,2))
 for(const p of ['.','../secret','C:\\Windows','/etc/passwd','dir/../secret','file.txt:stream'])assert.throws(()=>localRelativePath(p,true))
 assert.equal(localRelativePath('报告/笔记.txt',true),'报告/笔记.txt')
 assert.equal(localChildPath('.','笔记.txt'),'笔记.txt')
 assert.throws(()=>localChildPath('.','../secret'))
 assert.equal(localWebAddress('example.com/page'),'https://example.com/page')
 for(const u of ['file:///C:/','https://u:pass@site.test','https://site.test?a=token'])assert.throws(()=>localWebAddress(u))
 const text=JSON.stringify({root:'work',path:'.',entries:[{name:'notes.txt',directory:false},{name:'../secret',directory:false}]})
 assert.equal(localFileListing(text,'work','.').entries.length,1)
 assert.equal(localFileListing(text,'other','.'),null)
 assert.deepEqual(localRootOptions({inputSchema:{properties:{root:{enum:'not-an-array'}}}}),[])
 assert.deepEqual(localRootOptions({inputSchema:{properties:{root:{enum:['work'],oneOf:'invalid'}}}}),[{id:'work',label:'工作文件夹（本机授权）'}])
})
test('native folder adapter uses static argv; selection is returned only as data',async()=>{
 const controller=new AbortController()
 const chosen=await pickLocalFolder({platform:'win32',signal:controller.signal,execute:(binary,args,options,callback)=>{
  assert.equal(binary,'powershell.exe');assert.ok(args.includes('-STA'));assert.equal(options.windowsHide,true);assert.equal(options.signal,controller.signal);assert.ok(args.at(-1).includes('FolderBrowserDialog'))
  assert.ok(!args.join(' ').includes('D:\\User'))
  callback(null,'D:\\User files\\研究资料')
 }})
 assert.equal(chosen,'D:\\User files\\研究资料')
 await assert.rejects(()=>pickLocalFolder({platform:'linux'}),/unavailable/)
})
test('double-click entry uses a native JSON picker, no downloaded script, auto-install or approval bypass',async()=>{
 const file=await pickConnectionFile({platform:'win32',execute:(binary,args,options,callback)=>{
  assert.equal(binary,'powershell.exe');assert.ok(args.at(-1).includes('OpenFileDialog'));assert.ok(args.at(-1).includes('*.json'))
  assert.ok(!args.includes('-ExecutionPolicy'));callback(null,'D:\\Downloads\\new-connect.json')
 }})
 assert.equal(file,'D:\\Downloads\\new-connect.json')
  const cmd=await fs.readFile(new URL('../local-executor/start-connect.cmd',import.meta.url),'utf8')
  assert.ok(cmd.includes('node "%~dp0desktop.mjs" %*'));assert.ok(!cmd.includes('public\\downloads\\AgentStudio-Connector\\Start-Connector.cmd'));assert.ok(!/Invoke-WebRequest|curl|ExecutionPolicy|--yes|RunAs|schtasks|reg add/i.test(cmd))
  const cli=await fs.readFile(new URL('../local-executor/connect.mjs',import.meta.url),'utf8')
  assert.ok(cli.includes('确认这是你自己的账号和授权范围'))
})
test('only concrete existing local folders are accepted; broad, private and linked folders are denied',async()=>{
 const home=await temp()
 try{
  const good=path.join(home,'研究资料');await fs.mkdir(good)
  assert.equal(await validateWorkspaceChoice(good,{home}),await fs.realpath(good))
  for(const p of [home,path.parse(home).root,path.join(home,'.agent-studio'),path.join(home,'.ssh')])await assert.rejects(()=>validateWorkspaceChoice(p,{home}))
  const link=path.join(home,'linked');await fs.symlink(good,link,process.platform==='win32'?'junction':'dir')
  await assert.rejects(()=>validateWorkspaceChoice(link,{home}),/link/)
 }finally{await fs.rm(home,{recursive:true,force:true})}
})
test('locally selected read-only folder exposes reads but no writes or report creation; cancellation consumes no pairing',async()=>{
 const home=await temp();let pairs=0,scope
 try{
  const work=path.join(home,'资料');await fs.mkdir(work);await fs.writeFile(path.join(work,'hello.txt'),'只读测试')
  const t=ticket()
  await assert.rejects(()=>prepareGuidedConnection(t,{home,chooseWorkspace:async()=>({path:work,readOnly:true}),confirm:async()=>false,pair:async()=>{pairs++;return pair()}}),/not_confirmed/)
  assert.equal(pairs,0)
  const installed=await prepareGuidedConnection(t,{home,chooseWorkspace:async()=>({path:work,readOnly:true}),confirm:async s=>{scope=s;return true},pair:async()=>{pairs++;return pair()}})
  assert.equal(scope.readOnly,true);assert.equal(pairs,1)
  const config=JSON.parse(await fs.readFile(installed.configFile,'utf8'))
  const rt=await createRuntime(config)
  try{
   assert.ok(rt.tools.some(t=>t.name==='files.read'));assert.ok(!rt.tools.some(t=>t.name==='files.write'||t.name==='office.create_report'))
   assert.equal(await rt.execute({tool:'files.read',arguments:{root:'work',path:'hello.txt'}}),'只读测试')
   await assert.rejects(()=>rt.execute({tool:'files.write',arguments:{root:'work',path:'no.txt',text:'no'}}),/tool_denied/)
   assert.ok(localRootOptions(rt.tools.find(t=>t.name==='files.list'))[0].label.includes('只读'))
  }finally{await rt.close()}
  assert.deepEqual(await fs.readdir(work),['hello.txt'])
 }finally{await fs.rm(home,{recursive:true,force:true})}
})
test('folder change reuses credentials, changes root alias, rejects active executor and preserves files',async()=>{
 const home=await temp()
 try{
  const installed=await prepareGuidedConnection(ticket(),{home,confirm:async()=>true,pair})
  const credentials=path.join(path.dirname(installed.configFile),'.local-device-credentials.json')
  const before=await fs.readFile(credentials,'utf8'),work=path.join(home,'新资料');await fs.mkdir(work)
  await fs.writeFile(path.join(work,'new.txt'),'new')
  const lock=await acquireConnectionLock(installed.configFile)
  await assert.rejects(()=>acquireConnectionLock(installed.configFile),/running_or_locked/)
  await assert.rejects(()=>changeGuidedWorkspace(ticket().pairing.id,{home,choose:async()=>({path:work}),confirm:async()=>true}),/running_or_locked/)
  await lock()
  const changed=await changeGuidedWorkspace(ticket().pairing.id,{home,choose:async()=>({path:work}),confirm:async()=>true})
  assert.equal(changed.cancelled,false);assert.notEqual(changed.root,'work');assert.equal(changed.readOnly,true)
  assert.equal(await fs.readFile(credentials,'utf8'),before)
  const saved=JSON.parse(await fs.readFile(installed.configFile,'utf8')),rt=await createRuntime(saved)
  try{
   await assert.rejects(()=>rt.execute({tool:'files.read',arguments:{root:changed.root,path:'new.txt'}}),/permission_scope_changed/)
   await assert.rejects(()=>rt.execute({tool:'files.read',permission_revision:saved.permissionRevision,arguments:{root:'work',path:'new.txt'}}),/invalid_file_arguments|denied/)
   assert.deepEqual(saved.roots[0].capabilities,{edit:false,move:false,delete:false,open:false})
   assert.equal(await rt.execute({tool:'files.read',permission_revision:saved.permissionRevision,arguments:{root:changed.root,path:'new.txt'}}),'new')
  }finally{await rt.close()}
 }finally{await fs.rm(home,{recursive:true,force:true})}
})
test('catalog identity ignores JSON key/tool order but not real permission changes',()=>{
 const a={name:'files.read',description:'original',inputSchema:{type:'object',properties:{root:{type:'string',enum:['work']},path:{type:'string'}}}}
 const b={name:'files.list',description:'listing',inputSchema:{type:'object',properties:{root:{enum:['work'],type:'string'}}}}
 const reordered={name:'files.read',description:'text changed',inputSchema:{properties:{path:{type:'string'},root:{enum:['work'],type:'string'}},type:'object'}}
 const key=localToolCatalogKey([a,b])
 assert.equal(localToolCatalogKey([b,reordered]),key)
 assert.notEqual(localToolCatalogKey([b]),key,'removed permission must invalidate selections')
 assert.notEqual(localToolCatalogKey([{...a,inputSchema:{...a.inputSchema,properties:{root:{enum:['new_folder']}}}},b]),key)
 assert.notEqual(localToolCatalogKey([a,b,{name:'files.write',description:'write',inputSchema:{type:'object'}}]),key)
 const browser={name:'browser.browser_navigate',description:'browser',inputSchema:{type:'object','x-studio-allowed-origins':['https://first.example']}}
 assert.notEqual(localToolCatalogKey([browser]),localToolCatalogKey([{...browser,inputSchema:{...browser.inputSchema,'x-studio-allowed-origins':['https://second.example']}}]))
})

test('cached file list filtering and back navigation are scoped snapshots, never fresh filesystem reads',()=>{
 const original=JSON.stringify({root:'work',path:'.',entries:[{name:'b.txt',directory:false},{name:'资料',directory:true},{name:'a.txt',directory:false}],truncated:true})
 const snapshot=localDirectorySnapshot(original,'work','.',1234)
 assert.equal(snapshot.readAt,1234);assert.equal(snapshot.truncated,true)
 assert.deepEqual(snapshot.entries.map(row=>row.name),['资料','a.txt','b.txt'])
 const before=JSON.stringify(snapshot)
 assert.deepEqual(visibleLocalFiles(snapshot,'work','.','A.TXT').map(row=>row.name),['a.txt'])
 assert.deepEqual(visibleLocalFiles(snapshot,'other','.',''),[])
 assert.deepEqual(visibleLocalFiles(snapshot,'work','资料',''),[])
 assert.deepEqual(visibleLocalFiles(snapshot,'work','.','missing'),[])
 assert.equal(JSON.stringify(snapshot),before)
 assert.equal(localDirectorySnapshot(original,'work','../bad',1234),null)
 assert.equal(localDirectorySnapshot('{broken','work','.',1234),null)
})

test('local menu lists safe saved profiles without loading credential contents or starting tasks',async()=>{
 const home=await temp()
 try{
  const installed=await prepareGuidedConnection(ticket(),{home,confirm:async()=>true,pair})
  const credentials=path.join(path.dirname(installed.configFile),'.local-device-credentials.json')
  await fs.writeFile(credentials,'not-json-secret-content-must-not-be-parsed')
  const bytes=await fs.readFile(installed.configFile,'utf8'),before=await fs.readFile(credentials,'utf8')
  const found=await listGuidedProfiles({home})
  assert.equal(found.profiles.length,1);assert.equal(found.profiles[0].name,'目录验收')
  assert.equal(JSON.stringify(found).includes(before),false)
  const transcript=[],responses=['1','1','y']
  const chosen=await chooseGuidedProfile({question:async()=>responses.shift()},{home,write:line=>transcript.push(line)})
  assert.equal(chosen.kind,'resume');assert.equal(chosen.id,ticket().pairing.id)
  assert.equal((await fs.readFile(installed.configFile,'utf8')),bytes)
  assert.equal((await fs.readFile(credentials,'utf8')),before)
  assert.equal(transcript.join('').includes(before),false)
  for(const answers of [[''],['1',''],['1','1','n']]){
   assert.equal((await chooseGuidedProfile({question:async()=>answers.shift()},{home,write:()=>{}})).kind,'cancel')
  }
  const folder=['1','2'];assert.equal((await chooseGuidedProfile({question:async()=>folder.shift()},{home,write:()=>{}})).kind,'folder')
  assert.equal((await chooseGuidedProfile({question:async()=>'N'},{home,write:()=>{}})).kind,'new')
  await assert.rejects(()=>chooseGuidedProfile({question:async()=>'999'},{home,write:()=>{}}),/invalid_profile_selection/)
  await fs.unlink(credentials)
  assert.equal((await listGuidedProfiles({home})).profiles.length,0)
 }finally{await fs.rm(home,{recursive:true,force:true})}
})

test('local launcher rejects linked and advanced configs and changed confirmation snapshots',async()=>{
 const home=await temp()
 try{
  const installed=await prepareGuidedConnection(ticket(),{home,confirm:async()=>true,pair})
  const original=await fs.readFile(installed.configFile,'utf8'),config=JSON.parse(original)
  const answers=['1','1','y'];let questions=0
  await assert.rejects(()=>chooseGuidedProfile({question:async()=>{
   const answer=answers.shift();if(++questions===3)await fs.writeFile(installed.configFile,JSON.stringify({...config,deviceName:'changed'}));return answer
  }},{home,write:()=>{}}),/local_config_changed/)
  await fs.writeFile(installed.configFile,JSON.stringify({...config,apps:{notForSimpleMenu:{command:'do-not-run'}}}))
  assert.equal((await listGuidedProfiles({home})).profiles.length,0)
  await fs.writeFile(installed.configFile,original)
  const linked=path.join(path.dirname(path.dirname(installed.configFile)),'z'.repeat(24))
  await fs.symlink(path.dirname(installed.configFile),linked,process.platform==='win32'?'junction':'dir')
  const found=await listGuidedProfiles({home})
  assert.equal(found.profiles.length,1);assert.equal(found.unavailable,1)
  await assert.rejects(()=>readGuidedProfile('z'.repeat(24),{home}),/linked_setup/)
  await assert.rejects(()=>readGuidedProfile('../../elsewhere',{home}),/invalid_resume_id/)
 }finally{await fs.rm(home,{recursive:true,force:true})}
})

test('mixed roots enforce read-only at execution boundary even if a write tool exists for another root',async()=>{
 const home=await temp();await fs.mkdir(path.join(home,'read'));await fs.mkdir(path.join(home,'write'))
 try{
  const rt=await createRuntime({roots:[{name:'reading',path:path.join(home,'read'),readOnly:true},{name:'writing',path:path.join(home,'write')}],office:{enabled:true}})
  try{
   assert.ok(rt.tools.some(t=>t.name==='files.write'))
   assert.deepEqual(localRootOptions(rt.tools.find(t=>t.name==='files.write')).map(r=>r.id),['writing'])
   await assert.rejects(()=>rt.execute({tool:'files.write',arguments:{root:'reading',path:'no.txt',text:'no'}}),/read_only/)
   await rt.execute({tool:'files.write',arguments:{root:'writing',path:'yes.txt',text:'yes'}})
   assert.equal(await fs.readFile(path.join(home,'write','yes.txt'),'utf8'),'yes')
   await fs.writeFile(path.join(home,'read','binary.txt'),Buffer.from([0,1,2]))
   await assert.rejects(()=>rt.execute({tool:'files.read',arguments:{root:'reading',path:'binary.txt'}}),/not_plain_text/)
  }finally{await rt.close()}
 }finally{await fs.rm(home,{recursive:true,force:true})}
})
