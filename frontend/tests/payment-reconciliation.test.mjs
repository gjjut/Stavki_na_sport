import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// These integration tests write only to a disposable JSON store and mock all provider requests.
const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const oldCwd = process.cwd();
const oldDb = process.env.DATABASE_URL;
const oldEnv = process.env.NODE_ENV;
const oldFetch = global.fetch;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-reconcile-'));
process.chdir(temp);
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
global.fetch = async () => { throw new Error('Unexpected real network request'); };
const db = require('../src/server/database.ts');
const guards = require('../src/server/guards.ts');
let adminAllowed = true;
guards.requireAdminAccount = async () => { if (!adminAllowed) throw new Error('UNAUTHORIZED'); return { id: 'test-admin' }; };
const finance = require('../src/app/api/v1/admin/finance/route.ts');
const webhook = require('../src/app/api/v1/webhooks/yookassa/route.ts');
const { toCustomerOrder } = require('../src/server/order-dto.ts');
const { NextRequest } = require('next/server');

after(() => {
  global.fetch = oldFetch;
  process.chdir(oldCwd);
  if (oldDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDb;
  if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
  rmSync(temp, { recursive: true, force: true });
});

async function fixture(name, usePromo = false) {
  const user = await db.registerUserAccount({ email: `${name}@example.test`, password: 'test-password', displayName: name });
  const prediction = await db.createPredictionByAdmin({
    sport: 'FOOTBALL', leagueName: 'Тест', homeTeam: 'Дом', awayTeam: name,
    matchStartsAt: '2035-01-01T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2, stakeUnits: 1,
    accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: false,
    analysisTeaser: 'Анонс', analysisFull: 'Разбор', pushToTelegram: false,
  });
  const code = `P${name.replace(/[^a-z]/gi, '').toUpperCase()}`.slice(0, 24);
  await db.mutateState((state) => {
    state.settings.paymentMode = 'YOOKASSA_LIVE';
    state.settings.yookassaShopId = 'test-shop';
    state.settings.yookassaSecretKey = 'test-secret';
    if (usePromo) state.promoCodes.push({ id: code, code, discountPercent: 20, maxUses: 1, usedCount: 0, active: true, createdAt: new Date().toISOString() });
  });
  return { user, prediction, code, args: {
    userId: user.id, kind: 'SINGLE_PREDICTION', predictionId: prediction.id,
    paymentMethod: 'yookassa', expectedAmountRub: usePromo ? 400 : 500,
    expectedPaymentMode: 'YOOKASSA_LIVE', originUrl: 'https://example.test', ...(usePromo ? { promoCode: code } : {}),
  } };
}
function providerPayment(order, id, status = 'succeeded', overrides = {}) {
  return { id, status, paid: status === 'succeeded', amount: { value: `${order.amountRub}.00`, currency: 'RUB' },
    metadata: { orderId: order.id, userId: order.userId }, ...overrides };
}
function notify(event, id, extra = {}) {
  return webhook.POST(new NextRequest('https://example.test/api/v1/webhooks/yookassa', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, object: { id, ...extra } }),
  }));
}
function sync(body) {
  return finance.PATCH(new NextRequest('https://example.test/api/v1/admin/finance', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'SYNC_PAYMENT', ...body }),
  }));
}
async function createUnknown(f) {
  let payload, key, calls = 0;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.yookassa.ru/v3/payments');
    calls++;
    payload = JSON.parse(options.body);
    key = options.headers['Idempotence-Key'];
    throw new Error('Response lost after provider received request');
  };
  await assert.rejects(db.initiateOrderCheckout(f.args), /Заказ .*до повторной оплаты/);
  const order = (await db.readState()).transactions.find((item) => item.userId === f.user.id);
  assert.equal(order.status, 'PENDING');
  assert.equal(order.providerCreationState, 'UNKNOWN');
  assert.equal(order.externalPaymentId, '');
  assert.equal(order.id, payload.metadata.orderId);
  assert.equal(order.idempotenceKey, key);
  await assert.rejects(db.initiateOrderCheckout(f.args), /ожидающий заказ/);
  assert.equal(calls, 1);
  return order;
}

test('lost provider response leaves a local reservation and verified webhook can recover it after mode switch', async () => {
  const f = await fixture('lost-webhook', true);
  const order = await createUnknown(f);
  await db.mutateState((state) => { state.settings.paymentMode = 'TEST_INSTANT'; });
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.yookassa.ru/v3/payments/pay-recovered');
    assert.equal(options.method, 'GET');
    return { ok: true, status: 200, json: async () => providerPayment(order, 'pay-recovered') };
  };
  const result = await notify('payment.succeeded', 'pay-recovered');
  assert.equal(result.status, 200);
  const duplicate = await notify('payment.succeeded', 'pay-recovered');
  assert.equal((await duplicate.json()).duplicate, true);
  const state = await db.readState();
  const recovered = state.transactions.find((item) => item.id === order.id);
  assert.equal(recovered.externalPaymentId, 'pay-recovered');
  assert.equal(recovered.status, 'SUCCEEDED');
  assert.equal(state.promoCodes.find((p) => p.code === f.code).usedCount, 1);
  assert.deepEqual(state.users.find((u) => u.id === f.user.id).purchasedPredictionIds, [f.prediction.id]);
  assert.equal(calls, 1);
});

test('admin reconciliation checks real provider data and releases a reservation only on verified cancellation', async () => {
  const f = await fixture('admin-cancel', true);
  const order = await createUnknown(f);
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.yookassa.ru/v3/payments/pay-admin');
    assert.equal(options.method, 'GET');
    return { ok: true, status: 200, json: async () => providerPayment(order, 'pay-admin', 'canceled', { metadata: { orderId: order.id, userId: 'wrong-user' } }) };
  };
  adminAllowed = false;
  assert.notEqual((await sync({ orderId: order.id, externalPaymentId: 'pay-admin' })).status, 200);
  adminAllowed = true;
  assert.equal(calls, 0);
  assert.equal((await sync({ orderId: order.id, externalPaymentId: 'pay-admin' })).status, 400);
  let state = await db.readState();
  assert.equal(state.transactions.find((item) => item.id === order.id).externalPaymentId, '');
  assert.equal(state.transactions.find((item) => item.id === order.id).status, 'PENDING');
  assert.equal(db.calculateCartPricing({ state, predictionIds: [f.prediction.id], promoCode: f.code }).promoValidCode, null);
  global.fetch = async () => ({ ok: true, status: 200, json: async () => providerPayment(order, 'pay-admin', 'canceled') });
  const result = await sync({ orderId: order.id, externalPaymentId: 'pay-admin' });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).order.status, 'CANCELED');
  state = await db.readState();
  assert.equal(state.transactions.find((item) => item.id === order.id).externalPaymentId, 'pay-admin');
  assert.equal(state.promoCodes.find((p) => p.code === f.code).usedCount, 0);
  assert.equal(db.calculateCartPricing({ state, predictionIds: [f.prediction.id], promoCode: f.code }).promoValidCode, f.code);
});

test('a webhook arriving before the create response binds the same order exactly once', async () => {
  const f = await fixture('webhook-race');
  let announce, release;
  const started = new Promise((resolve) => { announce = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  global.fetch = async (url, options) => {
    if (options.method === 'POST') {
      announce();
      await blocked;
      return { ok: true, status: 200, json: async () => ({ id: 'pay-fast', status: 'pending', confirmation: { confirmation_url: 'https://checkout.example.test/' } }) };
    }
    const order = (await db.readState()).transactions.find((item) => item.userId === f.user.id);
    return { ok: true, status: 200, json: async () => providerPayment(order, 'pay-fast') };
  };
  const checkout = db.initiateOrderCheckout(f.args);
  await started;
  try {
    const response = await notify('payment.succeeded', 'pay-fast');
    assert.equal(response.status, 200);
  } finally { release(); }
  const result = await checkout;
  assert.equal(result.paidImmediately, true);
  assert.equal(result.order.status, 'SUCCEEDED');
  assert.equal(result.order.confirmationUrl, null);
  const state = await db.readState();
  assert.equal(state.transactions.filter((o) => o.userId === f.user.id).length, 1);
  assert.deepEqual(state.users.find((u) => u.id === f.user.id).purchasedPredictionIds, [f.prediction.id]);
});

test('refund arriving before success is recorded for review and prevents later automatic fulfillment', async () => {
  const f = await fixture('early-refund');
  const order = await createUnknown(f);
  global.fetch = async (url) => {
    if (url.endsWith('/refunds/ref-early')) return { ok: true, status: 200, json: async () => ({
      id: 'ref-early', payment_id: 'pay-refunded', status: 'succeeded', amount: { value: '500.00', currency: 'RUB' },
    }) };
    assert.equal(url, 'https://api.yookassa.ru/v3/payments/pay-refunded');
    return { ok: true, status: 200, json: async () => providerPayment(order, 'pay-refunded') };
  };
  const refund = await notify('refund.succeeded', 'ref-early', { payment_id: 'pay-refunded' });
  assert.equal(refund.status, 200);
  assert.equal((await refund.json()).reconciliationRequired, true);
  const later = await notify('payment.succeeded', 'pay-refunded');
  assert.equal(later.status, 400);
  const state = await db.readState();
  assert.equal(state.transactions.find((o) => o.id === order.id).status, 'PENDING');
  assert.equal(state.transactions.find((o) => o.id === order.id).externalRefundNotices.length, 1);
  assert.deepEqual(state.users.find((u) => u.id === f.user.id).purchasedPredictionIds, []);
});

test('customer order view omits provider and affiliate identifiers and unsafe redirects', () => {
  const order = { id: 'order', kind: 'BALANCE_TOPUP', title: 'test', amountRub: 500,
    paymentMethod: 'yookassa', status: 'PENDING', createdAt: 'now', promoCode: null, discountRub: 0,
    externalPaymentId: 'secret-provider-id', idempotenceKey: 'secret-key', affiliateUserId: 'partner',
    confirmationUrl: 'javascript:alert(1)' };
  const dto = toCustomerOrder(order);
  assert.equal(dto.confirmationUrl, null);
  assert.equal(dto.externalPaymentId, undefined);
  assert.equal(dto.idempotenceKey, undefined);
  assert.equal(dto.affiliateUserId, undefined);
  assert.equal(toCustomerOrder({ ...order, confirmationUrl: 'https://checkout.example.test/confirm' }).confirmationUrl, 'https://checkout.example.test/confirm');
  assert.equal(toCustomerOrder({ ...order, status: 'SUCCEEDED', confirmationUrl: 'https://checkout.example.test/' }).confirmationUrl, null);
});
