'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
} from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { PredictionCard } from '@/components/predictions/PredictionCard';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import {
  YooKassaCheckoutModal,
  type CheckoutModalTarget,
} from '@/components/billing/YooKassaCheckoutModal';
import { BundleCartBar } from '@/components/billing/BundleCartBar';
import { EquityCurveChart } from '@/components/stats/EquityCurveChart';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type { PublicPredictionDto, SportType } from '@/server/types';

const SPORT_TABS: Array<{ id: SportType | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'Все виды' },
  { id: 'FOOTBALL', label: 'Футбол' },
  { id: 'HOCKEY', label: 'Хоккей' },
  { id: 'TENNIS', label: 'Теннис' },
  { id: 'ESPORTS', label: 'Киберспорт' },
  { id: 'BASKETBALL', label: 'Баскетбол' },
  { id: 'MMA', label: 'ММА' },
];

export default function HomePage() {
  const { data, reload } = usePublicPlatform();
  const [sportFilter, setSportFilter] = useState<SportType | 'ALL'>('ALL');
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [hashModalItem, setHashModalItem] = useState<PublicPredictionDto | null>(null);

  const defaultPrice = data?.brand.defaultSinglePriceRub ?? 890;
  const bundle2Pct = data?.brand.bundle2DiscountPct ?? 15;
  const bundle3Pct = data?.brand.bundle3DiscountPct ?? 25;
  const allTimeStats = data?.statsByPeriod.ALL_TIME;

  const allPredictions = data?.predictions ?? [];
  const activeList = allPredictions.filter((p) => p.resultStatus === 'PENDING');
  const settledList = allPredictions.filter((p) => p.resultStatus !== 'PENDING');

  const openSingleCheckout = (prediction: PublicPredictionDto) => {
    const price = prediction.singlePriceRub ?? defaultPrice;
    setCheckoutTarget({
      kind: 'SINGLE_PREDICTION',
      title: `${prediction.homeTeam} — ${prediction.awayTeam}`,
      subtitle: `${prediction.leagueName} · Разовый доступ к исходу и аналитике`,
      priceRub: price,
      predictionId: prediction.id,
      predictionIds: [prediction.id],
    });
  };

  const toggleBundleItem = (prediction: PublicPredictionDto) => {
    if (!prediction.isLocked || prediction.salesClosed) return;
    setSelectedBundleIds((prev) =>
      prev.includes(prediction.id)
        ? prev.filter((id) => id !== prediction.id)
        : [...prev, prediction.id],
    );
  };

  const selectedBundleItems = activeList.filter(
    (p) => selectedBundleIds.includes(p.id) && p.isLocked && !p.salesClosed,
  );

  const openBundleCheckout = () => {
    if (selectedBundleItems.length === 0) return;
    if (selectedBundleItems.length === 1) {
      openSingleCheckout(selectedBundleItems[0]);
      return;
    }
    const subtotal = selectedBundleItems.reduce(
      (acc, p) => acc + (p.singlePriceRub ?? defaultPrice),
      0,
    );
    const pct = selectedBundleItems.length >= 3 ? bundle3Pct : bundle2Pct;
    const discounted = Math.max(50, Math.round((subtotal * (100 - pct)) / 100));

    setCheckoutTarget({
      kind: 'BUNDLE_PREDICTIONS',
      title: `Пакет из ${selectedBundleItems.length} событий (−${pct}%)`,
      subtitle: selectedBundleItems
        .map((p) => `${p.homeTeam}—${p.awayTeam}`)
        .join(' · '),
      priceRub: discounted,
      originalPriceRub: subtotal,
      predictionIds: selectedBundleItems.map((p) => p.id),
    });
  };

  const filteredActive =
    sportFilter === 'ALL'
      ? activeList
      : activeList.filter((item) => item.sport === sportFilter);

  const featuredEvent =
    activeList.find((p) => p.isFeatured && p.accessTier === 'PAID_SINGLE') ||
    activeList.find((p) => p.accessTier === 'PAID_SINGLE') ||
    activeList[0] ||
    null;

  return (
    <SiteShell
      viewer={data?.viewer ?? null}
      brand={data?.brand ?? null}
      onViewerChange={() => reload()}
    >
      {/* 1. ТЕМНЫЙ АКЦЕНТНЫЙ HERO + ГЛАВНЫЙ МАТЧ ДНЯ */}
      <section className="bg-[#0B0F19] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
            {/* Левая редакционная колонка */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-medium text-slate-300">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span>Маркетплейс спортивной аналитики · Без подписок и автосписаний</span>
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-[42px] lg:leading-[1.12]">
                Покупайте только те события,{' '}
                <span className="text-blue-400">которые выбираете сами.</span>
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Никаких абонементов. Открытая линия предстоящих матчей с прозрачной статистикой, страховкой возврата на баланс при минусе и фиксацией каждого исхода SHA-256 до стартового свистка.
              </p>

              {/* Метрики верификации */}
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">Чистый профит</div>
                  <div className="mt-0.5 font-mono text-xl font-black text-white">
                    +{allTimeStats ? allTimeStats.netProfitUnits.toFixed(1) : '18.4'}%
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">Yield / ROI</div>
                  <div className="mt-0.5 font-mono text-xl font-black text-blue-400">
                    +{allTimeStats ? allTimeStats.yieldPct.toFixed(1) : '24.6'}%
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">Проходимость</div>
                  <div className="mt-0.5 font-mono text-xl font-black text-white">
                    {allTimeStats ? allTimeStats.winRatePct.toFixed(1) : '68.0'}%
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">Средний кэф</div>
                  <div className="mt-0.5 font-mono text-xl font-black text-white">
                    {allTimeStats ? allTimeStats.avgOdds.toFixed(2) : '1.94'}
                  </div>
                </div>
              </div>
            </div>

            {/* Правая карточка: Главный матч дня */}
            <div className="lg:col-span-5">
              {featuredEvent ? (
                <div className="rounded-3xl border border-white/15 bg-gradient-to-b from-slate-900 to-[#111827] p-6 shadow-2xl">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/20 px-3 py-1 text-[11px] font-bold text-blue-300">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Главное событие дня</span>
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-400">
                      <Clock className="h-3.5 w-3.5 text-blue-400" />
                      <span>
                        {new Date(featuredEvent.matchStartsAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </div>

                  <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {featuredEvent.leagueName}
                  </div>
                  <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">
                    {featuredEvent.homeTeam} — {featuredEvent.awayTeam}
                  </h2>

                  {featuredEvent.insuredOnLoss && (
                    <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Страховка 100% возврата на баланс при минусе</span>
                    </div>
                  )}

                  <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
                    {featuredEvent.analysisTeaser}
                  </p>

                  <div className="mt-4 flex items-center gap-4 border-y border-white/10 py-3 text-xs text-slate-300">
                    <div>
                      Доля банка:{' '}
                      <strong className="font-mono text-white">
                        {featuredEvent.stakeUnits.toFixed(1)}%
                      </strong>
                    </div>
                    <div>
                      Линия:{' '}
                      <strong className="text-white">{featuredEvent.bookmakerSource}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHashModalItem(featuredEvent)}
                      className="ml-auto inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>SHA-256</span>
                    </button>
                  </div>

                  {!featuredEvent.isLocked ? (
                    <div className="mt-4 flex items-center justify-between rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3.5">
                      <div>
                        <div className="text-[11px] text-blue-300">Открытый исход</div>
                        <div className="text-sm font-bold text-white">
                          {featuredEvent.selectionTitle}
                        </div>
                      </div>
                      <div className="font-mono text-xl font-black text-blue-400">
                        {featuredEvent.fixedOdds?.toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Lock className="h-3 w-3" />
                          <span>Разовый доступ</span>
                        </div>
                        <div className="font-mono text-2xl font-black text-white">
                          {(featuredEvent.singlePriceRub ?? defaultPrice).toLocaleString(
                            'ru-RU',
                          )}{' '}
                          ₽
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openSingleCheckout(featuredEvent)}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500"
                      >
                        <span>Купить прогноз</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* 2. ВИТРИНА СОБЫТИЙ (СВЕТЛАЯ 3-КОЛОНОЧНАЯ СЕТКА МАРКЕТПЛЕЙСА) */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Полоска пакетных скидок и промокода */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 font-bold text-blue-700">
              <Layers className="h-3.5 w-3.5" />
              <span>Пакеты событий выгоднее:</span>
            </span>
            <span>
              2 матча <strong>−{bundle2Pct}%</strong> · 3+ матча{' '}
              <strong>−{bundle3Pct}%</strong> (кнопка «+ В пакет» на карточке)
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Tag className="h-3.5 w-3.5 text-blue-600" />
            <span>Промокод на скидку:</span>
            <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono font-bold text-slate-900">
              START15
            </code>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">
              Актуальная витрина событий
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Выберите интересующий матч — доступ к исходу, кэфу и аналитике открывается мгновенно после оплаты
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SPORT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSportFilter(tab.id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  sportFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Сетка 3 карточки в ряд */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredActive.map((prediction) => (
            <PredictionCard
              key={prediction.id}
              prediction={prediction}
              defaultSinglePriceRub={defaultPrice}
              onBuySingle={openSingleCheckout}
              onVerifyHash={setHashModalItem}
              inBundle={selectedBundleIds.includes(prediction.id)}
              onToggleBundle={toggleBundleItem}
            />
          ))}
        </div>

        {filteredActive.length === 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            В выбранной дисциплине сейчас нет предстоящих событий. Переключите фильтр на «Все виды».
          </div>
        )}
      </section>

      {/* 3. ЖУРНАЛЬНЫЙ БЛОК ДИСТАНЦИИ + ОТКРЫТЫЙ АРХИВ */}
      <section className="border-y border-slate-200/80 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Открытый реестр результатов</span>
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Каждый завершенный матч открыт для проверки
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                После финального свистка все прогнозы — и платные, и бесплатные — публикуются в открытом архиве вместе со строкой SHA-256 и реальным счетом.
              </p>

              <ul className="mt-5 space-y-2.5 text-xs font-medium text-slate-700">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Фиксированный флэт 1%–2.5% без догонов и экспрессов</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Авто-возврат 100% на баланс по застрахованным событиям</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Математическая проверка неизменности исхода по SHA-256</span>
                </li>
              </ul>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/stats"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
                >
                  <span>Статистика и калькулятор банка</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                {data?.brand.freeTelegramUrl && (
                  <a
                    href={data.brand.freeTelegramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Send className="h-3.5 w-3.5 text-blue-600" />
                    <span>Открытый Telegram</span>
                  </a>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-slate-200 bg-[#F8FAFC] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Кривая доходности (кумулятивный банк %)
                  </span>
                  <span className="font-mono text-xs font-bold text-blue-600">
                    +{allTimeStats?.netProfitUnits.toFixed(2) ?? '18.40'}% к банку
                  </span>
                </div>
                <EquityCurveChart points={data?.equityCurve ?? []} />
              </div>
            </div>
          </div>

          {/* Последние рассчитанные события в 3 колонки */}
          {settledList.length > 0 && (
            <div className="mt-10">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-slate-950">
                  Недавно рассчитанные события
                </h3>
                <Link
                  href="/predictions"
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Смотреть весь архив →
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {settledList.slice(0, 3).map((prediction) => (
                  <PredictionCard
                    key={prediction.id}
                    prediction={prediction}
                    defaultSinglePriceRub={defaultPrice}
                    onBuySingle={openSingleCheckout}
                    onVerifyHash={setHashModalItem}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <BundleCartBar
        selectedItems={selectedBundleItems}
        defaultPriceRub={defaultPrice}
        bundle2DiscountPct={bundle2Pct}
        bundle3DiscountPct={bundle3Pct}
        onClear={() => setSelectedBundleIds([])}
        onCheckoutBundle={openBundleCheckout}
      />

      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={data?.viewer ?? null}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={async () => {
          setSelectedBundleIds([]);
          await reload();
        }}
      />

      <HashVerifyModal
        prediction={hashModalItem}
        onClose={() => setHashModalItem(null)}
      />
    </SiteShell>
  );
}
