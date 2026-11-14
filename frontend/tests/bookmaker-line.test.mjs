import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { hasSameVerifiedBookmakerQuote } = await loadTypeScriptModule(
  new URL('../src/server/bookmaker-line.ts', import.meta.url),
);

const quote = {
  externalFixtureId: 'fonbet_12345',
  sport: 'FOOTBALL',
  leagueName: 'Россия · Мир РПЛ',
  homeTeam: 'Команда А',
  awayTeam: 'Команда Б',
  matchStartsAt: '2026-11-13T16:00:00.000Z',
  bookmakerSource: 'Фонбет',
  suggestedMarket: 'Победа 1',
  suggestedOdds: 1.85,
};

test('a fresh quote matches when only harmless team-name casing or whitespace differs', () => {
  assert.equal(
    hasSameVerifiedBookmakerQuote(quote, {
      ...quote,
      homeTeam: '  команда а ',
      awayTeam: 'КОМАНДА Б',
      suggestedOdds: 1.851,
    }),
    true,
  );
});

test('publishing is rejected when the event or any selected quote field changes', () => {
  const changedFields = [
    { externalFixtureId: 'fonbet_54321' },
    { sport: 'HOCKEY' },
    { leagueName: 'Другая лига' },
    { homeTeam: 'Другая команда' },
    { awayTeam: 'Другая команда' },
    { matchStartsAt: '2026-11-13T16:01:00.000Z' },
    { bookmakerSource: 'БК Леон' },
    { suggestedMarket: 'Победа 2' },
    { suggestedOdds: 1.86 },
  ];

  for (const changed of changedFields) {
    assert.equal(
      hasSameVerifiedBookmakerQuote(quote, { ...quote, ...changed }),
      false,
      `expected changed field ${Object.keys(changed)[0]} to block publication`,
    );
  }
});

test('missing or invalid event data and odds fail closed', () => {
  assert.equal(
    hasSameVerifiedBookmakerQuote(quote, { ...quote, matchStartsAt: 'not a date' }),
    false,
  );
  assert.equal(
    hasSameVerifiedBookmakerQuote(quote, { ...quote, suggestedOdds: Number.NaN }),
    false,
  );
  assert.equal(
    hasSameVerifiedBookmakerQuote(quote, { ...quote, suggestedOdds: 1 }),
    false,
  );
  assert.equal(
    hasSameVerifiedBookmakerQuote(quote, { ...quote, externalFixtureId: '' }),
    false,
  );
});
