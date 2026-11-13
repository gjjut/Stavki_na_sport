import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VALUEX PRO — Верифицированная платформа спортивной аналитики (+EV)',
  description:
    'Прозрачная спортивная аналитика с криптографической фиксацией коэффициентов (SHA-256), системой Флэт и верифицированным Yield.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark">
      <body className="min-h-screen bg-slate-950 font-sans text-slate-100">{children}</body>
    </html>
  );
}
