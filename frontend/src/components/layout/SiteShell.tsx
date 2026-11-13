'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Crown,
  LogOut,
  Menu,
  Send,
  Settings,
  User,
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
  { href: '/predictions', label: 'Прогнозы' },
  { href: '/stats', label: 'Статистика' },
  { href: '/tariffs', label: 'Тарифы VIP' },
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
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {/* ШАПКА САЙТА */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Логотип */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 font-mono text-sm font-black text-slate-950">
              +EV
            </div>
            <span className="text-lg font-extrabold tracking-tight text-white">
              {brand.brandName}
              <span className="text-emerald-400">.PRO</span>
            </span>
          </Link>

          {/* Навигация для десктопа */}
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
                      ? 'bg-slate-800/90 text-white'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Правый блок: Авторизация / Личный кабинет */}
          <div className="hidden items-center gap-2.5 md:flex">
            {viewer ? (
              <>
                {viewer.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:text-white"
                  >
                    <Settings className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Управление</span>
                  </Link>
                )}

                <Link
                  href="/cabinet"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:border-slate-700"
                >
                  {viewer.hasActiveVip ? (
                    <Crown className="h-4 w-4 text-amber-400" />
                  ) : (
                    <User className="h-4 w-4 text-emerald-400" />
                  )}
                  <span className="max-w-[130px] truncate">{viewer.displayName}</span>
                </Link>

                <button
                  type="button"
                  title="Выйти"
                  onClick={handleLogout}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 transition hover:border-slate-700 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-300 transition hover:text-white"
                >
                  Войти
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                >
                  Создать аккаунт
                </Link>
              </>
            )}
          </div>

          {/* Кнопка мобильного меню */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-300 hover:bg-slate-900 md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Мобильное меню */}
        {mobileOpen && (
          <div className="border-t border-slate-800 bg-slate-950 px-4 py-4 md:hidden">
            <div className="flex flex-col gap-1.5">
              {NAV_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-900"
                >
                  {item.label}
                </Link>
              ))}
              <div className="my-2 border-t border-slate-800" />
              {viewer ? (
                <>
                  <Link
                    href="/cabinet"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white"
                  >
                    Личный кабинет ({viewer.displayName})
                  </Link>
                  {viewer.role === 'ADMIN' && (
                    <Link
                      href="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-3 py-2.5 text-sm font-semibold text-emerald-400"
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
                    Выйти из аккаунта
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-slate-800 py-2.5 text-center text-sm font-semibold text-white"
                  >
                    Войти
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl bg-emerald-500 py-2.5 text-center text-sm font-bold text-slate-950"
                  >
                    Регистрация
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ОСНОВНОЙ КОНТЕНТ СТРАНИЦЫ */}
      <main className="flex-1">{children}</main>

      {/* ПОДВАЛ САЙТА (С ЮРИДИЧЕСКОЙ ИНФОРМАЦИЕЙ ДЛЯ ЮKASSA) */}
      <footer className="mt-16 border-t border-slate-900 bg-slate-950 py-10 text-xs text-slate-400">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 text-base font-extrabold text-white">
                <span>
                  {brand.brandName}
                  <span className="text-emerald-400">.PRO</span>
                </span>
                <span className="rounded border border-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                  18+
                </span>
              </div>
              <p className="mt-2.5 max-w-md leading-relaxed text-slate-500">
                Информационно-аналитическая платформа спортивной статистики. Сайт не является букмекерской конторой, не организует азартные игры и не принимает денежные ставки.
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                {brand.legalSellerName} · {brand.legalInn}
              </p>
            </div>

            <div>
              <div className="font-semibold text-slate-200">Разделы</div>
              <ul className="mt-2.5 space-y-2">
                <li>
                  <Link href="/predictions" className="hover:text-white">
                    Лента прогнозов
                  </Link>
                </li>
                <li>
                  <Link href="/stats" className="hover:text-white">
                    Верифицированная статистика
                  </Link>
                </li>
                <li>
                  <Link href="/tariffs" className="hover:text-white">
                    Тарифы VIP-подписки
                  </Link>
                </li>
                <li>
                  <Link href="/cabinet" className="hover:text-white">
                    Партнерская программа
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-slate-200">Документы и связь</div>
              <ul className="mt-2.5 space-y-2">
                <li>
                  <Link href="/legal/offer" className="hover:text-white">
                    Публичная оферта
                  </Link>
                </li>
                <li>
                  <Link href="/legal/privacy" className="hover:text-white">
                    Политика конфиденциальности
                  </Link>
                </li>
                <li>
                  <a
                    href={brand.supportTelegram}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Поддержка в Telegram</span>
                  </a>
                </li>
                <li className="text-slate-500">{brand.supportEmail}</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-900 pt-6 text-[11px] text-slate-600">
            © {new Date().getFullYear()} {brand.brandName}.PRO. Аналитические оценки основаны на математическом ожидании и статистических данных прошлых периодов и не гарантируют получение дохода в будущем.
          </div>
        </div>
      </footer>
    </div>
  );
};
