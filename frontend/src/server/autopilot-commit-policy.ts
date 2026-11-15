import { matchTeamPairOrder } from './team-names';
import { isLegacyStarterDemoPrediction } from './prediction-data-policy';
import type { AiAutopilotConfig, AiPredictionDraft, PredictionRecord, SportType } from './types';

type FixtureIdentity = {
  externalFixtureId?: string | null;
  sport: SportType;
  homeTeam: string;
  awayTeam: string;
  matchStartsAt: string;
};

export class AutopilotCommitConflict extends Error {
  constructor(public readonly reason: 'DUPLICATE' | 'CONFIG_CHANGED' | 'DRAFT_CHANGED', message: string) {
    super(message);
    this.name = 'AutopilotCommitConflict';
  }
}

/** Different feeds can identify the same sporting event differently. */
export function sameFixtureByNamesAndTime(a: FixtureIdentity, b: FixtureIdentity): boolean {
  if (a.sport !== b.sport || typeof a.homeTeam !== 'string' || typeof a.awayTeam !== 'string' ||
      typeof b.homeTeam !== 'string' || typeof b.awayTeam !== 'string' ||
      !matchTeamPairOrder(a.homeTeam, a.awayTeam, b.homeTeam, b.awayTeam, a.sport)) return false;
  const first = Date.parse(a.matchStartsAt);
  const second = Date.parse(b.matchStartsAt);
  return Number.isFinite(first) && Number.isFinite(second) && Math.abs(first - second) <= 36 * 60 * 60_000;
}

/** Must be called inside the same locked state mutation as insertion. */
export function assertNewAutopilotFixture(
  state: { predictions: PredictionRecord[]; aiDrafts: AiPredictionDraft[] },
  fixture: FixtureIdentity,
  ignoreDraftId?: string,
): void {
  const existing = [
    ...state.predictions.filter((p) => !isLegacyStarterDemoPrediction(p)),
    ...state.aiDrafts.filter((d) => d.id !== ignoreDraftId),
  ];
  if (existing.some((item) =>
    (fixture.externalFixtureId && item.externalFixtureId === fixture.externalFixtureId) ||
    sameFixtureByNamesAndTime(fixture, item),
  )) {
    throw new AutopilotCommitConflict('DUPLICATE', 'Это событие уже опубликовано или находится в черновиках.');
  }
}

const RUN_CONFIG_KEYS: ReadonlyArray<keyof AiAutopilotConfig> = [
  'mode', 'llmProvider', 'llmBaseUrl', 'llmApiKey', 'llmModel', 'sportsEnabled',
  'morningHourMsk', 'eveningHourMsk', 'maxPicksPerRun', 'minActiveOnStorefront',
  'minValueEdgePct', 'minAgentConfidencePct', 'defaultAiPriceRub', 'freeEveryNthPick',
  'insureAiPicks', 'autoSettleEnabled', 'openSourceResearchEnabled', 'requireAgentConsensus', 'runRevision',
];

/** Do not publish a result computed before an administrator changed the settings or paused the run. */
export function assertAutopilotConfigUnchanged(current: AiAutopilotConfig, snapshot: AiAutopilotConfig): void {
  if (RUN_CONFIG_KEYS.some((key) => JSON.stringify(current[key]) !== JSON.stringify(snapshot[key]))) {
    throw new AutopilotCommitConflict('CONFIG_CHANGED', 'Настройки автопилота изменились во время сбора; оставшиеся события не создавались.');
  }
}
