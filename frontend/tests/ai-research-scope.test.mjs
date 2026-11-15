import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const { plusVibeSearchConnection, searchOpenSourcesForAdmin } = require('../src/server/ai-research.ts');
const originalFetch = global.fetch;
const envNames = ['PLUSVIBE_API_KEY', 'PLUSVIBE_SEARCH_URL'];
const env = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
after(() => {
  global.fetch = originalFetch;
  for (const name of envNames) {
    if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
  }
});

const key = 'sk-pv-test-search-secret';
const config = (provider, base = 'https://gw.plusvibeapi.ru/v1') => ({ llmProvider: provider, llmApiKey: key, llmBaseUrl: base });
function mockFetch(calls) {
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('unavailable', { status: 503 });
  };
}

test('a paid search uses only the selected PlusVibe origin and does not retry', async () => {
  delete process.env.PLUSVIBE_SEARCH_URL;
  const calls = [];
  mockFetch(calls);
  await searchOpenSourcesForAdmin('РПЛ', plusVibeSearchConnection(config('PLUSVIBE')));
  const paid = calls.filter(({ options }) => options.headers?.Authorization);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].url, 'https://gw.plusvibeapi.ru/api/search');
  assert.equal(paid[0].options.headers.Authorization, `Bearer ${key}`);
  assert.equal(paid[0].options.redirect, 'error');
  assert.equal(calls.some(({ url }) => url.startsWith('https://plusvibeapi.ru/')), false);
});

test('an environment key is not used when another provider or local mode is selected', async () => {
  delete process.env.PLUSVIBE_SEARCH_URL;
  process.env.PLUSVIBE_API_KEY = key;
  for (const provider of ['OLLAMA', 'BUILTIN_QUANT']) {
    const calls = [];
    mockFetch(calls);
    assert.equal(plusVibeSearchConnection(config(provider)), undefined);
    await searchOpenSourcesForAdmin('РПЛ', plusVibeSearchConnection(config(provider)));
    assert.equal(calls.some(({ options }) => options.headers?.Authorization), false);
  }
});

test('an override cannot forward the selected key to a different host or unsafe URL', async () => {
  const connection = plusVibeSearchConnection(config('PLUSVIBE'));
  for (const endpoint of ['https://attacker.example/api/search', 'https://user:pass@gw.plusvibeapi.ru/api/search', 'https://gw.plusvibeapi.ru/api/search?key=secret']) {
    process.env.PLUSVIBE_SEARCH_URL = endpoint;
    const calls = [];
    mockFetch(calls);
    await searchOpenSourcesForAdmin('РПЛ', connection);
    assert.equal(calls.some(({ options }) => options.headers?.Authorization), false, endpoint);
  }
  process.env.PLUSVIBE_SEARCH_URL = 'https://gw.plusvibeapi.ru/custom/search';
  const calls = [];
  mockFetch(calls);
  await searchOpenSourcesForAdmin('РПЛ', connection);
  assert.deepEqual(calls.filter(({ options }) => options.headers?.Authorization).map(({ url }) => url), ['https://gw.plusvibeapi.ru/custom/search']);
});
