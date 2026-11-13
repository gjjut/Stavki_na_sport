'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
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
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type { PublicPredictionDto } from '@/server/types';

export default function PredictionDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { data, loading, reload } = usePublicPlatform();
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<VerifiedHashPayload | null>(null);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Загрузка прогноза...
      </div>
    );
  }

  const slug = decodeURIComponent(params.slug || '');
  const prediction = data.predictions.find((p) => p.slug === slug || p.id === slug);

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

  return (
    <SiteShell brand={data.brand} viewer={data.viewer} onViewerChange={() => reload()}>
      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={data.viewer}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={reload}
      />
      <HashVerifyModal data={verifiedHash} onClose={() => setVerifiedHash(null)} />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link
          href="/predictions"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Назад ко всем прогнозам</span>
        </Link>

        <div className="mt-5">
          {prediction ? (
            <PredictionCard
              prediction={prediction}
              showDetailLink={false}
              userReferenceBankrollRub={data.viewer?.referenceBankrollRub}
              defaultSinglePriceRub={data.brand.defaultSinglePriceRub}
              onBuySingle={handleBuySingle}
              onOpenVipPlans={() => router.push('/tariffs')}
              onVerifyHash={handleVerifyHash}
            />
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
              <h2 className="text-lg font-bold text-white">Матч не найден</h2>
              <p className="mt-2 text-sm text-slate-400">
                Возможно, ссылка устарела или событие было перенесено.
              </p>
              <Link
                href="/predictions"
                className="mt-5 inline-block rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950"
              >
                Перейти к ленте прогнозов
              </Link>
            </div>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
