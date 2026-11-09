import {safeToolConnectionInput} from '../services/pg-api/src/tool-connection-repository.ts'
import {prepareWorkflowToolHttp} from '../services/pg-api/src/workflow-v2-tool-network.ts'
import {originalVersionReleaseCompletionRequiredSources} from './helpers/pg-original-version-release-completion-reviewed-check.mjs'
import {originalVersionReleaseRequiredSources} from './helpers/pg-original-version-release-reviewed-check.mjs'
import {releaseCompletionSyntheticDial} from './helpers/pg-original-version-release-completion-egress.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname,relative,resolve,sep} from 'node:path'
import ts from 'typescript'
import {requireOriginalVersionReleaseCompletionCi,assertOriginalReleaseCompletionContracts} from './helpers/pg-original-version-release-completion-browser-guard.mjs'
import {startOriginalVersionReleaseCompletionBrowserFixture} from './helpers/pg-original-version-release-completion-browser-fixture.mjs'
import {originalVersionReleaseCompletionBackendFixture} from './helpers/pg-original-version-release-completion-backend-fixture.mjs'
import {startOriginalReleaseCompletionDispatch} from './helpers/pg-original-version-release-completion-dispatch.mjs'
const baseline={
 "CI": "true",
 "GITHUB_ACTIONS": "true",
 "GITHUB_RUN_ID": "123",
 "RUNNER_OS": "Linux",
 "RUNNER_ENVIRONMENT": "github-hosted",
 "GITHUB_REPOSITORY": "HG1127/agent-studio_vibex",
 "GITHUB_WORKFLOW": "Agent Studio F01 Agent Design genuine PG18 isolated verification",
 "GITHUB_JOB": "pg18-agent-design-browser",
 "AGENT_STUDIO_F01_GENUINE_CI": "YES_DISPOSABLE_F01_ONLY",
 "GITHUB_SHA": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
 "GITHUB_REF": "refs/heads/codex/pg18-worker-heartbeat-release-story",
 "AGENT_STUDIO_PG18_CI_EPHEMERAL": "true",
 "AGENT_STUDIO_PG18_CI_WRITE_APPROVED": "YES_DISPOSABLE_GITHUB_ONLY",
 "AGENT_STUDIO_PG18_CI_HOST": "127.0.0.1",
 "AGENT_STUDIO_PG18_CI_PORT": "5432",
 "AGENT_STUDIO_PG18_CI_DATABASE": "agentstudio_pg18_ci",
 "AGENT_STUDIO_PG18_CI_ADMIN_USER": "agentstudio_admin",
 "AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD": "synthetic-agentstudio-pg18-ci-123",
 "AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_UAT_APPROVAL": "APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY",
 "AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED": "APPROVE_DISPOSABLE_PG18_RUN_APPROVAL_UAT_ONLY",
 "AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_APPROVED": "APPROVE_DISPOSABLE_PG18_WORKFLOW_EXECUTION_ONLY",
 "AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_APPROVED": "APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_EXECUTION_ONLY",
 "AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED": "true",
 "AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED": "APPROVE_DISPOSABLE_PG18_AUTONOMOUS_AGENT_ONLY",
 "AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED": "true",
 "AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED": "APPROVE_DISPOSABLE_PG18_OWNER_MEMORY_ONLY",
 "AGENT_STUDIO_PG_AGENT_FEEDBACK_ENABLED": "true",
 "AGENT_STUDIO_PG_AGENT_FEEDBACK_APPROVED": "APPROVE_DISPOSABLE_PG18_OWNER_FEEDBACK_ONLY",
 "AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED": "APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY",
 "AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_COMPLETION_CI": "YES_DISPOSABLE_ORIGINAL_VERSION_RELEASE_COMPLETION_ONLY",
 "AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_COMPLETION_STORY": "original-version-release-completion",
 "AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_COMPLETION_EXPECTED_HEAD": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
 "AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED": "APPROVE_DISPOSABLE_PG18_PROVIDER_READONLY_PROBE_ONLY",
 "AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED": "APPROVE_DISPOSABLE_PG18_OWNER_BOUND_GENERATION_UAT_ONLY",
 "AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED": "true",
 "AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED": "APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_MODEL_ONLY",
 "AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_ENABLED": "true",
 "AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_APPROVED": "APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_TOOLS_ONLY"
}
test('completion admission is terminal DATA only and does not itself attest current Worker pass',()=>{const p=requireOriginalVersionReleaseCompletionCi({...baseline},'linux',1001);assert.equal(p.synthetic_only,true);assert.equal(p.current_worker_pass,false);assert.equal(p.provider_network_acceptance,false);assert.equal(p.production_GO,false);assert.equal(assertOriginalReleaseCompletionContracts(p.policy),true)})
for(const change of [{GITHUB_JOB:'pg18-agent-design-genuine'},{GITHUB_REF:'refs/heads/main'},{GITHUB_SHA:'b'.repeat(40)},{GITHUB_REPOSITORY:'other/repo'},{RUNNER_ENVIRONMENT:'self-hosted'},{DATABASE_URL:'postgres://never.invalid/x'},{HTTPS_PROXY:'https://never.invalid'},{OPENAI_API_KEY:''},{ANTHROPIC_API_KEY:'synthetic-not-allowed'},{AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_CI:'YES_DISPOSABLE_ORIGINAL_VERSION_RELEASE_ONLY'},{AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED:'false'},{AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_ENABLED:'false'},{AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:'false'}])test('completion purpose refuses '+Object.keys(change)[0],()=>assert.throws(()=>requireOriginalVersionReleaseCompletionCi({...baseline,...change},'linux',1001)))
test('all actual completion factories refuse ordinary contexts before source checks, SQL or sockets',async()=>{assert.throws(()=>requireOriginalVersionReleaseCompletionCi(baseline,'win32',1001));assert.throws(()=>requireOriginalVersionReleaseCompletionCi(baseline,'linux',0));await assert.rejects(startOriginalVersionReleaseCompletionBrowserFixture({}),/refuse_non_ephemeral/);await assert.rejects(originalVersionReleaseCompletionBackendFixture({}),/refuse_non_ephemeral/);await assert.rejects(startOriginalReleaseCompletionDispatch({},{verifySources(){throw Error('source I/O must not execute')}}),/refuse_non_ephemeral/)})
test('actual completion source uses original Worker clients, broker leases and real synthetic HTTP, with no fabricated run rows',()=>{const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),dispatch=read('./helpers/pg-original-version-release-completion-dispatch.mjs'),backend=read('./helpers/pg-original-version-release-completion-backend-fixture.mjs'),story=read('./pg-original-version-release-completion-genuine.spec.mjs');for(const text of ['new workerModule.WorkflowV2Worker','workflowV2ModelEffectExecutor','workflowV2ToolEffectExecutor','verifiedWorkflowV2ModelDispatch','verifiedWorkflowV2ToolDispatch','createIsolatedAutonomousAgentModelExecutor','createWorkflowToolNetwork','verifyBoundWorkerMutualTlsPeer','assert.equal(rows[0].status,\'started\')'])assert(dispatch.includes(text),text);assert(dispatch.includes('https.request(releaseCompletionSyntheticDial'));assert(dispatch.includes('requests>11'));assert(dispatch.includes('perRun.size<2'));assert(dispatch.includes('workerTicks<64'));assert(!/UPDATE\s+agentstudio\.runs|INSERT INTO\s+agentstudio\.run_steps/.test(dispatch+backend));assert(backend.includes("assert.equal(response.body.item.test_current,true)"));assert(backend.includes("assert.equal(stale.body.item.test_current,false)"));assert(backend.includes("ORDER BY occurred_at,id"));assert(backend.includes('modelSteps.length,4'));assert(backend.includes('effects.length,11'));assert(!/route\.fulfill|page\.addCookies|update.*checkpoint/.test(story));assert(story.includes('invalidateResourceAndRefreshSource'));assert(story.includes("getByText('验收测试通过'"));assert(!story.includes('input[type="number"]'));assert(story.includes('originalReleaseCompletionObservationBytes'))})

const tlsData=()=>({approvedForIsolatedUat:true,origin:'https://127.0.0.1:23456',ca:Buffer.from('synthetic ca DATA'),cert:Buffer.from('synthetic client cert DATA'),key:Buffer.from('synthetic client key DATA')}),modelOptions=()=>({protocol:'https:',hostname:'api.openai.com',port:443,path:'/v1/chat/completions',method:'POST',rejectUnauthorized:true,headers:{Authorization:'Bearer synthetic'}})
test('actual requester dial plan can only produce loopback same-run mutually authenticated TLS options',()=>{const selected=releaseCompletionSyntheticDial('model',modelOptions(),tlsData());assert.equal(selected.hostname,'127.0.0.1');assert.equal(selected.port,23456);assert.equal(selected.servername,'localhost');assert.equal(selected.agent,false);assert.equal(selected.lookup,undefined);assert.equal(selected.rejectUnauthorized,true);assert.equal(selected.minVersion,'TLSv1.2');assert.equal(releaseCompletionSyntheticDial('tool',{...modelOptions(),hostname:'release-tool.example.com',path:'/observe'},tlsData()).hostname,'127.0.0.1')})
for(const change of [{hostname:'vendor.example'},{protocol:'http:'},{port:80},{path:'/v1/chat/completions?redirect=1'},{method:'CONNECT'},{rejectUnauthorized:false},{socketPath:'/tmp/socket'},{host:'api.openai.com'},{createConnection:()=>{}},{checkServerIdentity:()=>{}},{secureContext:{}},{headers:{Cookie:'synthetic'}}])test('dial plan refuses real/request override '+Object.keys(change)[0],()=>assert.throws(()=>releaseCompletionSyntheticDial('model',{...modelOptions(),...change},tlsData())))
for(const change of [{origin:'https://vendor.example:23456'},{origin:'https://127.0.0.1:23456/forward'},{origin:'https://127.0.0.1:23456/?x=1'},{origin:'https://name@127.0.0.1:23456'},{approvedForIsolatedUat:false},{cert:Buffer.alloc(0)}])test('dial plan refuses unreviewed target '+Object.keys(change)[0]+String(change.origin??''),()=>assert.throws(()=>releaseCompletionSyntheticDial('model',modelOptions(),{...tlsData(),...change})))

test('fixed synthetic HTTP metadata passes the actual connection and request validators without any socket',()=>{const input={name:'Synthetic release completion HTTP',description:'Fixed same-run synthetic service only',url:'https://release-tool.example.com/observe',method:'POST',headers:[{key:'X-Synthetic-Release-Key',value:'synthetic-terminal-DATA'}],body_template:'{"source_nonce":"{{source_nonce}}","value":"{{value}}"}',timeout_s:5,enabled:true};assert.throws(()=>safeToolConnectionInput({...input,url:'https://release-tool.example.test/observe'}));const checked=safeToolConnectionInput(input),request=prepareWorkflowToolHttp(checked,{source_nonce:'terminal-DATA',value:'owner-delivery-value'});assert.equal(request.url,input.url);assert.deepEqual(JSON.parse(request.body.toString('utf8')),{source_nonce:'terminal-DATA',value:'owner-delivery-value'});assert.equal(releaseCompletionSyntheticDial('tool',{protocol:'https:',hostname:new URL(request.url).hostname,port:443,path:new URL(request.url).pathname,method:request.method,rejectUnauthorized:true,headers:request.headers},tlsData()).hostname,'127.0.0.1')})
test('complete flat source seal preserves every prior required path and both release/human SQL contracts',()=>{const sources=originalVersionReleaseCompletionRequiredSources;assert.equal(new Set(sources).size,sources.length);for(const path of [...originalVersionReleaseRequiredSources,'db/postgres/migrations/pg_v9_046_agent_releases.sql','db/postgres/migrations/pg_v9_048_agent_human_input.sql','services/pg-api/src/workflow-v2-worker.ts','services/pg-api/src/workflow-v2-model-dispatch.ts','services/pg-api/src/workflow-v2-tool-dispatch.ts','tests/helpers/pg-original-version-release-completion-egress.mjs'])assert(sources.includes(path),path)})

test('completion evidence resolves from its actual config directory into the exact CI upload allowlist',()=>{
 const configUrl=new URL('./pg-original-version-release-completion-genuine.config.mjs',import.meta.url),source=ts.createSourceFile(configUrl.pathname,readFileSync(configUrl,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
 assert.equal(source.parseDiagnostics.length,0)
 const exported=source.statements.filter(ts.isExportAssignment);assert.equal(exported.length,1)
 const call=exported[0].expression;assert(ts.isCallExpression(call));assert.equal(call.expression.getText(source),'defineConfig');assert.equal(call.arguments.length,1)
 const config=call.arguments[0];assert(ts.isObjectLiteralExpression(config))
 const property=(object,name)=>{const matches=object.properties.filter(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)===name);assert.equal(matches.length,1,name);return matches[0].initializer}
 const output=property(config,'outputDir');assert(ts.isStringLiteral(output))
 const repository=fileURLToPath(new URL('../',import.meta.url)),actual=relative(repository,resolve(dirname(fileURLToPath(configUrl)),output.text)).split(sep).join('/')
 assert.equal(actual,'.tmp/original-version-release-completion-genuine-results')
 const use=property(config,'use');assert(ts.isObjectLiteralExpression(use));for(const key of ['trace','video','screenshot']){const value=property(use,key);assert(ts.isStringLiteral(value));assert.equal(value.text,'off')}
 const workflow=readFileSync(new URL('../.github/workflows/pg18-agent-design-genuine-ci.yml',import.meta.url),'utf8'),block=workflow.split('      - name: Retain only fixed completed original release completion synthetic evidence\n')[1]?.split('      - name: ')[0]
 assert(block);assert(block.includes("if: always() && matrix.story == 'original-version-release-completion'"));assert(block.includes('uses: actions/upload-artifact@v4'))
 const paths=[...block.matchAll(/^            (\S+)$/gm)].map(match=>match[1])
 assert.deepEqual(paths,[actual+'/**/original-version-release-current-tested-published.png',actual+'/**/original-version-release-completion-observation.json'])
 assert(block.includes("if-no-files-found: ${{ job.status == 'success' && 'error' || 'ignore' }}"));assert(block.includes('retention-days: 7'))
})
