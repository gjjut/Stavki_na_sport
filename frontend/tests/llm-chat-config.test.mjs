import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const oldCwd = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-llm-config-test-'));
const envNames = ['DATABASE_URL', 'PLUSVIBE_API_KEY', 'OLLAMA_API_KEY', 'AI_LLM_API_KEY', 'PLUSVIBE_MODEL', 'AI_LLM_MODEL'];
const env = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
for (const name of envNames) delete process.env[name];
process.chdir(temp);
const oldFetch = global.fetch;
const { readState, mutateState } = require('../src/server/database.ts');
const autopilot = require('../src/server/ai-autopilot.ts');
const chat = require('../src/server/ai-admin-chat.ts');
const guards = require('../src/server/guards.ts');
guards.requireAdminAccount = async () => ({ id: 'admin', role: 'ADMIN' });
const route = require('../src/app/api/v1/admin/autopilot/route.ts');
after(() => {
  global.fetch = oldFetch;
  process.chdir(oldCwd);
  for (const name of envNames) {
    if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
  }
  rmSync(temp, { recursive: true, force: true });
});

const oldKey = 'sk-pv-old-secret-fixture';
const newKey = 'ollama-new-secret-fixture';
const response = (json, status = 200) => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
const success = (content = 'Готов') => response({ model: 'actual-model', choices: [{ message: { content } }] });
const request = (method, body) => new Request('http://localhost/api/v1/admin/autopilot', {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
async function reset() {
  await mutateState((state) => {
    state.aiAutopilot.mode = 'OFF';
    state.aiAutopilot.llmProvider = 'PLUSVIBE';
    state.aiAutopilot.llmBaseUrl = 'https://plusvibeapi.ru/v1';
    state.aiAutopilot.llmApiKey = oldKey;
    state.aiAutopilot.llmModel = 'old-model';
    state.aiChatMessages = [];
    state.predictions = [];
  });
}

test('saved provider, origin and model are not silently rewritten during normalization', async () => {
  await reset();
  await mutateState((state) => {
    state.aiAutopilot.llmBaseUrl = 'https://gw.plusvibeapi.ru/custom/v1';
    state.aiAutopilot.llmModel = 'deepseek-v4.1-flash';
  });
  const cfg = (await readState()).aiAutopilot;
  assert.equal(cfg.llmProvider, 'PLUSVIBE');
  assert.equal(cfg.llmBaseUrl, 'https://gw.plusvibeapi.ru/custom/v1');
  assert.equal(cfg.llmModel, 'deepseek-v4.1-flash');
  assert.equal(cfg.llmApiKey, oldKey);
  assert.deepEqual(autopilot.buildCandidateLlmBaseUrls(cfg.llmBaseUrl, cfg.llmProvider, cfg.llmApiKey), [cfg.llmBaseUrl]);
});

test('autopilot configuration rejects invalid or internal fields atomically', async () => {
  await reset();
  const before = structuredClone((await readState()).aiAutopilot);
  const badPatches = [
    null, {}, { mode: ['OFF'] }, { mode: 'UNKNOWN' },
    { sportsEnabled: [] }, { sportsEnabled: ['FOOTBALL', 'FOOTBALL'] }, { sportsEnabled: ['UNKNOWN'] },
    { morningHourMsk: 19 }, { eveningHourMsk: 9 }, { maxPicksPerRun: 0 }, { maxPicksPerRun: 8.1 },
    { minActiveOnStorefront: 51 }, { minValueEdgePct: -1 }, { minAgentConfidencePct: 101 },
    { defaultAiPriceRub: 49 }, { defaultAiPriceRub: 10000001 }, { freeEveryNthPick: -1 },
    { autoSettleEnabled: 'false' }, { llmApiKey: 12345 }, { llmModel: '' },
    { requireAgentConsensus: false }, { totalGeneratedCount: 999 }, { lastScanAt: null }, { cronSecret: 'steal' },
    { mode: 'FULL_AUTOPILOT', minValueEdgePct: null },
  ];
  for (const config of badPatches) {
    const res = await route.PATCH(request('PATCH', { config }));
    assert.equal(res.status, 400, JSON.stringify(config));
    assert.deepEqual((await readState()).aiAutopilot, before, JSON.stringify(config));
  }
  const res = await route.PATCH(request('PATCH', { config: {
    morningHourMsk: 8, eveningHourMsk: 20, maxPicksPerRun: 2, minActiveOnStorefront: 0,
    minValueEdgePct: 4.2, minAgentConfidencePct: 72.5, sportsEnabled: ['FOOTBALL', 'HOCKEY'],
    defaultAiPriceRub: 600, freeEveryNthPick: 3, insureAiPicks: false,
  } }));
  assert.equal(res.status, 200);
  const cfg = (await readState()).aiAutopilot;
  assert.equal(cfg.minValueEdgePct, 4.2);
  assert.equal(cfg.minAgentConfidencePct, 72.5);
  assert.equal(cfg.minActiveOnStorefront, 0);
  assert.equal(cfg.requireAgentConsensus, true);
  assert.equal(cfg.llmApiKey, oldKey);
  assert.equal(cfg.totalGeneratedCount, before.totalGeneratedCount);
});

test('local mode never calls a saved external model and diagnostics do not claim forecast generation is ready', async () => {
  await reset();
  await mutateState((state) => { state.aiAutopilot.llmProvider = 'BUILTIN_QUANT'; });
  assert.deepEqual(autopilot.buildCandidateLlmBaseUrls('https://plusvibeapi.ru/v1', 'BUILTIN_QUANT', oldKey), []);
  const urls = [];
  global.fetch = async (url) => { urls.push(String(url)); throw new Error('offline'); };
  const report = await autopilot.runAutopilotDiagnostics();
  const model = report.items.find((item) => item.name === 'Нейросеть для отбора прогнозов');
  assert.equal(model.ok, false);
  assert.match(model.details, /заблокированы/);
  assert.equal(urls.some((url) => url.includes('chat/completions')), false);
});

test('credentials and prompt are never forwarded across a redirect to another origin', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(null, { status: 302, headers: { location: 'https://attacker.example/collect' } });
  };
  const result = await autopilot.postLlmChatCompletion({
    baseUrl: 'https://example.test/v1', apiKey: oldKey, model: 'm', allowRetry: false,
    messages: [{ role: 'user', content: 'private prompt' }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 302);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, 'manual');
});

test('same-origin redirects work, while reasoning-only responses are never displayed', async () => {
  let count = 0;
  global.fetch = async () => {
    count++;
    return count === 1
      ? new Response(null, { status: 307, headers: { location: '/v2/chat/completions' } })
      : success('<think>SECRET THOUGHT</think>Ответ');
  };
  const params = { baseUrl: 'https://example.test/v1', apiKey: oldKey, model: 'm', allowRetry: false, messages: [{ role: 'user', content: 'hello' }] };
  const result = await autopilot.postLlmChatCompletion(params);
  assert.equal(count, 2);
  assert.equal(result.content, 'Ответ');
  assert.equal(autopilot.stripReasoningThinkTags('<think>partial SECRET'), '');
  global.fetch = async () => response({ choices: [{ message: { content: '', reasoning_content: 'SECRET THOUGHT' } }] });
  const reasoning = await autopilot.postLlmChatCompletion(params);
  assert.equal(reasoning.ok, false);
  assert.doesNotMatch(JSON.stringify(reasoning), /SECRET THOUGHT/);
});

test('connection testing uses precisely one selected model and lists only models returned by the gateway', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, url.endsWith('/chat/completions') ? 'manual' : 'error');
    if (url.endsWith('/models')) return response({ data: [{ id: 'available-a' }, { id: 'available-b' }] });
    if (url.endsWith('/balance')) return response({ balance_rub: 12.5 });
    assert.ok(url.endsWith('/chat/completions'));
    assert.equal(JSON.parse(options.body).model, 'deepseek-v4.1-flash');
    return response({ error: `missing model; ${oldKey}` }, 404);
  };
  const result = await autopilot.testLlmConnectionAndModels({
    llmProvider: 'PLUSVIBE', llmBaseUrl: 'https://plusvibeapi.ru/v1', llmApiKey: oldKey, llmModel: 'deepseek-v4.1-flash',
  });
  assert.equal(result.ok, false);
  assert.equal(calls.filter((c) => c.url.endsWith('/chat/completions')).length, 1);
  assert.deepEqual(result.availableModels, ['available-a', 'available-b']);
  assert.equal(result.testedModel, 'deepseek-v4.1-flash');
  assert.equal(result.modelProbeResults.length, 1);
  assert.match(result.message, /Другие модели не запускались/);
  assert.doesNotMatch(JSON.stringify(result), /old-secret-fixture/);
});

test('test-and-save persists the selected model even when using a saved key and when the probe fails', async () => {
  await reset();
  let completionCount = 0;
  global.fetch = async (url, options) => {
    if (url.endsWith('/models')) return response({ data: [{ id: 'new-model' }, { id: 'other-model' }] });
    if (url.endsWith('/balance')) return response({ balance: 1 });
    completionCount++;
    assert.equal(JSON.parse(options.body).model, 'new-model');
    return response({ error: 'not found' }, 404);
  };
  const res = await route.POST(request('POST', { action: 'TEST_LLM', llmProvider: 'PLUSVIBE', llmBaseUrl: 'https://plusvibeapi.ru/v1', llmApiKey: '', llmModel: 'new-model' }));
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.ok, false);
  assert.equal(json.configSaved, true);
  assert.equal(json.keySavedNow, false);
  assert.equal(completionCount, 1);
  const cfg = (await readState()).aiAutopilot;
  assert.equal(cfg.llmModel, 'new-model');
  assert.equal(cfg.llmApiKey, oldKey);
  assert.doesNotMatch(JSON.stringify(json), /old-secret-fixture/);
});

test('changing origin or provider requires re-entering a key before any test or save', async () => {
  await reset();
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Unexpected network'); };
  const body = { action: 'TEST_LLM', llmProvider: 'OLLAMA', llmBaseUrl: 'https://ollama.com/v1', llmApiKey: '', llmModel: 'new-model' };
  const testRes = await route.POST(request('POST', body));
  assert.equal(testRes.status, 400);
  assert.match((await testRes.json()).error, /введите ключ/);
  const patchRes = await route.PATCH(request('PATCH', { config: { llmProvider: 'PLUSVIBE', llmBaseUrl: 'https://other.example/v1' } }));
  assert.equal(patchRes.status, 400);
  assert.match((await patchRes.json()).error, /введите ключ/);
  assert.equal(calls, 0);
  const cfg = (await readState()).aiAutopilot;
  assert.equal(cfg.llmApiKey, oldKey);
  assert.equal(cfg.llmBaseUrl, 'https://plusvibeapi.ru/v1');
});

test('an explicitly entered key can be tested and saved for the new provider without disclosing the old key', async () => {
  await reset();
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, auth: options.headers.Authorization });
    assert.equal(new URL(url).origin, 'https://ollama.com');
    assert.equal(options.headers.Authorization, `Bearer ${newKey}`);
    if (url.endsWith('/models')) return response({ data: [{ id: 'ollama-model' }] });
    return success();
  };
  const res = await route.POST(request('POST', { action: 'TEST_LLM', llmProvider: 'OLLAMA', llmBaseUrl: 'https://ollama.com/v1', llmApiKey: newKey, llmModel: 'ollama-model' }));
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.keySavedNow, true);
  assert.equal(calls.filter((c) => c.url.endsWith('/chat/completions')).length, 1);
  assert.doesNotMatch(JSON.stringify(calls), /old-secret-fixture/);
  const cfg = (await readState()).aiAutopilot;
  assert.equal(cfg.llmProvider, 'OLLAMA');
  assert.equal(cfg.llmBaseUrl, 'https://ollama.com/v1');
  assert.equal(cfg.llmApiKey, newKey);
  assert.equal(cfg.llmModel, 'ollama-model');
});

test('a concurrent key change is not overwritten by a test that reused the old key', async () => {
  await reset();
  global.fetch = async (url) => {
    if (url.endsWith('/models')) return response({ data: [] });
    if (url.endsWith('/balance')) return response({});
    await mutateState((state) => { state.aiAutopilot.llmApiKey = 'sk-pv-changed-secret'; });
    return success();
  };
  const res = await route.POST(request('POST', { action: 'TEST_LLM', llmProvider: 'PLUSVIBE', llmBaseUrl: 'https://plusvibeapi.ru/v1', llmApiKey: '', llmModel: 'new-model' }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /изменился во время проверки/);
  const cfg = (await readState()).aiAutopilot;
  assert.equal(cfg.llmApiKey, 'sk-pv-changed-secret');
  assert.equal(cfg.llmModel, 'old-model');
});

test('ordinary chat failure makes only one model request, keeps the selected model and redacts errors', async () => {
  await reset();
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    assert.ok(url.endsWith('/chat/completions'));
    return response({ error: `bad key ${oldKey}` }, 404);
  };
  const result = await chat.processAdminAiChatTurn('Привет! Что ты за модель?');
  assert.equal(calls, 1);
  assert.equal((await readState()).aiAutopilot.llmModel, 'old-model');
  assert.match(result.assistantMessage.diagnostic.title, /HTTP 404/);
  assert.equal(result.assistantMessage.replySource, 'SERVER');
  assert.equal(result.assistantMessage.modelLabel, undefined);
  assert.doesNotMatch(JSON.stringify(result), /old-secret-fixture/);
});

test('chat provenance distinguishes model text, local rejection, and mixed model/tool processing', async () => {
  await reset();
  global.fetch = async () => success(JSON.stringify({ actions: [], reply: 'Ответ модели' }));
  const model = await chat.processAdminAiChatTurn('Какие у нас настройки?');
  assert.equal(model.assistantMessage.replySource, 'MODEL');
  assert.equal(model.assistantMessage.modelLabel, 'PLUSVIBE · ID по ответу провайдера: actual-model');
  assert.equal(model.assistantMessage.content, 'Ответ модели');

  global.fetch = async () => success('Я уже поменял настройки.');
  const malformed = await chat.processAdminAiChatTurn('Включи полный автопилот');
  assert.equal(malformed.assistantMessage.replySource, 'SERVER');
  assert.equal(malformed.assistantMessage.modelLabel, 'PLUSVIBE · ID по ответу провайдера: actual-model');
  assert.match(malformed.assistantMessage.content, /не выполнена/);
  assert.equal((await readState()).aiAutopilot.mode, 'OFF');

  global.fetch = async () => success(JSON.stringify({
    actions: [{ tool: 'configure_autopilot', args: { mode: 'FULL_AUTOPILOT' } }],
    reply: 'Я предложил включить автопилот.',
  }));
  const mixed = await chat.processAdminAiChatTurn('Включи полный автопилот');
  assert.equal(mixed.assistantMessage.replySource, 'MODEL');
  assert.equal(mixed.assistantMessage.modelLabel, 'PLUSVIBE · ID по ответу провайдера: actual-model');
  assert.equal(mixed.assistantMessage.executedActions[0].ok, true);
  assert.equal((await readState()).aiAutopilot.mode, 'FULL_AUTOPILOT');
  const persisted = (await readState()).aiChatMessages.at(-1);
  assert.equal(persisted.replySource, 'MODEL');
});

test('chat does not claim the provider returned a model ID when it omitted one', async () => {
  await reset();
  global.fetch = async () => response({ choices: [{ message: { content: JSON.stringify({ actions: [], reply: 'Ответ' }) } }] });
  const result = await chat.processAdminAiChatTurn('Какие настройки?');
  assert.equal(result.assistantMessage.replySource, 'MODEL');
  assert.equal(result.assistantMessage.modelLabel, 'PLUSVIBE · Запрошена: old-model; ID в ответе не указан');
  global.fetch = async () => response({ model: 12, choices: [{ message: { content: JSON.stringify({ actions: [], reply: 'Ответ' }) } }] });
  const malformed = await chat.processAdminAiChatTurn('Какие настройки?');
  assert.equal(malformed.assistantMessage.replySource, 'MODEL');
  assert.match(malformed.assistantMessage.modelLabel, /ID в ответе не указан/);
});

test('a PlusVibe key cannot be forwarded under another provider or via an unsafe URL', async () => {
  await reset();
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('unexpected'); };
  assert.deepEqual(autopilot.buildCandidateLlmBaseUrls('https://other.example/v1', 'OLLAMA', oldKey), []);
  const wrongProvider = await route.POST(request('POST', { action: 'TEST_LLM', llmProvider: 'OLLAMA', llmBaseUrl: 'https://ollama.com/v1', llmApiKey: oldKey, llmModel: 'm' }));
  assert.equal(wrongProvider.status, 400);
  assert.match((await wrongProvider.json()).error, /Ключ PlusVibe/);
  const unsafeUrl = await route.POST(request('POST', { action: 'TEST_LLM', llmProvider: 'OLLAMA', llmBaseUrl: 'https://user:pass@ollama.com/v1', llmApiKey: newKey, llmModel: 'm' }));
  assert.equal(unsafeUrl.status, 400);
  assert.equal(calls, 0);
  assert.equal((await readState()).aiAutopilot.llmApiKey, oldKey);
});

test('environment defaults pair each key with its own provider, URL and model', () => {
  const { initialLlmConfigFromEnv } = require('../src/server/llm-config-policy.ts');
  assert.deepEqual(initialLlmConfigFromEnv({ AI_LLM_API_KEY: 'generic-secret-fixture' }), {
    llmProvider: 'DEEPSEEK', llmApiKey: 'generic-secret-fixture',
    llmBaseUrl: 'https://api.deepseek.com/v1', llmModel: 'deepseek-chat',
  });
  assert.deepEqual(initialLlmConfigFromEnv({ AI_LLM_API_KEY: oldKey, AI_LLM_BASE_URL: 'https://gw.plusvibeapi.ru/v1', AI_LLM_MODEL: 'pv-model' }), {
    llmProvider: 'PLUSVIBE', llmApiKey: oldKey,
    llmBaseUrl: 'https://gw.plusvibeapi.ru/v1', llmModel: 'pv-model',
  });
  assert.deepEqual(initialLlmConfigFromEnv({ OLLAMA_API_KEY: newKey, AI_LLM_API_KEY: oldKey }), {
    llmProvider: 'OLLAMA', llmApiKey: newKey,
    llmBaseUrl: 'https://ollama.com/v1', llmModel: 'deepseek-v4.1-flash',
  });
  assert.deepEqual(initialLlmConfigFromEnv({ PLUSVIBE_API_KEY: oldKey, OLLAMA_API_KEY: newKey }), {
    llmProvider: 'PLUSVIBE', llmApiKey: oldKey,
    llmBaseUrl: 'https://plusvibeapi.ru/v1', llmModel: 'deepseek-v4.1-flash',
  });
  assert.equal(initialLlmConfigFromEnv({}).llmProvider, 'BUILTIN_QUANT');
});
