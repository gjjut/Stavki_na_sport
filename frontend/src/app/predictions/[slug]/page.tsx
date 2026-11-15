import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { configuredSiteOrigin } from '@/lib/site-origin';
import Link from 'next/link';
import { readState, toPublicPredictionDto } from '@/server/database';
import { getOptionalViewer } from '@/server/guards';
import { canAccessLegacyStarterDemoPrediction, isLegacyStarterDemoPrediction } from '@/server/prediction-data-policy';
import { PredictionDetailClient } from '@/components/predictions/PredictionDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}): Promise<Metadata> {
  const { slug } = await params;
  const state = await readState();
  const prediction = state.predictions.find((p) => p.slug === slug);

  if (!prediction || isLegacyStarterDemoPrediction(prediction)) {
    return {
      title: `Матч не найден | ${state.settings.brandName}`,
      robots: { index: false, follow: false },
    };
  }

  const title = `${prediction.homeTeam} — ${prediction.awayTeam} (${prediction.leagueName}) · Прогноз на матч | ${state.settings.brandName}`;
  const description = `${prediction.analysisTeaser} Аналитический разбор; результат не гарантирован.${
    prediction.insuredOnLoss && prediction.accessTier === 'PAID_SINGLE' ? ' Начисление на баланс по условиям оферты.' : ''
  }`;

  const siteOrigin = configuredSiteOrigin();
  const pageUrl = siteOrigin ? `${siteOrigin}/predictions/${encodeURIComponent(prediction.slug)}` : null;
  return {
    title,
    description,
    ...(pageUrl ? { alternates: { canonical: pageUrl } } : {}),
    openGraph: {
      title,
      description,
      type: 'article',
      locale: 'ru_RU',
      siteName: state.settings.brandName,
      ...(pageUrl ? { images: [{ url: `${pageUrl}/opengraph-image`, width: 1200, height: 630, alt: `${prediction.homeTeam} — ${prediction.awayTeam}` }] } : {}),
    },
  };
}

export default async function PredictionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { slug } = await params;
  const state = await readState();
  const prediction = state.predictions.find((item) => item.slug === slug);
  if (!prediction) notFound();
  if (isLegacyStarterDemoPrediction(prediction)) {
    const viewer = await getOptionalViewer();
    if (!canAccessLegacyStarterDemoPrediction(prediction, viewer)) notFound();
    const privateRecord = toPublicPredictionDto(prediction, viewer);
    return (
      <main className="mx-auto min-h-screen max-w-3xl space-y-5 bg-slate-50 px-5 py-10 text-slate-900">
        <Link href="/cabinet" className="text-sm font-bold text-blue-700 underline">← В кабинет</Link>
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Старая демонстрационная запись сохранена только для вашего доступа и сверки истории. Это не актуальный прогноз; продажа и автоматическая сверка отключены.
        </div>
        <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-2xl font-black">{privateRecord.homeTeam} — {privateRecord.awayTeam}</h1>
          <p className="text-sm text-slate-600">{privateRecord.leagueName} · {privateRecord.matchStartsAt}</p>
          <p className="text-sm"><strong>Исход в записи:</strong> {privateRecord.selectionTitle} · коэффициент {privateRecord.fixedOdds}</p>
          <h2 className="text-lg font-bold">Сохранённый разбор</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{privateRecord.analysisFull || 'Разбор не сохранён.'}</p>
        </article>
      </main>
    );
  }
  return <PredictionDetailClient slug={slug} />;
}
