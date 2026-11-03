// Actual isolated PB/SQLite; no source state is prewritten. The deliberately
// incomplete synthetic model draft must not erase the employee's requirements.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {createServer} from 'node:http'
import {randomBytes} from 'node:crypto'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-authoring-')),setupKey=randomBytes(32).toString('hex')
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})}),origin=`http://127.0.0.1:${port}`
let pb,logs='',modelCalls=0
const draft={name:'省略功能的模型草案',goal:'仅计算一加一',task_scope:'仅算术',tools:['calculate'],task_plan:['计算','返回结果'],deliverables:['数值'],done_criteria:['正确计算']}
const upstream=createServer(async(req,res)=>{const reply=data=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data))};if(req.url==='/v1/models')return reply({data:[{id:'fixture-model'}]});let raw='';for await(const c of req)raw+=c;modelCalls++;reply({choices:[{message:{role:'assistant',content:JSON.stringify(draft)}}]})})
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));const remote=`http://127.0.0.1:${upstream.address().port}`
async function start(){pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve',`--http=127.0.0.1:${port}`,`--dir=${temp}`,`--hooksDir=${path.join(root,'pocketbase/pb_hooks')}`],{cwd:path.join(root,'pocketbase'),env:{NODE_ENV:'test',AGENT_STUDIO_CAPABILITY_TEST_ONLY:'true',AGENT_STUDIO_CAPABILITY_TEST_ORIGIN:remote,AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:setupKey}});pb.stdout.on('data',b=>{logs=(logs+b).slice(-12000)});pb.stderr.on('data',b=>{logs=(logs+b).slice(-12000)});for(let n=0;n<150;n++){try{if((await fetch(origin+'/api/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('PB unavailable '+logs)}
async function api(method,route,body,token='',headers={}){const r=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()}}
async function ok(method,route,body,token='',status=200,headers={}){const r=await api(method,route,body,token,headers);assert.equal(r.status,status,route+' '+JSON.stringify(r));return r.data}
try{
  await start();await ok('POST','/api/studio/bootstrap',{email:'owner@example.test',password:'Fixture-Password-2026',display_name:'Owner'},'',201,{'X-Agent-Studio-Setup-Key':setupKey})
  const ownerLogin=await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'owner@example.test',password:'Fixture-Password-2026'}),token=ownerLogin.token
  await ok('POST','/api/studio/users',{email:'reader@example.test',password:'Fixture-Password-2026',display_name:'Reader',role:'employee'},token,201)
  const reader=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'reader@example.test',password:'Fixture-Password-2026'})).token
  const sourceInput={requirement:'PRIVATE_ORIGINAL_审计标记。需要 OCR、关系图、持续监测和逐字引文。',idempotency_key:'original'}
  const source=await ok('POST','/api/authoring/requirements',sourceInput,token)
  assert.equal((await ok('POST','/api/authoring/requirements',sourceInput,token)).request_id,source.request_id)
  assert.equal((await api('POST','/api/authoring/requirements',{...sourceInput,requirement:'changed'},token)).status,409)
  assert.equal((await api('GET','/api/authoring/requirements/'+source.request_id,undefined,reader)).status,404)
  assert.equal((await api('POST','/api/authoring/requirements',{requirement:'foreign parent',parent_id:source.request_id,idempotency_key:'foreign'},reader)).status,404)
  assert.equal((await api('POST','/api/authoring/requirements',sourceInput,'',{'X-Rh-User-Id':ownerLogin.record.id})).status,401)
  const preview=await ok('POST','/api/authoring/preview',{request_id:source.request_id,spec:draft},token)
  assert.equal(preview.plan.ready_for_release,false);for(const id of ['ocr','relation_graph','monitoring'])assert.ok(preview.plan.requirements.some(r=>r.id===id))
  assert.equal(modelCalls,0,'Capture and dependency compilation send no model request')
  const saved=await ok('POST','/api/agent_specs',{name:'Tracked source',spec:preview.spec},token)
  assert.equal(saved.spec._studio_authoring.request_id,source.request_id)
  const internalPreview=await ok('POST','/api/internal/templates',{action:'preview',spec_id:saved.id},token)
  assert.equal(JSON.stringify(internalPreview).includes('PRIVATE_ORIGINAL_'),false);assert.ok(internalPreview.preview_spec.capability_requirements.includes('ocr'))
  const invite=await ok('POST','/api/internal/templates',{action:'create',spec_id:saved.id,confirm_safe:true,preview_hash:internalPreview.preview_hash},token)
  const redeemed=await ok('POST','/api/internal/templates',{action:'redeem',share_code:invite.share_code},reader),internalCopy=await ok('GET','/api/agent_specs/'+redeemed.spec_id,undefined,reader)
  assert.equal(internalCopy.spec._studio_authoring,undefined);assert.equal(JSON.stringify(internalCopy).includes('PRIVATE_ORIGINAL_'),false)
  assert.equal((await ok('GET',`/api/agent_specs/${redeemed.spec_id}/capability-plan`,undefined,reader)).requirements.find(r=>r.id==='ocr').state,'development_required')
  const edited=await ok('PATCH','/api/agent_specs/'+saved.id,{spec:{...draft,goal:'模型再次省略功能'}},token)
  assert.equal(edited.spec._studio_authoring.request_id,source.request_id,'Omitting metadata cannot erase original requirements')
  assert.equal((await ok('GET',`/api/agent_specs/${saved.id}/capability-plan`,undefined,token)).requirements.find(r=>r.id==='ocr').state,'development_required')
  const version=await ok('POST','/api/spec-versions',{spec_id:saved.id},token)
  assert.equal(version.item.spec_snapshot._studio_authoring.request_id,source.request_id)
  assert.equal((await api('POST',`/api/spec-versions/${version.item.id}/publish`,{},token)).data.error,'capability_dependencies_unready')
  assert.equal((await api('POST','/api/templates/publish',{source_spec_id:saved.id,expected_updated:edited.updated,name:'Must not publish',description:'Synthetic unsupported source fixture',category:'research'},token)).data.error,'capability_dependencies_unready')
  const revision=await ok('POST','/api/authoring/requirements',{parent_id:source.request_id,requirement:'补充：每个问题列出未知与证据。',idempotency_key:'revision'},token)
  await ok('PATCH','/api/agent_specs/'+saved.id,{spec:{...draft,_studio_authoring:{request_id:revision.request_id}}},token)
  await ok('POST',`/api/spec-versions/${version.item.id}/restore`,{},token)
  assert.equal((await ok('GET','/api/agent_specs/'+saved.id,undefined,token)).spec._studio_authoring.request_id,revision.request_id,'Restoration cannot silently erase a later requirement')
  const other=await ok('POST','/api/authoring/requirements',{requirement:'另一个独立任务',idempotency_key:'other'},token)
  assert.equal((await api('PATCH','/api/agent_specs/'+saved.id,{spec:{...draft,_studio_authoring:{request_id:other.request_id}}},token)).status,409)
  assert.equal((await api('POST','/api/agent_specs',{name:'foreign',spec:preview.spec},reader)).status,404)
  await stopHeadlessPocketBase(pb);await start()
  const recovered=await ok('GET','/api/authoring/requirements/'+revision.request_id,undefined,token);assert.equal(recovered.entries.length,2);assert.equal(recovered.entries[0].requirement,sourceInput.requirement)
  const portableSource=await ok('POST','/api/authoring/requirements',{requirement:'PRIVATE_TEMPLATE_ORIGINAL 只进行算术计算。',idempotency_key:'portable'},token)
  const portable=await ok('POST','/api/agent_specs',{name:'Portable arithmetic',spec:{...draft,_studio_authoring:{request_id:portableSource.request_id}}},token)
  const published=await ok('POST','/api/templates/publish',{source_spec_id:portable.id,expected_updated:portable.updated,name:'Arithmetic template',description:'Synthetic portable arithmetic',category:'other'},token)
  const used=await ok('POST',`/api/templates/${published.item.id}/use`,{},reader),copy=await ok('GET','/api/agent_specs/'+used.spec_id,undefined,reader)
  assert.equal(copy.spec._studio_authoring,undefined);assert.equal(JSON.stringify(copy).includes('PRIVATE_TEMPLATE_ORIGINAL'),false);assert.ok(copy.spec.capability_requirements.includes('durable_results'))
  const legacy=await ok('POST','/api/authoring/requirements',{requirement:'旧方案的本次修订',kind:'legacy_revision',idempotency_key:'legacy'},token)
  assert.equal((await ok('POST','/api/authoring/preview',{request_id:legacy.request_id,spec:draft},token)).plan.original_requirements.state,'revision_only')
  if(process.argv.includes('--browser')){
    const conn=(await ok('POST','/api/model-connections',{name:'Authoring fixture',provider:'openai',api_key:'fixture-only-key',base_url:remote+'/v1',models:['fixture-model']},token)).item.id
    assert.equal((await ok('POST','/api/model-connections/test',{connection_id:conn},token)).ok,true)
    const {verifyAuthoringBrowser}=await import('./helpers/authoring-browser.mjs');await verifyAuthoringBrowser({root,backendOrigin:origin,modelCalls:()=>modelCalls})
  }
  console.log('PASS original requirements: immutable owner chain, idempotency/restart, omitted-field defense, restore ancestry, source-derived release/template gates and portable privacy; synthetic model only')
}catch(error){console.error(logs.slice(-4000));throw error}finally{await stopHeadlessPocketBase(pb);await new Promise(resolve=>upstream.close(resolve));const absolute=path.resolve(temp);assert.ok(path.dirname(absolute)===path.resolve(os.tmpdir())&&path.basename(absolute).startsWith('agentstudio-authoring-'));fs.rmSync(absolute,{recursive:true,force:true})}
