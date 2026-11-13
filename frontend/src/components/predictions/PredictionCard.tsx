'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Lock,
  MinusCircle,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { PublicPredictionDto, SportType } from '@/server/types';

const SPORT_LABELS: Record<SportType, { name: string; dot: string }> = {
  FOOTBALL: { name: 'Футбол', dot: 'bg-blue-600' },
  HOCKEY: { name: 'Хоккей', dot: 'bg-sky-500' },
  TENNIS: { name: 'Теннис', dot: 'bg-amber-500' },
  BASKETBALL: { name: 'Баскетбол', dot: 'bg-orange-500' },
  ESPORTS: { name: 'Киберспорт', dot: 'bg-indigo-600' },
  MMA: { name: 'ММА / UFC', dot: 'bg-rose-600' },
};

function getTeamMonogram(teamName: string): string {
  const words = teamName
    .replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s-]/g, '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return (words[0] || teamName).slice(0, 3).toUpperCase();
}

function getConfidenceLabel(stakePct: number): { text: string; bars: number } {
  if (stakePct >= 2.5) return { text: 'Высокая уверенность', bars: 5 };
  if (stakePct >= 2.0) return { text: 'Уверенный выбор', bars: 4 };
  if (stakePct >= 1.5) return { text: 'Рабочий вариант', bars: 3 };
  return { text: 'Аккуратный вход', bars: 2 };
}

interface PredictionCardProps {
  prediction: PublicPredictionDto;
  defaultSinglePriceRub: number;
  onBuySingle: (prediction: PublicPredictionDto) => void;
  onVerifyHash: (prediction: PublicPredictionDto) => void;
  inBundle?: boolean;
  onToggleBundle?: (prediction: PublicPredictionDto) => void;
}

function formatCountdown(kickoffAt: string, nowMs: number): string {
  const diff = new Date(kickoffAt).getTime() - nowMs;
  if (diff <= 0) return 'Матч уже идет';
  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Старт через ${days}д ${hours % 24}ч`;
  }
  if (hours === 0) {
    return `Старт через ${mins} мин`;
  }
  return `Через ${hours}ч ${String(mins).padStart(2, '0')}м`;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({
  prediction,
  defaultSinglePriceRub,
  onBuySingle,
  onVerifyHash,
  inBundle = false,
  onToggleBundle,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const sportMeta = SPORT_LABELS[prediction.sport];
  const price = prediction.singlePriceRub ?? defaultSinglePriceRub;
  const conf = getConfidenceLabel(prediction.stakeUnits);
  const isUnlocked = !prediction.isLocked;
  const canPurchase =
    prediction.isLocked &&
    !prediction.salesClosed &&
    prediction.resultStatus === 'PENDING';

  const profitVal = prediction.profitUnits ?? 0;

  return (
    <article
      className={`group flex h-full flex-col justify-between rounded-2xl border bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-8px_rgba(37,99,235,0.12)] ${
        inBundle
          ? 'border-blue-600 ring-2 ring-blue-600/15'
          : prediction.accessTier === 'FREE' && prediction.resultStatus === 'PENDING'
            ? 'border-emerald-300 ring-1 ring-emerald-500/15'
            : 'border-slate-200/90 hover:border-blue-300'
      }`}
    >
      {/* 1. Верхняя шапка карточки */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${sportMeta.dot}`} />
            <span className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {sportMeta.name} · {prediction.leagueName}
            </span>
          </div>

          {prediction.resultStatus === 'PENDING' ? (
            prediction.matchStatus === 'LIVE' ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-600">
                <Radio className="h-3 w-3 animate-pulse" />
                <span>Идет матч</span>
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                <Clock className="h-3 w-3 text-blue-600" />
                <span>{formatCountdown(prediction.matchStartsAt, nowMs)}</span>
              </span>
            )
          ) : prediction.resultStatus === 'WIN' || prediction.resultStatus === 'CASHOUT' ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Зашел +{profitVal.toFixed(1)}%</span>
            </span>
          ) : prediction.resultStatus === 'LOSS' ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-600">
              <XCircle className="h-3.5 w-3.5" />
              <span>Не зашел ({profitVal.toFixed(1)}%)</span>
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
              <MinusCircle className="h-3.5 w-3.5" />
              <span>Возврат (0%)</span>
            </span>
          )}
        </div>

        {/* 2. Команды */}
        <div className="mt-3.5">
          <Link
            href={`/predictions/${prediction.slug}`}
            className="block rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition group-hover:border-blue-100 group-hover:bg-blue-50/30"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 font-mono text-[10px] font-bold text-white">
                    {getTeamMonogram(prediction.homeTeam)}
                  </span>
                  <span className="text-sm font-extrabold leading-tight text-slate-950">
                    {prediction.homeTeam}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white font-mono text-[10px] font-bold text-slate-700">
                    {getTeamMonogram(prediction.awayTeam)}
                  </span>
                  <span className="text-sm font-extrabold leading-tight text-slate-950">
                    {prediction.awayTeam}
                  </span>
                </div>
              </div>

              <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-600" />
            </div>
          </Link>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {new Date(prediction.matchStartsAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>

            {/* Понятная шкала уверенности и доли банка */}
            <div
              className="flex items-center gap-1.5"
              title={`${conf.text} — рекомендуем ставить ${prediction.stakeUnits.toFixed(1)}% от игрового банка`}
            >
              <span className="text-[11px] font-semibold text-slate-600">
                Ставка {prediction.stakeUnits.toFixed(1)}% от банка
              </span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((seg) => (
                  <span
                    key={seg}
                    className={`h-2.5 w-1 rounded-full ${
                      seg <= conf.bars ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Понятная плашка страховки */}
        {prediction.insuredOnLoss && prediction.accessTier === 'PAID_SINGLE' && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>Если не зайдет — вернем 100% оплаты на баланс</span>
          </div>
        )}

        {prediction.accessTier === 'FREE' && prediction.resultStatus === 'PENDING' && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-blue-600" />
            <span>Бесплатный открытый прогноз дня (0 ₽)</span>
          </div>
        )}

        {/* 3. Короткое понятное описание */}
        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-600">
          {prediction.analysisTeaser}
        </p>
      </div>

      {/* 4. Зона открытого исхода или разовой покупки */}
      <div className="mt-4 border-t border-slate-100 pt-3.5">
        {isUnlocked ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                  <Sparkles className="h-3 w-3" />
                  <span>
                    {prediction.accessTier === 'FREE'
                      ? 'Что ставить (открыто бесплатно)'
                      : prediction.isPurchased
                        ? 'Ваша покупка — что ставить'
                        : 'Матч завершен — исход открыт'}
                  </span>
                </div>
                <div className="mt-0.5 text-sm font-extrabold text-slate-950">
                  {prediction.selectionTitle}
                </div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white px-2.5 py-1 text-right shadow-xs">
                <div className="text-[10px] text-slate-400">Коэфф.</div>
                <div className="font-mono text-sm font-black text-blue-600">
                  {prediction.fixedOdds?.toFixed(2)}
                </div>
              </div>
            </div>

            {prediction.finalScore && (
              <div className="mt-2 flex items-center justify-between border-t border-blue-100/80 pt-1.5 text-[11px] text-slate-600">
                <span>Счет матча:</span>
                <span className="font-mono font-bold text-slate-900">
                  {prediction.finalScore}
                </span>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between text-[11px]">
              <Link
                href={`/predictions/${prediction.slug}`}
                className="font-bold text-blue-700 hover:underline"
              >
                Как поставить и разбор →
              </Link>
              <button
                type="button"
                onClick={() => onVerifyHash(prediction)}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>Проверено</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <Lock className="h-3 w-3 text-blue-600" />
                  <span>Исход откроется сразу</span>
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="font-mono text-lg font-black text-slate-950">
                    {price.toLocaleString('ru-RU')} ₽
                  </span>
                  <span className="text-[11px] text-slate-400">разово</span>
                </div>
              </div>

              {canPurchase ? (
                <div className="flex items-center gap-1.5">
                  {onToggleBundle && (
                    <button
                      type="button"
                      title={
                        inBundle
                          ? 'Убрать из набора со скидкой'
                          : 'Собрать 2–3 матча в набор со скидкой до 25%'
                      }
                      onClick={() => onToggleBundle(prediction)}
                      className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-2.5 text-xs font-bold transition ${
                        inBundle
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-white'
                      }`}
                    >
                      {inBundle ? (
                        <Check className="h-3.5 w-3.5 text-blue-600" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      <span>{inBundle ? 'В наборе' : 'В набор'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onBuySingle(prediction)}
                    className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
                  >
                    Купить
                  </button>
                </div>
              ) : (
                <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                  Матч уже идет
                </span>
              )}
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
              <span>Подходит: {prediction.bookmakerSource}</span>
              <button
                type="button"
                onClick={() => onVerifyHash(prediction)}
                className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-blue-600"
              >
                <ShieldCheck className="h-3 w-3 text-blue-600" />
                <span>Защита от подмены</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
};
