import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const {
  formatAdminMatchScanSummary,
  isAdminMutationIntent,
  isExplicitDraftApprovalIntent,
  isDraftOnlyMatchCollectionIntent,
  isMatchCollectionIntent,
  normalizeAdminAgentAction,
  resolveAdminAgentActions,
} = await loadTypeScriptModule(
  new URL('../src/server/ai-admin-chat-protocol.ts', import.meta.url),
);

test('empty model action for a match collection request routes to the server fallback', () => {
  const result = resolveAdminAgentActions(
    { actions: [], reply: 'Сбор и публикация уже начались.' },
    'Собери 3 матча и опубликуй на витрину',
  );

  assert.equal(result.collectionIntent, true);
  assert.deepEqual(result.actionsToExecute, []);
  assert.equal(result.shouldRunCollectionFallback, true);
});

test('detects mutation requests so actionless model replies cannot claim a side effect', () => {
  assert.equal(isAdminMutationIntent('Опубликуй сводку в Telegram'), true);
  assert.equal(isAdminMutationIntent('Создай прогноз на матч A — B'), true);
  assert.equal(isAdminMutationIntent('Как изменить стандартную цену?'), false);
  assert.equal(isAdminMutationIntent('Опубликована ли сводка в Telegram?'), false);
  assert.equal(isAdminMutationIntent('Не публикуй прогнозы'), false);
  assert.equal(isAdminMutationIntent('Не нужно менять цену'), false);
  assert.equal(isAdminMutationIntent('Можешь опубликовать прогнозы?'), false);
  assert.equal(isMatchCollectionIntent('Можешь опубликовать прогнозы?'), false);
  assert.equal(isMatchCollectionIntent('Собери 3 матча и опубликуй на витрину'), true);
  assert.equal(isMatchCollectionIntent('Собери прогнозы, но не публикуй'), true);
  assert.equal(isMatchCollectionIntent('Не публикуй прогнозы'), false);
  assert.equal(isMatchCollectionIntent('Не собирай прогнозы'), false);
  assert.equal(isMatchCollectionIntent('Пожалуйста, не собирай прогнозы'), false);
  assert.equal(isMatchCollectionIntent('Опубликуй прогнозы, но не создавай новые'), false);
  assert.equal(isDraftOnlyMatchCollectionIntent('Собери прогнозы без публикации'), true);
  assert.equal(isDraftOnlyMatchCollectionIntent('Собери в черновики и не публикуй'), true);
  assert.equal(isMatchCollectionIntent('Сколько прогнозов опубликовано?'), false);
});

test('an unrelated mutation is not executed for a match collection request', () => {
  const result = resolveAdminAgentActions(
    {
      actions: [
        { tool: 'update_storefront_pricing', args: { defaultSinglePriceRub: 10 } },
      ],
    },
    'Запусти сбор прогнозов и опубликуй их',
  );

  assert.deepEqual(result.actionsToExecute, []);
  assert.equal(result.shouldRunCollectionFallback, true);
});

test('recognized scan tool-call aliases execute once without fallback', () => {
  const result = resolveAdminAgentActions(
    {
      tool_calls: [
        {
          type: 'function',
          function: {
            name: 'collect_and_publish_matches',
            arguments: '{"count":3,"publishImmediately":true}',
          },
        },
      ],
    },
    'Собери матчи и опубликуй прогнозы',
  );

  assert.equal(result.shouldRunCollectionFallback, false);
  assert.equal(result.actionsToExecute.length, 1);
  assert.equal(result.actionsToExecute[0].tool, 'scan_and_publish_matches');
  assert.equal(result.actionsToExecute[0].args.count, 3);
});

test('the server overrides model publication requests when the owner asked for drafts only', () => {
  const result = resolveAdminAgentActions(
    {
      actions: [
        {
          tool: 'scan_and_publish_matches',
          args: { count: 2, publishImmediately: true },
        },
      ],
    },
    'Собери два прогноза, но не публикуй — только в черновики',
  );

  assert.equal(result.shouldRunCollectionFallback, false);
  assert.equal(result.actionsToExecute[0].args.publishImmediately, false);
});

test('draft questions and draft-only scans cannot approve forecasts implicitly', () => {
  const listOnly = resolveAdminAgentActions(
    { actions: [{ tool: 'approve_all_drafts', args: {} }] },
    'Покажи черновики',
  );
  assert.deepEqual(listOnly.actionsToExecute, []);
  assert.equal(listOnly.invalidActionCount, 1);

  const draftOnly = resolveAdminAgentActions(
    {
      actions: [
        { tool: 'scan_and_publish_matches', args: { count: 2, publishImmediately: true } },
        { tool: 'approve_all_drafts', args: {} },
      ],
    },
    'Собери два прогноза только в черновики',
  );
  assert.equal(draftOnly.actionsToExecute.length, 1);
  assert.equal(draftOnly.actionsToExecute[0].tool, 'scan_and_publish_matches');
  assert.equal(draftOnly.actionsToExecute[0].args.publishImmediately, false);
  assert.equal(draftOnly.invalidActionCount, 1);
});

test('draft approval is allowed only after an explicit positive approval request', () => {
  const result = resolveAdminAgentActions(
    { actions: [{ tool: 'approve_all_drafts', args: {} }] },
    'Одобри все черновики',
  );
  assert.equal(result.actionsToExecute[0].tool, 'approve_all_drafts');
  assert.equal(result.invalidActionCount, 0);
  assert.equal(isExplicitDraftApprovalIntent('Опубликуй черновики'), true);
  assert.equal(isExplicitDraftApprovalIntent('Не надо публиковать черновики'), false);
  assert.equal(isExplicitDraftApprovalIntent('Покажи черновики, не одобряй их'), false);
  assert.equal(isExplicitDraftApprovalIntent('Можно ли опубликовать черновики?'), false);
  assert.equal(isExplicitDraftApprovalIntent('Можешь опубликовать черновики?'), false);
  const approvalQuestion = resolveAdminAgentActions(
    { actions: [{ tool: 'approve_all_drafts', args: {} }] },
    'Можно ли опубликовать черновики?',
  );
  assert.deepEqual(approvalQuestion.actionsToExecute, []);

  const negative = resolveAdminAgentActions(
    { actions: [{ tool: 'approve_all_drafts', args: {} }] },
    'Не надо публиковать черновики',
  );
  assert.deepEqual(negative.actionsToExecute, []);
  assert.equal(negative.invalidActionCount, 1);
});

test('mutating actions are suppressed for informational questions while requested research remains available', () => {
  const question = resolveAdminAgentActions(
    {
      actions: [
        { tool: 'update_storefront_pricing', args: { defaultSinglePriceRub: 10 } },
      ],
    },
    'Сколько стоит прогноз?',
  );
  assert.deepEqual(question.actionsToExecute, []);
  assert.equal(question.invalidActionCount, 1);

  const negatedCommand = resolveAdminAgentActions(
    { actions: [{ tool: 'update_storefront_pricing', args: { defaultSinglePriceRub: 10 } }] },
    'Не публикуй прогнозы',
  );
  assert.deepEqual(negatedCommand.actionsToExecute, []);

  const research = resolveAdminAgentActions(
    { actions: [{ tool: 'search_open_sources', args: { query: 'РПЛ травмы' } }] },
    'Проверь открытые источники по травмам в РПЛ',
  );
  assert.equal(research.actionsToExecute[0].tool, 'search_open_sources');
  assert.equal(research.invalidActionCount, 0);
});

test('a scan tool call is not executed for a non-collection question', () => {
  const result = resolveAdminAgentActions(
    { actions: [{ tool: 'scan_and_publish_matches', args: { count: 3 } }] },
    'Сколько прогнозов уже опубликовано?',
  );

  assert.deepEqual(result.actionsToExecute, []);
  assert.equal(result.invalidActionCount, 1);
});

test('manual result settlement is not an AI-chat action; only source-verified auto settlement is supported', () => {
  assert.equal(normalizeAdminAgentAction({ tool: 'settle_prediction_manual' }), null);
});

test('direct create_prediction is rejected instead of bypassing verified selection', () => {
  const result = resolveAdminAgentActions(
    {
      actions: [
        {
          tool: 'create_prediction',
          args: { homeTeam: 'A', awayTeam: 'B', fixedOdds: 1.85 },
        },
      ],
    },
    'Создай прогноз на матч A — B',
  );

  assert.equal(result.collectionIntent, false);
  assert.equal(result.invalidActionCount, 1);
  assert.deepEqual(result.actionsToExecute, []);
  assert.equal(result.shouldRunCollectionFallback, false);
  assert.equal(normalizeAdminAgentAction({ tool: 'create_prediction' }), null);
});

test('zero-result scans report completion without claiming publication', () => {
  const summary = formatAdminMatchScanSummary({
    feedSource: 'Локальный резервный стенд (нет доступа к сети)',
    scannedCount: 0,
    createdCount: 0,
    publishImmediately: true,
  });

  assert.match(summary, /Сканирование завершено/);
  assert.match(summary, /опубликовано на витрину прогнозов: 0/);
  assert.match(summary, /новых прогнозов не создано/);
  assert.doesNotMatch(summary, /публикация началась|опубликовано на витрину прогнозов: [1-9]/i);
});

test('zero-result draft scans say no draft was created and no publication occurred', () => {
  const summary = formatAdminMatchScanSummary({
    feedSource: 'Фонбет РФ (прямая линия БК)',
    scannedCount: 4,
    createdCount: 0,
    publishImmediately: false,
  });

  assert.match(summary, /создано черновиков: 0/);
  assert.match(summary, /автоматической публикации на витрину не было/);
  assert.match(summary, /новых прогнозов не создано/);
});

test('natural "give me a prediction" phrasings are collection intents', () => {
  const collectionPhrases = [
    'дай новый прогноз',
    'дай прогноз',
    'дай прогнозы на сегодня',
    'дай 3 прогноза',
    'дай матч',
    'нужен новый прогноз',
    'нужны прогнозы на сегодня',
    'хочу новый прогноз',
    'сделай прогноз',
    'придумай прогноз',
    'подготовь прогнозы на вечер',
    'новый прогноз',
    'свежие прогнозы',
  ];
  for (const phrase of collectionPhrases) {
    assert.equal(isMatchCollectionIntent(phrase), true, phrase);
  }
});

test('model scan action for "дай новый прогноз" executes without rejection', () => {
  const result = resolveAdminAgentActions(
    {
      actions: [
        { tool: 'scan_and_publish_matches', args: { count: 3, publishImmediately: true } },
      ],
      reply: 'Запускаю сбор прогнозов.',
    },
    'дай новый прогноз',
  );

  assert.equal(result.collectionIntent, true);
  assert.equal(result.invalidActionCount, 0);
  assert.equal(result.shouldRunCollectionFallback, false);
  assert.deepEqual(result.actionsToExecute, [
    { tool: 'scan_and_publish_matches', args: { count: 3, publishImmediately: true } },
  ]);
});

test('questions and negations stay out of collection and mutation intents', () => {
  const nonCollection = [
    'какой прогноз на сегодня?',
    'что по прогнозам?',
    'можно прогноз?',
    'покажи прогнозы',
    'не собирай прогнозы',
    'не дай прогноз',
    'не нужно собирать прогнозы',
    'сколько прогнозов опубликовано?',
    'нужен ли прогноз?',
    'дай статистику',
    'не хочу прогноз',
  ];
  for (const phrase of nonCollection) {
    assert.equal(isMatchCollectionIntent(phrase), false, phrase);
  }
  assert.equal(isAdminMutationIntent('дай сводку в телеграм'), true);
  assert.equal(isAdminMutationIntent('не дай сводку в телеграм'), false);
  assert.equal(isMatchCollectionIntent('Создай прогноз на матч A — B'), false);
  assert.equal(isMatchCollectionIntent('Собери прогнозы, но не нужно публиковать'), true);
  assert.equal(isDraftOnlyMatchCollectionIntent('Собери прогнозы, но не нужно публиковать'), true);
});
