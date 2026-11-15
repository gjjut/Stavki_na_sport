// Child process for the opt-in, loopback-only PostgreSQL integration test.
// The parent creates an isolated schema and mocks every external request.
const assert = require('node:assert/strict');
require('../ui-test-utils.cjs');
const db = require('../../src/server/database.ts');
const autopilot = require('../../src/server/ai-autopilot.ts');
const { applyAutopilotConfigPatch } = require('../../src/server/autopilot-config-policy.ts');
const task = process.argv[2];
let telegramSends = 0;
const gateKind = process.env.VALUEX_TEST_GATE || '';
let gateNotified = false;
let releaseGate;
const gate = new Promise((resolve) => { releaseGate = resolve; });
process.on('message', (message) => { if (message === 'release') releaseGate(); });

async function awaitGate(kind) {
  if (kind !== gateKind) return;
  if (!gateNotified) {
    gateNotified = true;
    process.send({ event: 'gate' });
  }
  await gate;
}

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
global.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url === 'https://www.fon.bet/urls.json') return json({ line: ['https://line.mock.invalid'] });
  if (url.includes('events/listBase')) {
    await awaitGate('line');
    return json({
      sports: [{ id: 1, name: 'Футбол' }, { id: 10, parentId: 1, name: 'РПЛ' }],
      events: [{ id: 12345, level: 1, sportId: 10, team1: 'Север', team2: 'Юг', startTime: Number(process.env.VALUEX_TEST_START) }],
      customFactors: [{ e: 12345, factors: [{ f: 921, v: 1.9 }, { f: 922, v: 3.5 }, { f: 923, v: 4.2 }] }],
    });
  }
  if (/^https:\/\/api\.telegram\.org\/bot.*\/sendMessage$/.test(url)) {
    telegramSends++;
    return json({ ok: true, result: { message_id: 123 } });
  }
  if (url === 'https://plusvibeapi.ru/v1/chat/completions') {
    await awaitGate('model');
    const body = JSON.parse(options.body);
    const rows = JSON.parse(body.messages[1].content);
    const content = body.messages[0].content.includes('финального аналитика')
      ? { selectedIds: rows.map((row) => row.id), summary: 'Тестовый итог' }
      : { opinions: rows.map((row) => ({ id: row.id, verdict: 'PASS', probabilityPct: 80, confidencePct: 85, riskScore: 10, reason: 'Тестовый ответ' })) };
    return json({ model: 'mock-model', choices: [{ message: { content: JSON.stringify(content) } }] });
  }
  throw new Error(`Unexpected external request: ${url}`);
};

async function execute() {
  if (task === 'increment') {
    await db.mutateState((state) => { state.aiAutopilot.totalGeneratedCount += 1; });
    return { ok: true };
  }
  if (task === 'prepare') {
    await db.mutateState((state) => {
      state.predictions = []; state.aiDrafts = []; state.aiLogs = [];
      state.settings.telegramBotToken = ''; state.settings.telegramChannelId = '';
      Object.assign(state.aiAutopilot, {
        mode: 'MODERATION', llmProvider: 'PLUSVIBE', llmBaseUrl: 'https://plusvibeapi.ru/v1',
        llmApiKey: 'sk-pv-test-only-secret', llmModel: 'mock-model', sportsEnabled: ['FOOTBALL'],
        openSourceResearchEnabled: false, minValueEdgePct: 0, minAgentConfidencePct: 60,
        requireAgentConsensus: true, maxPicksPerRun: 1, freeEveryNthPick: 0,
        defaultAiPriceRub: 500, totalGeneratedCount: 0,
      });
    });
    return { ok: true };
  }
  if (task === 'pause-resume') {
    await db.mutateState((state) => {
      state.aiAutopilot = applyAutopilotConfigPatch(state.aiAutopilot, { mode: 'OFF' }).config;
      state.aiAutopilot = applyAutopilotConfigPatch(state.aiAutopilot, { mode: 'MODERATION' }).config;
    });
    return { ok: true };
  }
  if (task === 'scan') {
    return autopilot.runAiScanAndGenerateCycle({ forcePublish: process.env.VALUEX_TEST_FORCE === 'true' });
  }
  if (task === 'setup-settlement') {
    const buyer = await db.registerUserAccount({ email: 'postgres-race@example.test', password: 'test-password', displayName: 'Fixture' });
    const prediction = await db.createPredictionByAdmin({ sport: 'FOOTBALL', leagueName: 'Тест', homeTeam: 'А', awayTeam: 'Б',
      matchStartsAt: '2035-01-02T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2, stakeUnits: 1,
      accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: true,
      analysisTeaser: 'Анонс', analysisFull: 'Разбор', pushToTelegram: false });
    await db.mutateState((state) => { state.settings.paymentMode = 'TEST_INSTANT'; });
    await db.initiateOrderCheckout({ userId: buyer.id, kind: 'SINGLE_PREDICTION', predictionId: prediction.id,
      paymentMethod: 'yookassa', expectedAmountRub: 500, expectedPaymentMode: 'TEST_INSTANT', originUrl: 'https://example.test' });
    await db.mutateState((state) => {
      state.settings.telegramBotToken = '123456:mockToken'; state.settings.telegramChannelId = '@mockchannel';
      state.aiAutopilot.autoSettleEnabled = true;
      Object.assign(state.predictions.find((item) => item.id === prediction.id), {
        matchLifecycleStatus: 'FINISHED', finalScoreVerified: true, finalScoreVerifiedSources: ['A', 'B'],
        matchVerificationConflict: false, matchVerifiedAt: '2035-01-02T14:00:00Z', matchVerificationSource: 'A + B',
        liveHomeScore: 0, liveAwayScore: 1, finalScoreIsOvertime: false,
      });
    });
    return { predictionId: prediction.id, userId: buyer.id };
  }
  if (task === 'settle') {
    await awaitGate('settle');
    const result = await db.settlePredictionByAdmin({ predictionId: process.env.VALUEX_TEST_PREDICTION,
      resultStatus: 'LOSS', finalScore: '0:1', onlyIfPending: true,
      requireAutoSettleEnabled: true, pushResultToTelegram: true });
    return { applied: result.applied, compensatedUsers: result.compensatedUsers, telegramSends };
  }
  if (task === 'approve') {
    assert.ok(process.env.VALUEX_TEST_DRAFT);
    try {
      const prediction = await autopilot.approveAiDraftToStorefront(process.env.VALUEX_TEST_DRAFT);
      return { ok: true, id: prediction.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  throw new Error(`Unknown test task: ${task}`);
}

process.send({ event: 'ready' });
process.on('message', (message) => {
  if (message !== 'start') return;
  void execute().then(
    (result) => process.send({ event: 'result', result }, () => process.exit(0)),
    (error) => process.send({ event: 'failure', error: error?.stack || String(error) }, () => process.exit(1)),
  );
});
