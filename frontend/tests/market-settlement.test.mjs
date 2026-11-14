import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { evaluateMarketByScore } = await loadTypeScriptModule(
  new URL('../src/server/market-settlement.ts', import.meta.url),
);

test('market calculation separates regulation results from match-winner results', () => {
  assert.equal(evaluateMarketByScore('Победа 1', 2, 1, true, 'FOOTBALL'), 'LOSS');
  assert.equal(evaluateMarketByScore('Победа 1 в матче', 2, 1, true, 'HOCKEY'), 'WIN');
  assert.equal(evaluateMarketByScore('Победа 1 (основное время)', 2, 1, true, 'HOCKEY'), 'LOSS');
  assert.equal(evaluateMarketByScore('Победа 1 в матче', 2, 1, true, 'FOOTBALL'), null);
});

test('standard totals, team totals, and handicaps settle only supported whole/half lines', () => {
  assert.equal(evaluateMarketByScore('Тотал больше (2.5)', 2, 1, false, 'FOOTBALL'), 'WIN');
  assert.equal(evaluateMarketByScore('Тотал меньше (3.0)', 1, 1, false, 'FOOTBALL'), 'WIN');
  assert.equal(evaluateMarketByScore('Тотал больше (2.0)', 1, 1, false, 'FOOTBALL'), 'PUSH');
  assert.equal(evaluateMarketByScore('Индивидуальный тотал 1 больше (1.5)', 2, 0, false, 'FOOTBALL'), 'WIN');
  assert.equal(evaluateMarketByScore('ИТБ2 (0.5)', 0, 1, false, 'FOOTBALL'), 'WIN');
  assert.equal(evaluateMarketByScore('Фора 1 (-1.0)', 2, 1, false, 'FOOTBALL'), 'PUSH');
  assert.equal(evaluateMarketByScore('Фора 2 (+0.5)', 2, 1, false, 'FOOTBALL'), 'LOSS');
});

test('unsupported quarter lines and compound markets fail closed', () => {
  assert.equal(evaluateMarketByScore('Тотал больше (2.25)', 3, 0, false, 'FOOTBALL'), null);
  assert.equal(evaluateMarketByScore('Фора 1 (-0.25)', 1, 0, false, 'FOOTBALL'), null);
  assert.equal(evaluateMarketByScore('Победа 1 и тотал больше (2.5)', 3, 0, false, 'FOOTBALL'), null);
  assert.equal(evaluateMarketByScore('Обе забьют: Да и ТМ (3.5)', 2, 2, false, 'FOOTBALL'), 'LOSS');
  assert.equal(evaluateMarketByScore('Обе забьют: Нет', 0, 2, false, 'FOOTBALL'), 'WIN');
});

test('regulation-time totals stay unresolved after overtime; a regulation draw can settle handicap', () => {
  assert.equal(evaluateMarketByScore('Обе забьют: Да', 2, 1, true, 'FOOTBALL'), null);
  assert.equal(evaluateMarketByScore('Тотал больше (2.5)', 2, 1, true, 'HOCKEY'), null);
  assert.equal(evaluateMarketByScore('Фора 1 (0)', 2, 1, true, 'HOCKEY'), 'PUSH');
  assert.equal(evaluateMarketByScore('1X', 2, 1, true, 'HOCKEY'), 'WIN');
});

test('invalid scores and unrecognized markets are not settled', () => {
  assert.equal(evaluateMarketByScore('Победа 1', -1, 0, false, 'FOOTBALL'), null);
  assert.equal(evaluateMarketByScore('Специальная ставка без структуры', 2, 1, false, 'FOOTBALL'), null);
});
