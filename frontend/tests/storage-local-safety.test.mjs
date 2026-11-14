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
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-local-storage-test-'));
process.chdir(temp);
process.env.DATABASE_URL = '';
const dataDir = path.join(temp, '.data');
const file = path.join(dataDir, 'valuex-production.json');
mkdirSync(dataDir);
const { readState, mutateState, StorageUnavailableError } = require('../src/server/database.ts');
const health = require('../src/app/api/health/route.ts');

after(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  process.chdir(originalCwd);
  rmSync(temp, { recursive: true, force: true });
});

test('a corrupt local file is not reseeded, and failed writes do not update cached state', async () => {
  const corrupt = '{ "transactions": [ broken';
  writeFileSync(file, corrupt);
  await assert.rejects(readState(), StorageUnavailableError);
  let mutatorCalled = false;
  await assert.rejects(mutateState(() => { mutatorCalled = true; }), StorageUnavailableError);
  assert.equal(mutatorCalled, false);
  assert.equal(readFileSync(file, 'utf8'), corrupt);
  const unhealthy = await health.GET();
  assert.equal(unhealthy.status, 503);
  assert.deepEqual(
    (({ status, storage, storageDegraded }) => ({ status, storage, storageDegraded }))(await unhealthy.json()),
    { status: 'degraded', storage: 'unavailable', storageDegraded: true },
  );
  assert.equal(readFileSync(file, 'utf8'), corrupt);

  for (const incomplete of ['null', '[]', '{}', '{"settings":{},"users":[],"predictions":[]}']) {
    writeFileSync(file, incomplete);
    await assert.rejects(readState(), StorageUnavailableError);
    await assert.rejects(mutateState(() => { throw new Error('must not run'); }), StorageUnavailableError);
    assert.equal(readFileSync(file, 'utf8'), incomplete);
  }

  const valid = JSON.stringify({ settings: { brandName: 'Original' }, users: [], predictions: [], transactions: [] });
  writeFileSync(file, valid);
  assert.equal((await readState()).settings.brandName, 'Original');
  // Making the temporary filename a directory produces a deterministic write error, even as root.
  mkdirSync(`${file}.tmp`);
  await assert.rejects(
    mutateState((draft) => { draft.settings.brandName = 'Must not be visible'; }),
    StorageUnavailableError,
  );
  assert.equal(readFileSync(file, 'utf8'), valid);
  assert.equal((await readState()).settings.brandName, 'Original');
  rmSync(`${file}.tmp`, { recursive: true });

  await mutateState((draft) => { draft.settings.brandName = 'Persisted'; });
  assert.equal((await readState()).settings.brandName, 'Persisted');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).settings.brandName, 'Persisted');
});
