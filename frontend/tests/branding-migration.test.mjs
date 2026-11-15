import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { BRAND_NAME, BRAND_MONOGRAM, publicBrandName } = await loadTypeScriptModule(
  new URL('../src/lib/brand.ts', import.meta.url),
);
const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const originalCwd = process.cwd();
const originalDb = process.env.DATABASE_URL;
const temp = mkdtempSync(path.join(tmpdir(), 'predictlab-brand-test-'));
process.chdir(temp);
delete process.env.DATABASE_URL;
mkdirSync('.data');
const file = path.join(temp, '.data', 'valuex-production.json');
const raw = {
  settings: { brandName: 'VALUEX', supportTelegram: 'https://t.me/owner_support', paymentMode: 'YOOKASSA_LIVE' },
  users: [{ id: 'u1', email: 'person@example.test', passwordHash: 'existing-hash', role: 'USER', status: 'ACTIVE', balanceRub: 137,
    referralCode: 'valuex_official', purchasedPredictionIds: ['p1'], telegramUsername: '@existing_owner', telegramBindingVerified: true }],
  predictions: [{ id: 'p1', accessTier: 'PAID_SINGLE', resultStatus: 'PENDING' }],
  transactions: [{ id: 't1', kind: 'SINGLE_PREDICTION', status: 'SUCCEEDED', predictionId: 'p1', externalPaymentId: 'payment-1' }],
  affiliateLinks: [{ id: 'a1', code: 'valuex_official' }],
  aiDrafts: [{ id: 'draft-untouched' }],
};
const original = JSON.stringify(raw);
writeFileSync(file, original);
const db = require('../src/server/database.ts');

after(() => {
  process.chdir(originalCwd);
  if (originalDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDb;
  rmSync(temp, { recursive: true, force: true });
});

test('only the exact legacy default migrates; owner-defined brand names remain intact', () => {
  assert.equal(BRAND_NAME, 'PredictLab');
  assert.equal(BRAND_MONOGRAM, 'PL');
  assert.equal(publicBrandName('VALUEX'), 'PredictLab');
  assert.equal(publicBrandName(undefined), 'PredictLab');
  assert.equal(publicBrandName(null), 'PredictLab');
  for (const custom of ['VALUEX.PRO', 'Valuex', 'Моя компания', '']) assert.equal(publicBrandName(custom), custom);
});

test('legacy state is branded on read without an implicit write or loss of accounts and orders', async () => {
  const state = await db.readState();
  assert.equal(state.settings.brandName, 'PredictLab');
  assert.equal(state.settings.supportTelegram, 'https://t.me/owner_support');
  assert.equal(state.settings.paymentMode, 'YOOKASSA_LIVE');
  assert.equal(state.users[0].passwordHash, 'existing-hash');
  assert.equal(state.users[0].balanceRub, 137);
  assert.equal(state.users[0].referralCode, 'valuex_official');
  assert.deepEqual(state.users[0].purchasedPredictionIds, ['p1']);
  assert.equal(state.users[0].telegramUsername, '@existing_owner');
  assert.equal(state.transactions[0].externalPaymentId, 'payment-1');
  assert.equal(state.affiliateLinks[0].code, 'valuex_official');
  assert.deepEqual(state.aiDrafts, [{ id: 'draft-untouched' }]);
  assert.equal(readFileSync(file, 'utf8'), original, 'reading does not rewrite the persisted legacy snapshot');

  await db.mutateState((draft) => { draft.settings.defaultSinglePriceRub = 456; });
  const stored = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(stored.settings.brandName, 'PredictLab');
  assert.equal(stored.users[0].passwordHash, 'existing-hash');
  assert.equal(stored.transactions[0].externalPaymentId, 'payment-1');
  assert.equal(stored.affiliateLinks[0].code, 'valuex_official');
  assert.deepEqual(stored.aiDrafts, [{ id: 'draft-untouched' }]);

  await db.mutateState((draft) => { draft.settings.brandName = 'Свой бренд'; });
  assert.equal((await db.readState()).settings.brandName, 'Свой бренд');
});

test('a fresh isolated state starts with PredictLab without renaming storage', () => {
  const fresh = mkdtempSync(path.join(tmpdir(), 'predictlab-fresh-'));
  try {
    const loader = require.resolve('./ui-test-utils.cjs');
    const database = require.resolve('../src/server/database.ts');
    const script = `require(${JSON.stringify(loader)}); require(${JSON.stringify(database)}).readState().then(s => console.log(s.settings.brandName));`;
    const out = execFileSync(process.execPath, ['-e', script], {
      cwd: fresh,
      env: { ...process.env, DATABASE_URL: '', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'test-password-123' },
      encoding: 'utf8',
    });
    assert.equal(out.trim(), 'PredictLab');
    const stored = JSON.parse(readFileSync(path.join(fresh, '.data', 'valuex-production.json'), 'utf8'));
    assert.equal(stored.settings.brandName, 'PredictLab');
    assert.equal(stored.users[0].telegramUsername, null, 'fresh admin has no invented Telegram username');
    assert.equal(stored.users[0].referralCode, 'valuex_official', 'legacy referral identifier remains compatible');
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
});
