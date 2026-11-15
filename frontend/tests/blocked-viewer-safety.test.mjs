import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const oldCwd = process.cwd();
const oldDatabaseUrl = process.env.DATABASE_URL;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-blocked-test-'));
process.chdir(temp);
delete process.env.DATABASE_URL;
const db = require('../src/server/database.ts');
const auth = require('../src/server/auth.ts');
let sessions = [];
auth.getSessionCandidatesFromCookies = async () => sessions;
const guards = require('../src/server/guards.ts');

after(() => {
  process.chdir(oldCwd);
  if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDatabaseUrl;
  rmSync(temp, { recursive: true, force: true });
});

test('blocking an account prevents a previously valid session from unlocking public predictions', async () => {
  const user = await db.registerUserAccount({ email: 'buyer@example.test', password: 'test-password', displayName: 'Buyer' });
  const pred = await db.createPredictionByAdmin({
    sport: 'FOOTBALL', leagueName: 'Test', homeTeam: 'Home', awayTeam: 'Away',
    matchStartsAt: '2035-01-01T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2,
    stakeUnits: 1, accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: true,
    analysisTeaser: 'Teaser', analysisFull: 'Private analysis', pushToTelegram: false,
  });
  await db.mutateState((state) => state.users.find((u) => u.id === user.id).purchasedPredictionIds.push(pred.id));
  sessions = [auth.verifySessionToken(auth.signSessionToken(user))];
  const activeViewer = await guards.getOptionalViewer();
  assert.equal(activeViewer.id, user.id);
  assert.equal(db.toPublicPredictionDto(pred, activeViewer).isLocked, false);
  await db.mutateState((state) => { state.users.find((u) => u.id === user.id).status = 'BLOCKED'; });
  assert.equal(await guards.getOptionalViewer(), null);
  assert.equal(db.toPublicPredictionDto(pred, await guards.getOptionalViewer()).isLocked, true);
  await assert.rejects(guards.requireAuthenticatedUser(), /UNAUTHORIZED/);
});

test('revoked and conflicting cookies never silently switch accounts; same-account fresh token can recover', async () => {
  const a = await db.registerUserAccount({ email: 'a@example.test', password: 'password-old', displayName: 'A' });
  const b = await db.registerUserAccount({ email: 'b@example.test', password: 'password-bbb', displayName: 'B' });
  const oldA = auth.signSessionToken(a);
  const tokenB = auth.signSessionToken(b);
  await db.mutateState((state) => { state.users.find((u) => u.id === a.id).passwordHash = auth.hashPassword('password-new'); });
  const freshA = auth.signSessionToken((await db.readState()).users.find((u) => u.id === a.id));

  sessions = auth.verifySessionCookieCandidates(oldA, tokenB);
  assert.equal(await guards.getOptionalViewer(), null, 'a revoked primary must not reveal a different account');
  sessions = auth.verifySessionCookieCandidates(oldA, freshA);
  assert.equal((await guards.getOptionalViewer()).id, a.id, 'a fresh embedded token of the same user is allowed');
  sessions = auth.verifySessionCookieCandidates(freshA, tokenB);
  assert.equal((await guards.getOptionalViewer()).id, a.id, 'a valid primary takes precedence');
  sessions = auth.verifySessionCookieCandidates('bad-token', tokenB);
  assert.equal((await guards.getOptionalViewer()).id, b.id, 'invalid primary leaves the signed embedded token');
  sessions = auth.verifySessionCookieCandidates(oldA, undefined);
  assert.equal(await guards.getOptionalViewer(), null);
});
