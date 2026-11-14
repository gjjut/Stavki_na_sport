import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mount, click, buttonWithText } = require('./ui-test-utils.cjs');
const { FinanceTab } = require('../src/components/admin/FinanceTab.tsx');
const { UsersTab } = require('../src/components/admin/UsersTab.tsx');

const response = (json, status = 200) => ({ ok: status < 400, status, json: async () => json });
const order = (id, extra = {}) => ({
  id, userId: 'user-1', userEmail: 'a@example.com', title: `Заказ ${id}`, amountRub: 1000,
  kind: 'SINGLE_PREDICTION', paymentMethod: 'yookassa', status: 'SUCCEEDED',
  predictionId: 'pred-1', predictionIds: ['pred-1'], createdAt: '2026-11-12T10:00:00Z',
  paidAt: '2026-11-12T10:01:00Z', ...extra,
});
const user = (id, extra = {}) => ({
  id, email: `${id}@example.com`, displayName: id, city: '', role: 'USER', status: 'ACTIVE',
  balanceRub: 0, referenceBankrollRub: 50000, telegramUsername: null, telegramChatId: null,
  telegramLinkCode: '', purchasedPredictionIds: [], referralCode: '', revsharePercent: 30,
  affiliateBalanceRub: 0, affiliateTotalEarnedRub: 0, ...extra,
});
const callbacks = { onRefresh: async () => {}, onToast: () => {} };

test('orders can be sorted by amount and cancelled orders have their own status', async (t) => {
  const orders = [order('small', { amountRub: 100, status: 'CANCELED' }), order('large', { amountRub: 900 })];
  const view = await mount(FinanceTab, { ...callbacks, transactions: orders, payouts: [] });
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Сумма'));
  let rows = [...view.container.querySelectorAll('tbody tr')];
  assert.match(rows[0].textContent, /Заказ large/);
  assert.match(rows[1].textContent, /Отменён/);
  assert.equal(buttonWithText(view.container, 'Сумма').closest('th').getAttribute('aria-sort'), 'descending');
  await click(buttonWithText(view.container, 'Сумма'));
  rows = [...view.container.querySelectorAll('tbody tr')];
  assert.match(rows[0].textContent, /Заказ small/);
  await click(buttonWithText(view.container, 'Отменены'));
  assert.equal(view.container.querySelectorAll('tbody tr').length, 1);
});

test('refund shows store-credit terms and previously paid insurance before confirmation', async (t) => {
  const calls = [];
  const toasts = [];
  let refreshes = 0;
  global.fetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return response({ creditedRub: 600 }); };
  const view = await mount(FinanceTab, {
    transactions: [order('insured', { insuranceCredited: true, insuranceRefundedAmountRub: 400 })], payouts: [],
    onRefresh: async () => { refreshes++; }, onToast: (...args) => toasts.push(args),
  });
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Возврат на баланс'));
  const dialog = view.container.querySelector('[role="dialog"]');
  assert.match(dialog.textContent, /600/);
  assert.match(dialog.textContent, /страховки 400/);
  assert.match(dialog.textContent, /На карту или в ЮKassa этот возврат не отправляется/);
  assert.equal(calls.length, 0);
  await click(buttonWithText(dialog, 'Вернуть на баланс'));
  assert.equal(calls[0].body.action, 'REFUND_ORDER');
  assert.equal(calls[0].body.orderId, 'insured');
  assert.match(toasts[0][0], /600/);
  assert.equal(refreshes, 1);
});

test('top-ups and ambiguous old insurance are not offered for automatic refunds', async (t) => {
  const view = await mount(FinanceTab, {
    ...callbacks, payouts: [],
    transactions: [order('topup', { kind: 'BALANCE_TOPUP' }), order('legacy', { insuranceCredited: true })],
  });
  t.after(view.cleanup);
  assert.equal(buttonWithText(view.container, 'Возврат на баланс'), undefined);
  assert.equal([...view.container.querySelectorAll('tbody span')].filter((el) => el.textContent === 'Требуется ручная проверка').length, 2);
});

test('verified external refunds are visible, filterable and block balance refunds', async (t) => {
  const view = await mount(FinanceTab, {
    ...callbacks, payouts: [], transactions: [
      order('normal'),
      order('review', { refundDestination: 'BALANCE', status: 'REFUNDED', externalRefundNotices: [
        { id: 'refund-42', amountValue: '300.00', currency: 'RUB', verifiedAt: '2026-11-12T12:00:00Z' },
      ] }),
      order('partial', { externalRefundNotices: [
        { id: 'refund-43', amountValue: '100.00', currency: 'RUB', verifiedAt: '2026-11-12T12:00:00Z' },
      ] }),
    ],
  });
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'На сверке'));
  const rows = [...view.container.querySelectorAll('tbody tr')];
  assert.equal(rows.length, 2);
  assert.match(rows.find((row) => row.textContent.includes('Заказ review')).textContent, /Возможен двойной возврат/);
  assert.match(rows.find((row) => row.textContent.includes('Заказ partial')).textContent, /100\.00 RUB.*refund-43/);
  assert.equal(buttonWithText(view.container, 'Возврат на баланс'), undefined);
  assert.match(rows.find((row) => row.textContent.includes('Заказ partial')).textContent, /Требуется ручная проверка/);
});

test('payout confirmation does not claim success for an API failure', async (t) => {
  const toasts = [];
  let calls = 0;
  global.fetch = async () => { calls++; return response({ error: 'Заявка уже обработана' }, 400); };
  const payout = { id: 'payout-1', userId: 'user-1', userEmail: 'a@example.com', amountRub: 250, status: 'PENDING', requisites: 'СБП', createdAt: '2026-11-12T10:00:00Z' };
  const view = await mount(FinanceTab, { ...callbacks, transactions: [], payouts: [payout], onToast: (...args) => toasts.push(args) });
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Отметить выплаченной'));
  const dialog = view.container.querySelector('[role="dialog"]');
  assert.match(dialog.textContent, /не отправляет перевод/);
  assert.equal(calls, 0);
  await click(buttonWithText(dialog, 'Отметить выплаченной'));
  assert.deepEqual(toasts[0], ['Заявка уже обработана', 'error']);
  assert.equal(calls, 1);
});

test('client details only show orders belonging to that user and distinguish open access', async (t) => {
  const users = [user('user-1', { displayName: 'Алина', purchasedPredictionIds: ['pred-1'], balanceRub: 300 }), user('user-2', { displayName: 'Борис', balanceRub: 800 })];
  const transactions = [order('mine', { userId: 'user-1', title: 'Моя покупка' }), order('other', { userId: 'user-2', title: 'Чужая покупка', userEmail: 'user-1@example.com' })];
  const predictions = [{ id: 'pred-1', homeTeam: 'Команда А', awayTeam: 'Команда Б', leagueName: 'Лига' }];
  const view = await mount(UsersTab, { ...callbacks, users, predictions, transactions });
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Баланс'));
  const rows = [...view.container.querySelectorAll('tbody tr')];
  assert.match(rows[0].textContent, /Борис/);
  await click(buttonWithText(view.container, 'Алина (user-1@example.com)'));
  const dialog = view.container.querySelector('[role="dialog"]');
  assert.match(dialog.textContent, /Моя покупка/);
  assert.doesNotMatch(dialog.textContent, /Чужая покупка/);
  assert.match(dialog.textContent, /Команда А — Команда Б/);
  assert.match(dialog.textContent, /купленные и подаренные доступы/);
});

test('palette targets open the exact client or order, not IDs with the same prefix', async (t) => {
  const first = user('user-1', { displayName: 'Алина' });
  const second = user('user-10', { displayName: 'Борис' });
  const usersView = await mount(UsersTab, {
    ...callbacks, users: [first, second], transactions: [], predictions: [],
    initialSearch: 'user-1', initialUserId: 'user-1',
  });
  t.after(usersView.cleanup);
  assert.equal(usersView.container.querySelectorAll('tbody tr').length, 1);
  assert.match(usersView.container.querySelector('[role="dialog"]').textContent, /Алина/);
  const financeView = await mount(FinanceTab, {
    ...callbacks, payouts: [], transactions: [order('order-1'), order('order-10')],
    initialSearch: 'order-1', initialOrderId: 'order-1',
  });
  t.after(financeView.cleanup);
  assert.equal(financeView.container.querySelectorAll('tbody tr').length, 1);
  assert.match(financeView.container.querySelector('tbody tr').textContent, /Заказ order-1/);
});
