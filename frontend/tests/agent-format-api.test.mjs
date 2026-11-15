import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const cwd = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'predictlab-role-probe-'));
const envNames = ['DATABASE_URL', 'PLUSVIBE_API_KEY', 'OLLAMA_API_KEY', 'AI_LLM_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID'];
const previousEnv = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
for (const name of envNames) delete process.env[name];
process.chdir(temp);
const previousFetch = global.fetch;
const db = require('../src/server/database.ts');
const guards = require('../src/server/guards.ts');
let adminId = 'probe-admin';
let guardFailure = '';
guards.requireAdminAccount = async () => {
  if (guardFailure) throw new Error(guardFailure);
  return { id: adminId, role: 'ADMIN' };
};
const route = require('../src/app/api/v1/admin/autopilot/route.ts');
const key = 'sk-pv-isolated-secret';
const makeRequest = () => new Request('http://localhost/api/v1/admin/autopilot', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'TEST_AGENT_FORMAT' }),
});
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

async function configure(patch = {}) {
  await db.mutateState((state) => {
    Object.assign(state.aiAutopilot, {
      mode: 'OFF', llmProvider: 'PLUSVIBE', llmBaseUrl: 'https://plusvibeapi.ru/v1',
      llmApiKey: key, llmModel: 'deepseek-v4.1-flash',
    }, patch);
    state.predictions = []; state.aiDrafts = []; state.aiLogs = [];
  });
}

function matchingJson(options) {
  const payload = JSON.parse(options.body);
  assert.equal(payload.model, 'deepseek-v4.1-flash');
  assert.equal(payload.max_tokens, 1800);
  assert.equal(payload.messages[0].role, 'system');
  const rows = JSON.parse(payload.messages[1].content);
  assert.equal(rows.length, 9);
  assert.ok(rows.every((item) => item.id.startsWith('test_fixture_')));
  return JSON.stringify({ opinions: rows.map(({ id }) => ({
    id, verdict: 'CAUTION', probabilityPct: 50, confidencePct: 50, riskScore: 30, reason: 'Только тест',
  })) });
}

after(() => {
  global.fetch = previousFetch;
  process.chdir(cwd);
  for (const name of envNames) {
    if (previousEnv[name] === undefined) delete process.env[name]; else process.env[name] = previousEnv[name];
  }
  rmSync(temp, { recursive: true, force: true });
});

test('saved connection is tested with exactly one synthetic request, without persistence or leakage', async () => {
  adminId = 'success';
  await configure();
  const before = structuredClone(await db.readState());
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://plusvibeapi.ru/v1/chat/completions');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.redirect, 'manual');
    return response({ model: 'some-returned-model', choices: [{ message: { content: matchingJson(options) } }] });
  };
  const res = await route.POST(makeRequest());
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.requestCount, 1);
  assert.equal(body.validCount, 9);
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(body), /isolated-secret|Только тест/);
  assert.deepEqual(await db.readState(), before);
});

test('local mode and missing key never send the saved key or create a request', async () => {
  global.fetch = async () => { throw new Error('unexpected network'); };
  for (const [id, patch, pattern] of [
    ['local', { llmProvider: 'BUILTIN_QUANT' }, /локальный режим/i],
    ['no-key', { llmApiKey: '' }, /ключ.*не сохранён/i],
    ['no-model', { llmModel: '' }, /ID модели не сохранён/i],
    ['bad-url', { llmBaseUrl: 'https://user:pass@plusvibeapi.ru/v1' }, /запрос не отправлялся/i],
  ]) {
    adminId = id;
    await configure(patch);
    const res = await route.POST(makeRequest());
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.requestCount, 0);
    assert.match(body.message, pattern);
  }
});

test('failed paid probes do not retry HTTP errors or follow redirects, and do not expose error bodies', async () => {
  for (const status of [400, 401, 429, 503, 307]) {
    adminId = `failure-${status}`;
    await configure();
    let calls = 0;
    global.fetch = async () => {
      calls++;
      if (status === 307) return new Response(null, { status, headers: { location: '/v2/chat/completions' } });
      return response({ error: `private ${key}` }, status, { 'retry-after': '1' });
    };
    const res = await route.POST(makeRequest());
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.requestCount, 1);
    assert.equal(calls, 1, `unexpected retry for HTTP ${status}`);
    assert.match(body.message, new RegExp(`HTTP ${status}`));
    assert.doesNotMatch(JSON.stringify(body), /isolated-secret|private/);
  }
});

test('only an authorized administrator can send a probe', async () => {
  await configure();
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('unexpected'); };
  for (const [failure, expectedStatus] of [['UNAUTHORIZED', 401], ['FORBIDDEN', 403], ['BLOCKED', 403]]) {
    guardFailure = failure;
    const res = await route.POST(makeRequest());
    assert.equal(res.status, expectedStatus);
  }
  assert.equal(calls, 0);
  guardFailure = '';
});

test('the per-process limiter blocks repeated paid probes before calling the provider', async () => {
  adminId = 'rate-limited';
  await configure();
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++;
    return response({ choices: [{ message: { content: matchingJson(options) } }] });
  };
  for (let i = 0; i < 4; i++) {
    const res = await route.POST(makeRequest());
    assert.equal(res.status, 200);
  }
  const limited = await route.POST(makeRequest());
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  assert.equal(calls, 4);
});

test('a connection changed during the request makes the result stale without blocking writes', async () => {
  adminId = 'changed-while-running';
  await configure();
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++;
    // This write must be possible while the mock provider is still responding.
    await db.mutateState((state) => { state.aiAutopilot.llmModel = 'new-model'; });
    return response({ choices: [{ message: { content: matchingJson(options) } }] });
  };
  const res = await route.POST(makeRequest());
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.requestCount, 1);
  assert.equal(body.validCount, 9);
  assert.match(body.message, /подключение изменилось.*прежним настройкам/);
  assert.equal(calls, 1);
  assert.equal((await db.readState()).aiAutopilot.llmModel, 'new-model');
  assert.doesNotMatch(JSON.stringify(body), /isolated-secret/);
});
