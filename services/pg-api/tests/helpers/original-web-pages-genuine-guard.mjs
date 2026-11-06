import { originalPageCiIdentity } from './original-page-ci-entry.mjs';
import { requireToolHubOriginalHomeCi } from './tool-hub-original-home-guard.mjs';

export const originalWebPageCases = Object.freeze(['search_citations', 'fetch_cancel', 'search_unknown_recovery']);
export function selectOriginalWebPagePurpose(env) {
  const ref = 'refs/heads/codex/pg18-worker-heartbeat-20261028';
  if (env.AGENT_STUDIO_ORIGINAL_WEB_PAGES_CI !== 'YES_DISPOSABLE_ORIGINAL_WEB_PAGES_ONLY' ||
      !originalWebPageCases.includes(env.AGENT_STUDIO_ORIGINAL_WEB_PAGES_CASE) ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== ref ||
      !originalPageCiIdentity(env, 'web') ||
      env.GITHUB_JOB !== 'pg18-tool-hub-browser' || env.AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE !== 'browser' ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') || env.AGENT_STUDIO_ORIGINAL_WEB_PAGES_EXPECTED_HEAD !== env.GITHUB_SHA ||
      !/^[a-f0-9]{64}$/.test(env.AGENT_STUDIO_ORIGINAL_WEB_PAGES_SOURCES_SHA256 ?? '') ||
      /^0{64}$/.test(env.AGENT_STUDIO_ORIGINAL_WEB_PAGES_SOURCES_SHA256)) {
    throw Error('original_web_pages_reviewed_fresh_purpose_required');
  }
  return Object.freeze({ story: env.AGENT_STUDIO_ORIGINAL_WEB_PAGES_CASE, head: env.GITHUB_SHA });
}
export function requireOriginalWebPagesCi(env = process.env) {
  const purpose = selectOriginalWebPagePurpose(env);
  requireToolHubOriginalHomeCi(env);
  return purpose;
}
export function validateOriginalWebDataPorts(ports) {
  if (!ports || Object.getPrototypeOf(ports) !== Object.prototype ||
      Object.keys(ports).sort().join(',') !== 'request,resolve4,resolve6' ||
      Object.values(ports).some(value => typeof value !== 'function')) {
    throw Error('original_web_final_dns_request_DATA_only');
  }
  return ports;
}
