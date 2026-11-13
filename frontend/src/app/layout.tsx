import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VALUEX — Маркетплейс спортивной аналитики и прогнозов',
  description:
    'Разовый доступ к аналитическим разборам матчей с фиксацией коэффициентов (SHA-256) и открытой верифицированной статистикой.',
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
