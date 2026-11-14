import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { act, mount, click, buttonWithText } = require('./ui-test-utils.cjs');
const { SystemHealth } = require('../src/components/admin/SystemHealth.tsx');

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('degraded health is visible even when the health endpoint returns 503', async (t) => {
  let requests = 0;
  global.fetch = async (url, options) => {
    requests++;
    assert.equal(url, '/api/health');
    assert.equal(options.cache, 'no-store');
    return response({ status: 'degraded', storage: 'local_file', storageDegraded: true, sessionAuthConfigured: true, adminAccountConfigured: false }, 503);
  };
  const view = await mount(SystemHealth, {});
  t.after(view.cleanup);
  assert.match(view.container.textContent, /Требуется внимание/);
  assert.match(view.container.textContent, /локальный файл · ошибка конфигурации/);
  assert.match(view.container.textContent, /Администратор: не найден/);
  assert.match(view.container.textContent, /Секрет расписания: нет данных/);
  assert.equal(requests, 1);
});

test('health errors are displayed and can be retried', async (t) => {
  let requests = 0;
  global.fetch = async () => {
    requests++;
    if (requests === 1) throw new Error('network unavailable');
    return response({ status: 'ok', storage: 'postgres', sessionAuthConfigured: true, adminAccountConfigured: true, cronAuthConfigured: true });
  };
  const view = await mount(SystemHealth, {});
  t.after(view.cleanup);
  assert.match(view.container.textContent, /Не удалось получить состояние сервера/);
  await click(buttonWithText(view.container, 'Проверить'));
  assert.match(view.container.textContent, /Проверка пройдена/);
  assert.match(view.container.textContent, /PostgreSQL/);
  assert.equal(requests, 2);
});

test('leaving the widget aborts an unfinished request', async () => {
  let signal;
  global.fetch = (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  };
  const view = await mount(SystemHealth, {});
  assert.equal(signal.aborted, false);
  await act(async () => view.cleanup());
  assert.equal(signal.aborted, true);
});
