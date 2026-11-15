'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  HelpCircle,
  Lock,
  MinusCircle,
  Share2,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { LocalDateTime } from '@/components/LocalDateTime';
import { SiteShell } from '@/components/layout/SiteShell';
import { PredictionCard } from '@/components/predictions/PredictionCard';
import { PredictionCardSkeleton } from '@/components/predictions/PredictionCardSkeleton';
import { TeamAvatar } from '@/components/predictions/TeamAvatar';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import {
  YooKassaCheckoutModal,
  type CheckoutModalTarget,
} from '@/components/billing/YooKassaCheckoutModal';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import { PublicLoadError } from '@/components/layout/PublicLoadError';
import { explainMarketInPlainRussian } from '@/lib/plain-russian';
import type { PublicPredictionDto } from '@/server/types';

export const PredictionDetailClient: React.FC<{ slug: string }> = ({ slug }) => {
  const { data, loading, error, reload } = usePublicPlatform();
  const [checkoutTarget, setCheckoutTarget] =
    useState<CheckoutModalTarget | null>(null);
  const [hashModalItem, setHashModalItem] =
    useState<PublicPredictionDto | null>(null);
  const [userBankRub, setUserBankRub] = useState<number>(20_000);
  const [copiedMatch, setCopiedMatch] = useState(false);

  const allPredictions = data?.predictions ?? [];
  const prediction = allPredictions.find((p) => p.slug === slug) ?? null;
  const defaultPrice = data?.brand.defaultSinglePriceRub ?? 790;

  const relatedMatches = allPredictions
    .filter(
      (p) =>
        p.slug !== slug &&
        p.resultStatus === 'PENDING' &&
        !p.salesClosed,
    )
    .slice(0, 3);

  const openCheckoutFor = (item: PublicPredictionDto) => {
    setCheckoutTarget({
      kind: 'SINGLE_PREDICTION',
      title: `${item.homeTeam} — ${item.awayTeam}`,
      subtitle: `${item.leagueName} · Разовая покупка прогноза`,
      priceRub: item.singlePriceRub ?? defaultPrice,
      predictionId: item.id,
      predictionIds: [item.id],
    });
  };

  const copyMatchForBookmaker = async () => {
    if (!prediction) return;
    await navigator.clipboard.writeText(
      `${prediction.homeTeam} ${prediction.awayTeam}`,
    );
    setCopiedMatch(true);
    window.setTimeout(() => setCopiedMatch(false), 2000);
  };

  const shareMatchInTelegram = () => {
    if (!prediction || typeof window === 'undefined') return;
    const refSuffix = data?.viewer?.referralCode
      ? `?ref=${encodeURIComponent(data.viewer.referralCode)}`
      : '';
    const pageUrl = `${window.location.origin}/predictions/${prediction.slug}${refSuffix}`;
    const text = `Разбор матча «${prediction.homeTeam} — ${prediction.awayTeam}» (${prediction.leagueName})`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const guide =
    prediction && !prediction.isLocked && prediction.selectionTitle
      ? explainMarketInPlainRussian(
          prediction.selectionTitle,
          prediction.homeTeam,
          prediction.awayTeam,
        )
      : null;

  const showMobileStickyBuy =
    Boolean(prediction) &&
    Boolean(prediction?.isLocked) &&
    !prediction?.salesClosed &&
    prediction?.resultStatus === 'PENDING';

  return (
    <SiteShell
      viewer={data?.viewer ?? null}
      brand={data?.brand ?? null}
      onViewerChange={() => reload()}
    >
      <PublicLoadError message={error} onRetry={() => void reload()} />
      {/* ШАПКА МАТЧА */}
      <div className="hero-surface py-8 text-white sm:py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Link
              href="/predictions"
              className="inline-flex items-center gap-1.5 font-semibold text-slate-300 transition hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Все прогнозы</span>
            </Link>
            {prediction && (
              <>
                <span>/</span>
                <span className="truncate text-blue-300">
                  {prediction.leagueName}
                </span>
              </>
            )}
          </div>

          {loading && !prediction ? (
            <div className="mt-4 animate-pulse space-y-3">
              <div className="h-4 w-48 rounded bg-white/10" />
              <div className="h-9 w-80 max-w-full rounded bg-white/15" />
              <div className="h-4 w-64 rounded bg-white/10" />
            </div>
          ) : prediction ? (
            <div className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                    {prediction.leagueName}
                  </span>
                  {prediction.resultStatus !== 'PENDING' && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        prediction.resultStatus === 'WIN' ||
                        prediction.resultStatus === 'CASHOUT'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : prediction.resultStatus === 'PUSH'
                            ? 'bg-white/10 text-slate-300'
                            : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {prediction.resultStatus === 'WIN' ||
                      prediction.resultStatus === 'CASHOUT' ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Прогноз зашел</span>
                        </>
                      ) : prediction.resultStatus === 'PUSH' ? (
                        <>
                          <MinusCircle className="h-3.5 w-3.5" />
                          <span>Возврат</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Не зашел</span>
                        </>
                      )}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <TeamAvatar
                      team={prediction.homeTeam}
                      sport={prediction.sport}
                      logoUrl={prediction.homeLogoUrl}
                      size="xl"
                      variant="dark"
                    />
                    <span className="text-xl font-black tracking-tight text-white sm:text-3xl">
                      {prediction.homeTeam}
                    </span>
                  </div>

                  {prediction.finalScore ? (
                    <span className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-1 font-mono text-lg font-black text-blue-300 sm:text-2xl">
                      {prediction.finalScore}
                    </span>
                  ) : (
                    <span className="rounded-xl border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-xs font-black uppercase tracking-widest text-slate-400">
                      VS
                    </span>
                  )}

                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <TeamAvatar
                      team={prediction.awayTeam}
                      sport={prediction.sport}
                      logoUrl={prediction.awayLogoUrl}
                      size="xl"
                      variant="dark"
                    />
                    <span className="text-xl font-black tracking-tight text-white sm:text-3xl">
                      {prediction.awayTeam}
                    </span>
                  </div>
                </div>

                <h1 className="sr-only">
                  {prediction.homeTeam} — {prediction.awayTeam}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-blue-400" />
                    <span>
                      Начало:{' '}
                      <LocalDateTime
                        value={prediction.matchStartsAt}
                        format="long"
                      />
                    </span>
                  </span>
                  <span>
                    Рекомендуемая ставка:{' '}
                    <strong className="font-mono text-white">
                      {prediction.stakeUnits.toFixed(1)}% от банка
                    </strong>
                  </span>
                  <span>
                    Линия БК:{' '}
                    <strong className="text-white">
                      {prediction.bookmakerSource}
                    </strong>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={shareMatchInTelegram}
                className="inline-flex self-start rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10 hover:text-white lg:self-auto"
              >
                <Share2 className="mr-1.5 h-3.5 w-3.5 text-sky-400" />
                <span>Поделиться в Telegram</span>
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <h1 className="text-xl font-bold">{error && !data ? 'Данные временно недоступны' : 'Матч не найден'}</h1>
              {!error && <p className="mt-1 text-xs text-slate-400">Возможно, событие было перенесено. Выберите другой актуальный матч в каталоге.</p>}
            </div>
          )}
        </div>
      </div>

      {/* ДВУХКОЛОНОЧНЫЙ КОНТЕНТ НА ПК + АДАПТИВ НА МОБИЛЬНЫХ */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {loading && !prediction ? (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <PredictionCardSkeleton />
            </div>
            <div className="lg:col-span-4">
              <PredictionCardSkeleton />
            </div>
          </div>
        ) : prediction ? (
          <>
            <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
              {/* ЛЕВАЯ ОСНОВНАЯ КОЛОНКА (8/12) */}
              <div className="space-y-5 lg:col-span-8">
                {prediction.insuredOnLoss &&
                  prediction.accessTier === 'PAID_SINGLE' && (
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-950">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <div className="text-xs leading-relaxed">
                        <strong className="font-bold">
                          Начисление по программе «страховка»:
                        </strong>{' '}
                        при расчёте этого прогноза как проигрыш или возврат на баланс сайта начисляется стоимость оплаченного прогноза; в наборе — округлённая доля стоимости заказа. Это не возмещает проигранную ставку и не заменяет законный возврат денег.
                      </div>
                    </div>
                  )}

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Превью и контекст встречи
                    </h2>
                    {prediction.researchSources &&
                      prediction.researchSources.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          <Globe className="h-3 w-3 text-blue-600" />
                          <span>
                            Источники: {prediction.researchSources.slice(0, 3).join(', ')}
                          </span>
                        </span>
                      )}
                  </div>

                  <p className="mt-2.5 text-sm leading-relaxed text-slate-800 sm:text-base">
                    {prediction.analysisTeaser}
                  </p>

                  <div className="mt-6 border-t border-slate-100 pt-6">
                    {!prediction.isLocked ? (
                      <div className="space-y-5">
                        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 sm:p-6">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600">
                                <Sparkles className="h-3.5 w-3.5" />
                                <span>Какую ставку выбрать у букмекера</span>
                              </div>
                              <div className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
                                {prediction.selectionTitle}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-right shadow-2xs">
                              <div className="text-[11px] text-slate-400">
                                Коэффициент
                              </div>
                              <div className="font-mono text-2xl font-black text-blue-600">
                                {prediction.fixedOdds?.toFixed(2)}
                              </div>
                            </div>
                          </div>

                          {/* Шпаргалка простыми словами + Калькулятор суммы ставки */}
                          {guide && (
                            <div className="mt-5 grid gap-3 rounded-2xl border border-blue-200/80 bg-white p-4 text-xs sm:grid-cols-2">
                              <div>
                                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                  <HelpCircle className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                                  <span>Как найти в приложении БК:</span>
                                </div>
                                <p className="mt-1 leading-relaxed text-slate-600">
                                  {guide.whereToFindInBk}
                                  {prediction.minAcceptableOdds
                                    ? ` (ориентир коэффициента по оценке автора: от ${prediction.minAcceptableOdds.toFixed(2)}).`
                                    : ''}
                                </p>
                              </div>

                              <div>
                                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                  <span>Когда ваша ставка выиграет:</span>
                                </div>
                                <p className="mt-1 leading-relaxed text-slate-600">
                                  {guide.whenYouWin}
                                </p>
                              </div>

                              <div className="border-t border-slate-100 pt-3 sm:col-span-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                                    <Calculator className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                                    <span>
                                      Калькулятор вашей ставки (
                                      {prediction.stakeUnits.toFixed(1)}% банка):
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {[5000, 10000, 20000, 50000, 100000].map(
                                      (b) => (
                                        <button
                                          key={b}
                                          type="button"
                                          onClick={() => setUserBankRub(b)}
                                          className={`rounded-lg px-2 py-1 font-mono text-[11px] font-bold transition ${
                                            userBankRub === b
                                              ? 'bg-blue-600 text-white'
                                              : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                                          }`}
                                        >
                                          {(b / 1000).toFixed(0)}к ₽
                                        </button>
                                      ),
                                    )}
                                  </div>
                                </div>

                                {(() => {
                                  const recBetRub = Math.max(0, Math.round((userBankRub * prediction.stakeUnits) / 100));
                                  const oddsVal = prediction.fixedOdds;
                                  const totalPayoutRub = typeof oddsVal === 'number' && Number.isFinite(oddsVal) && oddsVal > 1
                                    ? Math.round(recBetRub * oddsVal)
                                    : null;
                                  const netWinRub = totalPayoutRub === null ? null : totalPayoutRub - recBetRub;
                                  return (
                                    <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center">
                                      <div>
                                        <div className="text-[10px] text-slate-500">
                                          Сумма ставки
                                        </div>
                                        <div className="font-mono text-xs font-black text-slate-950 sm:text-sm">
                                          {recBetRub.toLocaleString('ru-RU')} ₽
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] text-slate-500">
                                          Прибыль при выигрыше
                                        </div>
                                        <div className="font-mono text-xs font-black text-emerald-600 sm:text-sm">
                                          {netWinRub === null ? '—' : `+${netWinRub.toLocaleString('ru-RU')} ₽`}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] text-slate-500">
                                          Пример выплаты
                                        </div>
                                        <div className="font-mono text-xs font-black text-blue-600 sm:text-sm">
                                          {totalPayoutRub === null ? '—' : `${totalPayoutRub.toLocaleString('ru-RU')} ₽`}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Пример при полном выигрыше по указанному коэффициенту, без цены прогноза, налогов и комиссий. Реальные условия и расчёт определяет букмекер; выигрыш не гарантирован.</p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 sm:col-span-2">
                                <button
                                  type="button"
                                  onClick={copyMatchForBookmaker}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-white"
                                >
                                  {copiedMatch ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5 text-blue-600" />
                                  )}
                                  <span>
                                    {copiedMatch
                                      ? 'Скопировано для поиска в БК!'
                                      : 'Скопировать команды для поиска в БК'}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={shareMatchInTelegram}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                  <span>
                                    {data?.viewer
                                      ? 'Отправить другу (+бонус)'
                                      : 'Отправить другу в Telegram'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="mt-5 border-t border-blue-200/60 pt-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                              Подробное обоснование аналитика
                            </div>
                            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                              {prediction.analysisFull}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600">
                          <Lock className="h-3.5 w-3.5" />
                          <span>Разовый доступ без подписок</span>
                        </div>
                        <div className="mt-1 text-lg font-extrabold text-slate-950">
                          Что откроется на этой странице после подтверждения оплаты:
                        </div>

                        <ul className="mt-3.5 space-y-2 text-xs text-slate-700 sm:text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>
                              Выбранный исход и пояснение к нему
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>
                              Указанный коэффициент и пример расчёта; условия могут измениться
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>
                              Опубликованный аналитический разбор
                            </span>
                          </li>
                          {prediction.insuredOnLoss && (
                            <li className="flex items-start gap-2 font-semibold text-emerald-800">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                              <span>
                                Начисление на баланс при минусе или возврате по условиям оферты
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ПРАВАЯ ЛИПКАЯ КОЛОНКА НА ПК (4/12) */}
              <aside className="space-y-4 lg:sticky lg:top-24 lg:col-span-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
                  {prediction.isLocked ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">
                          Разовая покупка
                        </span>
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                          Без подписок
                        </span>
                      </div>

                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="font-mono text-3xl font-black text-slate-950">
                          {(
                            prediction.singlePriceRub ?? defaultPrice
                          ).toLocaleString('ru-RU')}{' '}
                          ₽
                        </span>
                        <span className="text-xs text-slate-400">
                          за 1 матч
                        </span>
                      </div>

                      <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        При оформлении можно проверить промокод{' '}
                        <code className="font-mono font-black text-slate-950">
                          START15
                        </code>
                      </div>

                      {!prediction.salesClosed ? (
                        <button
                          type="button"
                          onClick={() => openCheckoutFor(prediction)}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
                        >
                          <span>Открыть прогноз сейчас</span>
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      ) : (
                        <div className="mt-4 rounded-xl bg-slate-100 py-3 text-center text-xs font-bold text-slate-600">
                          Продажи закрыты — матч уже начался
                        </div>
                      )}

                      <div className="mt-3 text-center text-[11px] text-slate-400">
                        Карты МИР · СБП QR · Кассовый чек 54-ФЗ
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Доступ к матчу открыт</span>
                      </div>
                      <div className="mt-3 text-xs text-slate-500">
                        Рекомендованный исход:
                      </div>
                      <div className="mt-0.5 text-lg font-black text-slate-950">
                        {prediction.selectionTitle}
                      </div>
                      <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                        <span className="text-slate-500">Коэффициент:</span>
                        <span className="font-mono text-base font-black text-blue-600">
                          {prediction.fixedOdds?.toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Блок проверки SHA-256 */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>Контрольная сумма SHA-256</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    Отпечаток позволяет сравнить время матча, исход, коэффициент и долю банка. Это не цифровая подпись и не независимое доказательство даты: сохраните хеш заранее вне сайта для сравнения.
                  </p>
                  <button
                    type="button"
                    onClick={() => setHashModalItem(prediction)}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                  >
                    <span>Проверить цифровой отпечаток →</span>
                  </button>
                </div>
              </aside>
            </div>

            {/* БЛОК «ДРУГИЕ МАТЧИ СЕГОДНЯ» */}
            {relatedMatches.length > 0 && (
              <section className="mt-12 border-t border-slate-200/80 pt-10">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-black text-slate-950">
                      Другие актуальные прогнозы
                    </h2>
                    <p className="text-xs text-slate-500">
                      Выберите несколько событий в каталоге и проверьте действующую скидку при оформлении
                    </p>
                  </div>
                  <Link
                    href="/predictions"
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Смотреть весь каталог →
                  </Link>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {relatedMatches.map((rel) => (
                    <PredictionCard
                      key={rel.id}
                      prediction={rel}
                      defaultSinglePriceRub={defaultPrice}
                      onBuySingle={openCheckoutFor}
                      onVerifyHash={setHashModalItem}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>

      {/* ЛИПКАЯ МОБИЛЬНАЯ ПЛАШКА ПОКУПКИ НА СТРАНИЦЕ ЗАКРЫТОГО МАТЧА */}
      {showMobileStickyBuy && prediction && (
        <div className="fixed inset-x-0 bottom-[calc(3.85rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] backdrop-blur-md md:hidden">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-500">
                Разовый доступ {prediction.insuredOnLoss ? '· Начисление по условиям' : ''}
              </div>
              <div className="font-mono text-lg font-black text-slate-950">
                {(prediction.singlePriceRub ?? defaultPrice).toLocaleString(
                  'ru-RU',
                )}{' '}
                ₽
              </div>
            </div>
            <button
              type="button"
              onClick={() => openCheckoutFor(prediction)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md shadow-blue-600/25"
            >
              <span>Открыть прогноз</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={data?.viewer ?? null}
        paymentMode={data?.brand.paymentMode}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={reload}
      />

      <HashVerifyModal
        prediction={hashModalItem}
        onClose={() => setHashModalItem(null)}
      />
    </SiteShell>
  );
};
