import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const originalCwd = process.cwd();
const originalDatabaseUrl = process.env.DATABASE_URL;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-real-pool-test-'));
process.chdir(temp);
let connections = 0;
// The real pg driver connects only to this disposable server, which immediately closes the socket.
const server = createServer((socket) => { connections++; socket.destroy(); });
await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
const address = server.address();
process.env.DATABASE_URL = `postgresql://fixture:fixture@127.0.0.1:${address.port}/fixture`;
const file = path.join(temp, '.data', 'valuex-production.json');
mkdirSync(path.dirname(file));
const sentinel = '{"settings":{"brandName":"local"},"users":[],"predictions":[],"transactions":[]}';
writeFileSync(file, sentinel);
const { readState, mutateState, getDatabaseBackendStatus, StorageUnavailableError } = require('../src/server/database.ts');

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  process.chdir(originalCwd);
  rmSync(temp, { recursive: true, force: true });
});

test('the real PostgreSQL driver does not fall back when the connection terminates', async () => {
  let called = false;
  const [read, write] = await Promise.allSettled([
    readState(),
    mutateState(() => { called = true; }),
  ]);
  assert.equal(read.status, 'rejected');
  assert.ok(read.reason instanceof StorageUnavailableError);
  assert.equal(write.status, 'rejected');
  assert.ok(write.reason instanceof StorageUnavailableError);
  assert.equal(called, false);
  assert.equal(connections, 1);
  assert.equal((await getDatabaseBackendStatus()).backend, 'unavailable');
  assert.equal(readFileSync(file, 'utf8'), sentinel);
});
