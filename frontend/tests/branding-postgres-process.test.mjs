import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Opt in only on a dedicated local test database; an isolated schema is dropped afterwards.
const testUrl = process.env.VALUEX_TEST_POSTGRES_URL;
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const loader = fileURLToPath(new URL('./ui-test-utils.cjs', import.meta.url));
const databaseModule = fileURLToPath(new URL('../src/server/database.ts', import.meta.url));

test('real PostgreSQL keeps legacy accounts and orders while migrating only the default brand', { skip: !testUrl, timeout: 60_000 }, async () => {
  const parsed = new URL(testUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'only loopback PostgreSQL is allowed');
  assert.match(parsed.pathname, /^\/valuex_test_[a-z0-9_]+$/, 'use a dedicated valuex_test_* database');
  parsed.search = '';
  const schema = `predictlab_brand_test_${process.pid}_${Date.now()}`;
  const client = new Client({ connectionString: parsed.toString() });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`CREATE TABLE "${schema}".valuex_app_storage (store_key varchar(64) PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT NOW())`);
    const payload = {
      settings: { brandName: 'VALUEX', supportTelegram: 'https://t.me/owner_support', paymentMode: 'YOOKASSA_LIVE' },
      users: [{ id: 'u1', email: 'person@example.test', role: 'USER', status: 'ACTIVE', passwordHash: 'existing-hash', balanceRub: 137,
        referralCode: 'valuex_official', purchasedPredictionIds: ['p1'] }],
      predictions: [{ id: 'p1', accessTier: 'PAID_SINGLE', resultStatus: 'PENDING' }],
      transactions: [{ id: 't1', kind: 'SINGLE_PREDICTION', status: 'SUCCEEDED', predictionId: 'p1', externalPaymentId: 'payment-1' }],
    };
    await client.query(`INSERT INTO "${schema}".valuex_app_storage (store_key, payload) VALUES ('main', $1::jsonb)`, [JSON.stringify(payload)]);
    const scoped = new URL(parsed);
    scoped.searchParams.set('options', `-c search_path=${schema}`);
    const child = `
      const assert = require('node:assert/strict');
      require(${JSON.stringify(loader)});
      const {Client} = require('pg');
      const db = require(${JSON.stringify(databaseModule)});
      global.fetch = async () => { throw new Error('No external network in test'); };
      (async () => {
        const c = new Client({connectionString: process.env.DATABASE_URL});
        await c.connect();
        let state = await db.readState();
        assert.equal(state.settings.brandName, 'PredictLab');
        assert.equal(state.users[0].passwordHash, 'existing-hash');
        assert.equal(state.users[0].referralCode, 'valuex_official');
        assert.equal(state.transactions[0].externalPaymentId, 'payment-1');
        let row = (await c.query("SELECT payload FROM valuex_app_storage WHERE store_key='main'")).rows[0].payload;
        assert.equal(row.settings.brandName, 'VALUEX', 'a read alone does not rewrite the row');
        await db.mutateState(s => { s.settings.defaultSinglePriceRub = 456; });
        row = (await c.query("SELECT payload FROM valuex_app_storage WHERE store_key='main'")).rows[0].payload;
        assert.equal(row.settings.brandName, 'PredictLab');
        assert.equal(row.settings.supportTelegram, 'https://t.me/owner_support');
        assert.equal(row.users[0].balanceRub, 137);
        assert.equal(row.transactions[0].externalPaymentId, 'payment-1');
        await db.mutateState(s => { s.settings.brandName = 'VALUEX.PRO'; });
        state = await db.readState();
        assert.equal(state.settings.brandName, 'VALUEX.PRO', 'a custom name stays unchanged');
        await c.end();
        console.log('isolated PostgreSQL branding OK');
        process.exit(0);
      })().catch(e => { console.error(e); process.exit(1); });
    `;
    const env = { ...process.env, DATABASE_URL: scoped.toString(), ADMIN_EMAIL: '', ADMIN_PASSWORD: '', NODE_ENV: 'test' };
    for (const key of ['PLUSVIBE_API_KEY', 'OLLAMA_API_KEY', 'AI_LLM_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID']) delete env[key];
    const result = spawnSync(process.execPath, ['-e', child], { cwd: fileURLToPath(new URL('..', import.meta.url)), env, encoding: 'utf8', timeout: 40_000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /isolated PostgreSQL branding OK/);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
