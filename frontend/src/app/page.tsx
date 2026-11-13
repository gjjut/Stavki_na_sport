'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Crown,
  Lock,
  Send,
  ShieldCheck,
  TrendingUp,
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
import { PredictionCard } from '@/components/predictions/PredictionCard';
import { EquityCurveChart } from '@/components/stats/EquityCurveChart';
import { SocialProofToast } from '@/components/triggers/SocialProofToast';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type { PublicPredictionDto, TariffPlan } from '@/server/types';

export default function HomePage() {
  const router = useRouter();
  const { data, loading, reload } = usePublicPlatform();
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<VerifiedHashPayload | null>(null);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Загрузка аналитической платформы...
      </div>
    );
  }

  const stats = data.statsByPeriod.ALL_TIME;
  const activePredictions = data.predictions
    .filter((p) => p.matchStatus !== 'FINISHED')
    .slice(0, 3);

  const handleBuySingle = (pred: PublicPredictionDto) => {
    setCheckoutTarget({
      kind: 'SINGLE_PREDICTION',
      title: `${pred.homeTeam} — ${pred.awayTeam}`,
      subtitle: 'Ординарный аналитический прогноз',
      priceRub: pred.singlePriceRub ?? data.brand.defaultSinglePriceRub,
      predictionId: pred.id,
    });
  };

  const handleBuyTariff = (plan: TariffPlan) => {
    setCheckoutTarget({
      kind: 'VIP_SUBSCRIPTION',
      title: plan.name,
      subtitle: plan.subtitle,
      priceRub: plan.priceRub,
      planCode: plan.code,
      supportsAutoRenew: plan.code !== 'VIP_LIFETIME',
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

      {/* ПЕРВЫЙ ЭКРАН: ОФФЕР + КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ */}
      <section className="border-b border-slate-900 bg-gradient-to-b from-slate-900/50 to-slate-950 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Открытый архив прогнозов · Фиксация коэффициентов до матча</span>
            </div>

            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-5xl sm:leading-[1.12]">
              Спортивная аналитика на основе{' '}
              <span className="text-emerald-400">математического перевеса</span>
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Работаем строго по модели флэт-менеджмента (1–5% от банка) по глубоким рынкам. Никаких удаленных минусов и пустых обещаний — каждый исход фиксируется цифровой подписью до стартового свистка.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/predictions"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                <span>Смотреть актуальные прогнозы</span>
                <ArrowRight className="h-4 w-4" />
              </Link>

              <a
                href={data.brand.freeTelegramUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white transition hover:border-slate-700"
              >
                <Send className="h-4 w-4 text-sky-400" />
                <span>Бесплатный Telegram-канал</span>
              </a>
            </div>
          </div>

          {/* 4 главные метрики в одну чистую линию */}
          <div className="mt-12 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-400">Yield (доходность с оборота)</div>
              <div className="mt-1.5 font-mono text-2xl font-extrabold text-emerald-400 sm:text-3xl">
                {stats.yieldPct >= 0 ? '+' : ''}
                {stats.yieldPct.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                По {stats.settledCount} рассчитанным матчам
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-400">Чистая прибыль</div>
              <div className="mt-1.5 font-mono text-2xl font-extrabold text-white sm:text-3xl">
                {stats.netProfitUnits >= 0 ? '+' : ''}
                {stats.netProfitUnits.toFixed(2)} u
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                1 юнит = 1% от рабочего банка
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-400">Проходимость (Win Rate)</div>
              <div className="mt-1.5 font-mono text-2xl font-extrabold text-white sm:text-3xl">
                {stats.winRatePct.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                +{stats.wins} / −{stats.losses} / ={stats.pushes}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-400">Средний коэффициент</div>
              <div className="mt-1.5 font-mono text-2xl font-extrabold text-white sm:text-3xl">
                {stats.avgOdds.toFixed(2)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                По линии Pinnacle / крупных БК
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* АКТУАЛЬНЫЕ МАТЧИ НА СЕГОДНЯ */}
      <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-white">Ближайшие прогнозы</h2>
            <p className="mt-1 text-sm text-slate-400">
              Бесплатные разборы и закрытые ординары с повышенным математическим ожиданием
            </p>
          </div>
          <Link
            href="/predictions"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
          >
            <span>Все прогнозы и архив</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 space-y-4">
          {activePredictions.length > 0 ? (
            activePredictions.map((pred) => (
              <PredictionCard
                key={pred.id}
                prediction={pred}
                userReferenceBankrollRub={data.viewer?.referenceBankrollRub}
                defaultSinglePriceRub={data.brand.defaultSinglePriceRub}
                onBuySingle={handleBuySingle}
                onOpenVipPlans={() => router.push('/tariffs')}
                onVerifyHash={handleVerifyHash}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
              Линия анализируется. Новые матчи появятся в ближайшее время.
            </div>
          )}
        </div>
      </section>

      {/* ГРАФИК ПРИРОСТА БАНКА */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-white">Динамика доходности</h2>
            <p className="mt-1 text-sm text-slate-400">
              График строится автоматически на основе всех рассчитанных прогнозов без ручного редактирования
            </p>
          </div>
          <Link
            href="/stats"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
          >
            <span>Детальная статистика по видам спорта</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <EquityCurveChart points={data.equityCurve} />
      </section>

      {/* СТАНДАРТЫ ЧЕСТНОЙ АНАЛИТИКИ */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <Lock className="h-6 w-6 text-emerald-400" />
            <h3 className="mt-3 text-base font-bold text-white">
              Фиксация коэффициента до старта
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Исход, размер флэта и коэффициент подписываются алгоритмом SHA-256 при публикации. После завершения матча любой посетитель видит исход и может проверить его подлинность.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <TrendingUp className="h-6 w-6 text-emerald-400" />
            <h3 className="mt-3 text-base font-bold text-white">
              Строгий банк-менеджмент
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Учет ведется в универсальных юнитах (1–5% от банка), а не в вымышленных миллионах рублей. В личном кабинете встроен калькулятор под ваш реальный банк.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <Crown className="h-6 w-6 text-amber-400" />
            <h3 className="mt-3 text-base font-bold text-white">
              Мгновенная доставка в Telegram
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Участники VIP-клуба получают персональное приглашение в закрытый Telegram-канал с моментальными уведомлениями о выходе прогнозов до просадки линии.
            </p>
          </div>
        </div>
      </section>

      {/* ТАРИФЫ VIP-ПОДПИСКИ */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
            Доступ в закрытый VIP-клуб
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
            Все платные ординары, VIP-прогнозы на сайте и закрытый Telegram-канал в единой подписке
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {data.tariffs.map((plan) => (
            <div
              key={plan.code}
              className={`flex flex-col justify-between rounded-2xl border p-6 ${
                plan.popular
                  ? 'border-emerald-500/60 bg-slate-900 shadow-xl shadow-emerald-950/30'
                  : 'border-slate-800 bg-slate-900/65'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-bold text-white">{plan.name}</span>
                  {plan.popular && (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                      Популярный
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">{plan.subtitle}</p>

                <div className="mt-5 flex items-baseline gap-2.5">
                  <span className="font-mono text-3xl font-extrabold text-white">
                    {plan.priceRub.toLocaleString('ru-RU')} ₽
                  </span>
                  {plan.oldPriceRub > plan.priceRub && (
                    <span className="font-mono text-sm text-slate-500 line-through">
                      {plan.oldPriceRub.toLocaleString('ru-RU')} ₽
                    </span>
                  )}
                </div>

                <ul className="mt-5 space-y-2.5 text-xs text-slate-300">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => handleBuyTariff(plan)}
                className={`mt-6 w-full rounded-xl py-3 text-sm font-bold transition ${
                  plan.popular
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    : 'border border-slate-700 bg-slate-950 text-white hover:border-emerald-500/50'
                }`}
              >
                Оформить доступ
              </button>
            </div>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
