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
const oldDatabaseUrl = process.env.DATABASE_URL;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-payout-test-'));
process.chdir(temp);
delete process.env.DATABASE_URL;
const db = require('../src/server/database.ts');
const guards = require('../src/server/guards.ts');
let viewer = null;
guards.requireAuthenticatedUser = async () => {
  if (!viewer) throw new Error('UNAUTHORIZED');
  return viewer;
};
const affiliate = require('../src/app/api/v1/affiliate/route.ts');
const { NextRequest } = require('next/server');
const send = (body) => affiliate.POST(new NextRequest('https://example.test/api/v1/affiliate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));
let networkCalls = [];
global.fetch = async (url, options) => {
  networkCalls.push({ url, body: JSON.parse(options.body) });
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

after(() => {
  global.fetch = oldFetch;
  process.chdir(oldCwd);
  if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDatabaseUrl;
  rmSync(temp, { recursive: true, force: true });
});

test('payout amounts and fields are validated before balances or requests can be changed', async () => {
  const partner = await db.registerUserAccount({ email: 'partner@example.test', password: 'test-password', displayName: 'Partner' });
  const admin = await db.registerUserAccount({ email: 'admin@example.test', password: 'test-password', displayName: 'Admin' });
  viewer = partner;
  await db.mutateState((state) => {
    state.users.find((u) => u.id === partner.id).affiliateBalanceRub = 1500;
    const a = state.users.find((u) => u.id === admin.id);
    a.role = 'ADMIN';
    a.telegramBindingVerified = true;
    a.telegramChatId = '987654';
    state.settings.telegramBotToken = 'TEST_TOKEN';
  });
  const valid = { action: 'REQUEST_PAYOUT', amountRub: 500, method: 'CARD', requisites: '2200 1234 5678 9012' };
  for (const body of [
    { ...valid, amountRub: 'not-a-number' }, { ...valid, amountRub: null },
    { ...valid, amountRub: {} }, { ...valid, amountRub: -500 },
    { ...valid, amountRub: 499 }, { ...valid, amountRub: 500.5 },
    { ...valid, amountRub: 1e100 }, { ...valid, method: 'UNKNOWN' },
    { ...valid, requisites: {} }, { ...valid, requisites: 'x'.repeat(161) },
  ]) {
    assert.equal((await send(body)).status, 400);
  }
  let state = await db.readState();
  assert.equal(state.users.find((u) => u.id === partner.id).affiliateBalanceRub, 1500);
  assert.equal(state.payouts.length, 0);
  assert.equal(networkCalls.length, 0);

  const res = await send(valid);
  assert.equal(res.status, 200);
  const { payout } = await res.json();
  assert.equal(payout.amountRub, 500);
  state = await db.readState();
  assert.equal(state.users.find((u) => u.id === partner.id).affiliateBalanceRub, 1000);
  assert.equal(state.payouts.length, 1);
  assert.equal(networkCalls.length, 1);
  const message = networkCalls[0].body.text;
  assert.match(message, new RegExp(payout.id));
  assert.doesNotMatch(message, /2200|partner@example\.test/);

  viewer = null;
  assert.equal((await send(valid)).status, 401);
  assert.equal((await db.readState()).payouts.length, 1);
});
