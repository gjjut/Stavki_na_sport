'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  CheckCircle2,
  Copy,
  PlusCircle,
  Receipt,
  Share2,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { PredictionCard } from '@/components/predictions/PredictionCard';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import {
  YooKassaCheckoutModal,
  type CheckoutModalTarget,
} from '@/components/billing/YooKassaCheckoutModal';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type {
  OrderTransaction,
  PublicPredictionDto,
  SafeSessionUser,
} from '@/server/types';

interface CabinetPayload {
  user: SafeSessionUser;
  purchasedPredictions: PublicPredictionDto[];
  orders: OrderTransaction[];
}

export default function CabinetPage() {
  const router = useRouter();
  const { data: pub, reload: reloadPublic } = usePublicPlatform();
  const [cabinet, setCabinet] = useState<CabinetPayload | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [hashItem, setHashItem] = useState<PublicPredictionDto | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  const loadCabinet = useCallback(async () => {
    const cabRes = await fetch('/api/v1/cabinet', { cache: 'no-store' });
    if (cabRes.status === 401) {
      router.push('/login');
      return;
    }
    if (cabRes.ok) {
      const cabJson = (await cabRes.json()) as CabinetPayload;
      setCabinet(cabJson);
    }
  }, [router]);

  useEffect(() => {
    void loadCabinet();
  }, [loadCabinet]);

  const loadAll = async () => {
    await Promise.all([reloadPublic(), loadCabinet()]);
  };

  const purchasedPredictions = cabinet?.purchasedPredictions ?? [];

  const copyPartnerLink = async () => {
    if (!cabinet?.user.referralCode) return;
    const url = `${window.location.origin}/?ref=${cabinet.user.referralCode}`;
    await navigator.clipboard.writeText(url);
    setCopiedRef(true);
    window.setTimeout(() => setCopiedRef(false), 2000);
  };

  return (
    <SiteShell
      viewer={pub?.viewer ?? null}
      brand={pub?.brand ?? null}
      onViewerChange={() => router.push('/')}
    >
      <div className="bg-[#0B0F19] py-10 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-black tracking-tight">Мои прогнозы и баланс</h1>
          <p className="mt-1 text-sm text-slate-300">
            Здесь хранятся все открытые вами матчи, баланс для покупок в 1 клик и возвраты по страховке
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Верхняя панель: профиль + баланс + приглашение друзей */}
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Ваш профиль
            </div>
            <div className="mt-1 text-xl font-black text-slate-950">
              {cabinet?.user.displayName ?? '...'}
            </div>
            <div className="text-xs text-slate-500">{cabinet?.user.email}</div>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Куплено прогнозов: {purchasedPredictions.length}</span>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Баланс на сайте (и возвраты страховки)
                </div>
                <div className="mt-1 font-mono text-3xl font-black text-slate-950">
                  {(cabinet?.user.balanceRub ?? 0).toLocaleString('ru-RU')} ₽
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  С этого счета можно открывать любые прогнозы в 1 клик без ввода карты
                </p>
              </div>
              <Wallet className="h-6 w-6 shrink-0 text-blue-600" />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[1000, 2500, 5000].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() =>
                    setCheckoutTarget({
                      kind: 'BALANCE_TOPUP',
                      title: `Пополнение баланса на ${amount.toLocaleString('ru-RU')} ₽`,
                      subtitle: 'Для быстрой оплаты прогнозов в 1 клик',
                      priceRub: amount,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 hover:border-blue-300 hover:bg-blue-50"
                >
                  <PlusCircle className="h-3.5 w-3.5 text-blue-600" />
                  <span>+{amount.toLocaleString('ru-RU')} ₽</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Пригласите друга ({cabinet?.user.revsharePercent ?? 25}% вам)
                </div>
                <div className="mt-1 font-mono text-3xl font-black text-blue-600">
                  {(cabinet?.user.affiliateBalanceRub ?? 0).toLocaleString('ru-RU')} ₽
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Отправьте ссылку другу — вы будете получать {cabinet?.user.revsharePercent ?? 25}% с каждой его покупки
                </p>
              </div>
              <Share2 className="h-6 w-6 shrink-0 text-slate-400" />
            </div>

            <button
              type="button"
              onClick={copyPartnerLink}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:border-blue-300 hover:bg-white"
            >
              {copiedRef ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Ссылка скопирована — отправьте другу!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-blue-600" />
                  <span>Скопировать ссылку для друзей</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Сетка купленных прогнозов */}
        <div className="mt-8">
          <h2 className="text-xl font-black text-slate-950">
            Открытые вами прогнозы
          </h2>
          {purchasedPredictions.length > 0 ? (
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {purchasedPredictions.map((prediction) => (
                <PredictionCard
                  key={prediction.id}
                  prediction={prediction}
                  defaultSinglePriceRub={pub?.brand.defaultSinglePriceRub ?? 790}
                  onBuySingle={() => {}}
                  onVerifyHash={setHashItem}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-600">
                У вас пока нет купленных прогнозов. Выберите интересующий матч на главной или посмотрите бесплатный прогноз дня.
              </p>
              <Link
                href="/predictions"
                className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                Выбрать матч
              </Link>
            </div>
          )}
        </div>

        {/* История чеков */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
            <Receipt className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-extrabold text-slate-950">
              История покупок и возвратов по страховке
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {(cabinet?.orders ?? []).length === 0 ? (
              <div className="p-6 text-xs text-slate-500">Покупок пока не было.</div>
            ) : (
              (cabinet?.orders ?? []).map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-xs"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{order.title}</span>
                      {order.promoCode && (
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                          СКИДКА {order.promoCode}
                        </span>
                      )}
                      {order.insuranceCredited && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          <ShieldCheck className="h-3 w-3" />
                          <span>100% суммы возвращено на баланс</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-slate-400">
                      {new Date(order.createdAt).toLocaleString('ru-RU')}
                      {order.discountRub > 0
                        ? ` · Ваша выгода ${order.discountRub.toLocaleString('ru-RU')} ₽`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-slate-950">
                      {order.amountRub.toLocaleString('ru-RU')} ₽
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>
                        {order.status === 'SUCCEEDED'
                          ? 'Оплачено'
                          : order.status === 'REFUNDED'
                            ? 'Возврат'
                            : 'В обработке'}
                      </span>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={pub?.viewer ?? null}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={loadAll}
      />

      <HashVerifyModal prediction={hashItem} onClose={() => setHashItem(null)} />
    </SiteShell>
  );
}
