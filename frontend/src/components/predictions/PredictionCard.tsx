'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Crown,
  Flame,
  Lock,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Unlock,
  XCircle,
  Zap,
} from 'lucide-react';
import type { PublicPredictionDto, ResultStatus, SportType } from '@/server/types';

export interface PredictionCardProps {
  prediction: PublicPredictionDto;
  userReferenceBankrollRub?: number;
  defaultSinglePriceRub?: number;
  showDetailLink?: boolean;
  onBuySingle?: (prediction: PublicPredictionDto) => void;
  onOpenVipPlans?: () => void;
  onVerifyHash?: (predictionId: string) => void;
}

export const SPORT_LABELS: Record<SportType, { label: string; icon: string; badge: string }> = {
  FOOTBALL: {
    label: 'Футбол',
    icon: '⚽',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  },
  HOCKEY: {
    label: 'Хоккей',
    icon: '🏒',
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  },
  TENNIS: {
    label: 'Теннис',
    icon: '🎾',
    badge: 'bg-lime-500/10 text-lime-300 border-lime-500/25',
  },
  ESPORTS: {
    label: 'Киберспорт',
    icon: '🎮',
    badge: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
  },
  BASKETBALL: {
    label: 'Баскетбол',
    icon: '🏀',
    badge: 'bg-orange-500/10 text-orange-300 border-orange-500/25',
  },
  MMA: {
    label: 'Единоборства',
    icon: '🥊',
    badge: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
  },
};

const RESULT_BADGES: Record<
  Exclude<ResultStatus, 'PENDING'>,
  { label: string; style: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  WIN: {
    label: 'Выигрыш',
    style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    Icon: CheckCircle2,
  },
  LOSS: {
    label: 'Проигрыш',
    style: 'bg-rose-500/12 text-rose-300 border-rose-500/30',
    Icon: XCircle,
  },
  PUSH: {
    label: 'Возврат',
    style: 'bg-amber-500/12 text-amber-300 border-amber-500/30',
    Icon: RefreshCw,
  },
  CASHOUT: {
    label: 'Cashout',
    style: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/35',
    Icon: Zap,
  },
};

function useCountdown(targetIso: string, active: boolean) {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setMs(null);
      return;
    }
    const target = new Date(targetIso).getTime();
    const tick = () => setMs(Math.max(0, target - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [targetIso, active]);

  return useMemo(() => {
    if (ms === null) return { text: '--:--:--', urgent: false };
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    const text =
      totalSec === 0
        ? 'Скоро начало'
        : d > 0
          ? `${d}д ${pad(h)}:${pad(m)}:${pad(s)}`
          : `${pad(h)}:${pad(m)}:${pad(s)}`;
    return { text, urgent: totalSec > 0 && totalSec <= 3600 };
  }, [ms]);
}

export const PredictionCard: React.FC<PredictionCardProps> = ({
  prediction,
  userReferenceBankrollRub,
  defaultSinglePriceRub = 790,
  showDetailLink = true,
  onBuySingle,
  onOpenVipPlans,
  onVerifyHash,
}) => {
  const [expanded, setExpanded] = useState(!showDetailLink);
  const sportMeta = SPORT_LABELS[prediction.sport];
  const isUpcoming = prediction.matchStatus === 'UPCOMING';
  const isLive = prediction.matchStatus === 'LIVE';
  const countdown = useCountdown(prediction.matchStartsAt, isUpcoming);

  const kickoffStr = useMemo(
    () =>
      new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(prediction.matchStartsAt)),
    [prediction.matchStartsAt],
  );

  const personalStakeRub = useMemo(() => {
    if (!userReferenceBankrollRub) return null;
    return Math.round((userReferenceBankrollRub * prediction.stakePercent) / 100);
  }, [userReferenceBankrollRub, prediction.stakePercent]);

  const resultBadge =
    prediction.resultStatus !== 'PENDING' ? RESULT_BADGES[prediction.resultStatus] : null;

  const displayPrice = prediction.singlePriceRub ?? defaultSinglePriceRub;

  return (
    <article className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 transition-colors hover:border-slate-700/90 sm:p-6">
      {/* Шапка карточки: Спорт + Лига | Статус / Таймер */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${sportMeta.badge}`}
          >
            <span>{sportMeta.icon}</span>
            <span>{sportMeta.label}</span>
          </span>
          <span className="text-xs font-medium text-slate-400">{prediction.leagueName}</span>
        </div>

        <div className="flex items-center gap-2">
          {isUpcoming && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tabular-nums ${
                countdown.urgent
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-slate-800 bg-slate-950 text-slate-300'
              }`}
            >
              {countdown.urgent ? (
                <Flame className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Clock className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span>Старт через {countdown.text}</span>
            </span>
          )}

          {isLive && (
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
              <span>В игре · LIVE</span>
            </span>
          )}

          {resultBadge && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${resultBadge.style}`}
            >
              <resultBadge.Icon className="h-3.5 w-3.5" />
              <span>{resultBadge.label}</span>
              {prediction.profitUnits !== null && (
                <span className="font-mono">
                  ({prediction.profitUnits > 0 ? '+' : ''}
                  {prediction.profitUnits.toFixed(2)} u)
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Команды и размер ставки по системе Флэт */}
      <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            {showDetailLink ? (
              <Link
                href={`/predictions/${prediction.slug}`}
                className="text-lg font-bold text-white transition hover:text-emerald-400 sm:text-xl"
              >
                {prediction.homeTeam}{' '}
                <span className="mx-1 font-normal text-slate-500">—</span>{' '}
                {prediction.awayTeam}
              </Link>
            ) : (
              <h1 className="text-xl font-extrabold text-white sm:text-2xl">
                {prediction.homeTeam}{' '}
                <span className="mx-1 font-normal text-slate-500">—</span>{' '}
                {prediction.awayTeam}
              </h1>
            )}

            {prediction.finalScore && (
              <span className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-0.5 font-mono text-sm font-bold text-slate-200">
                {prediction.finalScore}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Начало матча: <span className="text-slate-300">{kickoffStr}</span> · Линия:{' '}
            <span className="text-slate-300">{prediction.bookmakerSource}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 sm:items-end">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span>Рекомендуемый флэт</span>
          </div>
          <div className="font-mono text-sm font-bold text-emerald-400">
            {prediction.stakePercent.toFixed(1)}% банка ({prediction.stakeUnits.toFixed(2)} u)
          </div>
          {personalStakeRub !== null && (
            <div className="text-[11px] text-slate-500">
              ≈ {personalStakeRub.toLocaleString('ru-RU')} ₽ от вашего банка
            </div>
          )}
        </div>
      </div>

      {/* Краткая аналитическая вводная */}
      {prediction.analysisTeaser && (
        <p className="mt-3.5 text-sm leading-relaxed text-slate-300">
          {prediction.analysisTeaser}
        </p>
      )}

      {/* Закрытый блок (Blur) ИЛИ Открытый исход */}
      <div className="mt-4">
        {prediction.isLocked ? (
          <div className="relative grid overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <div
              aria-hidden="true"
              className="pointer-events-none col-start-1 row-start-1 select-none p-4 opacity-35 blur-[7px] sm:p-5"
            >
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-slate-900 p-3">
                  <div className="text-[11px] text-slate-400">Исход</div>
                  <div className="mt-1 font-bold text-white">Фора 1 (-1.5)</div>
                </div>
                <div className="rounded-lg bg-slate-900 p-3">
                  <div className="text-[11px] text-slate-400">Коэффициент</div>
                  <div className="mt-1 font-mono text-lg font-bold text-emerald-400">2.04</div>
                </div>
                <div className="rounded-lg bg-slate-900 p-3">
                  <div className="text-[11px] text-slate-400">Потенциал</div>
                  <div className="mt-1 font-mono font-bold text-emerald-300">+2.08 u</div>
                </div>
              </div>
            </div>

            <div className="z-10 col-start-1 row-start-1 flex flex-col items-center justify-center bg-slate-950/75 px-4 py-5 text-center backdrop-blur-[2px]">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Lock className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  {prediction.accessTier === 'VIP_ONLY'
                    ? 'Эксклюзивный прогноз для участников VIP-клуба'
                    : 'Точный исход, зафиксированный коэффициент и полный разбор закрыты'}
                </span>
              </div>

              <div className="mt-3.5 flex w-full max-w-md flex-col gap-2.5 sm:flex-row">
                {prediction.accessTier === 'PAID_SINGLE' && (
                  <button
                    type="button"
                    onClick={() => onBuySingle?.(prediction)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                  >
                    <Unlock className="h-4 w-4" />
                    <span>Открыть за {displayPrice.toLocaleString('ru-RU')} ₽</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenVipPlans}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/20"
                >
                  <Crown className="h-4 w-4 text-amber-300" />
                  <span>Все прогнозы в VIP</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-500/25 bg-slate-950 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800/90 bg-slate-900/70 p-3">
                <div className="text-[11px] font-medium text-slate-400">Исход матча</div>
                <div className="mt-1 text-base font-bold text-white">
                  {prediction.selectionTitle}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800/90 bg-slate-900/70 p-3">
                <div className="text-[11px] font-medium text-slate-400">
                  Зафиксированный коэффициент
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-xl font-extrabold text-emerald-400">
                    {prediction.fixedOdds?.toFixed(2)}
                  </span>
                  {prediction.minAcceptableOdds && (
                    <span className="text-xs text-slate-400">
                      (актуально от {prediction.minAcceptableOdds.toFixed(2)})
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800/90 bg-slate-900/70 p-3">
                <div className="text-[11px] font-medium text-slate-400">
                  {prediction.profitUnits !== null ? 'Результат' : 'Ожидаемая прибыль'}
                </div>
                <div
                  className={`mt-1 font-mono text-base font-bold ${
                    prediction.profitUnits !== null
                      ? prediction.profitUnits > 0
                        ? 'text-emerald-400'
                        : prediction.profitUnits < 0
                          ? 'text-rose-400'
                          : 'text-amber-300'
                      : 'text-emerald-300'
                  }`}
                >
                  {prediction.profitUnits !== null
                    ? `${prediction.profitUnits > 0 ? '+' : ''}${prediction.profitUnits.toFixed(
                        2,
                      )} u (${prediction.profitUnits > 0 ? '+' : ''}${prediction.profitUnits.toFixed(
                        2,
                      )}%)`
                    : prediction.fixedOdds
                      ? `+${(prediction.stakeUnits * (prediction.fixedOdds - 1)).toFixed(2)} u`
                      : '—'}
                </div>
              </div>
            </div>

            {prediction.analysisFull && (
              <div className="mt-3 border-t border-slate-800/80 pt-3">
                {showDetailLink ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                    >
                      {expanded ? 'Свернуть обоснование ▲' : 'Показать подробный разбор ▼'}
                    </button>
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.p
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mt-2.5 overflow-hidden whitespace-pre-line text-sm leading-relaxed text-slate-300"
                        >
                          {prediction.analysisFull}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </>
                ) : (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">
                    {prediction.analysisFull}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Нижняя строка: проверка честности и ссылка на страницу события */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-3 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>
            Подпись до матча:{' '}
            <code className="font-mono text-slate-400">
              {prediction.verificationHash.slice(0, 12)}…
            </code>
          </span>
        </div>

        <div className="flex items-center gap-4">
          {!prediction.isLocked && onVerifyHash && (
            <button
              type="button"
              onClick={() => onVerifyHash(prediction.id)}
              className="font-medium text-emerald-400 hover:text-emerald-300"
            >
              Проверить подлинность
            </button>
          )}

          {showDetailLink && (
            <Link
              href={`/predictions/${prediction.slug}`}
              className="inline-flex items-center gap-1 font-medium text-slate-300 hover:text-white"
            >
              <span>Страница матча</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
};

export default PredictionCard;
