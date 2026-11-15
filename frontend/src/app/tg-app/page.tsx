'use client';

import { BRAND_NAME } from '@/lib/brand';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowRight, ShieldCheck, Sparkles, User, Wallet } from 'lucide-react';
import { PredictionCard } from '@/components/predictions/PredictionCard';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import { AnalyticsConsent, openAnalyticsSettings } from '@/components/layout/AnalyticsConsent';
import { PublicLoadError } from '@/components/layout/PublicLoadError';
import { BundleCartBar } from '@/components/billing/BundleCartBar';
import {
  YooKassaCheckoutModal,
  type CheckoutModalTarget,
} from '@/components/billing/YooKassaCheckoutModal';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import { MAX_BUNDLE_ITEMS, toggleBundleSelection } from '@/lib/checkout-policy';
import type { PublicPredictionDto, SportType } from '@/server/types';

export default function TelegramMiniAppPage() {
  const { data, loading, error, reload } = usePublicPlatform();
  const [sport, setSport] = useState<SportType | 'ALL'>('ALL');
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [hashItem, setHashItem] = useState<PublicPredictionDto | null>(null);
  const [tgGreetingName, setTgGreetingName] = useState<string | null>(null);

  useEffect(() => {
    const initTg = () => {
      const wa = window.Telegram?.WebApp;
      if (wa) {
        wa.ready?.();
        wa.expand?.();
        const fName = wa.initDataUnsafe?.user?.first_name;
        if (fName) setTgGreetingName(fName);
      }
    };
    initTg();
    const timer = window.setTimeout(initTg, 400);
    return () => window.clearTimeout(timer);
  }, []);

  const defaultPrice = data?.brand.defaultSinglePriceRub ?? 790;
  const bundle2Pct = data?.brand.bundle2DiscountPct ?? 15;
  const bundle3Pct = data?.brand.bundle3DiscountPct ?? 25;
  const metrikaId = Number((data?.brand.yandexMetrikaId || '').replace(/\D/g, ''));

  const active = (data?.predictions ?? []).filter((p) => p.resultStatus === 'PENDING');
  const filtered = active.filter((p) => sport === 'ALL' || p.sport === sport);

  const openSingleCheckout = (prediction: PublicPredictionDto) => {
    setCheckoutTarget({
      kind: 'SINGLE_PREDICTION',
      title: `${prediction.homeTeam} — ${prediction.awayTeam}`,
      subtitle: `${prediction.leagueName} · Разовая покупка`,
      priceRub: prediction.singlePriceRub ?? defaultPrice,
      predictionId: prediction.id,
      predictionIds: [prediction.id],
    });
  };

  const toggleBundle = (prediction: PublicPredictionDto) => {
    if (!prediction.isLocked || prediction.salesClosed) return;
    const eligible = active.filter((p) => p.isLocked && !p.salesClosed).map((p) => p.id);
    setSelectedBundleIds((prev) => toggleBundleSelection(prev, prediction.id, eligible));
  };

  const selectedBundleItems = active.filter(
    (p) => selectedBundleIds.includes(p.id) && p.isLocked && !p.salesClosed,
  );

  const openBundleCheckout = () => {
    if (selectedBundleItems.length === 0) return;
    if (selectedBundleItems.length === 1) {
      openSingleCheckout(selectedBundleItems[0]);
      return;
    }
    const subtotal = selectedBundleItems.reduce(
      (acc, p) => acc + (p.singlePriceRub ?? defaultPrice),
      0,
    );
    const pct = selectedBundleItems.length >= 3 ? bundle3Pct : bundle2Pct;
    setCheckoutTarget({
      kind: 'BUNDLE_PREDICTIONS',
      title: `Набор из ${selectedBundleItems.length} прогнозов (−${pct}%)`,
      subtitle: selectedBundleItems
        .map((p) => `${p.homeTeam}—${p.awayTeam}`)
        .join(' · '),
      priceRub: Math.max(50, Math.round((subtotal * (100 - pct)) / 100)),
      originalPriceRub: subtotal,
      predictionIds: selectedBundleItems.map((p) => p.id),
    });
  };

  const top3Pack = active
    .filter((p) => p.accessTier === 'PAID_SINGLE' && p.isLocked && !p.salesClosed)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-[#F4F6FA] pb-24 text-slate-900">
      <AnalyticsConsent counterId={metrikaId} />
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
      />

      {/* Компактная шапка Telegram Mini App */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0F19] px-4 py-3.5 text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-base font-black">
              <span>
                {data?.brand.brandName ?? BRAND_NAME}
                <span className="text-blue-500">.</span>
              </span>
              <span className="rounded bg-blue-600/25 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
                Mini App
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              {tgGreetingName
                ? `${tgGreetingName}, выберите матч на сегодня`
                : 'Разовые аналитические прогнозы · 18+'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/stats"
              className="rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-slate-200"
            >
              Статистика
            </Link>
            <Link
              href={data?.viewer ? '/cabinet' : '/login'}
              className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-[11px] font-extrabold text-white"
            >
              {data?.viewer ? (
                <>
                  <Wallet className="h-3.5 w-3.5" />
                  <span>{data.viewer.balanceRub} ₽</span>
                </>
              ) : (
                <>
                  <User className="h-3.5 w-3.5" />
                  <span>Мои покупки</span>
                </>
              )}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-3.5 pt-4">
        <PublicLoadError message={error} onRetry={() => void reload()} />
        {loading && !data && <p role="status" className="rounded-2xl bg-white p-5 text-sm text-slate-600">Загружаем прогнозы…</p>}
        {/* Набор дня в 1 тап */}
        {top3Pack.length >= 3 && (
          <div className="rounded-2xl bg-gradient-to-r from-[#0B0F19] to-blue-950 p-4 text-white shadow-md">
            <div className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-300">
              <Sparkles className="h-3 w-3" />
              <span>Набор дня · Скидка −{bundle3Pct}%</span>
            </div>
            <div className="mt-1.5 text-sm font-black">
              Забрать все 3 главных прогноза дня со скидкой
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="mr-2 font-mono text-xs text-slate-400 line-through">
                  {top3Pack
                    .reduce((a, p) => a + (p.singlePriceRub ?? defaultPrice), 0)
                    .toLocaleString('ru-RU')}{' '}
                  ₽
                </span>
                <span className="font-mono text-xl font-black text-emerald-400">
                  {Math.max(
                    50,
                    Math.round(
                      (top3Pack.reduce(
                        (a, p) => a + (p.singlePriceRub ?? defaultPrice),
                        0,
                      ) *
                        (100 - bundle3Pct)) /
                        100,
                    ),
                  ).toLocaleString('ru-RU')}{' '}
                  ₽
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const subtotal = top3Pack.reduce(
                    (a, p) => a + (p.singlePriceRub ?? defaultPrice),
                    0,
                  );
                  setCheckoutTarget({
                    kind: 'BUNDLE_PREDICTIONS',
                    title: `Набор дня из 3 прогнозов (−${bundle3Pct}%)`,
                    subtitle: top3Pack
                      .map((p) => `${p.homeTeam}—${p.awayTeam}`)
                      .join(' · '),
                    priceRub: Math.max(
                      50,
                      Math.round((subtotal * (100 - bundle3Pct)) / 100),
                    ),
                    originalPriceRub: subtotal,
                    predictionIds: top3Pack.map((p) => p.id),
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white"
              >
                <span>Забрать 3 матча</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Фильтр спорта под палец */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              ['ALL', 'Все игры'],
              ['FOOTBALL', 'Футбол'],
              ['HOCKEY', 'Хоккей'],
              ['TENNIS', 'Теннис'],
              ['ESPORTS', 'Киберспорт'],
              ['MMA', 'UFC'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSport(id)}
              aria-pressed={sport === id}
              className={`min-h-10 shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${
                sport === id
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {!loading && !error && data && filtered.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            {sport === 'ALL' ? 'Сейчас нет доступных прогнозов. Загляните позже.' : 'По выбранному виду спорта прогнозов пока нет.'}
          </p>
        )}

        {/* Карточки матчей */}
        <div className="space-y-3.5">
          {filtered.map((p) => (
            <PredictionCard
              key={p.id}
              prediction={p}
              defaultSinglePriceRub={defaultPrice}
              onBuySingle={openSingleCheckout}
              onVerifyHash={setHashItem}
              inBundle={selectedBundleIds.includes(p.id)}
              onToggleBundle={toggleBundle}
              bundleLimitReached={selectedBundleItems.length >= MAX_BUNDLE_ITEMS}
            />
          ))}
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-2 text-center text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
          <span>Без подписок и автосписаний · Прогнозы не гарантируют выигрыш</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-center text-xs text-slate-600">
          <Link href="/legal/offer" className="underline">Оферта</Link>
          <Link href="/legal/rules" className="underline">Правила</Link>
          <Link href="/legal/privacy" className="underline">Персональные данные</Link>
          {Number.isSafeInteger(metrikaId) && metrikaId > 0 && (
            <button type="button" onClick={openAnalyticsSettings} className="underline">Настройки аналитических cookies</button>
          )}
        </div>
      </main>

      <BundleCartBar
        selectedItems={selectedBundleItems}
        defaultPriceRub={defaultPrice}
        bundle2DiscountPct={bundle2Pct}
        bundle3DiscountPct={bundle3Pct}
        onClear={() => setSelectedBundleIds([])}
        onCheckoutBundle={openBundleCheckout}
      />

      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={data?.viewer ?? null}
        paymentMode={data?.brand.paymentMode}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={async () => {
          setSelectedBundleIds([]);
          await reload();
        }}
      />

      <HashVerifyModal
        prediction={hashItem}
        onClose={() => setHashItem(null)}
      />
    </div>
  );
}
