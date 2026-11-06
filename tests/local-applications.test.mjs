import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {inspectApplication,applicationId,applicationIconPath,redactApplicationText,validateApplicationControl,registerApplications,discoverApplications} from '../local-executor/applications.mjs'
import {applicationNative} from '../local-executor/application-native.mjs'
import {applicationPermissionDraft,saveApplicationPermissions} from '../local-executor/application-permissions.mjs'
import {readGuidedProfile} from '../local-executor/profiles.mjs'
import {codexTaskArguments,createCodexTasks} from '../local-executor/codex-tasks.mjs'
import {createRuntime} from '../local-executor/runtime.mjs'

async function fixture(t,{codex=false,control=true,electron=false,images=false,confirm=async()=>true,clock=Date.now}={}){
 const base=path.resolve('.tmp/application-unit');await fs.mkdir(base,{recursive:true});const home=await fs.mkdtemp(path.join(base,'disposable-')),exe=path.join(home,codex?'codex.exe':'fixture.exe');await fs.writeFile(exe,'MZ-synthetic-no-program')
 if(electron)await fs.writeFile(path.join(home,'LICENSE.electron.txt'),'Electron acceptance fixture')
 const grant=await inspectApplication(exe,{name:codex?'Codex fixture':'Synthetic fixture',adapter:codex?'codex':'desktop',control}),tools=new Map(),calls=[],children=[]
 let view={window:{id:'123',title:'Isolated fixture',width:800,height:600},input:42,controls:[{id:0,name:'Editor',type:'ControlType.Edit',runtime:'42.1',enabled:true,password:false,rect:[10,10,100,50]},{id:1,name:'[protected]',runtime:'42.2',password:true,enabled:true}]}
 const config={roots:[{name:'work',path:home,readOnly:false}],applications:{format:'agent-studio-applications-v1',enabled:true,images,grants:[grant]}}
 const native=async input=>{calls.push(input);if(input.action==='windows')return [{id:'123',path:exe,title:view.window.title,foreground:view.window.foreground}];if(input.action==='observe'||input.action==='activate_observe')return structuredClone(input.action==='activate_observe'?{...view,window:{...view.window,foreground:true}}:view);if(input.action==='act')return {accepted:true};return []}
 const launch=(...args)=>{const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();c.unref=()=>{};c.kill=()=>{c.emit('close',1)};children.push({c,args});queueMicrotask(()=>c.emit('spawn'));return c}
 const runtime=registerApplications({config,add:(name,description,schema,fn)=>tools.set(name,{description,schema,fn}),native,launch,confirm,clock})
 t.after(async()=>{await runtime.close();assert.ok(path.resolve(home).startsWith(base+path.sep));await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100})})
 return {home,exe,grant,config,tools,calls,children,runtime,setView:v=>view=v,call:async(name,args={})=>{const out=await tools.get('apps.'+name).fn({app:grant.id,...args});return typeof out==='string'?JSON.parse(out):out}}
}
test('app grants pin exact executable identities, reject shell/security apps and arbitrary config',async t=>{
 const f=await fixture(t);assert.equal(applicationId(f.exe.toUpperCase()),f.grant.id);assert.equal(f.grant.sha256.length,64)
 assert.deepEqual(validateApplicationControl().grants,[])
 for(const name of ['powershell.exe','cmd.exe','Codex.exe','Agent Studio.exe','1password.exe']){const p='D:\\apps\\'+name;assert.throws(()=>validateApplicationControl({...f.config.applications,grants:[{...f.grant,path:p,id:applicationId(p)}]}),/application_protected/)}
 for(const update of [{command:'cmd'},{sha256:'bad'},{id:'0'.repeat(24)},{allowWrite:true},{adapter:'shell'}])assert.throws(()=>validateApplicationControl({...f.config.applications,grants:[{...f.grant,...update}]}))
 assert.throws(()=>validateApplicationControl({...f.config.applications,grants:[f.grant,f.grant]}))
 const r=await createRuntime(f.config,{applicationsAdapter:{native:async()=>[]}});try{assert.ok(r.tools.some(t=>t.name==='apps.act'));assert.ok(r.tools.length<=50)}finally{await r.close()}
})
test('discovery never executes candidates and defers binary hashing until explicit authorization',async t=>{
 const f=await fixture(t),rows=await discoverApplications({native:async()=>[{path:f.exe,name:'Fixture'},{path:f.exe,name:'Duplicate'},{path:'C:\\Windows\\System32\\cmd.exe',name:'Protected'}]});assert.equal(rows.length,1);assert.equal(rows[0].sha256,undefined)
})

test('installed application icons are paths, never commands or uninstall instructions',()=>{
 for(const icon of ['D:\\Apps\\WorkBuddy\\WorkBuddy.exe,0','"D:\\Apps With Spaces\\WorkBuddy.exe",-12',' D:\\Apps\\WorkBuddy.exe '])assert.match(applicationIconPath(icon),/^D:\\.*\.exe$/)
 for(const icon of ['D:\\Apps\\WorkBuddy.exe --run','"D:\\Apps\\WorkBuddy.exe" --run','\\\\server\\app.exe,0','%LOCALAPPDATA%\\app.exe,0','D:\\Apps\\app.dll,0','D:\\Apps\\app.exe,0; calc.exe','D:\\Apps\\app.exe\n','D:\\Apps\\app.exe | evil.exe',null])assert.equal(applicationIconPath(icon),null)
})

test('registry discovery reaches apps after the previous 120-row cutoff and ignores unsafe icon suffixes',async t=>{
 const f=await fixture(t),rows=[]
 for(let i=0;i<121;i++){const exe=path.join(f.home,`candidate-${i}.exe`);await fs.writeFile(exe,'MZ-inert');rows.push({path:exe,name:`Candidate ${i}`})}
 rows.push({icon:f.exe+',0',name:'WorkBuddy registry fixture'},{icon:f.exe+' --run',name:'Unsafe icon'})
 const apps=await discoverApplications({native:async()=>rows});assert.equal(apps.length,122);assert.ok(apps.some(a=>a.name==='WorkBuddy registry fixture'));assert.ok(apps.every(a=>a.sha256===undefined))
})

test('a rejected desktop duplicate cannot hide the separately authorized Codex CLI adapter',async t=>{
 const f=await fixture(t,{codex:true}),apps=await discoverApplications({native:async()=>[{path:f.exe,name:'Protected desktop'},{path:f.exe,name:'Codex CLI',adapter:'codex'}]})
 assert.equal(apps.length,1);assert.equal(apps[0].adapter,'codex')
})

test('model-visible observations mask URL credentials while action identity stays local and exact',async t=>{
 const f=await fixture(t),url='file:///app/index.html?locale=zh-CN&wbSeedToken=internal-secret&session_id=private-session#home'
 f.setView({window:{id:'123',title:'WorkBuddy?access_token=window-secret',width:800,height:600},controls:[{id:0,name:url,value:url,type:'ControlType.Document',runtime:'1.2',enabled:true,password:false,actions:['click']}]})
 const windows=await f.call('windows');assert.ok(!JSON.stringify(windows).includes('window-secret'))
 const view=await f.call('observe',{window:'123'}),text=JSON.stringify(view)
 for(const secret of ['internal-secret','private-session','window-secret'])assert.ok(!text.includes(secret))
 assert.match(text,/wbSeedToken=\[redacted\]/);assert.match(text,/locale=zh-CN/)
 await f.call('act',{observation:view.observation,element:0,action:'click'})
 const action=f.calls.find(c=>c.action==='act');assert.equal(action.name,url);assert.equal(action.title,'WorkBuddy?access_token=window-secret');assert.equal(action.runtime,'1.2')
 assert.equal(redactApplicationText('Research AI workbench design'), 'Research AI workbench design')
})
test('Electron root Document and file URL cannot be treated as actionable WorkBuddy controls',async t=>{
 const f=await fixture(t,{electron:true})
 f.setView({window:{id:'123',title:'WorkBuddy',width:1802,height:800},controls:[{id:0,name:'WorkBuddy',type:'ControlType.Document',value:'file:///D:/HR',runtime:'1.1',enabled:true,password:false,actions:['click'],rect:[0,0,1802,800]}]})
 const view=await f.call('observe',{window:'123'})
 assert.equal(view.status,'accessibility_unavailable')
 assert.equal(view.actionable,false)
 assert.equal(view.retryAction,false)
 assert.equal(view.observation,undefined)
 assert.equal(view.controls,undefined)
 assert.match(view.message,/完全退出应用/)
 await assert.rejects(f.call('act',{observation:'0'.repeat(32),element:0,action:'click'}),/application_observation_expired/)
 assert.ok(!f.calls.some(c=>c.action==='act'))
})
test('Electron menu bar alone cannot qualify inaccessible content as actionable',async t=>{
 const f=await fixture(t,{electron:true})
 f.setView({window:{id:'123',title:'WorkBuddy',width:1000,height:700},controls:[
  {id:0,name:'WorkBuddy',type:'ControlType.Document',value:'file:///D:/HR',runtime:'1.1',enabled:true,password:false,actions:['click'],rect:[0,0,1000,700]},
  {id:1,name:'编辑(E)',type:'ControlType.MenuItem',runtime:'1.2',enabled:true,password:false,actions:['click'],rect:[10,10,70,24]},
 ]})
 const observed=await f.call('observe',{window:'123'})
 assert.equal(observed.status,'accessibility_unavailable')
 assert.equal(observed.observation,undefined)
 assert.ok(!f.calls.some(c=>c.action==='act'))
})
test('background Electron observation is fast, read-only and cannot issue stale control credentials',async t=>{
 const f=await fixture(t,{electron:true})
 f.setView({window:{id:'123',title:'WorkBuddy fixture',width:1000,height:700,foreground:false},controls:[{id:0,name:'Input',type:'ControlType.Edit',runtime:'100',password:false,enabled:true,actions:['type'],rect:[10,10,500,100]}]})
 const result=await f.call('observe',{window:'123'})
 assert.equal(result.status,'window_background')
 assert.equal(result.actionable,false)
 assert.equal(result.observation,undefined)
 assert.equal(f.calls.filter(x=>x.action==='observe').length,0,'background UIA must not enumerate')
 await assert.rejects(f.call('act',{observation:'0'.repeat(32),element:0,action:'type',text:'x'}),/application_observation_expired/)
})
test('authorized background screenshots survive without accessibility scans or action tokens',async t=>{
 const f=await fixture(t,{electron:true,images:true})
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='
 f.setView({window:{id:'123',title:'WorkBuddy fixture',width:1000,height:700,foreground:false},image:png,imageWidth:1,imageHeight:1,controls:[]})
 const result=await f.call('observe',{window:'123'})
 assert.ok(result.images?.length===1,'previously authorized screenshot must be retained')
 assert.equal(result.images[0].mimeType,'image/png')
 const metadata=JSON.parse(result.text)
 assert.equal(metadata.status,'window_background')
 assert.equal(metadata.actionable,false)
 assert.equal(metadata.observation,undefined)
 assert.equal(metadata.controls,undefined)
 assert.equal(f.calls.filter(x=>x.action==='observe').length,1,'native observes image without UIA when background')
 assert.ok(!f.calls.some(x=>x.action==='act'))
 await assert.rejects(f.call('act',{observation:'0'.repeat(32),element:0,action:'click'}),/application_observation_expired/)
})
test('already foreground WorkBuddy is only observed, without an unnecessary second activation approval',async t=>{
 const f=await fixture(t,{electron:true,confirm:async()=>{throw Error('redundant_confirmation')}})
 f.setView({window:{id:'123',title:'WorkBuddy fixture',width:1000,height:700,foreground:true},
   controls:[{id:0,name:'WorkBuddy task input',type:'ControlType.Edit',runtime:'100',
     password:false,enabled:true,actions:['type'],rect:[10,10,500,100]}]})
 const ready=await f.call('launch')
 assert.equal(ready.app,f.grant.id,'model must receive the authorized app ID for the next call')
 assert.equal(ready.windows[0].id,'123')
 const windows=await f.call('windows')
 assert.equal(windows.app,f.grant.id)
 const observed=await f.call('observe',{window:'123',activate:true})
 assert.match(observed.observation,/^[a-f0-9]{32}$/)
 assert.equal(observed.window.foreground,true)
 assert.ok(observed.controls.some(c=>c.name==='WorkBuddy task input'))
 assert.equal(f.calls.some(c=>c.action==='activate_observe'),false,
   'a verified foreground observation must not need an effectful activate')
 assert.equal(f.calls.filter(c=>c.action==='observe').length,1)
})
test('explicit focus and observe requires local consent and cannot write without separate one-use approval',async t=>{
 let approvals=0
 const f=await fixture(t,{electron:true,confirm:async()=>{approvals++;return approvals===2}})
 f.setView({window:{id:'123',title:'WorkBuddy fixture',width:1000,height:700,foreground:false},controls:[{id:0,name:'Input',type:'ControlType.Edit',runtime:'100',password:false,enabled:true,actions:['type'],rect:[10,10,500,100]}]})
 await assert.rejects(f.call('observe',{window:'123',activate:true}),/application_action_declined/)
 assert.equal(f.calls.filter(x=>x.action==='activate_observe').length,0)
 await assert.rejects(f.call('observe',{window:'123',activate:'yes'}),/invalid_application_arguments/)
 const result=await f.call('observe',{window:'123',activate:true})
 assert.equal(result.status,undefined)
 assert.match(result.observation,/^[a-f0-9]{32}$/)
 assert.equal(f.calls.filter(x=>x.action==='activate_observe').length,1)
 assert.equal(f.calls.filter(x=>x.action==='act').length,0)
 assert.equal(approvals,2)
 await assert.rejects(f.call('act',{observation:result.observation,element:0,action:'type',text:'x'}),/application_action_declined/)
 assert.equal(f.calls.filter(x=>x.action==='act').length,0)
})
test('launch-only app cannot request foreground activation through a read tool',async t=>{
 const f=await fixture(t,{electron:true,control:false})
 await assert.rejects(f.call('observe',{window:'123',activate:true}),/application_control_denied/)
 assert.equal(f.calls.filter(x=>x.action==='activate_observe').length,0)
})
test('launch never accepts renderer/model command-line arguments; window list excludes other executables',async t=>{
 const f=await fixture(t);await assert.rejects(f.call('launch',{args:['--eval','bad']}),/invalid_application_arguments/);assert.equal(f.children.length,0)
 const r=await f.call('launch');assert.equal(r.accepted,true);assert.equal(r.alreadyRunning,true);assert.equal(f.children.length,0,'warm start must reuse the existing window');assert.equal(r.windows.length,1);assert.ok(!JSON.stringify(r).includes(f.exe))
 await assert.rejects(f.tools.get('apps.windows').fn({app:'0'.repeat(24)}),/application_denied/)
})
test('observation is one-use, scoped to the shown controls and local approval is mandatory',async t=>{
 let approval;const f=await fixture(t,{confirm:async review=>{approval=review;return true}})
 const view=await f.call('observe',{window:'123'});assert.ok(!JSON.stringify(view).includes(f.exe));assert.ok(!JSON.stringify(view).includes('42.1'))
 const result=await f.call('act',{observation:view.observation,element:0,action:'type',text:'Synthetic text'});assert.equal(result.accepted,true);assert.equal(result.contentsVerified,false);assert.equal(approval.kind,'application');assert.match(approval.message,/Synthetic text/)
 const a=f.calls.find(c=>c.action==='act');assert.equal(a.path,f.exe);assert.equal(a.runtime,'42.1');assert.equal(a.title,'Isolated fixture')
 await assert.rejects(f.call('act',{observation:view.observation,element:0,action:'click'}),/observation_expired/)
})
test('refusal, stale observation, protected elements and binary updates cannot issue native input',async t=>{
 let now=1000;const f=await fixture(t,{confirm:async()=>false,clock:()=>now})
 let v=await f.call('observe',{window:'123'});await assert.rejects(f.call('act',{observation:v.observation,element:0,action:'click'}),/action_declined/)
 v=await f.call('observe',{window:'123'});now+=30001;await assert.rejects(f.call('act',{observation:v.observation,element:0,action:'click'}),/observation_expired/)
 v=await f.call('observe',{window:'123'});await assert.rejects(f.call('act',{observation:v.observation,element:1,action:'type',text:'password'}),/invalid_application_arguments/)
 await fs.appendFile(f.exe,'changed');await assert.rejects(f.call('windows'),/application_binary_changed/);assert.equal(f.calls.filter(c=>c.action==='act').length,0)
})
test('launch-only grants never advertise or permit app input',async t=>{
 const f=await fixture(t,{control:false});assert.equal(f.tools.has('apps.act'),false);assert.equal(f.tools.has('apps.observe'),true)
})
test('large control trees remain valid bounded JSON and never permit hidden controls',async t=>{
 const f=await fixture(t);f.setView({window:{id:'123',title:'Fixture',width:800,height:600},input:42,controls:Array.from({length:250},(_,id)=>({id,name:'控件'.repeat(100),enabled:true,password:false,runtime:'1.'+id}))})
 const v=await f.call('observe',{window:'123'});assert.ok(JSON.stringify(v).length<=10500);assert.equal(v.truncated,true);await assert.rejects(f.call('act',{observation:v.observation,element:249,action:'click'}),/invalid_application_arguments/)
})
test('an unavailable image preserves readable controls and a specific observation diagnostic',async t=>{
 const f=await fixture(t);f.setView({window:{id:'123',title:'Fixture',width:2200,height:1200},controls:[{id:0,name:'Editor',type:'ControlType.Edit',runtime:'42',enabled:true,password:false,actions:['type']}],imageError:'application_capture_timeout'})
 const view=await f.call('observe',{window:'123'});assert.equal(view.controls[0].name,'Editor');assert.equal(view.imageDiagnostic.code,'application_capture_timeout');assert.equal(view.imageDiagnostic.controlsOnly,true);assert.match(view.observation,/^[a-f0-9]{32}$/);assert.equal(f.calls.some(c=>c.action==='act'),false)
})
test('a recreated window returns a fresh read-only window list and invalidates old input evidence',async t=>{
 const f=await fixture(t),tools=new Map();let changed=false,acted=false
 const runtime=registerApplications({config:f.config,add:(name,_description,_schema,fn)=>tools.set(name,fn),native:async input=>{
  if(input.action==='windows')return [{id:changed?'456':'123',path:f.exe,title:'Fixture'}]
  if(input.action==='observe'){if(changed)throw Error('application_window_changed');return {window:{id:'123',title:'Fixture'},controls:[{id:0,name:'Editor',type:'ControlType.Edit',runtime:'1',enabled:true,password:false,actions:['type']}]}}
  acted=true;return {accepted:true}
 }});t.after(()=>runtime.close())
 const first=JSON.parse(await tools.get('apps.observe')({app:f.grant.id,window:'123'}));changed=true
 const next=JSON.parse(await tools.get('apps.observe')({app:f.grant.id,window:'123'}));assert.equal(next.status,'window_changed');assert.equal(next.windows[0].id,'456');assert.equal(next.observation,undefined);assert.equal(next.actionable,false)
 await assert.rejects(tools.get('apps.act')({app:f.grant.id,observation:first.observation,element:0,action:'type',text:'MUST_NOT_WRITE'}),/observation_expired/);assert.equal(acted,false)
})
test('thirty bulk grants fit server schema and catalog limits without leaking executable paths',async t=>{
 const f=await fixture(t),grants=Array.from({length:30},(_,i)=>{const p='D:\\fixture-apps\\'+i+'.exe';return {...f.grant,id:applicationId(p),path:p,name:'应用名称'.repeat(20)+i}})
 const runtime=await createRuntime({...f.config,applications:{...f.config.applications,grants}},{applicationsAdapter:{native:async()=>[]}})
 try{for(const tool of runtime.tools)assert.ok(JSON.stringify(tool.inputSchema).length<=10000,tool.name);assert.ok(JSON.stringify(runtime.tools).length<=60000);assert.ok(!JSON.stringify(runtime.tools).includes('fixture-apps'))}finally{await runtime.close()}
})
test('native helpers transport data rather than interpolate executable scripts',async()=>{
 const input={action:'act',text:'$(literal); " not executable'};const result=await applicationNative(input,{platform:'win32',execute:(exe,args,options,done)=>{assert.match(exe,/WindowsPowerShell/);assert.equal(options.shell,false);assert.equal(options.windowsHide,true);assert.deepEqual(JSON.parse(Buffer.from(options.env.STUDIO_APPLICATION_INPUT,'base64').toString()),input);assert.ok(!Buffer.from(args.at(-1),'base64').toString('utf16le').includes(input.text));done(null,'{"ok":true,"value":{"accepted":true}}')}});assert.equal(result.accepted,true)
})
test('Codex tasks use fixed readonly argv/stdin, return real event results, and hide raw diagnostics',async t=>{
 const f=await fixture(t,{codex:true});const task=await f.call('task_start',{root:'work',prompt:'Test fixture only',write:false});assert.equal(task.status,'running')
 const {c,args}=f.children[0];assert.deepEqual(args[1],codexTaskArguments(f.home,false));assert.equal(args[2].shell,false);assert.equal(c.stdin.read().toString(),'Test fixture only')
 c.stderr.write('not-to-be-disclosed-token');c.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Fixture completed'}})+'\n');c.emit('close',0)
 const result=await f.call('task_status',{task:task.id});assert.equal(result.status,'succeeded');assert.match(result.result,/Fixture completed/);assert.ok(!JSON.stringify(result).includes('not-to-be-disclosed'))
 assert.deepEqual((await f.call('task_list')).tasks.map(t=>t.id),[task.id])
 await assert.rejects(f.call('task_start',{root:'work',prompt:'Write test',write:true}),/task_denied/)
 await assert.rejects(f.call('task_status',{task:'0'.repeat(32)}),/task_not_found/)
 assert.ok(!args[1].some(a=>/danger|bypass|skip-git/.test(a)))
})
test('Codex task rejection does not launch; multiple concurrent submissions are refused; closing cancels owned tasks',async t=>{
 const rejected=await fixture(t,{codex:true,confirm:async()=>false});await assert.rejects(rejected.call('task_start',{root:'work',prompt:'no',write:false}),/action_declined/);assert.equal(rejected.children.length,0)
 const f=await fixture(t,{codex:true});await f.call('task_start',{root:'work',prompt:'one',write:false});await assert.rejects(f.call('task_start',{root:'work',prompt:'two',write:false}),/task_busy/);await f.runtime.close();assert.equal(f.children.length,1)
})
test('concurrent Codex submissions cannot both pass the one-task gate',async t=>{
 let approve;const f=await fixture(t,{codex:true,confirm:()=>new Promise(resolve=>approve=resolve)})
 const first=f.call('task_start',{root:'work',prompt:'one',write:false});while(!approve)await new Promise(r=>setTimeout(r,1));await assert.rejects(f.call('task_start',{root:'work',prompt:'two',write:false}),/task_busy/);approve(true);await first;assert.equal(f.children.length,1)
})
test('disconnect during the final binary check cannot start a background Codex task',async()=>{
 let finish,checks=0,launches=0;const handlers=new Map(),grant={id:'a'.repeat(24),name:'fixture',allowWrite:false,path:'D:\\fixture\\codex.exe'}
 const runtime=createCodexTasks({grants:[grant],roots:[{name:'work',path:process.cwd()}],checked:async()=>{if(++checks===2)await new Promise(resolve=>finish=resolve);return grant},confirm:async()=>true,launch:()=>{launches++;throw Error('must not launch')},addTool:(name,description,properties,fn)=>handlers.set(name,fn)})
 const pending=handlers.get('apps.task_start')({app:grant.id,root:'work',prompt:'never execute',write:false});while(!finish)await new Promise(r=>setTimeout(r,1));await runtime.close();finish();await assert.rejects(pending,/task_busy/);assert.equal(launches,0)
})
test('long-term app permissions persist through reload, have CAS protection, and can be completely revoked',async t=>{
 const f=await fixture(t),id='p'.repeat(24),dir=path.join(f.home,'.agent-studio','connections',id);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'.local-device-credentials.json'),'{"fixture":true}')
 await fs.writeFile(path.join(dir,'computer.local.json'),JSON.stringify({server:'http://127.0.0.1:8180',credentialsFile:'.local-device-credentials.json',deviceName:'App fixture',roots:[{name:'work',path:f.home}]}))
 const draft=await applicationPermissionDraft(id,{home:f.home,discover:async()=>[f.grant]});const input={id,fingerprint:draft.fingerprint,reviewId:draft.reviewId,apps:[f.grant.id],controls:[f.grant.id],writes:[],enabled:true,images:false,consent:true}
 await assert.rejects(saveApplicationPermissions(draft,{...input,consent:false},{home:f.home}),/invalid_application_grants/)
 await saveApplicationPermissions(draft,input,{home:f.home});const saved=await readGuidedProfile(id,{home:f.home});assert.equal(saved.applications.grants[0].sha256,f.grant.sha256);assert.equal(saved.applications.grants[0].control,true)
 await assert.rejects(saveApplicationPermissions(draft,input,{home:f.home}),/local_config_changed/)
 const next=await applicationPermissionDraft(id,{home:f.home,discover:async()=>[]});assert.equal(next.candidates.length,1);await saveApplicationPermissions(next,{...input,fingerprint:next.fingerprint,reviewId:next.reviewId,apps:[],controls:[],enabled:false},{home:f.home});assert.deepEqual((await readGuidedProfile(id,{home:f.home})).applications.grants,[])
})
