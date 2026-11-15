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

test('manual draft and publish buttons send the action named on the button, even in full mode', async (t) => {
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return response({ createdCount: 0, scannedCount: 0, feedSource: 'недоступно' });
  };
  const view = await mount(AiAutopilotPanel, props({ config: { ...config, mode: 'FULL_AUTOPILOT' } }));
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Собрать линию РФ в черновики'));
  await click(buttonWithText(view.container, 'Выпустить сразу на витрину'));
  assert.deepEqual(requests, [
    { action: 'RUN_SCAN_NOW', forcePublish: false },
    { action: 'RUN_SCAN_NOW', forcePublish: true },
  ]);
});

test('legacy cleanup explicitly warns that it may also publish before it runs', async (t) => {
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return response({ removedDemoCount: 0, scannedCount: 0, createdCount: 0 });
  };
  const view = await mount(AiAutopilotPanel, props());
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Очистить старые демо и запустить выпуск'));
  const dialog = view.container.querySelector('[role="dialog"]');
  assert.match(dialog.textContent, /немедленной публикацией/);
  assert.equal(requests.length, 0);
  await click(buttonWithText(dialog, 'Очистить и запустить выпуск'));
  assert.equal(requests[0].action, 'REPLACE_DEMO_WITH_REAL');
});

test('cancelling legacy cleanup makes no request and leaves the dialog closed', async (t) => {
  let calls = 0;
  global.fetch = async () => { calls++; return response({}); };
  const view = await mount(AiAutopilotPanel, props());
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Очистить старые демо и запустить выпуск'));
  const dialog = view.container.querySelector('[role="dialog"]');
  assert.ok(dialog);
  await click(buttonWithText(dialog, 'Отмена'));
  assert.equal(calls, 0);
  assert.equal(view.container.querySelector('[role="dialog"]'), null);
});

test('pause stays available while a manual scan is pending and does not unlock other actions', async (t) => {
  const { act } = require('./ui-test-utils.cjs');
  const requests = [];
  let finishScan;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (options.method === 'PATCH') return response({});
    return new Promise((resolve) => { finishScan = resolve; });
  };
  const toasts = [];
  const view = await mount(AiAutopilotPanel, props({ onToast: (...args) => toasts.push(args) }));
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Выпустить сразу на витрину'));
  assert.equal(requests[0].action, 'RUN_SCAN_NOW');
  assert.equal(buttonWithText(view.container, 'Пауза').disabled, false);
  assert.equal(buttonWithText(view.container, 'Собрать линию РФ в черновики').disabled, true);
  await click(buttonWithText(view.container, 'Пауза'));
  assert.deepEqual(requests[1], { config: { mode: 'OFF' } });
  assert.equal(buttonWithText(view.container, 'Собрать линию РФ в черновики').disabled, true);
  assert.match(toasts[0][0], /Пауза сохранена/);
  await act(async () => {
    finishScan(response({ createdCount: 0, scannedCount: 1, feedSource: 'Макет', warning: 'Настройки изменились во время сбора' }));
  });
  assert.equal(buttonWithText(view.container, 'Собрать линию РФ в черновики').disabled, false);
  assert.match(toasts.at(-1)[0], /Настройки изменились/);
});

test('unsaved fine-tuning survives a status refresh and sends no counters or stale mode', async (t) => {
  const { act, dom } = require('./ui-test-utils.cjs');
  const requests = [];
  global.fetch = async (_url, options) => { requests.push(JSON.parse(options.body)); return response({}); };
  const initial = props();
  const view = await mount(AiAutopilotPanel, initial);
  t.after(view.cleanup);
  const confidence = view.container.querySelector('#ai-confidence-threshold');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(confidence, '72.5');
    confidence.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  assert.match(view.container.textContent, /Есть несохранённые настройки/);
  await view.rerender({ ...initial, config: { ...config, totalGeneratedCount: 99, mode: 'MODERATION' } });
  assert.equal(confidence.value, '72.5');
  assert.equal(buttonWithText(view.container, 'Премодерация черновиков').getAttribute('aria-pressed'), 'true');
  await click(buttonWithText(view.container, 'Сохранить настройки Автопилота'));
  assert.equal(requests[0].config.minAgentConfidencePct, 72.5);
  assert.equal(requests[0].config.minActiveOnStorefront, 6);
  assert.equal('mode' in requests[0].config, false);
  assert.equal('totalGeneratedCount' in requests[0].config, false);
  assert.equal('requireAgentConsensus' in requests[0].config, false);
  assert.doesNotMatch(view.container.textContent, /Есть несохранённые настройки/);
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

test('a lost digest response warns to check the channel before retrying', async (t) => {
  const toasts = [];
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).action, 'BROADCAST_DAILY_DIGEST');
    throw new Error('connection lost');
  };
  const view = await mount(AiAutopilotPanel, props({ onToast: (...args) => toasts.push(args) }));
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Сводка дня в Telegram'));
  assert.equal(calls, 1);
  assert.match(toasts[0][0], /Итог публикации неизвестен/);
  assert.match(toasts[0][0], /проверьте канал перед повтором/i);
  assert.equal(toasts[0][1], 'error');
});

test('the configuration form keeps the chosen provider and clears an unsaved secret on URL changes', async (t) => {
  const { act, dom } = require('./ui-test-utils.cjs');
  const view = await mount(AiAutopilotPanel, props());
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Ollama Cloud (deepseek-v4.1-flash)'));
  const keyInput = view.container.querySelector('input[type="password"]');
  const fillInput = async (input, value) => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await fillInput(keyInput, 'sk-pv-test-draft');
  let urlInput = [...view.container.querySelectorAll('input')].find((el) => el.value === 'https://ollama.com/v1');
  assert.ok(urlInput);
  assert.equal(keyInput.value, 'sk-pv-test-draft');
  await click(buttonWithText(view.container, 'PlusVibeAPI.ru (Платный РФ · ₽ без VPN)'));
  assert.equal(view.container.querySelector('input[type="password"]').value, '');
  urlInput = [...view.container.querySelectorAll('input')].find((el) => el.value === 'https://plusvibeapi.ru/v1');
  const nextKey = view.container.querySelector('input[type="password"]');
  await fillInput(nextKey, 'sk-pv-test-draft');
  await fillInput(urlInput, 'https://other.example/v1');
  assert.equal(nextKey.value, '');
});

test('format diagnostic tests only the saved connection and warns about one paid synthetic request', async (t) => {
  const { act, dom } = require('./ui-test-utils.cjs');
  const connected = {
    ...config, llmProvider: 'PLUSVIBE', llmBaseUrl: 'https://plusvibeapi.ru/v1',
    llmModel: 'deepseek-v4.1-flash', llmApiKeyConfigured: true,
  };
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return response({ ok: true, message: 'Одна роль вернула распознаваемые оценки для 9/9 тестовых событий.' });
  };
  const view = await mount(AiAutopilotPanel, props({ config: connected }));
  t.after(view.cleanup);
  assert.match(view.container.textContent, /Один запрос к сохранённой модели без повтора и перенаправлений, может оплачиваться/);
  assert.match(view.container.textContent, /прогнозы не создаются и не публикуются/);
  assert.match(view.container.textContent, /сохраняет показанные провайдер, адрес, модель и введённый ключ даже при ошибке/);
  let button = buttonWithText(view.container, 'Проверить формат ответа роли');
  assert.equal(button.disabled, false);
  await click(button);
  assert.deepEqual(requests, [{ action: 'TEST_AGENT_FORMAT' }]);
  assert.match(view.container.textContent, /распознаваемые оценки для 9\/9/);

  const model = [...view.container.querySelectorAll('input')].find((input) => input.value === 'deepseek-v4.1-flash');
  assert.ok(model);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(model, 'other-model');
    model.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  button = buttonWithText(view.container, 'Проверить формат ответа роли');
  assert.equal(button.disabled, true);
  assert.match(view.container.textContent, /Сначала сохраните изменения провайдера/);
  assert.doesNotMatch(view.container.textContent, /распознаваемые оценки для 9\/9/);
  assert.equal(requests.length, 1);
});

test('a lost format-test response warns about unknown charges instead of retrying', async (t) => {
  const connected = {
    ...config, llmProvider: 'PLUSVIBE', llmBaseUrl: 'https://plusvibeapi.ru/v1',
    llmModel: 'deepseek-v4.1-flash', llmApiKeyConfigured: true,
  };
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('connection lost'); };
  const view = await mount(AiAutopilotPanel, props({ config: connected }));
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Проверить формат ответа роли'));
  assert.equal(calls, 1);
  assert.match(view.container.textContent, /списание неизвестны/);
  assert.match(view.container.textContent, /проверьте историю провайдера перед повтором/);
});
