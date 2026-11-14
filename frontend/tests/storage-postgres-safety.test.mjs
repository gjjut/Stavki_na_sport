import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const originalCwd = process.cwd();
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalDateNow = Date.now;
const originalFetch = global.fetch;
const pg = require('pg');
const OriginalPool = pg.Pool;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-postgres-storage-test-'));
process.chdir(temp);
process.env.DATABASE_URL = 'postgresql://fake:fake@localhost:5432/fake';
let now = originalDateNow();
Date.now = () => now;
let networkCalls = 0;
global.fetch = async () => { networkCalls++; throw new Error('External network is disabled in tests'); };
const localFile = path.join(temp, '.data', 'valuex-production.json');
mkdirSync(path.dirname(localFile));
const localSentinel = JSON.stringify({ settings: { brandName: 'LOCAL SENTINEL' }, users: [], predictions: [], transactions: [] });
writeFileSync(localFile, localSentinel);

// A deterministic in-memory pg double: no real connection, credentials, or production data.
const fake = {
  online: false,
  instances: [],
  payload: { settings: { brandName: 'Postgres fixture' }, users: [], predictions: [], transactions: [] },
  conflictPayload: null,
  loseCommitAck: false,
  failRollback: false,
};
const clone = (value) => structuredClone(value);
class FakePool {
  constructor() { this.handlers = {}; this.ended = false; fake.instances.push(this); }
  on(event, callback) { this.handlers[event] = callback; return this; }
  async end() { this.ended = true; }
  emitIdleError() { this.handlers.error(new Error('offline')); }
  async query(sql, params = []) {
    if (!fake.online || this.ended) throw new Error('test-password must not leak');
    if (sql.includes('CREATE TABLE')) return { rows: [] };
    if (sql.includes('SELECT payload')) return { rows: fake.payload ? [{ payload: clone(fake.payload) }] : [] };
    if (sql.includes('INSERT INTO valuex_app_storage')) {
      if (fake.conflictPayload) {
        fake.payload = clone(fake.conflictPayload);
        fake.conflictPayload = null;
        return { rows: [] };
      }
      if (fake.payload) return { rows: [] };
      fake.payload = JSON.parse(params[0]);
      return { rows: [{ payload: clone(fake.payload) }] };
    }
    throw new Error(`Unexpected fake pool query: ${sql}`);
  }
  async connect() {
    if (!fake.online || this.ended) throw new Error('test-password must not leak');
    let staged = null;
    return {
      async query(sql, params = []) {
        if (sql === 'ROLLBACK') {
          if (fake.failRollback) throw new Error('rollback failed');
          staged = null;
          return { rows: [] };
        }
        if (!fake.online) throw new Error('test-password must not leak');
        if (sql === 'BEGIN') return { rows: [] };
        if (sql.includes('SELECT payload')) return { rows: fake.payload ? [{ payload: clone(fake.payload) }] : [] };
        if (sql.includes('INSERT INTO valuex_app_storage')) {
          staged = JSON.parse(params[0]);
          return { rows: [] };
        }
        if (sql.includes('UPDATE valuex_app_storage')) {
          staged = JSON.parse(params[0]);
          return { rows: [] };
        }
        if (sql === 'COMMIT') {
          if (staged) fake.payload = clone(staged);
          if (fake.loseCommitAck) throw new Error('test-password must not leak');
          return { rows: [] };
        }
        throw new Error(`Unexpected fake client query: ${sql}`);
      },
      release() {},
    };
  }
}
pg.Pool = FakePool;

const database = require('../src/server/database.ts');
const { readState, mutateState, getDatabaseBackendStatus, StorageUnavailableError } = database;
const guards = require('../src/server/guards.ts');
guards.getOptionalViewer = async () => ({ id: 'fixture-user' });
guards.requireAuthenticatedUser = async () => ({ id: 'fixture-user' });
guards.requireAdminAccount = async () => ({ id: 'fixture-admin', role: 'ADMIN' });
const autopilot = require('../src/server/ai-autopilot.ts');
autopilot.ensureInProcessAutopilotDaemon = () => {};
const health = require('../src/app/api/health/route.ts');
const webhook = require('../src/app/api/v1/webhooks/yookassa/route.ts');
const checkout = require('../src/app/api/v1/billing/checkout/route.ts');
const verifyReturn = require('../src/app/api/v1/billing/verify-return/route.ts');
const overview = require('../src/app/api/v1/admin/overview/route.ts');
const predictions = require('../src/app/api/v1/admin/predictions/route.ts');
const finance = require('../src/app/api/v1/admin/finance/route.ts');
const users = require('../src/app/api/v1/admin/users/route.ts');
const cabinet = require('../src/app/api/v1/cabinet/route.ts');
const { NextRequest } = require('next/server');

const request = (url, method, body) => new NextRequest(`http://localhost${url}`, {
  method,
  ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
});
const assertLocalUntouched = () => assert.equal(readFileSync(localFile, 'utf8'), localSentinel);

after(() => {
  pg.Pool = OriginalPool;
  global.fetch = originalFetch;
  Date.now = originalDateNow;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  process.chdir(originalCwd);
  rmSync(temp, { recursive: true, force: true });
});

test('configured PostgreSQL fails closed, reports 503, and resumes without touching local data', async () => {
  let called = false;
  const [reading, writing, status] = await Promise.allSettled([
    readState(),
    mutateState(() => { called = true; }),
    getDatabaseBackendStatus(),
  ]);
  for (const result of [reading, writing]) {
    assert.equal(result.status, 'rejected');
    assert.ok(result.reason instanceof StorageUnavailableError);
    assert.doesNotMatch(result.reason.message, /test-password/);
  }
  assert.equal(called, false);
  assert.equal(status.status, 'fulfilled');
  assert.equal(status.value.backend, 'unavailable');
  assert.equal(status.value.usingLocalFallback, false);
  assert.equal(fake.instances.length, 1, 'concurrent requests share a single connection attempt');
  assert.equal(fake.instances[0].ended, true, 'a failed pool is closed');
  assertLocalUntouched();

  const healthResponse = await health.GET();
  const healthBody = await healthResponse.json();
  assert.equal(healthResponse.status, 503);
  assert.equal(healthBody.status, 'degraded');
  assert.equal(healthBody.storage, 'unavailable');
  assert.equal(healthBody.storageDegraded, true);
  assert.equal(healthBody.adminAccountConfigured, undefined);
  const requests = [
    webhook.POST(request('/api/v1/webhooks/yookassa', 'POST', { event: 'payment.succeeded', object: { id: 'fake-payment' } })),
    checkout.POST(request('/api/v1/billing/checkout', 'POST', { kind: 'BALANCE_TOPUP', paymentMethod: 'yookassa', topupAmountRub: 100 })),
    verifyReturn.POST(request('/api/v1/billing/verify-return', 'POST', { orderId: 'fake-order' })),
    overview.GET(),
    predictions.DELETE(request('/api/v1/admin/predictions?id=fixture', 'DELETE')),
    finance.PATCH(request('/api/v1/admin/finance', 'PATCH', { action: 'REFUND_ORDER', orderId: 'fixture' })),
    users.PATCH(request('/api/v1/admin/users', 'PATCH', { action: 'ADD_BALANCE', userId: 'fixture', amountRub: 100 })),
    cabinet.GET(),
  ];
  for (const response of await Promise.all(requests)) {
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(await response.json()), /test-password/);
  }
  assert.equal(networkCalls, 0);
  assertLocalUntouched();

  fake.online = true;
  await assert.rejects(readState(), StorageUnavailableError, 'retry cooldown prevents a connection storm');
  now += 10_001;
  assert.equal((await readState()).settings.brandName, 'Postgres fixture');
  assert.equal((await getDatabaseBackendStatus()).backend, 'postgres');
  await mutateState((draft) => { draft.settings.brandName = 'Postgres updated'; });
  assert.equal(fake.payload.settings.brandName, 'Postgres updated');
  assertLocalUntouched();

  // A dropped connection after initialization is also an error, not a switch to the JSON file.
  fake.online = false;
  await assert.rejects(readState(), StorageUnavailableError);
  await assert.rejects(mutateState(() => { throw new Error('must not run'); }), StorageUnavailableError);
  const downAgain = await health.GET();
  assert.equal(downAgain.status, 503);
  assert.equal((await downAgain.json()).storage, 'unavailable');
  assertLocalUntouched();

  fake.instances.at(-1).emitIdleError();
  fake.online = true;
  await assert.rejects(readState(), StorageUnavailableError);
  now += 10_001;
  assert.equal((await readState()).settings.brandName, 'Postgres updated');
  assert.equal(fake.instances.at(-2).ended, true, 'the old pool is closed after an idle error');

  // COMMIT may succeed while its acknowledgement is lost; preserve the warning even if rollback fails.
  fake.loseCommitAck = true;
  fake.failRollback = true;
  await assert.rejects(
    mutateState((draft) => { draft.settings.brandName = 'Committed without acknowledgement'; }),
    (err) => err instanceof StorageUnavailableError && /результат операции перед повтором/i.test(err.message),
  );
  fake.loseCommitAck = false;
  fake.failRollback = false;
  assert.equal((await readState()).settings.brandName, 'Committed without acknowledgement');
  await assert.rejects(mutateState(() => { throw new Error('domain error'); }), /domain error/);
  assertLocalUntouched();

  // If another process initializes an empty PostgreSQL row, a reader must use its winning state.
  fake.payload = null;
  fake.conflictPayload = { settings: { brandName: 'Other initializer' }, users: [], predictions: [], transactions: [] };
  assert.equal((await readState()).settings.brandName, 'Other initializer');
  assertLocalUntouched();
});
