import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const cwd = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-telegram-api-test-'));
const oldFetch = global.fetch;
const envNames = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID', 'TELEGRAM_VIP_CHANNEL_ID', 'PLUSVIBE_API_KEY', 'OLLAMA_API_KEY', 'AI_LLM_API_KEY'];
const env = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
for (const name of envNames) delete process.env[name];
process.chdir(temp);
const db = require('../src/server/database.ts');
const guards = require('../src/server/guards.ts');
const settingsRoute = require('../src/app/api/v1/admin/settings/route.ts');
const autopilotRoute = require('../src/app/api/v1/admin/autopilot/route.ts');
const chatRoute = require('../src/app/api/v1/admin/ai-chat/route.ts');
const admin = async () => ({ id: 'admin', role: 'ADMIN' });
guards.requireAdminAccount = admin;
after(() => {
  global.fetch = oldFetch;
  process.chdir(cwd);
  for (const name of envNames) {
    if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
  }
  rmSync(temp, { recursive: true, force: true });
});
const token = '123456789:API_TEST_SECRET';
const response = (json, status = 200) => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
const request = (method, body) => new Request('http://localhost/api/v1/admin/settings', {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
async function reset() {
  guards.requireAdminAccount = admin;
  await db.mutateState((state) => {
    state.settings.brandName = 'Test <brand> & name';
    state.settings.telegramBotToken = token;
    state.settings.telegramChannelId = '@test_channel';
    state.predictions = [];
    state.aiAutopilot.mode = 'OFF';
    state.aiChatMessages = [];
  });
}

test('admin-only connection diagnostics check rights without sending a post', async () => {
  await reset();
  const methods = [];
  global.fetch = async (url) => {
    const method = url.split('/').at(-1);
    methods.push(method);
    if (method === 'getMe') return response({ ok: true, result: { id: 123, username: 'test_bot' } });
    if (method === 'getChat') return response({ ok: true, result: { type: 'channel' } });
    if (method === 'getChatMember') return response({ ok: true, result: { status: 'administrator', can_post_messages: true } });
    throw new Error('unexpected publishing attempt');
  };
  const res = await settingsRoute.POST(request('POST', { action: 'DIAGNOSE_CHANNEL' }));
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.ok, true);
  assert.deepEqual(methods, ['getMe', 'getChat', 'getChatMember']);
  assert.match(json.message, /сообщений не отправляли/);
  assert.doesNotMatch(JSON.stringify(json), /API_TEST_SECRET/);
});

test('the deliberate test post reports unknown outcome and escapes the brand', async () => {
  await reset();
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    throw new TypeError('fetch failed');
  };
  const res = await settingsRoute.POST(request('POST', { action: 'TEST_CHANNEL' }));
  const json = await res.json();
  assert.equal(res.status, 502);
  assert.equal(json.outcome, 'unknown');
  assert.match(json.error, /проверьте канал перед повтором/i);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /Test &lt;brand&gt; &amp; name/);
  assert.doesNotMatch(JSON.stringify(json), /API_TEST_SECRET/);
});

test('unknown settings actions cannot accidentally publish a test message', async () => {
  await reset();
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('unexpected'); };
  const res = await settingsRoute.POST(request('POST', { action: 'UNRECOGNIZED' }));
  const missing = await settingsRoute.POST(request('POST', {}));
  assert.equal(res.status, 400);
  assert.equal(missing.status, 400);
  assert.equal(calls, 0);
});

test('digest API communicates unknown delivery without repeating the request', async () => {
  await reset();
  let calls = 0;
  global.fetch = async () => { calls++; return response({ ok: false, error_code: 500 }, 500); };
  const res = await autopilotRoute.POST(request('POST', { action: 'BROADCAST_DAILY_DIGEST' }));
  const json = await res.json();
  assert.equal(res.status, 502);
  assert.equal(json.outcome, 'unknown');
  assert.match(json.error, /проверьте канал перед повтором/i);
  assert.equal(calls, 1);
});

test('chat, settings and autopilot return 503 for storage outages rather than 400/403', async () => {
  await reset();
  guards.requireAdminAccount = async () => { throw new db.StorageUnavailableError('Хранилище недоступно'); };
  try {
    for (const res of [
      await chatRoute.GET(),
      await chatRoute.POST(request('POST', { message: 'Привет' })),
      await chatRoute.DELETE(),
      await settingsRoute.POST(request('POST', { action: 'DIAGNOSE_CHANNEL' })),
      await autopilotRoute.POST(request('POST', { action: 'TEST_LLM' })),
      await autopilotRoute.PATCH(request('PATCH', { config: { mode: 'OFF' } })),
    ]) {
      assert.equal(res.status, 503);
      assert.match((await res.json()).error, /Хранилище недоступно/);
    }
  } finally { guards.requireAdminAccount = admin; }
});

test('unauthorized requests are not mistaken for Telegram failures', async () => {
  await reset();
  guards.requireAdminAccount = async () => { throw new Error('UNAUTHORIZED'); };
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('unexpected'); };
  try {
    const res = await settingsRoute.POST(request('POST', { action: 'DIAGNOSE_CHANNEL' }));
    assert.equal(res.status, 401);
    assert.equal(calls, 0);
  } finally { guards.requireAdminAccount = admin; }
});
