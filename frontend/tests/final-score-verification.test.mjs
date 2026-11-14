import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { hasCorroboratedFinalScore, hasVerifiedSettledResult } = await loadTypeScriptModule(
  new URL('../src/server/final-score-verification.ts', import.meta.url),
);
const { evaluateMarketByScore } = await loadTypeScriptModule(
  new URL('../src/server/market-settlement.ts', import.meta.url),
);

const verifiedResult = {
  matchLifecycleStatus: 'FINISHED',
  finalScoreVerified: true,
  finalScoreVerifiedSources: ['Source A', 'Source B'],
  matchVerificationConflict: false,
  matchVerifiedAt: '2026-11-12T12:30:00.000Z',
  matchVerificationSource: 'Source A + Source B',
  liveHomeScore: 2,
  liveAwayScore: 1,
  finalScoreIsOvertime: false,
  sport: 'FOOTBALL',
  selectionTitle: 'Победа 1',
  stakeUnits: 2,
  fixedOdds: 1.9,
  resultStatus: 'WIN',
  settledAt: '2026-11-12T12:31:00.000Z',
  profitUnits: 1.8,
  profitPercent: 1.8,
  finalScore: '2:1',
};

test('a final score requires two distinct agreeing sources and complete final evidence', () => {
  assert.equal(hasCorroboratedFinalScore(verifiedResult), true);
  assert.equal(hasVerifiedSettledResult(verifiedResult, evaluateMarketByScore), true);
});

test('duplicate source names do not count as independent corroboration', () => {
  assert.equal(
    hasCorroboratedFinalScore({
      ...verifiedResult,
      finalScoreVerifiedSources: ['Source A', ' source a '],
    }),
    false,
  );
});

test('a source conflict, invalid timestamp, or missing structured score invalidates the final', () => {
  assert.equal(
    hasCorroboratedFinalScore({ ...verifiedResult, matchVerificationConflict: true }),
    false,
  );
  assert.equal(
    hasCorroboratedFinalScore({ ...verifiedResult, matchVerifiedAt: 'not-a-date' }),
    false,
  );
  assert.equal(
    hasCorroboratedFinalScore({ ...verifiedResult, liveHomeScore: null }),
    false,
  );
});

test('unverified, pending, or score-mismatched results are excluded from verified settlement stats', () => {
  assert.equal(
    hasVerifiedSettledResult({ ...verifiedResult, finalScoreVerified: false }, evaluateMarketByScore),
    false,
  );
  assert.equal(
    hasVerifiedSettledResult({ ...verifiedResult, resultStatus: 'PENDING' }, evaluateMarketByScore),
    false,
  );
  assert.equal(
    hasVerifiedSettledResult({ ...verifiedResult, finalScore: '1:0' }, evaluateMarketByScore),
    false,
  );
  assert.equal(
    hasVerifiedSettledResult({ ...verifiedResult, resultStatus: 'LOSS' }, evaluateMarketByScore),
    false,
  );
  assert.equal(
    hasVerifiedSettledResult({ ...verifiedResult, profitUnits: 0 }, evaluateMarketByScore),
    false,
  );
});
