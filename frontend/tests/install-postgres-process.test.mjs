import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Run only against a dedicated loopback test database; temporary objects are removed afterwards.
const testUrl = process.env.VALUEX_TEST_POSTGRES_URL;
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const schemaSql = readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8');

test('fresh PostgreSQL schema is owned and writable by the application role', { skip: !testUrl, timeout: 60_000 }, async () => {
  const parsed = new URL(testUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'only loopback PostgreSQL is allowed');
  assert.match(parsed.pathname, /^\/valuex_test_[a-z0-9_]+$/, 'use a dedicated valuex_test_* database');
  parsed.search = '';
  const suffix = `${process.pid}_${Date.now()}`;
  const role = `pl_install_role_${suffix}`;
  const schema = `pl_install_schema_${suffix}`;
  const password = randomBytes(24).toString('hex');
  const admin = new Client({ connectionString: parsed.toString() });
  let app;
  await admin.connect();
  try {
    await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    await admin.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${role}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    // Equivalent to the installer's psql -c 'SET ROLE ...' -f schema.sql session.
    await admin.query(`SET ROLE "${role}"`);
    await admin.query(schemaSql);
    await admin.query('RESET ROLE');
    const owner = await admin.query(
      'SELECT pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2',
      [schema, 'valuex_app_storage'],
    );
    assert.equal(owner.rows[0].owner, role);

    const scoped = new URL(parsed);
    scoped.username = role;
    scoped.password = password;
    scoped.searchParams.set('options', `-c search_path=${schema}`);
    app = new Client({ connectionString: scoped.toString() });
    await app.connect();
    // The application also issues CREATE TABLE IF NOT EXISTS on connection.
    await app.query('CREATE TABLE IF NOT EXISTS valuex_app_storage (store_key varchar(64) PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT NOW())');
    await app.query("INSERT INTO valuex_app_storage (store_key, payload) VALUES ('main', '{}'::jsonb)");
    await app.query("UPDATE valuex_app_storage SET payload = '{\"ok\":true}'::jsonb WHERE store_key='main'");
    assert.deepEqual((await app.query("SELECT payload FROM valuex_app_storage WHERE store_key='main'")).rows[0].payload, { ok: true });
  } finally {
    if (app) await app.end().catch(() => {});
    await admin.query('RESET ROLE').catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.query(`DROP ROLE IF EXISTS "${role}"`);
    await admin.end();
  }
});
