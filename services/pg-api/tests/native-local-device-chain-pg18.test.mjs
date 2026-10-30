// Genuine chain acceptance source; never imported by an ordinary/local test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireNativeLocalDeviceGenuineCi} from './helpers/native-local-device-genuine-guard.mjs'
requireNativeLocalDeviceGenuineCi()
test('original Autonomous Worker -> real private mTLS Broker -> independent CLI -> Office/browser -> three-format model network receipt',{timeout:600000},async t=>{
 const {nativeLocalDeviceChainFixture}=await import('./helpers/native-local-device-chain-fixture.mjs'),f=await nativeLocalDeviceChainFixture();t.after(()=>f.close())
 const [fs,path,crypto]=await Promise.all([import('node:fs/promises'),import('node:path'),import('node:crypto')]),hash=b=>crypto.createHash('sha256').update(b).digest('hex')
 const before=f.providerEvents.length
 await t.test('actual private TLS peer and strict handler refuse Cookie/identity before DB/model dispatch',async()=>{
  await assert.rejects(()=>f.privateDenied({},true));assert.equal(await f.privateDenied({Cookie:'forged-employee-cookie'}),404);assert.equal(await f.privateDenied({'X-Rh-User-Id':f.users.alice}),404);assert.equal(f.privateEvents.length,0);assert.equal(f.providerEvents.length,before)
 })
 const admitted=await f.prepare(),id=admitted.run.id
 await t.test('queued role and unapproved parent cannot create local effects or model POSTs',async()=>{
  assert.equal(admitted.worker_started_by_api,false);assert.equal(admitted.local_device_id,f.cli.deviceId());assert.equal(f.providerEvents.filter(e=>e.phase==='generate').length,0)
  assert.equal((await f.tick()).status,'awaiting_approval');assert.equal((await f.get(id)).pending_effect.kind,'agent');await f.tick();assert.equal(f.providerEvents.filter(e=>e.phase==='generate').length,0);assert.equal((await f.db.query('SELECT count(*)::int n FROM agentstudio.native_local_jobs WHERE run_id=$1',[id])).rows[0].n,0)
 })
 await f.approve(id);const done=await f.drive(id)
 await t.test('original Worker replacements finish only after actual per-step and human approvals',async()=>{
  assert.equal(done.run.status,'succeeded',JSON.stringify(f.diagnostics()));assert.match(done.run.result_text,/2500\.00/);assert.equal(done.human_input_evidence_current,true);assert.equal(f.failures.length,0,JSON.stringify(f.failures));assert.equal(f.receipts.length,1)
  const posts=f.providerEvents.filter(e=>e.phase==='generate');assert.deepEqual(posts.map(e=>e.round),[1,2,3,4,5,6,7,8,9,10]);assert.equal(new Set(posts.map(e=>e.step_key)).size,10);assert.equal(f.credentialEvents.length,10);assert.equal(f.privateEvents.filter(e=>e.kind==='model').length,10);assert.equal(f.privateEvents.filter(e=>e.kind==='tool').length,8)
  const history=await f.request('alice','/api/v2/agent-autonomous-runs/'+id+'/human-history');assert.equal(history.status,200);assert.ok(history.body.items.some(r=>r.kind==='plan_review'&&r.decision==='approve'))
  const approval=(await f.db.query('SELECT status,reason_code FROM agentstudio.approvals WHERE run_id=$1',[id])).rows;assert.equal(approval.length,19);assert.equal(approval.every(a=>a.status==='approved'&&/^wf2:[a-f0-9]{64}$/.test(a.reason_code)),true)
 })
 const jobs=(await f.db.query('SELECT id,input,result,status,run_id,device_id FROM agentstudio.native_local_jobs WHERE run_id=$1 ORDER BY created_at,id',[id])).rows
 await t.test('actual independent Office/browser effects and posted form values agree with original bytes',async()=>{
  assert.deepEqual(jobs.map(j=>j.input.tool),['office.table_summary','office.create_report','files.read','browser.browser_navigate','browser.browser_take_screenshot','browser.browser_fill_form','browser.browser_click','browser.browser_take_screenshot']);assert.equal(jobs.every(j=>j.status==='succeeded'&&j.device_id===f.cli.deviceId()),true)
  const manifest=JSON.parse(await fs.readFile(path.join(f.cli.work,'native-chain-report/summary.json'),'utf8'));assert.equal(manifest.total,'2500.00');assert.equal(manifest.row_count,5);assert.equal(manifest.source_sha256,f.sourceSha);assert.deepEqual(await fs.readFile(path.join(f.cli.work,'sample-ledger.csv')),f.source)
  const Excel=(await import('exceljs')).default,book=new Excel.Workbook();await book.xlsx.readFile(path.join(f.cli.work,'native-chain-report/summary.xlsx'));let cells='';for(const sheet of book.worksheets)sheet.eachRow(row=>{cells+=JSON.stringify(row.values)});assert.ok(cells.includes('2500')&&cells.includes(f.sourceSha))
  const Zip=(await import('jszip')).default,zip=await Zip.loadAsync(await fs.readFile(path.join(f.cli.work,'native-chain-report/report.docx'))),xml=await zip.file('word/document.xml').async('string');assert.ok(xml.includes('2500.00')&&xml.includes(f.sourceSha));assert.equal(f.receipts[0].amount,'2500.00');assert.equal(f.receipts[0].source_sha256,f.sourceSha);assert.ok(jobs[6].result.text.includes(f.receipts[0].id))
 })
 await t.test('actual screenshot bytes reach only the matching current model wire and never checkpoint/audit/another owner',async()=>{
  const shots=jobs.filter(j=>j.result.images.length);assert.equal(shots.length,2)
  for(const [round,index]of [[6,0],[9,1],[10,1]]){const event=f.providerEvents.find(e=>e.phase==='generate'&&e.round===round),image=shots[index].result.images[0];assert.equal(event.provider,f.provider);assert.equal(event.run_id,id);assert.equal(event.images.length,1);assert.equal(event.images[0].sha256,hash(Buffer.from(image.data,'base64')))}
  const raw=(await f.db.query('SELECT checkpoint FROM agentstudio.runs WHERE id=$1',[id])).rows[0],audit=JSON.stringify((await f.db.query('SELECT metadata FROM agentstudio.audit_events WHERE run_id=$1',[id])).rows),visible=JSON.stringify(done),token=await f.cli.localCredentialToken();for(const image of shots.map(j=>j.result.images[0])){assert.equal(JSON.stringify(raw).includes(image.data),false);assert.equal(audit.includes(image.data),false);assert.equal(visible.includes(image.data),false)}assert.equal(visible.includes(token),false);assert.equal(audit.includes(token),false);assert.equal(audit.includes('synthetic-native-chain-'),false)
  assert.equal((await f.request('bob','/api/v2/agent-autonomous-runs/'+id)).status,404);for(const job of shots)assert.equal((await f.request('bob','/api/v2/local-devices/jobs/'+job.id)).status,404)
 })
 await t.test('finished lease replay has no second provider POST or browser submit',async()=>{
  const posts=f.providerEvents.length,credentials=f.credentialEvents.length;await assert.rejects(()=>f.replayLastModel());assert.equal((await f.tick()).status,'idle');assert.equal(f.providerEvents.length,posts);assert.equal(f.credentialEvents.length,credentials);assert.equal(f.receipts.length,1)
  const effects=(await f.db.query('SELECT status FROM agentstudio.external_effects WHERE run_id=$1',[id])).rows;assert.ok(effects.length>30);assert.equal(effects.every(e=>e.status==='succeeded'),true)
 })
})
