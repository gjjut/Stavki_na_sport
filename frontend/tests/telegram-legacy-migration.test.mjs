import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const cwd = process.cwd();
const oldDb = process.env.DATABASE_URL;
const oldSecret = process.env.SESSION_SECRET;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-legacy-binding-'));
process.chdir(temp);
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET = 'migration-test-secret-'.padEnd(48, 'x');
mkdirSync(path.join(temp, '.data'));
const file = path.join(temp, '.data', 'valuex-production.json');
const id = 'usr_admin_root';
const oldCode = `vx_${createHash('sha256').update(`tglink:${id}`).digest('hex').slice(0, 10)}`;
writeFileSync(file, JSON.stringify({
  settings: { brandName: 'Fixture' }, predictions: [], transactions: [],
  users: [{ id, email: 'owner@example.test', passwordHash: 'unused', displayName: 'Owner', city: '', role: 'ADMIN', status: 'ACTIVE',
    balanceRub: 0, referenceBankrollRub: 50000, telegramUsername: null, telegramChatId: '12345', telegramLinkCode: oldCode,
    passwordResetCode: '123456', passwordResetExpiresAt: '2099-01-01T00:00:00Z', purchasedPredictionIds: [],
    referralCode: 'owner', referredByUserId: null, referredByCode: null, revsharePercent: 0, affiliateBalanceRub: 0,
    affiliateTotalEarnedRub: 0, createdAt: '2025-01-01T00:00:00Z', lastLoginAt: '2025-01-01T00:00:00Z' }],
}));
const db = require('../src/server/database.ts');

after(() => {
  process.chdir(cwd);
  if (oldDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDb;
  if (oldSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSecret;
  rmSync(temp, { recursive: true, force: true });
});

test('legacy link codes become secret-derived; old bindings and plaintext reset codes are not trusted', async () => {
  const user = (await db.readState()).users[0];
  assert.match(user.telegramLinkCode, /^vx_[a-f0-9]{32}$/);
  assert.notEqual(user.telegramLinkCode, oldCode);
  assert.equal(user.telegramChatId, '12345');
  assert.equal(user.telegramBindingVerified, false);
  assert.equal(user.passwordResetCode, null);
  assert.equal(user.passwordResetExpiresAt, null);
  assert.equal((await db.readState()).users[0].telegramLinkCode, user.telegramLinkCode);
  await db.mutateState(() => undefined);
  const saved = JSON.parse(readFileSync(file, 'utf8')).users[0];
  assert.equal(saved.telegramLinkCode, user.telegramLinkCode);
  assert.equal(saved.passwordResetCode, null);
  assert.equal(saved.telegramBindingVerified, false);
});
