import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://194.67.125.155',
  ),
  title: 'VALUEX — Понятные прогнозы на спорт без подписок',
  description:
    'Поштучные прогнозы на футбол, хоккей и топ-матчи с понятной инструкцией для БК РФ, страховкой 100% на баланс и честной открытой статистикой.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-[#F4F6FA] font-sans text-slate-900">{children}</body>
    </html>
  );
}
