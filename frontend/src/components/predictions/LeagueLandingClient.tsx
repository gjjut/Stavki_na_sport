'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { PredictionCard } from '@/components/predictions/PredictionCard';
import { PredictionCardSkeleton } from '@/components/predictions/PredictionCardSkeleton';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import { BundleCartBar } from '@/components/billing/BundleCartBar';
import {
  YooKassaCheckoutModal,
  type CheckoutModalTarget,
} from '@/components/billing/YooKassaCheckoutModal';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import { SEO_LEAGUE_PAGES, type SeoLeaguePageConfig } from '@/lib/seo-leagues';
import type { PublicPredictionDto } from '@/server/types';

export const LeagueLandingClient: React.FC<{
  leagueConfig: SeoLeaguePageConfig;
}> = ({ leagueConfig }) => {
  const { data, loading, reload } = usePublicPlatform();
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [hashItem, setHashItem] = useState<PublicPredictionDto | null>(null);

  const defaultPrice = data?.brand.defaultSinglePriceRub ?? 790;
  const bundle2Pct = data?.brand.bundle2DiscountPct ?? 15;
  const bundle3Pct = data?.brand.bundle3DiscountPct ?? 25;

  const allPredictions = data?.predictions ?? [];
  const matchingActive = allPredictions.filter((p) => {
    if (p.resultStatus !== 'PENDING') return false;
    if (p.sport !== leagueConfig.sportFilter) return false;
    const low = p.leagueName.toLowerCase();
    return (
      leagueConfig.leagueKeywords.some((kw) => low.includes(kw)) ||
      p.sport === leagueConfig.sportFilter
    );
  });

  const matchingSettled = allPredictions
    .filter(
      (p) => p.resultStatus !== 'PENDING' && p.sport === leagueConfig.sportFilter,
    )
    .slice(0, 6);

  const openSingleCheckout = (prediction: PublicPredictionDto) => {
    setCheckoutTarget({
      kind: 'SINGLE_PREDICTION',
      title: `${prediction.homeTeam} — ${prediction.awayTeam}`,
      subtitle: `${prediction.leagueName} · Разовая покупка прогноза`,
      priceRub: prediction.singlePriceRub ?? defaultPrice,
      predictionId: prediction.id,
      predictionIds: [prediction.id],
    });
  };

  const toggleBundle = (prediction: PublicPredictionDto) => {
    if (!prediction.isLocked || prediction.salesClosed) return;
    setSelectedBundleIds((prev) =>
      prev.includes(prediction.id)
        ? prev.filter((id) => id !== prediction.id)
        : [...prev, prediction.id],
    );
  };

  const selectedBundleItems = matchingActive.filter(
    (p) => selectedBundleIds.includes(p.id) && p.isLocked && !p.salesClosed,
  );

  const openBundleCheckout = () => {
    if (selectedBundleItems.length === 0) return;
    if (selectedBundleItems.length === 1) {
      openSingleCheckout(selectedBundleItems[0]);
      return;
    }
    const subtotal = selectedBundleItems.reduce(
      (a, p) => a + (p.singlePriceRub ?? defaultPrice),
      0,
    );
    const pct = selectedBundleItems.length >= 3 ? bundle3Pct : bundle2Pct;
    setCheckoutTarget({
      kind: 'BUNDLE_PREDICTIONS',
      title: `Набор из ${selectedBundleItems.length} прогнозов (−${pct}%)`,
      subtitle: selectedBundleItems
        .map((p) => `${p.homeTeam}—${p.awayTeam}`)
        .join(' · '),
      priceRub: Math.max(50, Math.round((subtotal * (100 - pct)) / 100)),
      originalPriceRub: subtotal,
      predictionIds: selectedBundleItems.map((p) => p.id),
    });
  };

  return (
    <SiteShell
      viewer={data?.viewer ?? null}
      brand={data?.brand ?? null}
      onViewerChange={() => reload()}
    >
      <section className="hero-surface py-10 text-white sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/predictions"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Все прогнозы и турниры</span>
          </Link>

          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-4xl">
            {leagueConfig.h1}
          </h1>
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-300 sm:text-sm">
            {leagueConfig.introText}
          </p>

          <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {SEO_LEAGUE_PAGES.map((item) => (
              <Link
                key={item.slug}
                href={`/leagues/${item.slug}`}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  item.slug === leagueConfig.slug
                    ? 'bg-blue-600 text-white'
                    : 'border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.shortTitle}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-black text-slate-950">
            Актуальные прогнозы направления ({matchingActive.length})
          </h2>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            <span>Страховка 100% на баланс · Скидка −15% по коду START15</span>
          </div>
        </div>

        {loading && !data ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <PredictionCardSkeleton key={n} />
            ))}
          </div>
        ) : matchingActive.length > 0 ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {matchingActive.map((p) => (
              <PredictionCard
                key={p.id}
                prediction={p}
                defaultSinglePriceRub={defaultPrice}
                onBuySingle={openSingleCheckout}
                onVerifyHash={setHashItem}
                inBundle={selectedBundleIds.includes(p.id)}
                onToggleBundle={toggleBundle}
              />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <div className="text-sm font-bold text-slate-900">
              Новые матчи этого турнира проверяются аналитическим отделом
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Посмотрите все открытые на сегодня прогнозы по другим топ-лигам:
            </p>
            <Link
              href="/predictions"
              className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-500"
            >
              Перейти ко всем матчам сегодня →
            </Link>
          </div>
        )}

        {matchingSettled.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-black text-slate-950">
              Недавно рассчитанные матчи дисциплины
            </h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {matchingSettled.map((p) => (
                <PredictionCard
                  key={p.id}
                  prediction={p}
                  defaultSinglePriceRub={defaultPrice}
                  onBuySingle={openSingleCheckout}
                  onVerifyHash={setHashItem}
                />
              ))}
            </div>
          </div>
        )}

        {/* SEO FAQ-блок с разметкой для Яндекса и Google */}
        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-black text-slate-950">
            Частые вопросы по прогнозам раздела
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {leagueConfig.faq.map((f) => (
              <div
                key={f.q}
                className="rounded-xl border border-slate-100 bg-slate-50 p-4"
              >
                <h3 className="text-xs font-extrabold text-slate-950">{f.q}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

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
          setCheckoutTarget(null);
          setSelectedBundleIds([]);
          await reload();
        }}
      />

      <HashVerifyModal
        prediction={hashItem}
        onClose={() => setHashItem(null)}
      />
    </SiteShell>
  );
};
