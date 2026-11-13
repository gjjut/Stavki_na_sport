'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Flame,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Unlock,
  XCircle,
  Zap,
} from 'lucide-react';

export type SportType = 'FOOTBALL' | 'HOCKEY' | 'TENNIS' | 'ESPORTS' | 'BASKETBALL' | 'MMA';
export type MatchLifecycleStatus = 'UPCOMING' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
export type PredictionResultStatus = 'PENDING' | 'WIN' | 'LOSS' | 'PUSH' | 'CASHOUT';
export type PredictionAccessTier = 'FREE' | 'PAID_SINGLE' | 'VIP_ONLY';

export interface PredictionCardData {
  id: string;
  slug: string;
  sport: SportType;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchStartsAt: string; // ISO-8601
  matchStatus: MatchLifecycleStatus;

  // Система Флэт / % от банка (всегда открыта — демонстрирует системный риск-менеджмент)
  stakePercent: number;
  stakeUnits: number;
  bookmakerSource: string;
  analysisTeaser: string | null;

  // Доступ и монетизация («Запретный плод»)
  isLocked: boolean;
  accessTier: PredictionAccessTier;
  singlePriceRub: number | null;

  // Секретные поля: при isLocked === true с бэкенда приходят строго null
  selectionTitle: string | null;
  fixedOdds: number | null;
  minAcceptableOdds: number | null;
  analysisFull: string | null;

  // Статус расчета и криптографическая верификация
  resultStatus: PredictionResultStatus;
  finalScore: string | null;
  profitUnits: number | null;
  profitPercent: number | null;
  verificationHash: string | null;
  oddsLockedAt: string | null;
}

export interface PredictionCardProps {
  prediction: PredictionCardData;
  /** Персональный банк юзера из настроек профиля (опционально, только для справочной подсказки) */
  userReferenceBankrollRub?: number;
  onBuySingle?: (predictionId: string) => void;
  onOpenVipPlans?: (sourcePredictionId: string) => void;
  onVerifyHash?: (predictionId: string) => void;
  isCheckoutLoading?: boolean;
}

const SPORT_META: Record<SportType, { label: string; badgeClass: string; icon: string }> = {
  FOOTBALL: {
    label: 'Футбол',
    icon: '⚽',
    badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  },
  HOCKEY: {
    label: 'Хоккей',
    icon: '🏒',
    badgeClass: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  },
  TENNIS: {
    label: 'Теннис',
    icon: '🎾',
    badgeClass: 'bg-lime-500/10 text-lime-300 border-lime-500/25',
  },
  ESPORTS: {
    label: 'Киберспорт',
    icon: '🎮',
    badgeClass: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
  },
  BASKETBALL: {
    label: 'Баскетбол',
    icon: '🏀',
    badgeClass: 'bg-orange-500/10 text-orange-300 border-orange-500/25',
  },
  MMA: {
    label: 'Единоборства',
    icon: '🥊',
    badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
  },
};

const RESULT_META: Record<
  Exclude<PredictionResultStatus, 'PENDING'>,
  {
    label: string;
    containerClass: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  WIN: {
    label: 'ВЫИГРЫШ',
    containerClass:
      'bg-emerald-500/15 text-emerald-300 border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.18)]',
    Icon: CheckCircle2,
  },
  LOSS: {
    label: 'ПРОИГРЫШ',
    containerClass: 'bg-rose-500/12 text-rose-300 border-rose-500/30',
    Icon: XCircle,
  },
  PUSH: {
    label: 'ВОЗВРАТ',
    containerClass: 'bg-amber-500/12 text-amber-300 border-amber-500/30',
    Icon: RefreshCw,
  },
  CASHOUT: {
    label: 'CASHOUT',
    containerClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/35',
    Icon: Zap,
  },
};

/**
 * Hydration-safe хук обратного отсчета до старта матча (триггер FOMO)
 */
function useMatchCountdown(targetIso: string, enabled: boolean) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRemainingMs(null);
      return;
    }

    const targetMs = new Date(targetIso).getTime();
    const update = () => setRemainingMs(Math.max(0, targetMs - Date.now()));

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso, enabled]);

  return useMemo(() => {
    if (remainingMs === null) {
      return { formatted: '--:--:--', isUrgent: false, isExpired: false };
    }
    const totalSeconds = Math.floor(remainingMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => String(n).padStart(2, '0');
    const formatted =
      days > 0
        ? `${days}д ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return {
      formatted,
      // Менее 60 минут до старта — включаем красный FOMO-режим («Линия проседает»)
      isUrgent: totalSeconds > 0 && totalSeconds <= 3600,
      isExpired: totalSeconds === 0,
    };
  }, [remainingMs]);
}

function formatUnitsSigned(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({
  prediction,
  userReferenceBankrollRub,
  onBuySingle,
  onOpenVipPlans,
  onVerifyHash,
  isCheckoutLoading = false,
}) => {
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);
  const [hashCopied, setHashCopied] = useState(false);

  const sportMeta = SPORT_META[prediction.sport];
  const isUpcoming = prediction.matchStatus === 'UPCOMING';
  const isLive = prediction.matchStatus === 'LIVE';
  const isFinished = prediction.matchStatus === 'FINISHED';

  const countdown = useMatchCountdown(prediction.matchStartsAt, isUpcoming);

  const formattedKickoff = useMemo(() => {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(prediction.matchStartsAt));
  }, [prediction.matchStartsAt]);

  const formattedLockedTime = useMemo(() => {
    if (!prediction.oddsLockedAt) return null;
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(prediction.oddsLockedAt));
  }, [prediction.oddsLockedAt]);

  // Справочный расчет потенциальной чистой прибыли в юнитах (только когда кэф открыт)
  const potentialProfitUnits = useMemo(() => {
    if (prediction.fixedOdds === null) return null;
    return prediction.stakeUnits * (prediction.fixedOdds - 1);
  }, [prediction.fixedOdds, prediction.stakeUnits]);

  // Опциональная подсказка под личный банк юзера (не ломает учет во Флэте / Юнитах)
  const personalStakeHintRub = useMemo(() => {
    if (!userReferenceBankrollRub) return null;
    return Math.round((userReferenceBankrollRub * prediction.stakePercent) / 100);
  }, [userReferenceBankrollRub, prediction.stakePercent]);

  const handleCopyHash = async () => {
    if (!prediction.verificationHash || typeof navigator === 'undefined') return;
    await navigator.clipboard.writeText(prediction.verificationHash);
    setHashCopied(true);
    window.setTimeout(() => setHashCopied(false), 2000);
  };

  const settledMeta =
    prediction.resultStatus !== 'PENDING' ? RESULT_META[prediction.resultStatus] : null;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="group relative overflow-hidden rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/95 via-slate-900 to-slate-950 p-5 text-slate-100 shadow-xl transition-colors hover:border-slate-700/90 sm:p-6"
    >
      {/* Декоративное свечение сверху для открытых или выигравших прогнозов */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${
          prediction.resultStatus === 'WIN'
            ? 'via-emerald-400/80'
            : countdown.isUrgent && prediction.isLocked
              ? 'via-amber-400/80'
              : 'via-indigo-400/40'
        } to-transparent`}
      />

      {/* ВЕРХНЯЯ ПАНЕЛЬ: Спорт + Лига + FOMO-таймер / Статус матча */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${sportMeta.badgeClass}`}
          >
            <span>{sportMeta.icon}</span>
            <span>{sportMeta.label}</span>
          </span>
          <span className="text-xs font-medium text-slate-400">{prediction.leagueName}</span>
        </div>

        {/* Блок FOMO и статуса события */}
        <div className="flex items-center gap-2">
          {isUpcoming && (
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tabular-nums transition-colors ${
                countdown.isUrgent
                  ? 'border-amber-500/45 bg-amber-500/15 text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.2)]'
                  : 'border-slate-700/80 bg-slate-800/80 text-slate-200'
              }`}
            >
              {countdown.isUrgent ? (
                <Flame className="h-3.5 w-3.5 animate-pulse text-amber-400" />
              ) : (
                <Clock className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span>
                {countdown.isExpired
                  ? 'Матч начинается'
                  : `До старта: ${countdown.formatted}`}
              </span>
            </div>
          )}

          {isLive && (
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-bold tracking-wide text-rose-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </span>
              <span>ПРОГНОЗ В ИГРЕ · LIVE</span>
            </div>
          )}

          {isFinished && settledMeta && (
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${settledMeta.containerClass}`}
            >
              <settledMeta.Icon className="h-3.5 w-3.5" />
              <span>{settledMeta.label}</span>
              {prediction.profitUnits !== null && (
                <span className="ml-1 font-mono">
                  ({formatUnitsSigned(prediction.profitUnits)} u)
                </span>
              )}
            </div>
          )}

          {isFinished && !settledMeta && (
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300">
              Матч завершен · На расчете
            </span>
          )}
        </div>
      </div>

      {/* КОМАНДЫ, ВРЕМЯ И БАНК-МЕНЕДЖМЕНТ (ФЛЭТ / ЮНИТЫ) */}
      <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-lg font-bold tracking-tight text-white sm:text-xl">
              {prediction.homeTeam}{' '}
              <span className="mx-1 font-normal text-slate-500">vs</span>{' '}
              {prediction.awayTeam}
            </h3>
            {prediction.finalScore && (
              <span className="rounded-md border border-slate-700 bg-slate-800/90 px-2 py-0.5 font-mono text-sm font-bold text-slate-200">
                {prediction.finalScore}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Начало: <span className="text-slate-300">{formattedKickoff}</span> · Линия:{' '}
            <span className="text-slate-300">{prediction.bookmakerSource}</span>
          </p>
        </div>

        {/* Индикатор строгого Флэта (% от банка и Юниты) */}
        <div className="flex shrink-0 flex-col items-start rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 sm:items-end">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span>Размер ставки (Флэт)</span>
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-emerald-300">
            {prediction.stakePercent.toFixed(1)}% банка · {prediction.stakeUnits.toFixed(2)} u
          </div>
          {personalStakeHintRub !== null && (
            <span className="text-[11px] text-slate-500">
              ≈ {personalStakeHintRub.toLocaleString('ru-RU')} ₽ для вашего банка
            </span>
          )}
        </div>
      </div>

      {/* ПУБЛИЧНЫЙ ТИЗЕР АНАЛИТИКИ (Разогревает интерес перед замком) */}
      {prediction.analysisTeaser && (
        <p className="mt-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3.5 py-2.5 text-sm leading-relaxed text-slate-300">
          <span className="mr-1.5 font-semibold text-amber-300">Валуй-фактор:</span>
          {prediction.analysisTeaser}
        </p>
      )}

      {/* ЦЕНТРАЛЬНАЯ ЗОНА: ЛИБО «ЗАПРЕТНЫЙ ПЛОД» (BLUR + ЗАМОК), ЛИБО ОТКРЫТЫЙ ИСХОД */}
      <div className="mt-4">
        {prediction.isLocked ? (
          <div className="relative grid overflow-hidden rounded-xl border border-indigo-500/30 bg-slate-950/90">
            {/* Фейковый визуальный слой под размытием (реальных данных в DOM нет — анти-DevTools) */}
            <div
              aria-hidden="true"
              className="pointer-events-none col-start-1 row-start-1 select-none p-4 opacity-45 blur-[7px] filter sm:p-5"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="text-[11px] uppercase text-slate-400">Точный исход</div>
                  <div className="mt-1 text-base font-bold text-white">
                    Индивидуальный тотал Б (2.5)
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="text-[11px] uppercase text-slate-400">Фикс. коэффициент</div>
                  <div className="mt-1 font-mono text-lg font-extrabold text-emerald-400">
                    2.08
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="text-[11px] uppercase text-slate-400">Ожид. профит</div>
                  <div className="mt-1 font-mono text-base font-bold text-emerald-300">
                    +2.16 u (+2.16%)
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Детальный математический разбор xG-модели, составов спецбригад и движения ранней
                линии пиннакла доступен сразу после разблокировки прогноза.
              </p>
            </div>

            {/* Наложенный конверсионный замок + кнопки покупки (Grid-стек без обрезки на мобильных) */}
            <div className="z-10 col-start-1 row-start-1 flex flex-col items-center justify-center bg-slate-950/65 px-4 py-5 text-center backdrop-blur-[3px]">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-200">
                <Lock className="h-3.5 w-3.5 text-indigo-300" />
                <span>
                  {isLive
                    ? 'Прогноз уже в игре — вход по лайв-линии'
                    : countdown.isUrgent
                      ? 'Внимание: менее часа до старта, кэф может просесть!'
                      : 'Исход и зафиксированный коэффициент скрыты'}
                </span>
              </div>

              <div className="mt-3.5 flex w-full max-w-lg flex-col items-stretch justify-center gap-2.5 sm:flex-row">
                {prediction.accessTier === 'PAID_SINGLE' && prediction.singlePriceRub !== null && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    disabled={isCheckoutLoading}
                    onClick={() => onBuySingle?.(prediction.id)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Unlock className="h-4 w-4" />
                    <span>
                      Открыть прогноз · {prediction.singlePriceRub.toLocaleString('ru-RU')} ₽
                    </span>
                  </motion.button>
                )}

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  disabled={isCheckoutLoading}
                  onClick={() => onOpenVipPlans?.(prediction.id)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Crown className="h-4 w-4 text-amber-300" />
                  <span>Забрать в VIP-подписке (-75%)</span>
                </motion.button>
              </div>
            </div>
          </div>
        ) : (
          /* ОТКРЫТОЕ СОСТОЯНИЕ: ИСХОД, ЖЕСТКО ЗАФИКСИРОВАННЫЙ КЭФ И РАСЧЕТ ПРОФИТА */
          <div className="rounded-xl border border-emerald-500/25 bg-slate-950/85 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Исход */}
              <div className="rounded-lg border border-slate-800/90 bg-slate-900/90 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Рекомендуемый исход</span>
                </div>
                <div className="mt-1 text-base font-bold text-white">
                  {prediction.selectionTitle}
                </div>
              </div>

              {/* Жестко зафиксированный коэффициент */}
              <div className="rounded-lg border border-slate-800/90 bg-slate-900/90 p-3">
                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <span>Фикс. кэф</span>
                  {formattedLockedTime && (
                    <span className="text-[10px] normal-case text-slate-500">
                      зафикс. в {formattedLockedTime}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-xl font-extrabold text-emerald-400">
                    {prediction.fixedOdds?.toFixed(2)}
                  </span>
                  {prediction.minAcceptableOdds && (
                    <span className="text-xs text-slate-400">
                      (брать от {prediction.minAcceptableOdds.toFixed(2)})
                    </span>
                  )}
                </div>
              </div>

              {/* Фактический или потенциальный результат в юнитах */}
              <div className="rounded-lg border border-slate-800/90 bg-slate-900/90 p-3">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  {prediction.profitUnits !== null ? 'Итог по ставке' : 'Потенциальная прибыль'}
                </div>
                {prediction.profitUnits !== null && prediction.profitPercent !== null ? (
                  <div
                    className={`mt-1 font-mono text-base font-extrabold ${
                      prediction.profitUnits > 0
                        ? 'text-emerald-400'
                        : prediction.profitUnits < 0
                          ? 'text-rose-400'
                          : 'text-amber-300'
                    }`}
                  >
                    {formatUnitsSigned(prediction.profitUnits)} u (
                    {formatUnitsSigned(prediction.profitPercent)}%)
                  </div>
                ) : (
                  <div className="mt-1 font-mono text-base font-bold text-emerald-300">
                    {potentialProfitUnits !== null
                      ? `+${potentialProfitUnits.toFixed(2)} u (+${(
                          prediction.stakePercent *
                          ((prediction.fixedOdds ?? 1) - 1)
                        ).toFixed(2)}%)`
                      : '—'}
                  </div>
                )}
              </div>
            </div>

            {/* Полное аналитическое обоснование */}
            {prediction.analysisFull && (
              <div className="mt-3 border-t border-slate-800/80 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAnalysisExpanded((prev) => !prev)}
                  className="text-xs font-semibold text-indigo-300 transition hover:text-indigo-200"
                >
                  {isAnalysisExpanded
                    ? 'Скрыть полный аналитический разбор ▲'
                    : 'Показать полный аналитический разбор (+EV обоснование) ▼'}
                </button>

                <AnimatePresence initial={false}>
                  {isAnalysisExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-slate-300">
                        {prediction.analysisFull}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>

      {/* НИЖНЯЯ ПАНЕЛЬ ДОВЕРИЯ: КРИПТОГРАФИЧЕСКИЙ SHA-256 СЛЕПОК ПРОГНОЗА */}
      {prediction.verificationHash && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/90" />
            <span>
              Кэф и исход верифицированы до матча (SHA-256:{' '}
              <code className="font-mono text-slate-400">
                {prediction.verificationHash.slice(0, 14)}…
              </code>
              )
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!prediction.isLocked && onVerifyHash && (
              <button
                type="button"
                onClick={() => onVerifyHash(prediction.id)}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
              >
                <ShieldCheck className="h-3 w-3" />
                <span>Проверить SHA-256 до матча</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyHash}
              className="inline-flex items-center gap-1 text-slate-400 transition hover:text-slate-200"
            >
              <Copy className="h-3 w-3" />
              <span>{hashCopied ? 'Хеш скопирован' : 'Скопировать хеш'}</span>
            </button>
          </div>
        </div>
      )}
    </motion.article>
  );
};

export default PredictionCard;
