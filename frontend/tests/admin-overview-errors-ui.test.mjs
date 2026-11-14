import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mount, click, buttonWithText, dom } = require('./ui-test-utils.cjs');
const AdminDashboardPage = require('../src/app/admin/page.tsx').default;

const response = (body, status) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('the admin page distinguishes a storage outage from an authorization error and can retry', async (t) => {
  const originalFetch = global.fetch;
  const originalSelf = global.self;
  global.self = dom.window;
  let requests = 0;
  global.fetch = async (url) => {
    assert.equal(url, '/api/v1/admin/overview');
    requests++;
    return requests === 1
      ? response({ error: 'Хранилище временно недоступно.' }, 503)
      : response({ error: 'Войдите' }, 401);
  };
  t.after(() => { global.fetch = originalFetch; global.self = originalSelf; });
  const view = await mount(AdminDashboardPage, {});
  t.after(view.cleanup);
  assert.match(view.container.textContent, /Хранилище временно недоступно/);
  assert.equal(view.container.querySelector('a[href="/login"]'), null);
  await click(buttonWithText(view.container, 'Повторить'));
  assert.equal(requests, 2);
  assert.match(view.container.textContent, /Требуется вход под аккаунтом администратора/);
  assert.ok(view.container.querySelector('a[href="/login"]'));
});
