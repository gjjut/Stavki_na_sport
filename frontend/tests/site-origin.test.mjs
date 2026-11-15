import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { configuredSiteOrigin } = await loadTypeScriptModule(new URL('../src/lib/site-origin.ts', import.meta.url));

test('canonical origin is explicit, well formed, and never a hard-coded IP fallback', () => {
  assert.equal(configuredSiteOrigin('https://example.test/'), 'https://example.test');
  assert.equal(configuredSiteOrigin('http://localhost:3000'), 'http://localhost:3000');
  for (const value of ['', 'not a url', 'ftp://example.test', 'https://user:pass@example.test',
    'https://example.test/path', 'https://example.test/?query=yes', 'https://example.test/#fragment']) {
    assert.equal(configuredSiteOrigin(value), null, value);
  }
});
