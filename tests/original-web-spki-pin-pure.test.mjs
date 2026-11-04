// Actual story AST/options and public certificate DATA only. No Chromium,
// fixture, Native identity, SQL, Worker, TLS connection or browser starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash, X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';

const ts = createRequire(import.meta.url)('typescript');
const text = fs.readFileSync(new URL('./pg-original-web-pages-genuine.spec.mjs', import.meta.url), 'utf8');
const ast = ts.createSourceFile('stories.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
assert.equal(ast.parseDiagnostics.length, 0);
let spki, launch;
const contexts = [], certificateSources = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'spki') { assert.equal(spki, undefined); spki = node; }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'chromium.launch') { assert.equal(launch, undefined); launch = node; }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'browser.newContext') contexts.push(node);
  if (ts.isNewExpression(node) && node.expression.getText(ast) === 'X509Certificate') certificateSources.push(node.arguments[0].getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
function options(certificateData) {
  const f = { serverTls: { cert: certificateData } };
  const pin = new vm.Script('(' + spki.initializer.getText(ast) + ')').runInNewContext({ f, createHash, X509Certificate });
  const launchOptions = new vm.Script('(' + launch.arguments[0].getText(ast) + ')').runInNewContext({ spki: pin });
  return { pin, launchOptions };
}
test('the actual SPKI expression binds f.serverTls.cert after the real fixture is created and before launch', () => {
  assert(spki); assert(launch); assert.equal(JSON.stringify(certificateSources), JSON.stringify(['f.serverTls.cert']));
  assert(spki.getStart(ast) < launch.getStart(ast));
  assert(text.indexOf('const f = await startOriginalWebPagesFixture()') < spki.getStart(ast));
});
test('actual launch options allow exactly the certificate DATA SPKI, with no global browser TLS bypass', () => {
  const result = options(rootCertificates[0]);
  assert.match(result.pin, /^[A-Za-z0-9+/]{43}=$/);
  assert.equal(result.launchOptions.headless, true);
  assert.equal(JSON.stringify(result.launchOptions.args), JSON.stringify(['--ignore-certificate-errors-spki-list=' + result.pin]));
  assert.equal(Object.keys(result.launchOptions).sort().join(','), 'args,headless');
});
test('changing the certificate DATA changes the actual launch pin; no constant or caller-supplied pin is accepted', () => {
  assert.notEqual(options(rootCertificates[0]).pin, options(rootCertificates[1]).pin);
});
test('missing or malformed certificate DATA fails before options can be produced, without fallback', () => {
  for (const value of [undefined, '', 'not a certificate']) assert.throws(() => options(value));
});
test('both actual context option objects retain normal TLS verification', () => {
  assert.equal(contexts.length, 2);
  for (const context of contexts) {
    assert.equal(context.arguments.length, 1);
    const value = new vm.Script('(' + context.arguments[0].getText(ast) + ')').runInNewContext({});
    assert.equal(JSON.stringify(value), '{}');
  }
});
test('the actual story uses no global TLS-ignore option or TLS environment bypass', () => {
  assert.equal(text.includes('ignoreHTTPSErrors'), false);
  assert.equal(text.includes("'--ignore-certificate-errors'"), false);
  for (const name of ['NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'NODE_OPTIONS']) assert.equal(text.includes(name), false);
});
