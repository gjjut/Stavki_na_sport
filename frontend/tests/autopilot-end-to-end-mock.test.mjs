import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const cwd = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-autopilot-mock-'));
const envNames = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID', 'PLUSVIBE_API_KEY', 'OLLAMA_API_KEY', 'AI_LLM_API_KEY'];
const env = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
for (const name of envNames) delete process.env[name];
process.chdir(temp);
const previousFetch = global.fetch;
const db = require('../src/server/database.ts');
const autopilot = require('../src/server/ai-autopilot.ts');
const { applyAutopilotConfigPatch } = require('../src/server/autopilot-config-policy.ts');
const guards = require('../src/server/guards.ts');
guards.requireAdminAccount = async () => ({ id: 'test-admin', role: 'ADMIN' });
const predictionsRoute = require('../src/app/api/v1/admin/predictions/route.ts');
const { NextRequest } = require('next/server');
const startTime = Math.floor((Date.now() + 4 * 3600_000) / 1000);
let odds = 1.9;
let modelFailure = false;
let mutateDuringModel = false;
let cancelDuringModel = null;
let modelCalls = 0;
let bookmakerCalls = 0;
const response = (json, status = 200) => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });

async function reset(provider = 'PLUSVIBE') {
  odds = 1.9; modelFailure = false; mutateDuringModel = false; cancelDuringModel = null; modelCalls = 0; bookmakerCalls = 0;
  await db.mutateState((state) => {
    state.predictions = []; state.aiDrafts = []; state.aiLogs = []; state.aiChatMessages = [];
    state.settings.telegramBotToken = ''; state.settings.telegramChannelId = '';
    Object.assign(state.aiAutopilot, {
      mode: 'MODERATION', llmProvider: provider, llmBaseUrl: 'https://plusvibeapi.ru/v1',
      llmApiKey: 'sk-pv-mock-secret-fixture', llmModel: 'mock-requested-model',
      sportsEnabled: ['FOOTBALL'], openSourceResearchEnabled: false, minValueEdgePct: 0,
      minAgentConfidencePct: 60, requireAgentConsensus: true, maxPicksPerRun: 1,
      freeEveryNthPick: 0, defaultAiPriceRub: 500, totalGeneratedCount: 0,
    });
  });
  global.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url === 'https://www.fon.bet/urls.json') return response({ line: ['https://line.mock.invalid'] });
    if (url.includes('events/listBase')) {
      bookmakerCalls++;
      return response({
        sports: [{ id: 1, name: 'Футбол' }, { id: 10, parentId: 1, name: 'РПЛ' }],
        events: [{ id: 12345, level: 1, sportId: 10, team1: 'Север', team2: 'Юг', startTime }],
        customFactors: [{ e: 12345, factors: [{ f: 921, v: odds }, { f: 922, v: 3.5 }, { f: 923, v: 4.2 }] }],
      });
    }
    if (url === 'https://plusvibeapi.ru/v1/chat/completions') {
      modelCalls++;
      if (mutateDuringModel) {
        mutateDuringModel = false;
        await db.mutateState((state) => { state.aiAutopilot.mode = 'OFF'; });
      }
      if (cancelDuringModel) {
        const action = cancelDuringModel;
        cancelDuringModel = null;
        await db.mutateState((state) => {
          state.aiAutopilot = applyAutopilotConfigPatch(state.aiAutopilot, { mode: 'OFF' }).config;
          if (action === 'pause-resume') {
            state.aiAutopilot = applyAutopilotConfigPatch(state.aiAutopilot, { mode: 'MODERATION' }).config;
          }
        });
      }
      if (modelFailure === 'invalid-json') return response({ model: 'mock-returned-model', choices: [{ message: { content: 'not a valid role response' } }] });
      if (modelFailure === 'invalid-envelope') return response({ error: 'private model response text' });
      if (modelFailure === 'empty') return response({ choices: [{ message: { content: '' } }] });
      if (modelFailure === 'truncated') return response({ model: 'mock-returned-model', choices: [{ finish_reason: 'length', message: { content: '' } }] });
      if (modelFailure === 'timeout') { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; }
      if (modelFailure && modelFailure !== 'veto' && modelFailure !== 'leader-sensitive') {
        return response({ error: 'offline sk-pv-mock-secret-fixture' }, 503);
      }
      const body = JSON.parse(options.body);
      const rows = JSON.parse(body.messages[1].content);
      const content = body.messages[0].content.includes('финального аналитика')
        ? { selectedIds: rows.map((row) => row.id), summary: modelFailure === 'leader-sensitive' ? 'untrusted leader text sk-pv-mock-secret-fixture' : 'Макетный ответ финальной роли' }
        : { opinions: rows.map((row) => ({ id: row.id, verdict: modelFailure === 'veto' ? 'VETO' : 'PASS', probabilityPct: 80, confidencePct: 85, riskScore: 10, reason: modelFailure === 'veto' ? 'untrusted veto text' : 'Макетный ответ роли' })) };
      return response({ model: 'mock-returned-model', choices: [{ message: { content: JSON.stringify(content) } }] });
    }
    throw new Error(`Unexpected external request in isolated test: ${url}`);
  };
}

after(() => {
  global.fetch = previousFetch;
  process.chdir(cwd);
  for (const name of envNames) {
    if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
  }
  rmSync(temp, { recursive: true, force: true });
});

test('mocked line and model create a draft; approval rechecks the quote and atomically publishes it', async () => {
  await reset();
  const result = await autopilot.runAiScanAndGenerateCycle({ forcePublish: false });
  assert.equal(result.createdCount, 1);
  assert.equal(result.publishedDirectly, false);
  assert.equal(modelCalls, 4);
  let state = await db.readState();
  assert.equal(state.predictions.length, 0);
  assert.equal(state.aiDrafts.length, 1);
  const draft = state.aiDrafts[0];
  assert.equal(draft.fixedOdds, 1.9);
  assert.match(draft.agentReport, /mock-requested-model/);
  assert.match(draft.agentReport, /mock-returned-model/);
  assert.match(draft.agentReport, /Серверный алгоритм риск-менеджера/);
  assert.match(draft.analysisFull, /Текст разбора собран серверным шаблоном/);
  const created = await autopilot.approveAiDraftToStorefront(draft.id);
  state = await db.readState();
  assert.equal(state.aiDrafts.length, 0);
  assert.equal(state.predictions.length, 1);
  assert.equal(created.externalFixtureId, 'fonbet_12345');
  assert.equal(state.aiAutopilot.totalGeneratedCount, 1);
  assert.ok(bookmakerCalls >= 4, 'the bookmaker is read for scanning and approval');
  assert.ok(state.aiLogs.some((item) => /анонс Telegram не подтверждён/.test(item.message)));
});

test('a high configured model-edge threshold does not pre-filter the unrelated heuristic edge', async () => {
  await reset();
  await db.mutateState((state) => { state.aiAutopilot.minValueEdgePct = 9; });
  const result = await autopilot.runAiScanAndGenerateCycle({ forcePublish: false });
  assert.ok(modelCalls >= 3, 'a 9 p.p. threshold must reach model evaluation, not the 3.2–8.6 heuristic gate');
  assert.equal(result.scannedCount, 1);
  const state = await db.readState();
  if (result.createdCount) {
    assert.ok(state.aiDrafts[0].valueEdgePct >= 9, 'the actual model/risk threshold still applies');
  } else {
    assert.ok(state.aiLogs.some((entry) => /перевес|порог/i.test(entry.message)), 'rejection is explained in the model evaluation log');
  }
});

test('changed bookmaker quote blocks approval and preserves the draft', async () => {
  await reset();
  await autopilot.runAiScanAndGenerateCycle({ forcePublish: false });
  const draft = (await db.readState()).aiDrafts[0];
  odds = 2.0;
  await assert.rejects(autopilot.approveAiDraftToStorefront(draft.id), /не совпадают с текущей линией/);
  const state = await db.readState();
  assert.equal(state.aiDrafts.length, 1);
  assert.equal(state.predictions.length, 0);
});

test('failed model or selected local mode never invents forecasts or calls a saved key in local mode', async () => {
  await reset();
  modelFailure = true;
  const failed = await autopilot.runAiScanAndGenerateCycle({ forcePublish: true });
  assert.equal(failed.createdCount, 0);
  const failedState = await db.readState();
  assert.equal(failedState.predictions.length, 0);
  assert.ok(modelCalls >= 3);
  const agentLog = failedState.aiLogs.find((item) => item.stage === 'AGENTS');
  assert.match(agentLog.message, /HTTP 503/);
  assert.match(agentLog.message, /финального аналитика не вызывалась/);
  assert.doesNotMatch(agentLog.message, /mock-secret-fixture|offline/);
  await reset('BUILTIN_QUANT');
  const local = await autopilot.runAiScanAndGenerateCycle({ forcePublish: true });
  assert.equal(local.createdCount, 0);
  assert.equal(modelCalls, 0);
  assert.equal((await db.readState()).predictions.length, 0);
});

test('parallel scans cannot create duplicate predictions or duplicate drafts', async () => {
  for (const forcePublish of [false, true]) {
    await reset();
    const results = await Promise.all([
      autopilot.runAiScanAndGenerateCycle({ forcePublish }),
      autopilot.runAiScanAndGenerateCycle({ forcePublish }),
    ]);
    const state = await db.readState();
    assert.equal(results.reduce((sum, result) => sum + result.createdCount, 0), 1);
    assert.equal(state.predictions.length, forcePublish ? 1 : 0);
    assert.equal(state.aiDrafts.length, forcePublish ? 0 : 1);
    assert.equal(state.aiAutopilot.totalGeneratedCount, 1);
  }
});

test('pausing or changing settings mid-scan prevents the remaining publication', async () => {
  await reset();
  mutateDuringModel = true;
  const result = await autopilot.runAiScanAndGenerateCycle({ forcePublish: true });
  assert.equal(result.createdCount, 0);
  assert.match(result.warning, /изменились во время сбора/);
  assert.equal((await db.readState()).predictions.length, 0);
});

test('parallel approval of the same draft publishes and announces only once', async () => {
  await reset();
  await autopilot.runAiScanAndGenerateCycle({ forcePublish: false });
  const draftId = (await db.readState()).aiDrafts[0].id;
  const outcomes = await Promise.allSettled([
    autopilot.approveAiDraftToStorefront(draftId),
    autopilot.approveAiDraftToStorefront(draftId),
  ]);
  assert.equal(outcomes.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.match(outcomes.find((entry) => entry.status === 'rejected').reason.message, /удалён|изменён|опубликован|не найден/i);
  const state = await db.readState();
  assert.equal(state.predictions.length, 1);
  assert.equal(state.aiDrafts.length, 0);
  assert.equal(state.aiLogs.filter((entry) => /анонс Telegram не подтверждён/.test(entry.message)).length, 1);
});

test('repeated pause and a quick pause-resume invalidate an in-flight manual scan', async () => {
  for (const action of ['repeat-pause', 'pause-resume']) {
    await reset();
    if (action === 'repeat-pause') await db.mutateState((state) => { state.aiAutopilot.mode = 'OFF'; });
    const before = (await db.readState()).aiAutopilot.mode;
    cancelDuringModel = action;
    const result = await autopilot.runAiScanAndGenerateCycle({ forcePublish: true });
    const state = await db.readState();
    assert.equal(state.aiAutopilot.mode, before, 'the final visible mode is intentionally unchanged');
    assert.equal(result.createdCount, 0);
    assert.match(result.warning, /изменились во время сбора/);
    assert.equal(state.predictions.length, 0);
  }
});

test('a stale scheduled trigger cannot publish after pause, even if it reaches the scanner later', async () => {
  await reset();
  await db.mutateState((state) => { state.aiAutopilot.mode = 'FULL_AUTOPILOT'; });
  const snapshot = structuredClone((await db.readState()).aiAutopilot);
  await db.mutateState((state) => {
    state.aiAutopilot = applyAutopilotConfigPatch(state.aiAutopilot, { mode: 'OFF' }).config;
  });
  const result = await autopilot.runAiScanAndGenerateCycle({
    forcePublish: true, expectedConfigSnapshot: snapshot, requireFullMode: true,
  });
  assert.equal(result.createdCount, 0);
  assert.match(result.warning, /изменились во время сбора/);
  assert.equal(bookmakerCalls, 0);
  assert.equal(modelCalls, 0);
  assert.equal((await db.readState()).predictions.length, 0);
});

test('manual admin API cannot manufacture an AI provenance label or report', async () => {
  await reset();
  const req = new NextRequest('http://localhost/api/v1/admin/predictions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sport: 'FOOTBALL', leagueName: 'Лига', homeTeam: 'Север', awayTeam: 'Юг',
      matchStartsAt: new Date(startTime * 1000).toISOString(), selectionTitle: 'Победа 1', fixedOdds: 1.9,
      stakeUnits: 1, accessTier: 'FREE', analysisTeaser: 'Анонс', analysisFull: 'Ручной текст',
      authorSource: 'AI_AUTOPILOT', externalFixtureId: 'fonbet_12345', agentReport: 'Поддельный отчёт', pushToTelegram: false }),
  });
  const res = await predictionsRoute.POST(req);
  assert.equal(res.status, 200);
  const prediction = (await res.json()).prediction;
  assert.equal(prediction.authorSource, 'HUMAN');
  assert.equal(prediction.agentReport, null);
});

test('role logs differentiate unusable model JSON, token truncation and timeout without publishing', async () => {
  for (const [failure, description] of [
    ['invalid-json', /ожидаемый JSON/],
    ['invalid-envelope', /некорректный формат ответа/],
    ['empty', /видимый текст модели пуст/],
    ['truncated', /лимиту токенов/],
    ['timeout', /истёк срок ожидания/],
  ]) {
    await reset();
    modelFailure = failure;
    const result = await autopilot.runAiScanAndGenerateCycle({ forcePublish: false });
    assert.equal(result.createdCount, 0);
    assert.equal(modelCalls, 3);
    const state = await db.readState();
    const log = state.aiLogs.find((entry) => entry.stage === 'AGENTS');
    assert.match(log.message, description);
    assert.match(log.message, /0\/3/);
    assert.match(log.message, /не вызывалась/);
    assert.doesNotMatch(log.message, /sk-pv-mock-secret-fixture|not a valid role response/);
    assert.equal(state.aiDrafts.length, 0);
    assert.equal(state.predictions.length, 0);
  }
});

test('agent logs contain veto and leader status without free-form model text', async () => {
  await reset();
  modelFailure = 'veto';
  const veto = await autopilot.runAiScanAndGenerateCycle({ forcePublish: false });
  assert.equal(veto.createdCount, 0);
  let state = await db.readState();
  let log = state.aiLogs.find((entry) => entry.stage === 'AGENTS');
  assert.match(log.message, /Вето FORM, NEWS, MATCHUP/);
  assert.match(log.message, /не вызывалась/);
  assert.doesNotMatch(log.message, /untrusted veto text/);

  await reset();
  modelFailure = 'leader-sensitive';
  const selected = await autopilot.runAiScanAndGenerateCycle({ forcePublish: false });
  assert.equal(selected.createdCount, 1);
  state = await db.readState();
  log = state.aiLogs.find((entry) => entry.stage === 'AGENTS');
  assert.match(log.message, /финального аналитика выполнила отбор/);
  assert.doesNotMatch(log.message, /untrusted leader text|sk-pv-mock-secret-fixture/);
  assert.doesNotMatch(state.aiDrafts[0].agentReport, /sk-pv-mock-secret-fixture/);
});
