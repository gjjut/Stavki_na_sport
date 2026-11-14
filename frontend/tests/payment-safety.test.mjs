import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const originalCwd = process.cwd();
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalFetch = global.fetch;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-payment-test-'));
process.chdir(temp);
process.env.DATABASE_URL = '';
global.fetch = async () => { throw new Error('Real network disabled in tests'); };
const { registerUserAccount, createPredictionByAdmin, mutateState, readState, fulfillOrderPayment, verifyAndSyncOrderFromReturn } = require('../src/server/database.ts');
const { assertYooKassaPaymentMatchesOrder } = require('../src/server/payment-policy.ts');
const webhook = require('../src/app/api/v1/webhooks/yookassa/route.ts');
const guards = require('../src/server/guards.ts');
let returnViewer = null;
guards.requireAuthenticatedUser = async () => {
  if (!returnViewer) throw new Error('UNAUTHORIZED');
  return returnViewer;
};
const returnRoute = require('../src/app/api/v1/billing/verify-return/route.ts');
const { NextRequest } = require('next/server');

after(() => {
  global.fetch = originalFetch;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  process.chdir(originalCwd);
  rmSync(temp, { recursive: true, force: true });
});

async function fixture(name, extra = {}) {
  const user = await registerUserAccount({ email: `${name}@example.test`, password: 'testpassword', displayName: name });
  const prediction = await createPredictionByAdmin({
    sport: 'FOOTBALL', leagueName: 'Лига', homeTeam: 'Дом', awayTeam: name,
    matchStartsAt: '2035-01-01T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2,
    stakeUnits: 1, accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: true,
    analysisTeaser: 'Анонс', analysisFull: 'Аналитика', pushToTelegram: false,
  });
  const order = {
    id: `ord-${name}`, externalPaymentId: `pay-${name}`, idempotenceKey: `idem-${name}`,
    userId: user.id, userEmail: user.email, kind: 'SINGLE_PREDICTION', predictionId: prediction.id,
    predictionIds: [prediction.id], promoCode: null, discountRub: 0, title: name,
    amountRub: 500, paymentMethod: 'yookassa', status: 'PENDING', receiptEmail: user.email,
    confirmationUrl: null, affiliateUserId: null, affiliateCommissionRub: 0,
    createdAt: '2026-11-12T00:00:00.000Z', paidAt: null, ...extra,
  };
  await mutateState((state) => {
    state.settings.paymentMode = 'YOOKASSA_LIVE';
    state.settings.yookassaShopId = 'test-shop';
    state.settings.yookassaSecretKey = 'test-key';
    state.transactions.unshift(order);
  });
  return { user, prediction, order };
}

function payment(order, overrides = {}) {
  return {
    id: order.externalPaymentId, status: 'succeeded', paid: true,
    amount: { value: `${order.amountRub}.00`, currency: 'RUB' },
    metadata: { orderId: order.id, userId: order.userId }, ...overrides,
  };
}
function mockPayment(order, overrides = {}) {
  global.fetch = async (url, options) => {
    assert.equal(url, `https://api.yookassa.ru/v3/payments/${encodeURIComponent(order.externalPaymentId)}`);
    assert.equal(options.method, 'GET');
    return { ok: true, status: 200, json: async () => payment(order, overrides) };
  };
}
function notify(event, id, extra = {}) {
  return webhook.POST(new NextRequest('http://localhost/api/v1/webhooks/yookassa', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, object: { id, ...extra } }),
  }));
}
function verified(order) {
  return { id: order.externalPaymentId, status: 'succeeded', paid: true,
    amountValue: `${order.amountRub}.00`, currency: 'RUB', metadata: { orderId: order.id, userId: order.userId } };
}
function checkReturn(orderId) {
  return returnRoute.POST(new NextRequest('http://localhost/api/v1/billing/verify-return', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }),
  }));
}

test('payment return requires the order owner and returns only the fields used by the page', async () => {
  const { user, prediction, order } = await fixture('return-privacy');
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Must not contact provider'); };
  returnViewer = null;
  assert.equal((await checkReturn(order.id)).status, 401);
  returnViewer = { id: 'another-user' };
  assert.equal((await checkReturn(order.id)).status, 404);
  assert.equal(calls, 0);
  returnViewer = user;
  mockPayment(order);
  const response = await checkReturn(order.id);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.order).sort(), ['amountRub', 'id', 'kind', 'status', 'title']);
  assert.equal(body.order.status, 'SUCCEEDED');
  const state = await readState();
  assert.deepEqual(state.users.find((u) => u.id === user.id).purchasedPredictionIds, [prediction.id]);
  returnViewer = null;
});

test('verified payments must match the local ID, ruble amount, currency and metadata', () => {
  const order = { id: 'o', userId: 'u', externalPaymentId: 'p', paymentMethod: 'yookassa', amountRub: 500 };
  const good = { id: 'p', status: 'succeeded', paid: true, amountValue: '500.00', currency: 'RUB', metadata: { orderId: 'o', userId: 'u' } };
  assert.doesNotThrow(() => assertYooKassaPaymentMatchesOrder(order, good));
  for (const bad of [
    { id: 'other' }, { amountValue: '500.01' }, { amountValue: '5e2' }, { amountValue: '499.99' },
    { currency: 'USD' }, { metadata: {} }, { metadata: { orderId: 'o', userId: 'other' } },
  ]) assert.throws(() => assertYooKassaPaymentMatchesOrder(order, { ...good, ...bad }));
});

test('public webhooks cannot simulate payments or refunds in test mode', async () => {
  const { user, order } = await fixture('test-mode');
  await mutateState((state) => { state.settings.paymentMode = 'TEST_INSTANT'; });
  let networkCalls = 0;
  global.fetch = async () => { networkCalls++; throw new Error('Must not contact provider'); };
  for (const event of ['payment.succeeded', 'payment.canceled', 'refund.succeeded']) {
    const res = await notify(event, order.externalPaymentId, { payment_id: order.externalPaymentId });
    assert.equal(res.status, 503);
  }
  const state = await readState();
  assert.equal(state.transactions.find((item) => item.id === order.id).status, 'PENDING');
  assert.equal(state.users.find((item) => item.id === user.id).balanceRub, 0);
  assert.equal(networkCalls, 0);
});

test('forged or mismatched payment data cannot settle an order; valid repeats are idempotent', async () => {
  const { user, prediction, order } = await fixture('payment-check');
  for (const mismatch of [
    { amount: { value: '500.01', currency: 'RUB' } },
    { amount: { value: '500.00', currency: 'USD' } },
    { metadata: { orderId: order.id, userId: 'wrong-user' } },
    { id: 'different-payment' },
  ]) {
    mockPayment(order, mismatch);
    const res = await notify('payment.succeeded', order.externalPaymentId);
    assert.equal(res.status, 400);
    const state = await readState();
    assert.equal(state.transactions.find((item) => item.id === order.id).status, 'PENDING');
    assert.equal(state.users.find((item) => item.id === user.id).purchasedPredictionIds.includes(prediction.id), false);
  }
  mockPayment(order);
  const res = await notify('payment.succeeded', order.externalPaymentId);
  assert.equal(res.status, 200);
  const duplicate = await notify('payment.succeeded', order.externalPaymentId);
  assert.equal((await duplicate.json()).duplicate, true);
  const state = await readState();
  assert.equal(state.transactions.find((item) => item.id === order.id).status, 'SUCCEEDED');
  assert.deepEqual(state.users.find((item) => item.id === user.id).purchasedPredictionIds, [prediction.id]);
});

test('concurrent verified notifications credit a balance top-up only once', async () => {
  const { user, order } = await fixture('concurrent-topup', { kind: 'BALANCE_TOPUP', predictionId: null, predictionIds: [] });
  mockPayment(order);
  const results = await Promise.all([
    notify('payment.succeeded', order.externalPaymentId),
    notify('payment.succeeded', order.externalPaymentId),
  ]);
  assert.ok(results.every((response) => response.status === 200));
  const state = await readState();
  assert.equal(state.users.find((item) => item.id === user.id).balanceRub, 500);
  assert.equal(state.transactions.find((item) => item.id === order.id).status, 'SUCCEEDED');
});

test('canceled and refunded orders cannot be revived by a late success', async () => {
  for (const status of ['CANCELED', 'REFUNDED']) {
    const { user, order } = await fixture(`terminal-${status.toLowerCase()}`, { status });
    mockPayment(order);
    const res = await notify('payment.succeeded', order.externalPaymentId);
    assert.equal(res.status, 400);
    await assert.rejects(fulfillOrderPayment(order.id, verified(order)), /отменён или возвращён/);
    const state = await readState();
    assert.equal(state.transactions.find((item) => item.id === order.id).status, status);
    assert.deepEqual(state.users.find((item) => item.id === user.id).purchasedPredictionIds, []);
    let calls = 0;
    global.fetch = async () => { calls++; throw new Error('Must not recheck terminal orders'); };
    assert.equal((await verifyAndSyncOrderFromReturn(order.id)).status, status);
    assert.equal(calls, 0);
  }
});

test('a late canceled response cannot overwrite a concurrently confirmed payment', async () => {
  const { order } = await fixture('cancel-race');
  let notifyStarted;
  let release;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  global.fetch = async () => {
    notifyStarted();
    await pending;
    return { ok: true, status: 200, json: async () => payment(order, { status: 'canceled', paid: false }) };
  };
  const verify = verifyAndSyncOrderFromReturn(order.id);
  await started;
  try {
    await fulfillOrderPayment(order.id, verified(order));
  } finally {
    release();
  }
  assert.equal((await verify).status, 'SUCCEEDED');
  assert.equal((await readState()).transactions.find((item) => item.id === order.id).status, 'SUCCEEDED');
});

test('unverified and mismatched refund notifications do not change an order', async () => {
  const { user, order } = await fixture('refund-fail-closed', { status: 'SUCCEEDED' });
  global.fetch = async () => { throw new Error('provider offline'); };
  let res = await notify('refund.succeeded', 'refund-id', { payment_id: order.externalPaymentId });
  assert.equal(res.status, 400);
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.yookassa.ru/v3/refunds/refund-id');
    assert.equal(options.method, 'GET');
    return { ok: true, status: 200, json: async () => ({
      id: 'refund-id', payment_id: order.externalPaymentId, status: 'succeeded', amount: { value: '500.00', currency: 'RUB' },
    }) };
  };
  res = await notify('refund.succeeded', 'refund-id', { payment_id: 'wrong-payment' });
  assert.equal(res.status, 400);
  const state = await readState();
  assert.equal(state.transactions.find((item) => item.id === order.id).status, 'SUCCEEDED');
  assert.equal(state.transactions.find((item) => item.id === order.id).externalRefundNotices, undefined);
  assert.equal(state.users.find((item) => item.id === user.id).balanceRub, 0);
});

test('only a succeeded, well-formed refund belonging to a local YooKassa order is recorded', async () => {
  const { order } = await fixture('refund-validation', { status: 'SUCCEEDED' });
  for (const [id, details, expectedStatus] of [
    ['pending-refund', { status: 'pending' }, 200],
    ['different-id', { id: 'not-the-requested-id' }, 400],
    ['bad-amount', { amount: { value: 'garbage', currency: 'RUB' } }, 400],
    ['unknown-order', { payment_id: 'missing-payment' }, 400],
  ]) {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({
      id, payment_id: order.externalPaymentId, status: 'succeeded', amount: { value: '100.00', currency: 'RUB' }, ...details,
    }) });
    const result = await notify('refund.succeeded', id);
    assert.equal(result.status, expectedStatus);
    if (id === 'pending-refund') assert.equal((await result.json()).ignored, true);
  }
  const state = await readState();
  assert.equal(state.transactions.find((item) => item.id === order.id).externalRefundNotices, undefined);
});

test('verified partial refunds are recorded once for manual review, without automatic money or access changes', async () => {
  const { user, prediction, order } = await fixture('refund-partial', { status: 'SUCCEEDED' });
  await mutateState((state) => {
    const buyer = state.users.find((item) => item.id === user.id);
    buyer.balanceRub = 50;
    buyer.purchasedPredictionIds.push(prediction.id);
  });
  global.fetch = async (url) => {
    assert.equal(url, 'https://api.yookassa.ru/v3/refunds/refund-partial');
    return { ok: true, status: 200, json: async () => ({
      id: 'refund-partial', payment_id: order.externalPaymentId, status: 'succeeded', amount: { value: '100.00', currency: 'RUB' },
    }) };
  };
  const responses = await Promise.all([
    notify('refund.succeeded', 'refund-partial', { payment_id: order.externalPaymentId }),
    notify('refund.succeeded', 'refund-partial', { payment_id: order.externalPaymentId }),
  ]);
  assert.ok(responses.every((response) => response.status === 200));
  const state = await readState();
  const recorded = state.transactions.find((item) => item.id === order.id);
  const buyer = state.users.find((item) => item.id === user.id);
  assert.equal(recorded.status, 'SUCCEEDED');
  assert.equal(recorded.externalRefundNotices.length, 1);
  assert.equal(recorded.externalRefundNotices[0].amountValue, '100.00');
  assert.equal(buyer.balanceRub, 50);
  assert.deepEqual(buyer.purchasedPredictionIds, [prediction.id]);
  const { quoteBalanceRefund } = require('../src/lib/admin-finance-policy.ts');
  assert.equal(quoteBalanceRefund(recorded).ok, false);
  const duplicate = await notify('refund.succeeded', 'refund-partial', { payment_id: order.externalPaymentId });
  assert.equal((await duplicate.json()).duplicate, true);
});

test('a later verified external refund is flagged even after a balance refund', async () => {
  const { user, order } = await fixture('refund-conflict', {
    status: 'REFUNDED', refundDestination: 'BALANCE', refundBalanceAmountRub: 500,
  });
  await mutateState((state) => { state.users.find((item) => item.id === user.id).balanceRub = 500; });
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    id: 'external-refund', payment_id: order.externalPaymentId, status: 'succeeded', amount: { value: '500.00', currency: 'RUB' },
  }) });
  const response = await notify('refund.succeeded', 'external-refund', { payment_id: order.externalPaymentId });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reconciliationRequired, true);
  const state = await readState();
  const recorded = state.transactions.find((item) => item.id === order.id);
  assert.equal(recorded.refundDestination, 'BALANCE');
  assert.equal(recorded.externalRefundNotices[0].id, 'external-refund');
  assert.equal(state.users.find((item) => item.id === user.id).balanceRub, 500);
});
