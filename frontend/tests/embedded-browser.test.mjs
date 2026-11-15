import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const { isBrowserSessionConfirmed } = require('../src/lib/client-session.ts');
const { isEmbeddedBrowser, openTelegramExternalLink } = require('../src/lib/embedded-browser.ts');

test('a browser session is confirmed only when the same account is returned by the server', async (t) => {
  const oldFetch = global.fetch;
  t.after(() => { global.fetch = oldFetch; });
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, '/api/v1/auth/me');
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => ({ user: { id: 'user-a' } }) };
  };
  assert.equal(await isBrowserSessionConfirmed('user-a'), true);
  assert.equal(await isBrowserSessionConfirmed('user-b'), false);
  assert.equal(await isBrowserSessionConfirmed(undefined), false);
  assert.equal(calls, 2);
  global.fetch = async () => ({ ok: true, json: async () => ({ user: null }) });
  assert.equal(await isBrowserSessionConfirmed('user-a'), false);
  global.fetch = async () => { throw new Error('offline'); };
  assert.equal(await isBrowserSessionConfirmed('user-a'), false);
});

test('Telegram external links require an active WebApp and HTTPS, with normal fallback on failure', (t) => {
  const oldTelegram = window.Telegram;
  t.after(() => { if (oldTelegram) window.Telegram = oldTelegram; else delete window.Telegram; });
  const calls = [];
  window.Telegram = { WebApp: { initData: '', platform: 'unknown', openLink: (url) => calls.push(url) } };
  assert.equal(isEmbeddedBrowser(), false);
  assert.equal(openTelegramExternalLink('https://example.test/checkout'), false);
  window.Telegram.WebApp.initData = 'signed-data';
  assert.equal(isEmbeddedBrowser(), true);
  assert.equal(openTelegramExternalLink('http://example.test/checkout'), false);
  assert.equal(openTelegramExternalLink('https://example.test/checkout'), true);
  assert.deepEqual(calls, ['https://example.test/checkout']);
  window.Telegram.WebApp.openLink = () => { throw new Error('unsupported'); };
  assert.equal(openTelegramExternalLink('https://example.test/checkout'), false);
});
