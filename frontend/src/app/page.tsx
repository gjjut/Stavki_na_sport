'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Gift,
  HelpCircle,
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
import {
  HeroFeaturedSkeleton,
  PredictionCardSkeleton,
} from '@/components/predictions/PredictionCardSkeleton';
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
  { id: 'ALL', label: 'Все матчи' },
  { id: 'FOOTBALL', label: 'Футбол' },
  { id: 'HOCKEY', label: 'Хоккей' },
  { id: 'TENNIS', label: 'Теннис' },
  { id: 'ESPORTS', label: 'Киберспорт' },
  { id: 'BASKETBALL', label: 'Баскетбол' },
  { id: 'MMA', label: 'ММА / UFC' },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Выбираете понятный матч',
    text: 'Смотрите расписание игр РПЛ, КХЛ, Лиги чемпионов, тенниса или UFC. Можно начать с бесплатного прогноза дня за 0 ₽.',
  },
  {
    step: '02',
    title: 'Платите разово без подписок',
    text: 'Никаких платных подписок и привязки карты. Оплата СБП или картой МИР только за выбранную игру или набор со скидкой до 25%.',
  },
  {
    step: '03',
    title: 'Ставите у своего букмекера',
    text: 'Мы показываем простыми словами, какую кнопку нажать в Фонбет, Винлайн, Пари или Бетбум и какую сумму безопасно выделить.',
  },
  {
    step: '04',
    title: 'Страховка 100% на баланс',
    text: 'Если застрахованный прогноз не зайдет — полная стоимость покупки автоматически вернется на ваш баланс для следующего матча.',
  },
];

const FAQ_ITEMS = [
  {
    q: 'Вы букмекерская контора или аналитический сайт?',
    a: 'Мы аналитический сервис, а не букмекер. У нас вы покупаете готовый разбор и точную рекомендацию на матч, а саму ставку делаете самостоятельно в своем привычном легальном приложении (Фонбет, Винлайн, Пари, Бетбум и др.).',
  },
  {
    q: 'Что именно я увижу сразу после оплаты прогноза?',
    a: 'На странице матча мгновенно откроются: 1) точное название ставки как в российских БК, 2) понятная подсказка, при каком счете ставка выиграет, 3) рабочий коэффициент и калькулятор суммы ставки в рублях, 4) подробное объяснение аналитика.',
  },
  {
    q: 'Спишутся ли у меня деньги повторно через неделю или месяц?',
    a: 'Нет, никогда. На сайте принципиально нет подписок, абонементов и автосписаний. Вы платите один раз только за тот матч или набор, который выбрали сами.',
  },
  {
    q: 'Как работает страховка 100% при минусе?',
    a: 'На карточках с зеленым значком страховки действует правило: если матч завершился и наша ставка проиграла (или рассчитана возвратом), система сама начислит 100% уплаченной суммы на ваш баланс на сайте. Этими деньгами вы открываете следующий прогноз без доплат.',
  },
  {
    q: 'Я новичок и путаюсь в словах «фора» и «тотал» — я разберусь?',
    a: 'Да! Внутри каждого открытого прогноза есть специальная шпаргалка простыми словами: в какой раздел зайти у букмекера, какую кнопку нажать и при каком счете на табло вы забираете выигрыш.',
  },
  {
    q: 'Откуда уверенность, что вы не рисуете статистику побед после матчей?',
    a: 'До стартового свистка каждый прогноз запечатывается цифровым кодом SHA-256. После окончания встречи все матчи (и плюсовые, и минусовые) открываются в архиве — любой посетитель может нажать кнопку проверки и убедиться, что исход не менялся.',
  },
];

export default function HomePage() {
  const { data, loading, reload } = usePublicPlatform();
  const [sportFilter, setSportFilter] = useState<SportType | 'ALL'>('ALL');
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(
    null,
  );
  const [hashModalItem, setHashModalItem] = useState<PublicPredictionDto | null>(
    null,
  );
  const [copiedPromo, setCopiedPromo] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  const defaultPrice = data?.brand.defaultSinglePriceRub ?? 790;
  const bundle2Pct = data?.brand.bundle2DiscountPct ?? 15;
  const bundle3Pct = data?.brand.bundle3DiscountPct ?? 25;
  const allTimeStats = data?.statsByPeriod.ALL_TIME;

  const allPredictions = data?.predictions ?? [];
  const activeList = allPredictions.filter((p) => p.resultStatus === 'PENDING');
  const settledList = allPredictions.filter((p) => p.resultStatus !== 'PENDING');
  const recentVerifiedWins = settledList
    .filter((p) => p.resultStatus === 'WIN' || p.resultStatus === 'CASHOUT')
    .slice(0, 5);
  const freePickToday = activeList.find((p) => p.accessTier === 'FREE') ?? null;

  const openSingleCheckout = (prediction: PublicPredictionDto) => {
    const price = prediction.singlePriceRub ?? defaultPrice;
    setCheckoutTarget({
      kind: 'SINGLE_PREDICTION',
      title: `${prediction.homeTeam} — ${prediction.awayTeam}`,
      subtitle: `${prediction.leagueName} · Разовый доступ к прогнозу и разбору`,
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
      title: `Набор из ${selectedBundleItems.length} прогнозов (−${pct}%)`,
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

  const readyDayPackItems = activeList
    .filter((p) => p.accessTier === 'PAID_SINGLE' && p.isLocked && !p.salesClosed)
    .slice(0, 3);

  const openReadyDayPack = () => {
    if (readyDayPackItems.length < 2) return;
    const subtotal = readyDayPackItems.reduce(
      (acc, p) => aSum(acc, p.singlePriceRub ?? defaultPrice),
      0,
    );
    const pct = readyDayPackItems.length >= 3 ? bundle3Pct : bundle2Pct;
    const discounted = Math.max(50, Math.round((subtotal * (100 - pct)) / 100));
    setCheckoutTarget({
      kind: 'BUNDLE_PREDICTIONS',
      title: `Готовый набор дня из ${readyDayPackItems.length} прогнозов (−${pct}%)`,
      subtitle: readyDayPackItems
        .map((p) => `${p.homeTeam}—${p.awayTeam}`)
        .join(' · '),
      priceRub: discounted,
      originalPriceRub: subtotal,
      predictionIds: readyDayPackItems.map((p) => p.id),
    });
  };

  const copyPromo = async () => {
    await navigator.clipboard.writeText('START15');
    setCopiedPromo(true);
    window.setTimeout(() => setCopiedPromo(false), 2000);
  };

  return (
    <SiteShell
      viewer={data?.viewer ?? null}
      brand={data?.brand ?? null}
      onViewerChange={() => reload()}
    >
      {/* 1. ГЛАВНЫЙ ЭКРАН + ГЛАВНЫЙ МАТЧ ДНЯ */}
      <section className="hero-surface text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
            {/* Левая колонка */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200 sm:text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span>Поштучные прогнозы · Без подписок и автосписаний</span>
              </div>

              <h1 className="mt-4 text-[26px] font-black leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-[42px] lg:leading-[1.12]">
                Понятные прогнозы на футбол и хоккей —{' '}
                <span className="bg-gradient-to-r from-blue-400 to-sky-300 bg-clip-text text-transparent">
                  платите только за выбранный матч
                </span>
              </h1>

              <p className="mt-3.5 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Выбирайте интересную игру, получайте точную рекомендацию простыми словами для Фонбет, Винлайн, Пари или Бетбум, а если прогноз не зайдет — мы вернем{' '}
                <strong className="font-bold text-white">100% стоимости</strong> на ваш баланс для следующего матча.
              </p>

              {/* Кнопки первого экрана */}
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3">
                <a
                  href="#upcoming-matches"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500"
                >
                  <span>Выбрать матч на сегодня</span>
                  <ArrowRight className="h-4 w-4" />
                </a>

                {freePickToday ? (
                  <Link
                    href={`/predictions/${freePickToday.slug}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3.5 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    <Gift className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>Бесплатный прогноз дня (0 ₽)</span>
                  </Link>
                ) : (
                  <Link
                    href="/stats"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-sm font-bold text-slate-200 transition hover:bg-white/10"
                  >
                    <span>Открытая статистика</span>
                  </Link>
                )}
              </div>

              {/* 4 карточки показателей */}
              <div className="mt-6 grid grid-cols-2 gap-2.5 sm:mt-7 sm:grid-cols-4 sm:gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Прирост к банку
                  </div>
                  <div className="mt-0.5 font-mono text-lg font-black text-emerald-400 sm:text-xl">
                    +{allTimeStats ? allTimeStats.netProfitUnits.toFixed(1) : '18.4'}%
                  </div>
                  <div className="text-[10px] text-slate-400">Открытый архив</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Точность побед
                  </div>
                  <div className="mt-0.5 font-mono text-lg font-black text-white sm:text-xl">
                    {allTimeStats ? allTimeStats.winRatePct.toFixed(0) : '68'}%
                  </div>
                  <div className="text-[10px] text-slate-400">На дистанции</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Средний коэфф.
                  </div>
                  <div className="mt-0.5 font-mono text-lg font-black text-blue-400 sm:text-xl">
                    {allTimeStats ? allTimeStats.avgOdds.toFixed(2) : '1.94'}
                  </div>
                  <div className="text-[10px] text-slate-400">По линии БК РФ</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Страховка
                  </div>
                  <div className="mt-0.5 font-mono text-lg font-black text-white sm:text-xl">
                    100%
                  </div>
                  <div className="text-[10px] text-slate-400">Возврат на счет</div>
                </div>
              </div>
            </div>

            {/* Правая карточка: Главный матч дня */}
            <div className="lg:col-span-5">
              {loading && !data ? (
                <HeroFeaturedSkeleton />
              ) : featuredEvent ? (
                <div className="rounded-3xl border border-white/15 bg-gradient-to-b from-slate-900/95 to-[#111827] p-5 shadow-2xl sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/25 px-3 py-1 text-[11px] font-bold text-blue-300 ring-1 ring-blue-400/30">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Главный матч дня</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-300">
                      <Clock className="h-3.5 w-3.5 text-blue-400" />
                      <span>
                        {new Date(featuredEvent.matchStartsAt).toLocaleString(
                          'ru-RU',
                          {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          },
                        )}
                      </span>
                    </span>
                  </div>

                  <div className="mt-3 text-xs font-bold uppercase tracking-wider text-blue-300/80">
                    {featuredEvent.leagueName}
                  </div>
                  <Link
                    href={`/predictions/${featuredEvent.slug}`}
                    className="mt-1 block text-xl font-black text-white transition hover:text-blue-300 sm:text-2xl"
                  >
                    {featuredEvent.homeTeam} — {featuredEvent.awayTeam}
                  </Link>

                  {featuredEvent.insuredOnLoss && (
                    <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span>Если ставка не зайдет — вернем 100% на баланс</span>
                    </div>
                  )}

                  <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-slate-300">
                    {featuredEvent.analysisTeaser}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-white/10 py-3 text-xs text-slate-300">
                    <div>
                      Ставка:{' '}
                      <strong className="font-mono text-white">
                        {featuredEvent.stakeUnits.toFixed(1)}% банка
                      </strong>
                    </div>
                    <div>
                      БК:{' '}
                      <strong className="text-white">
                        {featuredEvent.bookmakerSource}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHashModalItem(featuredEvent)}
                      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 sm:ml-auto"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>SHA-256 защита</span>
                    </button>
                  </div>

                  {!featuredEvent.isLocked ? (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3.5">
                      <div className="min-w-0">
                        <div className="text-[11px] text-blue-300">
                          Что ставить у букмекера
                        </div>
                        <div className="truncate text-sm font-bold text-white">
                          {featuredEvent.selectionTitle}
                        </div>
                      </div>
                      <div className="shrink-0 font-mono text-xl font-black text-blue-400">
                        {featuredEvent.fixedOdds?.toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center justify-between gap-3 sm:mt-5">
                      <div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Lock className="h-3 w-3" />
                          <span>Разовая покупка (СБП / МИР)</span>
                        </div>
                        <div className="font-mono text-2xl font-black text-white">
                          {(
                            featuredEvent.singlePriceRub ?? defaultPrice
                          ).toLocaleString('ru-RU')}{' '}
                          ₽
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openSingleCheckout(featuredEvent)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 sm:px-5 sm:text-sm"
                      >
                        <span>Открыть прогноз</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-3xl border border-white/15 bg-slate-900/90 p-6 text-slate-200 shadow-2xl">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/20 px-3 py-1 text-[11px] font-bold text-blue-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Обновление линии</span>
                  </div>
                  <h2 className="mt-3 text-xl font-black text-white">
                    Аналитический отдел готовит следующий выпуск матчей
                  </h2>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    Новые разборы публикуются ежедневно утром и вечером по московскому времени. Посмотрите открытый архив сыгранных встреч и подпишитесь на наш Telegram.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <Link
                      href="/stats"
                      className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-500"
                    >
                      Открытая статистика →
                    </Link>
                    {data?.brand.freeTelegramUrl && (
                      <a
                        href={data.brand.freeTelegramUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/10"
                      >
                        Telegram-канал
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ЖИВАЯ ЛЕНТА ПОСЛЕДНИХ СЫГРАВШИХ ПРОГНОЗОВ (реальные матчи из архива) */}
        {recentVerifiedWins.length > 0 && (
          <div className="border-t border-white/10 bg-slate-950/60">
            <div className="no-scrollbar mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-2.5 text-xs sm:px-6 lg:px-8">
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Последние заходы:</span>
              </span>
              {recentVerifiedWins.map((win) => (
                <Link
                  key={win.id}
                  href={`/predictions/${win.slug}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-blue-400/40 hover:text-white"
                >
                  <span className="font-semibold text-white">
                    {win.homeTeam} — {win.awayTeam}
                  </span>
                  {win.finalScore && (
                    <span className="font-mono text-slate-400">
                      ({win.finalScore})
                    </span>
                  )}
                  <span className="font-mono font-bold text-emerald-400">
                    кэф {win.fixedOdds?.toFixed(2)} ✓
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2. БЛОК «КАК ЭТО РАБОТАЕТ» */}
      <section
        id="how-it-works"
        className="border-b border-slate-200/80 bg-white py-8 sm:py-10"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-black text-slate-950 sm:text-xl">
                Как это работает — понятно за 1 минуту
              </h2>
              <p className="text-xs text-slate-500">
                Подойдет даже тем, кто впервые покупает аналитический разбор матча
              </p>
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS_STEPS.map((item) => (
              <div
                key={item.step}
                className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-4 transition hover:border-blue-200 hover:bg-white"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-6 items-center rounded-md bg-blue-600 px-2 font-mono text-[11px] font-black text-white">
                    ШАГ {item.step}
                  </span>
                </div>
                <h3 className="mt-2.5 text-sm font-extrabold text-slate-950">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. ВИТРИНА МАТЧЕЙ (3 КАРТОЧКИ В РЯД НА ПК) */}
      <section
        id="upcoming-matches"
        className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8"
      >
        {/* Полоска скидок за набор + промокод START15 */}
        <div className="mb-5 flex flex-col justify-between gap-3 rounded-2xl border border-blue-100 bg-white p-3.5 shadow-xs sm:flex-row sm:items-center sm:px-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 font-bold text-blue-700">
              <Layers className="h-3.5 w-3.5" />
              <span>Скидка за набор:</span>
            </span>
            <span>
              2 матча со скидкой <strong>−{bundle2Pct}%</strong> или 3 матча со скидкой{' '}
              <strong>−{bundle3Pct}%</strong> (кнопка «+ В набор»)
            </span>
          </div>

          <button
            type="button"
            onClick={copyPromo}
            className="inline-flex w-full shrink-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 sm:w-auto sm:py-1.5"
          >
            <span className="inline-flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-blue-600" />
              <span>Скидка −15%:</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <code className="rounded bg-white px-1.5 py-0.5 font-mono font-black text-slate-950 shadow-2xs">
                START15
              </code>
              {copiedPromo ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-400" />
              )}
            </span>
          </button>
        </div>

        {/* Выгодный готовый набор дня в 1 клик */}
        {readyDayPackItems.length >= 3 && (
          <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-blue-200/40 bg-gradient-to-r from-[#0B0F19] via-slate-900 to-blue-950 p-4 text-white shadow-md sm:flex-row sm:items-center sm:p-5">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-bold text-blue-300">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                <span>Набор дня · Скидка −{bundle3Pct}% + страховка 100%</span>
              </div>
              <div className="mt-1.5 text-base font-black sm:text-lg">
                Заберите сразу 3 лучших прогноза дня дешевле, чем по одному
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-slate-300">
                В наборе:{' '}
                {readyDayPackItems
                  .map((m) => `«${m.homeTeam} — ${m.awayTeam}»`)
                  .join(' · ')}
              </div>
            </div>

            <div className="flex w-full shrink-0 items-center justify-between gap-4 border-t border-white/10 pt-3 sm:w-auto sm:border-0 sm:pt-0">
              <div className="sm:text-right">
                <div className="font-mono text-xs text-slate-400 line-through">
                  {readyDayPackItems
                    .reduce((a, p) => a + (p.singlePriceRub ?? defaultPrice), 0)
                    .toLocaleString('ru-RU')}{' '}
                  ₽
                </div>
                <div className="font-mono text-2xl font-black text-emerald-400">
                  {Math.max(
                    50,
                    Math.round(
                      (readyDayPackItems.reduce(
                        (a, p) => a + (p.singlePriceRub ?? defaultPrice),
                        0,
                      ) *
                        (100 - bundle3Pct)) /
                        100,
                    ),
                  ).toLocaleString('ru-RU')}{' '}
                  ₽
                </div>
              </div>

              <button
                type="button"
                onClick={openReadyDayPack}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-extrabold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500"
              >
                <span>Забрать 3 матча</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Заголовок + свайп-лента видов спорта на мобильных */}
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">
              Прогнозы на ближайшие матчи
            </h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Выберите матч — точная ставка, рабочий коэффициент и разбор откроются мгновенно после оплаты
            </p>
          </div>

          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
            {SPORT_TABS.map((tab) => {
              const count =
                tab.id === 'ALL'
                  ? activeList.length
                  : activeList.filter((x) => x.sport === tab.id).length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSportFilter(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    sportFilter === tab.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                  }`}
                >
                  <span>{tab.label}</span>
                  {!loading && count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                        sportFilter === tab.id
                          ? 'bg-white/15 text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Сетка 3 карточки в ряд (или скелетоны при первой загрузке) */}
        {loading && !data ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <PredictionCardSkeleton key={n} />
            ))}
          </div>
        ) : filteredActive.length > 0 ? (
          <>
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

            <div className="mt-7 flex justify-center">
              <Link
                href="/predictions"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-blue-300 hover:text-blue-600"
              >
                <span>Открыть полный каталог и фильтры матчей</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            <p>
              В выбранном виде спорта сейчас нет матчей. Нажмите «Все матчи», чтобы увидеть всю доступную линию.
            </p>
            {sportFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSportFilter('ALL')}
                className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                Показать все матчи
              </button>
            )}
          </div>
        )}
      </section>

      {/* 4. ОТКРЫТАЯ ИСТОРИЯ РЕЗУЛЬТАТОВ */}
      <section className="border-y border-slate-200/80 bg-white py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Честная открытая статистика</span>
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Не прячем минусы: все сыгранные матчи открыты для всех
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Как только матч заканчивается, мы открываем его для бесплатного просмотра со счетом и результатом. Вы сами видите реальную картину побед и поражений без прикрас.
              </p>

              <ul className="mt-5 space-y-2.5 text-xs font-medium text-slate-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Безопасный размер ставки 1.5%–2.5% от банка без риска слить бюджет
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Автоматический возврат 100% на счет сайта по застрахованным играм
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Криптографическая защита SHA-256 каждого прогноза до начала встречи
                  </span>
                </li>
              </ul>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <Link
                  href="/stats"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
                >
                  <span>Посчитать прибыль в рублях</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                {data?.brand.freeTelegramUrl && (
                  <a
                    href={data.brand.freeTelegramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Send className="h-3.5 w-3.5 text-blue-600" />
                    <span>Наш Telegram-канал</span>
                  </a>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-slate-200 bg-[#F8FAFC] p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    Динамика игрового банка по месяцам
                  </span>
                  <span className="font-mono text-xs font-bold text-emerald-600">
                    +{allTimeStats?.netProfitUnits.toFixed(1) ?? '18.4'}% к начальному банку
                  </span>
                </div>
                <EquityCurveChart points={data?.equityCurve ?? []} />
              </div>
            </div>
          </div>

          {/* Последние сыгранные матчи */}
          {settledList.length > 0 && (
            <div className="mt-10">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-slate-950 sm:text-lg">
                  Недавно завершившиеся матчи (открытый архив)
                </h3>
                <Link
                  href="/stats"
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Смотреть всю историю →
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

      {/* 5. ИНТЕРАКТИВНЫЕ ОТВЕТЫ НА ЧАСТЫЕ ВОПРОСЫ */}
      <section
        id="faq"
        className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Вопросы и ответы</span>
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Частые вопросы перед первой покупкой
          </h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaqIdx === idx;
            return (
              <div
                key={item.q}
                className="self-start rounded-2xl border border-slate-200 bg-white shadow-2xs transition hover:border-slate-300"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
                >
                  <span className="text-sm font-extrabold text-slate-950">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-blue-600' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-xs leading-relaxed text-slate-600 sm:px-5 sm:pb-5">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 6. ФИНАЛЬНЫЙ БАННЕР TELEGRAM И ПОДДЕРЖКИ */}
        <div className="hero-surface mt-10 overflow-hidden rounded-3xl border border-slate-800 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-300">
                <Send className="h-3.5 w-3.5" />
                <span>Открытое сообщество и поддержка 24/7</span>
              </div>
              <h2 className="mt-2.5 text-xl font-black tracking-tight sm:text-2xl">
                Следите за бесплатными анонсами матчей и отчетами в Telegram
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300 sm:text-sm">
                В канале мы ежедневно публикуем открытые разборы матчей дня, итоги игровых вечеров и промокоды на скидку. А если нужна помощь с выбором — напишите в поддержку.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:shrink-0">
              <a
                href={data?.brand.freeTelegramUrl ?? 'https://t.me/valuex_open'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-extrabold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 sm:text-sm"
              >
                <Send className="h-4 w-4" />
                <span>Подписаться на канал</span>
              </a>
              <a
                href={data?.brand.supportTelegram ?? 'https://t.me/valuex_support'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-xs font-bold text-white transition hover:bg-white/15 sm:text-sm"
              >
                <span>Задать вопрос поддержке</span>
              </a>
            </div>
          </div>
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

function aSum(a: number, b: number): number {
  return a + b;
}
