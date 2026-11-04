import { originalPageCiIdentity } from './original-page-ci-entry.mjs';
import { requireToolHubOriginalHomeCi } from './tool-hub-original-home-guard.mjs';

export const originalPluginMarketCases = Object.freeze(['registry_connections', 'smithery_management', 'invoke_translation']);
export function selectOriginalPluginMarketPurpose(env) {
  const ref = 'refs/heads/codex/pg18-worker-heartbeat-20261028';
  if (env.AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_CI !== 'YES_DISPOSABLE_ORIGINAL_PLUGIN_MARKET_ONLY' ||
      !originalPluginMarketCases.includes(env.AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_CASE) ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== ref ||
      !originalPageCiIdentity(env, 'plugin') ||
      env.GITHUB_JOB !== 'pg18-tool-hub-browser' || env.AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE !== 'browser' ||
      env.AGENT_STUDIO_PG18_SMITHERY_UAT_ENABLED !== 'true' || env.AGENT_STUDIO_PG18_SMITHERY_UAT_APPROVED !== 'APPROVE_DISPOSABLE_PG18_SMITHERY_MANAGEMENT_ONLY' ||
      env.AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_ENABLED !== 'true' || env.AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_APPROVED !== 'APPROVE_DISPOSABLE_PG18_MCP_DISCOVERY_ONLY' ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') || env.AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_EXPECTED_HEAD !== env.GITHUB_SHA ||
      !/^[a-f0-9]{64}$/.test(env.AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_SOURCES_SHA256 ?? '') || /^0{64}$/.test(env.AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_SOURCES_SHA256)) {
    throw Error('original_plugin_market_fresh_reviewed_purpose_required');
  }
  return Object.freeze({ story: env.AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_CASE, head: env.GITHUB_SHA });
}
export function requireOriginalPluginMarketCi(env = process.env) {
  const purpose = selectOriginalPluginMarketPurpose(env);
  requireToolHubOriginalHomeCi(env);
  return purpose;
}
export function validateOriginalPluginDataPorts(ports) {
  if (!ports || Object.getPrototypeOf(ports) !== Object.prototype || Object.keys(ports).sort().join(',') !== 'request,resolve4,resolve6' || Object.values(ports).some(value => typeof value !== 'function')) {
    throw Error('original_plugin_terminal_DNS_HTTP_DATA_only');
  }
  return ports;
}
