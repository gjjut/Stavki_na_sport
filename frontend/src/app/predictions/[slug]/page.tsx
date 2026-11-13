import React from 'react';
import type { Metadata } from 'next';
import { readState } from '@/server/database';
import { PredictionDetailClient } from '@/components/predictions/PredictionDetailClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const state = await readState();
  const prediction = state.predictions.find((p) => p.slug === slug);

  if (!prediction) {
    return {
      title: `Событие не найдено | ${state.settings.brandName}`,
    };
  }

  const title = `${prediction.homeTeam} — ${prediction.awayTeam} (${prediction.leagueName}) · Прогноз | ${state.settings.brandName}`;
  const description = `${prediction.analysisTeaser} Рекомендуемый флэт ${prediction.stakeUnits.toFixed(1)}%. Проверка честности SHA-256 до стартового свистка.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: state.settings.brandName,
    },
  };
}

export default async function PredictionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PredictionDetailClient slug={slug} />;
}
