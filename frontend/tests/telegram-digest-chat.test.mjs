import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const cwd = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-chat-test-'));
const envNames = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID', 'TELEGRAM_VIP_CHANNEL_ID', 'PLUSVIBE_API_KEY', 'OLLAMA_API_KEY', 'AI_LLM_API_KEY', 'NEXT_PUBLIC_SITE_URL'];
const env = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
for (const name of envNames) delete process.env[name];
process.chdir(temp);
const originalFetch = global.fetch;
const database = require('../src/server/database.ts');
const { mutateState, readState } = database;
const { buildDailyDigestHtml, broadcastDailyDigestToTelegram } = require('../src/server/ai-autopilot.ts');
const { processAdminAiChatTurn } = require('../src/server/ai-admin-chat.ts');
after(() => {
  global.fetch = originalFetch;
  process.chdir(cwd);
  for (const name of envNames) {
    if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
  }
  rmSync(temp, { recursive: true, force: true });
});

const token = '123456789:TEST_TELEGRAM_SECRET';
const quickPrompt = 'Опубликуй красивую сводку дня и статистики в наш Telegram-канал';
const common = {
  id: 'a', slug: 'a', sport: 'FOOTBALL', leagueName: 'Лига', homeTeam: 'A <script>', awayTeam: 'B & C',
  matchStartsAt: '2099-01-01T15:00:00.000Z', matchStatus: 'UPCOMING', matchLifecycleStatus: 'SCHEDULED',
  stakeUnits: 2, stakePercent: 2, fixedOdds: 1.9, selectionTitle: 'Победа 1',
  resultStatus: 'PENDING', accessTier: 'FREE', singlePriceRub: null, insuredOnLoss: false,
  profitUnits: null, profitPercent: null, settledAt: null, finalScore: null,
  verificationHash: 'fixture', oddsLockedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
};
const verified = {
  ...common, id: 'settled', homeTeam: 'Прошлый матч', awayTeam: 'Команда',
  matchStartsAt: '2026-11-12T11:00:00.000Z', matchStatus: 'FINISHED', matchLifecycleStatus: 'FINISHED',
  finalScoreVerified: true, finalScoreVerifiedSources: ['Source A', 'Source B'],
  matchVerificationConflict: false, matchVerifiedAt: '2026-11-12T12:30:00.000Z',
  matchVerificationSource: 'Source A + Source B', liveHomeScore: 2, liveAwayScore: 1,
  finalScoreIsOvertime: false, resultStatus: 'WIN', settledAt: '2026-11-12T12:31:00.000Z',
  profitUnits: 1.8, profitPercent: 1.8, finalScore: '2:1',
};
const unverified = { ...verified, id: 'unverified', finalScoreVerified: false, profitUnits: 999, profitPercent: 999 };
const cancelled = { ...common, id: 'cancelled', homeTeam: 'Отменённая команда', matchLifecycleStatus: 'CANCELLED' };

async function resetState(provider = 'PLUSVIBE') {
  await mutateState((state) => {
    state.settings.brandName = 'A & <B>';
    state.settings.telegramBotToken = token;
    state.settings.telegramChannelId = '@fixture_channel';
    state.predictions = [structuredClone(common), structuredClone(verified), structuredClone(unverified), structuredClone(cancelled)];
    state.aiChatMessages = [];
    state.aiLogs = [];
    state.promoCodes = [];
    state.aiAutopilot.mode = 'OFF';
    state.aiAutopilot.llmProvider = provider;
    state.aiAutopilot.llmApiKey = provider === 'BUILTIN_QUANT' ? '' : 'sk-pv-TEST_AI_SECRET';
    state.aiAutopilot.llmBaseUrl = 'https://plusvibeapi.ru/v1';
    state.aiAutopilot.llmModel = 'saved-test-model';
  });
}

const response = (json, status = 200) => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });

test('digest escapes dynamic HTML, uses verified results only and shows upcoming dates truthfully', () => {
  const html = buildDailyDigestHtml({
    settings: { brandName: 'A & <B>', defaultSinglePriceRub: 790 },
    predictions: [common, verified, unverified, cancelled],
  }, Date.parse('2026-11-12T10:00:00Z'));
  assert.match(html, /A &amp; &lt;B&gt;/);
  assert.match(html, /A &lt;script&gt; — B &amp; C/);
  assert.match(html, /Побед: <b>1<\/b> · ❌ Поражений: <b>0/);
  assert.match(html, /100\.0%/);
  assert.match(html, /\+1\.80 ед\./);
  assert.match(html, /Ближайшие события/);
  assert.doesNotMatch(html, /999|START15|Отменённая команда|Сегодня на витрине|<script>/);
});

test('the exact quick command bypasses the LLM and confirms one real tool result', async () => {
  await resetState();
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    assert.ok(url.endsWith('/sendMessage'), `Unexpected external call: ${url}`);
    return response({ ok: true, result: { message_id: 42 } });
  };
  const result = await processAdminAiChatTurn(quickPrompt);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.chat_id, '@fixture_channel');
  assert.match(calls[0].body.text, /A &amp; &lt;B&gt;/);
  assert.match(calls[0].body.text, /A &lt;script&gt; — B &amp; C/);
  assert.match(result.assistantMessage.content, /опубликована сводка/);
  assert.equal(result.assistantMessage.executedActions[0].ok, true);
  assert.equal(result.assistantMessage.replySource, 'SERVER');
  assert.equal(result.assistantMessage.modelLabel, undefined);
  const state = await readState();
  assert.equal(state.aiChatMessages.length, 2);
  assert.equal(state.aiLogs.length, 1);
  assert.doesNotMatch(JSON.stringify(state.aiChatMessages), /TEST_TELEGRAM_SECRET/);
});

test('lost Telegram response is saved as UNKNOWN and never called a failed command', async () => {
  await resetState();
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new TypeError('fetch failed', { cause: Object.assign(new Error(`secret ${token}`), { code: 'ECONNRESET' }) });
  };
  const result = await processAdminAiChatTurn(quickPrompt);
  assert.equal(calls, 1);
  const action = result.assistantMessage.executedActions[0];
  assert.equal(action.ok, false);
  assert.equal(action.outcome, 'unknown');
  assert.match(result.assistantMessage.content, /не подтверждён/);
  assert.match(result.assistantMessage.content, /проверьте канал перед повтором/i);
  assert.doesNotMatch(result.assistantMessage.content, /Команда не выполнена|TEST_TELEGRAM_SECRET/);
  assert.equal((await readState()).aiLogs.length, 0);
});

test('an explicit Telegram rejection is reported as rejected without retry', async () => {
  await resetState();
  let calls = 0;
  global.fetch = async () => { calls++; return response({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }, 400); };
  const result = await processAdminAiChatTurn(quickPrompt);
  assert.equal(calls, 1);
  assert.equal(result.assistantMessage.executedActions[0].outcome, undefined);
  assert.match(result.assistantMessage.content, /Команда не выполнена/);
  assert.match(result.assistantMessage.content, /не нашёл канал/);
});

test('the built-in assistant greeting uses the PredictLab product name without a network call', async () => {
  await resetState('BUILTIN_QUANT');
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Unexpected network'); };
  const result = await processAdminAiChatTurn('привет');
  assert.match(result.assistantMessage.content, /PredictLab/);
  assert.doesNotMatch(result.assistantMessage.content, /VALUEX/);
  assert.equal(calls, 0);
});

test('negative/question fallback never posts or changes a price', async () => {
  await resetState('BUILTIN_QUANT');
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Unexpected network'); };
  const initialPrice = (await readState()).settings.defaultSinglePriceRub;
  for (const prompt of [
    'Не публикуй сводку дня в телеграм',
    'Можно ли опубликовать сводку дня в телеграм?',
    'Не ставь цену 790 рублей',
    'Какая цена 790 рублей?',
    'Не ищи новости РПЛ',
  ]) {
    const result = await processAdminAiChatTurn(prompt);
    assert.equal(result.assistantMessage.executedActions, undefined, prompt);
  }
  assert.equal((await readState()).settings.defaultSinglePriceRub, initialPrice);
  assert.equal(calls, 0);
});

test('fallback creates the explicitly requested promo limit and does not overwrite existing codes', async () => {
  await resetState('BUILTIN_QUANT');
  global.fetch = async () => { throw new Error('Unexpected network'); };
  const prompt = 'Создай промокод VIP20 на скидку 20% на 150 активаций';
  const first = await processAdminAiChatTurn(prompt);
  assert.equal(first.assistantMessage.executedActions[0].ok, true);
  const promo = (await readState()).promoCodes[0];
  assert.equal(promo.code, 'VIP20');
  assert.equal(promo.discountPercent, 20);
  assert.equal(promo.maxUses, 150);
  const second = await processAdminAiChatTurn(prompt);
  assert.equal(second.assistantMessage.executedActions[0].ok, false);
  assert.match(second.assistantMessage.content, /уже существует/);
  assert.equal((await readState()).promoCodes.length, 1);
});

test('an ambiguous model-targeted deletion does not pick the first matching match', async () => {
  await resetState();
  await mutateState((state) => {
    state.predictions = [
      { ...common, id: 'first', homeTeam: 'Реал', awayTeam: 'Команда 1' },
      { ...common, id: 'second', homeTeam: 'Реал', awayTeam: 'Команда 2' },
    ];
  });
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    assert.match(url, /chat\/completions$/);
    return response({ choices: [{ message: { content: JSON.stringify({ actions: [
      { tool: 'update_or_delete_prediction', args: { action: 'DELETE', predictionIdOrTeamQuery: 'Реал' } },
    ], reply: 'Готово' }) } }] });
  };
  const result = await processAdminAiChatTurn('Удали прогноз Реал');
  assert.equal(calls, 1);
  assert.equal(result.assistantMessage.executedActions[0].ok, false);
  assert.match(result.assistantMessage.content, /несколько матчей/);
  assert.deepEqual((await readState()).predictions.map((p) => p.id), ['first', 'second']);
});

test('a logging failure after Telegram confirmation does not turn a successful publication into a failed send', async () => {
  await resetState();
  const originalMutate = database.mutateState;
  database.mutateState = async () => { throw new database.StorageUnavailableError('offline'); };
  let calls = 0;
  global.fetch = async () => { calls++; return response({ ok: true, result: { message_id: 73 } }); };
  try {
    const result = await broadcastDailyDigestToTelegram();
    assert.equal(calls, 1);
    assert.equal(result.sent, true);
    assert.equal(result.messageId, 73);
    assert.match(result.warning, /подтвердил публикацию.*журнал/);
  } finally { database.mutateState = originalMutate; }
});

test('a confirmed Telegram post remains confirmed when chat-history saving fails', async () => {
  await resetState();
  const originalMutate = database.mutateState;
  let writes = 0;
  database.mutateState = async (...args) => {
    if (++writes === 2) throw new database.StorageUnavailableError('offline');
    return originalMutate(...args);
  };
  let calls = 0;
  global.fetch = async () => { calls++; return response({ ok: true, result: { message_id: 74 } }); };
  try {
    const result = await processAdminAiChatTurn(quickPrompt);
    assert.equal(calls, 1);
    assert.equal(writes, 2);
    assert.equal(result.historyStatus, 'unconfirmed');
    assert.equal(result.assistantMessage.executedActions[0].ok, true);
    assert.match(result.assistantMessage.content, /опубликована сводка/);
    assert.match(result.assistantMessage.content, /сохранение истории чата не подтверждено/);
    assert.match(result.assistantMessage.content, /Перед повтором.*Telegram-канал/);
    assert.doesNotMatch(result.assistantMessage.content, /Команда не выполнена/);
    const state = await readState();
    assert.equal(state.aiChatMessages.length, 0);
    assert.equal(state.aiLogs.length, 1);
  } finally { database.mutateState = originalMutate; }
});

test('unknown Telegram outcome stays unknown if its chat history cannot be saved either', async () => {
  await resetState();
  const originalMutate = database.mutateState;
  database.mutateState = async () => { throw new database.StorageUnavailableError('offline'); };
  let calls = 0;
  global.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
  try {
    const result = await processAdminAiChatTurn(quickPrompt);
    assert.equal(calls, 1);
    assert.equal(result.historyStatus, 'unconfirmed');
    assert.equal(result.assistantMessage.executedActions[0].outcome, 'unknown');
    assert.match(result.assistantMessage.content, /Итог.*не подтверждён/);
    assert.match(result.assistantMessage.content, /проверьте канал перед повтором/i);
    assert.match(result.assistantMessage.content, /сохранение истории чата не подтверждено/);
    assert.doesNotMatch(result.assistantMessage.content, /Команда не выполнена/);
  } finally { database.mutateState = originalMutate; }
});
