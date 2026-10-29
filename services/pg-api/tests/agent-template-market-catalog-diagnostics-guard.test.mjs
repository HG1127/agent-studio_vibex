// Pure guards, annotation reversal and operand semantics. No driver/SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {validateAgentTemplateMarketDiagnosticContext as validate,isOriginalAgentTemplateMarketAuditRefusal as originalRefusal,assertAgentTemplateMarketDiagnosticScope as scope,createAgentTemplateMarketDiagnosticTrace as trace,rethrowAgentTemplateMarketAuditFailureWithDiagnostics as rethrow} from './helpers/agent-template-market-catalog-diagnostics.mjs'
const sample=()=>({GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:'Agent Studio F07 Template Market genuine PG18 isolated verification',GITHUB_JOB:'pg18-template-market-genuine',GITHUB_RUN_ID:'123456',AGENT_STUDIO_F07_GENUINE_CI:'YES_DISPOSABLE_F07_ONLY',AGENT_STUDIO_F07_GENUINE_SUITE:'database',AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123456'})
test('ordinary diagnostic entry touches no client and always rethrows the identical original error',async()=>{
  const original=Error('unsafe_agent_template_market_privileges');let touched=0
  await assert.rejects(()=>rethrow({query(){touched++;throw Error('never query')}},original,{}),error=>error===original)
  assert.equal(touched,0);assert.throws(()=>scope({},{}),/refuse_/)
})
test('pure context accepts only exact F07 workflow/job/suite pairings and fixed disposable target',()=>{
  for(const suite of ['flow','database'])assert.equal(validate({...sample(),AGENT_STUDIO_F07_GENUINE_SUITE:suite},'linux',1001).port,5432)
  assert.equal(validate({...sample(),GITHUB_JOB:'pg18-template-market-browser',AGENT_STUDIO_F07_GENUINE_SUITE:'browser'},'linux',1001).database,'agentstudio_pg18_ci')
  for(const patch of [{GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification'},{GITHUB_JOB:'pg18-agent-design-genuine'},{AGENT_STUDIO_F07_GENUINE_SUITE:'other'},{GITHUB_JOB:'pg18-template-market-browser'},{AGENT_STUDIO_PG18_CI_PORT:'5333'},{DATABASE_URL:'postgres://forbidden/db'},{PGHOST:'foreign'},{NODE_OPTIONS:'forbidden'},{NODE_PATH:'forbidden'},{HTTPS_PROXY:'forbidden'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'}])assert.throws(()=>validate({...sample(),...patch},'linux',1001),/refuse_/)
  for(const [platform,uid]of [['win32',1001],['darwin',1001],['linux',0],['linux',-1]])assert.throws(()=>validate(sample(),platform,uid),/refuse_/)
})
test('only an own data message can identify the original063 refusal; accessors never run',()=>{
  assert.equal(originalRefusal(Error('unsafe_agent_template_market_privileges')),true)
  assert.equal(originalRefusal(Error('unsafe_agent_design_privileges')),false);assert.equal(originalRefusal({message:'unsafe_agent_template_market_privileges'}),false)
  let touched=0;const error=Error();Object.defineProperty(error,'message',{get(){touched++;throw Error('private getter must not run')}})
  assert.equal(originalRefusal(error),false);assert.equal(touched,0)
})
test('observed operands retain original identity, evaluation count and OR short circuit order',()=>{
  for(const values of [[true,()=>{throw Error('skipped')}],[false,'nonempty',()=>{throw Error('skipped')}],[0,false,null]]){
    const events=[],seen=[],d=trace((site,mask)=>events.push({site,mask}));d.reset('D063C001',3)
    const operand=index=>{seen.push(index);const value=values[index];return typeof value==='function'?value():value}
    const value=d.bit('D063C001',0,operand(0))||d.bit('D063C001',1,operand(1))||d.bit('D063C001',2,operand(2))
    assert.deepEqual(seen,values[0]?[0]:values[1]?[0,1]:[0,1,2]);assert.equal(events.length,0)
    d.failureAt('D063F001','D063C001');assert.equal(events[0].mask,values[0]?'1uu':values[1]?'01u':'000')
  }
  const object={private:'must never be emitted'},events=[],d=trace((site,mask)=>events.push({site,mask}));d.reset('D063C002',1);assert.equal(d.bit('D063C002',0,object),object);d.failureAt('D063F002','D063C002');assert.deepEqual(events,[{site:'D063F002',mask:'1'}])
})
test('invalid dynamic sites and observer failures cannot leak values or change operand results',()=>{
  const events=[],d=trace((site,mask)=>events.push({site,mask}));d.reset('private row text',1);assert.equal(d.bit('private row text',0,false),false);d.failureAt('private row text','private row text');assert.deepEqual(events,[])
  const throwing=trace(()=>{throw Error('observer failed')});throwing.reset('D063C001',1);assert.equal(throwing.bit('D063C001',0,false),false);assert.doesNotThrow(()=>throwing.failureAt('D063F001','D063C001'))
})
test('removing only declared observational/type/import annotations recovers exact actual063 bytes',()=>{
  const code=readFileSync(new URL('./helpers/agent-template-market-diagnostic-core.ts',import.meta.url),'utf8'),line=code.split('\n').find(line=>line.startsWith('export const agentTemplateMarketDiagnosticProvenance='))
  const proof=JSON.parse(line.slice(line.indexOf('Object.freeze(')+14,-1)),start='/* F07_DIAGNOSTIC_BODY_BEGIN */\n',end='/* F07_DIAGNOSTIC_BODY_END */'
  let body=code.slice(code.indexOf(start)+start.length,code.indexOf(end))
  for(const edit of [...proof.reverse_edits].reverse()){
    assert.ok(['condition_prefix','condition_suffix','bit_prefix','bit_suffix','failure_prefix','failure_suffix','import_remove','export_remove','type_nonnull','type_cast_prefix','type_cast_suffix'].includes(edit.kind))
    assert.equal(body.slice(edit.start,edit.start+edit.text.length),edit.text);body=body.slice(0,edit.start)+edit.old+body.slice(edit.start+edit.text.length)
  }
  const original=readFileSync(new URL('../src/agent-template-market-audit-core.ts',import.meta.url),'utf8')
  assert.equal(body,original);assert.equal(createHash('sha256').update(body).digest('hex'),proof.source_sha256)
  assert.equal(proof.conditions.length,25);assert.equal(proof.failures.length,26)
  assert.ok(!/export (?:async )?function (?:verifyAgentTemplateMarketCore|normalizeAgentTemplateMarketCheck)/.test(code))
})
