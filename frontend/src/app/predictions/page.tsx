'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const { data, loading, reload } = usePublicPlatform();
  const [statusTab, setStatusTab] = useState<'ACTIVE' | 'ARCHIVE'>('ACTIVE');
  const [sportFilter, setSportFilter] = useState<'ALL' | SportType>('ALL');
  const [query, setQuery] = useState('');
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<VerifiedHashPayload | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.predictions.filter((p) => {
      if (statusTab === 'ACTIVE' && p.matchStatus === 'FINISHED') return false;
      if (statusTab === 'ARCHIVE' && p.matchStatus !== 'FINISHED') return false;
      if (sportFilter !== 'ALL' && p.sport !== sportFilter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = `${p.homeTeam} ${p.awayTeam} ${p.leagueName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, statusTab, sportFilter, query]);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Загрузка ленты прогнозов...
      </div>
    );
  }

  const handleBuySingle = (pred: PublicPredictionDto) => {
    setCheckoutTarget({
      kind: 'SINGLE_PREDICTION',
      title: `${pred.homeTeam} — ${pred.awayTeam}`,
      subtitle: 'Ординарный аналитический прогноз',
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

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
              Лента прогнозов
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Актуальные аналитические разборы и открытый архив рассчитанных встреч
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusTab('ACTIVE')}
              className={`rounded-lg px-4 py-2 transition ${
                statusTab === 'ACTIVE'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Предстоящие и LIVE
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('ARCHIVE')}
              className={`rounded-lg px-4 py-2 transition ${
                statusTab === 'ARCHIVE'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Архив завершенных
            </button>
          </div>
        </div>

        {/* Фильтр по видам спорта + Поиск */}
        <div className="mt-6 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div className="flex flex-wrap gap-1.5">
            {sportsList.map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setSportFilter(sp)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  sportFilter === sp
                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {sp === 'ALL'
                  ? 'Все дисциплины'
                  : `${SPORT_LABELS[sp].icon} ${SPORT_LABELS[sp].label}`}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Команда или турнир..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
        </div>

        {/* Список карточек */}
        <div className="mt-6 space-y-4">
          {filtered.length > 0 ? (
            filtered.map((pred) => (
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
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center text-sm text-slate-400">
              По выбранным параметрам прогнозов не найдено.
            </div>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
