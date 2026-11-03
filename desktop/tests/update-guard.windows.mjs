// Real process identity and mapped-file protection in disposable installations.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {buildDesktopUpdateGuard} from '../../ops/build-desktop-update-guard.mjs'
const run=promisify(execFile),root=process.cwd(),base=await fs.mkdtemp(path.join(root,'.tmp/update-guard-')),a=path.join(base,'installation A'),b=path.join(base,'installation B'),children=[]
assert.equal(path.dirname(base),path.join(root,'.tmp'))
await buildDesktopUpdateGuard();await fs.mkdir(a);await fs.mkdir(b)
const code='using System;using System.IO;class Fixture{static void Main(string[] args){if(args.Length>0){using(var f=new FileStream(args[0],FileMode.Open,FileAccess.Read,FileShare.Read)){Console.WriteLine("READY");Console.ReadLine();}}else{Console.WriteLine("READY");Console.ReadLine();}}}'
const source=path.join(base,'fixture.cs'),exe=path.join(a,'Agent Studio.exe'),holder=path.join(base,'holder.exe'),compiler=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),guard=path.join(root,'.tmp/desktop-update-guard/update-guard.exe')
await fs.writeFile(source,code);await run(compiler,['/nologo','/target:exe','/platform:x64','/out:'+exe,source],{windowsHide:true});await fs.copyFile(exe,path.join(b,'Agent Studio.exe'));await fs.copyFile(exe,holder)
async function start(file,args=[]){const child=spawn(file,args,{windowsHide:true,stdio:['pipe','pipe','ignore']});children.push(child);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture_start_timeout')),10000);child.stdout.once('data',()=>{clearTimeout(timer);resolve()});child.once('error',reject)});return child}
try{
 const other=await start(path.join(b,'Agent Studio.exe')),target=await start(exe)
 await assert.rejects(run(guard,['--check',a],{windowsHide:true}),error=>JSON.parse(error.stdout).error==='application_running')
 const stopped=JSON.parse((await run(guard,['--stop',a],{windowsHide:true})).stdout);assert.equal(stopped.ok,true);assert.ok(stopped.stopped>=1);assert.doesNotThrow(()=>process.kill(other.pid,0));await new Promise(r=>setTimeout(r,100));assert.notEqual(target.exitCode,null)
 const pak=path.join(a,'chrome_100_percent.pak');await fs.writeFile(pak,'UNCHANGED');const locked=await start(holder,[pak])
 await assert.rejects(run(guard,['--check',a],{windowsHide:true}),error=>JSON.parse(error.stdout).error==='installation_files_busy');assert.equal(await fs.readFile(pak,'utf8'),'UNCHANGED');locked.stdin.end('\n');await new Promise(r=>locked.once('exit',r))
 assert.equal(JSON.parse((await run(guard,['--check',a],{windowsHide:true})).stdout).filesUnlocked,true)
 const report={status:'PASS',runningApplicationRefusedBeforeWrite:true,exactInstallationStopped:true,otherInstallationPreserved:true,mappedFileRefusedWithoutMutation:true,unlockedInstallationAccepted:true,productionData:false}
 await fs.writeFile(path.join(base,'acceptance.json'),JSON.stringify(report,null,2));console.log('UPDATE_GUARD_ACCEPTANCE '+JSON.stringify(report))
}finally{for(const child of children)if(child.exitCode===null){child.kill();await new Promise(r=>{child.once('exit',r);setTimeout(r,1000)})}}
