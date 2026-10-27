// Ordinary-machine refusal only. The child cannot construct a pool/listener.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

test('review mTLS, readonly operator, opinion, generated acceptance and full CLI integrations refuse an ordinary checkout before any pool, SQL, certificate or listener',()=>{
  const source=readFileSync(new URL('./helpers/agent-assessment-fixture.mjs',import.meta.url),'utf8')
  const start=source.indexOf('export async function agentAssessmentTcpFixture('),body=source.slice(start)
  assert.ok(start>0)
  const guard=body.indexOf('const target=requireEphemeralPg18Ci(env)'),pool=body.indexOf('new pg.Pool(')
  assert.ok(guard>=0&&pool>guard,'exact environment attestation must precede the first pool')
  // Do not inherit NODE_TEST_CONTEXT: a nested test runner can otherwise
  // suppress the child's actual test and report an unrelated successful exit.
  const env={PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??'',HOME:process.env.HOME??'',GITHUB_ACTIONS:'false',CI:'false',AGENT_STUDIO_PG18_CI_EPHEMERAL:'false',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:''}
  for(const [entry,refusal] of [['agent-assessment-mtls.integration.mjs',/refuse_non_ephemeral_pg18_ci/],['agent-assessment-operator.integration.mjs',/refuse_non_ephemeral_pg18_ci/],['agent-opinion-tcp.integration.mjs',/refuse_non_ephemeral_pg18_ci/],['agent-generated-acceptance-tcp.integration.mjs',/refuse_non_ephemeral_pg18_ci/],['agent-generated-native-http.integration.mjs',/refuse_non_ephemeral_pg18_ci/],['agent-generated-acceptance-sql.test.mjs',/refuse_non_ephemeral_pg18_ci/],['assessment-full-cli-lifecycle.integration.mjs',/refuse_non_ephemeral_assessment_full_cli_ci/]]){
  const result=spawnSync(process.execPath,['--experimental-strip-types','--test',fileURLToPath(new URL('./'+entry,import.meta.url))],
    {env,encoding:'utf8',timeout:15000,windowsHide:true,maxBuffer:1024*1024})
  assert.equal(result.error,undefined)
  assert.notEqual(result.status,0)
  assert.match(result.stdout+result.stderr,refusal)
  assert.doesNotMatch(result.stdout+result.stderr,/ECONNREFUSED|password authentication failed|certificate verify failed|synthetic provider POST/)
  }
})
