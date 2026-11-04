// AST-extracted production declarations and explicit terminal DATA only.
// No actual Actor/verifier, SQL, Pool, Worker, Native API or browser executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { BlockList, isIP } from 'node:net';
import { createOriginalWebTerminalData, originalWebCitationUrl, originalWebCitationText } from './helpers/pg-original-web-terminal-data.mjs';

const ts = createRequire(import.meta.url)('typescript');
function source(relative) {
  const text = fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, relative.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0); return ast;
}
function declarations(ast, names) {
  return names.map(name => {
    const node = ast.statements.find(n => n.name?.text === name || ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === name));
    assert(node, name); return node.getText(ast).replace(/^export\s+/, '');
  }).join('\n');
}
const guard = source('services/pg-api/tests/helpers/original-web-pages-genuine-guard.mjs');
const purpose = new vm.Script(declarations(guard, ['originalWebPageCases', 'selectOriginalWebPagePurpose', 'validateOriginalWebDataPorts']) + '\n({select:selectOriginalWebPagePurpose,ports:validateOriginalWebDataPorts})').runInNewContext({ Object, Error });
const explicitCiData = () => ({
  AGENT_STUDIO_ORIGINAL_WEB_PAGES_CI: 'YES_DISPOSABLE_ORIGINAL_WEB_PAGES_ONLY', AGENT_STUDIO_ORIGINAL_WEB_PAGES_CASE: 'search_citations',
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/codex/pg18-worker-heartbeat-20261028',
  GITHUB_WORKFLOW_REF: 'HG1127/agent-studio_vibex/.github/workflows/pg18-original-web-pages-ci.yml@refs/heads/codex/pg18-worker-heartbeat-20261028',
  GITHUB_JOB: 'pg18-tool-hub-browser', AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE: 'browser',
  GITHUB_SHA: '1'.repeat(40), AGENT_STUDIO_ORIGINAL_WEB_PAGES_EXPECTED_HEAD: '1'.repeat(40), AGENT_STUDIO_ORIGINAL_WEB_PAGES_SOURCES_SHA256: '2'.repeat(64)
});
test('pure selector accepts only the three declared manual original-page story DATA cases', () => {
  for (const story of ['search_citations', 'fetch_cancel', 'search_unknown_recovery']) assert.equal(purpose.select({ ...explicitCiData(), AGENT_STUDIO_ORIGINAL_WEB_PAGES_CASE: story }).story, story);
});
test('pure purpose rejects missing fields, foreign workflow/ref/head and unresealed zero templates', () => {
  for (const key of Object.keys(explicitCiData())) { const data = explicitCiData(); delete data[key]; assert.throws(() => purpose.select(data)); }
  for (const [key, value] of [['GITHUB_EVENT_NAME', 'push'], ['GITHUB_REF', 'refs/heads/main'], ['GITHUB_WORKFLOW_REF', 'HG1127/agent-studio_vibex/.github/workflows/pg18-original-toolhub-ci.yml@refs/heads/codex/pg18-worker-heartbeat-20261028'], ['GITHUB_JOB', 'other'], ['AGENT_STUDIO_ORIGINAL_WEB_PAGES_CASE', 'app'], ['AGENT_STUDIO_ORIGINAL_WEB_PAGES_EXPECTED_HEAD', '3'.repeat(40)], ['AGENT_STUDIO_ORIGINAL_WEB_PAGES_SOURCES_SHA256', '0'.repeat(64)]]) assert.throws(() => purpose.select({ ...explicitCiData(), [key]: value }));
});
test('final DATA ports reject extra authority/adapter keys and missing nonfunction terminals', () => {
  const ports = createOriginalWebTerminalData('search_citations').ports;
  assert.equal(purpose.ports(ports), ports);
  for (const extra of ['identity', 'actor', 'pool', 'http', 'webSearch', 'beforeDial']) assert.throws(() => purpose.ports({ ...ports, [extra]: () => {} }));
  assert.throws(() => purpose.ports({ ...ports, request: null })); assert.throws(() => purpose.ports(Object.assign(Object.create(null), ports)));
});

const network = source('services/pg-api/src/workflow-v2-tool-network.ts'), probe = source('services/pg-api/src/model-connection-probe.ts'), plan = source('services/pg-api/src/workflow-v2-tool-plan.ts'), failure = source('services/pg-api/src/workflow-v2-effect-failure.ts');
const blockLoops = probe.statements.filter(node => ts.isForOfStatement(node) && /blacklist[46]\.addSubnet/.test(node.getText(probe))).map(node => node.getText(probe)).join('\n');
const code = [declarations(failure, ['workflowKnownEffectCodes', 'WorkflowKnownEffectFailure']), declarations(probe, ['blacklist4', 'blacklist6']), blockLoops, declarations(probe, ['publicProviderAddress', 'resolveSafeProviderAddress']), declarations(plan, ['invalid', 'text', 'safeToolDestination', 'applyWorkflowToolTemplate']), declarations(network, ['prepareWorkflowToolHttp', 'redactWorkflowToolResponse', 'htmlToolText', 'parseWorkflowSearchHtml', 'createWorkflowToolNetwork'])].join('\n') + '\n({create:createWorkflowToolNetwork,Known:WorkflowKnownEffectFailure})';
const actual = new vm.Script(stripTypeScriptTypes(code, { mode: 'strip' })).runInNewContext({ URL, BlockList, isIP, Buffer, TextDecoder, AbortSignal });
const dataNetwork = data => actual.create({ resolve4: data.ports.resolve4, resolve6: data.ports.resolve6 }, data.ports.request);
test('actual production DNS/send/parser retains the safe citation, rejects private/snippet bleed and dials only once', async () => {
  const data = createOriginalWebTerminalData('search_citations'); let rechecks = 0;
  const result = await dataNetwork(data).webSearch('synthetic original query', 5, new AbortController().signal, async () => { rechecks++; });
  assert.deepEqual(JSON.parse(result), [{ title: 'Owned synthetic citation', url: originalWebCitationUrl, snippet: originalWebCitationText }]);
  assert.equal(rechecks, 1); assert.equal(data.snapshot().calls.length, 1);
  assert.equal(data.snapshot().attempts, 1); assert.equal(data.snapshot().ends, 1);
});
test('actual v4 quoted foreign-href boundary remains an ordinary unknown-after-POST failure, with one request and no automatic replay', async () => {
  const data = createOriginalWebTerminalData('search_unknown_recovery');
  await assert.rejects(dataNetwork(data).webSearch('synthetic original query', 5, new AbortController().signal, async () => {}), error => !(error instanceof actual.Known) && /^workflow_tool_search_/.test(error.message));
  assert.equal(data.snapshot().calls.length, 1);
  assert.equal(data.snapshot().attempts, 1); assert.equal(data.snapshot().ends, 1);
});
test('actual send reaches the DNS barrier then respects a refused beforeDial DATA callback without a dial', async () => {
  const data = createOriginalWebTerminalData('fetch_cancel'), rejected = Error('explicit_terminal_DATA_beforeDial_refusal'); let rechecks = 0;
  const result = dataNetwork(data).webFetch('https://public.example.com/story', new AbortController().signal, async () => { rechecks++; throw rejected; });
  void result.catch(() => {});
  await data.entered; assert.equal(data.snapshot().calls.length, 0); assert.equal(rechecks, 0);
  data.release(); await assert.rejects(result, error => error === rejected);
  assert.equal(rechecks, 1); assert.equal(data.snapshot().calls.length, 0);
  assert.equal(data.snapshot().attempts, 0); assert.equal(data.snapshot().ends, 0);
});
