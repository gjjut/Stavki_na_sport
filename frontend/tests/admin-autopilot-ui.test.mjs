import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mount, click, buttonWithText } = require('./ui-test-utils.cjs');
const { AiAutopilotPanel } = require('../src/components/admin/AiAutopilotPanel.tsx');

const config = {
  mode: 'OFF', llmProvider: 'BUILTIN_QUANT', llmBaseUrl: '', llmApiKey: '', llmModel: '',
  sportsEnabled: ['FOOTBALL'], morningHourMsk: 9, eveningHourMsk: 18,
  maxPicksPerRun: 3, minActiveOnStorefront: 6, minValueEdgePct: 3.5,
  defaultAiPriceRub: 500, freeEveryNthPick: 0, insureAiPicks: true,
  autoSettleEnabled: true, totalGeneratedCount: 0, lastFeedSource: null,
  lastMorningRunDate: null, lastEveningRunDate: null, lastScanAt: null, lastSettleAt: null,
};
const aiStats = {
  totalAiPredictions: 2, settledAiPredictions: 1, wins: 1, losses: 0, pushes: 0,
  winRatePct: 100, netProfitUnits: 1, yieldPct: 100,
};
const draft = {
  id: 'draft-1', externalFixtureId: 'match-1', sport: 'FOOTBALL', leagueName: 'Лига',
  homeTeam: 'Команда А', awayTeam: 'Команда Б', matchStartsAt: '2026-11-12T12:00:00Z',
  selectionTitle: 'Победа А', fixedOdds: 2.1, stakeUnits: 1, bookmakerSource: 'test',
  accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: true, confidencePct: 70,
  valueEdgePct: 5, analysisTeaser: 'Разбор', analysisFull: 'Полный разбор', createdAt: '2026-11-11T12:00:00Z',
};
const log = { id: 'log-1', level: 'INFO', stage: 'SCANNER', message: 'Начало сканирования', createdAt: '2026-11-12T10:00:00Z' };
const response = (json, status = 200) => ({ ok: status < 400, status, json: async () => json });

function props(overrides = {}) {
  return { config, aiStats, drafts: [draft], logs: [log], onRefresh: async () => {}, onToast: () => {}, ...overrides };
}

test('autopilot composes the mode, drafts, configuration, and log sections', async (t) => {
  const view = await mount(AiAutopilotPanel, props());
  t.after(view.cleanup);
  assert.match(view.container.textContent, /ИИ-Автопилот на паузе/);
  assert.match(view.container.textContent, /Подготовленные прогнозы ИИ на проверку/);
  assert.match(view.container.textContent, /Нейросеть-аналитик и расписание/);
  assert.match(view.container.textContent, /Начало сканирования/);
  assert.equal(buttonWithText(view.container, 'Пауза').getAttribute('aria-pressed'), 'true');
});

test('mode changes and diagnostic reports use the existing API actions', async (t) => {
  const requests = [];
  let refreshes = 0;
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, method: options.method, body });
    if (body.action === 'RUN_DIAGNOSTICS') {
      return response({ report: {
        mskTimeFormatted: '15:00', nextSlotLabel: '18:00',
        items: [{ name: 'Линия', ok: true, details: 'Доступна', latencyMs: 21 }],
        sampleMatches: [{ source: 'test', leagueName: 'Лига', matchTitle: 'A — Б', matchStartsAt: '2026-11-12T12:00:00Z', market: 'П1', odds: 2.1 }],
      } });
    }
    return response({});
  };
  const view = await mount(AiAutopilotPanel, props({ onRefresh: async () => { refreshes++; } }));
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Премодерация черновиков'));
  assert.deepEqual(requests[0], { url: '/api/v1/admin/autopilot', method: 'PATCH', body: { config: { mode: 'MODERATION' } } });
  assert.equal(refreshes, 1);
  assert.equal(buttonWithText(view.container, 'Премодерация черновиков').getAttribute('aria-pressed'), 'true');
  await click(buttonWithText(view.container, 'Проверить реальные матчи и узлы'));
  assert.equal(requests[1].body.action, 'RUN_DIAGNOSTICS');
  assert.match(view.container.textContent, /Отчет самодиагностики/);
  assert.match(view.container.textContent, /A — Б/);
});

test('draft deletion asks for confirmation, reports errors, and can be retried', async (t) => {
  const toasts = [];
  let calls = 0;
  let refreshes = 0;
  global.fetch = async (_url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).action, 'DELETE_DRAFT');
    return calls === 1 ? response({ error: 'Нет доступа' }, 403) : response({ ok: true });
  };
  const view = await mount(AiAutopilotPanel, props({
    onToast: (...args) => toasts.push(args),
    onRefresh: async () => { refreshes++; },
  }));
  t.after(view.cleanup);
  await click(view.container.querySelector('button[aria-label="Удалить черновик: Команда А — Команда Б"]'));
  assert.equal(calls, 0);
  assert.ok(view.container.querySelector('[role="dialog"]'));
  await click(buttonWithText(view.container, 'Удалить'));
  assert.deepEqual(toasts[0], ['Нет доступа', 'error']);
  assert.equal(refreshes, 0);
  assert.ok(view.container.querySelector('[role="dialog"]'));
  await click(buttonWithText(view.container, 'Удалить'));
  assert.equal(refreshes, 1);
  assert.equal(view.container.querySelector('[role="dialog"]'), null);
  assert.deepEqual(toasts[1], ['Черновик удалён.']);
});

test('clearing logs requires confirmation and reports network failures', async (t) => {
  const toasts = [];
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Нет соединения'); };
  const view = await mount(AiAutopilotPanel, props({ onToast: (...args) => toasts.push(args) }));
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Очистить'));
  assert.equal(calls, 0);
  const dialog = view.container.querySelector('[role="dialog"]');
  assert.ok(dialog);
  await click(buttonWithText(dialog, 'Очистить'));
  assert.equal(calls, 1);
  assert.deepEqual(toasts[0], ['Нет соединения', 'error']);
});
