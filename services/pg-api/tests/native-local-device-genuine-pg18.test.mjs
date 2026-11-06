import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {requireNativeLocalDeviceGenuineCi} from './helpers/native-local-device-genuine-guard.mjs'
requireNativeLocalDeviceGenuineCi()
test('actual Native Cookie → PG067 → leased local executor → source/artifacts and original receipts',async t=>{
 const {nativeLocalDeviceGenuineFixture}=await import('./helpers/native-local-device-genuine-fixture.mjs'),f=await nativeLocalDeviceGenuineFixture();t.after(()=>f.close())
 const [fs,path,os,runtimeModule,resultModule,officeModule]=await Promise.all([import('node:fs/promises'),import('node:path'),import('node:os'),import('../../../local-executor/runtime.mjs'),import('../../../shared/native-local-device-contract.mjs'),import('../../../src/lib/pgNativeOfficeWorkflow.ts')])
 const parent=await fs.realpath(os.tmpdir()),workspace=await fs.mkdtemp(path.join(parent,'native-local-genuine-'));t.after(async()=>{assert.equal(path.dirname(await fs.realpath(workspace)),parent);assert.ok(path.basename(workspace).startsWith('native-local-genuine-'));await fs.rm(workspace,{recursive:true,force:true})})
 const credentialsFile=path.join(workspace,'.local-device-credentials.json');await fs.writeFile(credentialsFile,'synthetic-private-local-token',{flag:'wx',mode:0o600})
 const runtime=await runtimeModule.createRuntime({roots:[{name:'work',path:workspace}],office:{enabled:true},deniedPaths:[credentialsFile]});t.after(()=>runtime.close())
 const catalog=resultModule.parseLocalCatalog(runtime.tools.map(x=>({...x,description:String(x.description??'').slice(0,600)}))),root='/api/v2/local-devices'
 const ok=async(who,body,path=root)=>{const r=await f.request(who,path,body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body}
 const create=async(who='alice')=>{const intent={action:'create',request_id:randomUUID(),name:'Synthetic local '+who},reply=await ok(who,intent);return{intent,reply,id:reply.receipt.id}}
 const pair=async(made)=>{const token=randomBytes(32).toString('hex'),intent={request_id:randomUUID(),pairing_code:made.reply.pairing_code,device_token:token},response=await f.executor(null,'pair',intent);assert.equal(response.status,200);return{token,intent,reply:response.body}}
 let made,paired
 await t.test('real Cookie and Origin are required; forged identity header and bearer cannot grant ownership',async()=>{
  const before=await f.counts();assert.equal((await f.request('none',root)).status,401);assert.equal((await f.request('alice',root,undefined,{headers:{'X-Rh-User-Id':f.users.bob}})).status,403);assert.equal((await f.request('alice',root,{action:'create',request_id:randomUUID(),name:'bad'},{headers:{Origin:'https://other.example'}})).status,403);assert.deepEqual(await f.counts(),before)
 })
 await t.test('create acknowledgement loss recovers only original UUID and never redisplays raw pairing code',async()=>{
  const intent={action:'create',request_id:randomUUID(),name:'Lost ACK device'},before=await f.counts();f.mutable.dropNext={method:'POST',path:root};await assert.rejects(()=>f.request('alice',root,intent));const recovered=await ok('alice',intent,root+'/confirm');assert.equal(recovered.replayed,true);assert.equal(recovered.pairing_code,null);assert.equal((await f.counts()).devices,before.devices+1);assert.equal((await ok('alice',intent)).receipt.id,recovered.receipt.id)
  await ok('alice',{action:'revoke',request_id:randomUUID(),id:recovered.receipt.id,confirm:true})
 })
 await t.test('pair is one-use, original UUID+locally persisted token recovers ACK loss and no token enters reply',async()=>{
  made=await create();const token=randomBytes(32).toString('hex'),intent={request_id:randomUUID(),pairing_code:made.reply.pairing_code,device_token:token};f.mutable.dropNext={method:'POST',path:'/api/public/native-local-executor/pair'};await assert.rejects(()=>f.executor(null,'pair',intent));const recovered=await f.executor(null,'pair-confirm',intent);assert.equal(recovered.status,200);assert.equal(recovered.body.id,made.id);assert.equal(recovered.body.replayed,true);assert.doesNotMatch(JSON.stringify(recovered.body),/token|pairing_code/);paired={token,intent,reply:recovered.body}
  assert.equal((await f.executor(null,'pair',{...intent,request_id:randomUUID(),device_token:randomBytes(32).toString('hex')})).status,403)
  const privateRow=(await f.db.query('SELECT pair_hash,token_hash FROM agentstudio.native_local_devices WHERE id=$1',[made.id])).rows[0];assert.equal(privateRow.pair_hash,null);assert.notEqual(privateRow.token_hash,token);assert.equal(privateRow.token_hash,createHash('sha256').update('native-local-device-v1:'+token).digest('hex'))
 })
 await t.test('executor protocol refuses employee Cookie, browser Origin, forged identity and malformed catalog',async()=>{
  const body={catalog,claim:randomBytes(32).toString('hex')};for(const headers of [{Origin:f.allowedOrigin},{Cookie:f.cookies.get('alice')},{'X-Rh-User-Id':f.users.alice}])assert.equal((await f.executor(paired.token,'poll',body,{headers})).status,403)
  assert.equal((await f.executor(paired.token,'poll',{...body,catalog:[...catalog,...catalog]})).status,400);assert.equal((await f.executor(paired.token,'poll',body)).status,200)
  const visible=await ok('alice');assert.ok(visible.some(x=>x.id===made.id));assert.equal((await ok('bob')).length,0);assert.doesNotMatch(JSON.stringify(visible),/token_hash|pair_hash|device_token|pairing_code/)
 })
 let writeIntent,job,claim
 await t.test('manual action requires explicit confirmation, actual catalog schema and owner scope; same UUID creates one job',async()=>{
  writeIntent={action:'enqueue',request_id:randomUUID(),id:made.id,input:{tool:'files.write',arguments:{root:'work',path:'actual-once.txt',text:'Native PG actual once'}},confirm:true}
  assert.equal((await f.request('alice',root,{...writeIntent,confirm:false})).status,400);assert.equal((await f.request('bob',root,writeIntent)).status,409)
  assert.equal((await f.request('alice',root,{...writeIntent,request_id:randomUUID(),input:{tool:'shell.exec',arguments:{command:'not-allowed'}}})).status,409)
  assert.equal((await f.request('alice',root,{...writeIntent,request_id:randomUUID(),input:{tool:'files.write',arguments:{root:'work',path:'invalid.txt',text:17}}})).status,400)
  const before=await f.counts(),reply=await ok('alice',writeIntent);job=await ok('alice',undefined,root+'/jobs/'+reply.receipt.id);assert.equal(job.status,'queued');assert.equal((await ok('alice',writeIntent)).receipt.id,job.id);assert.equal((await f.counts()).jobs,before.jobs+1);assert.equal((await f.request('alice',root,{...writeIntent,input:{...writeIntent.input,arguments:{...writeIntent.input.arguments,text:'changed'}}})).status,409)
  assert.equal((await f.request('bob',root+'/jobs/'+job.id)).status,404)
 })
 await t.test('concurrent polls have one exclusive claim and lost poll ACK recovers only that original claim',async()=>{
  const claims=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')],replies=await Promise.all(claims.map(c=>f.executor(paired.token,'poll',{catalog,claim:c})));assert.deepEqual(replies.map(r=>r.status),[200,200]);assert.equal(replies.filter(r=>r.body.job).length,1);const winner=replies.findIndex(r=>r.body.job);claim=claims[winner];assert.equal(replies[winner].body.job.id,job.id);assert.equal((await f.executor(paired.token,'poll',{catalog,claim})).body.job.id,job.id);assert.equal((await f.executor(paired.token,'check',{id:job.id,claim:claims[1-winner]})).body.active,false)
 })
 await t.test('actual bounded file effect completes once; lost completion ACK recovers immutable original receipt',async()=>{
  assert.equal((await f.executor(paired.token,'check',{id:job.id,claim})).body.active,true);const result=resultModule.parseLocalResult(await runtime.execute(job.input,AbortSignal.timeout(65000)));assert.equal(await fs.readFile(path.join(workspace,'actual-once.txt'),'utf8'),'Native PG actual once')
  const completion={request_id:randomUUID(),id:job.id,claim,ok:true,result};f.mutable.dropNext={method:'POST',path:'/api/public/native-local-executor/complete'};await assert.rejects(()=>f.executor(paired.token,'complete',completion));const recovered=await f.executor(paired.token,'confirm',completion);assert.equal(recovered.status,200);assert.equal(recovered.body.replayed,true);assert.equal(recovered.body.request_id,completion.request_id);assert.equal((await ok('alice',undefined,root+'/jobs/'+job.id)).status,'succeeded');assert.equal((await f.executor(paired.token,'complete',completion)).status,200);assert.equal((await f.db.query("SELECT count(*)::int n FROM agentstudio.audit_events WHERE action='local.job.complete' AND target_id=$1",[job.id])).rows[0].n,1)
  await assert.rejects(()=>runtime.execute(job.input,AbortSignal.timeout(65000)));assert.equal(await fs.readFile(path.join(workspace,'actual-once.txt'),'utf8'),'Native PG actual once')
 })
 await t.test('credential, path traversal, symlink, hardlink and arbitrary app commands remain denied by actual runtime',async()=>{
  const orphan='credentials-native-write-'+randomUUID()+'.tmp';await fs.writeFile(path.join(workspace,orphan),'synthetic-orphan-pair-token',{flag:'wx',mode:0o600})
  for(const file of ['../outside.txt','.local-device-credentials.json',orphan,'.env','C:/secrets.txt'])await assert.rejects(()=>runtime.execute({tool:'files.read',arguments:{root:'work',path:file}},AbortSignal.timeout(5000)))
  await fs.symlink(credentialsFile,path.join(workspace,'linked.txt'));await assert.rejects(()=>runtime.execute({tool:'files.read',arguments:{root:'work',path:'linked.txt'}},AbortSignal.timeout(5000)))
  await fs.link(credentialsFile,path.join(workspace,'hard.txt'));await assert.rejects(()=>runtime.execute({tool:'files.read',arguments:{root:'work',path:'hard.txt'}},AbortSignal.timeout(5000)))
  await assert.rejects(()=>runtime.execute({tool:'apps.launch',arguments:{app:'arbitrary-command',command:'not-executed'}},AbortSignal.timeout(5000)))
 })
 const execute=async(input)=>{
  const intent={action:'enqueue',request_id:randomUUID(),id:made.id,input,confirm:true},reply=await ok('alice',intent),claim=randomBytes(32).toString('hex'),polled=await f.executor(paired.token,'poll',{catalog,claim});assert.equal(polled.status,200);assert.equal(polled.body.job.id,reply.receipt.id);assert.equal((await f.executor(paired.token,'check',{id:reply.receipt.id,claim})).body.active,true)
  const result=resultModule.parseLocalResult(await runtime.execute(polled.body.job.input,AbortSignal.timeout(65000))),completion={request_id:randomUUID(),id:reply.receipt.id,claim,ok:true,result};assert.equal((await f.executor(paired.token,'complete',completion)).status,200);return result
 }
 await t.test('actual CSV source hash → summary → new XLSX/DOCX/JSON artifacts → manifest read-back',async()=>{
  const source=Buffer.from(officeModule.officeSampleCsv);await fs.writeFile(path.join(workspace,'sample-ledger.csv'),source,{flag:'wx'});const args={root:'work',source_path:'sample-ledger.csv',group_by:'部门',amount_column:'金额',decimal_places:2},summary=JSON.parse((await execute({tool:'office.table_summary',arguments:args})).text);assert.equal(summary.total,'2500.00');assert.equal(summary.row_count,5);assert.equal(summary.source_sha256,createHash('sha256').update(source).digest('hex'))
  await execute({tool:'office.create_report',arguments:{...args,expected_sha256:summary.source_sha256,output_directory:'report-one',title:'实际隔离报告',period:'合成测试'}})
  const manifest=JSON.parse((await execute({tool:'files.read',arguments:{root:'work',path:'report-one/summary.json'}})).text);assert.equal(manifest.source_sha256,summary.source_sha256);assert.equal(manifest.total,'2500.00');assert.equal(manifest.row_count,5);assert.deepEqual(manifest.groups.map(g=>[g.group,g.total]).sort(),[['研发','450.00'],['运营','750.00'],['销售','1300.00']].sort())
  const Excel=(await import('exceljs')).default,book=new Excel.Workbook();await book.xlsx.readFile(path.join(workspace,'report-one/summary.xlsx'));const all=book.worksheets.flatMap(ws=>{const rows=[];ws.eachRow(row=>rows.push(JSON.stringify(row.values)));return rows}).join('\n');assert.ok(all.includes('2500'));assert.ok(all.includes(summary.source_sha256))
  const Zip=(await import('jszip')).default,zip=await Zip.loadAsync(await fs.readFile(path.join(workspace,'report-one/report.docx'))),xml=await zip.file('word/document.xml').async('string');assert.ok(xml.includes('2500.00'));assert.ok(xml.includes(summary.source_sha256));assert.equal(createHash('sha256').update(await fs.readFile(path.join(workspace,'sample-ledger.csv'))).digest('hex'),summary.source_sha256)
 })
 await t.test('Office creation is actual private Agent data with original UUID recovery, approval flags and no automatic run',async()=>{
  const intent={action:'create_office',request_id:randomUUID(),name:'Native actual Office Agent'},before=await f.counts();f.mutable.dropNext={method:'POST',path:root};await assert.rejects(()=>f.request('alice',root,intent));const recovered=await ok('alice',intent,root+'/confirm'),agent=await f.agents.get(await f.identityFor('alice'),recovered.receipt.id);assert.ok(agent);assert.equal(agent.spec.require_approval,true);assert.equal(agent.spec.require_plan_review,true);assert.deepEqual(agent.spec.tools,['local_computer']);assert.equal((await f.counts()).agents,before.agents+1);assert.equal(await f.agents.get(await f.identityFor('bob'),agent.id),null)
 })
 await t.test('new writes off still permits original create/pair/completion confirmations and never remints secrets',async()=>{
  f.mutable.writes=false;assert.equal((await ok('alice',made.intent,root+'/confirm')).pairing_code,null);assert.equal((await f.executor(null,'pair-confirm',paired.intent)).status,200);assert.equal((await f.request('alice',root,{action:'create',request_id:randomUUID(),name:'disabled'})).status,403);f.mutable.writes=true
 })
 await t.test('revoke cancels queued/running tasks and permanently invalidates the old device token',async()=>{
  const reply=await ok('alice',{action:'enqueue',request_id:randomUUID(),id:made.id,input:{tool:'files.read',arguments:{root:'work',path:'sample-ledger.csv'}},confirm:true}),claim=randomBytes(32).toString('hex');assert.equal((await f.executor(paired.token,'poll',{catalog,claim})).body.job.id,reply.receipt.id);const intent={action:'revoke',request_id:randomUUID(),id:made.id,confirm:true};await ok('alice',intent);assert.equal((await ok('alice',undefined,root+'/jobs/'+reply.receipt.id)).status,'cancelled');assert.equal((await f.executor(paired.token,'check',{id:reply.receipt.id,claim})).status,403);assert.equal((await ok('alice',intent)).replayed,true)
 })
 await t.test('real120-second deadline produces unknown for claimed work and expired for unclaimed work, never requeue',async()=>{
  const m=await create(),a=await pair(m);await f.executor(a.token,'poll',{catalog,claim:randomBytes(32).toString('hex')});const input={tool:'files.read',arguments:{root:'work',path:'sample-ledger.csv'}},first=await ok('alice',{action:'enqueue',request_id:randomUUID(),id:m.id,input,confirm:true}),second=await ok('alice',{action:'enqueue',request_id:randomUUID(),id:m.id,input,confirm:true}),claim=randomBytes(32).toString('hex');assert.equal((await f.executor(a.token,'poll',{catalog,claim})).body.job.id,first.receipt.id);const original=await ok('alice',undefined,root+'/jobs/'+second.receipt.id)
  const {setTimeout:delay}=await import('node:timers/promises');await delay(Math.max(1,original.deadline_ms-Date.now()+100));assert.equal((await ok('alice',undefined,root+'/jobs/'+first.receipt.id)).status,'unknown');assert.equal((await ok('alice',undefined,root+'/jobs/'+second.receipt.id)).status,'expired');assert.equal((await f.executor(a.token,'poll',{catalog,claim})).body.job,null)
 })
 await t.test('employee disable/re-enable is an actual epoch fence and cannot revive earlier pair/token authority',async()=>{
  const m=await create('bob'),a=await pair(m);await f.executor(a.token,'poll',{catalog,claim:randomBytes(32).toString('hex')})
  async function change(enabled){const inventory=await f.request('alice','/api/native-auth/employees');assert.equal(inventory.status,200);const row=inventory.body.items.find(x=>x.id===f.users.bob);assert.ok(row);const result=await f.request('alice','/api/native-auth/employees/change',{request_id:randomUUID(),target_id:row.id,expected_revision:row.revision,is_admin:row.is_admin,enabled,share_enabled:row.share_enabled??true,confirm:true});assert.equal(result.status,200)}
  await change(false);assert.equal((await f.request('bob',root)).status,401);assert.equal((await f.executor(a.token,'poll',{catalog,claim:randomBytes(32).toString('hex')})).status,403);await change(true);await f.login('bob');assert.equal((await f.executor(a.token,'poll',{catalog,claim:randomBytes(32).toString('hex')})).status,409);const old=(await ok('bob')).find(d=>d.id===m.id);assert.equal(old.seen_ms,0);assert.deepEqual(old.catalog,[]);await ok('bob',{action:'revoke',request_id:randomUUID(),id:m.id,confirm:true})
 })
})
