// Actual installer failure recovery in the successful test's isolated directory.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawnSync,spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {publishDesktopUpdate} from '../../ops/publish-desktop-update.mjs'
const require=createRequire(import.meta.url),{performUpdate}=require('../update-helper.cjs'),{hashFile}=require('../update-core.cjs'),trust=require('../update-trust.json')
const root=process.cwd(),base=path.resolve(process.argv[2]||''),installer=path.resolve(process.argv[3]||'')
assert.equal(path.dirname(base),path.join(root,'.tmp'));assert.ok(path.basename(base).startsWith('update acceptance '))
const acceptance=JSON.parse(await fs.readFile(path.join(base,'acceptance.json'),'utf8')),installation=path.join(base,'Agent Studio'),home=path.join(base,'account')
assert.equal(acceptance.status,'PASS');assert.equal(acceptance.installation,installation)
const before=await hashFile(path.join(installation,'resources/app.asar')),key=await fs.readFile('.tmp/update-signing/private.pem','utf8')
// The trusted publisher accidentally labels the older package as a newer
// version. Its signature/hash are valid, but installed version proof must fail.
const published=await publishDesktopUpdate({installer,output:path.join(base,'bad-release'),baseUrl:'http://127.0.0.1:1/updates/',releaseVersion:'0.1.0-preview.12',key,notes:'故意错误版本，用于隔离回滚测试'})
const envelope=JSON.parse(await fs.readFile(published.manifest,'utf8')),id=randomUUID(),directory=path.join(installation,'temp/desktop-updates',id)
await fs.mkdir(directory,{recursive:true});const probe=spawnSync(process.execPath,['-e','process.exit(0)'],{windowsHide:true});assert.equal(probe.status,0)
const job={root:installation,directory,id,parentPid:probe.pid,args:['--desktop-test-home='+home],installer:published.installer,envelope,publicKey:trust.publicKey}
await fs.writeFile(path.join(directory,'job.json'),JSON.stringify(job));let pid
try{
 await performUpdate(job);const result=JSON.parse(await fs.readFile(path.join(directory,'result.json'),'utf8'));pid=result.pid
 assert.equal(result.phase,'rolled_back');assert.equal(result.version,'0.1.0-preview.11');assert.match(result.error,/版本/)
 assert.equal(await hashFile(path.join(installation,'resources/app.asar')),before)
 assert.equal(await fs.readFile(path.join(home,'employee-sentinel'),'utf8'),'EMPLOYEE_AND_DEVICE_SETTINGS_PRESERVED')
 const report={status:'PASS',realInstallerApplied:true,wrongVersionRejected:true,originalProgramBytesRestored:true,employeeSettingsPreserved:true,restartedVersion:result.version,productionData:false}
 await fs.writeFile(path.join(base,'rollback-acceptance.json'),JSON.stringify(report,null,2));console.log('PACKAGED_UPDATE_ROLLBACK_PASS '+base)
}finally{
 if(pid){const child=spawn(path.join(process.env.SystemRoot,'System32/taskkill.exe'),['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise(r=>{child.once('error',r);child.once('exit',r)})}
}
