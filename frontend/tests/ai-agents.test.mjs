import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { buildAgentAnalysis, runAgentCommittee } = await loadTypeScriptModule(
  new URL('../src/server/ai-agents.ts', import.meta.url),
);

const candidate = {
  id: 'fixture-1',
  sport: 'FOOTBALL',
  leagueName: 'Тестовая лига',
  homeTeam: 'Команда А',
  awayTeam: 'Команда Б',
  market: 'Победа 1',
  odds: 1.8,
  homeOdds: 1.8,
  drawOdds: 3.5,
  awayOdds: 4.5,
  overOdds: null,
  underOdds: null,
  fairHomeProbPct: 65,
  fairDrawProbPct: 20,
  fairAwayProbPct: 15,
  reliabilityScore: 90,
  sources: ['Фонбет', 'ESPN'],
  facts: ['Тестовый проверяемый факт'],
  headlines: ['Тестовый заголовок'],
  riskFlags: [],
};

function committeeParams(complete) {
  return {
    candidates: [candidate],
    limit: 1,
    minimumConfidencePct: 60,
    minimumEdgePct: 0,
    requireConsensus: true,
    apiKey: 'configured-key',
    model: 'configured-model',
    baseUrls: ['https://llm.invalid/v1'],
    complete,
  };
}

test('without an API key the committee makes no model calls and selects no forecast', async () => {
  let calls = 0;
  const result = await runAgentCommittee({
    ...committeeParams(async () => {
      calls += 1;
      return { ok: true, content: '', rawError: '' };
    }),
    apiKey: '',
  });

  assert.equal(calls, 0);
  assert.equal(result.specialistRolesResponded, 0);
  assert.equal(result.leaderModelReviewed, false);
  assert.deepEqual(result.selectedIds, []);
  assert.equal(result.evaluations[0].accepted, false);
});

test('one PASS is insufficient even when other model roles respond', async () => {
  const result = await runAgentCommittee(
    committeeParams(async ({ messages }) => {
      const system = messages[0].content;
      const rows = JSON.parse(messages[1].content);
      const isFormRole = system.includes('Агент формы и данных');
      return {
        ok: true,
        rawError: '',
        content: JSON.stringify({
          opinions: rows.map(({ id }) => ({
            id,
            verdict: isFormRole ? 'PASS' : 'CAUTION',
            probabilityPct: 68,
            confidencePct: 85,
            riskScore: 15,
            reason: 'Проверка по переданным данным',
          })),
        }),
      };
    }),
  );

  assert.equal(result.specialistRolesResponded, 3);
  assert.equal(result.evaluations[0].accepted, false);
  assert.match(result.evaluations[0].rejectionReason, /минимум двух/);
  assert.deepEqual(result.selectedIds, []);
});

test('a failed optional leader call is reported as unconfirmed, not implied as successful', async () => {
  const result = await runAgentCommittee(
    committeeParams(async ({ messages }) => {
      if (messages[0].content.includes('дополнительная роль финального аналитика')) {
        return { ok: false, content: '', rawError: 'model unavailable' };
      }
      const rows = JSON.parse(messages[1].content);
      return {
        ok: true,
        rawError: '',
        content: JSON.stringify({
          opinions: rows.map(({ id }) => ({
            id,
            verdict: 'PASS',
            probabilityPct: 68,
            confidencePct: 85,
            riskScore: 15,
            reason: 'Проверка по переданным данным',
          })),
        }),
      };
    }),
  );

  assert.equal(result.specialistRolesResponded, 3);
  assert.equal(result.leaderModelReviewed, false);
  assert.deepEqual(result.selectedIds, ['fixture-1']);
});

test('a valid zero-confidence opinion still counts as a role response in the saved report', async () => {
  const result = await runAgentCommittee(
    committeeParams(async ({ messages }) => {
      const system = messages[0].content;
      if (system.includes('дополнительная роль финального аналитика')) {
        return {
          ok: true,
          rawError: '',
          content: JSON.stringify({ selectedIds: ['fixture-1'], summary: 'Отбор завершён.' }),
        };
      }
      const isFormRole = system.includes('Агент формы и данных');
      const rows = JSON.parse(messages[1].content);
      return {
        ok: true,
        rawError: '',
        content: JSON.stringify({
          opinions: rows.map(({ id }) => ({
            id,
            verdict: 'PASS',
            probabilityPct: 68,
            confidencePct: isFormRole ? 0 : 90,
            riskScore: 15,
            reason: 'Ответ на запрос роли',
          })),
        }),
      };
    }),
  );

  assert.equal(result.evaluations[0].accepted, true);
  const analysis = buildAgentAnalysis({
    candidate,
    evaluation: result.evaluations[0],
    leaderSummary: 'Финальный отбор завершён.',
  });
  assert.match(analysis.full, /по этому кандидату ответили 3\/3 роли/);
});

test('a candidate selected by the same configured model has distinct role calls and explicit leader status', async () => {
  let calls = 0;
  const result = await runAgentCommittee(
    committeeParams(async ({ messages }) => {
      calls += 1;
      const system = messages[0].content;
      if (system.includes('дополнительная роль финального аналитика')) {
        return {
          ok: true,
          rawError: '',
          content: JSON.stringify({
            selectedIds: ['fixture-1'],
            summary: 'Противоречий в переданных данных не выявлено.',
          }),
        };
      }
      const rows = JSON.parse(messages[1].content);
      return {
        ok: true,
        rawError: '',
        content: JSON.stringify({
          opinions: rows.map(({ id }) => ({
            id,
            verdict: 'PASS',
            probabilityPct: 68,
            confidencePct: 85,
            riskScore: 15,
            reason: 'Проверка по переданным данным',
          })),
        }),
      };
    }),
  );

  assert.equal(calls, 4);
  assert.equal(result.specialistRolesResponded, 3);
  assert.equal(result.leaderModelReviewed, true);
  assert.deepEqual(result.selectedIds, ['fixture-1']);
  assert.equal(result.evaluations[0].accepted, true);
});
