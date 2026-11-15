import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LeagueLandingClient } from '@/components/predictions/LeagueLandingClient';
import { getSeoLeagueBySlug, SEO_LEAGUE_PAGES } from '@/lib/seo-leagues';
import { configuredSiteOrigin } from '@/lib/site-origin';

export function generateStaticParams() {
  return SEO_LEAGUE_PAGES.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cfg = getSeoLeagueBySlug(slug);
  if (!cfg) {
    return { title: 'Раздел не найден' };
  }

  const siteOrigin = configuredSiteOrigin();
  return {
    title: cfg.metaTitle,
    description: cfg.metaDescription,
    ...(siteOrigin ? { alternates: { canonical: `${siteOrigin}/leagues/${encodeURIComponent(cfg.slug)}` } } : {}),
    openGraph: {
      title: cfg.metaTitle,
      description: cfg.metaDescription,
      type: 'website',
      locale: 'ru_RU',
    },
  };
}

export default async function LeagueLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cfg = getSeoLeagueBySlug(slug);
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
