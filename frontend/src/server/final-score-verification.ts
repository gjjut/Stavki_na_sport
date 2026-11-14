import type { PredictionRecord, ResultStatus, SportType } from './types';

type FinalScoreFields = Pick<
  PredictionRecord,
  | 'matchLifecycleStatus'
  | 'finalScoreVerified'
  | 'finalScoreVerifiedSources'
  | 'matchVerificationConflict'
  | 'matchVerifiedAt'
  | 'matchVerificationSource'
  | 'liveHomeScore'
  | 'liveAwayScore'
  | 'finalScoreIsOvertime'
  | 'sport'
  | 'selectionTitle'
>;

type SettledResultFields = Pick<
  PredictionRecord,
  'resultStatus' | 'settledAt' | 'profitUnits' | 'profitPercent' | 'finalScore' | 'stakeUnits' | 'fixedOdds'
>;

type MarketEvaluator = (
  selectionTitle: string,
  homeScore: number,
  awayScore: number,
  isOvertime: boolean,
  sport?: SportType,
) => ResultStatus | null;

/** A final score is trusted only when two distinct sources agree and the evidence is complete. */
export function hasCorroboratedFinalScore(record: FinalScoreFields): boolean {
  const sources = new Set(
    (record.finalScoreVerifiedSources ?? [])
      .map((source) => source.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
  const observedAt = Date.parse(record.matchVerifiedAt ?? '');
  const scoreIsValid =
    Number.isSafeInteger(record.liveHomeScore) &&
    Number.isSafeInteger(record.liveAwayScore) &&
    (record.liveHomeScore ?? -1) >= 0 &&
    (record.liveAwayScore ?? -1) >= 0;

  return (
    record.matchLifecycleStatus === 'FINISHED' &&
    record.finalScoreVerified === true &&
    sources.size >= 2 &&
    record.matchVerificationConflict !== true &&
    Number.isFinite(observedAt) &&
    Boolean(record.matchVerificationSource?.trim()) &&
    scoreIsValid
  );
}

function parseFinalScore(value: string | null | undefined): {
  home: number;
  away: number;
  overtime: boolean;
} | null {
  const match = value?.trim().match(/^\s*(\d+)\s*[:\-]\s*(\d+)(?:\s*\((ОТ|OT)\))?\s*$/i);
  if (!match) return null;
  const home = Number(match[1]);
  const away = Number(match[2]);
  if (!Number.isSafeInteger(home) || !Number.isSafeInteger(away)) return null;
  return { home, away, overtime: Boolean(match[3]) };
}

/** Whether a settled result is safe to include in public or AI performance statistics. */
export function hasVerifiedSettledResult(
  record: FinalScoreFields & SettledResultFields,
  evaluateMarket: MarketEvaluator,
): boolean {
  if (record.resultStatus === 'PENDING' || !hasCorroboratedFinalScore(record)) return false;
  const settledAt = Date.parse(record.settledAt ?? '');
  const parsedScore = parseFinalScore(record.finalScore);
  const homeScore = record.liveHomeScore;
  const awayScore = record.liveAwayScore;
  if (
    !Number.isFinite(settledAt) ||
    typeof homeScore !== 'number' ||
    typeof awayScore !== 'number' ||
    !parsedScore ||
    parsedScore.home !== homeScore ||
    parsedScore.away !== awayScore ||
    parsedScore.overtime !== Boolean(record.finalScoreIsOvertime)
  ) {
    return false;
  }

  const evaluated = evaluateMarket(
    record.selectionTitle,
    homeScore,
    awayScore,
    Boolean(record.finalScoreIsOvertime),
    record.sport,
  );
  if (!evaluated || evaluated !== record.resultStatus) return false;

  let expectedProfit: number;
  if (evaluated === 'WIN') {
    expectedProfit = Number((record.stakeUnits * (record.fixedOdds - 1)).toFixed(2));
  } else if (evaluated === 'LOSS') {
    expectedProfit = -record.stakeUnits;
  } else {
    expectedProfit = 0;
  }

  return (
    Number.isFinite(record.profitUnits) &&
    Number.isFinite(record.profitPercent) &&
    Math.abs((record.profitUnits ?? 0) - expectedProfit) <= 0.01 &&
    Math.abs((record.profitPercent ?? 0) - expectedProfit) <= 0.01
  );
}

