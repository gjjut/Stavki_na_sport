'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  const { data, loading, reload } = usePublicPlatform();
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<VerifiedHashPayload | null>(null);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] text-sm font-medium text-slate-500">
        Загрузка страницы события...
      </div>
    );
  }

  const slug = decodeURIComponent(params.slug || '');
  const prediction = data.predictions.find((p) => p.slug === slug || p.id === slug);
  const otherActive = data.predictions
    .filter((p) => p.id !== prediction?.id && p.matchStatus !== 'FINISHED')
    .slice(0, 3);

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

  return (
    <SiteShell brand={data.brand} viewer={data.viewer} onViewerChange={() => reload()}>
      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={data.viewer}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={reload}
      />
      <HashVerifyModal data={verifiedHash} onClose={() => setVerifiedHash(null)} />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/predictions"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Назад к витрине событий</span>
        </Link>

        <div className="mt-4">
          {prediction ? (
            <PredictionCard
              prediction={prediction}
              variant="detail"
              userReferenceBankrollRub={data.viewer?.referenceBankrollRub}
              defaultSinglePriceRub={data.brand.defaultSinglePriceRub}
              onBuySingle={handleBuySingle}
              onVerifyHash={handleVerifyHash}
            />
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
              <h2 className="text-xl font-extrabold text-slate-950">Событие не найдено</h2>
              <p className="mt-2 text-xs text-slate-500">
                Возможно, ссылка устарела или матч был перенесен.
              </p>
              <Link
                href="/predictions"
                className="mt-5 inline-block rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white"
              >
                Перейти к актуальным прогнозам
              </Link>
            </div>
          )}
        </div>

        {otherActive.length > 0 && (
          <div className="mt-12">
            <h3 className="text-xl font-black text-slate-950">Другие актуальные события</h3>
            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {otherActive.map((item) => (
                <PredictionCard
                  key={item.id}
                  prediction={item}
                  variant="grid"
                  userReferenceBankrollRub={data.viewer?.referenceBankrollRub}
                  defaultSinglePriceRub={data.brand.defaultSinglePriceRub}
                  onBuySingle={handleBuySingle}
                  onVerifyHash={handleVerifyHash}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
