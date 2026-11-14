import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { hasAiCommitteeProvenance } = await loadTypeScriptModule(
  new URL('../src/server/ai-provenance.ts', import.meta.url),
);

test('AI performance provenance requires the autopilot label, fixture ID, and saved committee report', () => {
  assert.equal(
    hasAiCommitteeProvenance({
      authorSource: 'AI_AUTOPILOT',
      externalFixtureId: 'fonbet_123',
      agentReport: 'FORM: PASS; NEWS: PASS',
    }),
    true,
  );
  assert.equal(
    hasAiCommitteeProvenance({
      authorSource: 'AI_AUTOPILOT',
      externalFixtureId: null,
      agentReport: null,
    }),
    false,
  );
  assert.equal(
    hasAiCommitteeProvenance({
      authorSource: 'HUMAN',
      externalFixtureId: 'fonbet_123',
      agentReport: 'FORM: PASS; NEWS: PASS',
    }),
    false,
  );
});
