'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Home,
  LogOut,
  Menu,
  Send,
  Settings,
  ShoppingBag,
  Trophy,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { isPlaceholderLegalInn } from '@/lib/plain-russian';
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
  bundle2DiscountPct?: number;
  bundle3DiscountPct?: number;
  yandexMetrikaId?: string;
}

interface SiteShellProps {
  brand: PublicBrandInfo | null;
  viewer: SafeSessionUser | null;
  onViewerChange?: (next: SafeSessionUser | null) => void;
  onLogout?: () => Promise<void> | void;
  children: React.ReactNode;
}

const DEFAULT_BRAND: PublicBrandInfo = {
  brandName: 'VALUEX',
  supportTelegram: 'https://t.me/valuex_support',
  freeTelegramUrl: 'https://t.me/valuex_open',
  legalSellerName: 'Аналитический сервис спортивных прогнозов',
  legalInn: 'ИНН 000000000000',
  supportEmail: 'support@valuex.pro',
  paymentMode: 'TEST_INSTANT',
  defaultSinglePriceRub: 790,
  bundle2DiscountPct: 15,
  bundle3DiscountPct: 25,
};

const NAV_LINKS = [
  { href: '/', label: 'Главная' },
  { href: '/predictions', label: 'Прогнозы на матчи' },
  { href: '/stats', label: 'Результаты и статистика' },
  { href: '/#how-it-works', label: 'Как это работает' },
];

export const SiteShell: React.FC<SiteShellProps> = ({
  brand: rawBrand,
  viewer,
  onViewerChange,
  onLogout,
  children,
}) => {
  const brand = rawBrand ?? DEFAULT_BRAND;
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
      return;
    }
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    onViewerChange?.(null);
    router.refresh();
  };

  const showLegalDetails = !isPlaceholderLegalInn(
    brand.legalSellerName,
    brand.legalInn,
  );

  const metrikaNumericId = Number((brand.yandexMetrikaId || '').replace(/\D/g, ''));

  useEffect(() => {
    if (metrikaNumericId > 0 && typeof window !== 'undefined') {
      window.__valuexMetrikaId = metrikaNumericId;
    }
  }, [metrikaNumericId]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F6FA] text-slate-900">
      {metrikaNumericId > 0 && (
        <Script
          id={`ym-counter-${metrikaNumericId}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.__valuexMetrikaId = ${metrikaNumericId};
              (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
              k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
              (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
              ym(${metrikaNumericId}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:true });
            `,
          }}
        />
      )}
      {/* КОНТРАСТНАЯ ТЕМНАЯ ШАПКА */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0F19]/95 text-white backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-7">
            {/* Логотип с русским пояснением */}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-mono text-xs font-black tracking-tighter text-white shadow-sm shadow-blue-600/40">
                VX
              </div>
              <div className="leading-none">
                <span className="text-base font-black tracking-tight text-white">
                  {brand.brandName}
                  <span className="text-blue-400">.</span>
                </span>
                <span className="block text-[10px] font-medium text-slate-400">
                  прогнозы на спорт
                </span>
              </div>
            </Link>

            {/* Навигация */}
            <nav className="hidden items-center gap-1 lg:flex">
              {NAV_LINKS.map((item) => {
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : !item.href.includes('#') && pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
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
                    <span>Админ-панель</span>
                  </Link>
                )}

                <Link
                  href="/cabinet"
                  title="Ваш баланс и возвраты по страховке"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  <Wallet className="h-3.5 w-3.5 text-blue-400" />
                  <span>Баланс:</span>
                  <span className="font-mono font-bold text-white">
                    {viewer.balanceRub.toLocaleString('ru-RU')} ₽
                  </span>
                </Link>

                <Link
                  href="/cabinet"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-500"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Мои прогнозы</span>
                </Link>

                <button
                  type="button"
                  title="Выйти из аккаунта"
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
                  Создать кабинет
                </Link>
              </>
            )}
          </div>

          {/* Кнопка меню на мобильных */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/10 bg-[#0B0F19] px-4 py-4 lg:hidden">
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
                    Мои прогнозы (Баланс: {viewer.balanceRub.toLocaleString('ru-RU')} ₽)
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
                    Создать кабинет
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ОСНОВНОЙ СВЕТЛЫЙ КОНТЕНТ */}
      <main className="flex-1">{children}</main>

      {/* ПОНЯТНЫЙ ЧЕЛОВЕЧЕСКИЙ ПОДВАЛ */}
      <footer className="mt-20 border-t border-slate-200/90 bg-white pb-24 pt-12 text-xs text-slate-500 md:pb-12">
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
                Информационный сервис аналитики спортивных матчей. Мы помогаем выбрать обоснованный исход для самостоятельной ставки у вашего букмекера. Сайт не является букмекерской конторой и не принимает ставки на спорт.
              </p>
              {showLegalDetails && (
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  {brand.legalSellerName} · {brand.legalInn}
                </p>
              )}
            </div>

            <div>
              <div className="font-bold text-slate-900">Разделы сайта</div>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link href="/predictions" className="hover:text-blue-600">
                    Прогнозы на ближайшие матчи
                  </Link>
                </li>
                <li>
                  <Link href="/stats" className="hover:text-blue-600">
                    Открытая история всех прогнозов
                  </Link>
                </li>
                <li>
                  <Link href="/cabinet" className="hover:text-blue-600">
                    Личный кабинет и приглашение друзей
                  </Link>
                </li>
                <li>
                  <Link href="/#faq" className="hover:text-blue-600">
                    Ответы на частые вопросы
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <div className="font-bold text-slate-900">Помощь и документы</div>
              <ul className="mt-3 space-y-2">
                <li>
                  <a
                    href={brand.supportTelegram}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Написать в поддержку (Telegram)</span>
                  </a>
                </li>
                <li>
                  <Link href="/legal/offer" className="hover:text-blue-600">
                    Публичная оферта (условия покупки)
                  </Link>
                </li>
                <li>
                  <Link href="/legal/privacy" className="hover:text-blue-600">
                    Политика конфиденциальности
                  </Link>
                </li>
                <li className="text-slate-400">{brand.supportEmail}</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6 text-[11px] text-slate-400">
            © {new Date().getFullYear()} {brand.brandName}. Все разборы носят информационно-аналитический характер. Относитесь к ставкам ответственно и выделяйте только комфортную сумму.
          </div>
        </div>
      </footer>

      {/* МОБИЛЬНАЯ НИЖНЯЯ ПАНЕЛЬ КАК В ПРИЛОЖЕНИИ (удобно одной рукой из Telegram) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {[
            { href: '/', label: 'Витрина', Icon: Home },
            { href: '/predictions', label: 'Матчи', Icon: Trophy },
            { href: '/stats', label: 'Результаты', Icon: BarChart3 },
            {
              href: viewer ? '/cabinet' : '/login',
              label: viewer ? `${viewer.balanceRub} ₽` : 'Кабинет',
              Icon: User,
            },
          ].map(({ href, label, Icon }) => {
            const active =
              href === '/'
                ? pathname === '/'
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center rounded-xl py-1.5 text-[10px] font-bold transition ${
                  active
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="mt-0.5 truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
