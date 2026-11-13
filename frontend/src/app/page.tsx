'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Unlock,
} from 'lucide-react';
import {
  CheckoutModalTarget,
  YooKassaCheckoutModal,
} from '@/components/billing/YooKassaCheckoutModal';
import { SiteShell } from '@/components/layout/SiteShell';
import {
  HashVerifyModal,
  VerifiedHashPayload,
} from '@/components/predictions/HashVerifyModal';
import {
  PredictionCard,
  SPORT_LABELS,
  useCountdown,
} from '@/components/predictions/PredictionCard';
import { EquityCurveChart } from '@/components/stats/EquityCurveChart';
import { SocialProofToast } from '@/components/triggers/SocialProofToast';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type { PublicPredictionDto, SportType } from '@/server/types';

function FeaturedHeroMatchCard({
  match,
  defaultPrice,
  onBuy,
}: {
  match: PublicPredictionDto;
  defaultPrice: number;
  onBuy: (p: PublicPredictionDto) => void;
}) {
  const countdown = useCountdown(match.matchStartsAt, match.matchStatus === 'UPCOMING');
  const sportMeta = SPORT_LABELS[match.sport];
  const price = match.singlePriceRub ?? defaultPrice;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-6 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-[11px] font-bold text-blue-300">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Главное событие дня</span>
        </span>
        {match.matchStatus === 'UPCOMING' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1 font-mono text-xs font-semibold text-slate-200">
            <Clock className="h-3.5 w-3.5 text-blue-400" />
            <span>{countdown.text}</span>
          </span>
        ) : (
          <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-300">
            LIVE
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-slate-400">
          {sportMeta.icon} {match.leagueName}
        </div>
        <Link
          href={`/predictions/${match.slug}`}
          className="mt-1 block text-2xl font-black tracking-tight text-white hover:text-blue-300"
        >
          {match.homeTeam} — {match.awayTeam}
        </Link>
        <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-slate-300">
          {match.analysisTeaser}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 rounded-2xl border border-white/10 bg-black/25 p-3.5 text-xs">
        <div>
          <div className="text-[11px] text-slate-400">Рекомендуемый флэт</div>
          <div className="mt-0.5 font-mono text-sm font-black text-white">
            {match.stakeUnits.toFixed(1)}% от банка
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Точный исход и кэф</div>
          <div className="mt-0.5 font-bold text-blue-300">
            {match.isLocked ? 'Закрыто до покупки' : `${match.selectionTitle} (${match.fixedOdds?.toFixed(2)})`}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        {match.isLocked ? (
          <>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Разовая покупка
              </div>
              <div className="font-mono text-2xl font-black text-white">
                {price.toLocaleString('ru-RU')} ₽
              </div>
            </div>
            <button
              type="button"
              onClick={() => onBuy(match)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/35 transition hover:bg-blue-500"
            >
              <Unlock className="h-4 w-4" />
              <span>Купить прогноз</span>
            </button>
          </>
        ) : (
          <Link
            href={`/predictions/${match.slug}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/15 py-3 text-xs font-bold text-white hover:bg-white/20"
          >
            <span>Открыть полный разбор матча</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { data, loading, reload } = usePublicPlatform();
  const [sportFilter, setSportFilter] = useState<'ALL' | SportType>('ALL');
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<VerifiedHashPayload | null>(null);

  const activeEvents = useMemo(() => {
    if (!data) return [];
    return data.predictions.filter((p) => p.matchStatus !== 'FINISHED');
  }, [data]);

  const featuredMatch = useMemo(() => {
    if (!activeEvents.length) return null;
    return activeEvents.find((p) => p.isFeatured) || activeEvents[0];
  }, [activeEvents]);

  const filteredMarketplace = useMemo(() => {
    if (sportFilter === 'ALL') return activeEvents;
    return activeEvents.filter((p) => p.sport === sportFilter);
  }, [activeEvents, sportFilter]);

  const recentSettled = useMemo(() => {
    if (!data) return [];
    return data.predictions.filter((p) => p.matchStatus === 'FINISHED').slice(0, 3);
  }, [data]);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] text-sm font-medium text-slate-500">
        Загрузка витрины событий...
      </div>
    );
  }

  const stats = data.statsByPeriod.ALL_TIME;

  const handleBuySingle = (pred: PublicPredictionDto) => {
    setCheckoutTarget({
      kind: 'SINGLE_PREDICTION',
      title: `${pred.homeTeam} — ${pred.awayTeam}`,
      subtitle: pred.leagueName,
      priceRub: pred.singlePriceRub ?? data.brand.defaultSinglePriceRub,
      predictionId: pred.id,
    });
  };

  const handleVerifyHash = async (predictionId: string) => {
    const res = await fetch('/api/v1/predictions/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictionId }),
    });
    const json = await res.json();
    if (res.ok) setVerifiedHash(json);
  };

  const sportsList: Array<'ALL' | SportType> = [
    'ALL',
    'FOOTBALL',
    'HOCKEY',
    'TENNIS',
    'ESPORTS',
    'BASKETBALL',
    'MMA',
  ];

  return (
    <SiteShell brand={data.brand} viewer={data.viewer} onViewerChange={() => reload()}>
      <SocialProofToast items={data.recentWinsFeed} />
      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={data.viewer}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={reload}
      />
      <HashVerifyModal data={verifiedHash} onClose={() => setVerifiedHash(null)} />

      {/* КОНТРАСТНЫЙ ТЕМНЫЙ ЖУРНАЛЬНЫЙ БЛОК + ГЛАВНЫЙ МАТЧ ДНЯ */}
      <section className="relative overflow-hidden bg-[#0B0F19] py-12 text-white sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 rounded-full bg-blue-600/20 blur-[120px]"
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Левая колонка: Оффер + 4 живых показателя */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1 text-xs font-semibold text-blue-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Никаких подписок и автосписаний · Только разовые события</span>
              </div>

              <h1 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-5xl sm:leading-[1.1]">
                Точечные спортивные разборы{' '}
                <span className="text-blue-400">с прозрачной историей</span>
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Выбирайте только те матчи, которые интересны вам. Каждый прогноз подписывается криптографическим хешем SHA-256 до стартового свистка и автоматически открывается в архиве после игры.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a
                  href="#marketplace"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500"
                >
                  <span>Перейти к витрине событий</span>
                  <ArrowRight className="h-4 w-4" />
                </a>

                <a
                  href={data.brand.freeTelegramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <Send className="h-4 w-4 text-blue-400" />
                  <span>Наш Telegram-канал</span>
                </a>
              </div>

              {/* Компактная полоса верифицированных метрик */}
              <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                  <div className="text-[11px] text-slate-400">Доходность (Yield)</div>
                  <div className="mt-1 font-mono text-2xl font-black text-blue-400">
                    {stats.yieldPct >= 0 ? '+' : ''}
                    {stats.yieldPct.toFixed(1)}%
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                  <div className="text-[11px] text-slate-400">Чистый профит</div>
                  <div className="mt-1 font-mono text-2xl font-black text-white">
                    {stats.netProfitUnits >= 0 ? '+' : ''}
                    {stats.netProfitUnits.toFixed(2)} u
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                  <div className="text-[11px] text-slate-400">Проходимость</div>
                  <div className="mt-1 font-mono text-2xl font-black text-white">
                    {stats.winRatePct.toFixed(1)}%
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                  <div className="text-[11px] text-slate-400">Средний кэф</div>
                  <div className="mt-1 font-mono text-2xl font-black text-white">
                    {stats.avgOdds.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Правая колонка: Карточка главного события */}
            <div className="lg:col-span-5">
              {featuredMatch && (
                <FeaturedHeroMatchCard
                  match={featuredMatch}
                  defaultPrice={data.brand.defaultSinglePriceRub}
                  onBuy={handleBuySingle}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* МАРКЕТПЛЕЙС АКТУАЛЬНЫХ СОБЫТИЙ (СЕТКА 3 КАРТОЧКИ В РЯД) */}
      <section
        id="marketplace"
        className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Линия актуальных разборов
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Витрина предстоящих событий
            </h2>
          </div>

          <Link
            href="/predictions"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700"
          >
            <span>Все события и фильтры</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Табы дисциплин */}
        <div className="mt-5 flex flex-wrap gap-2">
          {sportsList.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSportFilter(sp)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                sportFilter === sp
                  ? 'bg-[#0B0F19] text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              {sp === 'ALL'
                ? `Все события (${activeEvents.length})`
                : `${SPORT_LABELS[sp].icon} ${SPORT_LABELS[sp].label}`}
            </button>
          ))}
        </div>

        {/* Сетка карточек 3 в ряд */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredMarketplace.length > 0 ? (
            filteredMarketplace.map((pred) => (
              <PredictionCard
                key={pred.id}
                prediction={pred}
                variant="grid"
                userReferenceBankrollRub={data.viewer?.referenceBankrollRub}
                defaultSinglePriceRub={data.brand.defaultSinglePriceRub}
                onBuySingle={handleBuySingle}
                onVerifyHash={handleVerifyHash}
              />
            ))
          ) : (
            <div className="col-span-full rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              В выбранной дисциплине сейчас нет предстоящих событий. Выберите «Все события» или загляните позже.
            </div>
          )}
        </div>
      </section>

      {/* ЖУРНАЛЬНЫЙ БЛОК 8 + 4: ГРАФИК БАНКА + ПРИНЦИПЫ ПРОЗРАЧНОСТИ */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <EquityCurveChart points={data.equityCurve} />
          </div>

          <div className="flex flex-col justify-between gap-4 lg:col-span-4">
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="mt-3.5 text-base font-extrabold text-slate-950">
                Защита от рисованной статистики
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Исход и коэффициент каждого прогноза подписываются SHA-256 до начала встречи. После финального свистка матч открывается для всех — любой минус виден публично.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200/90 bg-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <h3 className="mt-3.5 text-base font-extrabold text-slate-950">
                Разовые покупки без навязывания
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Никаких закрытых VIP-подписок и скрытых рекуррентных списаний с карты. Оплачивайте только конкретный интересующий матч в один клик.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ОТКРЫТЫЙ АРХИВ ПОСЛЕДНИХ РАСЧЕТОВ (СЕТКА 3 КАРТОЧКИ В РЯД) */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Прозрачный аудит
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              Недавно завершенные события
            </h2>
          </div>

          <Link
            href="/stats"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700"
          >
            <span>Полный реестр и статистика</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {recentSettled.map((pred) => (
            <PredictionCard
              key={pred.id}
              prediction={pred}
              variant="grid"
              onVerifyHash={handleVerifyHash}
            />
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
