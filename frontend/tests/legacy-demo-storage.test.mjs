import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const cwd = process.cwd();
const oldDatabaseUrl = process.env.DATABASE_URL;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-demo-refs-test-'));
process.chdir(temp);
delete process.env.DATABASE_URL;
mkdirSync('.data');
const raw = {
  settings: {},
  users: [{ id: 'u', email: 'user@example.test', role: 'USER', purchasedPredictionIds: ['pred_init_1'], grantedPredictionIds: ['pred_init_2'] }],
  transactions: [
    { id: 'o1', kind: 'SINGLE_PREDICTION', status: 'PENDING', predictionId: 'pred_init_3' },
    { id: 'o2', kind: 'BUNDLE_PREDICTIONS', status: 'SUCCEEDED', predictionIds: ['pred_init_4'] },
    { id: 'o3', kind: 'SINGLE_PREDICTION', status: 'REFUNDED', predictionId: 'pred_init_5' },
  ],
  predictions: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `pred_init_${i}`, accessTier: 'PAID_SINGLE', resultStatus: 'PENDING' })),
  aiDrafts: [{ id: 'draft-untouched' }],
};
const original = JSON.stringify(raw);
writeFileSync('.data/valuex-production.json', original);
const { readState, mutateState } = require('../src/server/database.ts');
const { replaceDemoWithRealMatches } = require('../src/server/ai-autopilot.ts');
const originalFetch = global.fetch;
after(() => {
  global.fetch = originalFetch;
  if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDatabaseUrl;
  process.chdir(cwd);
  rmSync(temp, { recursive: true, force: true });
});

test('normalization and unrelated writes never silently delete old demo records', async () => {
  const state = await readState();
  assert.deepEqual(state.predictions.map((p) => p.id), ['pred_init_1', 'pred_init_2', 'pred_init_3', 'pred_init_4', 'pred_init_5', 'pred_init_6']);
  assert.equal(readFileSync('.data/valuex-production.json', 'utf8'), original);
  await mutateState((draft) => { draft.settings.brandName = 'test'; });
  const stored = JSON.parse(readFileSync('.data/valuex-production.json', 'utf8'));
  assert.deepEqual(stored.predictions.map((p) => p.id), ['pred_init_1', 'pred_init_2', 'pred_init_3', 'pred_init_4', 'pred_init_5', 'pred_init_6']);
  assert.deepEqual(stored.aiDrafts, [{ id: 'draft-untouched' }]);
});

test('explicit cleanup preserves purchased, gifted and all ordered cards and unrelated drafts', async () => {
  // Every source fails immediately and no real bookmaker or model is contacted.
  global.fetch = async () => new Response('{}', { status: 503 });
  const result = await replaceDemoWithRealMatches();
  assert.equal(result.removedDemoCount, 1);
  assert.equal(result.createdCount, 0);
  const state = await readState();
  assert.deepEqual(state.predictions.map((p) => p.id), ['pred_init_1', 'pred_init_2', 'pred_init_3', 'pred_init_4', 'pred_init_5']);
  assert.deepEqual(state.aiDrafts, [{ id: 'draft-untouched' }]);
});
