import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { isStorageDegraded } = await loadTypeScriptModule(
  new URL('../src/server/health-policy.ts', import.meta.url),
);

test('production health fails when PostgreSQL is missing, unreachable, or replaced by local-file storage', () => {
  assert.equal(
    isStorageDegraded({
      production: true,
      backend: 'local_file',
      databaseUrlConfigured: false,
      usingLocalFallback: false,
    }),
    true,
  );
  assert.equal(
    isStorageDegraded({
      production: true,
      backend: 'local_file',
      databaseUrlConfigured: true,
      usingLocalFallback: true,
    }),
    true,
  );
  assert.equal(
    isStorageDegraded({
      production: true,
      backend: 'postgres',
      databaseUrlConfigured: true,
      usingLocalFallback: false,
    }),
    false,
  );
});

test('local development may use local-file storage without a degraded production health status', () => {
  assert.equal(
    isStorageDegraded({
      production: false,
      backend: 'local_file',
      databaseUrlConfigured: false,
      usingLocalFallback: false,
    }),
    false,
  );
  assert.equal(
    isStorageDegraded({
      production: false,
      backend: 'local_file',
      databaseUrlConfigured: true,
      usingLocalFallback: true,
    }),
    true,
  );
});
