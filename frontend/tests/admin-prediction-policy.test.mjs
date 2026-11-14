import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { deleteUnownedPrediction, assertPredictionsExistForOrder, assertInsuranceChangeAllowed, assertPredictionSaleTermsUnchanged, validatePredictionForPublication, grantPredictionAccess } = await loadTypeScriptModule(
  new URL('../src/server/admin-prediction-policy.ts', import.meta.url),
);

const state = (transactions = [], users = []) => ({
  predictions: [{ id: 'pred-1' }, { id: 'pred-2' }], transactions, users,
});
const order = (status, predictionId = 'pred-1', predictionIds = []) => ({ status, predictionId, predictionIds });
const good = {
  sport: 'FOOTBALL', accessTier: 'PAID_SINGLE', leagueName: 'Лига', homeTeam: 'А', awayTeam: 'Б',
  matchStartsAt: '2027-01-01T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2, stakeUnits: 2,
  analysisTeaser: 'Анонс', analysisFull: 'Разбор', singlePriceRub: 500,
};

test('deletion only removes an existing event without client access or active orders', () => {
  const empty = state();
  assert.equal(deleteUnownedPrediction(empty, 'pred-1').id, 'pred-1');
  assert.deepEqual(empty.predictions, [{ id: 'pred-2' }]);
  assert.throws(() => deleteUnownedPrediction(empty, 'missing'), /не найдено/);
  for (const guarded of [
    state([], [{ purchasedPredictionIds: ['pred-1'] }]),
    state([order('SUCCEEDED')]),
    state([order('PENDING')]),
    state([order('SUCCEEDED', null, ['pred-2', 'pred-1'])]),
  ]) {
    const before = structuredClone(guarded);
    assert.throws(() => deleteUnownedPrediction(guarded, 'pred-1'), /нельзя удалить/);
    assert.deepEqual(guarded, before);
  }
  for (const status of ['CANCELED', 'REFUNDED']) {
    const noAccess = state([order(status)]);
    assert.equal(deleteUnownedPrediction(noAccess, 'pred-1').id, 'pred-1');
  }
});

test('gifts are tracked on new accounts but do not fabricate a complete legacy history', () => {
  const fresh = { purchasedPredictionIds: ['pred-1'], grantedPredictionIds: [] };
  grantPredictionAccess(fresh, 'pred-1');
  grantPredictionAccess(fresh, 'pred-1');
  grantPredictionAccess(fresh, 'pred-2');
  assert.deepEqual(fresh.purchasedPredictionIds, ['pred-1', 'pred-2']);
  assert.deepEqual(fresh.grantedPredictionIds, ['pred-1', 'pred-2']);
  const legacy = { purchasedPredictionIds: [] };
  grantPredictionAccess(legacy, 'pred-1');
  assert.deepEqual(legacy, { purchasedPredictionIds: ['pred-1'] });
});

test('checkout rechecks all cart items against the current state', () => {
  const current = state();
  assert.doesNotThrow(() => assertPredictionsExistForOrder(current, ['pred-1', 'pred-2']));
  assert.doesNotThrow(() => assertPredictionsExistForOrder(current, []));
  deleteUnownedPrediction(current, 'pred-1');
  assert.throws(() => assertPredictionsExistForOrder(current, ['pred-1', 'pred-2']), /недоступно/);
});

test('insurance cannot be changed retroactively for paid or pending orders', () => {
  const prediction = { id: 'pred-1', insuredOnLoss: true };
  for (const status of ['PENDING', 'SUCCEEDED']) {
    const guarded = state([order(status, null, ['pred-2', 'pred-1'])]);
    assert.throws(() => assertInsuranceChangeAllowed(guarded, prediction, false), /Нельзя изменить страховку/);
    assert.doesNotThrow(() => assertInsuranceChangeAllowed(guarded, prediction, true));
  }
  for (const status of ['CANCELED', 'REFUNDED']) {
    assert.doesNotThrow(() => assertInsuranceChangeAllowed(state([order(status)]), prediction, false));
  }
});

test('in-flight checkout fails if access tier, price, or insurance changed', () => {
  const before = [{ id: 'pred-1', accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: true }];
  assert.doesNotThrow(() => assertPredictionSaleTermsUnchanged(before, before, ['pred-1']));
  for (const change of [{ accessTier: 'FREE' }, { singlePriceRub: 600 }, { insuredOnLoss: false }]) {
    assert.throws(() => assertPredictionSaleTermsUnchanged([{ ...before[0], ...change }], before, ['pred-1']), /изменилась/);
  }
});

test('publication validates required fields, finite numbers, time, sport, and price', () => {
  assert.doesNotThrow(() => validatePredictionForPublication(good));
  assert.doesNotThrow(() => validatePredictionForPublication({ ...good, accessTier: 'FREE', singlePriceRub: null }));
  for (const update of [
    { homeTeam: '  ' }, { selectionTitle: '' }, { analysisTeaser: '' }, { analysisFull: null },
    { leagueName: undefined }, { sport: 'INVALID' }, { accessTier: 'INVALID' },
    { matchStartsAt: 'not-a-date' }, { fixedOdds: NaN }, { fixedOdds: 51 },
    { stakeUnits: Infinity }, { stakeUnits: 0 }, { singlePriceRub: 49 },
    { singlePriceRub: 50.5 }, { singlePriceRub: NaN },
  ]) {
    assert.throws(() => validatePredictionForPublication({ ...good, ...update }), JSON.stringify(update));
  }
});
