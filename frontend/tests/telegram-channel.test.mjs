import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { sendTelegramChannelAnnouncement, diagnoseTelegramChannel, escapeTelegramHtml } = await loadTypeScriptModule(
  new URL('../src/server/telegram-channel.ts', import.meta.url),
);
const originalFetch = global.fetch;
const envNames = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID', 'TELEGRAM_VIP_CHANNEL_ID'];
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
for (const name of envNames) delete process.env[name];
after(() => {
  global.fetch = originalFetch;
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});
const token = '123456789:FAKE_TOKEN_FOR_TESTS_ONLY';
const settings = { telegramBotToken: token, telegramChannelId: '@test_channel' };
const reply = (json, status = 200) => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
const success = () => reply({ ok: true, result: { message_id: 987 } });

test('a confirmed Telegram response performs exactly one send and sets a timeout signal', async () => {
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return success(); };
  const result = await sendTelegramChannelAnnouncement(settings, '<b>Hello</b>', { text: 'Site', url: 'https://example.com' });
  assert.deepEqual(result, { sent: true, outcome: 'sent', messageId: 987 });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/sendMessage'));
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.chat_id, '@test_channel');
  assert.equal(payload.text, '<b>Hello</b>');
  assert.equal(payload.reply_markup.inline_keyboard[0][0].url, 'https://example.com');
  assert.equal(escapeTelegramHtml('A & <B>'), 'A &amp; &lt;B&gt;');
});

test('the documented TELEGRAM_CHANNEL_ID is used, with legacy fallback and saved-setting precedence', async () => {
  const calls = [];
  global.fetch = async (_url, options) => { calls.push(JSON.parse(options.body).chat_id); return success(); };
  process.env.TELEGRAM_BOT_TOKEN = token;
  process.env.TELEGRAM_CHANNEL_ID = '-1001234567890';
  process.env.TELEGRAM_VIP_CHANNEL_ID = '-100555';
  try {
    await sendTelegramChannelAnnouncement({ telegramBotToken: '', telegramChannelId: '' }, 'hello');
    await sendTelegramChannelAnnouncement(settings, 'hello');
    delete process.env.TELEGRAM_CHANNEL_ID;
    await sendTelegramChannelAnnouncement({ telegramBotToken: '', telegramChannelId: '' }, 'hello');
    assert.deepEqual(calls, ['-1001234567890', '@test_channel', '-100555']);
  } finally {
    for (const name of envNames) delete process.env[name];
  }
});

test('invalid or missing settings never call Telegram or expose the token', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('unexpected'); };
  const missing = await sendTelegramChannelAnnouncement({ telegramBotToken: '', telegramChannelId: '' }, 'test');
  const invalid = await sendTelegramChannelAnnouncement({ ...settings, telegramBotToken: `${token}/../steal` }, 'test');
  const link = await sendTelegramChannelAnnouncement({ ...settings, telegramChannelId: 'https://t.me/test_channel' }, 'test');
  assert.equal(calls, 0);
  assert.equal(missing.outcome, 'rejected');
  assert.match(link.error, /не ссылкой/);
  assert.equal(invalid.outcome, 'rejected');
  assert.doesNotMatch(JSON.stringify(invalid), /FAKE_TOKEN/);
});

test('DNS failure is diagnostic, redacted and UNKNOWN with no retry', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new TypeError(`fetch failed https://api.telegram.org/bot${token}`, {
      cause: Object.assign(new Error(`secret ${token}`), { code: 'ENOTFOUND' }),
    });
  };
  const result = await sendTelegramChannelAnnouncement(settings, 'test');
  assert.equal(calls, 1);
  assert.equal(result.outcome, 'unknown');
  assert.match(result.error, /DNS \(ENOTFOUND\)/);
  assert.match(result.error, /Итог публикации неизвестен/);
  assert.match(result.error, /проверьте канал перед повтором/i);
  assert.doesNotMatch(JSON.stringify(result), /FAKE_TOKEN|123456789/);
});

test('explicit Telegram 4xx failures are rejected with useful guidance and no raw description', async () => {
  for (const [status, body, expected] of [
    [401, { ok: false, error_code: 401, description: `Unauthorized ${token}` }, /Bot Token.*401/],
    [400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' }, /не нашёл канал/],
    [403, { ok: false, error_code: 403, description: 'Forbidden: not enough rights' }, /администраторы канала/],
    [400, { ok: false, error_code: 400, description: "Bad Request: can't parse entities" }, /формат или длину/],
    [429, { ok: false, error_code: 429, parameters: { retry_after: 8 } }, /не менее 8 сек/],
  ]) {
    let calls = 0;
    global.fetch = async () => { calls++; return reply(body, status); };
    const result = await sendTelegramChannelAnnouncement(settings, 'test');
    assert.equal(calls, 1);
    assert.equal(result.outcome, 'rejected');
    assert.match(result.error, expected);
    assert.doesNotMatch(result.error, /FAKE_TOKEN/);
  }
});

test('5xx, unreadable responses and incomplete success are unknown, not rejected', async () => {
  const variants = [
    () => reply({ ok: false, error_code: 502, description: 'Bad gateway' }, 502),
    () => new Response('<html>blocked</html>', { status: 403 }),
    () => new Response('bad json', { status: 200 }),
    () => reply({ ok: true, result: {} }),
  ];
  for (const makeResponse of variants) {
    let calls = 0;
    global.fetch = async () => { calls++; return makeResponse(); };
    const result = await sendTelegramChannelAnnouncement(settings, 'test');
    assert.equal(calls, 1);
    assert.equal(result.outcome, 'unknown');
    assert.match(result.error, /Итог публикации неизвестен/);
  }
});

test('abort errors are unknown and the request timer is always cleared', async () => {
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  let created = 0;
  let cleared = 0;
  global.setTimeout = (...args) => { created++; return realSetTimeout(...args); };
  global.clearTimeout = (timer) => { cleared++; return realClearTimeout(timer); };
  global.fetch = async () => { throw Object.assign(new Error(`secret ${token}`), { name: 'AbortError' }); };
  try {
    const result = await sendTelegramChannelAnnouncement(settings, 'test');
    assert.equal(result.outcome, 'unknown');
    assert.match(result.error, /превышено время ожидания/);
    assert.equal(created, 1);
    assert.equal(cleared, 1);
    assert.doesNotMatch(result.error, /FAKE_TOKEN/);
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
  }
});

test('read-only diagnostic checks bot, channel and posting permission without publishing', async () => {
  const methods = [];
  global.fetch = async (url, options) => {
    const method = url.split('/').at(-1);
    methods.push(method);
    assert.equal(options.redirect, 'error');
    if (method === 'getMe') return reply({ ok: true, result: { id: 12345, username: 'test_bot' } });
    if (method === 'getChat') {
      assert.equal(JSON.parse(options.body).chat_id, '@test_channel');
      return reply({ ok: true, result: { id: -1001, type: 'channel' } });
    }
    assert.equal(method, 'getChatMember');
    assert.equal(JSON.parse(options.body).user_id, 12345);
    return reply({ ok: true, result: { status: 'administrator', can_post_messages: true } });
  };
  const result = await diagnoseTelegramChannel(settings);
  assert.equal(result.ok, true);
  assert.deepEqual(methods, ['getMe', 'getChat', 'getChatMember']);
  assert.match(result.message, /сообщений не отправляли/);
  assert.match(result.message, /статус предыдущего поста она не определяет/);
  assert.doesNotMatch(result.message, /FAKE_TOKEN/);
});

test('read-only diagnostic reports missing posting rights and rejects groups', async () => {
  for (const chatType of ['channel', 'group']) {
    const methods = [];
    global.fetch = async (url) => {
      const method = url.split('/').at(-1);
      methods.push(method);
      if (method === 'getMe') return reply({ ok: true, result: { id: 12345 } });
      if (method === 'getChat') return reply({ ok: true, result: { id: -1, type: chatType } });
      return reply({ ok: true, result: { status: 'administrator', can_post_messages: false } });
    };
    const result = await diagnoseTelegramChannel(settings);
    assert.equal(result.ok, false);
    assert.match(result.message, chatType === 'channel' ? /нет подтверждённого права/ : /не относится к Telegram-каналу/);
    assert.ok(!methods.includes('sendMessage'));
  }
});

test('the timeout aborts a stalled request and still returns an unknown outcome', async () => {
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms === 12_000 ? 5 : ms, ...args);
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
  };
  try {
    const result = await sendTelegramChannelAnnouncement(settings, 'test');
    assert.equal(calls, 1);
    assert.equal(result.outcome, 'unknown');
    assert.match(result.error, /превышено время ожидания/);
    assert.match(result.error, /проверьте канал перед повтором/i);
  } finally { global.setTimeout = realSetTimeout; }
});
