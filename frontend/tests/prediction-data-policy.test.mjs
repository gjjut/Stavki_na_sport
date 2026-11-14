import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { isLegacyStarterDemoPrediction, withoutLegacyStarterDemoPredictions } =
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
