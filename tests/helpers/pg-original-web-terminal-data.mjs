// Explicit final DNS / response DATA only. Never replaces identity, leases,
// approval, Native API, Worker, production Broker or its beforeDial callback.
import { EventEmitter } from 'node:events';

export const originalWebCitationUrl = 'https://citation.example.com/story';
export const originalWebCitationText = 'Owned synthetic citation SECOND';
export function createOriginalWebTerminalData(story) {
  if (!['search_citations', 'fetch_cancel', 'search_unknown_recovery'].includes(story)) throw Error('unknown_web_DATA_story');
  const calls = [], dns = [];
  let enterDns, releaseDns, attempts = 0, ends = 0;
  const entered = new Promise(resolve => { enterDns = resolve; });
  const released = new Promise(resolve => { releaseDns = resolve; });
  const wrapped = '//html.duckduckgo.com/l/?uddg=' + encodeURIComponent(originalWebCitationUrl);
  const html = '<div class="result"><a class="result__a" href="https://127.0.0.1/">Rejected private address</a><a class="result__snippet">FIRST rejected snippet</a></div>' +
    '<div class="result"><a class="result__a" href="' + wrapped + '">Owned synthetic citation</a><a class="result__snippet" href="' + originalWebCitationUrl + '">' + originalWebCitationText + '</a></div>';
  const ambiguousHtml = '<div class="result"><a class="result__a" href="https://alpha.example.com/">TITLE_A</a><a class="result__snippet" title="x > y" href="https://beta.example.com/">FOREIGN_SNIPPET</a></div>';
  const ports = {
    async resolve4(hostname) {
      if (!['html.duckduckgo.com', 'public.example.com'].includes(hostname)) throw Error('unexpected_synthetic_DNS_name');
      dns.push(hostname);
      if (story === 'fetch_cancel') { enterDns(); await released; }
      return ['93.184.216.34'];
    },
    async resolve6() { return []; },
    request(options, callback) {
      attempts++;
      if (story === 'fetch_cancel') throw Error('cancelled_web_task_must_not_dial');
      if (calls.length || options.method !== 'POST' || options.hostname !== 'html.duckduckgo.com' ||
          options.path !== '/html/?q=synthetic%20original%20query' || options.rejectUnauthorized !== true || options.minVersion !== 'TLSv1.2') {
        throw Error('unexpected_or_replayed_synthetic_web_request');
      }
      calls.push({ method: options.method, hostname: options.hostname, path: options.path });
      const request = new EventEmitter();
      let ended = false, destroyed = false;
      request.setTimeout = () => request;
      request.destroy = error => { destroyed = true; if (error) request.emit('error', error); return request; };
      request.end = () => {
        ends++;
        if (ended) throw Error('synthetic_request_end_replayed');
        ended = true;
        queueMicrotask(() => {
          if (destroyed) return;
          const response = new EventEmitter();
          response.statusCode = 200;
          response.headers = { 'content-type': 'text/html; charset=utf-8' };
          response.destroy = () => { response.destroyed = true; };
          callback(response);
          if (response.destroyed) return;
          response.emit('data', Buffer.from(story === 'search_citations' ? html : ambiguousHtml));
          if (!response.destroyed) response.emit('end');
        });
        return request;
      };
      return request;
    }
  };
  return { ports, entered, release: () => releaseDns(), snapshot: () => ({ attempts, ends, calls: calls.map(row => ({ ...row })), dns: [...dns] }) };
}
