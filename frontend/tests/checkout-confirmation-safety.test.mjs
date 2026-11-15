import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// All accounts and orders belong to a disposable JSON store; the provider is mocked.
const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const oldCwd = process.cwd();
const oldDatabaseUrl = process.env.DATABASE_URL;
const oldNodeEnv = process.env.NODE_ENV;
const oldFetch = global.fetch;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-checkout-confirm-'));
process.chdir(temp);
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
global.fetch = async () => { throw new Error('Unexpected network call'); };
const db = require('../src/server/database.ts');
const guards = require('../src/server/guards.ts');
guards.getOptionalViewer = async () => null;
const checkout = require('../src/app/api/v1/billing/checkout/route.ts');
const { LEGAL_DOCUMENT_VERSION } = require('../src/lib/legal-version.ts');
const { MAX_BUNDLE_ITEMS, toggleBundleSelection } = require('../src/lib/checkout-policy.ts');
const { NextRequest } = require('next/server');

after(() => {
  global.fetch = oldFetch;
  process.chdir(oldCwd);
  if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDatabaseUrl;
  if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
  rmSync(temp, { recursive: true, force: true });
});

async function createBuyer(name) {
  return db.registerUserAccount({ email: `${name}@example.test`, password: 'test-password', displayName: name });
}
async function createPrediction(name) {
  return db.createPredictionByAdmin({
    sport: 'FOOTBALL', leagueName: 'Тест', homeTeam: 'Дом', awayTeam: name,
    matchStartsAt: '2035-01-01T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2, stakeUnits: 1,
    accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: false,
    analysisTeaser: 'Анонс', analysisFull: 'Разбор', pushToTelegram: false,
  });
}
function orderArgs(userId, predictionId, extra = {}) {
  return { userId, kind: 'SINGLE_PREDICTION', predictionId, paymentMethod: 'yookassa',
    expectedAmountRub: 500, expectedPaymentMode: 'TEST_INSTANT', originUrl: 'https://example.test', ...extra };
}
function barrierProvider(expectedCalls = 1) {
  let count = 0, startedResolve, releaseResolve;
  const started = new Promise((resolve) => { startedResolve = resolve; });
  const release = new Promise((resolve) => { releaseResolve = resolve; });
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.yookassa.ru/v3/payments');
    const body = JSON.parse(options.body);
    count++;
    if (count === expectedCalls) startedResolve();
    await release;
    return { ok: true, status: 200, json: async () => ({
      id: `provider-${body.metadata.orderId}`, status: 'pending',
      confirmation: { confirmation_url: 'https://checkout.example.test/confirm' },
    }) };
  };
  return { started, release: releaseResolve, calls: () => count };
}

test('price, mode, and promo changes cannot silently charge a different amount', async () => {
  const buyer = await createBuyer('stale-quote');
  const prediction = await createPrediction('stale-quote');
  await db.mutateState((state) => {
    state.settings.paymentMode = 'TEST_INSTANT';
    state.users.find((u) => u.id === buyer.id).balanceRub = 2000;
  });
  const args = orderArgs(buyer.id, prediction.id, { paymentMethod: 'internal_balance' });
  await assert.rejects(db.initiateOrderCheckout({ ...args, expectedAmountRub: 400 }), /Цена или состав заказа изменились/);
  await assert.rejects(db.initiateOrderCheckout({ ...args, expectedPaymentMode: 'YOOKASSA_LIVE' }), /Режим оплаты изменился/);
  await db.mutateState((state) => { state.promoCodes.find((p) => p.code === 'START15').active = false; });
  await assert.rejects(db.initiateOrderCheckout({ ...args, promoCode: 'START15', expectedAmountRub: 425 }), /Промокод больше не действует/);
  const state = await db.readState();
  assert.equal(state.users.find((u) => u.id === buyer.id).balanceRub, 2000);
  assert.equal(state.transactions.some((o) => o.userId === buyer.id), false);
});

test('checkout rejects missing confirmation or overlarge bundles before creating a guest account', async () => {
  const before = (await db.readState()).users.length;
  const base = { kind: 'BUNDLE_PREDICTIONS', paymentMethod: 'yookassa', guestEmail: 'no-account@example.test',
    offerAccepted: true, rulesAccepted: true, personalDataConsent: true, legalVersion: LEGAL_DOCUMENT_VERSION };
  for (const body of [
    { ...base, predictionIds: ['p1'] },
    { ...base, predictionIds: Array(MAX_BUNDLE_ITEMS + 1).fill('p1'), expectedAmountRub: 500, expectedPaymentMode: 'TEST_INSTANT' },
  ]) {
    const res = await checkout.POST(new NextRequest('https://example.test/api/v1/billing/checkout', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    assert.equal(res.status, 400);
  }
  assert.equal((await db.readState()).users.length, before);
  const all = Array.from({ length: MAX_BUNDLE_ITEMS + 1 }, (_, i) => `p${i}`);
  let selected = [];
  for (const id of all) selected = toggleBundleSelection(selected, id, all);
  assert.equal(selected.length, MAX_BUNDLE_ITEMS);
  assert.equal(selected.includes(all.at(-1)), false);
  selected = toggleBundleSelection(selected, all[0], all);
  selected = toggleBundleSelection(selected, all.at(-1), all);
  assert.equal(selected.length, MAX_BUNDLE_ITEMS);
  assert.equal(selected.includes(all.at(-1)), true);
});

test('concurrent pending orders reserve the last promo use before calling the provider', async () => {
  const buyers = [await createBuyer('promo-race-a'), await createBuyer('promo-race-b')];
  const prediction = await createPrediction('promo-race');
  await db.mutateState((state) => {
    state.settings.paymentMode = 'YOOKASSA_LIVE';
    state.settings.yookassaShopId = 'test-shop';
    state.settings.yookassaSecretKey = 'test-secret';
    state.promoCodes.push({ id: 'once', code: 'ONLYONE', discountPercent: 15, maxUses: 1, usedCount: 0, active: true, createdAt: new Date().toISOString() });
  });
  const provider = barrierProvider();
  const args = (buyer) => orderArgs(buyer.id, prediction.id, {
    expectedPaymentMode: 'YOOKASSA_LIVE', expectedAmountRub: 425, promoCode: 'ONLYONE',
  });
  const first = db.initiateOrderCheckout(args(buyers[0]));
  await provider.started;
  try {
    const reserved = await db.readState();
    assert.equal(reserved.transactions.filter((o) => o.promoCode === 'ONLYONE').length, 1);
    assert.equal(reserved.transactions.find((o) => o.promoCode === 'ONLYONE').providerCreationState, 'CREATING');
    await assert.rejects(db.initiateOrderCheckout(args(buyers[1])), /Промокод/);
    assert.equal(provider.calls(), 1);
  } finally {
    provider.release();
  }
  const order = (await first).order;
  let state = await db.readState();
  assert.equal(state.transactions.filter((o) => o.promoCode === 'ONLYONE').length, 1);
  assert.equal(db.calculateCartPricing({ state, predictionIds: [prediction.id], promoCode: 'ONLYONE' }).promoValidCode, null);
  const verified = { id: order.externalPaymentId, status: 'succeeded', paid: true, amountValue: '425.00', currency: 'RUB', metadata: { orderId: order.id, userId: order.userId } };
  await db.fulfillOrderPayment(order.id, verified);
  await db.fulfillOrderPayment(order.id, verified);
  state = await db.readState();
  assert.equal(state.promoCodes.find((p) => p.code === 'ONLYONE').usedCount, 1);
  assert.equal(db.calculateCartPricing({ state, predictionIds: [prediction.id], promoCode: 'ONLYONE' }).promoValidCode, null);
  global.fetch = async () => { throw new Error('Unexpected network call'); };
});

test('overlapping checkouts make only one provider request, including after a retry', async () => {
  const buyer = await createBuyer('duplicate-race');
  const prediction = await createPrediction('duplicate-race');
  await db.mutateState((state) => { state.settings.paymentMode = 'YOOKASSA_LIVE'; });
  const provider = barrierProvider();
  const args = orderArgs(buyer.id, prediction.id, { expectedPaymentMode: 'YOOKASSA_LIVE' });
  const first = db.initiateOrderCheckout(args);
  await provider.started;
  try {
    await assert.rejects(db.initiateOrderCheckout(args), /ожидающий заказ/);
    assert.equal(provider.calls(), 1);
  } finally {
    provider.release();
  }
  const order = (await first).order;
  const state = await db.readState();
  assert.equal(state.transactions.filter((o) => o.userId === buyer.id && o.status === 'PENDING').length, 1);
  assert.equal(order.providerCreationState, 'READY');
  assert.equal(provider.calls(), 1);
  await assert.rejects(db.initiateOrderCheckout(args), /ожидающий заказ/);
  assert.equal(provider.calls(), 1);
  global.fetch = async () => { throw new Error('Unexpected network call'); };
});

test('an unresolved top-up also blocks a second external request', async () => {
  const buyer = await createBuyer('topup-race');
  await db.mutateState((state) => { state.settings.paymentMode = 'YOOKASSA_LIVE'; });
  const provider = barrierProvider();
  const args = { userId: buyer.id, kind: 'BALANCE_TOPUP', topupAmountRub: 1000,
    paymentMethod: 'yookassa', expectedAmountRub: 1000, expectedPaymentMode: 'YOOKASSA_LIVE', originUrl: 'https://example.test' };
  const first = db.initiateOrderCheckout(args);
  await provider.started;
  try {
    await assert.rejects(db.initiateOrderCheckout({ ...args, topupAmountRub: 2000, expectedAmountRub: 2000 }), /ожидающее пополнение/);
    assert.equal(provider.calls(), 1);
  } finally {
    provider.release();
  }
  assert.equal((await first).order.status, 'PENDING');
  global.fetch = async () => { throw new Error('Unexpected network call'); };
});
