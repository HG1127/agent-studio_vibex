import { requireOriginalWebPagesCi } from '../../services/pg-api/tests/helpers/original-web-pages-genuine-guard.mjs';
import { createOriginalWebTerminalData } from './pg-original-web-terminal-data.mjs';
import { startOriginalToolHubGenuineFixture } from './pg-original-toolhub-genuine-fixture.mjs';

export async function startOriginalWebPagesFixture(env = process.env) {
  const purpose = requireOriginalWebPagesCi(env);
  const [fs, path, url, crypto] = await Promise.all([import('node:fs'), import('node:path'), import('node:url'), import('node:crypto')]);
  const root = url.fileURLToPath(new URL('../../', import.meta.url));
  const bytes = fs.readFileSync(path.join(root, 'tests/helpers/pg-original-web-pages-reviewed-sources.json'));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== env.AGENT_STUDIO_ORIGINAL_WEB_PAGES_SOURCES_SHA256) throw Error('original_web_pages_source_manifest_changed');
  const reviewed = JSON.parse(bytes);
  if (reviewed.format !== 'original-web-pages-reviewed-sources.v1' || !Array.isArray(reviewed.files) || reviewed.files.length < 2000) throw Error('original_web_pages_complete_reviewed_sources_required');
  const seen = new Set();
  for (const pin of reviewed.files) {
    if (!/^[A-Za-z0-9_./-]+$/.test(pin.path) || pin.path.split('/').some(segment => !segment || segment === '..' || segment === '.' || segment === '.git') ||
        seen.has(pin.path) || !/^[a-f0-9]{64}$/.test(pin.sha256) || /^0{64}$/.test(pin.sha256) ||
        fs.lstatSync(path.join(root, pin.path)).isSymbolicLink() || crypto.createHash('sha256').update(fs.readFileSync(path.join(root, pin.path))).digest('hex') !== pin.sha256) throw Error('original_web_pages_reviewed_source_changed');
    seen.add(pin.path);
  }
  const data = createOriginalWebTerminalData(purpose.story);
  const fixture = await startOriginalToolHubGenuineFixture(env, { webDataPorts: data.ports });
  return { ...fixture, webStory: purpose.story, webData: data };
}
