import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Import the real database only after changing cwd: every write goes to this disposable directory.
const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const originalCwd = process.cwd();
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalFetch = global.fetch;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-checkout-test-'));
process.chdir(temp);
process.env.DATABASE_URL = '';
global.fetch = async () => { throw new Error('Unexpected real network request in test'); };
const { createPredictionByAdmin, registerUserAccount, initiateOrderCheckout, mutateState, readState } = require('../src/server/database.ts');
const { deleteUnownedPrediction } = require('../src/server/admin-prediction-policy.ts');
// Route tests focus on the mutation policy; authorization itself is covered elsewhere.
const guards = require('../src/server/guards.ts');
guards.requireAdminAccount = async () => ({ id: 'test-admin' });
const predictionRoute = require('../src/app/api/v1/admin/predictions/route.ts');
const userRoute = require('../src/app/api/v1/admin/users/route.ts');
const financeRoute = require('../src/app/api/v1/admin/finance/route.ts');
const { NextRequest } = require('next/server');

after(() => {
  global.fetch = originalFetch;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  process.chdir(originalCwd);
  rmSync(temp, { recursive: true, force: true });
});

async function makePurchaseFixture(suffix) {
  const buyer = await registerUserAccount({ email: `${suffix}@example.test`, password: 'testpassword', displayName: suffix });
  const prediction = await createPredictionByAdmin({
    sport: 'FOOTBALL', leagueName: 'Лига', homeTeam: 'Дом', awayTeam: suffix,
    matchStartsAt: '2035-01-01T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2,
    stakeUnits: 1, accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: true,
    analysisTeaser: 'Анонс', analysisFull: 'Аналитика', pushToTelegram: false,
  });
  await mutateState((state) => {
    state.settings.paymentMode = 'YOOKASSA_LIVE';
    state.settings.yookassaShopId = 'test-shop';
    state.settings.yookassaSecretKey = 'test-key';
  });
  return { buyer, prediction };
}

const checkoutFor = ({ buyer, prediction }) => initiateOrderCheckout({
  userId: buyer.id, kind: 'SINGLE_PREDICTION', predictionId: prediction.id,
  paymentMethod: 'yookassa', originUrl: 'https://example.test',
});
const paymentResponse = (id) => ({
  ok: true, status: 200,
  json: async () => ({ id, status: 'pending', confirmation: { confirmation_url: 'https://example.test/confirm' } }),
});

test('a deleted event cannot be inserted into an order from a stale pre-payment snapshot', async () => {
  const fixture = await makePurchaseFixture('race-delete-first');
  let startRequest;
  let releaseRequest;
  const started = new Promise((resolve) => { startRequest = resolve; });
  const released = new Promise((resolve) => { releaseRequest = resolve; });
  global.fetch = async (url) => {
    assert.equal(url, 'https://api.yookassa.ru/v3/payments');
    startRequest();
    await released;
    return paymentResponse('fake-provider-id-1');
  };
  const checkout = checkoutFor(fixture);
  await started;
  try {
    await mutateState((state) => deleteUnownedPrediction(state, fixture.prediction.id));
  } finally {
    releaseRequest();
  }
  await assert.rejects(checkout, /уже недоступно/);
  const state = await readState();
  assert.equal(state.predictions.some((p) => p.id === fixture.prediction.id), false);
  assert.equal(state.transactions.some((order) => order.predictionIds.includes(fixture.prediction.id)), false);
  assert.equal(state.users.find((u) => u.id === fixture.buyer.id).purchasedPredictionIds.includes(fixture.prediction.id), false);
});

test('an already recorded pending checkout prevents event deletion', async () => {
  const fixture = await makePurchaseFixture('race-order-first');
  global.fetch = async (url) => {
    assert.equal(url, 'https://api.yookassa.ru/v3/payments');
    return paymentResponse('fake-provider-id-2');
  };
  const result = await checkoutFor(fixture);
  assert.equal(result.order.status, 'PENDING');
  await assert.rejects(mutateState((state) => deleteUnownedPrediction(state, fixture.prediction.id)), /нельзя удалить/);
  const state = await readState();
  assert.equal(state.predictions.some((p) => p.id === fixture.prediction.id), true);
  assert.equal(state.transactions.some((order) => order.id === result.order.id), true);
  const res = await predictionRoute.DELETE(new NextRequest(`http://localhost/api/v1/admin/predictions?id=${fixture.prediction.id}`, { method: 'DELETE' }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /нельзя удалить/);
});

test('API rejects stale featured and gift targets without changing other data', async () => {
  const fixture = await makePurchaseFixture('stale-api-targets');
  await mutateState((state) => {
    for (const p of state.predictions) p.isFeatured = p.id === fixture.prediction.id;
  });
  const featuredResponse = await predictionRoute.PATCH(new NextRequest('http://localhost/api/v1/admin/predictions', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ predictionId: 'missing', setFeatured: true }),
  }));
  assert.equal(featuredResponse.status, 400);
  assert.match((await featuredResponse.json()).error, /не найдено/);
  const userResponse = await userRoute.PATCH(new NextRequest('http://localhost/api/v1/admin/users', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'GRANT_PREDICTION', userId: fixture.buyer.id, predictionId: 'missing' }),
  }));
  assert.equal(userResponse.status, 400);
  assert.match((await userResponse.json()).error, /не найдено/);
  const state = await readState();
  assert.equal(state.predictions.find((p) => p.id === fixture.prediction.id).isFeatured, true);
  assert.deepEqual(state.users.find((u) => u.id === fixture.buyer.id).purchasedPredictionIds, []);
});

test('a gift recorded after a purchase survives an admin balance refund', async () => {
  const fixture = await makePurchaseFixture('gifted-purchase');
  await mutateState((state) => {
    state.settings.paymentMode = 'TEST_INSTANT';
    state.users.find((user) => user.id === fixture.buyer.id).balanceRub = 1000;
  });
  const checkout = await initiateOrderCheckout({
    userId: fixture.buyer.id, kind: 'SINGLE_PREDICTION', predictionId: fixture.prediction.id,
    paymentMethod: 'internal_balance', originUrl: 'https://example.test',
  });
  const gift = await userRoute.PATCH(new NextRequest('http://localhost/api/v1/admin/users', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'GRANT_PREDICTION', userId: fixture.buyer.id, predictionId: fixture.prediction.id }),
  }));
  assert.equal(gift.status, 200);
  const refund = await financeRoute.PATCH(new NextRequest('http://localhost/api/v1/admin/finance', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'REFUND_ORDER', orderId: checkout.order.id }),
  }));
  assert.equal(refund.status, 200);
  assert.deepEqual((await refund.json()).retainedPredictionIds, [fixture.prediction.id]);
  const state = await readState();
  const buyer = state.users.find((user) => user.id === fixture.buyer.id);
  assert.deepEqual(buyer.grantedPredictionIds, [fixture.prediction.id]);
  assert.deepEqual(buyer.purchasedPredictionIds, [fixture.prediction.id]);
  assert.equal(buyer.balanceRub, 1000);
});
