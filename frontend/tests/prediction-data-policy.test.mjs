import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { isLegacyStarterDemoPrediction, isActiveStorefrontPrediction, canAccessLegacyStarterDemoPrediction, withoutLegacyStarterDemoPredictions, protectedPredictionIds, removeUnownedLegacyDemoPredictions } =
  await loadTypeScriptModule(new URL('../src/server/prediction-data-policy.ts', import.meta.url));

test('starter demo fixtures are removed, including settled examples, while real prediction IDs remain', () => {
  assert.equal(isLegacyStarterDemoPrediction({ id: 'pred_init_6' }), true);
  assert.equal(isLegacyStarterDemoPrediction({ id: 'pred_init_archive' }), false);
  assert.deepEqual(
    withoutLegacyStarterDemoPredictions([
      { id: 'pred_init_6', resultStatus: 'PENDING' },
      { id: 'pred_init_7', resultStatus: 'WIN' },
      { id: 'pred_123', resultStatus: 'PENDING' },
    ]).map((prediction) => prediction.id),
    ['pred_123'],
  );
});

test('storefront-active counts exclude legacy, closed, postponed and malformed events', () => {
  const active = { id: 'pred_real', resultStatus: 'PENDING', matchStartsAt: '2099-01-01T00:00:00Z', matchLifecycleStatus: 'SCHEDULED' };
  const now = Date.parse('2026-11-12T00:00:00Z');
  assert.equal(isActiveStorefrontPrediction(active, now), true);
  for (const change of [
    { id: 'pred_init_1' }, { resultStatus: 'WIN' }, { matchStartsAt: 'bad' },
    { matchStartsAt: '2025-01-01T00:00:00Z' }, { matchLifecycleStatus: 'CANCELLED' },
    { matchLifecycleStatus: 'POSTPONED' }, { matchLifecycleStatus: 'LIVE' },
    { matchLifecycleStatus: undefined, matchStatus: 'FINISHED' },
  ]) assert.equal(isActiveStorefrontPrediction({ ...active, ...change }, now), false);
});

test('archive access requires the active owner, grantee, or administrator', () => {
  const demo = { id: 'pred_init_1' };
  assert.equal(canAccessLegacyStarterDemoPrediction(demo, null), false);
  assert.equal(canAccessLegacyStarterDemoPrediction(demo, { status: 'ACTIVE', role: 'USER', purchasedPredictionIds: ['pred_init_1'] }), true);
  assert.equal(canAccessLegacyStarterDemoPrediction(demo, { status: 'ACTIVE', role: 'USER', grantedPredictionIds: ['pred_init_1'] }), true);
  assert.equal(canAccessLegacyStarterDemoPrediction(demo, { status: 'BLOCKED', role: 'ADMIN' }), false);
  assert.equal(canAccessLegacyStarterDemoPrediction(demo, { status: 'ACTIVE', role: 'ADMIN' }), true);
  assert.equal(canAccessLegacyStarterDemoPrediction({ id: 'pred_real' }, { status: 'ACTIVE', role: 'ADMIN' }), false);
});

test('cleanup preserves demo-shaped IDs with client access or historical orders and never touches drafts', () => {
  const state = {
    predictions: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `pred_init_${i}` })).concat([{ id: 'pred_real' }]),
    users: [{ purchasedPredictionIds: ['pred_init_1'], grantedPredictionIds: ['pred_init_2'] }],
    transactions: [
      { status: 'PENDING', predictionId: 'pred_init_3' },
      { status: 'SUCCEEDED', predictionIds: ['pred_init_4'] },
      { status: 'REFUNDED', predictionId: 'pred_init_5' },
    ],
    aiDrafts: [{ id: 'draft-untouched' }],
  };
  const ids = protectedPredictionIds(state.users, state.transactions);
  assert.deepEqual([...ids], ['pred_init_1', 'pred_init_2', 'pred_init_3', 'pred_init_4', 'pred_init_5']);
  assert.equal(removeUnownedLegacyDemoPredictions(state), 1);
  assert.deepEqual(state.predictions.map((p) => p.id), ['pred_init_1', 'pred_init_2', 'pred_init_3', 'pred_init_4', 'pred_init_5', 'pred_real']);
  assert.deepEqual(state.aiDrafts, [{ id: 'draft-untouched' }]);
});
