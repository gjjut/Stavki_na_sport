import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mount, click, buttonWithText, dom } = require('./ui-test-utils.cjs');
const AdminDashboardPage = require('../src/app/admin/page.tsx').default;
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const overview = {
  settings: {
    brandName: 'Fixture', supportTelegram: '', freeTelegramUrl: '', legalSellerName: '', legalInn: '', supportEmail: '',
    paymentMode: 'TEST_INSTANT', yookassaShopId: '', yookassaSecretKey: '', yookassaVatCode: 1,
    defaultSinglePriceRub: 790, bundle2DiscountPct: 15, bundle3DiscountPct: 25,
    telegramBotToken: '', telegramBotTokenConfigured: true, telegramChannelId: '@saved_channel', yandexMetrikaId: '',
  },
  users: [], predictions: [], transactions: [], payouts: [], promoCodes: [],
  aiAutopilot: { mode: 'OFF' }, aiDrafts: [], aiLogs: [], aiChatMessages: [], stats: {}, aiStats: {},
};

test('Telegram settings offers a persistent read-only diagnostic using saved settings', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  global.self = dom.window;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === '/api/v1/admin/overview') return response(overview);
    if (url === '/api/health') return response({ status: 'ok' });
    assert.equal(url, '/api/v1/admin/settings');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { action: 'DIAGNOSE_CHANNEL' });
    return response({ ok: false, message: 'Боту не хватает права публиковать в канале.' });
  };
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; });
  const view = await mount(AdminDashboardPage, {});
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Настройки'));
  assert.match(view.container.textContent, /Проверка использует сохранённые настройки/);
  assert.ok(buttonWithText(view.container, 'Тестовый пост в канал'));
  await click(buttonWithText(view.container, 'Проверить без публикации'));
  assert.match(view.container.querySelector('[role="alert"]').textContent, /не хватает права публиковать/);
  assert.equal(requests.filter((request) => request.url === '/api/v1/admin/settings').length, 1);
});
