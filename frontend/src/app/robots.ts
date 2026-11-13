import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://194.67.125.155').replace(
    /\/+$/,
    '',
  );

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/predictions', '/stats', '/legal/'],
        disallow: ['/admin', '/cabinet', '/api/', '/payment/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
