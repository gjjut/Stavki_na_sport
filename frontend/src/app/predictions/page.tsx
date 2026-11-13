'use client';

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
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
} from '@/components/predictions/PredictionCard';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type { PublicPredictionDto, SportType } from '@/server/types';

export default function PredictionsPage() {
  const { data, loading, reload } = usePublicPlatform();
  const [statusTab, setStatusTab] = useState<'ACTIVE' | 'ARCHIVE'>('ACTIVE');
  const [sportFilter, setSportFilter] = useState<'ALL' | SportType>('ALL');
  const [accessFilter, setAccessFilter] = useState<'ALL' | 'PAID_SINGLE' | 'FREE'>('ALL');
  const [query, setQuery] = useState('');
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<VerifiedHashPayload | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.predictions.filter((p) => {
      if (statusTab === 'ACTIVE' && p.matchStatus === 'FINISHED') return false;
      if (statusTab === 'ARCHIVE' && p.matchStatus !== 'FINISHED') return false;
      if (sportFilter !== 'ALL' && p.sport !== sportFilter) return false;
      if (accessFilter !== 'ALL' && p.accessTier !== accessFilter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = `${p.homeTeam} ${p.awayTeam} ${p.leagueName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, statusTab, sportFilter, accessFilter, query]);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] text-sm font-medium text-slate-500">
        Загрузка каталога событий...
      </div>
    );
  }

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
      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={data.viewer}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={reload}
      />
      <HashVerifyModal data={verifiedHash} onClose={() => setVerifiedHash(null)} />

      {/* Контрастная темная шапка раздела */}
      <div className="bg-[#0B0F19] py-10 text-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 sm:flex-row sm:items-end sm:px-6 lg:px-8">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-400">
              Маркетплейс прогнозов
            </div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
              Витрина спортивных событий
            </h1>
            <p className="mt-1.5 text-xs text-slate-400 sm:text-sm">
              Разовая покупка аналитических разборов без подписок и скрытых платежей
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-white/15 bg-white/5 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setStatusTab('ACTIVE')}
              className={`rounded-lg px-4 py-2 transition ${
                statusTab === 'ACTIVE'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Актуальные события
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('ARCHIVE')}
              className={`rounded-lg px-4 py-2 transition ${
                statusTab === 'ARCHIVE'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Архив расчетов
            </button>
          </div>
        </div>
      </div>

      {/* Панель фильтров и сетка карточек */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-1.5">
            {sportsList.map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setSportFilter(sp)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  sportFilter === sp
                    ? 'bg-[#0B0F19] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                {sp === 'ALL'
                  ? 'Все виды спорта'
                  : `${SPORT_LABELS[sp].icon} ${SPORT_LABELS[sp].label}`}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {statusTab === 'ACTIVE' && (
              <select
                value={accessFilter}
                onChange={(e) =>
                  setAccessFilter(e.target.value as 'ALL' | 'PAID_SINGLE' | 'FREE')
                }
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="ALL">Любой формат</option>
                <option value="PAID_SINGLE">Платные прогнозы</option>
                <option value="FREE">Бесплатные разборы</option>
              </select>
            )}

            <div className="relative flex-1 sm:w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по команде или лиге..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Сетка 3 карточки в ряд */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.length > 0 ? (
            filtered.map((pred) => (
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
            <div className="col-span-full rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
              По выбранным фильтрам событий не найдено.
            </div>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
