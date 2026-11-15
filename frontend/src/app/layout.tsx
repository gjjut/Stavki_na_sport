import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { AnalyticsConsentMonitor } from '@/components/layout/AnalyticsConsent';
import { configuredSiteOrigin } from '@/lib/site-origin';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B0F19',
};

const siteOrigin = configuredSiteOrigin();

export const metadata: Metadata = {
  ...(siteOrigin ? { metadataBase: new URL(siteOrigin) } : {}),
  title: 'VALUEX — Понятные прогнозы на спорт без подписок',
  description:
    'Разовые спортивные прогнозы и аналитические материалы. Результат спортивного события не гарантирован.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="scroll-smooth">
      <body className="min-h-screen overflow-x-hidden bg-[#F4F6FA] font-sans text-slate-900 antialiased">
        <AnalyticsConsentMonitor />
        {children}
      </body>
    </html>
  );
}
