const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process')
test('installed payload verification detects same-size corruption and out-of-root files',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-install-check-')),root=path.join(home,'program')
 await fs.mkdir(root);await fs.writeFile(path.join(root,'payload'),'trusted');await fs.writeFile(path.join(home,'outside'),'trusted')
 const digest=createHash('sha256').update('trusted').digest('hex')
 const manifest=entry=>fs.writeFile(path.join(root,'.studio-files.json'),JSON.stringify({version:'test',files:[{path:entry,bytes:7,sha256:digest}]}))
 const run=()=>spawnSync(process.execPath,[path.join(__dirname,'../verify-install.cjs'),root],{windowsHide:true,encoding:'utf8',timeout:10000})
 try{
  await manifest('payload');assert.equal(run().status,0)
  await fs.writeFile(path.join(root,'payload'),'changed');assert.equal(run().status,1)
  await manifest('../outside');assert.equal(run().status,1)
  const report=JSON.parse(await fs.readFile(path.join(root,'install-verification.json'),'utf8'));assert.deepEqual(report.failed,['../outside'])
 }finally{const real=await fs.realpath(home);assert.ok(real.startsWith(await fs.realpath(os.tmpdir())));await fs.rm(real,{recursive:true,force:true})}
})
