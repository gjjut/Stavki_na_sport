import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { buildAgentAnalysis, describeAgentRoleDiagnostic, probeAgentResponseFormat, runAgentCommittee } = await loadTypeScriptModule(
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
  assert.equal(result.leaderAttempted, false);
  assert.deepEqual(result.roleDiagnostics.map((d) => d.issue), ['no_key', 'no_key', 'no_key']);
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
  assert.equal(result.leaderAttempted, true);
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
  assert.equal(result.leaderAttempted, true);
  assert.deepEqual(result.selectedIds, ['fixture-1']);
  assert.equal(result.evaluations[0].accepted, true);
});

test('HTTP errors, timeouts and invalid JSON are categorized without copying provider text', async () => {
  const sensitive = 'provider-message-with-secret';
  const scenarios = [
    [{ ok: false, content: '', rawError: sensitive, status: 401, failureReason: 'http_error' }, 'http_error', /HTTP 401/],
    [{ ok: false, content: '', rawError: sensitive, status: 0, failureReason: 'timeout' }, 'timeout', /ожидания/],
    [{ ok: false, content: '', rawError: sensitive, status: 200, failureReason: 'truncated' }, 'truncated', /лимиту токенов/],
    [{ ok: true, content: `not JSON ${sensitive}`, rawError: '', status: 200 }, 'invalid_json', /JSON/],
    [{ ok: true, content: '{"opinions":[]}', rawError: '', status: 200 }, 'invalid_opinions', /нет распознаваемых оценок/],
    [{ ok: true, content: '{"opinions":', rawError: '', status: 200, finishReason: 'length' }, 'truncated', /лимиту токенов/],
  ];
  for (const [response, expected, message] of scenarios) {
    let calls = 0;
    const result = await runAgentCommittee(committeeParams(async () => { calls++; return response; }));
    assert.equal(calls, 3);
    assert.equal(result.specialistRolesResponded, 0);
    assert.equal(result.leaderAttempted, false);
    assert.deepEqual(result.selectedIds, []);
    assert.deepEqual(result.roleDiagnostics.map((d) => d.issue), [expected, expected, expected]);
    assert.match(describeAgentRoleDiagnostic(result.roleDiagnostics[0]), message);
    assert.doesNotMatch(JSON.stringify(result.roleDiagnostics), new RegExp(sensitive));
    assert.doesNotMatch(describeAgentRoleDiagnostic(result.roleDiagnostics[0]), new RegExp(sensitive));
  }
});

test('partial responses are reported but the existing per-event consensus gates remain intact', async () => {
  const second = { ...candidate, id: 'fixture-2' };
  const result = await runAgentCommittee({
    ...committeeParams(async ({ messages }) => {
      if (messages[0].content.includes('финального аналитика')) {
        return { ok: true, rawError: '', content: JSON.stringify({ selectedIds: ['fixture-1'], summary: 'OK' }) };
      }
      return { ok: true, rawError: '', content: JSON.stringify({ opinions: [{
        id: 'fixture-1', verdict: 'PASS', probabilityPct: 68, confidencePct: 85, riskScore: 15, reason: 'тест',
      }] }) };
    }),
    candidates: [candidate, second],
  });
  assert.deepEqual(result.roleDiagnostics.map((d) => d.issue), ['partial_response', 'partial_response', 'partial_response']);
  assert.ok(result.roleDiagnostics.every((d) => d.validCount === 1 && d.expectedCount === 2));
  assert.equal(result.specialistRolesResponded, 3);
  assert.equal(result.evaluations[0].accepted, true);
  assert.equal(result.evaluations[1].accepted, false);
  assert.deepEqual(result.selectedIds, ['fixture-1']);
});

test('the format probe uses one role, nine synthetic events and at most one endpoint', async () => {
  const calls = [];
  const diagnostic = await probeAgentResponseFormat({
    apiKey: 'secret-for-test', model: 'test-model',
    baseUrls: ['https://one.invalid/v1', 'https://two.invalid/v1'],
    complete: async (request) => {
      calls.push(request);
      const rows = JSON.parse(request.messages[1].content);
      return { ok: true, rawError: '', status: 200, content: JSON.stringify({ opinions: rows.map(({ id }) => ({
        id, verdict: 'CAUTION', probabilityPct: 50, confidencePct: 60, riskScore: 50, reason: 'нет фактов',
      })) }) };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].baseUrl, 'https://one.invalid/v1');
  assert.equal(calls[0].timeoutMs, 18_000);
  assert.equal(calls[0].maxTokens, 1800);
  const rows = JSON.parse(calls[0].messages[1].content);
  assert.equal(rows.length, 9);
  assert.ok(rows.every((row) => row.id.startsWith('test_fixture_')));
  assert.equal(diagnostic.issue, null);
  assert.equal(diagnostic.validCount, 9);
  assert.equal(diagnostic.expectedCount, 9);
  assert.doesNotMatch(JSON.stringify(diagnostic), /secret-for-test/);
});

test('a length stop is flagged even when all requested rows are parseable', async () => {
  const diagnostic = await probeAgentResponseFormat({
    apiKey: 'test-key', model: 'test-model', baseUrls: ['https://example.invalid/v1'],
    complete: async ({ messages }) => {
      const rows = JSON.parse(messages[1].content);
      return {
        ok: true, rawError: '', finishReason: 'length',
        content: JSON.stringify({ opinions: rows.map(({ id }) => ({
          id, verdict: 'CAUTION', probabilityPct: 50, confidencePct: 50, riskScore: 50,
        })) }),
      };
    },
  });
  assert.equal(diagnostic.validCount, 9);
  assert.equal(diagnostic.issue, 'truncated');
  assert.match(describeAgentRoleDiagnostic(diagnostic), /лимиту токенов/);
});

test('model reasons and leader summaries redact the configured key before truncation', async () => {
  const secret = 'sk-pv-private-test-key-1234567890';
  const result = await runAgentCommittee({
    ...committeeParams(async ({ messages }) => {
      if (messages[0].content.includes('финального аналитика')) {
        return { ok: true, rawError: '', content: JSON.stringify({
          selectedIds: ['fixture-1'], summary: `${'x'.repeat(350)}${secret}`,
        }) };
      }
      return { ok: true, rawError: '', content: JSON.stringify({ opinions: [{
        id: 'fixture-1', verdict: 'PASS', probabilityPct: 68, confidencePct: 85,
        riskScore: 15, reason: `${'x'.repeat(230)}${secret}`,
      }] }) };
    }),
    apiKey: secret,
  });
  assert.deepEqual(result.selectedIds, ['fixture-1']);
  assert.doesNotMatch(JSON.stringify(result), /sk-pv-private/);
  assert.match(result.evaluations[0].opinions[0].reason, /\[ключ/);
  assert.match(result.leaderSummary, /\[ключ/);
});
