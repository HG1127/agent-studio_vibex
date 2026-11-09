import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript');
const source = fs.readFileSync(new URL('../src/pages/ExecutionConnections/ExecutionConnectionsPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ExecutionConnectionsPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const expressions = [];
function visit(node) {
  if (ts.isJsxExpression(node) && node.expression) {
    const text = node.expression.getText(ast);
    if (text.includes('inventory.known.http') && text.includes('inventory.known.market')) expressions.push(text);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(expressions.length, 2, 'Both original count cards must be exercised');
const cards = expressions.map(text => new vm.Script(`(${text})`));
const inventoryCases = [
  { http: false, market: false, nativeKnown: false, pocketBaseKnown: false },
  { http: false, market: true, nativeKnown: false, pocketBaseKnown: true },
  { http: true, market: false, nativeKnown: false, pocketBaseKnown: true },
  { http: true, market: true, nativeKnown: true, pocketBaseKnown: true }
];

for (const nativeBackend of [true, false]) {
  test(`${nativeBackend ? 'PG' : 'PocketBase'}: actual original JSX count expressions preserve backend-specific unknown data semantics`, () => {
    for (const fixture of inventoryCases) for (const inventoryLoading of [false, true]) for (const isLoggedIn of [false, true]) {
      const data = {
        nativeBackend, inventoryLoading, isLoggedIn,
        inventory: { known: { http: fixture.http, market: fixture.market } },
        capabilities: Array.from({ length: 7 }, (_, id) => ({ id })), verifiedCount: 3
      };
      const known = nativeBackend ? fixture.nativeKnown : fixture.pocketBaseKnown;
      const expected = !inventoryLoading && isLoggedIn && known ? [7, 3] : ['—', '—'];
      for (let card = 0; card < cards.length; card++) {
        const actual = cards[card].runInNewContext(data, { timeout: 1000 });
        assert.equal(actual, expected[card], JSON.stringify({ nativeBackend, http: fixture.http, market: fixture.market, inventoryLoading, isLoggedIn, card }));
      }
    }
  });
}
