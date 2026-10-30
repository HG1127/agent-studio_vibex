import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {registerHooks} from 'node:module'
import {originalModelDraftDiscoveryBackendFixture} from './helpers/pg-original-model-draft-discovery-backend-fixture.mjs'
import {startOriginalModelDraftDiscoveryBrowserFixture} from './helpers/pg-original-model-draft-discovery-browser-fixture.mjs'
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from '../services/pg-api/src/native-config-uat-policy.ts'
import {createNativeOwnOperationsBusinessHandler} from '../services/pg-api/src/own-operations-http.ts'
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('ordinary-machine backend and browser entry refuse before any dynamic PG/TLS/browser/build imports',async()=>{const attempted=[],hook=registerHooks({resolve(specifier){attempted.push(specifier);throw Error('unexpected runtime import')}});try{await assert.rejects(originalModelDraftDiscoveryBackendFixture({}),/refuse|admission|purpose/);await assert.rejects(startOriginalModelDraftDiscoveryBrowserFixture({}),/refuse|admission|purpose/)}finally{hook.deregister()}assert.deepEqual(attempted,[])})
test('fresh F01/070-073/own audit is actually composed with A repository/provider ports and same actual Native Cookie handler',()=>{const text=read('tests/helpers/pg-original-model-draft-discovery-backend-fixture.mjs');for(const token of ['base.agentDesignGenuineFixture(env,{browserMode:true})',"'063','064','065','066','067','068','069'",'p070.manifest.optional_sql_sources','p071.manifest.optional_sql_sources','p072.manifest.optional_sql_sources','pg_v9_073_monitor_inbox.sql','await f.audit(db)','own.inspectOwnOperationsSchema','createOriginalModelDraftSyntheticHostSource({...f,secretPool:observedBroker},env)','...draft.nativeOptions','draftHandler=draft.createHandler(native.authenticateRequest)','if(draftHandler&&await draftHandler(req,res))return',"actualCap.body.original_model_draft_probe_protocol,'native_model_draft_discovery_v1'"])assert(text.includes(token),token);assert(!text.includes('originalModelConnectionsBackendFixture('));assert(!text.includes('new Pool'));assert(!text.includes('PGlite'))})
test('draft evidence proves all metadata columns and actual owner admission/finish without credential/body hash logging',()=>{const text=read('tests/helpers/pg-original-model-draft-discovery-sql-proofs.mjs');for(const token of ['SELECT * FROM agentstudio.model_connections ORDER BY id',"target_kind='model_connection'",'JSON.stringify(rows)===before.models','JSON.stringify(audit)===before.audit',"target_kind='model_connection_draft_probe'",'row.owner_user_id,f.users[who]','row.actor_user_id,f.users[who]',"'model.connection_draft_probe_admitted'","'model.connection_draft_probe_finished'",'finished.metadata.model_count,2','models.get(identities[who],id)','api_key_ciphertext','secret_encrypted:true'])assert(text.includes(token),token);assert(!text.includes('console.'));assert(!text.includes('api_key_tail'))})
test('the hold operates on a real completed POST body and keeps Native8s/provider6s',()=>{const text=read('tests/helpers/pg-original-model-draft-discovery-browser-fixture.mjs'),provider=read('services/pg-api/src/model-draft-discovery-provider.ts');for(const token of ["req.method==='POST'",'/__pg_native/api/v2/model-connections/draft-probe','Buffer.concat(chunks)',"JSON.parse(actual.toString('utf8'))",'AbortSignal.timeout(8000)','req.pipe(proxy)','held_deadline_expirations','},5500)'])assert(text.includes(token),token);assert(provider.includes('const timeoutMs=6000'));assert(!text.includes('dropNextActualCreateReply'));assert(!text.includes('nextLoss'))})
test('story has real original controls, actual full metadata checks, explicit discovered-ID save and actual Cookie late reply fence',()=>{const text=read('tests/pg-original-model-draft-discovery-genuine.spec.mjs');for(const token of ["name:'测试连接'",'await f.metadataCheckpoint()','await f.assertMetadataUnchanged(baseline)',"name:'保存'",'await f.proveSavedDiscovered','await f.draftAudit(\'alice\'','await f.draftAudit(\'bob\'','const actualHeld=await hold.entered()',"await logout(switchPage,'bob');await login(switchPage,'alice');hold.release()",'expect((await oldReply).status).toBe(200)',"page.locator('#mc-api-key')).toHaveCount(0)",'modelMutations.push({path,method:request.method()})'])assert(text.includes(token),token);for(const token of ['route.fulfill','addCookies','setExtraHTTPHeaders','request.postData','new Pool','PGlite'])assert(!text.includes(token),token)})
test('successful fixed images are only written after the full story, cleanup and all zero gates; no automatic trace/video/failure image',()=>{const text=read('tests/pg-original-model-draft-discovery-genuine.spec.mjs'),config=read('tests/pg-original-model-draft-discovery-genuine.config.mjs');assert(text.indexOf("await clean('genuine_fixture_close'")<text.indexOf("await clean('fixed_success_image_write'"));assert(text.includes('const success=completed&&!primary&&!testInfo.errors.length&&!cleanup.length'));assert(text.includes('if(success&&!cleanup.length)for(const image of images)'));for(const token of ['legacy_backend_requests','unexpected_api_failures','blocked_requests','forbidden_auth_headers','held_deadline_expirations','pageModelCredentialReads','providerRequests.length','f.finalOwnerAudit()'])assert(text.includes(token),token);for(const token of ["trace:'off'","video:'off'","screenshot:'off'",'retries:0'])assert(config.includes(token));assert(!text.includes('testInfo.attach('));assert(text.includes('image.bytes.fill(0)'))})
test('reviewed source check requires the independent host/spec/provider/proofs and exact clean actual head, without editing pins',()=>{const text=read('tests/helpers/pg-original-model-draft-discovery-reviewed-check.mjs');for(const token of ['pg-original-model-draft-discovery-sql-proofs.mjs','model-draft-discovery-provider.ts','model-draft-probe-repository.ts','pg-original-model-draft-discovery-genuine.spec.mjs','.github/workflows/pg18-agent-design-genuine-ci.yml',"['rev-parse','HEAD']","['status','--porcelain','--untracked-files=normal']",'originalLoginReviewedSources'])assert(text.includes(token),token);assert(!text.includes('writeFile'));assert(!text.includes('Object.assign(env'))})
test('workflow is a seventh fresh-service matrix story with only A independent purpose and fixed artifact names',()=>{const text=read('.github/workflows/pg18-agent-design-genuine-ci.yml'),m=text.match(/story:\s*\[([^\]]+)\]/);assert(m);const stories=m[1].split(',').map(v=>v.trim());assert.equal(stories.length,7);assert.equal(stories.at(-1),'original-model-draft-discovery');for(const story of ['design','original-login','monitor073','internal-overview','original-home-design','original-model-connections'])assert(stories.includes(story));const start=text.indexOf('      - name: Independent original unsaved draft discovery'),end=text.indexOf('      - name: Original ModelConnections actual owner',start),step=text.slice(start,end);assert(start>0&&end>start);assert(step.includes('AGENT_STUDIO_ORIGINAL_MODEL_DRAFT_DISCOVERY_CI: YES_DISPOSABLE_ORIGINAL_MODEL_DRAFT_DISCOVERY_ONLY'));assert(step.includes('AGENT_STUDIO_ORIGINAL_MODEL_DRAFT_DISCOVERY_EXPECTED_HEAD:'));assert(!step.includes('AGENT_STUDIO_ORIGINAL_MODEL_CONNECTIONS_CI:'));assert(!step.includes('GITHUB_JOB:'));for(const name of ['original-model-draft-discovery-alice-saved.png','original-model-draft-discovery-alice-after-bob.png','original-model-draft-discovery-observation.json'])assert(step.includes(name))})
test('synthetic provider evidence explicitly excludes actual provider DNS/TLS and charged compatibility',()=>{const text=read('tests/pg-original-model-draft-discovery-genuine.spec.mjs'),source=read('tests/helpers/original-model-draft-synthetic-host-source.mjs');for(const token of ['provider_network_acceptance:false','real_provider_DNS_TLS_compatibility:false','charged_provider_compatibility:false','production_GO:false'])assert(text.includes(token),token);assert(source.includes('createModelDraftDiscoveryProvider(resolver,request)'));assert(source.includes('synthetic_DNS_and_request_stream_ports:true'));assert(source.includes('provider_DNS_TLS_or_network_acceptance:false'))})

test('paging capability is taken from the same actual models instance used by generic handler; current listSnapshot dependency is retained',()=>{
 const text=read('tests/helpers/pg-original-model-draft-discovery-backend-fixture.mjs'),policy=read('tests/helpers/pg-original-model-draft-discovery-browser-policy.mjs'),review=read('tests/helpers/pg-original-model-draft-discovery-reviewed-check.mjs')
 assert(text.includes("Object.getOwnPropertyDescriptor(models,'paginationProtocol')?.value"));assert(text.includes("assert.equal(typeof models.listPage,'function')"));assert(text.includes('originalModelPaginationProtocol:paginationProtocol'));assert(text.includes('modelConnectionRepository:models'));assert(text.includes("actualCap.body.original_model_pagination_protocol,'native_model_connections_paging_v1'"));assert(policy.includes("q.get('paging')!=='owner_cursor_v1'"));assert(review.includes('src/lib/originalModelConnectionPagination.ts'));assert(review.includes('services/pg-api/src/model-connection-page-cursor.ts'));assert(text.includes('large_account_paging_complete:false'))
 const controller=read('src/lib/originalModelConnections.ts'),client=read('src/lib/originalModelConnectionsApi.ts'),auth=read('services/pg-api/src/native-auth-http.mjs')
 for(const token of ['ports.api.listSnapshot()','ports.api.draftProbe(input','formProbeEnabled','probeNotice','cap.draftProbe'])assert(controller.includes(token),token)
 for(const token of ['readOriginalModelConnectionSnapshot','async listSnapshot(','async draftProbe(','original_model_draft_probe_protocol'])assert(client.includes(token),token)
 for(const token of ['original_model_pagination_protocol','original_model_draft_probe_protocol'])assert(auth.includes(token),token)
})

const configApproval={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:'true',AGENT_STUDIO_PG18_UAT_APPROVAL:'APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY'}
const bothApprovals={...configApproval,AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED:'true',AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED:'APPROVE_DISPOSABLE_PG18_PROVIDER_READONLY_PROBE_ONLY'}
const origin='https://localhost:17443'
test('actual selector and global handler enforce independent config/probe grants before inner model routes',async()=>{
 for(const [env,create,draft] of [[{},false,false],[configApproval,true,false],[bothApprovals,true,true]]){
  const policy=selectNativePg18UatCapabilities(env,true,origin,1001)
  assert.equal(policy.configurationWrites,create);assert.equal(policy.modelProbeUat,draft)
  for(const [url,admitted] of [['/api/v2/model-connections',create],['/api/v2/model-connections/draft-probe',draft]]){
   assert.equal(permitNativePg18BusinessUatRequest(url,'POST',policy),admitted)
   let inner=0,auth=0,status,body
   const handler=createNativeOwnOperationsBusinessHandler({policy,available:false,allowedOrigin:origin,authenticateRequest:async()=>{auth++;throw Error('unexpected authentication')},businessHandler:async()=>{inner++}})
   // Plain unit request carries no Cookie, identity, Pool or provider transport.
   await handler({url,method:'POST',headers:{}},{writeHead(value){status=value},end(value){body=value}})
   assert.equal(inner,admitted?1:0);assert.equal(auth,0)
   if(!admitted){assert.equal(status,405);assert.equal(JSON.parse(body).error,'pilot_business_writes_disabled')}
  }
 }
})
test('actual selector refuses missing/wrong approvals and unsafe service admission',()=>{
 for(const env of [
  {...bothApprovals,AGENT_STUDIO_PG18_UAT_APPROVAL:undefined},
  {...bothApprovals,AGENT_STUDIO_PG18_UAT_APPROVAL:'wrong'},
  {...bothApprovals,AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED:undefined},
  {...bothApprovals,AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED:'wrong'},
  {...bothApprovals,AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:undefined},
  {...bothApprovals,AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED:undefined},
 ])assert.throws(()=>selectNativePg18UatCapabilities(env,true,origin,1001))
 assert.throws(()=>selectNativePg18UatCapabilities(bothApprovals,false,origin,1001))
 assert.throws(()=>selectNativePg18UatCapabilities(bothApprovals,true,'http://localhost:17443',1001))
 assert.throws(()=>selectNativePg18UatCapabilities(bothApprovals,true,origin,0))
})
test('new host uses the actual selected policy before fixture and around every business route; only new workflow purpose gains both grants',()=>{
 const text=read('tests/helpers/pg-original-model-draft-discovery-backend-fixture.mjs'),workflow=read('.github/workflows/pg18-agent-design-genuine-ci.yml')
 const select=text.indexOf('const selectedPolicy=policy.selectNativePg18UatCapabilities(env,true,permit.origin)'),fixture=text.indexOf('f=await base.agentDesignGenuineFixture'),gate=text.indexOf('assert.equal(selectedPolicy.modelProbeUat,true')
 assert(select>0&&gate>select&&fixture>gate)
 assert(text.includes('allowConfigurationWrites:selectedPolicy.configurationWrites,allowModelProbe:selectedPolicy.modelProbeUat'))
 assert(text.includes('businessHandler:(req,res)=>business(req,res)'))
 assert(text.includes('policy:selectedPolicy,businessHandler:innerBusiness'))
 const inner=text.slice(text.indexOf('const innerBusiness=async'),text.indexOf('// Every business route'))
 for(const name of ['draftHandler','home','catalog','monitor','generic'])assert(inner.includes(name))
 assert(!text.includes('Object.assign(selectedPolicy'));assert(!text.includes('selectedPolicy.configurationWrites=true'))
 const start=workflow.indexOf('      - name: Independent original unsaved draft discovery'),end=workflow.indexOf('      - name: Retain fixed safe draft discovery',start),step=workflow.slice(start,end)
 for(const [key,value] of Object.entries(bothApprovals))assert(step.includes(key+': '+(value==='true'?"'true'":value)),key)
 const outside=workflow.slice(0,start)+workflow.slice(end)
 assert(!outside.includes('AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED:'))
})
