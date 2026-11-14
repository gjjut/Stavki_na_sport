import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { applyAdminBalanceRefund, applyPayoutDecision, quoteBalanceRefund } = await loadTypeScriptModule(
  new URL('../src/lib/admin-finance-policy.ts', import.meta.url),
);

const makeOrder = (extra = {}) => ({
  id: 'order-1', userId: 'user-1', kind: 'SINGLE_PREDICTION', status: 'SUCCEEDED',
  paymentMethod: 'yookassa', amountRub: 1000, predictionId: 'p1', predictionIds: ['p1'], ...extra,
});
const makeState = (order) => ({
  transactions: [order],
  users: [{ id: 'user-1', balanceRub: 150, purchasedPredictionIds: ['p1', 'p2'], grantedPredictionIds: [] }],
});

test('admin balance refund credits external and internal prediction purchases exactly once', () => {
  for (const paymentMethod of ['yookassa', 'internal_balance']) {
    const state = makeState(makeOrder({ paymentMethod }));
    assert.deepEqual(applyAdminBalanceRefund(state, 'order-1', '2026-11-12T12:00:00Z'), { creditedRub: 1000, retainedPredictionIds: [] });
    assert.equal(state.users[0].balanceRub, 1150);
    assert.deepEqual(state.users[0].purchasedPredictionIds, ['p2']);
    assert.equal(state.transactions[0].status, 'REFUNDED');
    assert.equal(state.transactions[0].refundDestination, 'BALANCE');
    assert.equal(state.transactions[0].refundBalanceAmountRub, 1000);
    assert.throws(() => applyAdminBalanceRefund(state, 'order-1', '2026-11-12T12:00:01Z'));
    assert.equal(state.users[0].balanceRub, 1150);
  }
});

test('previous insurance is subtracted from the balance refund, including rounding overflow', () => {
  const partial = makeState(makeOrder({ insuranceCredited: true, insuranceRefundedAmountRub: 400 }));
  assert.deepEqual(applyAdminBalanceRefund(partial, 'order-1', 'now'), { creditedRub: 600, retainedPredictionIds: [] });
  assert.equal(partial.users[0].balanceRub, 750);
  const fullyInsured = makeState(makeOrder({ insuranceCredited: true, insuranceRefundedAmountRub: 1001 }));
  assert.deepEqual(applyAdminBalanceRefund(fullyInsured, 'order-1', 'now'), { creditedRub: 0, retainedPredictionIds: [] });
  assert.equal(fullyInsured.users[0].balanceRub, 150);
});

test('refund keeps access backed by another paid order, a gift, or an unknown legacy history', () => {
  const anotherOrder = makeState(makeOrder());
  anotherOrder.transactions.push(makeOrder({ id: 'other-order', kind: 'BUNDLE_PREDICTIONS', predictionId: 'p2', predictionIds: ['p2', 'p1'] }));
  assert.deepEqual(applyAdminBalanceRefund(anotherOrder, 'order-1', 'now').retainedPredictionIds, ['p1']);
  assert.deepEqual(anotherOrder.users[0].purchasedPredictionIds, ['p1', 'p2']);

  const gifted = makeState(makeOrder());
  gifted.users[0].grantedPredictionIds.push('p1');
  assert.deepEqual(applyAdminBalanceRefund(gifted, 'order-1', 'now').retainedPredictionIds, ['p1']);
  assert.deepEqual(gifted.users[0].purchasedPredictionIds, ['p1', 'p2']);

  const legacy = makeState(makeOrder());
  delete legacy.users[0].grantedPredictionIds;
  assert.deepEqual(applyAdminBalanceRefund(legacy, 'order-1', 'now').retainedPredictionIds, ['p1']);
  assert.deepEqual(legacy.users[0].purchasedPredictionIds, ['p1', 'p2']);

  const unrelated = makeState(makeOrder());
  unrelated.transactions.push(makeOrder({ id: 'other-user', userId: 'someone-else' }));
  unrelated.transactions.push(makeOrder({ id: 'refunded', status: 'REFUNDED' }));
  assert.deepEqual(applyAdminBalanceRefund(unrelated, 'order-1', 'now').retainedPredictionIds, []);
  assert.deepEqual(unrelated.users[0].purchasedPredictionIds, ['p2']);
});

test('unsafe and ambiguous refunds fail without modifying the state', () => {
  for (const order of [
    makeOrder({ status: 'PENDING' }),
    makeOrder({ status: 'REFUNDED' }),
    makeOrder({ kind: 'BALANCE_TOPUP' }),
    makeOrder({ insuranceCredited: true }),
    makeOrder({ insuranceRefundedAmountRub: -1 }),
    makeOrder({ amountRub: NaN }),
    makeOrder({ externalRefundNotices: [{ id: 'refund-1', amountValue: '100.00', currency: 'RUB', verifiedAt: 'now' }] }),
  ]) {
    const state = makeState(order);
    const before = structuredClone(state);
    assert.equal(quoteBalanceRefund(order).ok, false);
    assert.throws(() => applyAdminBalanceRefund(state, 'order-1', 'now'));
    assert.deepEqual(state, before);
  }
  const missingBuyer = { transactions: [makeOrder()], users: [] };
  assert.throws(() => applyAdminBalanceRefund(missingBuyer, 'order-1', 'now'), /Покупатель/);
  assert.equal(missingBuyer.transactions[0].status, 'SUCCEEDED');
});

test('payout decisions reject stale requests and return partner funds at most once', () => {
  const state = {
    payouts: [{ id: 'payout-1', userId: 'partner', status: 'PENDING', amountRub: 500, processedAt: null }],
    users: [{ id: 'partner', affiliateBalanceRub: 100 }],
  };
  applyPayoutDecision(state, 'payout-1', 'REJECTED', 'now');
  assert.equal(state.users[0].affiliateBalanceRub, 600);
  assert.equal(state.payouts[0].status, 'REJECTED');
  assert.throws(() => applyPayoutDecision(state, 'payout-1', 'REJECTED', 'later'), /уже обработана/);
  assert.equal(state.users[0].affiliateBalanceRub, 600);
  const missingPartner = { payouts: [{ id: 'p', userId: 'missing', status: 'PENDING', amountRub: 500 }], users: [] };
  assert.throws(() => applyPayoutDecision(missingPartner, 'p', 'REJECTED', 'now'), /Партнёр/);
  assert.equal(missingPartner.payouts[0].status, 'PENDING');
  assert.throws(() => applyPayoutDecision(missingPartner, 'p', 'INVALID', 'now'), /Неизвестное решение/);
});
