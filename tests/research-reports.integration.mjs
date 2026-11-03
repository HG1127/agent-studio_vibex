// Real isolated PB/SQLite and actual Node renderer. All data is synthetic DEMO.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {spawn} from 'node:child_process'
import {randomBytes,createHash} from 'node:crypto'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
import {reportFixture} from './fixtures/research-report.mjs'
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-reports-')),setupKey=randomBytes(32).toString('hex'),workerKey=randomBytes(32).toString('hex')
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})}),origin=`http://127.0.0.1:${port}`
const workerHeaders={'X-Agent-Studio-Worker-Token':workerKey},sha=b=>createHash('sha256').update(b).digest('hex')
let pb,logs=''
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function start(){pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve',`--http=127.0.0.1:${port}`,`--dir=${temp}`,`--hooksDir=${path.join(root,'pocketbase/pb_hooks')}`],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:setupKey,AGENT_STUDIO_WORKER_TOKEN:workerKey,AGENT_STUDIO_BACKGROUND_WORKER:'true',AGENT_STUDIO_WORKER_INTERNAL_URL:origin}})
  pb.stdout.on('data',b=>{logs=(logs+b).slice(-12000)});pb.stderr.on('data',b=>{logs=(logs+b).slice(-12000)})
  for(let n=0;n<150;n++){try{if((await fetch(origin+'/api/health')).ok)return}catch{}await sleep(100)}throw Error('PB not ready: '+logs.slice(-3000))}
async function api(method,route,body,token='',headers={}){const res=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});return {status:res.status,data:await res.json()}}
async function ok(method,route,body,token='',status=200,headers={}){const r=await api(method,route,body,token,headers);assert.equal(r.status,status,route+' '+JSON.stringify(r));return r.data}
async function worker(extra={}){await new Promise((resolve,reject)=>{const c=spawn(process.execPath,['worker/run.mjs','--once','--quiet'],{cwd:root,windowsHide:true,env:{...process.env,AGENT_STUDIO_WORKER_URL:origin,AGENT_STUDIO_WORKER_TOKEN:workerKey,...extra}});let out='';c.stdout.on('data',b=>{out+=b});c.stderr.on('data',b=>{out+=b});c.once('error',reject);c.once('close',code=>code===0?resolve():reject(Error('Worker failed: '+out)))})}
try{
  await start();await ok('POST','/api/studio/bootstrap',{email:'owner@example.test',password:'Fixture-Password-2026',display_name:'Owner'},'',201,{'X-Agent-Studio-Setup-Key':setupKey})
  const owner=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'owner@example.test',password:'Fixture-Password-2026'})).token
  await ok('POST','/api/studio/users',{email:'reader@example.test',password:'Fixture-Password-2026',display_name:'Reader',role:'employee'},owner,201)
  const token=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'reader@example.test',password:'Fixture-Password-2026'})).token
  const base=await ok('POST','/api/knowledge-bases/manage',{action:'create',name:'Revocable report fixture'},owner)
  const grant=await ok('POST','/api/knowledge-bases/access',{action:'grant',base_id:base.id,recipient_email:'reader@example.test',role:'editor'},owner)
  const fixture=reportFixture().snapshot.payload,caseInfo=await ok('POST','/api/business/cases',{title:fixture.case.title,data_space:'DEMO',questions:fixture.case.questions.map(q=>q.question)},token,201),route=`/api/business/cases/${caseInfo.case_id}`
  const quote=fixture.records[2].source_refs[0].quote,material=await ok('POST',route+'/materials',{filename:'synthetic.txt',base64:Buffer.from(quote).toString('base64'),knowledge_base_id:base.id,idempotency_key:'fixture-material'},token)
  await worker();assert.equal((await ok('GET',`/api/business/jobs/${material.job_id}`,undefined,token)).status,'succeeded')
  const ref={material_id:material.material_id,segment_id:'block:1',start:0,end:quote.length,quote},ids=new Map(),records=[]
  for(const r of fixture.records){const payload=structuredClone(r.payload)
    for(const field of ['subject_id','from_id','to_id'])if(payload[field])payload[field]=ids.get(payload[field])
    if(payload.claim_ids)payload.claim_ids=payload.claim_ids.map(id=>ids.get(id))
    if(payload.question_id)payload.question_id=caseInfo.questions[0].question_id
    const record=await ok('POST',route+'/records',{schema_id:r.schema_id,expected_version:0,payload,source_refs:r.source_refs.length?[ref]:[],idempotency_key:'fixture-'+r.record_id},token)
    ids.set(r.record_id,record.record_id);records.push(record)
  }
  assert.equal((await ok('GET',route+'/quality?validator=research.relationships.v1',undefined,token)).business_quality,'needs_review')
  for(const r of records.filter(r=>['research.claim.v1','research.relation.v1'].includes(r.schema_id)))await ok('POST',route+'/reviews',{record_id:r.record_id,record_version:1,decision:'accepted',rationale:'Synthetic fixture: manually matched subject, predicate, time and original passage.'},token,201)
  const relationQuality=await ok('GET',route+'/quality?validator=research.relationships.v1',undefined,token);assert.equal(relationQuality.business_quality,'passed');assert.equal(relationQuality.strict_path_quality,'unverified')
  const invalid={schema_id:'research.relation.v1',expected_version:0,payload:{...records[3].payload,to_id:records[2].record_id},source_refs:[ref],idempotency_key:'invalid-endpoint'}
  assert.equal((await api('POST',route+'/records',invalid,token)).status,422)
  const freeze=await ok('POST',route+'/jobs',{type:'research.freeze.v1',idempotency_key:'freeze'},token)
  for(let n=0;n<4;n++)await ok('POST','/api/internal/worker/jobs-step',{},'',200,workerHeaders)
  const frozen=await ok('GET',`/api/business/jobs/${freeze.job_id}`,undefined,token);assert.equal(frozen.status,'succeeded')
  const fact=await ok('GET',route+`/fact-sets/${frozen.artifact.fact_set_id}`,undefined,token),files=[]
  assert.equal((await api('POST','/api/internal/worker/report-jobs/claim',{},token)).status,401)
  for(const template of ['research.brief.v1','research.full.v1','research.relationships.v1'])for(const format of ['docx','pdf','xlsx']){
    const input={fact_set_id:fact.fact_set_id,template_id:template,format,idempotency_key:'file-'+template+'-'+format}
    const pending=await ok('POST',route+'/reports',input,token);assert.equal(pending.status,'queued');assert.equal(pending.file_ready,false)
    assert.equal((await ok('POST',route+'/reports',input,token)).job_id,pending.job_id)
    assert.equal((await api('POST',route+'/reports',{...input,format:'html'},token)).status,409)
    assert.equal((await ok('GET',route+'/reports',undefined,token)).items.some(r=>r.report_id===pending.job_id),false)
    assert.equal((await api('GET',route+`/reports/${pending.job_id}/download`,undefined,token)).status,404)
    await worker()
    const state=await ok('GET',`/api/business/jobs/${pending.job_id}`,undefined,token);assert.equal(state.status,'succeeded',JSON.stringify(state))
    const receipt=await ok('POST',route+'/reports',input,token);assert.equal(receipt.file_ready,true);assert.equal(receipt.report_id,pending.job_id);assert.equal(receipt.manifest.fact_set_hash,fact.content_hash)
    assert.equal(receipt.manifest.quality_scope,template==='research.relationships.v1'?'declared_relation_records_only':'structured_question_records_only')
    const response=await fetch(origin+route+`/reports/${receipt.report_id}/download`,{headers:{Authorization:token}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-disposition'),new RegExp('\\.'+format+'"'))
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,receipt.manifest.byte_count);assert.equal(sha(bytes),receipt.manifest.binary_sha256)
    assert.equal(sha(bytes.toString('base64')),receipt.content_hash);assert.equal(bytes.subarray(0,format==='pdf'?5:2).toString(),format==='pdf'?'%PDF-':'PK')
    let extracted=''
    if(format==='docx')extracted=(await (await import('mammoth')).default.extractRawText({buffer:bytes})).value
    else if(format==='xlsx'){
      const ExcelJS=(await import('exceljs')).default,book=new ExcelJS.Workbook();await book.xlsx.load(bytes)
      for(const sheet of book.worksheets)sheet.eachRow(row=>row.eachCell(cell=>{assert.notEqual(cell.type,ExcelJS.ValueType.Formula);extracted+=cell.text+'\n'}))
      const evidence=book.getWorksheet('证据定位'),linked=new Set();evidence.eachRow((row,n)=>{if(n>7){assert.equal(row.getCell(7).text,quote);linked.add(row.getCell(4).text)}})
      for(const record of [records[2],records[3],records[4]])assert.ok(linked.has(record.record_id),'Every supported fact/relation/answer retains its evidence mapping')
    }else{
      const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:false,isEvalSupported:false})
      try{const doc=await task.promise;for(let page=1;page<=doc.numPages;page++)extracted+=(await (await doc.getPage(page)).getTextContent()).items.map(item=>item.str).join('')}finally{await task.destroy()}
    }
    for(const common of ['陈明','星河研究院','2024',fact.fact_set_id,fact.content_hash])assert.ok(extracted.includes(common),template+' '+format+' missing common fact '+common)
    assert.ok(extracted.includes(template==='research.relationships.v1'?'关系记录质量':'问题记录质量'),'Quality scope must remain explicit in every format')
    assert.equal((await fetch(origin+route+`/reports/${receipt.report_id}/download`,{headers:{Authorization:owner}})).status,404)
    files.push({receipt,hash:sha(bytes)})
    if(process.env.AGENT_STUDIO_REPORT_QA_DIR){const dest=path.resolve(process.env.AGENT_STUDIO_REPORT_QA_DIR),allowed=path.resolve(root,'.tmp/research-validation/reports');assert.equal(dest,allowed);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,template.split('.')[1]+'.'+format),bytes)}
  }
  for(const template of ['research.brief.v1','research.full.v1','research.relationships.v1'])for(const format of ['html','md']){
    const report=await ok('POST',route+'/reports',{fact_set_id:fact.fact_set_id,template_id:template,format,idempotency_key:'text-'+template+'-'+format},token)
    assert.equal(report.file_ready,true);assert.equal(report.manifest.fact_set_hash,fact.content_hash)
    const response=await fetch(origin+route+`/reports/${report.report_id}/download`,{headers:{Authorization:token}});assert.equal(response.status,200);const text=await response.text()
    for(const common of ['陈明','星河研究院','2024',fact.fact_set_id,fact.content_hash])assert.ok(text.includes(common),template+' '+format+' missing common fact '+common)
  }
  const input={fact_set_id:fact.fact_set_id,template_id:'research.full.v1',format:'docx',idempotency_key:'cancel-render'},cancelled=await ok('POST',route+'/reports',input,token)
  const lease=(await ok('POST','/api/internal/worker/report-jobs/claim',{},'',200,workerHeaders)).job;assert.equal(lease.job_id,cancelled.job_id)
  assert.equal((await ok('POST','/api/internal/worker/report-jobs/claim',{},'',200,workerHeaders)).job.idle,true)
  assert.equal((await api('POST','/api/internal/worker/report-jobs/complete',{job_id:lease.job_id,lease_token:'wrong-token',ok:false,error:'fixture'},'',workerHeaders)).status,409)
  await ok('POST',`/api/business/jobs/${lease.job_id}/cancel`,{},token)
  assert.equal((await api('POST','/api/internal/worker/report-jobs/complete',{job_id:lease.job_id,lease_token:lease.lease_token,ok:false,error:'fixture'},'',workerHeaders)).status,409)
  assert.equal((await api('GET',route+`/reports/${lease.job_id}/download`,undefined,token)).status,404)
  const failed=await ok('POST',route+'/reports',{...input,format:'pdf',idempotency_key:'font-failure'},token);await worker({AGENT_STUDIO_REPORT_FONT:'Z:/missing-font.ttf'})
  const failure=await ok('GET',`/api/business/jobs/${failed.job_id}`,undefined,token);assert.equal(failure.status,'failed');assert.equal(failure.error,'report_pdf_font_missing');assert.deepEqual(failure.artifact,{})
  const recovery=await ok('POST',route+'/reports',{...input,idempotency_key:'restart-render'},token)
  const abandoned=(await ok('POST','/api/internal/worker/report-jobs/claim',{},'',200,workerHeaders)).job;assert.equal(abandoned.job_id,recovery.job_id)
  await stopHeadlessPocketBase(pb)
  // Simulate lease expiry only in this stopped, owned disposable database.
  const {DatabaseSync}=await import('node:sqlite'),dbPath=path.join(temp,'data.db');assert.ok(path.resolve(dbPath).startsWith(path.resolve(temp)+path.sep))
  const db=new DatabaseSync(dbPath);db.prepare("UPDATE agent_studio_business_jobs SET lease_until=0 WHERE id=? AND status='running'").run(recovery.job_id);db.close()
  await start();await worker();const recovered=await ok('GET',`/api/business/jobs/${recovery.job_id}`,undefined,token);assert.equal(recovered.status,'succeeded');assert.equal(recovered.attempts,2)
  assert.equal((await api('POST','/api/internal/worker/report-jobs/complete',{job_id:abandoned.job_id,lease_token:abandoned.lease_token,ok:false,error:'late_attempt'},'',workerHeaders)).status,409)
  await ok('POST',route+'/records',{schema_id:records[0].schema_id,record_id:records[0].record_id,expected_version:1,payload:{...records[0].payload,canonical_name:'陈明（补充版本）'},source_refs:[],idempotency_key:'later-identity'},token)
  assert.equal((await ok('GET',route+'/quality?validator=research.relationships.v1',undefined,token)).business_quality,'failed')
  assert.equal((await ok('GET',route+`/fact-sets/${fact.fact_set_id}`,undefined,token)).content_hash,fact.content_hash)
  for(const f of files){const response=await fetch(origin+route+`/reports/${f.receipt.report_id}/download`,{headers:{Authorization:token}});assert.equal(sha(Buffer.from(await response.arrayBuffer())),f.hash,'Historical file bytes must not change')}
  const revoked=await ok('POST',route+'/reports',{...input,idempotency_key:'revoke-during-lease'},token),revokedLease=(await ok('POST','/api/internal/worker/report-jobs/claim',{},'',200,workerHeaders)).job
  assert.equal(revokedLease.job_id,revoked.job_id)
  await ok('POST','/api/knowledge-bases/access',{action:'revoke',base_id:base.id,recipient_id:grant.recipient_id},owner)
  assert.equal((await api('POST','/api/internal/worker/report-jobs/complete',{job_id:revokedLease.job_id,lease_token:revokedLease.lease_token,ok:false,error:'fixture'},'',workerHeaders)).status,403)
  assert.equal((await ok('GET',`/api/business/jobs/${revoked.job_id}`,undefined,token)).status,'blocked')
  for(const f of files)assert.equal((await fetch(origin+route+`/reports/${f.receipt.report_id}/download`,{headers:{Authorization:token}})).status,403)
  assert.deepEqual((await ok('GET',route+'/reports',undefined,token)).items,[])
  console.log('PASS frozen reports: 3 templates × 5 formats; parsed common facts, scoped quality, per-record evidence, binary hashes, owner/source ACL, cancellation, expired-lease restart, font failure and immutable history; DEMO only')
}catch(error){console.error(logs.slice(-4000));throw error}finally{
  await stopHeadlessPocketBase(pb)
  const absolute=path.resolve(temp);assert.ok(absolute.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(absolute).startsWith('agentstudio-reports-'));fs.rmSync(absolute,{recursive:true,force:true})
}
