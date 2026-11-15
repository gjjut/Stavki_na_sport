import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { act, mount, click, buttonWithText, dom } = require('./ui-test-utils.cjs');
const { AnalyticsConsent, AnalyticsConsentMonitor, openAnalyticsSettings } = require('../src/components/layout/AnalyticsConsent.tsx');
const { trackMetrikaGoal } = require('../src/lib/metrika.ts');
const { YooKassaCheckoutModal } = require('../src/components/billing/YooKassaCheckoutModal.tsx');

function response(body, status = 200) { return { ok: status < 400, status, json: async () => body }; }
function savedCredentialsCheckbox(container) {
  const label = [...container.querySelectorAll('label')].find((item) => item.textContent.includes('Я сохранил(а) логин и пароль'));
  assert.ok(label, 'one-time credentials need an explicit confirmation');
  return label.querySelector('input[type="checkbox"]');
}

test('optional analytics is absent by default and after refusal, and loads only after opt-in', async (t) => {
  const oldLocalStorage = global.localStorage;
  const oldSelf = global.self;
  global.localStorage = dom.window.localStorage;
  global.self = dom.window;
  localStorage.clear();
  window.sessionStorage.clear();
  delete window.__valuexMetrikaId;
  delete window.__valuexMetrikaLoaded;
  const originalYm = window.ym;
  const calls = [];
  window.ym = (...args) => calls.push(args);
  t.after(() => {
    localStorage.clear();
    window.sessionStorage.clear();
    delete window.__valuexMetrikaId;
    delete window.__valuexMetrikaLoaded;
    if (originalYm) window.ym = originalYm; else delete window.ym;
    global.localStorage = oldLocalStorage;
    global.self = oldSelf;
    document.getElementById('ym-counter-123456')?.remove();
  });
  const view = await mount(AnalyticsConsent, { counterId: 123456 });
  t.after(view.cleanup);
  assert.ok(buttonWithText(view.container, 'Отказаться'));
  assert.equal(window.__valuexMetrikaId, undefined);
  assert.equal(document.getElementById('ym-counter-123456'), null);
  trackMetrikaGoal('before_consent');
  assert.equal(calls.length, 0);
  await click(buttonWithText(view.container, 'Отказаться'));
  assert.equal(JSON.parse(localStorage.getItem('valuex_analytics_consent_v1')).choice, 'deny');
  assert.equal(view.container.querySelector('[role="region"]'), null);
  assert.equal(window.__valuexMetrikaId, undefined);
  await act(async () => openAnalyticsSettings());
  await click(buttonWithText(view.container, 'Разрешить аналитику'));
  assert.equal(JSON.parse(localStorage.getItem('valuex_analytics_consent_v1')).choice, 'allow');
  assert.equal(window.__valuexMetrikaId, 123456);
  const script = document.getElementById('ym-counter-123456');
  assert.ok(script);
  assert.match(script.textContent, /webvisor:false/);
  trackMetrikaGoal('purchase_success', { amount: 500 });
  assert.deepEqual(calls, [[123456, 'reachGoal', 'purchase_success', { amount: 500 }]]);

  await act(async () => openAnalyticsSettings());
  // jsdom does not implement navigation; the browser test covers the actual reload.
  const oldConsoleError = console.error;
  console.error = (...args) => { if (!String(args[0]).includes('Not implemented: navigation')) oldConsoleError(...args); };
  try { await click(buttonWithText(view.container, 'Отказаться')); } finally { console.error = oldConsoleError; }
  assert.equal(JSON.parse(localStorage.getItem('valuex_analytics_consent_v1')).choice, 'deny');
  assert.equal(window.__valuexMetrikaId, undefined);
  trackMetrikaGoal('after_withdrawal');
  assert.equal(calls.length, 1);
});

test('guest checkout requires three separate unchecked confirmations', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  global.self = dom.window;
  const requests = [];
  global.fetch = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return response({ error: 'тест' }, 400); };
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; });
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: null, paymentMode: 'TEST_INSTANT', onClose: () => {}, onSuccess: async () => {},
  });
  t.after(view.cleanup);
  assert.match(view.container.textContent, /тестовый режим/i);
  const checks = [...view.container.querySelectorAll('input[type="checkbox"]')];
  assert.equal(checks.length, 3);
  assert.ok(checks.every((box) => !box.checked));
  const email = view.container.querySelector('input[type="email"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(email, 'guest@example.test');
    email.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.equal(requests.length, 0);
  assert.match(view.container.querySelector('[role="alert"]').textContent, /Подтвердите/);
  for (const checkbox of checks) await click(checkbox);
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.offerAccepted, true);
  assert.equal(requests[0].body.personalDataConsent, true);
  assert.equal(requests[0].body.rulesAccepted, true);
  assert.equal(requests[0].body.expectedAmountRub, 500);
  assert.equal(requests[0].body.expectedPaymentMode, 'TEST_INSTANT');
  assert.ok(requests[0].body.legalVersion);
});

test('a completed guest order warns when its browser session did not survive, without inviting repayment', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  const oldSessionStorage = global.sessionStorage;
  global.self = dom.window;
  global.sessionStorage = dom.window.sessionStorage;
  global.sessionStorage.clear();
  const requests = [];
  global.fetch = async (url) => {
    requests.push(url);
    if (url === '/api/v1/auth/me') return response({ user: null });
    assert.equal(url, '/api/v1/billing/checkout');
    return response({ order: { id: 'test-order', kind: 'SINGLE_PREDICTION', amountRub: 500,
      paymentModeAtCreation: 'TEST_INSTANT', paymentMethod: 'yookassa', confirmationUrl: null },
      viewer: { id: 'guest-id' }, paidImmediately: true,
      autoCreatedAccount: { email: 'guest@example.test', generatedPassword: 'test-one-time-password' } });
  };
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; global.sessionStorage.clear(); global.sessionStorage = oldSessionStorage; });
  let refreshed = 0;
  let closed = 0;
  const props = {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: null, paymentMode: 'TEST_INSTANT', onClose: () => { closed++; }, onSuccess: async () => { refreshed++; },
  };
  const view = await mount(YooKassaCheckoutModal, props);
  t.after(view.cleanup);
  const email = view.container.querySelector('input[type="email"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(email, 'guest@example.test');
    email.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  for (const checkbox of view.container.querySelectorAll('input[type="checkbox"]')) await click(checkbox);
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.deepEqual(requests, ['/api/v1/billing/checkout', '/api/v1/auth/me']);
  assert.equal(refreshed, 1);
  assert.match(view.container.textContent, /Заказ выполнен в кабинете/);
  assert.match(view.container.textContent, /вход в этом окне не подтверждён/i);
  assert.match(view.container.textContent, /Не оплачивайте повторно/i);
  assert.match(view.container.textContent, /test-one-time-password/);
  assert.match(view.container.textContent, /реального списания и чека нет/);
  assert.equal(buttonWithText(view.container, 'Оплатить 500 ₽'), undefined);
  const loginLink = view.container.querySelector('a[href="/login"]');
  assert.ok(loginLink);
  assert.equal(sessionStorage.getItem('valuex_new_credentials'), null, 'instant checkout does not leave a plaintext password in storage');

  const unload = new dom.window.Event('beforeunload', { cancelable: true });
  await act(async () => window.dispatchEvent(unload));
  assert.equal(unload.defaultPrevented, true);
  await click(view.container.querySelector('button[aria-label="Закрыть окно оплаты"]'));
  await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await click(view.container.querySelector('[role="dialog"]'));
  const loginClick = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  await act(async () => loginLink.dispatchEvent(loginClick));
  assert.equal(loginClick.defaultPrevented, true);
  assert.equal(closed, 0, 'close, Escape, backdrop and external login cannot lose the only password');
  assert.match(view.container.textContent, /прежде чем закрыть окно или перейти дальше/);
  assert.match(view.container.textContent, /test-one-time-password/);

  await click(savedCredentialsCheckbox(view.container));
  const afterConfirmation = new dom.window.Event('beforeunload', { cancelable: true });
  await act(async () => window.dispatchEvent(afterConfirmation));
  assert.equal(afterConfirmation.defaultPrevented, false);
  await click(buttonWithText(view.container, 'Закрыть'));
  assert.equal(closed, 1);
  await view.rerender({ ...props, target: null });
  assert.doesNotMatch(view.container.textContent, /test-one-time-password/);
});

test('global consent monitor stops goals when another tab clears storage, including outside SiteShell', async (t) => {
  const oldSelf = global.self;
  global.self = dom.window;
  const originalYm = window.ym;
  const calls = [];
  window.ym = (...args) => calls.push(args);
  window.sessionStorage.clear();
  window.localStorage.setItem('valuex_analytics_consent_v1', JSON.stringify({ choice: 'allow', at: Date.now() }));
  window.__valuexMetrikaId = 123456;
  window.__valuexMetrikaLoaded = true;
  const view = await mount(AnalyticsConsentMonitor, {});
  t.after(async () => {
    await view.cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete window.__valuexMetrikaId;
    delete window.__valuexMetrikaLoaded;
    if (originalYm) window.ym = originalYm; else delete window.ym;
    global.self = oldSelf;
  });
  window.localStorage.clear();
  const oldConsoleError = console.error;
  console.error = (...args) => { if (!String(args[0]).includes('Not implemented: navigation')) oldConsoleError(...args); };
  try {
    await act(async () => window.dispatchEvent(new dom.window.StorageEvent('storage', { key: null })));
  } finally { console.error = oldConsoleError; }
  assert.equal(window.__valuexMetrikaId, undefined);
  trackMetrikaGoal('must_not_fire');
  assert.equal(calls.length, 0);
});

test('a new guest sees their one-time password before leaving for external payment', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  const oldSessionStorage = global.sessionStorage;
  global.self = dom.window;
  global.sessionStorage = dom.window.sessionStorage;
  global.sessionStorage.clear();
  let successCalls = 0;
  let closed = 0;
  global.fetch = async () => response({
    order: { id: 'ord-test', kind: 'SINGLE_PREDICTION', amountRub: 500, confirmationUrl: 'https://payment.example.test/confirm' },
    paidImmediately: false,
    autoCreatedAccount: { email: 'guest@example.test', generatedPassword: 'one-time-test-password' },
  });
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; global.sessionStorage.clear(); global.sessionStorage = oldSessionStorage; });
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: null, paymentMode: 'YOOKASSA_LIVE', onClose: () => { closed++; }, onSuccess: async () => { successCalls++; },
  });
  t.after(view.cleanup);
  const email = view.container.querySelector('input[type="email"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(email, 'guest@example.test');
    email.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  for (const checkbox of view.container.querySelectorAll('input[type="checkbox"]')) await click(checkbox);
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.match(view.container.textContent, /Кабинет создан/);
  assert.match(view.container.textContent, /one-time-test-password/);
  assert.match(view.container.textContent, /Заказ ещё не оплачен/);
  assert.equal([...view.container.querySelectorAll('a')].some((link) => link.textContent.trim() === 'Перейти к оплате'), false);
  await click(buttonWithText(view.container, 'Перейти к оплате'));
  assert.match(view.container.textContent, /Сохраните данные и отметьте подтверждение/);
  assert.equal(closed, 0);
  assert.equal(JSON.parse(sessionStorage.getItem('valuex_new_credentials')).email, 'guest@example.test');
  await click(savedCredentialsCheckbox(view.container));
  const paymentLink = [...view.container.querySelectorAll('a')].find((link) => link.textContent.trim() === 'Перейти к оплате');
  assert.equal(paymentLink?.href, 'https://payment.example.test/confirm');
  assert.equal(paymentLink?.getAttribute('target'), null);
  assert.equal(successCalls, 0);
  await click(view.container.querySelector('button[aria-label="Закрыть окно оплаты"]'));
  assert.equal(closed, 1);
  assert.equal(sessionStorage.getItem('valuex_new_credentials'), null, 'cancelling clears this checkout’s stored password');
});

test('Telegram payment opens only after a fresh user click, outside the embedded app', async (t) => {
  const oldFetch = global.fetch;
  const oldTelegram = window.Telegram;
  const oldSelf = global.self;
  global.self = dom.window;
  const calls = [];
  window.Telegram = { WebApp: { initData: 'signed-data', platform: 'web', openLink: (url) => calls.push(url) } };
  global.fetch = async () => response({
    order: { id: 'ord-test', kind: 'SINGLE_PREDICTION', amountRub: 500, confirmationUrl: 'https://payment.example.test/confirm' },
    paidImmediately: false,
  });
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; if (oldTelegram) window.Telegram = oldTelegram; else delete window.Telegram; });
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: { id: 'user', balanceRub: 0 }, paymentMode: 'YOOKASSA_LIVE', onClose: () => {}, onSuccess: async () => {},
  });
  t.after(view.cleanup);
  await click(view.container.querySelector('input[type="checkbox"]'));
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.match(view.container.textContent, /Заказ создан/);
  assert.match(view.container.textContent, /может потребоваться войти/);
  assert.deepEqual(calls, []);
  const link = [...view.container.querySelectorAll('a')].find((el) => el.textContent.trim() === 'Перейти к оплате');
  assert.equal(link.getAttribute('target'), '_blank');
  await act(async () => link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })));
  assert.deepEqual(calls, ['https://payment.example.test/confirm']);
});

test('goals stop immediately when same-tab storage is cleared', async (t) => {
  const originalYm = window.ym;
  const calls = [];
  window.ym = (...args) => calls.push(args);
  window.sessionStorage.clear();
  window.localStorage.setItem('valuex_analytics_consent_v1', JSON.stringify({ choice: 'allow', at: Date.now() }));
  window.__valuexMetrikaId = 123456;
  t.after(() => {
    window.localStorage.clear(); window.sessionStorage.clear(); delete window.__valuexMetrikaId;
    if (originalYm) window.ym = originalYm; else delete window.ym;
  });
  trackMetrikaGoal('before_clear');
  window.localStorage.clear(); // no storage event is sent to this tab
  trackMetrikaGoal('after_clear');
  assert.equal(calls.length, 1);
  assert.equal(window.__valuexMetrikaId, undefined);
});

test('read-only storage never revives a stale consent or starts a new counter', async (t) => {
  const oldSelf = global.self;
  global.self = dom.window;
  const storagePrototype = dom.window.Storage.prototype;
  const oldSetItem = storagePrototype.setItem;
  window.sessionStorage.clear();
  window.localStorage.setItem('valuex_analytics_consent_v1', JSON.stringify({ choice: 'allow', at: Date.now() }));
  storagePrototype.setItem = function () { throw new Error('read-only storage'); };
  t.after(() => {
    storagePrototype.setItem = oldSetItem; window.localStorage.clear(); window.sessionStorage.clear();
    delete window.__valuexMetrikaId; delete window.__valuexMetrikaLoaded; global.self = oldSelf;
    document.getElementById('ym-counter-998877')?.remove();
  });
  const view = await mount(AnalyticsConsent, { counterId: 998877 });
  t.after(view.cleanup);
  assert.ok(buttonWithText(view.container, 'Разрешить аналитику'));
  assert.equal(document.getElementById('ym-counter-998877'), null);
  await click(buttonWithText(view.container, 'Разрешить аналитику'));
  assert.match(view.container.querySelector('[role="alert"]').textContent, /аналитика не запущена/i);
  assert.equal(document.getElementById('ym-counter-998877'), null);
  assert.equal(window.__valuexMetrikaId, undefined);
});

test('guest account credentials remain visible if checkout fails after account creation', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  const oldSessionStorage = global.sessionStorage;
  global.self = dom.window;
  global.sessionStorage = dom.window.sessionStorage;
  global.sessionStorage.clear();
  global.fetch = async () => response({ error: 'Платёж не подтверждён, проверьте перед повтором.',
    autoCreatedAccount: { email: 'failed@example.test', generatedPassword: 'show-this-password' } }, 400);
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; global.sessionStorage.clear(); global.sessionStorage = oldSessionStorage; });
  let closed = 0;
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: null, paymentMode: 'YOOKASSA_LIVE', onClose: () => { closed++; }, onSuccess: async () => { throw new Error('must not succeed'); },
  });
  t.after(view.cleanup);
  const email = view.container.querySelector('input[type="email"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(email, 'failed@example.test');
    email.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  for (const checkbox of view.container.querySelectorAll('input[type="checkbox"]')) await click(checkbox);
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.match(view.container.textContent, /Кабинет создан; статус заказа нужно проверить/);
  assert.match(view.container.textContent, /show-this-password/);
  assert.match(view.container.textContent, /проверьте перед повтором/);
  assert.equal(buttonWithText(view.container, 'Оплатить 500 ₽').disabled, true);
  assert.equal(sessionStorage.getItem('valuex_new_credentials'), null);
  const cabinetClick = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  await act(async () => view.container.querySelector('a[href="/cabinet"]').dispatchEvent(cabinetClick));
  assert.equal(cabinetClick.defaultPrevented, true);
  await click(view.container.querySelector('button[aria-label="Закрыть окно оплаты"]'));
  assert.equal(closed, 0);
  assert.match(view.container.textContent, /Сохраните данные и отметьте подтверждение/);
  await click(savedCredentialsCheckbox(view.container));
  await click(view.container.querySelector('button[aria-label="Закрыть окно оплаты"]'));
  assert.equal(closed, 1);
});

test('an account created before a known checkout rejection keeps its credentials on a later live checkout', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  const oldSessionStorage = global.sessionStorage;
  global.self = dom.window;
  global.sessionStorage = dom.window.sessionStorage;
  global.sessionStorage.clear();
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return calls === 1
      ? response({ error: 'Цена изменилась.', autoCreatedAccount: { email: 'retry@example.test', generatedPassword: 'retry-password' } }, 400)
      : response({ order: { id: 'retry-order', kind: 'SINGLE_PREDICTION', amountRub: 500, confirmationUrl: 'https://payment.example.test/confirm' }, paidImmediately: false });
  };
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; global.sessionStorage.clear(); global.sessionStorage = oldSessionStorage; });
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: null, paymentMode: 'YOOKASSA_LIVE', onClose: () => {}, onSuccess: async () => {},
  });
  t.after(view.cleanup);
  const email = view.container.querySelector('input[type="email"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(email, 'retry@example.test');
    email.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  for (const checkbox of view.container.querySelectorAll('input[type="checkbox"]')) await click(checkbox);
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.match(view.container.textContent, /retry-password/);
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.equal(calls, 1, 'no second request until the one-time credentials are acknowledged');
  await click(savedCredentialsCheckbox(view.container));
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.equal(calls, 2);
  assert.match(view.container.textContent, /retry-password/);
  assert.equal(view.container.querySelector('a[href="https://payment.example.test/confirm"]')?.textContent.trim(), 'Перейти к оплате');
  assert.equal(JSON.parse(sessionStorage.getItem('valuex_new_credentials')).generatedPassword, 'retry-password');
});

test('blocked sessionStorage still protects one-time credentials in the checkout window', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  const oldSessionStorage = global.sessionStorage;
  global.self = dom.window;
  global.sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  global.fetch = async () => response({
    order: { id: 'blocked', kind: 'SINGLE_PREDICTION', amountRub: 500, confirmationUrl: 'https://payment.example.test/confirm' },
    paidImmediately: false, autoCreatedAccount: { email: 'blocked@example.test', generatedPassword: 'blocked-storage-password' },
  });
  let closed = 0;
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; global.sessionStorage = oldSessionStorage; });
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: null, paymentMode: 'YOOKASSA_LIVE', onClose: () => { closed++; }, onSuccess: async () => {},
  });
  t.after(view.cleanup);
  const email = view.container.querySelector('input[type="email"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(email, 'blocked@example.test');
    email.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  for (const checkbox of view.container.querySelectorAll('input[type="checkbox"]')) await click(checkbox);
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  await click(view.container.querySelector('button[aria-label="Закрыть окно оплаты"]'));
  assert.equal(closed, 0);
  assert.match(view.container.textContent, /blocked-storage-password/);
  await click(savedCredentialsCheckbox(view.container));
  await click(view.container.querySelector('button[aria-label="Закрыть окно оплаты"]'));
  assert.equal(closed, 1);
});

test('an already-completed order never redirects to a stale payment confirmation URL', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  global.self = dom.window;
  let refreshed = 0;
  global.fetch = async () => response({
    order: { id: 'early-webhook', status: 'SUCCEEDED', kind: 'SINGLE_PREDICTION', amountRub: 500,
      paymentModeAtCreation: 'YOOKASSA_LIVE', paymentMethod: 'yookassa', confirmationUrl: 'https://payment.example.test/stale' },
    paidImmediately: true,
  });
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; });
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: { id: 'existing', balanceRub: 0 }, paymentMode: 'YOOKASSA_LIVE', onClose: () => {}, onSuccess: async () => { refreshed++; },
  });
  t.after(view.cleanup);
  await click(view.container.querySelector('input[type="checkbox"]'));
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.match(view.container.textContent, /Доступ успешно открыт/);
  assert.equal(view.container.querySelector('a[href="https://payment.example.test/stale"]'), null);
  assert.equal(refreshed, 1);
});

test('failure to refresh after a completed order does not invite another payment', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  global.self = dom.window;
  global.fetch = async () => response({
    order: { id: 'paid-but-stale', status: 'SUCCEEDED', kind: 'SINGLE_PREDICTION', amountRub: 500, confirmationUrl: null },
    paidImmediately: true,
  });
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; });
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: { id: 'existing', balanceRub: 0 }, paymentMode: 'TEST_INSTANT', onClose: () => {}, onSuccess: async () => { throw new Error('offline'); },
  });
  t.after(view.cleanup);
  await click(view.container.querySelector('input[type="checkbox"]'));
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.match(view.container.textContent, /Доступ успешно открыт/);
  assert.match(view.container.textContent, /данные страницы не обновились/);
  assert.match(view.container.textContent, /не оплачивайте повторно/);
  assert.equal(buttonWithText(view.container, 'Оплатить 500 ₽'), undefined);
});

test('a malformed checkout response without payment confirmation blocks a retry', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  global.self = dom.window;
  global.fetch = async () => response({ order: { id: 'unknown-order', kind: 'SINGLE_PREDICTION', amountRub: 500, confirmationUrl: null }, paidImmediately: false });
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; });
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: { id: 'existing', balanceRub: 0 }, paymentMode: 'YOOKASSA_LIVE', onClose: () => {}, onSuccess: async () => {},
  });
  t.after(view.cleanup);
  await click(view.container.querySelector('input[type="checkbox"]'));
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.match(view.container.textContent, /без подтверждения оплаты или ссылки/);
  assert.match(view.container.textContent, /до повторной оплаты/);
  assert.equal(buttonWithText(view.container, 'Оплатить 500 ₽').disabled, true);
});

test('editing a promo invalidates its in-flight result and blocks checkout until confirmed', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  global.self = dom.window;
  let release;
  global.fetch = async () => new Promise((resolve) => { release = resolve; });
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; });
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: null, paymentMode: 'TEST_INSTANT', onClose: () => {}, onSuccess: async () => {},
  });
  t.after(view.cleanup);
  const input = view.container.querySelector('input[placeholder^="Промокод"]');
  const setInput = async (value) => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await setInput('START15');
  await click(buttonWithText(view.container, 'Применить'));
  await setInput('OTHER');
  await act(async () => release(response({ pricing: { promoValidCode: 'START15', finalAmountRub: 425, discountRub: 75, subtotalRub: 500 } })));
  assert.doesNotMatch(view.container.textContent, /Промокод START15 активирован/);
  assert.equal(buttonWithText(view.container, 'Оплатить 500 ₽').disabled, true);
  await setInput('');
  assert.equal(buttonWithText(view.container, 'Оплатить 500 ₽').disabled, false);
});

test('a lost checkout response is treated as unknown, not a failed payment safe to repeat', async (t) => {
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  global.self = dom.window;
  global.fetch = async () => { throw new Error('connection lost'); };
  t.after(() => { global.fetch = oldFetch; global.self = oldSelf; });
  const view = await mount(YooKassaCheckoutModal, {
    target: { kind: 'SINGLE_PREDICTION', title: 'A — B', subtitle: 'Матч', priceRub: 500, predictionId: 'p1' },
    viewer: null, paymentMode: 'YOOKASSA_LIVE', onClose: () => {}, onSuccess: async () => {},
  });
  t.after(view.cleanup);
  const email = view.container.querySelector('input[type="email"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(email, 'guest@example.test');
    email.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  for (const checkbox of view.container.querySelectorAll('input[type="checkbox"]')) await click(checkbox);
  await click(buttonWithText(view.container, 'Оплатить 500 ₽'));
  assert.match(view.container.textContent, /Не повторяйте оплату/);
  assert.equal(buttonWithText(view.container, 'Оплатить 500 ₽').disabled, true);
});
