import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { React, act, mount } = require('./ui-test-utils.cjs');
const { usePublicPlatform } = require('../src/hooks/usePublicPlatform.ts');
const payload = (brandName) => ({ brand: { brandName }, predictions: [], statsByPeriod: {}, viewer: null });
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('public data validates responses, supports retry, and ignores older concurrent requests', async (t) => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = () => { const next = deferred(); requests.push(next); return next.promise; };
  t.after(() => { global.fetch = originalFetch; });
  let latest;
  function Probe() {
    latest = usePublicPlatform();
    return React.createElement('span', null, latest.error || latest.data?.brand.brandName || (latest.loading ? 'loading' : 'empty'));
  }
  const view = await mount(Probe, {});
  t.after(view.cleanup);
  assert.equal(view.container.textContent, 'loading');
  assert.equal(requests.length, 1);

  let second;
  await act(async () => { second = latest.reload(); });
  assert.equal(requests.length, 2);
  await act(async () => { requests[1].resolve(response(payload('new'))); await second; });
  assert.equal(view.container.textContent, 'new');
  await act(async () => { requests[0].resolve(response(payload('old'))); await requests[0].promise; });
  assert.equal(view.container.textContent, 'new');

  let failure;
  await act(async () => { failure = latest.reload(); });
  await act(async () => { requests[2].resolve(response({ brand: {} })); await failure; });
  assert.match(view.container.textContent, /Не удалось загрузить/);
  assert.equal(latest.data.brand.brandName, 'new');
  assert.equal(latest.loading, false);

  let retry;
  await act(async () => { retry = latest.reload(); });
  await act(async () => { requests[3].resolve(response(payload('recovered'))); await retry; });
  assert.equal(view.container.textContent, 'recovered');
  assert.equal(latest.error, null);
});
