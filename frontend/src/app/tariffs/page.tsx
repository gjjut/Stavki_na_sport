'use client';

import React, { useState } from 'react';
import { Check, Crown, HelpCircle } from 'lucide-react';
import {
  CheckoutModalTarget,
  YooKassaCheckoutModal,
} from '@/components/billing/YooKassaCheckoutModal';
import { SiteShell } from '@/components/layout/SiteShell';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type { TariffPlan } from '@/server/types';

const FAQ_ITEMS = [
  {
    q: 'Как я получу доступ в закрытый Telegram-канал после оплаты?',
    a: 'Сразу после подтверждения платежа на экране оплаты и в вашем Личном кабинете появится персональная ссылка-приглашение в закрытый VIP-канал. Все платные прогнозы на сайте также откроются автоматически.',
  },
  {
    q: 'Что такое флэт (юниты) и какую сумму ставить?',
    a: '1 юнит (1 u) равен 1% от вашего выделенного игрового банка. Например, если ваш банк составляет 50 000 ₽, то рекомендация 2.00 u (2% банка) соответствует 1 000 ₽. В личном кабинете встроен автоматический калькулятор под ваш банк.',
  },
  {
    q: 'Даете ли вы гарантию выигрыша каждого прогноза?',
    a: 'В спорте не существует безрисковых исходов со 100% вероятностью. Наша задача — находить математический перевес над линией букмекера на дистанции 100+ событий, что отражено на открытом графике доходности.',
  },
  {
    q: 'Как отключить автопродление подписки?',
    a: 'В разделе «Личный кабинет» вы можете отключить автоматическое продление подписки одной кнопкой без обращения в поддержку.',
  },
];

export default function TariffsPage() {
  const { data, loading, reload } = usePublicPlatform();
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Загрузка тарифов...
      </div>
    );
  }

  const handleBuyTariff = (plan: TariffPlan) => {
    setCheckoutTarget({
      kind: 'VIP_SUBSCRIPTION',
      title: plan.name,
      subtitle: plan.subtitle,
      priceRub: plan.priceRub,
      planCode: plan.code,
      supportsAutoRenew: plan.code !== 'VIP_LIFETIME',
    });
  };

  return (
    <SiteShell brand={data.brand} viewer={data.viewer} onViewerChange={() => reload()}>
      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={data.viewer}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={reload}
      />

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 text-xs font-semibold text-amber-200">
            <Crown className="h-3.5 w-3.5 text-amber-300" />
            <span>Полный доступ ко всей аналитике</span>
          </div>
          <h1 className="mt-4 text-3xl font-extrabold text-white sm:text-4xl">
            Тарифы VIP-подписки
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Разовая покупка одного ординара стоит{' '}
            <strong className="text-slate-200">
              {data.brand.defaultSinglePriceRub.toLocaleString('ru-RU')} ₽
            </strong>
            . Подписка VIP открывает все ординары, закрытые смол-маркеты и мгновенную рассылку в приватном Telegram-канале.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {data.tariffs.map((plan) => (
            <div
              key={plan.code}
              className={`flex flex-col justify-between rounded-2xl border p-6 sm:p-7 ${
                plan.popular
                  ? 'border-emerald-500/70 bg-slate-900 shadow-2xl shadow-emerald-950/30'
                  : 'border-slate-800 bg-slate-900/70'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                  {plan.popular && (
                    <span className="rounded-full bg-emerald-500/15 px-3 py-0.5 text-xs font-bold text-emerald-300">
                      Популярный
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-slate-400">{plan.subtitle}</p>

                <div className="mt-6 flex items-baseline gap-2.5">
                  <span className="font-mono text-4xl font-extrabold text-white">
                    {plan.priceRub.toLocaleString('ru-RU')} ₽
                  </span>
                  {plan.oldPriceRub > plan.priceRub && (
                    <span className="font-mono text-sm text-slate-500 line-through">
                      {plan.oldPriceRub.toLocaleString('ru-RU')} ₽
                    </span>
                  )}
                </div>

                <ul className="mt-6 space-y-3 text-xs text-slate-200">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => handleBuyTariff(plan)}
                className={`mt-8 w-full rounded-xl py-3.5 text-sm font-bold transition ${
                  plan.popular
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    : 'border border-slate-700 bg-slate-950 text-white hover:border-emerald-500/50'
                }`}
              >
                Подключить {plan.name}
              </button>
            </div>
          ))}
        </div>

        {/* Блок частых вопросов */}
        <div className="mx-auto mt-16 max-w-3xl">
          <div className="flex items-center gap-2 text-lg font-bold text-white">
            <HelpCircle className="h-5 w-5 text-emerald-400" />
            <h2>Частые вопросы</h2>
          </div>

          <div className="mt-5 space-y-3">
            {FAQ_ITEMS.map((item) => (
              <div
                key={item.q}
                className="rounded-2xl border border-slate-800 bg-slate-900/65 p-5"
              >
                <h3 className="text-sm font-bold text-white">{item.q}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
