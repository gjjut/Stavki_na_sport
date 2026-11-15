import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { externalRequestOrigin, isAllowedApiMutation } = await loadTypeScriptModule(new URL('../src/lib/request-origin-policy.ts', import.meta.url));

function check(method, pathname, headers = {}, requestUrl = 'http://internal:3000/api/v1/cabinet') {
  return isAllowedApiMutation({ method, pathname, requestUrl, headers: new Headers(headers) });
}

test('mutating browser requests must come from the exact origin, including behind HTTPS proxy', () => {
  const path = '/api/v1/cabinet';
  const same = { host: 'shop.example.test', 'x-forwarded-proto': 'https', origin: 'https://shop.example.test', 'sec-fetch-site': 'same-origin' };
  assert.equal(check('PATCH', path, same), true);
  assert.equal(check('PATCH', path, { ...same, origin: 'https://evil.example.test', 'sec-fetch-site': 'same-site' }), false);
  assert.equal(check('POST', path, { ...same, origin: 'https://attacker.test', 'sec-fetch-site': 'cross-site' }), false);
  assert.equal(check('POST', path, { ...same, origin: 'null' }), false);
  assert.equal(check('POST', path, { host: 'shop.example.test', 'x-forwarded-proto': 'https' }), false);
  assert.equal(check('POST', path, { host: 'shop.example.test', 'x-forwarded-proto': 'https', 'sec-fetch-site': 'same-origin' }), true);
  assert.equal(check('POST', path, { ...same, 'x-forwarded-proto': 'http' }), false);
  assert.equal(check('GET', path), true);
});

test('external origin uses the host and overwritten scheme behind a trusted proxy', () => {
  assert.equal(externalRequestOrigin('http://internal:3000/a', new Headers({ host: 'shop.example.test', 'x-forwarded-proto': 'https' })), 'https://shop.example.test');
  assert.equal(externalRequestOrigin('http://localhost:3000/a', new Headers()), 'http://localhost:3000');
  assert.equal(externalRequestOrigin('http://internal/a', new Headers({ host: 'user@shop.example.test', 'x-forwarded-proto': 'https' })), null);
  assert.equal(externalRequestOrigin('http://internal/a', new Headers({ host: 'shop.example.test', 'x-forwarded-proto': 'ftp' })), null);
  assert.equal(externalRequestOrigin('http://internal:3000/a', new Headers({ host: 'shop.example.test:8443', 'x-forwarded-proto': 'https' })), 'https://shop.example.test:8443');
  assert.equal(check('POST', '/api/v1/cabinet', { host: 'shop.example.test:8443', 'x-forwarded-proto': 'https', origin: 'https://shop.example.test:8443', 'sec-fetch-site': 'same-origin' }), true);
  assert.equal(check('POST', '/api/v1/cabinet', { host: 'shop.example.test:8443', 'x-forwarded-proto': 'https', origin: 'https://shop.example.test', 'sec-fetch-site': 'same-origin' }), false);
});

test('only separately authenticated webhook and cron endpoints are exempt', () => {
  assert.equal(check('POST', '/api/v1/webhooks/telegram'), true);
  assert.equal(check('POST', '/api/v1/webhooks/yookassa/'), true);
  assert.equal(check('POST', '/api/v1/cron/autopilot'), true);
  assert.equal(check('POST', '/api/v1/admin/settings'), false);
  assert.equal(check('DELETE', '/api/v1/admin/ai-chat'), false);
});
