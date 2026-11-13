'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type {
  TariffPlanConfig,
  TelegramDispatchRecord,
  TransactionRecord,
} from '@/server/platformStore';

export interface AdminFinancePanelProps {
  tariffs: TariffPlanConfig[];
  defaultSinglePriceRub: number;
  transactions: TransactionRecord[];
  onSaveTariffs: (patch: {
    defaultSinglePriceRub: number;
    tariffs: Array<{
      code: 'VIP_7D' | 'VIP_30D' | 'VIP_LIFETIME';
      priceRub: number;
      oldPriceRub: number;
    }>;
  }) => Promise<void>;
  onTriggerRefund: (yookassaPaymentId: string) => Promise<void>;
}

export const AdminFinancePanel: React.FC<AdminFinancePanelProps> = ({
  tariffs,
  defaultSinglePriceRub,
  transactions,
  onSaveTariffs,
  onTriggerRefund,
}) => {
  const [singlePrice, setSinglePrice] = useState<string>(String(defaultSinglePriceRub));
  const [draftPlans, setDraftPlans] = useState(
    tariffs.map((t) => ({
      code: t.code,
      name: t.name,
      priceRub: String(t.priceRub),
      oldPriceRub: String(t.oldPriceRub),
    })),
  );
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setSinglePrice(String(defaultSinglePriceRub));
    setDraftPlans(
      tariffs.map((t) => ({
        code: t.code,
        name: t.name,
        priceRub: String(t.priceRub),
        oldPriceRub: String(t.oldPriceRub),
      })),
    );
  }, [tariffs, defaultSinglePriceRub]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveTariffs({
      defaultSinglePriceRub: Math.max(0, Number(singlePrice) || 790),
      tariffs: draftPlans.map((p) => ({
        code: p.code,
        priceRub: Math.max(100, Number(p.priceRub) || 1000),
        oldPriceRub: Math.max(100, Number(p.oldPriceRub) || 1000),
      })),
    });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Настройка цен на разовые прогнозы и подписки ЮKassa */}
      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">
              Управление ценами: разовые прогнозы и подписки ЮKassa
            </h3>
            <p className="text-xs text-slate-400">
              Изменения мгновенно применяются на публичной витрине тарифов и в карточках прогнозов
            </p>
          </div>
          {savedNotice && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Тарифы обновлены</span>
            </span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <label className="block text-xs font-semibold text-slate-300">
              Базовая цена 1 прогноза (₽)
            </label>
            <input
              type="number"
              min="0"
              step="10"
              value={singlePrice}
              onChange={(e) => setSinglePrice(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-base font-bold text-emerald-400"
            />
            <span className="mt-1.5 block text-[11px] text-slate-500">
              Применяется к ожидающим прогнозам
            </span>
          </div>

          {draftPlans.map((plan, idx) => (
            <div
              key={plan.code}
              className="rounded-xl border border-slate-800 bg-slate-950 p-4"
            >
              <div className="text-xs font-bold text-white">{plan.name}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400">Цена (₽)</label>
                  <input
                    type="number"
                    min="100"
                    step="50"
                    value={plan.priceRub}
                    onChange={(e) =>
                      setDraftPlans((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, priceRub: e.target.value } : row,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-sm font-bold text-emerald-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Старая цена</label>
                  <input
                    type="number"
                    min="100"
                    step="50"
                    value={plan.oldPriceRub}
                    onChange={(e) =>
                      setDraftPlans((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, oldPriceRub: e.target.value } : row,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-sm text-slate-400"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="submit"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-emerald-400"
        >
          <Save className="h-4 w-4" />
          <span>Сохранить тарифную сетку</span>
        </button>
      </form>

      {/* Журнал транзакций ЮKassa и чеков 54-ФЗ */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-400" />
            <h3 className="text-base font-bold text-white">
              Журнал транзакций ЮKassa, рекуррентов и чеков 54-ФЗ ({transactions.length})
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Idempotence-Key + Webhook Dedup активны</span>
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-3 pr-4">Продукт / Покупатель</th>
                <th className="px-3 py-3">YooKassa ID</th>
                <th className="px-3 py-3">Сумма / Реф.</th>
                <th className="px-3 py-3">Чек 54-ФЗ</th>
                <th className="px-3 py-3">Статус</th>
                <th className="px-3 py-3 text-right">Возврат</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="py-3.5 pr-4">
                    <div className="font-bold text-white">{tx.title}</div>
                    <div className="text-[11px] text-slate-400">
                      {tx.receiptEmail} · {tx.paymentMethod.toUpperCase()}
                      {tx.autoRenew && ' · Автопродление'}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 font-mono text-[11px] text-slate-400">
                    {tx.yookassaPaymentId.slice(0, 18)}…
                  </td>
                  <td className="px-3 py-3.5 font-mono">
                    <div className="font-bold text-emerald-400">
                      {tx.amountRub.toLocaleString('ru-RU')} ₽
                    </div>
                    {tx.referredByCode && (
                      <div className="text-[10px] text-sky-300">
                        ref={tx.referredByCode} ({tx.commissionAccruedRub} ₽)
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                      {tx.receiptStatus}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                        tx.status === 'SUCCEEDED'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : tx.status === 'REFUNDED'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    {tx.status === 'SUCCEEDED' && (
                      <button
                        type="button"
                        onClick={() => onTriggerRefund(tx.yookassaPaymentId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-amber-400/50 hover:text-amber-200"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Refund</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const AdminTelegramDispatchesPanel: React.FC<{
  dispatches: TelegramDispatchRecord[];
}> = ({ dispatches }) => {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-sky-400" />
          <h3 className="text-lg font-bold text-white">
            Журнал автопушей Telegram Bot API (VIP-канал и одноразовые инвайты)
          </h3>
        </div>
        <span className="font-mono text-xs text-slate-400">
          Всего отправок: {dispatches.length}
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        {dispatches.map((d) => (
          <div
            key={d.id}
            className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs sm:flex-row sm:items-center"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-sky-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-300">
                  {d.type}
                </span>
                <span className="font-semibold text-slate-200">{d.recipientTarget}</span>
                <span className="text-[11px] text-slate-500">
                  {new Date(d.createdAt).toLocaleTimeString('ru-RU')}
                </span>
              </div>
              <p className="text-slate-300">{d.messagePreview}</p>
            </div>

            <div className="shrink-0 font-mono text-[11px] text-emerald-400">
              Доставлено: {d.deliveredCount} ({d.mode})
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
