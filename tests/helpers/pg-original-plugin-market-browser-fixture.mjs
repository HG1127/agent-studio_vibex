// Future CI only: actual original main/App employee page and verified Native
// Cookie, fresh PG, repositories, Worker and private mTLS. Authored/unrun.
import { requireOriginalPluginMarketCi } from '../../services/pg-api/tests/helpers/original-plugin-market-genuine-guard.mjs';
import { createOriginalPluginTerminalData } from './pg-original-plugin-market-terminal-data.mjs';
import { toolHubGenuineFixture } from '../../services/pg-api/tests/helpers/tool-hub-genuine-fixture.mjs';

export async function startOriginalPluginMarketBrowserFixture(env = process.env) {
  const purpose = requireOriginalPluginMarketCi(env);
  const [fs, path, url, https, viteModule, reactModule, crypto] = await Promise.all([import('node:fs'), import('node:path'), import('node:url'), import('node:https'), import('vite'), import('@vitejs/plugin-react'), import('node:crypto')]);
  const root = url.fileURLToPath(new URL('../../', import.meta.url));
  const sourceBytes = fs.readFileSync(path.join(root, 'tests/helpers/pg-original-plugin-market-reviewed-sources.json'));
  if (crypto.createHash('sha256').update(sourceBytes).digest('hex') !== env.AGENT_STUDIO_ORIGINAL_PLUGIN_MARKET_SOURCES_SHA256) throw Error('original_plugin_reviewed_manifest_changed');
  const source = JSON.parse(sourceBytes), seen = new Set();
  if (source.format !== 'original-plugin-market-reviewed-sources.v1' || !Array.isArray(source.files) || source.files.length < 2103) throw Error('original_plugin_complete_reviewed_sources_required');
  for (const pin of source.files) {
    if (!/^[A-Za-z0-9_./-]+$/.test(pin.path) || pin.path.split('/').some(part => !part || part === '..' || part === '.' || part === '.git') || seen.has(pin.path) ||
        !/^[a-f0-9]{64}$/.test(pin.sha256) || /^0{64}$/.test(pin.sha256) || fs.lstatSync(path.join(root, pin.path)).isSymbolicLink() || crypto.createHash('sha256').update(fs.readFileSync(path.join(root, pin.path))).digest('hex') !== pin.sha256) throw Error('original_plugin_reviewed_source_changed');
    seen.add(pin.path);
  }
  const parent = path.join(root, '.tmp/pg-migration-completion'); fs.mkdirSync(parent, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(parent, 'original-plugin-market-browser-'));
  let fixture, vite, agent, closed = false;
  const close = async () => {
    if (closed) return; closed = true; const errors = [];
    try { await vite?.close(); } catch (error) { errors.push(error); }
    agent?.destroy(); try { await fixture?.close(); } catch (error) { errors.push(error); }
    if (path.dirname(fs.realpathSync(scratch)) !== fs.realpathSync(parent) || !path.basename(scratch).startsWith('original-plugin-market-browser-')) throw Error('original_plugin_owned_cleanup_required');
    fs.rmSync(scratch, { recursive: true, force: true });
    if (errors.length) throw new AggregateError(errors, 'original_plugin_fixture_cleanup_failed');
  };
  try {
    const terminalData = createOriginalPluginTerminalData(purpose.story);
    fixture = await toolHubGenuineFixture(env, { browserMode: true, originalHomeReadOnly: true, pluginPageDataPorts: terminalData.ports });
    const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Original PluginMarket isolated actual PG</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
    const target = new URL(fixture.nativeOrigin);
    agent = new https.Agent({ ca: fixture.serverTls.ca, rejectUnauthorized: true, servername: 'localhost' });
    const originalEntry = { name: 'original-plugin-owned-entry', configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url || '/', 'https://localhost:17443').pathname;
        if (!['/', '/login', '/plugin-market'].includes(pathname)) return next();
        try { const document = await server.transformIndexHtml(pathname, html); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(document); } catch (error) { next(error); }
      });
    } };
    vite = await viteModule.createServer({ configFile: false, envFile: false, root, appType: 'custom', plugins: [reactModule.default(), originalEntry],
      define: { 'import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED': '"true"', 'import.meta.env.VITE_AGENT_STUDIO_PG_NATIVE_LOCAL_UI_ENABLED': '"false"', 'import.meta.env.VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED': '"false"' },
      cacheDir: path.join(scratch, 'vite-cache'), resolve: { alias: { '@': path.join(root, 'src') } },
      server: { host: '127.0.0.1', port: 17443, strictPort: true, https: fixture.serverTls, hmr: false, ws: false, watch: null,
        proxy: { '/__pg_native': { target: 'https://127.0.0.1:' + target.port, agent, secure: true, changeOrigin: true, rewrite: value => value.replace(/^\/__pg_native(?=\/|$)/, '') } } } });
    await vite.listen();
    const spki = crypto.createHash('sha256').update(new crypto.X509Certificate(fixture.serverTls.cert).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    return { ...fixture, browserOrigin: 'https://localhost:17443', url: 'https://localhost:17443/plugin-market', spki, pluginStory: purpose.story, terminalData, close,
      evidenceScope: 'Actual original main/App/PluginMarket and owner PG/Native/repos/Worker/mTLS; final registry/MCP/Smithery HTTP and existing model provider DATA only. Actual external vendor authorization is not qualified.' };
  } catch (error) { await close(); throw error; }
}
