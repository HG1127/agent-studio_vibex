// Actual independent Node CLI process + actual Native HTTPS/PG18 and bounded
// synthetic files/Office. Never run on an employee computer or company data.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireNativeLocalDeviceGenuineCi} from './helpers/native-local-device-genuine-guard.mjs'
import {nativeLocalCliFailureCodes} from './helpers/native-local-cli-failure-codes.mjs'
requireNativeLocalDeviceGenuineCi()
test('independent CLI durable pair/claim/completion journal and actual Office artifacts',async t=>{
 const [fs,path,os,url,crypto,cp,timers,{nativeLocalDeviceGenuineFixture}]=await Promise.all([import('node:fs/promises'),import('node:path'),import('node:os'),import('node:url'),import('node:crypto'),import('node:child_process'),import('node:timers/promises'),import('./helpers/native-local-device-genuine-fixture.mjs')])
 const f=await nativeLocalDeviceGenuineFixture(),repo=path.resolve(url.fileURLToPath(new URL('../../../',import.meta.url))),parent=await fs.realpath(os.tmpdir()),directory=await fs.mkdtemp(path.join(parent,'native-local-cli-genuine-')),work=path.join(directory,'work'),children=new Set()
 await fs.mkdir(work);const configPath=path.join(directory,'config.json'),credentialName='credentials-native-ci.json',credentialPath=path.join(directory,credentialName),caPath=path.join(directory,'credentials-native-ci-ca.pem'),gate=path.join(directory,'credentials-native-ci-gate')
 await fs.writeFile(caPath,f.childTlsCa(),{flag:'wx',mode:0o600})
 await fs.writeFile(configPath,JSON.stringify({server:f.nativeOrigin,credentialsFile:credentialName,roots:[{name:'work',path:work}],office:{enabled:true},mcpServers:{probe:{command:process.execPath,args:[path.join(repo,'services/pg-api/tests/helpers/native-local-device-gated-mcp.mjs'),work,gate],tools:['commit_once']}}}),{flag:'wx',mode:0o600})
 const childEnv={};for(const key of ['PATH','HOME','LANG','LC_ALL','TMPDIR','TEMP','TMP'])if(process.env[key]!==undefined)childEnv[key]=process.env[key]
 // Trust only this disposable fixture CA in the child, preserving certificate
 // verification. Parent purpose guard/environment remain unchanged and clean.
 childEnv.NODE_EXTRA_CA_CERTS=caPath
 function start(command,input){const child=cp.spawn(process.execPath,[path.join(repo,'local-executor/native-run.mjs'),command,configPath],{cwd:repo,env:childEnv,stdio:['pipe','pipe','pipe'],windowsHide:true});children.add(child);let out='',error='';child.stdout.on('data',v=>{out+=v.toString('utf8');if(out.length>65536)child.kill('SIGTERM')});child.stderr.on('data',v=>{error+=v.toString('utf8');if(error.length>65536)child.kill('SIGTERM')});const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{children.delete(child);resolve({code,signal})})});if(input!==undefined)child.stdin.end(input);else child.stdin.end();return{child,exited,output:()=>({out,error})}}
 async function bounded(p,ms=30000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native_local_cli_fixture_timeout')),ms)})])}finally{clearTimeout(timer)}}
 async function command(name,input,expect=0){const job=start(name,input),result=await bounded(job.exited);assert.equal(result.code,expect,name+' command failed; bounded codes='+JSON.stringify(nativeLocalCliFailureCodes(job.output().error)));return job}
 async function eventually(read,accept,ms=40000){const end=Date.now()+ms;let last;while(Date.now()<end){last=await read();if(accept(last))return last;await timers.setTimeout(150)}throw Error('native_local_cli_actual_state_not_observed')}
 const owner=async(body,path='/api/v2/local-devices')=>{const r=await f.request('alice',path,body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body}
 async function readJob(id){return owner(undefined,'/api/v2/local-devices/jobs/'+id)}
 let online,device,auth
 t.after(async()=>{for(const child of children)child.kill('SIGTERM');await bounded(Promise.all([...children].map(child=>new Promise(resolve=>child.once('exit',resolve)))),10000).catch(()=>{});if(children.size){for(const child of children)child.kill('SIGKILL');await bounded(Promise.all([...children].map(child=>new Promise(resolve=>child.once('exit',resolve)))),5000)}assert.equal(children.size,0,'all owned CLI children must terminate');await f.close();assert.equal(path.dirname(await fs.realpath(directory)),parent);assert.ok(path.basename(directory).startsWith('native-local-cli-genuine-'));await fs.rm(directory,{recursive:true,force:true})})
 await t.test('real pair ACK loss keeps original token on disk and explicit pair-confirm recovers same binding',async()=>{
  const created=await owner({action:'create',request_id:crypto.randomUUID(),name:'Actual independent CI executor'});device=created.receipt.id;f.mutable.dropNext={method:'POST',path:'/api/public/native-local-executor/pair'}
  const pairing=start('pair',created.pairing_code+'\n'),result=await bounded(pairing.exited);assert.notEqual(result.code,0);const pending=JSON.parse(await fs.readFile(credentialPath,'utf8'));assert.equal(pending.stage,'pair_pending');assert.match(pending.device_token,/^[a-f0-9]{64}$/)
  const committed=(await f.db.query('SELECT token_hash,pair_request_id::text,pair_hash IS NULL AS code_consumed FROM agentstudio.native_local_devices WHERE id=$1',[device])).rows[0];assert.equal(committed.pair_request_id,pending.request_id);assert.equal(committed.code_consumed,true);assert.equal(committed.token_hash===crypto.createHash('sha256').update('native-local-device-v1:'+pending.device_token).digest('hex'),true,'the actual original pair must commit before its ACK is lost')
  const before=await f.counts();await command('pair-confirm');auth=JSON.parse(await fs.readFile(credentialPath,'utf8'));assert.equal(auth.stage,'paired');assert.equal(auth.id,device);assert.equal(auth.device_token,pending.device_token);assert.equal(Object.hasOwn(auth,'pairing_code'),false);assert.deepEqual(await f.counts(),before)
 })
 await t.test('actual CLI heartbeat publishes its real catalog and preserves secret boundaries',async()=>{
  online=start('run');await eventually(()=>owner(),items=>items.some(d=>d.id===device&&d.catalog.some(t=>t.name==='office.create_report')&&d.catalog.some(t=>t.name==='probe.commit_once')))
  const list=await owner();assert.equal(JSON.stringify(list).includes(auth.device_token),false);assert.equal((await f.request('bob','/api/v2/local-devices')).body.length,0)
 })
 const enqueue=async input=>(await owner({action:'enqueue',request_id:crypto.randomUUID(),id:device,input,confirm:true})).receipt.id
 await t.test('actual file write then lost completion ACK recovers by original journal UUID and never writes again',async()=>{
  f.mutable.dropNext={method:'POST',path:'/api/public/native-local-executor/complete'};const id=await enqueue({tool:'files.write',arguments:{root:'work',path:'once.txt',text:'Actual independent once'}})
  await eventually(()=>readJob(id),j=>j.status==='succeeded');const exit=await bounded(online.exited);assert.notEqual(exit.code,0);const entries=await fs.readdir(directory),journals=entries.filter(n=>n.startsWith('credentials-native-')&&n.endsWith('.journal.json'));assert.equal(journals.length,1)
  const journalPath=path.join(directory,journals[0]),pending=JSON.parse(await fs.readFile(journalPath,'utf8'));assert.equal(pending.stage,'completion_pending');assert.equal(pending.completion.id,id);const uuid=pending.completion.request_id,bytes=await fs.readFile(path.join(work,'once.txt')),stat=await fs.stat(path.join(work,'once.txt')),before=await f.counts()
  const blocked=start('run');assert.notEqual((await bounded(blocked.exited)).code,0);assert.ok(blocked.output().error.includes('native_local_completion_recovery_required'));assert.equal(JSON.parse(await fs.readFile(journalPath,'utf8')).completion.request_id,uuid)
  await command('recover');const recovered=JSON.parse(await fs.readFile(journalPath,'utf8'));assert.equal(recovered.stage,'idle');assert.equal(recovered.last_receipt.request_id,uuid);assert.equal(recovered.last_receipt.replayed,true);assert.deepEqual(await f.counts(),before);assert.deepEqual(await fs.readFile(path.join(work,'once.txt')),bytes);assert.equal((await fs.stat(path.join(work,'once.txt'))).mtimeMs,stat.mtimeMs)
  assert.equal((await f.db.query("SELECT count(*)::int n FROM agentstudio.audit_events WHERE action='local.job.complete' AND target_id=$1",[id])).rows[0].n,1)
  online=start('run');await eventually(()=>owner(),items=>items.some(d=>d.id===device&&Date.now()-d.seen_ms<5000))
 })
 await t.test('independent process creates real XLSX/DOCX/JSON from actual source bytes and exact tool hash',async()=>{
  const {officeSampleCsv}=await import('../../../src/lib/pgNativeOfficeWorkflow.ts'),source=Buffer.from(officeSampleCsv);await fs.writeFile(path.join(work,'sample-ledger.csv'),source,{flag:'wx'});const args={root:'work',source_path:'sample-ledger.csv',group_by:'部门',amount_column:'金额',decimal_places:2}
  async function execute(input){const id=await enqueue(input),j=await eventually(()=>readJob(id),j=>!['queued','running'].includes(j.status));assert.equal(j.status,'succeeded');return j.result.text}
  const summary=JSON.parse(await execute({tool:'office.table_summary',arguments:args}));assert.equal(summary.total,'2500.00');assert.equal(summary.row_count,5);assert.equal(summary.source_sha256,crypto.createHash('sha256').update(source).digest('hex'))
  await execute({tool:'office.create_report',arguments:{...args,expected_sha256:summary.source_sha256,output_directory:'native-report',title:'独立执行器实际报告',period:'合成测试'}})
  const manifest=JSON.parse(await execute({tool:'files.read',arguments:{root:'work',path:'native-report/summary.json'}}));assert.equal(manifest.source_sha256,summary.source_sha256);assert.equal(manifest.total,'2500.00');assert.equal(manifest.row_count,5)
  const Excel=(await import('exceljs')).default,book=new Excel.Workbook();await book.xlsx.readFile(path.join(work,'native-report/summary.xlsx'));let cells='';for(const sheet of book.worksheets)sheet.eachRow(row=>{cells+=JSON.stringify(row.values)});assert.ok(cells.includes('2500'));assert.ok(cells.includes(summary.source_sha256))
  const Zip=(await import('jszip')).default,zip=await Zip.loadAsync(await fs.readFile(path.join(work,'native-report/report.docx'))),xml=await zip.file('word/document.xml').async('string');assert.ok(xml.includes('2500.00'));assert.ok(xml.includes(summary.source_sha256));assert.deepEqual(await fs.readFile(path.join(work,'sample-ledger.csv')),source)
 })
 await t.test('crash after durable started marker cannot resume/re-poll/re-execute the unknown effect',async()=>{
  const id=await enqueue({tool:'probe.commit_once',arguments:{label:'Gated crash case'}}),entries=await fs.readdir(directory),journalPath=path.join(directory,entries.find(n=>n.startsWith('credentials-native-')&&n.endsWith('.journal.json')))
  await eventually(async()=>JSON.parse(await fs.readFile(journalPath,'utf8')),j=>j.stage==='executing'&&j.id===id);await eventually(()=>fs.readFile(gate+'.entered','utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e}),pid=>typeof pid==='string'&&/^[1-9][0-9]*$/.test(pid));assert.equal((await readJob(id)).status,'running');online.child.kill('SIGKILL');await bounded(online.exited)
  // SIGKILL cannot run the CLI finally block. Reclaim ONLY this fixture's lock
  // after its exact owned PID has exited, so the durable journal (rather than
  // an unrelated EEXIST lock failure) is what actually refuses execution.
  assert.equal(children.has(online.child),false);const lockPath=journalPath.replace(/\.journal\.json$/,'.lock');assert.equal(await fs.readFile(lockPath,'utf8'),String(online.child.pid));await fs.unlink(lockPath)
  const before=f.events.filter(e=>e.path==='/api/public/native-local-executor/poll').length,refused=start('run');assert.notEqual((await bounded(refused.exited)).code,0);assert.ok(refused.output().error.includes('native_local_effect_started_unknown_do_not_replay'));assert.equal(f.events.filter(e=>e.path==='/api/public/native-local-executor/poll').length,before);assert.equal(JSON.parse(await fs.readFile(journalPath,'utf8')).stage,'executing')
  await assert.rejects(()=>fs.access(path.join(work,'gated-once.txt')),e=>e.code==='ENOENT');await owner({action:'cancel',request_id:crypto.randomUUID(),id,confirm:true});assert.equal((await readJob(id)).status,'cancelled');await owner({action:'revoke',request_id:crypto.randomUUID(),id:device,confirm:true})
 })
})
