// Actual protocol factories and explicit terminal DATA; no fixture/repository,
// Native/Actor, SQL, Worker or browser is imported or executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicMcpRegistryNetwork } from '../services/pg-api/src/public-mcp-registry-network.ts';
import { createMcpNetwork } from '../services/pg-api/src/mcp-network.ts';
import { createMcpDiscovery } from '../services/pg-api/src/mcp-discovery.ts';
import { createMcpToolExecutor } from '../services/pg-api/src/mcp-call.ts';
import { createSmitheryNetwork } from '../services/pg-api/src/smithery-network.ts';
import { parseSmitheryNamespaces, parseSmitheryCatalog, parseSmitheryRemoteState } from '../services/pg-api/src/smithery-contracts.ts';
import { selectOriginalPluginMarketPurpose, validateOriginalPluginDataPorts } from '../services/pg-api/tests/helpers/original-plugin-market-genuine-guard.mjs';
import { createOriginalPluginTerminalData, pluginSmitheryKeyData, pluginOwnedNamespace, pluginOwnedSetupUrl, pluginRegistryName } from './helpers/pg-original-plugin-market-terminal-data.mjs';

const resolver = data => ({ resolve4: data.ports.resolve4, resolve6: data.ports.resolve6 });
const signal = () => new AbortController().signal;
test('actual registry network parses both terminal DATA pages and the exact source-pinned detail', async () => {
  const data = createOriginalPluginTerminalData('registry_connections'), read = createPublicMcpRegistryNetwork(resolver(data), data.ports.request);
  const first = await read({ kind: 'list', query: 'synthetic', cursor: '' }, signal());
  assert.equal(first.items.length, 6); assert.equal(first.next_cursor, 'synthetic-page-2');
  const second = await read({ kind: 'list', query: 'synthetic', cursor: first.next_cursor }, signal());
  assert.equal(second.items.length, 2); assert.equal(second.next_cursor, '');
  const detail = await read({ kind: 'detail', name: pluginRegistryName, version: '1.0.0' }, signal());
  assert.equal(detail.items[0].source_sha256, first.items.find(row => row.name === pluginRegistryName).source_sha256);
});
test('actual MCP discovery and approved-call protocol parse terminal DATA, without an authority implementation', async () => {
  const data = createOriginalPluginTerminalData('invoke_translation'), transport = createMcpNetwork(resolver(data), data.ports.request);
  const material = { url: 'https://tools.example.com/mcp', headers: [] };
  const catalog = await createMcpDiscovery(transport)(material, signal());
  assert.equal(catalog.tools.length, 1); assert.equal(catalog.tools[0].name, 'echo');
  const result = await createMcpToolExecutor(transport)({ ...material, version: catalog.version, definition: catalog.tools[0] }, { text: 'source DATA' }, signal());
  assert.equal(result.isError, false); assert.equal(result.text, 'Owned MCP DATA: source DATA');
  assert.equal(data.snapshot().calls.filter(row => row.rpc === 'tools/call').length, 1);
});
test('actual Smithery network/parser retains namespace ownership, catalog page two and received binding proof', async () => {
  const data = createOriginalPluginTerminalData('smithery_management'), transport = createSmitheryNetwork(resolver(data), data.ports.request);
  const namespaces = await transport(pluginSmitheryKeyData, { method: 'GET', path: '/namespaces' }, signal());
  assert.deepEqual(parseSmitheryNamespaces(namespaces.data), [pluginOwnedNamespace]);
  const page = await transport(pluginSmitheryKeyData, { method: 'GET', path: '/servers?page=2&pageSize=24&q=weather' }, signal());
  assert.equal(parseSmitheryCatalog(page.data, 2).items[0].server, 'synthetic/page-two');
  const proof = 'a'.repeat(64), id = 'source-data-connection', path = '/connect/' + pluginOwnedNamespace + '/' + id;
  const created = await transport(pluginSmitheryKeyData, { method: 'PUT', path, body: { transport: 'http', server: 'synthetic/weather', name: 'Synthetic', metadata: { agent_studio_binding: proof } } }, signal());
  assert.equal(parseSmitheryRemoteState(created.data, id, proof, pluginSmitheryKeyData).setup_url, pluginOwnedSetupUrl);
  assert.throws(() => parseSmitheryRemoteState(created.data, id, 'b'.repeat(64), pluginSmitheryKeyData));
  data.authorizeRemoteDATA();
  const refreshed = await transport(pluginSmitheryKeyData, { method: 'GET', path }, signal());
  assert.equal(parseSmitheryRemoteState(refreshed.data, id, proof, pluginSmitheryKeyData).state, 'connected');
});
test('final DATA cannot supply a Native identity, Actor, repository or policy adapter', () => {
  const data = createOriginalPluginTerminalData('registry_connections');
  assert.equal(validateOriginalPluginDataPorts(data.ports), data.ports);
  for (const name of ['identity', 'Actor', 'repository', 'authenticateRequest', 'approve']) assert.throws(() => validateOriginalPluginDataPorts({ ...data.ports, [name]: () => true }));
});
test('pure purpose DATA rejects absent hash, wrong workflow/head, nonmanual events and missing discovery consent', () => {
  const data = { AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_CI: 'YES_DISPOSABLE_ORIGINAL_PLUGIN_MARKET_ONLY', AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_CASE: 'registry_connections', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/codex/pg18-worker-heartbeat-20261028', GITHUB_WORKFLOW_REF: 'HG1127/agent-studio_vibex/.github/workflows/pg18-original-plugin-market-ci.yml@refs/heads/codex/pg18-worker-heartbeat-20261028', GITHUB_JOB: 'pg18-tool-hub-browser', AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE: 'browser', AGENT_STUDIO_PG18_SMITHERY_UAT_ENABLED: 'true', AGENT_STUDIO_PG18_SMITHERY_UAT_APPROVED: 'APPROVE_DISPOSABLE_PG18_SMITHERY_MANAGEMENT_ONLY', AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_ENABLED: 'true', AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_APPROVED: 'APPROVE_DISPOSABLE_PG18_MCP_DISCOVERY_ONLY', GITHUB_SHA: '1'.repeat(40), AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_EXPECTED_HEAD: '1'.repeat(40), AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_SOURCES_SHA256: '2'.repeat(64) };
  assert.equal(selectOriginalPluginMarketPurpose(data).story, 'registry_connections');
  for (const key of Object.keys(data)) { const invalid = { ...data }; delete invalid[key]; assert.throws(() => selectOriginalPluginMarketPurpose(invalid)); }
  for (const patch of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_WORKFLOW_REF: 'other' }, { AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_EXPECTED_HEAD: '3'.repeat(40) }, { AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_SOURCES_SHA256: '0'.repeat(64) }]) assert.throws(() => selectOriginalPluginMarketPurpose({ ...data, ...patch }));
});
