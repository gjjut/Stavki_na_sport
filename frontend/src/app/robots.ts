import type { MetadataRoute } from 'next';
import { configuredSiteOrigin } from '@/lib/site-origin';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = configuredSiteOrigin();

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/predictions', '/stats', '/legal/'],
        disallow: ['/admin', '/cabinet', '/api/', '/payment/'],
      },
    ],
    ...(baseUrl ? { sitemap: `${baseUrl}/sitemap.xml` } : {}),
  };
}
