'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowRight, ShieldCheck, Sparkles, User, Wallet } from 'lucide-react';
import { PredictionCard } from '@/components/predictions/PredictionCard';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import { BundleCartBar } from '@/components/billing/BundleCartBar';
import {
  YooKassaCheckoutModal,
  type CheckoutModalTarget,
} from '@/components/billing/YooKassaCheckoutModal';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type { PublicPredictionDto, SportType } from '@/server/types';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        initDataUnsafe?: {
          user?: { first_name?: string; username?: string };
        };
      };
    };
  }
}

export default function TelegramMiniAppPage() {
  const { data, reload } = usePublicPlatform();
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
    setSelectedBundleIds((prev) =>
      prev.includes(prediction.id)
        ? prev.filter((id) => id !== prediction.id)
        : [...prev, prediction.id],
    );
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
                {data?.brand.brandName ?? 'VALUEX'}
                <span className="text-blue-500">.</span>
              </span>
              <span className="rounded bg-blue-600/25 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
                Mini App
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              {tgGreetingName
                ? `${tgGreetingName}, выберите матч на сегодня`
                : 'Разовые прогнозы со страховкой 100%'}
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
        {/* Набор дня в 1 тап */}
        {top3Pack.length >= 3 && (
          <div className="rounded-2xl bg-gradient-to-r from-[#0B0F19] to-blue-950 p-4 text-white shadow-md">
            <div className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-300">
              <Sparkles className="h-3 w-3" />
              <span>Набор дня · Скидка −{bundle3Pct}% + страховка</span>
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
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${
                sport === id
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

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
            />
          ))}
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-2 text-center text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
          <span>Без подписок и автосписаний · Промокод новичкам: START15</span>
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
        onClose={() => setCheckoutTarget(null)}
        onSuccess={async () => {
          setCheckoutTarget(null);
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
