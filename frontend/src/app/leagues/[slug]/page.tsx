import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LeagueLandingClient } from '@/components/predictions/LeagueLandingClient';
import { getSeoLeagueBySlug, SEO_LEAGUE_PAGES } from '@/lib/seo-leagues';

export function generateStaticParams() {
  return SEO_LEAGUE_PAGES.map((item) => ({ slug: item.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const cfg = getSeoLeagueBySlug(params.slug);
  if (!cfg) {
    return { title: 'Раздел не найден' };
  }

  return {
    title: cfg.metaTitle,
    description: cfg.metaDescription,
    openGraph: {
      title: cfg.metaTitle,
      description: cfg.metaDescription,
      type: 'website',
      locale: 'ru_RU',
    },
  };
}

export default function LeagueLandingPage({
  params,
}: {
  params: { slug: string };
}) {
  const cfg = getSeoLeagueBySlug(params.slug);
  if (!cfg) {
    notFound();
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: cfg.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <LeagueLandingClient leagueConfig={cfg} />
    </>
  );
}
