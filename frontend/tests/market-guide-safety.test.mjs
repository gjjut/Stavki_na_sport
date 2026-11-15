import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { explainMarketInPlainRussian } = await loadTypeScriptModule(
  new URL('../src/lib/plain-russian.ts', import.meta.url),
);
const guide = (title) => explainMarketInPlainRussian(title, 'Команда А', 'Команда Б');

test('both-teams-to-score no and integer under describe the actual condition and push', () => {
  assert.match(guide('Обе забьют: Нет').whenYouWin, /хотя бы одна команда не должна забить/i);
  const under = guide('Индивидуальный тотал 2 меньше (2.0)');
  assert.match(under.whereToFindInBk, /Команда Б/);
  assert.match(under.whenYouWin, /меньше 2/);
  assert.match(under.whenYouWin, /точном совпадении обычно предусмотрен возврат/);
  assert.doesNotMatch(under.whenYouWin, /не больше 2/);
});

test('quarter lines, compound or ambiguous markets are never simplified or assigned guessed lines', () => {
  for (const title of ['Тотал больше (2.25)', 'Фора 1 (-0.25)', 'Обе забьют: Нет и ТМ (3.5)', 'Тотал больше', 'Особый исход']) {
    const text = guide(title);
    assert.match(text.whenYouWin, /Условия зависят от точной формулировки/);
    assert.match(text.whenYouWin, /правила расчёта/);
    assert.ok(text.whereToFindInBk.includes(title));
  }
});

test('ordinary handicap and total descriptions remain conditional on bookmaker rules', () => {
  assert.match(guide('Фора 1 (-1)').whenYouWin, /нулевой разнице обычно предусмотрен возврат/);
  assert.match(guide('Тотал больше (2.5)').whenYouWin, /больше 2\.5/);
  assert.match(guide('Тотал больше (2.5)').whenYouWin, /выбранного букмекера/);
});
