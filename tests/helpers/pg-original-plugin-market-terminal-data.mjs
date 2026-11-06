// Explicit terminal DNS / HTTP contents only. Actual protocol parsers, Native
// Cookie, repositories, Actor/Broker, approvals, mTLS and Worker stay in use.
import { EventEmitter } from 'node:events';

export const pluginSmitheryKeyData = 'synthetic-plugin-smithery-key-not-a-real-account-0001';
export const pluginOwnedNamespace = 'ci_owned';
export const pluginOwnedSetupUrl = 'https://auth.smithery.ai/connect/synthetic-owned-connection';
export const pluginRegistryName = 'io.github.synthetic/weather';
export const pluginToolData = Object.freeze({ name: 'echo', description: 'Synthetic terminal DATA echo', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, annotations: { readOnlyHint: false, destructiveHint: false }, execution: { taskSupport: 'forbidden' } });
export function createOriginalPluginTerminalData(story) {
  if (!['registry_connections', 'smithery_management', 'invoke_translation'].includes(story)) throw Error('unknown_original_plugin_DATA_story');
  const calls = [], dns = [], managed = new Map();
  let attempts = 0, ends = 0, authorized = false;
  const entry = index => ({
    server: { name: index === 0 ? pluginRegistryName : 'io.github.synthetic/plugin-' + index, title: index === 0 ? 'Synthetic Weather' : 'Synthetic Plugin ' + index,
      description: 'Synthetic registry DATA only {{input}}', version: '1.0.0', remotes: [{ type: 'streamable-http', url: 'https://tools.example.com/mcp' + (index ? '?server=' + index : '') }] },
    _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active', isLatest: true } }
  });
  const entries = Array.from({ length: 8 }, (_, index) => entry(index));
  function registry(options) {
    const url = new URL(options.path, 'https://registry.modelcontextprotocol.io');
    if (options.method !== 'GET') throw Error('synthetic_registry_GET_only');
    if (url.pathname.includes('/versions/')) {
      const path = decodeURIComponent(url.pathname), found = entries.find(row => path === '/v0.1/servers/' + row.server.name + '/versions/1.0.0');
      if (!found) throw Error('unlisted_synthetic_registry_detail');
      return { status: 200, data: found };
    }
    if (url.pathname !== '/v0.1/servers' || url.searchParams.get('limit') !== '24' || url.searchParams.get('version') !== 'latest') throw Error('unexpected_synthetic_registry_list');
    const query = url.searchParams.get('search') || '', cursor = url.searchParams.get('cursor') || '';
    if (query === 'weather') return { status: 200, data: { servers: [entries[0]], metadata: {} } };
    if (query && query !== 'synthetic') return { status: 200, data: { servers: [], metadata: {} } };
    if (cursor && cursor !== 'synthetic-page-2') throw Error('unlisted_synthetic_registry_cursor');
    return { status: 200, data: { servers: cursor ? entries.slice(6) : entries.slice(0, 6), metadata: cursor ? {} : { nextCursor: 'synthetic-page-2' } } };
  }
  function smithery(options, body) {
    const url = new URL(options.path, 'https://api.smithery.ai');
    if (options.headers.authorization !== 'Bearer ' + pluginSmitheryKeyData) throw Error('unexpected_synthetic_smithery_key');
    if (url.pathname === '/namespaces' && options.method === 'GET') return { status: 200, data: { namespaces: [{ name: pluginOwnedNamespace }] } };
    if (url.pathname === '/servers' && options.method === 'GET') {
      const page = Number(url.searchParams.get('page'));
      if (![1, 2].includes(page) || url.searchParams.get('pageSize') !== '24') throw Error('unexpected_synthetic_smithery_page');
      return { status: 200, data: { servers: [{ qualifiedName: page === 1 ? 'synthetic/weather' : 'synthetic/page-two', displayName: page === 1 ? 'Synthetic Weather' : 'Synthetic Page Two', description: 'Explicit terminal platform DATA', verified: true, isDeployed: true }], pagination: { totalPages: 2 } } };
    }
    const match = /^\/connect\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (!match || match[1] !== pluginOwnedNamespace || url.search) throw Error('unexpected_synthetic_managed_path');
    const id = match[2];
    if (options.method === 'PUT') {
      if (!body || body.transport !== 'http' || !/^[a-f0-9]{64}$/.test(body.metadata?.agent_studio_binding || '')) throw Error('missing_actual_binding_proof');
      managed.set(id, { connectionId: id, transport: body.transport, metadata: { agent_studio_binding: body.metadata.agent_studio_binding } });
    }
    const stored = managed.get(id);
    if (!stored) return { status: 404, data: { error: 'synthetic_remote_absent' } };
    if (options.method === 'DELETE') { managed.delete(id); return { status: 200, data: {} }; }
    if (!['GET', 'PUT'].includes(options.method)) throw Error('unexpected_synthetic_managed_method');
    return { status: 200, data: { ...stored, status: { state: authorized ? 'connected' : 'auth_required', setupUrl: authorized ? '' : pluginOwnedSetupUrl, missing: authorized ? [] : ['synthetic authorization'] }, mock: { enabled: false } } };
  }
  function mcp(options, body) {
    if (options.method !== 'POST' || !body || body.jsonrpc !== '2.0') throw Error('unexpected_synthetic_MCP_request');
    if (body.method === 'notifications/initialized') return { status: 202, data: null };
    if (!Number.isSafeInteger(body.id)) throw Error('synthetic_MCP_id_required');
    let result;
    if (body.method === 'initialize') result = { protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'Synthetic terminal DATA', version: '1.0.0' } };
    else if (body.method === 'tools/list') result = { tools: [pluginToolData] };
    else if (body.method === 'tools/call') {
      if (body.params?.name !== 'echo' || typeof body.params.arguments?.text !== 'string') throw Error('unexpected_synthetic_tool_arguments');
      result = { content: [{ type: 'text', text: 'Owned MCP DATA: ' + body.params.arguments.text }], isError: false };
    } else throw Error('unlisted_synthetic_MCP_method');
    return { status: 200, data: { jsonrpc: '2.0', id: body.id, result } };
  }
  const ports = {
    async resolve4(hostname) {
      if (!['registry.modelcontextprotocol.io', 'api.smithery.ai', 'tools.example.com', 'server.smithery.ai'].includes(hostname)) throw Error('unlisted_synthetic_DNS_host');
      dns.push(hostname); return ['93.184.216.34'];
    },
    async resolve6() { return []; },
    request(options, callback) {
      attempts++;
      if (options.protocol !== 'https:' || options.rejectUnauthorized !== true || options.minVersion !== 'TLSv1.2') throw Error('production_TLS_options_required');
      const request = new EventEmitter(); let ended = false, destroyed = false;
      request.setTimeout = () => request;
      request.destroy = error => { destroyed = true; if (error) request.emit('error', error); return request; };
      request.end = bytes => {
        ends++; if (ended) throw Error('synthetic_request_end_replayed'); ended = true;
        const body = bytes?.length ? JSON.parse(Buffer.from(bytes).toString('utf8')) : null;
        const answer = options.hostname === 'registry.modelcontextprotocol.io' ? registry(options) : options.hostname === 'api.smithery.ai' ? smithery(options, body) : ['tools.example.com', 'server.smithery.ai'].includes(options.hostname) ? mcp(options, body) : (() => { throw Error('unlisted_synthetic_request_host'); })();
        calls.push({ method: options.method, hostname: options.hostname, kind: options.hostname === 'registry.modelcontextprotocol.io' ? 'registry' : options.hostname === 'api.smithery.ai' ? 'smithery' : 'mcp', rpc: body?.method || '' });
        queueMicrotask(() => {
          if (destroyed) return;
          const response = new EventEmitter(); response.statusCode = answer.status; response.headers = { 'content-type': 'application/json', 'mcp-session-id': 'synthetic-session' };
          response.destroy = () => { response.destroyed = true; }; callback(response);
          if (!response.destroyed && answer.data !== null) response.emit('data', Buffer.from(JSON.stringify(answer.data)));
          if (!response.destroyed) response.emit('end');
        });
        return request;
      };
      return request;
    }
  };
  return { ports, authorizeRemoteDATA: () => { authorized = true; }, snapshot: () => ({ attempts, ends, calls: calls.map(row => ({ ...row })), dns: [...dns] }) };
}
