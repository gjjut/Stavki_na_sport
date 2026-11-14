import React from 'react';
import type { Metadata } from 'next';
import { readState } from '@/server/database';
import { PredictionDetailClient } from '@/components/predictions/PredictionDetailClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}): Promise<Metadata> {
  const { slug } = await params;
  const state = await readState();
  const prediction = state.predictions.find((p) => p.slug === slug);

  if (!prediction) {
    return {
      title: `Матч не найден | ${state.settings.brandName}`,
    };
  }

  const title = `${prediction.homeTeam} — ${prediction.awayTeam} (${prediction.leagueName}) · Прогноз на матч | ${state.settings.brandName}`;
  const description = `${prediction.analysisTeaser} Понятный разбор для Фонбет, Винлайн и Пари без подписок${
    prediction.insuredOnLoss ? ' + страховка 100% при минусе.' : '.'
  }`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      locale: 'ru_RU',
      siteName: state.settings.brandName,
    },
  };
}

export default async function PredictionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { slug } = await params;
  return <PredictionDetailClient slug={slug} />;
}
