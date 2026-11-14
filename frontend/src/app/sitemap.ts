import type { MetadataRoute } from 'next';
import { SEO_LEAGUE_PAGES } from '@/lib/seo-leagues';
import { readState } from '@/server/database';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://194.67.125.155').replace(
    /\/+$/,
    '',
  );
  const state = await readState();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: `${baseUrl}/predictions`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/stats`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/legal/offer`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];

  const leagueRoutes: MetadataRoute.Sitemap = SEO_LEAGUE_PAGES.map((lg) => ({
    url: `${baseUrl}/leagues/${lg.slug}`,
    lastModified: new Date(),
    changeFrequency: 'hourly',
    priority: 0.88,
  }));

  const matchRoutes: MetadataRoute.Sitemap = state.predictions
    .slice(0, 200)
    .map((pred) => ({
      url: `${baseUrl}/predictions/${pred.slug}`,
      lastModified: new Date(pred.settledAt || pred.createdAt),
      changeFrequency: pred.resultStatus === 'PENDING' ? 'hourly' : 'weekly',
      priority: pred.resultStatus === 'PENDING' ? 0.85 : 0.65,
    }));

  return [...staticRoutes, ...leagueRoutes, ...matchRoutes];
}
