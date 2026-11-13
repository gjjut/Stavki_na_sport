'use client';

import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { PredictionCard } from '@/components/predictions/PredictionCard';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import { BundleCartBar } from '@/components/billing/BundleCartBar';
import {
  YooKassaCheckoutModal,
  type CheckoutModalTarget,
} from '@/components/billing/YooKassaCheckoutModal';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type { PublicPredictionDto, SportType } from '@/server/types';

export default function PredictionsCatalogPage() {
  const { data, reload } = usePublicPlatform();
  const [mode, setMode] = useState<'ACTIVE' | 'TODAY' | 'INSURED' | 'FREE' | 'SETTLED'>(
    'ACTIVE',
  );
  const [sport, setSport] = useState<SportType | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'SOONEST' | 'CONFIDENCE' | 'PRICE_ASC'>('SOONEST');
  const [search, setSearch] = useState('');
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [hashModalItem, setHashModalItem] = useState<PublicPredictionDto | null>(null);

  const defaultPrice = data?.brand.defaultSinglePriceRub ?? 790;
  const bundle2Pct = data?.brand.bundle2DiscountPct ?? 15;
  const bundle3Pct = data?.brand.bundle3DiscountPct ?? 25;

  const allPredictions = data?.predictions ?? [];
  const activePredictions = allPredictions.filter((p) => p.resultStatus === 'PENDING');
  const settledPredictions = allPredictions.filter((p) => p.resultStatus !== 'PENDING');

  const openSingleCheckout = (prediction: PublicPredictionDto) => {
    const price = prediction.singlePriceRub ?? defaultPrice;
    setCheckoutTarget({
      kind: 'SINGLE_PREDICTION',
      title: `${prediction.homeTeam} — ${prediction.awayTeam}`,
      subtitle: `${prediction.leagueName} · Разовая покупка прогноза`,
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

  const selectedBundleItems = activePredictions.filter(
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

  const baseItems =
    mode === 'SETTLED'
      ? settledPredictions
      : mode === 'TODAY'
        ? activePredictions.filter((p) => {
            const diffHrs =
              (new Date(p.matchStartsAt).getTime() - Date.now()) / 3_600_000;
            return diffHrs > -2 && diffHrs <= 18;
          })
        : mode === 'FREE'
          ? activePredictions.filter((p) => p.accessTier === 'FREE')
          : mode === 'INSURED'
            ? activePredictions.filter((p) => p.insuredOnLoss)
            : activePredictions;

  const filtered = baseItems
    .filter((item) => {
      if (sport !== 'ALL' && item.sport !== sport) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.homeTeam.toLowerCase().includes(q) ||
          item.awayTeam.toLowerCase().includes(q) ||
          item.leagueName.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (mode === 'SETTLED') {
        return (
          new Date(b.matchStartsAt).getTime() - new Date(a.matchStartsAt).getTime()
        );
      }
      if (sortBy === 'CONFIDENCE') {
        return b.stakeUnits - a.stakeUnits;
      }
      if (sortBy === 'PRICE_ASC') {
        return (a.singlePriceRub ?? 0) - (b.singlePriceRub ?? 0);
      }
      return (
        new Date(a.matchStartsAt).getTime() - new Date(b.matchStartsAt).getTime()
      );
    });

  return (
    <SiteShell
      viewer={data?.viewer ?? null}
      brand={data?.brand ?? null}
      onViewerChange={() => reload()}
    >
      <div className="bg-[#0B0F19] py-10 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-black tracking-tight">Прогнозы на матчи</h1>
          <p className="mt-1.5 text-sm text-slate-300">
            Выберите один интересующий матч или соберите набор из 2–3 игр со скидкой до −{bundle3Pct}% (без подписок)
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Понятные фильтры */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['ACTIVE', 'Ближайшие матчи'],
                ['TODAY', '🔥 Матчи сегодня'],
                ['INSURED', 'Со страховкой 100%'],
                ['FREE', 'Бесплатные (0 ₽)'],
                ['SETTLED', 'Завершенные (архив)'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  mode === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {mode !== 'SETTLED' && (
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as 'SOONEST' | 'CONFIDENCE' | 'PRICE_ASC',
                  )
                }
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                <option value="SOONEST">Сначала ближайшие</option>
                <option value="CONFIDENCE">Выше надежность</option>
                <option value="PRICE_ASC">Сначала бесплатные / дешевле</option>
              </select>
            )}

            <select
              value={sport}
              onChange={(e) => setSport(e.target.value as SportType | 'ALL')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="ALL">Все виды спорта</option>
              <option value="FOOTBALL">Футбол</option>
              <option value="HOCKEY">Хоккей</option>
              <option value="TENNIS">Теннис</option>
              <option value="ESPORTS">Киберспорт</option>
              <option value="BASKETBALL">Баскетбол</option>
              <option value="MMA">ММА / UFC</option>
            </select>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Найти команду или лигу..."
                className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Сетка 3 карточки в ряд */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((prediction) => (
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

        {filtered.length === 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            По вашему запросу матчей не найдено — попробуйте переключить фильтр на «Ближайшие матчи».
          </div>
        )}
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
