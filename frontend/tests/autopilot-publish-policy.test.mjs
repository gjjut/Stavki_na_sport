import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { shouldPublishImmediately } = await loadTypeScriptModule(
  new URL('../src/server/autopilot-publish-policy.ts', import.meta.url),
);

test('explicit draft-only requests override FULL_AUTOPILOT while scheduled runs still use the configured mode', () => {
  assert.equal(shouldPublishImmediately('FULL_AUTOPILOT', false), false);
  assert.equal(shouldPublishImmediately('FULL_AUTOPILOT', true), true);
  assert.equal(shouldPublishImmediately('FULL_AUTOPILOT'), true);
  assert.equal(shouldPublishImmediately('MODERATION'), false);
  assert.equal(shouldPublishImmediately('MODERATION', true), true);
});
