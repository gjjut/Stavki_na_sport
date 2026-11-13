'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Flame,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unlock,
  XCircle,
  Zap,
} from 'lucide-react';
import type { PublicPredictionDto, ResultStatus, SportType } from '@/server/types';

export interface PredictionCardProps {
  prediction: PublicPredictionDto;
  variant?: 'grid' | 'detail';
  userReferenceBankrollRub?: number;
  defaultSinglePriceRub?: number;
  onBuySingle?: (prediction: PublicPredictionDto) => void;
  onVerifyHash?: (predictionId: string) => void;
}

export const SPORT_LABELS: Record<
  SportType,
  { label: string; icon: string; badge: string }
> = {
  FOOTBALL: {
    label: 'Футбол',
    icon: '⚽',
    badge: 'bg-blue-50 text-blue-700 border-blue-200/80',
  },
  HOCKEY: {
    label: 'Хоккей',
    icon: '🏒',
    badge: 'bg-sky-50 text-sky-700 border-sky-200/80',
  },
  TENNIS: {
    label: 'Теннис',
    icon: '🎾',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  },
  ESPORTS: {
    label: 'Киберспорт',
    icon: '🎮',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  },
  BASKETBALL: {
    label: 'Баскетбол',
    icon: '🏀',
    badge: 'bg-orange-50 text-orange-700 border-orange-200/80',
  },
  MMA: {
    label: 'ММА',
    icon: '🥊',
    badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
  },
};

const RESULT_BADGES: Record<
  Exclude<ResultStatus, 'PENDING'>,
  { label: string; style: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  WIN: {
    label: 'Выигрыш',
    style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Icon: CheckCircle2,
  },
  LOSS: {
    label: 'Минус',
    style: 'bg-rose-50 text-rose-600 border-rose-200',
    Icon: XCircle,
  },
  PUSH: {
    label: 'Возврат',
    style: 'bg-amber-50 text-amber-700 border-amber-200',
    Icon: RefreshCw,
  },
  CASHOUT: {
    label: 'Cashout',
    style: 'bg-sky-50 text-sky-700 border-sky-200',
    Icon: Zap,
  },
};

export function useCountdown(targetIso: string, active: boolean) {
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
        ? 'Скоро старт'
        : d > 0
          ? `${d}д ${pad(h)}:${pad(m)}:${pad(s)}`
          : `${pad(h)}:${pad(m)}:${pad(s)}`;
    return { text, urgent: totalSec > 0 && totalSec <= 3600 };
  }, [ms]);
}

export const PredictionCard: React.FC<PredictionCardProps> = ({
  prediction,
  variant = 'grid',
  userReferenceBankrollRub,
  defaultSinglePriceRub = 790,
  onBuySingle,
  onVerifyHash,
}) => {
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

  // =========================================================================
  // РЕЖИМ 1: КОМПАКТНАЯ КАРТОЧКА МАРКЕТПЛЕЙСА (ДЛЯ СЕТКИ 3 В РЯД)
  // =========================================================================
  if (variant === 'grid') {
    return (
      <article className="group flex h-full flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_14px_32px_rgba(37,99,235,0.08)]">
        <div>
          {/* Верхняя плашка: Спорт + статус / таймер */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${sportMeta.badge}`}
            >
              <span>{sportMeta.icon}</span>
              <span>{sportMeta.label}</span>
            </span>

            {isUpcoming && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  countdown.urgent
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                {countdown.urgent ? (
                  <Flame className="h-3 w-3 text-amber-500" />
                ) : (
                  <Clock className="h-3 w-3 text-slate-400" />
                )}
                <span>{countdown.text}</span>
              </span>
            )}

            {isLive && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                <span>LIVE</span>
              </span>
            )}

            {resultBadge && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${resultBadge.style}`}
              >
                <resultBadge.Icon className="h-3 w-3" />
                <span>{resultBadge.label}</span>
                {prediction.profitUnits !== null && (
                  <span className="font-mono">
                    {prediction.profitUnits > 0 ? '+' : ''}
                    {prediction.profitUnits.toFixed(2)}u
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Турнир и команды */}
          <div className="mt-3.5">
            <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {prediction.leagueName}
            </div>

            <Link
              href={`/predictions/${prediction.slug}`}
              className="mt-1 block text-lg font-extrabold leading-snug text-slate-950 transition group-hover:text-blue-600"
            >
              {prediction.homeTeam} — {prediction.awayTeam}
            </Link>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{kickoffStr}</span>
              <span className="text-slate-300">•</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                Флэт {prediction.stakeUnits.toFixed(1)}%
              </span>
              {personalStakeRub !== null && (
                <span className="text-[11px] text-slate-400">
                  (≈ {personalStakeRub.toLocaleString('ru-RU')} ₽)
                </span>
              )}
              {prediction.finalScore && (
                <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  {prediction.finalScore}
                </span>
              )}
            </div>
          </div>

          {/* Краткий анонс */}
          <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-600">
            {prediction.analysisTeaser}
          </p>
        </div>

        {/* Нижний блок карточки: Закрытый ценник ИЛИ открытый исход */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          {prediction.isLocked ? (
            <div>
              <div className="mb-3 flex items-center justify-between rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Lock className="h-3.5 w-3.5 text-blue-600" />
                  <span>Точный исход + кэф + разбор</span>
                </span>
                <span className="font-mono text-[10px] text-slate-400">SHA-256</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Разовый доступ
                  </div>
                  <div className="font-mono text-xl font-black text-slate-950">
                    {displayPrice.toLocaleString('ru-RU')} ₽
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onBuySingle?.(prediction)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  <span>Купить прогноз</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                    {prediction.isPurchased
                      ? 'Купленный прогноз'
                      : prediction.accessTier === 'FREE'
                        ? 'Бесплатный разбор'
                        : 'Открытый архив'}
                  </div>
                  <div className="truncate text-xs font-extrabold text-slate-900">
                    {prediction.selectionTitle}
                  </div>
                </div>

                <div className="shrink-0 rounded-lg bg-white px-2.5 py-1 font-mono text-sm font-black text-blue-700 shadow-sm">
                  {prediction.fixedOdds?.toFixed(2)}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                {onVerifyHash ? (
                  <button
                    type="button"
                    onClick={() => onVerifyHash(prediction.id)}
                    className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-blue-600"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                    <span>Проверить SHA-256</span>
                  </button>
                ) : (
                  <span />
                )}

                <Link
                  href={`/predictions/${prediction.slug}`}
                  className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700"
                >
                  <span>Полный разбор</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </article>
    );
  }

  // =========================================================================
  // РЕЖИМ 2: ДЕТАЛЬНЫЙ РАЗБОР НА ОТДЕЛЬНОЙ СТРАНИЦЕ СОБЫТИЯ (/predictions/[slug])
  // =========================================================================
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
      {/* Контрастная темная шапка матча */}
      <div className="bg-[#0B0F19] p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
              {sportMeta.icon} {sportMeta.label}
            </span>
            <span className="text-xs font-medium text-slate-300">
              {prediction.leagueName}
            </span>
          </div>

          {isUpcoming && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1 text-xs font-semibold tabular-nums text-slate-200">
              <Clock className="h-3.5 w-3.5 text-blue-400" />
              <span>До начала: {countdown.text}</span>
            </span>
          )}
          {isLive && (
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-3.5 py-1 text-xs font-bold text-rose-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
              <span>Матч идет (LIVE)</span>
            </span>
          )}
          {resultBadge && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 text-xs font-bold text-slate-900">
              <resultBadge.Icon className="h-3.5 w-3.5 text-blue-600" />
              <span>{resultBadge.label}</span>
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              {prediction.homeTeam}{' '}
              <span className="font-normal text-slate-500">—</span>{' '}
              {prediction.awayTeam}
            </h1>
            <p className="mt-2 text-xs text-slate-400">
              Начало события: <span className="text-slate-200">{kickoffStr}</span> · Линия:{' '}
              <span className="text-slate-200">{prediction.bookmakerSource}</span>
              {prediction.finalScore && (
                <span className="ml-2 rounded bg-white/15 px-2 py-0.5 font-mono text-white">
                  Счет: {prediction.finalScore}
                </span>
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:text-right">
            <div className="text-[11px] text-slate-400">Рекомендуемый размер ставки</div>
            <div className="font-mono text-lg font-black text-blue-400">
              {prediction.stakePercent.toFixed(1)}% от банка ({prediction.stakeUnits.toFixed(2)} u)
            </div>
            {personalStakeRub !== null && (
              <div className="text-[11px] text-slate-300">
                ≈ {personalStakeRub.toLocaleString('ru-RU')} ₽ для вашего банка
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Светлая содержательная часть */}
      <div className="p-6 sm:p-8">
        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
          {prediction.analysisTeaser}
        </div>

        {prediction.isLocked ? (
          <div className="mt-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 via-white to-slate-50 p-6 text-center sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-xl font-extrabold text-slate-950">
              Полный разбор и точный исход закрыты
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
              После разовой оплаты вы мгновенно получаете точный маркет для ставки, зафиксированный коэффициент, минимально допустимый порог входа и подробную аргументацию.
            </p>

            <div className="mt-6 inline-flex flex-col items-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => onBuySingle?.(prediction)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
              >
                <Unlock className="h-4 w-4" />
                <span>Купить доступ за {displayPrice.toLocaleString('ru-RU')} ₽</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                  Рекомендуемый исход
                </div>
                <div className="mt-1 text-base font-black text-slate-950">
                  {prediction.selectionTitle}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Коэффициент публикации
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-black text-blue-600">
                    {prediction.fixedOdds?.toFixed(2)}
                  </span>
                  {prediction.minAcceptableOdds && (
                    <span className="text-xs text-slate-500">
                      (брать от {prediction.minAcceptableOdds.toFixed(2)})
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {prediction.profitUnits !== null ? 'Итог расчета' : 'Расчетный профит'}
                </div>
                <div
                  className={`mt-1 font-mono text-xl font-black ${
                    prediction.profitUnits !== null
                      ? prediction.profitUnits > 0
                        ? 'text-emerald-600'
                        : prediction.profitUnits < 0
                          ? 'text-rose-600'
                          : 'text-amber-600'
                      : 'text-slate-900'
                  }`}
                >
                  {prediction.profitUnits !== null
                    ? `${prediction.profitUnits > 0 ? '+' : ''}${prediction.profitUnits.toFixed(
                        2,
                      )} u`
                    : prediction.fixedOdds
                      ? `+${(prediction.stakeUnits * (prediction.fixedOdds - 1)).toFixed(2)} u`
                      : '—'}
                </div>
              </div>
            </div>

            {prediction.analysisFull && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600">
                  <Sparkles className="h-4 w-4" />
                  <span>Аналитическое обоснование</span>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {prediction.analysisFull}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Подпись SHA-256 */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span>
              Цифровая подпись до начала матча:{' '}
              <code className="font-mono text-slate-600">
                {prediction.verificationHash.slice(0, 18)}…
              </code>
            </span>
          </div>

          {!prediction.isLocked && onVerifyHash && (
            <button
              type="button"
              onClick={() => onVerifyHash(prediction.id)}
              className="font-bold text-blue-600 hover:text-blue-700"
            >
              Проверить неизменность коэффициента →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PredictionCard;
