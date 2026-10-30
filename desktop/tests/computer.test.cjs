const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const A='a'.repeat(24),B='b'.repeat(24),C='c'.repeat(24),origin='http://127.0.0.1:25701'
async function fixture({profiles=[],devices=[{id:A,revoked:false,paired:true}],preferencesFile}={}){
 const {createDesktopComputer}=await import('../computer.mjs')
 const calls=[],data={profiles:structuredClone(profiles),review:null,permissions:null,busy:false,selection:null,version:'fixture'}
 let account='employee-A',authorized=true,attention=0
 const manager={origin:'http://127.0.0.1:25702',token:'private-manager-secret',state:async()=>structuredClone(data),clearDesktopDrafts:async()=>{calls.push('clear');data.review=null;data.permissions=null},stopSaved:async id=>{calls.push('stop:'+id);data.profiles.find(p=>p.id===id).running=false},resumeSaved:async(id,fingerprint)=>{calls.push('resume:'+id);const p=data.profiles.find(p=>p.id===id);assert.equal(p.fingerprint,fingerprint);p.running=true}}
 const fetchImpl=async(url,options)=>{
  if(url.startsWith(origin)){
   assert.equal(options.headers.Authorization,'valid-employee-session-token')
   if(!authorized)return Response.json({}, {status:401})
   if(url.endsWith('/api/studio/me'))return Response.json({user:{id:account,active:true}})
   return Response.json({items:devices})
  }
  assert.equal(options.headers['X-Connector-Session'],manager.token);assert.equal(options.headers.Origin,manager.origin)
  const input=JSON.parse(options.body),action=url.slice(manager.origin.length);calls.push(action)
  if(action==='/api/prepare')data.review={name:input.ticket.name,reviewId:'review-1'}
  if(action==='/api/stop')data.profiles.find(p=>p.id===input.id).running=false
  if(action==='/api/resume')data.profiles.find(p=>p.id===input.id).running=true
  return Response.json({...data,notice:'fixture acknowledged'})
 }
 const computer=createDesktopComputer({serverOrigin:origin,manager,fetchImpl,preferencesFile,attention:()=>attention++})
 return {computer,calls,data,devices,manager,setAccount:x=>account=x,setAuthorized:x=>authorized=x,attention:()=>attention}
}
const profile=(id,server=origin+'/__pb')=>({id,server,name:'Device '+id,fingerprint:'f'.repeat(64),state:'stopped',running:false,roots:[],origins:[]})
test('desktop engine exposes only verified current employee profiles and restores the matching local connection',async()=>{
 const f=await fixture({profiles:[profile(A),profile(B),profile(C,'https://other.test/__pb')]})
 await assert.rejects(f.computer.request('state'),/登录/)
 const state=await f.computer.request('session',{token:'valid-employee-session-token'})
 assert.deepEqual(state.profiles.map(p=>p.id),[A]);assert.equal(state.profiles[0].running,true)
 assert.deepEqual(f.calls,['clear','resume:'+A]);assert.ok(!JSON.stringify(state).includes('private-manager-secret'))
 await assert.rejects(f.computer.request('resume',{id:B,consent:true}),/不属于/)
 await assert.rejects(f.computer.request('arbitrary.shell',{command:'cmd.exe'}),/不支持/)
})
test('application drafts are employee scoped and cannot be used to switch authorization targets',async()=>{
 const f=await fixture({profiles:[profile(A),profile(B)]});await f.computer.request('session',{token:'valid-employee-session-token'})
 f.data.applicationPermissions={id:B,reviewId:'foreign-review',candidates:[{path:'private-path'}]}
 assert.equal((await f.computer.request('state')).applicationPermissions,null)
 await assert.rejects(f.computer.request('applications.open',{id:B,fingerprint:'f'.repeat(64)}),/不属于/)
 f.data.applicationPermissions={id:A,reviewId:'owned-review'}
 assert.equal((await f.computer.request('state')).applicationPermissions.id,A)
 await assert.rejects(f.computer.request('select',{id:A,consent:true}),/授权编辑/)
})
test('pause persists across restart, explicit resume selects the automatic connection',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desktop-preference-')),file=path.join(dir,'preferences.json')
 try{
  const f=await fixture({profiles:[profile(A)],preferencesFile:file});await f.computer.request('session',{token:'valid-employee-session-token'});await f.computer.request('stop',{id:A,consent:true})
  const next=await fixture({profiles:[profile(A)],preferencesFile:file});await next.computer.request('session',{token:'valid-employee-session-token'});assert.ok(!next.calls.includes('resume:'+A))
  await next.computer.request('resume',{id:A,fingerprint:'f'.repeat(64),consent:true})
  const third=await fixture({profiles:[profile(A),profile(B)],preferencesFile:file});await third.computer.request('session',{token:'valid-employee-session-token'});assert.ok(third.calls.includes('resume:'+A))
  assert.ok(!(await fs.readFile(file,'utf8')).includes('valid-employee-session-token'))
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})
test('pairing requires an owned unpaired device on the selected server and never confirms by preparing',async()=>{
 const f=await fixture({devices:[{id:A,revoked:false,paired:false}]});await f.computer.request('session',{token:'valid-employee-session-token'})
 const ticket={format:'agent-studio-connect-v1',server:origin+'/__pb',name:'Native fixture',mode:'files',origins:[],pairing:{id:A,code:'d'.repeat(48),expiresAt:Date.now()+280000}}
 for(const changed of [{server:'https://other.test/__pb'},{pairing:{...ticket.pairing,id:B}},{command:'cmd.exe'}])await assert.rejects(f.computer.request('prepare',{ticket:{...ticket,...changed}}))
 const draft=await f.computer.request('prepare',{ticket});assert.equal(draft.review.name,'Native fixture');assert.ok(!f.calls.includes('/api/connect'))
 await f.computer.request('session',{token:null});await assert.rejects(f.computer.request('connect',{reviewId:'review-1',consent:true}),/登录/);assert.equal(f.data.review,null)
})
test('permission confirmation is in-app, one-use, ownership checked, and logout rejects pending reviews',async()=>{
 const f=await fixture({profiles:[profile(A)]});await f.computer.request('session',{token:'valid-employee-session-token'})
 const signal=new AbortController(),promise=f.computer.confirmReview({deviceId:A,review:{message:'Fixture scope change'},expiresAt:Date.now()+5000},signal.signal)
 const state=await f.computer.request('state'),id=state.confirmations[0].id;assert.equal(f.attention(),1)
 await f.computer.request('confirm',{id,consent:true});assert.equal(await promise,true)
 await assert.rejects(f.computer.request('confirm',{id,consent:true}),/已结束/)
 const pending=f.computer.confirmReview({deviceId:A,review:{message:'Must not approve'},expiresAt:Date.now()+5000},signal.signal)
 await f.computer.request('session',{token:null});assert.equal(await pending,false);assert.ok(f.calls.includes('stop:'+A))
 assert.equal(await f.computer.confirmReview({deviceId:B,review:{message:'Foreign'},expiresAt:Date.now()+5000},signal.signal),false)
})
test('expired or rejected employee session cannot read state or change local scopes',async()=>{
 const f=await fixture({profiles:[profile(A)]});await f.computer.request('session',{token:'valid-employee-session-token'});f.setAuthorized(false)
 await assert.rejects(f.computer.request('state'),/登录已失效/);assert.ok(f.calls.includes('stop:'+A));await assert.rejects(f.computer.request('permissions.open',{id:A}),/登录/)
})
test('changing employee clears drafts and stops the previous employee connection before restoring the new one',async()=>{
 const f=await fixture({profiles:[profile(A),profile(B)]});await f.computer.request('session',{token:'valid-employee-session-token'})
 f.data.permissions={id:A};f.setAccount('employee-B');f.devices.splice(0,1,{id:B,revoked:false,paired:true})
 await assert.rejects(f.computer.request('state'),/账号发生变化/)
 const next=await f.computer.request('session',{token:'valid-employee-session-token'})
 assert.deepEqual(next.profiles.map(p=>p.id),[B]);assert.equal(next.permissions,null)
 assert.ok(f.calls.indexOf('stop:'+A)<f.calls.indexOf('resume:'+B))
})
test('first launch selects the most recent owned local connection, then persists explicit selection across restart',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desktop-last-computer-')),file=path.join(dir,'preferences.json')
 const devices=[{id:A,name:'Older',revoked:false,paired:true,seen_ms:100},{id:B,name:'Recent',revoked:false,paired:true,seen_ms:200}]
 try{
  const f=await fixture({profiles:[profile(A),profile(B)],devices,preferencesFile:file})
  const first=await f.computer.request('session',{token:'valid-employee-session-token'});assert.equal(first.selectedId,B);assert.ok(f.calls.includes('resume:'+B))
  const chosen=await f.computer.request('select',{id:A,consent:true});assert.equal(chosen.selectedId,A);assert.ok(f.calls.includes('resume:'+A))
  const next=await fixture({profiles:[profile(A),profile(B)],devices,preferencesFile:file});const reopened=await next.computer.request('session',{token:'valid-employee-session-token'});assert.equal(reopened.selectedId,A);assert.ok(next.calls.includes('resume:'+A));assert.ok(!next.calls.includes('resume:'+B))
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})
test('selection cannot restore revoked, unpaired or another employee device',async()=>{
 const f=await fixture({profiles:[profile(A)],devices:[{id:A,revoked:false,paired:true},{id:B,revoked:true,paired:true},{id:C,revoked:false,paired:false}]})
 await f.computer.request('session',{token:'valid-employee-session-token'})
 for(const id of [B,C,'d'.repeat(24)])await assert.rejects(f.computer.request('select',{id,consent:true}),/未撤销/)
 await assert.rejects(f.computer.request('select',{id:A,consent:false}),/未撤销/)
})
