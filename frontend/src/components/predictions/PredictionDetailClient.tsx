'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  HelpCircle,
  Lock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import {
  YooKassaCheckoutModal,
  type CheckoutModalTarget,
} from '@/components/billing/YooKassaCheckoutModal';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import { explainMarketInPlainRussian } from '@/lib/plain-russian';
import type { PublicPredictionDto } from '@/server/types';

export const PredictionDetailClient: React.FC<{ slug: string }> = ({ slug }) => {
  const { data, reload } = usePublicPlatform();
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [hashModalItem, setHashModalItem] = useState<PublicPredictionDto | null>(null);

  const prediction = (data?.predictions ?? []).find((p) => p.slug === slug) ?? null;
  const defaultPrice = data?.brand.defaultSinglePriceRub ?? 790;

  const guide =
    prediction && !prediction.isLocked && prediction.selectionTitle
      ? explainMarketInPlainRussian(
          prediction.selectionTitle,
          prediction.homeTeam,
          prediction.awayTeam,
        )
      : null;

  return (
    <SiteShell
      viewer={data?.viewer ?? null}
      brand={data?.brand ?? null}
      onViewerChange={() => reload()}
    >
      <div className="bg-[#0B0F19] py-10 text-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/predictions"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Назад ко всем матчам</span>
          </Link>

          {prediction ? (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-400">
                {prediction.leagueName}
              </div>
              <h1 className="mt-1 text-2xl font-black sm:text-4xl">
                {prediction.homeTeam} — {prediction.awayTeam}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-blue-400" />
                  <span>
                    Начало матча:{' '}
                    {new Date(prediction.matchStartsAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
                <span>
                  Совет по сумме ставки:{' '}
                  <strong className="font-mono text-white">
                    {prediction.stakeUnits.toFixed(1)}% от вашего банка
                  </strong>
                </span>
                <span>
                  Где ставить:{' '}
                  <strong className="text-white">{prediction.bookmakerSource}</strong>
                </span>
              </div>
            </div>
          ) : (
            <h1 className="mt-4 text-2xl font-bold">Загружаем данные матча...</h1>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        {prediction ? (
          <div className="space-y-6">
            {prediction.insuredOnLoss && prediction.accessTier === 'PAID_SINGLE' && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-950">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="text-xs leading-relaxed">
                  <strong className="font-bold">
                    Действует бесплатная страховка 100%:
                  </strong>{' '}
                  если этот прогноз не зайдет (или по ставке будет возврат), полная стоимость покупки автоматически вернется на ваш счет в личном кабинете — и любой следующий прогноз на сайте вы заберете бесплатно.
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Кратко о матче
              </h2>
              <p className="mt-2 text-base leading-relaxed text-slate-800">
                {prediction.analysisTeaser}
              </p>

              <div className="mt-6 border-t border-slate-100 pt-6">
                {!prediction.isLocked ? (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-6">
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
                        <div className="rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-right">
                          <div className="text-[11px] text-slate-400">Коэффициент</div>
                          <div className="font-mono text-2xl font-black text-blue-600">
                            {prediction.fixedOdds?.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Понятная шпаргалка для обычного человека */}
                      {guide && (
                        <div className="mt-5 grid gap-3 rounded-2xl border border-blue-200/80 bg-white p-4 text-xs sm:grid-cols-2">
                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <HelpCircle className="h-3.5 w-3.5 text-blue-600" />
                              <span>Как найти в приложении БК:</span>
                            </div>
                            <p className="mt-1 leading-relaxed text-slate-600">
                              {guide.whereToFindInBk}
                              {prediction.minAcceptableOdds
                                ? ` (выгодно брать при коэффициенте от ${prediction.minAcceptableOdds.toFixed(2)} и выше).`
                                : ''}
                            </p>
                          </div>

                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Когда ваша ставка выиграет:</span>
                            </div>
                            <p className="mt-1 leading-relaxed text-slate-600">
                              {guide.whenYouWin}
                            </p>
                          </div>

                          <div className="border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 sm:col-span-2">
                            <strong className="text-slate-700">
                              Сколько безопасно поставить ({prediction.stakeUnits.toFixed(1)}% от банка):
                            </strong>{' '}
                            при банке 10 000 ₽ →{' '}
                            <span className="font-mono font-bold text-slate-800">
                              {Math.round(100 * prediction.stakeUnits)} ₽
                            </span>{' '}
                            · при банке 30 000 ₽ →{' '}
                            <span className="font-mono font-bold text-slate-800">
                              {Math.round(300 * prediction.stakeUnits)} ₽
                            </span>{' '}
                            · при банке 50 000 ₽ →{' '}
                            <span className="font-mono font-bold text-slate-800">
                              {Math.round(500 * prediction.stakeUnits)} ₽
                            </span>
                            .
                          </div>
                        </div>
                      )}

                      <div className="mt-5 border-t border-blue-200/60 pt-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Почему выбрана именно эта ставка (разбор аналитика)
                        </div>
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                          {prediction.analysisFull}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                    <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                      <div>
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600">
                          <Lock className="h-3.5 w-3.5" />
                          <span>Разовая покупка одного матча (без подписок)</span>
                        </div>
                        <div className="mt-1 text-lg font-extrabold text-slate-950">
                          Что откроется на этой странице сразу после оплаты:
                        </div>

                        <ul className="mt-3 space-y-1.5 text-xs text-slate-700">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            <span>
                              Точная ставка простыми словами (как в Фонбет, Винлайн, Пари и Бетбум)
                            </span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            <span>
                              Актуальный коэффициент и подсказка, какую сумму безопасно поставить
                            </span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            <span>
                              Понятное объяснение, за счет чего ставка должна сыграть
                            </span>
                          </li>
                          {prediction.insuredOnLoss && (
                            <li className="flex items-center gap-2 font-semibold text-emerald-800">
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                              <span>
                                Автоматический возврат 100% оплаты на баланс, если ставка не зайдет
                              </span>
                            </li>
                          )}
                        </ul>

                        <p className="mt-3 text-xs text-slate-500">
                          Новым покупателям скидка −15% по промокоду{' '}
                          <code className="rounded bg-white px-1.5 py-0.5 font-mono font-bold text-slate-900">
                            START15
                          </code>
                          .
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-stretch gap-2.5 sm:items-end">
                        <div className="sm:text-right">
                          <div className="text-[11px] text-slate-400">Стоимость доступа</div>
                          <div className="font-mono text-3xl font-black text-slate-950">
                            {(prediction.singlePriceRub ?? defaultPrice).toLocaleString(
                              'ru-RU',
                            )}{' '}
                            ₽
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Оплата картой МИР или СБП
                          </div>
                        </div>

                        {!prediction.salesClosed ? (
                          <button
                            type="button"
                            onClick={() =>
                              setCheckoutTarget({
                                kind: 'SINGLE_PREDICTION',
                                title: `${prediction.homeTeam} — ${prediction.awayTeam}`,
                                subtitle: `${prediction.leagueName} · Разовая покупка прогноза`,
                                priceRub: prediction.singlePriceRub ?? defaultPrice,
                                predictionId: prediction.id,
                                predictionIds: [prediction.id],
                              })
                            }
                            className="rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700"
                          >
                            Открыть прогноз
                          </button>
                        ) : (
                          <span className="rounded-xl bg-slate-200 px-4 py-3 text-xs font-bold text-slate-600">
                            Матч уже начался
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <div className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>
                    Прогноз зафиксирован до начала игры — подмена результата исключена
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setHashModalItem(prediction)}
                  className="font-bold text-blue-600 hover:underline"
                >
                  Как проверить честность →
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={data?.viewer ?? null}
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
