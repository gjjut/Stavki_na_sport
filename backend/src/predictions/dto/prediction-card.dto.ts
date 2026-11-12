/**
 * ШАГ 2: Server-Side сериализация прогноза (Защита «Запретного плода»)
 *
 * ВАЖНО ДЛЯ БЕЗОПАСНОСТИ БЕТТИНГ-ПЛАТФОРМЫ:
 * Если прогноз платный и пользователь его НЕ купил (и не имеет активной VIP-подписки),
 * сервер НИКОГДА не отправляет реальные `selectionTitle`, `fixedOdds` и `analysisFull` в JSON.
 * В противном случае любой пользователь откроет Chrome DevTools -> Network и прочитает ставку бесплатно,
 * сняв CSS `filter: blur()` в инспекторе.
 */

export type SportType = 'FOOTBALL' | 'HOCKEY' | 'TENNIS' | 'ESPORTS' | 'BASKETBALL' | 'MMA';
export type MatchLifecycleStatus = 'UPCOMING' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
export type PredictionResultStatus = 'PENDING' | 'WIN' | 'LOSS' | 'PUSH' | 'CASHOUT';
export type PredictionAccessTier = 'FREE' | 'PAID_SINGLE' | 'VIP_ONLY';

export interface PredictionEntity {
  id: string;
  slug: string;
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchStartsAt: Date;
  matchStatus: MatchLifecycleStatus;
  marketCode: string;
  selectionTitle: string;
  fixedOdds: string; // NUMERIC(6,3), напр. "1.940"
  minAcceptableOdds: string | null;
  bookmakerSource: string;
  analysisTeaser: string | null;
  analysisFull: string;
  stakePercent: string; // NUMERIC(4,2), напр. "2.00"
  stakeUnits: string;   // NUMERIC(5,2), напр. "2.00"
  accessTier: PredictionAccessTier;
  singlePriceRub: string | null;
  revealAfterFinish: boolean;
  resultStatus: PredictionResultStatus;
  finalScore: string | null;
  profitUnits: string | null;
  profitPercent: string | null;
  verificationHash: string | null;
  oddsLockedAt: Date | null;
}

export interface PredictionCardResponseDto {
  id: string;
  slug: string;
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchStartsAt: string;
  matchStatus: MatchLifecycleStatus;

  // Банк-менеджмент открыт всегда — показывает дисциплину флэта
  stakePercent: number;
  stakeUnits: number;
  bookmakerSource: string;
  analysisTeaser: string | null;

  // Флаг доступа для управления размытием (blur) и замком на фронтенде
  isLocked: boolean;
  accessTier: PredictionAccessTier;
  singlePriceRub: number | null;

  // Защищенные поля: заполняются ТОЛЬКО если isLocked === false
  selectionTitle: string | null;
  fixedOdds: number | null;
  minAcceptableOdds: number | null;
  analysisFull: string | null;

  // Верификация и расчет исхода
  resultStatus: PredictionResultStatus;
  finalScore: string | null;
  profitUnits: number | null;
  profitPercent: number | null;
  verificationHash: string | null;
  oddsLockedAt: string | null;
}

export function serializePredictionForViewer(
  prediction: PredictionEntity,
  viewerAccess: { hasActiveVip: boolean; purchasedPredictionIds: Set<string> },
): PredictionCardResponseDto {
  const isFree = prediction.accessTier === 'FREE';
  const isSettledPublic =
    prediction.revealAfterFinish &&
    prediction.matchStatus === 'FINISHED' &&
    prediction.resultStatus !== 'PENDING';
  const isPurchasedSingle = viewerAccess.purchasedPredictionIds.has(prediction.id);

  const isUnlocked =
    isFree ||
    isSettledPublic ||
    viewerAccess.hasActiveVip ||
    (prediction.accessTier === 'PAID_SINGLE' && isPurchasedSingle);

  return {
    id: prediction.id,
    slug: prediction.slug,
    sport: prediction.sport,
    leagueName: prediction.leagueName,
    homeTeam: prediction.homeTeam,
    awayTeam: prediction.awayTeam,
    matchStartsAt: prediction.matchStartsAt.toISOString(),
    matchStatus: prediction.matchStatus,

    stakePercent: Number(prediction.stakePercent),
    stakeUnits: Number(prediction.stakeUnits),
    bookmakerSource: prediction.bookmakerSource,
    analysisTeaser: prediction.analysisTeaser,

    isLocked: !isUnlocked,
    accessTier: prediction.accessTier,
    singlePriceRub: prediction.singlePriceRub ? Number(prediction.singlePriceRub) : null,

    // Если прогноз закрыт — отдаем null вместо реального исхода и коэффициента
    selectionTitle: isUnlocked ? prediction.selectionTitle : null,
    fixedOdds: isUnlocked ? Number(prediction.fixedOdds) : null,
    minAcceptableOdds:
      isUnlocked && prediction.minAcceptableOdds ? Number(prediction.minAcceptableOdds) : null,
    analysisFull: isUnlocked ? prediction.analysisFull : null,

    resultStatus: prediction.resultStatus,
    finalScore: prediction.finalScore,
    profitUnits: prediction.profitUnits !== null ? Number(prediction.profitUnits) : null,
    profitPercent: prediction.profitPercent !== null ? Number(prediction.profitPercent) : null,
    verificationHash: prediction.verificationHash,
    oddsLockedAt: prediction.oddsLockedAt ? prediction.oddsLockedAt.toISOString() : null,
  };
}
