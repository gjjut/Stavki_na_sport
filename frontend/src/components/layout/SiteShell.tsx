'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CreditCard,
  Home,
  LogOut,
  Menu,
  Send,
  Settings,
  ShieldCheck,
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
  { href: '/stats', label: 'Статистика' },
  { href: '/#how-it-works', label: 'Как это работает' },
  { href: '/#faq', label: 'Вопросы' },
];

const QUICK_LEAGUES = [
  { label: 'РПЛ', href: '/leagues/rpl' },
  { label: 'КХЛ', href: '/leagues/khl' },
  { label: 'Лига чемпионов', href: '/leagues/champions-league' },
  { label: 'Теннис ATP/WTA', href: '/leagues/tennis-atp-wta' },
  { label: 'CS2 / Dota 2', href: '/leagues/cs2-dota2' },
  { label: 'UFC / ММА', href: '/leagues/ufc-mma' },
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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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

  const metrikaNumericId = Number(
    (brand.yandexMetrikaId || '').replace(/\D/g, ''),
  );

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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B0F19]/95 text-white backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5 xl:gap-7">
            {/* Логотип */}
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 font-mono text-xs font-black tracking-tighter text-white shadow-md shadow-blue-600/35">
                VX
              </div>
              <div className="leading-none">
                <span className="text-base font-black tracking-tight text-white">
                  {brand.brandName}
                  <span className="text-blue-400">.</span>
                </span>
                <span className="mt-0.5 block text-[10px] font-medium text-slate-400">
                  прогнозы на спорт
                </span>
              </div>
            </Link>

            {/* Навигация ПК (lg+) */}
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
                    className={`whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                      active
                        ? 'bg-blue-600/20 text-white ring-1 ring-blue-500/40'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Правая часть на ПК (lg+) */}
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <a
              href={brand.freeTelegramUrl}
              target="_blank"
              rel="noreferrer"
              title="Наш открытый Telegram-канал"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-blue-400/40 hover:bg-white/10 hover:text-white"
            >
              <Send className="h-3.5 w-3.5 text-sky-400" />
              <span className="hidden xl:inline">Telegram</span>
            </a>

            {viewer ? (
              <>
                {viewer.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-300 transition hover:bg-blue-500/20 hover:text-white"
                  >
                    <Settings className="h-3.5 w-3.5 text-blue-400" />
                    <span>Админ</span>
                  </Link>
                )}

                <Link
                  href="/cabinet"
                  title="Ваш баланс и возвраты по страховке"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-mono font-bold text-white">
                    {viewer.balanceRub.toLocaleString('ru-RU')} ₽
                  </span>
                </Link>

                <Link
                  href="/cabinet"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-500"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Мои прогнозы</span>
                </Link>

                <button
                  type="button"
                  title="Выйти из аккаунта"
                  onClick={handleLogout}
                  className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:border-white/25 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  Войти
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-500"
                >
                  Создать кабинет
                </Link>
              </>
            )}
          </div>

          {/* Правая часть на планшетах и смартфонах (<1024px): быстрый доступ + бургер */}
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            {viewer ? (
              <>
                {viewer.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1 rounded-xl border border-blue-500/35 bg-blue-500/15 px-2.5 py-1.5 text-[11px] font-bold text-blue-300"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Админ</span>
                  </Link>
                )}
                <Link
                  href="/cabinet"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white"
                >
                  <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-mono">
                    {viewer.balanceRub.toLocaleString('ru-RU')} ₽
                  </span>
                </Link>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-blue-600/30"
              >
                Войти
              </Link>
            )}

            <button
              type="button"
              aria-label="Открыть меню навигации"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/15"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Выпадающее мобильное/планшетное меню */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-x-0 bottom-0 top-16 z-30 bg-slate-950/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/10 bg-[#0B0F19] px-4 py-4 shadow-2xl lg:hidden">
              <div className="flex flex-col gap-1">
                {NAV_LINKS.map((item) => {
                  const active =
                    item.href === '/'
                      ? pathname === '/'
                      : !item.href.includes('#') && pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                        active
                          ? 'bg-blue-600/20 text-white ring-1 ring-blue-500/40'
                          : 'text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}

                <div className="my-2 border-t border-white/10 pt-2.5">
                  <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Популярные турниры
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_LEAGUES.map((lg) => (
                      <Link
                        key={lg.href}
                        href={lg.href}
                        onClick={() => setMobileOpen(false)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                      >
                        {lg.label}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="my-1.5 border-t border-white/10" />

                {viewer ? (
                  <div className="space-y-1.5 pt-1">
                    <Link
                      href="/cabinet"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-between rounded-xl bg-blue-600 px-3.5 py-2.5 text-sm font-bold text-white"
                    >
                      <span>Мои прогнозы и кабинет</span>
                      <span className="font-mono">
                        {viewer.balanceRub.toLocaleString('ru-RU')} ₽
                      </span>
                    </Link>
                    {viewer.role === 'ADMIN' && (
                      <Link
                        href="/admin"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-2.5 text-sm font-bold text-blue-300"
                      >
                        <Settings className="h-4 w-4" />
                        <span>Админ-панель и ИИ-Управляющий</span>
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        void handleLogout();
                      }}
                      className="w-full rounded-xl border border-white/10 px-3.5 py-2.5 text-left text-sm font-medium text-slate-400 hover:text-white"
                    >
                      Выйти из аккаунта
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Link
                      href="/login"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-xl border border-white/15 py-2.5 text-center text-sm font-semibold text-white"
                    >
                      Войти
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-xl bg-blue-600 py-2.5 text-center text-sm font-bold text-white"
                    >
                      Создать кабинет
                    </Link>
                  </div>
                )}

                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                  <a
                    href={brand.freeTelegramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-sky-300"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Telegram-канал</span>
                  </a>
                  <a
                    href={brand.supportTelegram}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-slate-200"
                  >
                    <span>Поддержка 24/7</span>
                  </a>
                </div>
              </div>
            </div>
          </>
        )}
      </header>

      {/* ОСНОВНОЙ СВЕТЛЫЙ КОНТЕНТ */}
      <main className="flex-1">{children}</main>

      {/* ПОНЯТНЫЙ ПОДВАЛ С ПЛАТЕЖНЫМИ ЗНАКАМИ И ДОВЕРИЕМ */}
      <footer className="mt-16 border-t border-slate-200/90 bg-white pb-24 pt-12 text-xs text-slate-500 md:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Полоска гарантий и способов оплаты */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[#F8FAFC] px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800">
                <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                <span>Карты МИР</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>СБП (Система быстрых платежей)</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800">
                <span>Кассовый чек 54-ФЗ (ЮKassa)</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>Без подписок и автосписаний</span>
              </span>
              <span className="hidden text-slate-300 sm:inline">•</span>
              <span>Возврат 100% на баланс по страховке</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 text-base font-black text-slate-900">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0B0F19] font-mono text-[10px] font-black text-white">
                  VX
                </div>
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
              <div className="mt-4 flex flex-wrap gap-1.5">
                {QUICK_LEAGUES.map((lg) => (
                  <Link
                    key={lg.href}
                    href={lg.href}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-white hover:text-blue-600"
                  >
                    {lg.label}
                  </Link>
                ))}
              </div>
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
                    Личный кабинет и партнерская программа
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
                  <a
                    href={brand.freeTelegramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-blue-600"
                  >
                    Открытый Telegram-канал проекта
                  </a>
                </li>
                <li>
                  <Link href="/legal/offer" className="hover:text-blue-600">
                    Публичная оферта (условия покупки)
                  </Link>
                </li>
                <li>
                  <Link href="/legal/privacy" className="hover:text-blue-600">
                    Политика конфиденциальности (152-ФЗ)
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

      {/* МОБИЛЬНАЯ НИЖНЯЯ ПАНЕЛЬ КАК В ПРИЛОЖЕНИИ */}
      <nav className="pb-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/90 bg-white/95 px-2 pt-1.5 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {[
            { href: '/', label: 'Витрина', Icon: Home },
            { href: '/predictions', label: 'Матчи', Icon: Trophy },
            { href: '/stats', label: 'Статистика', Icon: BarChart3 },
            {
              href: viewer ? '/cabinet' : '/login',
              label: viewer
                ? `${viewer.balanceRub.toLocaleString('ru-RU')} ₽`
                : 'Кабинет',
              Icon: User,
            },
          ].map(({ href, label, Icon }) => {
            const active =
              href === '/'
                ? pathname === '/'
                : pathname.startsWith(href) ||
                  (href === '/login' &&
                    (pathname === '/register' || pathname === '/forgot-password'));
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
                <span className="mt-0.5 max-w-full truncate px-1">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
