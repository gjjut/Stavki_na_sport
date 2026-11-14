import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { act, mount, click, dom } = require('./ui-test-utils.cjs');
const { AdminCommandPalette } = require('../src/components/admin/AdminCommandPalette.tsx');
const { searchAdminCommands } = require('../src/lib/admin-command-search.ts');

const users = [{ id: 'user-1', displayName: 'Алёна', email: 'alena@example.com' }];
const predictions = [{ id: 'prediction-1', slug: 'match-a', homeTeam: 'Команда А', awayTeam: 'Команда Б', leagueName: 'Лига' }];
const transactions = [{ id: 'order-1', title: 'Матч А — Б', userEmail: 'alena@example.com', amountRub: 700 }];
const data = { users, predictions, transactions };

async function type(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

async function key(target, value, extra = {}) {
  const event = new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra });
  await act(async () => target.dispatchEvent(event));
  return event;
}

test('search finds sections and exact record targets without issuing mutations', () => {
  assert.equal(searchAdminCommands('', data).length, 8);
  assert.equal(searchAdminCommands('партнеры', data)[0].target.tab, 'USERS');
  const userResult = searchAdminCommands('алена example.com', data).find((result) => result.group === 'Клиенты');
  assert.deepEqual(userResult.target, { tab: 'USERS', search: 'user-1', userId: 'user-1' });
  const matchResult = searchAdminCommands('команда а', data).find((result) => result.group === 'События');
  assert.equal(matchResult.target.predictionId, 'prediction-1');
  const orderResult = searchAdminCommands('order-1', data).find((result) => result.group === 'Заказы');
  assert.equal(orderResult.target.orderId, 'order-1');
  assert.deepEqual(searchAdminCommands('несуществующее', data), []);
});

test('Ctrl+K opens the palette, Escape closes it and restores focus', async (t) => {
  const view = await mount(AdminCommandPalette, { enabled: true, ...data, onNavigate: () => {} });
  t.after(view.cleanup);
  const trigger = view.container.querySelector('button[aria-label="Открыть поиск по админ-панели"]');
  trigger.focus();
  const shortcut = await key(dom.window, 'k', { ctrlKey: true });
  assert.equal(shortcut.defaultPrevented, true);
  const dialog = view.container.querySelector('[role="dialog"]');
  assert.ok(dialog);
  const input = dialog.querySelector('[role="combobox"]');
  assert.equal(document.activeElement, input);
  await key(input, 'Escape');
  assert.equal(view.container.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, trigger);
});

test('keyboard search opens the selected client without sending a request', async (t) => {
  const selected = [];
  let requests = 0;
  global.fetch = async () => { requests++; throw new Error('No network expected'); };
  const view = await mount(AdminCommandPalette, { enabled: true, ...data, onNavigate: (target) => selected.push(target) });
  t.after(view.cleanup);
  await click(view.container.querySelector('button[aria-label="Открыть поиск по админ-панели"]'));
  const input = view.container.querySelector('[role="combobox"]');
  await type(input, 'alena@example.com');
  assert.equal(view.container.querySelectorAll('[role="option"]').length, 2);
  await key(input, 'Enter');
  assert.deepEqual(selected[0], { tab: 'USERS', search: 'user-1', userId: 'user-1' });
  assert.equal(requests, 0);
  assert.equal(view.container.querySelector('[role="dialog"]'), null);
});

test('arrow keys select a result and Ctrl+K does not open over another modal', async (t) => {
  const selected = [];
  const view = await mount(AdminCommandPalette, { enabled: true, ...data, onNavigate: (target) => selected.push(target) });
  t.after(view.cleanup);
  const otherDialog = document.createElement('div');
  otherDialog.setAttribute('role', 'dialog');
  otherDialog.setAttribute('aria-modal', 'true');
  document.body.appendChild(otherDialog);
  await key(dom.window, 'k', { metaKey: true });
  assert.equal(view.container.querySelector('[role="dialog"]'), null);
  otherDialog.remove();
  await key(dom.window, 'k', { metaKey: true });
  const input = view.container.querySelector('[role="combobox"]');
  await key(input, 'ArrowDown');
  assert.equal(input.getAttribute('aria-activedescendant'), 'admin-command-option-1');
  await key(input, 'Enter');
  assert.equal(selected[0].tab, 'AUTOPILOT');
});

test('physical Ctrl+K works with a Russian keyboard and leaves Ctrl+Shift+K alone', async (t) => {
  const view = await mount(AdminCommandPalette, { enabled: true, ...data, onNavigate: () => {} });
  t.after(view.cleanup);
  const shifted = await key(dom.window, 'K', { ctrlKey: true, shiftKey: true, code: 'KeyK' });
  assert.equal(shifted.defaultPrevented, false);
  assert.equal(view.container.querySelector('[role="dialog"]'), null);
  const russian = await key(dom.window, 'л', { ctrlKey: true, code: 'KeyK' });
  assert.equal(russian.defaultPrevented, true);
  assert.ok(view.container.querySelector('[role="dialog"]'));
});
