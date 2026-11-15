import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const oldCwd = process.cwd();
const oldFetch = global.fetch;
const envKeys = ['DATABASE_URL', 'SESSION_SECRET', 'JWT_ACCESS_SECRET', 'NEXT_PUBLIC_SITE_URL', 'TELEGRAM_BOT_TOKEN', 'NODE_ENV'];
const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-site-security-'));
process.chdir(temp);
delete process.env.DATABASE_URL;
delete process.env.JWT_ACCESS_SECRET;
process.env.SESSION_SECRET = 'security-test-secret-'.padEnd(48, 'x');
process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.example.test';
process.env.NODE_ENV = 'test';
global.fetch = async () => { throw new Error('Real network disabled in test'); };

const { NextRequest } = require('next/server');
const db = require('../src/server/database.ts');
const auth = require('../src/server/auth.ts');
const security = require('../src/server/security-policy.ts');
const rates = require('../src/server/rate-limit.ts');
const webhook = require('../src/app/api/v1/webhooks/telegram/route.ts');
const reset = require('../src/app/api/v1/auth/reset-password/route.ts');
const register = require('../src/app/api/v1/auth/register/route.ts');
const login = require('../src/app/api/v1/auth/login/route.ts');
const logout = require('../src/app/api/v1/auth/logout/route.ts');
const checkout = require('../src/app/api/v1/billing/checkout/route.ts');
const { LEGAL_DOCUMENT_VERSION } = require('../src/lib/legal-version.ts');

function request(route, body, headers = {}) {
  return new NextRequest(`https://shop.example.test${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}
function telegram(code, chatId, secret, type = 'private') {
  const headers = secret ? { 'x-telegram-bot-api-secret-token': secret } : {};
  return webhook.POST(request('/api/v1/webhooks/telegram', {
    message: { text: `/start ${code}`, chat: { id: chatId, username: 'test', type } },
  }, headers));
}
const telegramOk = () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: {} }) });

after(() => {
  global.fetch = oldFetch;
  process.chdir(oldCwd);
  for (const key of envKeys) {
    if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];
  }
  rmSync(temp, { recursive: true, force: true });
});

test('HTTPS cookies are secure and rate limiting ignores spoofed leftmost XFF', () => {
  const req = request('/api', {}, { 'x-real-ip': '203.0.113.20', 'x-forwarded-for': '1.1.1.1, 203.0.113.20' });
  assert.equal(security.sessionCookieOptions(req).secure, true);
  assert.equal(security.sessionCookieOptions(req).httpOnly, true);
  assert.equal(rates.extractClientIp(req.headers), '203.0.113.20');
  assert.equal(rates.extractClientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.20' })), '203.0.113.20');
});

test('sessions bind to the current password and legacy tokens cannot survive a change', () => {
  const user = { id: 'user1', passwordHash: auth.hashPassword('original-password') };
  const token = auth.signSessionToken(user);
  const parsed = auth.verifySessionToken(token);
  assert.ok(parsed);
  assert.equal(auth.sessionMatchesPassword(parsed, user.passwordHash), true);
  assert.equal(auth.sessionMatchesPassword(parsed, auth.hashPassword('new-password')), false);
  const payload = Buffer.from(JSON.stringify({ uid: user.id, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  assert.equal(auth.verifySessionToken(`${payload}.${sig}`), null);
  assert.equal(auth.verifySessionToken(`${token}.extra`), null);
  assert.deepEqual(auth.verifySessionCookieValues(undefined, token), parsed);
  assert.deepEqual(auth.verifySessionCookieValues('invalid', token), parsed);
  assert.equal(auth.verifySessionCookieValues(undefined, 'invalid'), null);
});

function assertSecureSessionCookies(res) {
  const primary = res.cookies.get(auth.SESSION_COOKIE_NAME);
  const embedded = res.cookies.get(auth.EMBEDDED_SESSION_COOKIE_NAME);
  assert.ok(primary && embedded, 'both first-party and embedded HTTPS sessions must be set');
  assert.equal(primary.value, embedded.value);
  assert.equal(primary.httpOnly, true);
  assert.equal(primary.secure, true);
  assert.equal(primary.sameSite, 'lax');
  assert.equal(primary.partitioned, undefined);
  assert.equal(embedded.httpOnly, true);
  assert.equal(embedded.secure, true);
  assert.equal(embedded.sameSite, 'none');
  assert.equal(embedded.partitioned, true);
  assert.equal(embedded.path, '/');
  assert.equal(embedded.domain, undefined);
}

test('first-party and partitioned embedded sessions are set securely and both cleared on logout', async () => {
  const user = await db.registerUserAccount({ email: 'iframe@example.test', displayName: 'Iframe', password: 'testpassword' });
  const loginResponse = await login.POST(request('/api/v1/auth/login', { email: user.email, password: 'testpassword' }));
  assert.equal(loginResponse.status, 200);
  assertSecureSessionCookies(loginResponse);
  const embeddedToken = loginResponse.cookies.get(auth.EMBEDDED_SESSION_COOKIE_NAME).value;
  assert.equal(auth.verifySessionCookieValues(undefined, embeddedToken).uid, user.id);

  const logoutResponse = await logout.POST(request('/api/v1/auth/logout', {}));
  assertSecureSessionCookies(logoutResponse);
  assert.equal(logoutResponse.cookies.get(auth.SESSION_COOKIE_NAME).maxAge, 0);
  assert.equal(logoutResponse.cookies.get(auth.EMBEDDED_SESSION_COOKIE_NAME).maxAge, 0);

  const oldSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = '';
  try {
    const httpRequest = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'testpassword' }),
    });
    const insecure = await login.POST(httpRequest);
    assert.equal(insecure.status, 200);
    assert.equal(insecure.cookies.get(auth.SESSION_COOKIE_NAME).secure, false);
    assert.equal(insecure.cookies.get(auth.EMBEDDED_SESSION_COOKIE_NAME), undefined);
  } finally { process.env.NEXT_PUBLIC_SITE_URL = oldSiteUrl; }
});

test('webhook requires a secret, rejects predictable codes and never replaces a linked chat', async () => {
  const user = await db.registerUserAccount({ email: 'telegram@example.test', displayName: 'User', password: 'testpassword' });
  const legacy = `vx_${createHash('sha256').update(`tglink:${user.id}`).digest('hex').slice(0, 10)}`;
  await db.mutateState((state) => {
    state.settings.telegramBotToken = 'TEST_TOKEN';
    const row = state.users.find((u) => u.id === user.id);
    row.telegramLinkCode = legacy;
  });
  const secureCode = security.secureTelegramLinkCode(legacy, user.id);
  assert.match(secureCode, /^vx_[a-f0-9]{32}$/);
  assert.notEqual(secureCode, legacy);
  // Simulate the legacy-file normalization performed on startup.
  await db.mutateState((state) => { state.users.find((u) => u.id === user.id).telegramLinkCode = secureCode; });
  assert.equal((await telegram(secureCode, 101, null)).status, 401);
  assert.equal((await telegram(secureCode, 101, 'wrong')).status, 401);
  const secret = security.telegramWebhookSecret();
  assert.equal((await telegram(legacy, 101, secret)).status, 200);
  assert.equal((await telegram(secureCode, 101, secret, 'group')).status, 200);
  let row = (await db.readState()).users.find((u) => u.id === user.id);
  assert.equal(row.telegramChatId, null);
  global.fetch = async (url) => { assert.match(url, /sendMessage$/); return telegramOk(); };
  assert.equal((await telegram(secureCode, 101, secret)).status, 200);
  row = (await db.readState()).users.find((u) => u.id === user.id);
  assert.equal(row.telegramChatId, '101');
  assert.equal(row.telegramBindingVerified, true);
  assert.notEqual(row.telegramLinkCode, secureCode);
  await telegram(secureCode, 202, secret);
  await telegram(row.telegramLinkCode, 202, secret);
  assert.equal((await db.readState()).users.find((u) => u.id === user.id).telegramChatId, '101');
  global.fetch = async () => { throw new Error('Real network disabled in test'); };
});

test('reset codes are keyed, limited across IPs, single use and revoke old sessions', async () => {
  const user = await db.registerUserAccount({ email: 'reset@example.test', displayName: 'Reset', password: 'testpassword' });
  await db.mutateState((s) => {
    s.settings.telegramBotToken = 'TEST_TOKEN';
    const u = s.users.find((r) => r.id === user.id);
    u.telegramChatId = '1001';
    u.telegramBindingVerified = true;
  });
  let delivered = '';
  global.fetch = async (_url, options) => {
    delivered = JSON.parse(options.body).text.match(/<code>(\d{6})<\/code>/)?.[1] || '';
    return telegramOk();
  };
  const ask = () => reset.POST(request('/api/v1/auth/reset-password', { action: 'REQUEST_CODE', email: user.email }, { 'x-real-ip': '203.0.113.1' }));
  assert.equal((await ask()).status, 200);
  assert.match(delivered, /^\d{6}$/);
  let row = (await db.readState()).users.find((u) => u.id === user.id);
  assert.match(row.passwordResetCode, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.notEqual(row.passwordResetCode, delivered);
  const oldSession = auth.verifySessionToken(auth.signSessionToken(row));
  const wrong = delivered === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++) {
    const res = await reset.POST(request('/api/v1/auth/reset-password', {
      action: 'CONFIRM_RESET', email: user.email, code: wrong, newPassword: 'different-password',
    }, { 'x-real-ip': `203.0.113.${i + 10}` }));
    assert.equal(res.status, 400);
  }
  row = (await db.readState()).users.find((u) => u.id === user.id);
  assert.equal(row.passwordResetCode, null);
  assert.equal(row.passwordResetAttempts, 5);
  const locked = await reset.POST(request('/api/v1/auth/reset-password', {
    action: 'CONFIRM_RESET', email: user.email, code: delivered, newPassword: 'different-password',
  }, { 'x-real-ip': '203.0.113.30' }));
  assert.equal(locked.status, 400);
  await db.mutateState((s) => { s.users.find((u) => u.id === user.id).passwordResetRequestedAt = new Date(Date.now() - 120_000).toISOString(); });
  await ask();
  const success = await reset.POST(request('/api/v1/auth/reset-password', {
    action: 'CONFIRM_RESET', email: user.email, code: delivered, newPassword: 'different-password',
  }, { 'x-real-ip': '203.0.113.31' }));
  assert.equal(success.status, 200);
  assert.match(success.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(success.headers.get('set-cookie'), /Secure/i);
  assertSecureSessionCookies(success);
  row = (await db.readState()).users.find((u) => u.id === user.id);
  assert.equal(auth.sessionMatchesPassword(oldSession, row.passwordHash), false);
  assert.equal(auth.verifyPassword('different-password', row.passwordHash), true);
  assert.equal(row.passwordResetCode, null);
  global.fetch = async () => { throw new Error('Real network disabled in test'); };
});

test('old unverified Telegram bindings do not receive reset codes, and response does not reveal accounts', async () => {
  const user = await db.registerUserAccount({ email: 'legacy@example.test', displayName: 'Legacy', password: 'testpassword' });
  await db.mutateState((s) => { const u = s.users.find((r) => r.id === user.id); u.telegramChatId = 'old'; u.telegramBindingVerified = false; });
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Must not send'); };
  const ask = (email, ip) => reset.POST(request('/api/v1/auth/reset-password', { action: 'REQUEST_CODE', email }, { 'x-real-ip': ip }));
  const existing = await (await ask(user.email, '203.0.113.50')).json();
  const unknown = await (await ask('unknown@example.test', '203.0.113.51')).json();
  assert.deepEqual(existing, unknown);
  assert.equal(calls, 0);
});

test('registration requires independent legal choices and records the accepted version', async () => {
  const base = { email: 'consent@example.test', password: 'testpassword', displayName: 'Consent' };
  const bad = await register.POST(request('/api/v1/auth/register', { ...base, rulesAccepted: true, legalVersion: LEGAL_DOCUMENT_VERSION }));
  assert.equal(bad.status, 400);
  assert.equal((await db.readState()).users.some((u) => u.email === base.email), false);
  const good = await register.POST(request('/api/v1/auth/register', {
    ...base, rulesAccepted: true, personalDataConsent: true, legalVersion: LEGAL_DOCUMENT_VERSION,
  }));
  assert.equal(good.status, 200);
  assert.match(good.headers.get('set-cookie'), /Secure/i);
  assertSecureSessionCookies(good);
  const row = (await db.readState()).users.find((u) => u.email === base.email);
  assert.equal(row.personalDataConsentVersion, LEGAL_DOCUMENT_VERSION);
  assert.equal(row.rulesAcceptedVersion, LEGAL_DOCUMENT_VERSION);
  assert.ok(row.personalDataConsentAt && row.rulesAcceptedAt);
});

test('internal balance cannot fund its own top-up or generate a bonus', async () => {
  const user = await db.registerUserAccount({ email: 'balance@example.test', displayName: 'Balance', password: 'testpassword' });
  await db.mutateState((s) => { s.users.find((u) => u.id === user.id).balanceRub = 10_000; });
  await assert.rejects(db.initiateOrderCheckout({
    userId: user.id, kind: 'BALANCE_TOPUP', topupAmountRub: 5000, paymentMethod: 'internal_balance', expectedAmountRub: 5000, expectedPaymentMode: 'TEST_INSTANT', originUrl: 'https://shop.example.test',
  }), /только внешним платежом/);
  const state = await db.readState();
  assert.equal(state.users.find((u) => u.id === user.id).balanceRub, 10_000);
  assert.equal(state.transactions.some((tx) => tx.userId === user.id), false);
});

test('a failed guest order returns the newly created account and a high-entropy password', async () => {
  const res = await checkout.POST(request('/api/v1/billing/checkout', {
    kind: 'SINGLE_PREDICTION', predictionId: 'nonexistent', paymentMethod: 'yookassa', expectedAmountRub: 500, expectedPaymentMode: 'TEST_INSTANT',
    guestEmail: 'failed-guest@example.test', offerAccepted: true, rulesAccepted: true,
    personalDataConsent: true, legalVersion: LEGAL_DOCUMENT_VERSION,
  }));
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.autoCreatedAccount.generatedPassword, /^[A-Za-z0-9_-]{24}$/);
  assert.match(res.headers.get('set-cookie'), /Secure/i);
  assertSecureSessionCookies(res);
  const user = (await db.readState()).users.find((u) => u.email === 'failed-guest@example.test');
  assert.ok(auth.verifyPassword(data.autoCreatedAccount.generatedPassword, user.passwordHash));
});

test('payment return uses configured site origin, not the supplied Origin header', async () => {
  const pred = await db.createPredictionByAdmin({
    sport: 'FOOTBALL', leagueName: 'Лига', homeTeam: 'A', awayTeam: 'B',
    matchStartsAt: '2035-01-01T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2,
    stakeUnits: 1, accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: false,
    analysisTeaser: 'Анонс', analysisFull: 'Аналитика', pushToTelegram: false,
  });
  await db.mutateState((s) => { s.settings.paymentMode = 'YOOKASSA_LIVE'; s.settings.yookassaShopId = 'test'; s.settings.yookassaSecretKey = 'test-secret'; });
  let paymentPayload;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.yookassa.ru/v3/payments');
    paymentPayload = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ id: 'test-payment', status: 'pending', confirmation: { confirmation_url: 'https://checkout.example.test' } }) };
  };
  const res = await checkout.POST(request('/api/v1/billing/checkout', {
    kind: 'SINGLE_PREDICTION', predictionId: pred.id, paymentMethod: 'yookassa', expectedAmountRub: 500, expectedPaymentMode: 'YOOKASSA_LIVE', guestEmail: 'origin@example.test',
    offerAccepted: true, rulesAccepted: true, personalDataConsent: true, legalVersion: LEGAL_DOCUMENT_VERSION,
  }, { origin: 'https://attacker.example.test' }));
  assert.equal(res.status, 200);
  assert.match(paymentPayload.confirmation.return_url, /^https:\/\/shop\.example\.test\/payment\/return\?/);
  assert.doesNotMatch(paymentPayload.confirmation.return_url, /attacker/);
  const order = (await res.json()).order;
  assert.equal(order.idempotenceKey, undefined);
  assert.equal(order.externalPaymentId, undefined);
  const storedOrder = (await db.readState()).transactions.find((item) => item.id === order.id);
  assert.equal(storedOrder.offerAcceptedVersion, LEGAL_DOCUMENT_VERSION);
  assert.ok(storedOrder.offerAcceptedAt);
  global.fetch = async () => { throw new Error('Real network disabled in test'); };
});

test('real production checkout refuses a noncanonical host before creating a guest account', async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const before = (await db.readState()).users.length;
    const res = await checkout.POST(new NextRequest('https://www.shop.example.test/api/v1/billing/checkout', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        kind: 'SINGLE_PREDICTION', predictionId: 'any', paymentMethod: 'yookassa',
        expectedAmountRub: 500, expectedPaymentMode: 'YOOKASSA_LIVE', guestEmail: 'wrong-host@example.test',
        offerAccepted: true, rulesAccepted: true, personalDataConsent: true, legalVersion: LEGAL_DOCUMENT_VERSION,
      }),
    }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /основном HTTPS-адресе/);
    assert.equal((await db.readState()).users.length, before);
  } finally { process.env.NODE_ENV = oldNodeEnv; }
});

test('missing production session secret fails before creating guest or registered accounts', async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldSecret = process.env.SESSION_SECRET;
  const oldJwt = process.env.JWT_ACCESS_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    const before = (await db.readState()).users.length;
    const base = { email: 'no-secret@example.test', password: 'test-password', displayName: 'Test', rulesAccepted: true, personalDataConsent: true, legalVersion: LEGAL_DOCUMENT_VERSION };
    assert.equal((await register.POST(request('/api/v1/auth/register', base))).status, 503);
    assert.equal((await checkout.POST(request('/api/v1/billing/checkout', {
      kind: 'SINGLE_PREDICTION', predictionId: 'none', paymentMethod: 'yookassa', expectedAmountRub: 500, expectedPaymentMode: 'YOOKASSA_LIVE', guestEmail: base.email,
      rulesAccepted: true, personalDataConsent: true, offerAccepted: true, legalVersion: LEGAL_DOCUMENT_VERSION,
    }))).status, 503);
    assert.equal((await db.readState()).users.length, before);
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
    if (oldSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSecret;
    if (oldJwt === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = oldJwt;
  }
});

test('Telegram direct-message errors never reveal the bot token and describe uncertain delivery', async () => {
  const { sendTelegramDirectMessage } = require('../src/server/integrations.ts');
  const token = '12345:private-test-token';
  global.fetch = async (url) => { throw new Error(`request failed: ${url}`); };
  const outcome = await sendTelegramDirectMessage({ telegramBotToken: token }, '123', 'Test');
  assert.equal(outcome.sent, false);
  assert.doesNotMatch(outcome.error, /private-test-token|12345:/);
  assert.match(outcome.error, /проверьте Telegram перед повтором/i);
  global.fetch = async () => { throw new Error('Real network disabled in test'); };
});

test('Telegram webhook setup uses the canonical origin, a secret, and reports partial success', async () => {
  const { installTelegramMiniAppAndWebhook } = require('../src/server/integrations.ts');
  const oldNodeEnv = process.env.NODE_ENV;
  const oldUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const token = '12345:private-test-token';
  const sent = [];
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_SITE_URL;
    global.fetch = async () => { throw new Error('must not contact Telegram'); };
    const missing = await installTelegramMiniAppAndWebhook({ telegramBotToken: token }, 'https://attacker.example.test');
    assert.equal(missing.ok, false);
    assert.match(missing.message, /NEXT_PUBLIC_SITE_URL/);

    process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.example.test/ignored-path';
    global.fetch = async (url, options) => {
      sent.push({ url, body: JSON.parse(options.body) });
      return sent.length === 1
        ? { ok: true, json: async () => ({ ok: true }) }
        : { ok: false, json: async () => ({ ok: false }) };
    };
    const partial = await installTelegramMiniAppAndWebhook({ telegramBotToken: token }, 'https://attacker.example.test');
    assert.equal(partial.ok, false);
    assert.match(partial.message, /Webhook установлен/);
    assert.equal(sent[0].body.url, 'https://shop.example.test/api/v1/webhooks/telegram');
    assert.equal(sent[0].body.secret_token, security.telegramWebhookSecret());
    assert.equal(sent[1].body.menu_button.web_app.url, 'https://shop.example.test/tg-app');
    assert.doesNotMatch(partial.message, /private-test-token/);
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = oldUrl;
    global.fetch = async () => { throw new Error('Real network disabled in test'); };
  }
});
