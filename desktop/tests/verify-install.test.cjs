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

test('all payload files are checked and multiple failures retain manifest order',async()=>{
 const temporaryRoot=await fs.realpath(os.tmpdir()),home=await fs.mkdtemp(path.join(temporaryRoot,'agentstudio-install-batch-')),entries=[]
 try{
  for(let i=0;i<12;i++){const content='trusted-'+i,file='payload-'+i;await fs.writeFile(path.join(home,file),content);entries.push({path:file,bytes:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex')})}
  await fs.writeFile(path.join(home,'.studio-files.json'),JSON.stringify({version:'batch-test',files:entries}))
  const run=()=>spawnSync(process.execPath,[path.join(__dirname,'../verify-install.cjs'),home],{windowsHide:true,encoding:'utf8',timeout:20000})
  assert.equal(run().status,0)
  await fs.writeFile(path.join(home,'payload-2'),'changed-2');await fs.unlink(path.join(home,'payload-10'));entries[6].path='../outside-batch'
  await fs.writeFile(path.join(home,'.studio-files.json'),JSON.stringify({version:'batch-test',files:entries}));assert.equal(run().status,1)
  const report=JSON.parse(await fs.readFile(path.join(home,'install-verification.json'),'utf8'));assert.equal(report.files,12);assert.deepEqual(report.failed,['payload-2','../outside-batch','payload-10'])
 }finally{const real=await fs.realpath(home);assert.equal(path.dirname(real).toLowerCase(),temporaryRoot.toLowerCase());assert.match(path.basename(real),/^agentstudio-install-batch-[A-Za-z0-9_-]+$/);assert.equal((await fs.lstat(home)).isSymbolicLink(),false);await fs.rm(real,{recursive:true,force:true})}
})
