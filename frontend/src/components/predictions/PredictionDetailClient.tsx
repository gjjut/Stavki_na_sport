'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
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
import type { PublicPredictionDto } from '@/server/types';

export const PredictionDetailClient: React.FC<{ slug: string }> = ({ slug }) => {
  const { data, reload } = usePublicPlatform();
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [hashModalItem, setHashModalItem] = useState<PublicPredictionDto | null>(null);

  const prediction = (data?.predictions ?? []).find((p) => p.slug === slug) ?? null;
  const defaultPrice = data?.brand.defaultSinglePriceRub ?? 890;

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
            <span>Назад к витрине прогнозов</span>
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
                    {new Date(prediction.matchStartsAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
                <span>
                  Рекомендуемый флэт:{' '}
                  <strong className="font-mono text-white">
                    {prediction.stakeUnits.toFixed(1)}%
                  </strong>
                </span>
                <span>
                  Букмекер:{' '}
                  <strong className="text-white">{prediction.bookmakerSource}</strong>
                </span>
              </div>
            </div>
          ) : (
            <h1 className="mt-4 text-2xl font-bold">Загрузка события...</h1>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        {prediction ? (
          <div className="space-y-6">
            {prediction.insuredOnLoss && prediction.accessTier === 'PAID_SINGLE' && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-950">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="text-xs leading-relaxed">
                  <strong className="font-bold">
                    Застрахованное событие (Гарантия 100% на баланс):
                  </strong>{' '}
                  если по итогам матча исход рассчитывается как проигрыш или возврат, полная сумма покупки автоматически начисляется на ваш кошелек личного кабинета для оплаты любых следующих событий.
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Предматчевое резюме
              </h2>
              <p className="mt-2 text-base leading-relaxed text-slate-700">
                {prediction.analysisTeaser}
              </p>

              <div className="mt-6 border-t border-slate-100 pt-6">
                {!prediction.isLocked ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600">
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Рекомендованный исход</span>
                        </div>
                        <div className="mt-1 text-xl font-black text-slate-950">
                          {prediction.selectionTitle}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-blue-200 bg-white px-4 py-2 text-right">
                        <div className="text-[11px] text-slate-400">Коэффициент</div>
                        <div className="font-mono text-2xl font-black text-blue-600">
                          {prediction.fixedOdds?.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 border-t border-blue-200/60 pt-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Полный аналитический разбор
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                        {prediction.analysisFull}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-start justify-between gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:flex-row sm:items-center">
                    <div>
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <Lock className="h-3.5 w-3.5 text-blue-600" />
                        <span>Платный индивидуальный разбор</span>
                      </div>
                      <div className="mt-1 text-lg font-extrabold text-slate-950">
                        Точный рынок, коэффициент и аргументация аналитика
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Разовая покупка одного этого матча без подписок. Доступна скидка по промокоду{' '}
                        <code className="font-mono font-bold text-slate-800">START15</code>.
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-4">
                      <div className="text-right">
                        <div className="text-[11px] text-slate-400">Цена</div>
                        <div className="font-mono text-2xl font-black text-slate-950">
                          {(prediction.singlePriceRub ?? defaultPrice).toLocaleString(
                            'ru-RU',
                          )}{' '}
                          ₽
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
                          className="rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700"
                        >
                          Купить прогноз
                        </button>
                      ) : (
                        <span className="rounded-xl bg-slate-200 px-4 py-3 text-xs font-bold text-slate-600">
                          Продажи закрыты
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <div className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>
                    SHA-256 слепок исхода:{' '}
                    <code className="font-mono text-slate-700">
                      {prediction.verificationHash.slice(0, 20)}...
                    </code>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setHashModalItem(prediction)}
                  className="font-bold text-blue-600 hover:underline"
                >
                  Проверить честность SHA-256 →
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
