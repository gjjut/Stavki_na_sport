import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const oldCwd = process.cwd();
const oldFetch = global.fetch;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-logo-test-'));
process.chdir(temp); // disposable logo cache only
const { normalizeAllowedLogoImageUrl } = require('../src/server/logo-fetch-policy.ts');
const { normalizeFonbetTeamImageUrl } = require('../src/server/fonbet-team-logos.ts');
const { resolveTeamLogoResponse } = require('../src/server/team-logos.ts');
after(() => { global.fetch = oldFetch; process.chdir(oldCwd); rmSync(temp, { recursive: true, force: true }); });

test('only explicit HTTPS image hosts without credentials or nonstandard ports are allowed', () => {
  assert.ok(normalizeAllowedLogoImageUrl('https://a.espncdn.com/images/player.png'));
  assert.ok(normalizeAllowedLogoImageUrl('https://upload.wikimedia.org/example.png'));
  assert.ok(normalizeFonbetTeamImageUrl('https://cdn-ec.bk6bba-resources.ru/contentcommon/team.png'));
  assert.equal(normalizeAllowedLogoImageUrl('https://a.espncdn.com/images/player.png', true), null);
  for (const url of [
    'http://127.0.0.1:3000/internal', 'http://169.254.169.254/latest/meta-data/',
    'https://[::1]/', 'https://localhost/', 'https://a.espncdn.com.evil.example/a.png',
    'https://attacker@a.espncdn.com/a.png', 'https://a.espncdn.com:8443/a.png',
    'http://a.espncdn.com/a.png', 'https://cdn-ec.bk6bba-resources.ru:8443/contentcommon/logo.png',
    'https://user@cdn-ec.bk6bba-resources.ru/contentcommon/logo.png',
    'https://unlisted.bk6bba-resources.com/contentcommon/logo.png',
  ]) assert.equal(normalizeAllowedLogoImageUrl(url), null, url);
});

test('private athlete URLs and redirects never reach internal addresses', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), redirect: options.redirect });
    if (String(url) === 'https://a.espncdn.com/redirect.png') {
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
    }
    return new Response(null, { status: 404 });
  };
  assert.equal((await resolveTeamLogoResponse({ teamName: 'Private athlete', sport: 'TENNIS', directUrl: 'http://127.0.0.1:3000/private' })).isOfficialBinary, false);
  assert.equal((await resolveTeamLogoResponse({ teamName: 'Redirect athlete', sport: 'MMA', directUrl: 'https://a.espncdn.com/redirect.png' })).isOfficialBinary, false);
  assert.ok(calls.some((c) => c.url === 'https://a.espncdn.com/redirect.png' && c.redirect === 'manual'));
  assert.ok(calls.filter((c) => !c.url.includes('redirect.png')).every((c) => c.redirect === 'error'));
  assert.ok(calls.every((c) => !c.url.includes('127.0.0.1') && !c.url.includes('169.254.169.254')));
});

test('external search results cannot redirect image fetching to internal addresses', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), redirect: options.redirect });
    if (String(url).startsWith('https://site.web.api.espn.com/')) {
      return new Response(JSON.stringify({ items: [{ images: [{ url: 'http://127.0.0.1:3000/private.png' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(null, { status: 404 });
  };
  const result = await resolveTeamLogoResponse({ teamName: 'Malicious result', sport: 'TENNIS' });
  assert.equal(result.isOfficialBinary, false);
  assert.ok(calls.every((c) => !c.url.includes('127.0.0.1')));
  assert.ok(calls.every((c) => c.redirect === 'error'));
});

test('different approved athlete URLs have different cache entries, while SVG and oversized responses are rejected', async () => {
  const requested = [];
  const png = new Uint8Array(128);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  global.fetch = async (url) => {
    url = String(url); requested.push(url);
    if (url.endsWith('/first.png') || url.endsWith('/second.png')) return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
    if (url.endsWith('/bad.svg')) return new Response('<svg><script>alert(1)</script></svg>', { status: 200, headers: { 'content-type': 'image/svg+xml' } });
    if (url.endsWith('/large.png')) return new Response(new Uint8Array(1_600_001), { status: 200, headers: { 'content-type': 'image/png' } });
    return new Response(null, { status: 404 });
  };
  const params = { teamName: 'Same athlete', sport: 'TENNIS' };
  assert.equal((await resolveTeamLogoResponse({ ...params, directUrl: 'https://a.espncdn.com/first.png' })).isOfficialBinary, true);
  assert.equal((await resolveTeamLogoResponse({ ...params, directUrl: 'https://a.espncdn.com/second.png' })).isOfficialBinary, true);
  assert.ok(requested.includes('https://a.espncdn.com/first.png'));
  assert.ok(requested.includes('https://a.espncdn.com/second.png'));
  assert.equal((await resolveTeamLogoResponse({ teamName: 'SVG athlete', sport: 'TENNIS', directUrl: 'https://a.espncdn.com/bad.svg' })).isOfficialBinary, false);
  assert.equal((await resolveTeamLogoResponse({ teamName: 'Large athlete', sport: 'TENNIS', directUrl: 'https://a.espncdn.com/large.png' })).isOfficialBinary, false);
});
