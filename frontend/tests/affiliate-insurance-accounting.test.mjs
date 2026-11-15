import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Every mutation uses its own disposable JSON database; no real integration is called.
const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const previousCwd = process.cwd();
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousFetch = global.fetch;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-accounting-test-'));
process.chdir(temp);
process.env.DATABASE_URL = '';
global.fetch = async () => { throw new Error('Unexpected network request in test'); };
const db = require('../src/server/database.ts');
const guards = require('../src/server/guards.ts');
let viewer = null;
guards.requireAuthenticatedUser = async () => {
  if (!viewer) throw new Error('UNAUTHORIZED');
  return viewer;
};
const affiliateRoute = require('../src/app/api/v1/affiliate/route.ts');
const { NextRequest } = require('next/server');
const payout = (amountRub) => affiliateRoute.POST(new NextRequest('https://example.test/api/v1/affiliate', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'REQUEST_PAYOUT', amountRub, method: 'CARD', requisites: 'test card' }),
}));

after(() => {
  global.fetch = previousFetch;
  process.chdir(previousCwd);
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
  rmSync(temp, { recursive: true, force: true });
});

test('simulated checkouts never create withdrawable partner commissions; verified payments do, once', async () => {
  const partner = await db.registerUserAccount({ email: 'partner-commission@example.test', password: 'test-password', displayName: 'Partner' });
  const buyer = await db.registerUserAccount({ email: 'referred@example.test', password: 'test-password', displayName: 'Buyer', refCode: partner.referralCode });
  viewer = partner;
  await db.mutateState((state) => { state.settings.paymentMode = 'TEST_INSTANT'; });
  const simulated = await db.initiateOrderCheckout({ userId: buyer.id, kind: 'BALANCE_TOPUP', topupAmountRub: 2000, paymentMethod: 'yookassa', expectedAmountRub: 2000, expectedPaymentMode: 'TEST_INSTANT', originUrl: 'https://example.test' });
  assert.equal(simulated.paidImmediately, true);
  assert.equal(simulated.order.affiliateCommissionRub, 0);
  let state = await db.readState();
  assert.equal(state.users.find((u) => u.id === partner.id).affiliateBalanceRub, 0);
  assert.equal(state.users.find((u) => u.id === partner.id).affiliateTotalEarnedRub, 0);
  assert.equal((await payout(500)).status, 400);

  await db.mutateState((draft) => {
    draft.settings.paymentMode = 'YOOKASSA_LIVE';
    draft.settings.yookassaShopId = 'test-shop';
    draft.settings.yookassaSecretKey = 'test-secret';
  });
  global.fetch = async (url) => {
    assert.equal(url, 'https://api.yookassa.ru/v3/payments');
    return { ok: true, status: 200, json: async () => ({ id: 'external-test-payment', status: 'pending', confirmation: { confirmation_url: 'https://checkout.example.test/confirm' } }) };
  };
  const live = await db.initiateOrderCheckout({ userId: buyer.id, kind: 'BALANCE_TOPUP', topupAmountRub: 2000, paymentMethod: 'yookassa', expectedAmountRub: 2000, expectedPaymentMode: 'YOOKASSA_LIVE', originUrl: 'https://example.test' });
  assert.equal(live.paidImmediately, false);
  const verified = { id: live.order.externalPaymentId, status: 'succeeded', paid: true, amountValue: '2000.00', currency: 'RUB', metadata: { orderId: live.order.id, userId: buyer.id } };
  // Switching modes must not make an existing real order fulfillable without provider verification.
  await db.mutateState((draft) => { draft.settings.paymentMode = 'TEST_INSTANT'; });
  await assert.rejects(db.fulfillOrderPayment(live.order.id), /проверка ЮKassa/);
  await db.fulfillOrderPayment(live.order.id, verified);
  await db.fulfillOrderPayment(live.order.id, verified);
  state = await db.readState();
  assert.equal(state.users.find((u) => u.id === partner.id).affiliateBalanceRub, 600);
  assert.equal(state.users.find((u) => u.id === partner.id).affiliateTotalEarnedRub, 600);
  assert.equal(state.transactions.find((o) => o.id === live.order.id).affiliateCommissionRub, 600);
  assert.equal((await payout(500)).status, 200);
  assert.equal((await db.readState()).users.find((u) => u.id === partner.id).affiliateBalanceRub, 100);
  global.fetch = async () => { throw new Error('Unexpected network request in test'); };
});

test('new bundle allocation adds up exactly and does not change historical rounding', async () => {
  const buyer = await db.registerUserAccount({ email: 'new-bundle@example.test', password: 'test-password', displayName: 'New' });
  const legacyBuyer = await db.registerUserAccount({ email: 'legacy-bundle@example.test', password: 'test-password', displayName: 'Old' });
  const predictions = [];
  for (const price of [500, 501, 502]) {
    predictions.push(await db.createPredictionByAdmin({
      sport: 'FOOTBALL', leagueName: 'Тест', homeTeam: `Дом ${price}`, awayTeam: 'Гости',
      matchStartsAt: '2035-01-01T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2, stakeUnits: 1,
      accessTier: 'PAID_SINGLE', singlePriceRub: price, insuredOnLoss: true,
      analysisTeaser: 'Анонс', analysisFull: 'Разбор', pushToTelegram: false,
    }));
  }
  await db.mutateState((state) => { state.settings.paymentMode = 'TEST_INSTANT'; state.settings.bundle3DiscountPct = 25; });
  const args = { kind: 'BUNDLE_PREDICTIONS', predictionIds: predictions.map((p) => p.id), paymentMethod: 'yookassa', expectedAmountRub: 1127, expectedPaymentMode: 'TEST_INSTANT', originUrl: 'https://example.test' };
  const current = (await db.initiateOrderCheckout({ ...args, userId: buyer.id })).order;
  const legacy = (await db.initiateOrderCheckout({ ...args, userId: legacyBuyer.id })).order;
  assert.equal(current.amountRub, 1127);
  await db.mutateState((state) => {
    // Emulate an already-existing order, not an automatic migration.
    delete state.transactions.find((o) => o.id === legacy.id).insuranceAllocationVersion;
    for (const pred of state.predictions.filter((p) => args.predictionIds.includes(p.id))) {
      Object.assign(pred, { matchLifecycleStatus: 'FINISHED', finalScoreVerified: true,
        finalScoreVerifiedSources: ['A', 'B'], matchVerificationConflict: false,
        matchVerifiedAt: '2035-01-01T14:00:00Z', matchVerificationSource: 'A + B',
        liveHomeScore: 0, liveAwayScore: 1, finalScoreIsOvertime: false });
    }
  });
  // The result is deterministic from order position, not event settlement order.
  for (const pred of [...predictions].reverse()) {
    await db.settlePredictionByAdmin({ predictionId: pred.id, resultStatus: 'LOSS' });
  }
  await db.settlePredictionByAdmin({ predictionId: predictions[0].id, resultStatus: 'LOSS' });
  const state = await db.readState();
  const newOrder = state.transactions.find((o) => o.id === current.id);
  const oldOrder = state.transactions.find((o) => o.id === legacy.id);
  assert.equal(newOrder.insuranceRefundedAmountRub, 1127);
  assert.equal(state.users.find((u) => u.id === buyer.id).balanceRub, 1127);
  assert.equal(oldOrder.insuranceRefundedAmountRub, 1128); // round(1127/3) per event, as before
  assert.equal(state.users.find((u) => u.id === legacyBuyer.id).balanceRub, 1128);
  assert.equal(new Set(newOrder.insuredRefundedPredictionIds).size, 3);
});

test('concurrent automatic settlement credits and sends once, and respects an off switch at commit time', async () => {
  const buyer = await db.registerUserAccount({ email: 'settlement-race@example.test', password: 'test-password', displayName: 'Race' });
  const prediction = await db.createPredictionByAdmin({
    sport: 'FOOTBALL', leagueName: 'Тест', homeTeam: 'Север', awayTeam: 'Юг',
    matchStartsAt: '2035-01-02T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2, stakeUnits: 1,
    accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: true,
    analysisTeaser: 'Анонс', analysisFull: 'Разбор', pushToTelegram: false,
  });
  await db.mutateState((state) => { state.settings.paymentMode = 'TEST_INSTANT'; });
  await db.initiateOrderCheckout({ userId: buyer.id, kind: 'SINGLE_PREDICTION', predictionId: prediction.id,
    paymentMethod: 'yookassa', expectedAmountRub: 500, expectedPaymentMode: 'TEST_INSTANT', originUrl: 'https://example.test' });
  await db.mutateState((state) => {
    state.settings.telegramBotToken = '123456:mockBotToken';
    state.settings.telegramChannelId = '@mockchannel';
    state.aiAutopilot.autoSettleEnabled = false;
    const saved = state.predictions.find((item) => item.id === prediction.id);
    Object.assign(saved, { matchLifecycleStatus: 'FINISHED', finalScoreVerified: true,
      finalScoreVerifiedSources: ['A', 'B'], matchVerificationConflict: false,
      matchVerifiedAt: '2035-01-02T14:00:00Z', matchVerificationSource: 'A + B',
      liveHomeScore: 0, liveAwayScore: 1, finalScoreIsOvertime: false });
  });
  let sends = 0;
  global.fetch = async (url) => {
    assert.match(String(url), /^https:\/\/api\.telegram\.org\/bot.*\/sendMessage$/);
    sends++;
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 123 } }) };
  };
  const args = { predictionId: prediction.id, resultStatus: 'LOSS', finalScore: '0:1',
    pushResultToTelegram: true, onlyIfPending: true, requireAutoSettleEnabled: true };
  assert.equal((await db.settlePredictionByAdmin(args)).applied, false);
  assert.equal(sends, 0);
  await db.mutateState((state) => { state.aiAutopilot.autoSettleEnabled = true; });
  const results = await Promise.all([db.settlePredictionByAdmin(args), db.settlePredictionByAdmin(args)]);
  assert.equal(results.filter((result) => result.applied).length, 1);
  assert.equal(results.reduce((sum, result) => sum + result.compensatedUsers, 0), 1);
  assert.equal(sends, 1);
  const state = await db.readState();
  assert.equal(state.users.find((item) => item.id === buyer.id).balanceRub, 500);
  assert.equal(state.predictions.find((item) => item.id === prediction.id).resultStatus, 'LOSS');
  assert.ok(state.aiLogs.some((entry) => /Telegram подтвердил сообщение о результате/.test(entry.message)));
});
