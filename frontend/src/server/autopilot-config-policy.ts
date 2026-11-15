import { randomUUID } from 'node:crypto';
import {
  assertLlmKeyMatchesProvider,
  assertLlmKeyScope,
  normalizeLlmBaseUrl,
  validateLlmProvider,
} from './llm-config-policy';
import type { AiAutopilotConfig, AiAutopilotMode, SportType } from './types';

const EDITABLE = new Set([
  'mode', 'llmProvider', 'llmBaseUrl', 'llmApiKey', 'llmModel', 'sportsEnabled',
  'morningHourMsk', 'eveningHourMsk', 'maxPicksPerRun', 'minActiveOnStorefront',
  'minValueEdgePct', 'minAgentConfidencePct', 'defaultAiPriceRub', 'freeEveryNthPick',
  'insureAiPicks', 'autoSettleEnabled', 'openSourceResearchEnabled',
]);
const SPORTS: readonly SportType[] = ['FOOTBALL', 'HOCKEY', 'TENNIS', 'ESPORTS', 'BASKETBALL', 'MMA'];

/** Validate an explicit owner-editable patch; counters, timestamps and safety gates are never writable. */
export function applyAutopilotConfigPatch(
  current: AiAutopilotConfig,
  value: unknown,
): { config: AiAutopilotConfig; keySavedNow: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Передайте настройки автопилота объектом.');
  }
  const patch = value as Record<string, unknown>;
  if (Object.keys(patch).length === 0 || Object.keys(patch).some((key) => !EDITABLE.has(key))) {
    throw new Error('Переданы неизвестные или служебные поля настроек автопилота.');
  }
  const next = { ...current };
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key);
  const num = (key: string, min: number, max: number, integer = true): number => {
    const n = patch[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isSafeInteger(n))) {
      throw new Error(`Некорректное значение «${key}»: допустимо ${min}–${max}${integer ? ', целое число' : ''}.`);
    }
    return n;
  };
  const bool = (key: string): boolean => {
    if (typeof patch[key] !== 'boolean') throw new Error(`«${key}» должно быть переключателем да/нет.`);
    return patch[key] as boolean;
  };
  const text = (key: string, max: number): string => {
    const v = patch[key];
    if (typeof v !== 'string' || v.length > max) throw new Error(`Некорректное значение «${key}».`);
    return v.trim();
  };

  if (has('mode')) {
    if (typeof patch.mode !== 'string' || !['OFF', 'MODERATION', 'FULL_AUTOPILOT'].includes(patch.mode)) {
      throw new Error('Неизвестный режим автопилота.');
    }
    next.mode = patch.mode as AiAutopilotMode;
  }
  if (has('sportsEnabled')) {
    if (!Array.isArray(patch.sportsEnabled) || patch.sportsEnabled.length === 0 ||
        patch.sportsEnabled.length > SPORTS.length ||
        patch.sportsEnabled.some((sport) => typeof sport !== 'string' || !SPORTS.includes(sport as SportType)) ||
        new Set(patch.sportsEnabled).size !== patch.sportsEnabled.length) {
      throw new Error('Выберите хотя бы одну поддерживаемую дисциплину без повторов.');
    }
    next.sportsEnabled = [...patch.sportsEnabled] as SportType[];
  }
  if (has('morningHourMsk')) next.morningHourMsk = num('morningHourMsk', 0, 23);
  if (has('eveningHourMsk')) next.eveningHourMsk = num('eveningHourMsk', 0, 23);
  if ((has('morningHourMsk') || has('eveningHourMsk') || patch.mode === 'FULL_AUTOPILOT') &&
      next.morningHourMsk >= next.eveningHourMsk) {
    throw new Error('Утренний слот должен быть раньше вечернего.');
  }
  if (has('maxPicksPerRun')) next.maxPicksPerRun = num('maxPicksPerRun', 1, 8);
  if (has('minActiveOnStorefront')) next.minActiveOnStorefront = num('minActiveOnStorefront', 0, 50);
  if (has('minValueEdgePct')) next.minValueEdgePct = num('minValueEdgePct', 0, 20, false);
  if (has('minAgentConfidencePct')) next.minAgentConfidencePct = num('minAgentConfidencePct', 0, 100, false);
  if (has('defaultAiPriceRub')) next.defaultAiPriceRub = num('defaultAiPriceRub', 50, 10_000_000);
  if (has('freeEveryNthPick')) next.freeEveryNthPick = num('freeEveryNthPick', 0, 20);
  if (has('insureAiPicks')) next.insureAiPicks = bool('insureAiPicks');
  if (has('autoSettleEnabled')) next.autoSettleEnabled = bool('autoSettleEnabled');
  if (has('openSourceResearchEnabled')) next.openSourceResearchEnabled = bool('openSourceResearchEnabled');

  if (has('llmProvider')) {
    const provider = text('llmProvider', 40);
    validateLlmProvider(provider);
    next.llmProvider = provider;
  }
  if (has('llmBaseUrl')) next.llmBaseUrl = text('llmBaseUrl', 2048);
  if (has('llmModel')) next.llmModel = text('llmModel', 200);
  const submittedKey = has('llmApiKey') ? text('llmApiKey', 4096) : '';
  if (submittedKey && (submittedKey.length <= 8 || /\s/.test(submittedKey))) {
    throw new Error('API-ключ выглядит некорректно; он не сохранён.');
  }
  const connectionTouched = has('llmProvider') || has('llmBaseUrl') || Boolean(submittedKey);
  if (connectionTouched && next.llmProvider !== 'BUILTIN_QUANT') {
    next.llmBaseUrl = normalizeLlmBaseUrl(next.llmBaseUrl, next.llmProvider);
    assertLlmKeyScope(current, next, submittedKey);
    assertLlmKeyMatchesProvider(submittedKey || current.llmApiKey, next.llmProvider);
  }
  if (has('llmModel') && next.llmProvider !== 'BUILTIN_QUANT' && !next.llmModel) {
    throw new Error('Укажите точный ID модели.');
  }
  next.llmApiKey = submittedKey || current.llmApiKey;
  // Every saved edit invalidates in-flight scans, including a pause followed by
  // a quick resume or another click on an already active pause.
  next.runRevision = randomUUID();
  // A request cannot disable the fail-closed consensus gate.
  next.requireAgentConsensus = true;
  return { config: next, keySavedNow: Boolean(submittedKey) };
}
