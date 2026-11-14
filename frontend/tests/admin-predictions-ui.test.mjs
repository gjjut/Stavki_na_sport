import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { act, mount, click, buttonWithText, dom } = require('./ui-test-utils.cjs');
const { PredictionsTab } = require('../src/components/admin/PredictionsTab.tsx');

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const event = (id) => ({
  id, slug: `slug-${id}`, sport: 'FOOTBALL', leagueName: 'Лига', homeTeam: `Дом ${id}`,
  awayTeam: `Гости ${id}`, matchStatus: 'UPCOMING', matchLifecycleStatus: 'SCHEDULED',
  matchStartsAt: '2030-11-12T12:00:00Z', accessTier: 'PAID_SINGLE', singlePriceRub: 500,
  insuredOnLoss: true, selectionTitle: 'П1', fixedOdds: 2, resultStatus: 'PENDING',
});
const base = { defaultPrice: 500, onRefresh: async () => {}, onToast: () => {} };

async function changeValue(element, value) {
  const proto = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

test('single delete and price changes do not report success on server rejection', async (t) => {
  const toasts = [];
  let refreshed = 0;
  global.fetch = async (_url, options) => options.method === 'DELETE'
    ? response({ error: 'Событие куплено клиентом' }, 400)
    : response({ error: 'Нет прав на изменение цены' }, 403);
  const view = await mount(PredictionsTab, {
    ...base, predictions: [event('1')], onToast: (...args) => toasts.push(args),
    onRefresh: async () => { refreshed++; },
  });
  t.after(view.cleanup);
  await click(view.container.querySelector('button[aria-label="Удалить событие"]'));
  let dialog = view.container.querySelector('[role="dialog"]');
  await click(buttonWithText(dialog, 'Удалить'));
  assert.deepEqual(toasts[0], ['Событие куплено клиентом', 'error']);
  assert.ok(view.container.querySelector('[role="dialog"]'));
  await click(buttonWithText(dialog, 'Отмена'));
  await click(view.container.querySelector('button[title="Изменить цену"]'));
  dialog = view.container.querySelector('[role="dialog"]');
  await click(buttonWithText(dialog, 'Сохранить цену'));
  assert.deepEqual(toasts[1], ['Нет прав на изменение цены', 'error']);
  assert.ok(view.container.querySelector('[role="dialog"]'));
  assert.equal(refreshed, 0);
});

test('server failures refresh potentially changed event data before another attempt', async (t) => {
  const toasts = [];
  let refreshed = 0;
  global.fetch = async () => response({ error: 'Хранилище недоступно. Проверьте результат.' }, 503);
  const view = await mount(PredictionsTab, {
    ...base, predictions: [event('1')], onToast: (...args) => toasts.push(args),
    onRefresh: async () => { refreshed++; },
  });
  t.after(view.cleanup);
  await click(view.container.querySelector('button[aria-label="Удалить событие"]'));
  let dialog = view.container.querySelector('[role="dialog"]');
  await click(buttonWithText(dialog, 'Удалить'));
  await click(buttonWithText(dialog, 'Отмена'));
  await click(view.container.querySelector('button[title="Изменить цену"]'));
  dialog = view.container.querySelector('[role="dialog"]');
  await click(buttonWithText(dialog, 'Сохранить цену'));
  await click(buttonWithText(dialog, 'Отмена'));
  await click(view.container.querySelector('button[title="Переключить страховку"]'));
  assert.equal(refreshed, 3);
  assert.equal(toasts.length, 3);
  assert.ok(toasts.every(([message, kind]) => kind === 'error' && /Проверьте результат/.test(message)));
});

test('insurance and settlement network failures report an unknown result rather than success', async (t) => {
  const toasts = [];
  let refreshed = 0;
  global.fetch = async () => { throw new Error('offline'); };
  const view = await mount(PredictionsTab, {
    ...base, predictions: [event('1')], onToast: (...args) => toasts.push(args),
    onRefresh: async () => { refreshed++; },
  });
  t.after(view.cleanup);
  await click(view.container.querySelector('button[title="Переключить страховку"]'));
  assert.equal(toasts[0][1], 'error');
  assert.match(toasts[0][0], /Результат неизвестен/);
  await click(buttonWithText(view.container, 'Рассчитать по подтверждённым счётaм'));
  assert.equal(toasts[1][1], 'error');
  assert.match(toasts[1][0], /не получен/);
  assert.equal(refreshed, 2);
});

test('bulk deletion reports each partial failure and retains unresolved selections', async (t) => {
  const toasts = [];
  const requests = [];
  let refreshed = 0;
  global.fetch = async (url) => {
    requests.push(url);
    if (url.endsWith('1')) return response({ ok: true });
    if (url.endsWith('2')) return response({ error: 'Есть оплаченный заказ' }, 400);
    throw new Error('offline');
  };
  const view = await mount(PredictionsTab, {
    ...base, predictions: [1, 2, 3, 4].map((id) => event(String(id))),
    onToast: (...args) => toasts.push(args), onRefresh: async () => { refreshed++; },
  });
  t.after(view.cleanup);
  await click(view.container.querySelector('input[aria-label="Выбрать все на странице"]'));
  await click(buttonWithText(view.container, 'Удалить'));
  const dialog = view.container.querySelector('[role="dialog"]');
  assert.match(dialog.textContent, /оплаченными или ожидающими заказами/);
  await click(buttonWithText(dialog, 'Удалить (4)'));
  assert.equal(requests.length, 3);
  assert.equal(refreshed, 1);
  assert.equal(toasts[0][1], 'error');
  const report = view.container.querySelector('[role="status"]');
  assert.match(report.textContent, /Удалено: 1/);
  assert.match(report.textContent, /Не подтверждено или не отправлено: 3/);
  assert.match(report.textContent, /Дом 2 — Гости 2.*Есть оплаченный заказ/);
  assert.match(report.textContent, /Дом 3 — Гости 3.*Результат неизвестен/);
  assert.match(report.textContent, /Дом 4 — Гости 4.*Запрос не отправлен/);
  assert.equal(view.container.querySelector('input[aria-label="Выбрать Дом 1 — Гости 1"]').checked, false);
  for (const id of [2, 3, 4]) {
    assert.equal(view.container.querySelector(`input[aria-label="Выбрать Дом ${id} — Гости ${id}"]`).checked, true);
  }
});

test('bulk deletion stops on a server failure and marks the result as unconfirmed', async (t) => {
  const requests = [];
  let refreshed = 0;
  global.fetch = async (url) => {
    requests.push(url);
    return url.endsWith('1')
      ? response({ ok: true })
      : response({ error: 'Хранилище недоступно' }, 503);
  };
  const view = await mount(PredictionsTab, {
    ...base, predictions: [1, 2, 3].map((id) => event(String(id))),
    onRefresh: async () => { refreshed++; },
  });
  t.after(view.cleanup);
  await click(view.container.querySelector('input[aria-label="Выбрать все на странице"]'));
  await click(buttonWithText(view.container, 'Удалить'));
  await click(buttonWithText(view.container.querySelector('[role="dialog"]'), 'Удалить (3)'));
  assert.equal(requests.length, 2);
  assert.equal(refreshed, 1);
  const report = view.container.querySelector('[role="status"]');
  assert.match(report.textContent, /Удалено: 1/);
  assert.match(report.textContent, /Дом 2 — Гости 2.*Результат не подтверждён/);
  assert.match(report.textContent, /Дом 3 — Гости 3.*пакет остановлен после ошибки сервера/);
  assert.equal(view.container.querySelector('input[aria-label="Выбрать Дом 1 — Гости 1"]').checked, false);
  for (const id of [2, 3]) {
    assert.equal(view.container.querySelector(`input[aria-label="Выбрать Дом ${id} — Гости ${id}"]`).checked, true);
  }
});

test('publication button performs browser validation and retains form data after server error', async (t) => {
  const requests = [];
  const toasts = [];
  let refreshed = 0;
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return requests.length === 1 ? response({ error: 'Публикация отклонена' }, 400) : response({ prediction: { id: 'new' } });
  };
  const view = await mount(PredictionsTab, {
    ...base, predictions: [], onToast: (...args) => toasts.push(args), onRefresh: async () => { refreshed++; },
  });
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Опубликовать событие'));
  let dialog = view.container.querySelector('[role="dialog"]');
  const submit = buttonWithText(dialog, 'Выставить на витрину');
  const form = dialog.querySelector('form');
  assert.equal(submit.type, 'submit');
  assert.equal(submit.form, form);
  assert.equal(form.checkValidity(), false);
  await click(submit);
  assert.equal(requests.length, 0);
  await changeValue(form.querySelector('input[placeholder="Реал Мадрид"]'), 'Реал');
  await changeValue(form.querySelector('input[placeholder="Бавария"]'), 'Бавария');
  await changeValue(form.querySelector('input[placeholder^="Фора"]'), 'П1');
  await changeValue(form.querySelectorAll('textarea')[0], 'Анонс');
  await changeValue(form.querySelectorAll('textarea')[1], 'Аналитика');
  assert.equal(form.checkValidity(), true);
  await click(submit);
  assert.deepEqual(toasts[0], ['Публикация отклонена', 'error']);
  assert.equal(form.querySelector('input[placeholder="Реал Мадрид"]').value, 'Реал');
  assert.ok(view.container.querySelector('[role="dialog"]'));
  await click(submit);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].homeTeam, 'Реал');
  assert.equal(requests[1].awayTeam, 'Бавария');
  assert.equal(refreshed, 1);
  assert.equal(view.container.querySelector('[role="dialog"]'), null);
  assert.match(toasts[1][0], /Событие опубликовано/);
});

test('confirmation cannot be dismissed while a delete request is pending', async (t) => {
  let resolveRequest;
  global.fetch = () => new Promise((resolve) => { resolveRequest = resolve; });
  const view = await mount(PredictionsTab, { ...base, predictions: [event('1')] });
  t.after(view.cleanup);
  await click(view.container.querySelector('button[aria-label="Удалить событие"]'));
  const dialog = view.container.querySelector('[role="dialog"]');
  await click(buttonWithText(dialog, 'Удалить'));
  assert.equal(buttonWithText(dialog, 'Удалить').disabled, true);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.ok(view.container.querySelector('[role="dialog"]'));
  await act(async () => resolveRequest(response({ error: 'Нет доступа' }, 403)));
  assert.ok(view.container.querySelector('[role="dialog"]'));
});
