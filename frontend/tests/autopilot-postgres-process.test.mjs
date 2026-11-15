import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Opt in only for a dedicated local test database. Each run creates and drops
// its own uniquely named schema; it never reads the production JSON database.
const testUrl = process.env.VALUEX_TEST_POSTGRES_URL;
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const workerPath = fileURLToPath(new URL('./fixtures/autopilot-postgres-worker.cjs', import.meta.url));
const frontendRoot = path.resolve(path.dirname(workerPath), '../..');

function workers(task, count, connectionString, extra = {}, onGate = async () => {}) {
  return new Promise((resolve, reject) => {
    const children = [];
    const results = Array(count);
    let ready = 0;
    let gates = 0;
    let exits = 0;
    let done = false;
    const fail = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const child of children) if (child.exitCode === null) child.kill();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error(`Timed out waiting for ${task} workers`)), 60_000);
    for (let i = 0; i < count; i++) {
      const env = { ...process.env, ...extra, DATABASE_URL: connectionString, NODE_ENV: 'test' };
      for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID', 'TELEGRAM_VIP_CHANNEL_ID', 'PLUSVIBE_API_KEY', 'OLLAMA_API_KEY', 'AI_LLM_API_KEY']) delete env[key];
      const child = fork(workerPath, [task], { cwd: frontendRoot, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      children.push(child);
      let output = '';
      child.stdout.on('data', (part) => { output += part; });
      child.stderr.on('data', (part) => { output += part; });
      child.on('error', fail);
      child.on('message', (message) => {
        if (done) return;
        if (message.event === 'ready') {
          ready++;
          if (ready === count) for (const worker of children) worker.send('start');
        } else if (message.event === 'gate') {
          gates++;
          if (gates === count) {
            Promise.resolve().then(onGate).then(() => {
              if (!done) for (const worker of children) worker.send('release');
            }).catch(fail);
          }
        } else if (message.event === 'result') {
          results[i] = message.result;
        } else if (message.event === 'failure') {
          fail(new Error(`Worker ${task} failed: ${message.error}\n${output}`));
        }
      });
      child.on('exit', (code) => {
        if (done) return;
        if (code !== 0 || results[i] === undefined) return fail(new Error(`Worker ${task} exited ${code}: ${output}`));
        exits++;
        if (exits === count) {
          done = true;
          clearTimeout(timer);
          resolve(results);
        }
      });
    }
  });
}

test('separate processes initialize, scan and approve atomically on PostgreSQL', { skip: !testUrl, timeout: 180_000 }, async () => {
  const parsed = new URL(testUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'only loopback PostgreSQL is allowed');
  assert.match(parsed.pathname, /^\/valuex_test_[a-z0-9_]+$/, 'use a dedicated valuex_test_* database');
  parsed.search = '';
  const schema = `valuex_test_${process.pid}_${Date.now()}`;
  const client = new Client({ connectionString: parsed.toString() });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const scoped = new URL(parsed);
    scoped.searchParams.set('options', `-c search_path=${schema}`);
    const startTime = String(Math.floor((Date.now() + 4 * 3600_000) / 1000));
    const sharedEnv = { VALUEX_TEST_START: startTime };

    // No table or row exists yet: concurrent processes must all update the same initial state.
    await workers('increment', 4, scoped.toString(), sharedEnv);
    let state = (await client.query("SELECT payload FROM valuex_app_storage WHERE store_key = 'main'")).rows[0].payload;
    assert.equal(state.aiAutopilot.totalGeneratedCount, 4);

    await workers('prepare', 1, scoped.toString(), sharedEnv);
    const scans = await workers('scan', 2, scoped.toString(), { ...sharedEnv, VALUEX_TEST_GATE: 'model', VALUEX_TEST_FORCE: 'true' });
    assert.equal(scans.reduce((sum, item) => sum + item.createdCount, 0), 1);
    state = (await client.query("SELECT payload FROM valuex_app_storage WHERE store_key = 'main'")).rows[0].payload;
    assert.equal(state.predictions.length, 1);
    assert.equal(state.aiDrafts.length, 0);
    assert.equal(state.aiAutopilot.totalGeneratedCount, 1);

    await workers('prepare', 1, scoped.toString(), sharedEnv);
    const draftRun = await workers('scan', 1, scoped.toString(), { ...sharedEnv, VALUEX_TEST_FORCE: 'false' });
    assert.equal(draftRun[0].createdCount, 1);
    state = (await client.query("SELECT payload FROM valuex_app_storage WHERE store_key = 'main'")).rows[0].payload;
    const draftId = state.aiDrafts[0].id;
    const approvals = await workers('approve', 2, scoped.toString(), { ...sharedEnv, VALUEX_TEST_GATE: 'line', VALUEX_TEST_DRAFT: draftId });
    assert.equal(approvals.filter((item) => item.ok).length, 1);
    assert.match(approvals.find((item) => !item.ok).error, /удалён|изменён|опубликован|не найден/i);
    state = (await client.query("SELECT payload FROM valuex_app_storage WHERE store_key = 'main'")).rows[0].payload;
    assert.equal(state.predictions.length, 1);
    assert.equal(state.aiDrafts.length, 0);

    // Pause and resume from another process while a model request is in flight.
    await workers('prepare', 1, scoped.toString(), sharedEnv);
    const cancelled = await workers('scan', 1, scoped.toString(),
      { ...sharedEnv, VALUEX_TEST_GATE: 'model', VALUEX_TEST_FORCE: 'true' },
      () => workers('pause-resume', 1, scoped.toString(), sharedEnv));
    assert.equal(cancelled[0].createdCount, 0);
    assert.match(cancelled[0].warning, /изменились во время сбора/);
    state = (await client.query("SELECT payload FROM valuex_app_storage WHERE store_key = 'main'")).rows[0].payload;
    assert.equal(state.predictions.length, 0);
    assert.equal(state.aiAutopilot.mode, 'MODERATION');

    // Two workers racing the same financial settlement must credit and notify once.
    const setup = (await workers('setup-settlement', 1, scoped.toString(), sharedEnv))[0];
    const settlements = await workers('settle', 2, scoped.toString(), {
      ...sharedEnv, VALUEX_TEST_GATE: 'settle', VALUEX_TEST_PREDICTION: setup.predictionId,
    });
    assert.equal(settlements.filter((item) => item.applied).length, 1);
    assert.equal(settlements.reduce((sum, item) => sum + item.compensatedUsers, 0), 1);
    assert.equal(settlements.reduce((sum, item) => sum + item.telegramSends, 0), 1);
    state = (await client.query("SELECT payload FROM valuex_app_storage WHERE store_key = 'main'")).rows[0].payload;
    assert.equal(state.users.find((item) => item.id === setup.userId).balanceRub, 500);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
