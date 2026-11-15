import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const cwd = process.cwd(), oldDb = process.env.DATABASE_URL;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-pricing-'));
process.chdir(temp);
process.env.DATABASE_URL = '';
const db = require('../src/server/database.ts');
const guards = require('../src/server/guards.ts');
guards.requireAdminAccount = async () => ({ id: 'test-admin' });
const finance = require('../src/app/api/v1/admin/finance/route.ts');
const { NextRequest } = require('next/server');
function patch(body) {
  return finance.PATCH(new NextRequest('http://localhost/api/v1/admin/finance', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}
after(() => {
  process.chdir(cwd);
  if (oldDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDb;
  rmSync(temp, { recursive: true, force: true });
});

test('invalid pricing and promo inputs do not persist corrupted or silently changed values', async () => {
  const before = await db.readState();
  const oldSettings = { ...before.settings };
  const oldPromos = before.promoCodes.length;
  const pricing = { action: 'SAVE_PRICING_RULES', defaultSinglePriceRub: 500, bundle2DiscountPct: 10, bundle3DiscountPct: 20 };
  for (const bad of [
    { defaultSinglePriceRub: null }, { defaultSinglePriceRub: '500' }, { defaultSinglePriceRub: 50.1 },
    { defaultSinglePriceRub: 10000001 }, { bundle2DiscountPct: -1 }, { bundle3DiscountPct: 61 }, { applyToPending: 'false' },
  ]) assert.equal((await patch({ ...pricing, ...bad })).status, 400);
  const promo = { action: 'CREATE_PROMO', code: 'SALE20', discountPercent: 20, maxUses: 1 };
  for (const bad of [
    { code: '   ' }, { code: 'SA LE' }, { code: 'SALE$20' }, { discountPercent: null },
    { discountPercent: 61 }, { maxUses: 0 }, { maxUses: '100' }, { maxUses: 1000001 },
  ]) assert.equal((await patch({ ...promo, ...bad })).status, 400);
  const state = await db.readState();
  assert.equal(state.settings.defaultSinglePriceRub, oldSettings.defaultSinglePriceRub);
  assert.equal(state.settings.bundle2DiscountPct, oldSettings.bundle2DiscountPct);
  assert.equal(state.settings.bundle3DiscountPct, oldSettings.bundle3DiscountPct);
  assert.equal(state.promoCodes.length, oldPromos);
  assert.equal((await patch(pricing)).status, 200);
  assert.equal((await patch(promo)).status, 200);
});

test('promo reserved by a pending order cannot be deleted until the order is terminal', async () => {
  const promo = (await db.readState()).promoCodes.find((p) => p.code === 'SALE20');
  await db.mutateState((state) => state.transactions.push({
    id: 'pending-order', idempotenceKey: 'test', externalPaymentId: '', userId: 'buyer', userEmail: 'buyer@example.test',
    kind: 'SINGLE_PREDICTION', predictionId: 'p', predictionIds: ['p'], promoCode: 'SALE20', discountRub: 100,
    title: 'test', amountRub: 400, paymentMethod: 'yookassa', paymentModeAtCreation: 'YOOKASSA_LIVE',
    providerCreationState: 'UNKNOWN', status: 'PENDING', receiptEmail: 'buyer@example.test', confirmationUrl: null,
    affiliateUserId: null, affiliateCommissionRub: 0, createdAt: new Date().toISOString(), paidAt: null,
  }));
  const blocked = await patch({ action: 'DELETE_PROMO', promoId: promo.id });
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json()).error, /ожидающими заказами/);
  assert.ok((await db.readState()).promoCodes.some((p) => p.id === promo.id));
  // This test simulates a separately verified terminal state; the delete operation itself never cancels a payment.
  await db.mutateState((state) => { state.transactions.find((t) => t.id === 'pending-order').status = 'CANCELED'; });
  assert.equal((await patch({ action: 'DELETE_PROMO', promoId: promo.id })).status, 200);
  assert.equal((await patch({ action: 'DELETE_PROMO', promoId: promo.id })).status, 400);
});
