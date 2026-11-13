'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LogOut,
  Menu,
  Send,
  Settings,
  ShoppingBag,
  Wallet,
  X,
} from 'lucide-react';
import type { SafeSessionUser } from '@/server/types';

export interface PublicBrandInfo {
  brandName: string;
  supportTelegram: string;
  freeTelegramUrl: string;
  legalSellerName: string;
  legalInn: string;
  supportEmail: string;
  paymentMode: 'TEST_INSTANT' | 'YOOKASSA_LIVE';
  defaultSinglePriceRub: number;
}

interface SiteShellProps {
  brand: PublicBrandInfo;
  viewer: SafeSessionUser | null;
  onViewerChange?: (next: SafeSessionUser | null) => void;
  children: React.ReactNode;
}

const NAV_LINKS = [
  { href: '/', label: 'Главная' },
  { href: '/predictions', label: 'Витрина событий' },
  { href: '/stats', label: 'Статистика и архив' },
];

export const SiteShell: React.FC<SiteShellProps> = ({
  brand,
  viewer,
  onViewerChange,
  children,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    onViewerChange?.(null);
    router.refresh();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F6FA] text-slate-900">
      {/* КОНТРАСТНАЯ ТЕМНАЯ ШАПКА (HYBRID EDITORIAL) */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0F19]/95 text-white backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            {/* Логотип */}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-mono text-xs font-black tracking-tighter text-white shadow-sm shadow-blue-600/40">
                VX
              </div>
              <span className="text-lg font-black tracking-tight text-white">
                {brand.brandName}
                <span className="text-blue-400">.</span>
              </span>
            </Link>

            {/* Навигация */}
            <nav className="hidden items-center gap-1 md:flex">
              {NAV_LINKS.map((item) => {
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-white/12 text-white'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Правая часть: кошелек + кабинет / вход */}
          <div className="hidden items-center gap-2.5 md:flex">
            {viewer ? (
              <>
                {viewer.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-blue-400/50 hover:text-white"
                  >
                    <Settings className="h-3.5 w-3.5 text-blue-400" />
                    <span>Управление</span>
                  </Link>
                )}

                <Link
                  href="/cabinet"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  <Wallet className="h-3.5 w-3.5 text-blue-400" />
                  <span className="font-mono">
                    {viewer.balanceRub.toLocaleString('ru-RU')} ₽
                  </span>
                </Link>

                <Link
                  href="/cabinet"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-500"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span className="max-w-[120px] truncate">Мои покупки</span>
                </Link>

                <button
                  type="button"
                  title="Выйти"
                  onClick={handleLogout}
                  className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:border-white/20 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:text-white"
                >
                  Войти
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-500"
                >
                  Регистрация
                </Link>
              </>
            )}
          </div>

          {/* Кнопка меню на мобильных */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-300 hover:bg-white/10 md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/10 bg-[#0B0F19] px-4 py-4 md:hidden">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5"
                >
                  {item.label}
                </Link>
              ))}
              <div className="my-2 border-t border-white/10" />
              {viewer ? (
                <>
                  <Link
                    href="/cabinet"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-bold text-white"
                  >
                    Мои покупки ({viewer.balanceRub.toLocaleString('ru-RU')} ₽)
                  </Link>
                  {viewer.role === 'ADMIN' && (
                    <Link
                      href="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-3 py-2.5 text-sm font-semibold text-blue-400"
                    >
                      Админ-панель
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      handleLogout();
                    }}
                    className="rounded-lg px-3 py-2.5 text-left text-sm text-slate-400"
                  >
                    Выйти
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg border border-white/15 py-2.5 text-center text-sm font-semibold text-white"
                  >
                    Войти
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg bg-blue-600 py-2.5 text-center text-sm font-bold text-white"
                  >
                    Регистрация
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ОСНОВНОЙ СВЕТЛЫЙ КОНТЕНТ */}
      <main className="flex-1">{children}</main>

      {/* СТРОГИЙ СВЕТЛЫЙ ЖУРНАЛЬНЫЙ ПОДВАЛ */}
      <footer className="mt-20 border-t border-slate-200/90 bg-white py-12 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 text-base font-black text-slate-900">
                <span>
                  {brand.brandName}
                  <span className="text-blue-600">.</span>
                </span>
                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                  18+
                </span>
              </div>
              <p className="mt-2.5 max-w-md leading-relaxed text-slate-500">
                Маркетплейс разовых аналитических обзоров спортивных событий. Сервис не является букмекерской конторой, не принимает денежные ставки и не организует азартные игры.
              </p>
              <p className="mt-2 text-[11px] font-medium text-slate-400">
                {brand.legalSellerName} · {brand.legalInn}
              </p>
            </div>

            <div>
              <div className="font-bold text-slate-900">Навигация</div>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link href="/predictions" className="hover:text-blue-600">
                    Витрина предстоящих матчей
                  </Link>
                </li>
                <li>
                  <Link href="/stats" className="hover:text-blue-600">
                    Верифицированная статистика
                  </Link>
                </li>
                <li>
                  <Link href="/cabinet" className="hover:text-blue-600">
                    Личный кабинет и партнерка
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <div className="font-bold text-slate-900">Правовая информация</div>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link href="/legal/offer" className="hover:text-blue-600">
                    Публичная оферта
                  </Link>
                </li>
                <li>
                  <Link href="/legal/privacy" className="hover:text-blue-600">
                    Политика конфиденциальности
                  </Link>
                </li>
                <li>
                  <a
                    href={brand.supportTelegram}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Служба поддержки в Telegram</span>
                  </a>
                </li>
                <li className="text-slate-400">{brand.supportEmail}</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6 text-[11px] text-slate-400">
            © {new Date().getFullYear()} {brand.brandName}. Аналитические материалы основаны на математической статистике и не являются гарантией дохода.
          </div>
        </div>
      </footer>
    </div>
  );
};
