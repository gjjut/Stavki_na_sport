'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CheckCircle2,
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
    step: 'Шаг 1',
    title: 'Выбираете понятный вам матч',
    text: 'Смотрите расписание игр РПЛ, КХЛ, Лиги Чемпионов, тенниса или UFC. Можете сначала открыть бесплатный прогноз дня за 0 ₽.',
  },
  {
    step: 'Шаг 2',
    title: 'Оплачиваете разово (без подписок)',
    text: 'Никаких платных подписок и привязки карты. Оплата СБП или картой МИР только за выбранную игру (или набор со скидкой до 25%).',
  },
  {
    step: 'Шаг 3',
    title: 'Ставите у своего букмекера',
    text: 'Мы показываем простыми словами, какую именно кнопку нажать в Фонбет, Винлайн, Пари или Бетбум и какую сумму безопасно выделить.',
  },
  {
    step: 'Шаг 4',
    title: 'Страховка 100%, если не зайдет',
    text: 'Если застрахованный прогноз не сыграл — вся сумма покупки автоматически вернется на ваш баланс сайта на следующий матч.',
  },
];

const FAQ_ITEMS = [
  {
    q: 'Вы букмекерская контора или аналитический сайт?',
    a: 'Мы аналитический сервис, а не букмекер. У нас вы покупаете готовый разбор и точную рекомендацию на матч, а саму ставку делаете самостоятельно в своем привычном легальном приложении (Фонбет, Винлайн, Пари, Бетбум и др.).',
  },
  {
    q: 'Что именно я увижу сразу после оплаты прогноза?',
    a: 'На странице матча мгновенно откроются: 1) точное название ставки как в российских БК, 2) понятная подсказка, при каком счете ставка выиграет, 3) рабочий коэффициент и безопасный размер ставки в рублях, 4) подробное объяснение аналитика.',
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
    a: 'До стартового свистка каждый прогноз запечатывается цифровым кодом защиты. После окончания встречи все матчи (и плюсовые, и минусовые) открываются в архиве — любой посетитель может нажать кнопку проверки и убедиться, что исход не менялся.',
  },
];

export default function HomePage() {
  const { data, reload } = usePublicPlatform();
  const [sportFilter, setSportFilter] = useState<SportType | 'ALL'>('ALL');
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [hashModalItem, setHashModalItem] = useState<PublicPredictionDto | null>(null);
  const [copiedPromo, setCopiedPromo] = useState(false);

  const defaultPrice = data?.brand.defaultSinglePriceRub ?? 790;
  const bundle2Pct = data?.brand.bundle2DiscountPct ?? 15;
  const bundle3Pct = data?.brand.bundle3DiscountPct ?? 25;
  const allTimeStats = data?.statsByPeriod.ALL_TIME;

  const allPredictions = data?.predictions ?? [];
  const activeList = allPredictions.filter((p) => p.resultStatus === 'PENDING');
  const settledList = allPredictions.filter((p) => p.resultStatus !== 'PENDING');
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
      {/* 1. ПОНЯТНЫЙ ПЕРВЫЙ ЭКРАН + ГЛАВНЫЙ МАТЧ ДНЯ */}
      <section className="bg-[#0B0F19] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
            {/* Левая колонка человеческим языком */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-medium text-slate-200">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>Поштучные прогнозы на спорт · Без подписок и автосписаний</span>
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-[40px] lg:leading-[1.14]">
                Понятные прогнозы на футбол и хоккей —{' '}
                <span className="text-blue-400">платите только за выбранный матч</span>
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Выбирайте интересную игру, получайте точную рекомендацию простыми словами для вашего приложения БК (Фонбет, Винлайн, Пари, Бетбум), а если прогноз не зайдет — мы вернем 100% стоимости на ваш баланс для следующего матча.
              </p>

              {/* Быстрые понятные кнопки для первого визита */}
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#upcoming-matches"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500"
                >
                  <span>Выбрать матч на сегодня</span>
                  <ArrowRight className="h-4 w-4" />
                </a>

                {freePickToday && (
                  <Link
                    href={`/predictions/${freePickToday.slug}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    <Gift className="h-4 w-4 text-emerald-400" />
                    <span>Бесплатный прогноз дня (0 ₽)</span>
                  </Link>
                )}
              </div>

              {/* Показатели на простом русском языке */}
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Прирост к банку
                  </div>
                  <div className="mt-0.5 font-mono text-xl font-black text-emerald-400">
                    +{allTimeStats ? allTimeStats.netProfitUnits.toFixed(1) : '18.4'}%
                  </div>
                  <div className="text-[10px] text-slate-400">По открытой истории</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Угадано прогнозов
                  </div>
                  <div className="mt-0.5 font-mono text-xl font-black text-white">
                    {allTimeStats ? allTimeStats.winRatePct.toFixed(0) : '68'}%
                  </div>
                  <div className="text-[10px] text-slate-400">Точность на дистанции</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Средний коэффициент
                  </div>
                  <div className="mt-0.5 font-mono text-xl font-black text-blue-400">
                    {allTimeStats ? allTimeStats.avgOdds.toFixed(2) : '1.94'}
                  </div>
                  <div className="text-[10px] text-slate-400">По линии БК РФ</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Страховка при минусе
                  </div>
                  <div className="mt-0.5 font-mono text-xl font-black text-white">
                    100%
                  </div>
                  <div className="text-[10px] text-slate-400">Возврат на баланс</div>
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
                      <span>Главный матч дня</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-300">
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
                      <span>Если ставка не зайдет — вернем 100% суммы на баланс</span>
                    </div>
                  )}

                  <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
                    {featuredEvent.analysisTeaser}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-white/10 py-3 text-xs text-slate-300">
                    <div>
                      Безопасная ставка:{' '}
                      <strong className="font-mono text-white">
                        {featuredEvent.stakeUnits.toFixed(1)}% банка
                      </strong>
                    </div>
                    <div>
                      БК:{' '}
                      <strong className="text-white">{featuredEvent.bookmakerSource}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHashModalItem(featuredEvent)}
                      className="ml-auto inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Защита от подмены</span>
                    </button>
                  </div>

                  {!featuredEvent.isLocked ? (
                    <div className="mt-4 flex items-center justify-between rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3.5">
                      <div>
                        <div className="text-[11px] text-blue-300">Что ставить у букмекера</div>
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
                          <span>Разовая покупка (СБП / МИР)</span>
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
                        <span>Открыть прогноз</span>
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

      {/* 2. БЛОК «КАК ЭТО РАБОТАЕТ» ПРОСТЫМИ СЛОВАМИ */}
      <section id="how-it-works" className="border-b border-slate-200/80 bg-white py-9">
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS_STEPS.map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-4"
              >
                <span className="inline-block rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                  {item.step}
                </span>
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

      {/* 3. ВИТРИНА МАТЧЕЙ (3 КАРТОЧКИ В РЯД) */}
      <section
        id="upcoming-matches"
        className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      >
        {/* Понятная полоска скидок и промокода с копированием в 1 клик */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-3.5 shadow-xs">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 font-bold text-blue-700">
              <Layers className="h-3.5 w-3.5" />
              <span>Скидка за набор:</span>
            </span>
            <span>
              возьмите 2 матча со скидкой <strong>−{bundle2Pct}%</strong> или 3 матча со скидкой{' '}
              <strong>−{bundle3Pct}%</strong> (нажмите «+ В набор» на карточках)
            </span>
          </div>

          <button
            type="button"
            onClick={copyPromo}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
          >
            <Tag className="h-3.5 w-3.5 text-blue-600" />
            <span>Промокод −15% на первый заказ:</span>
            <code className="font-mono font-black text-slate-950">START15</code>
            {copiedPromo ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3 w-3 text-slate-400" />
            )}
          </button>
        </div>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">
              Прогнозы на ближайшие матчи
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Выберите матч — точная ставка, рабочий коэффициент и разбор откроются мгновенно после оплаты
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
            В выбранном виде спорта сейчас нет матчей. Нажмите «Все матчи», чтобы увидеть всю линию.
          </div>
        )}
      </section>

      {/* 4. ОТКРЫТАЯ ИСТОРИЯ РЕЗУЛЬТАТОВ */}
      <section className="border-y border-slate-200/80 bg-white py-12">
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
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Безопасный размер ставки 1.5%–2.5% от банка без риска слить бюджет</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Автоматический возврат 100% на счет сайта по застрахованным играм</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Цифровая защита каждого прогноза до начала встречи</span>
                </li>
              </ul>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/stats"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
                >
                  <span>Посчитать прибыль в рублях</span>
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
                    <span>Наш Telegram-канал</span>
                  </a>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-slate-200 bg-[#F8FAFC] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Как рос игровой банк по месяцам
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
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-slate-950">
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

      {/* 5. ОТВЕТЫ НА ЧАСТЫЕ ВОПРОСЫ ОБЫЧНОГО ЧЕЛОВЕКА */}
      <section id="faq" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Вопросы и ответы</span>
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Частые вопросы перед первой покупкой
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {FAQ_ITEMS.map((item) => (
            <div
              key={item.q}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
            >
              <h3 className="text-sm font-extrabold text-slate-950">{item.q}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{item.a}</p>
            </div>
          ))}
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
